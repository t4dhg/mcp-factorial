/**
 * Attendance tool registration: shift records, live clocking and bulk time
 * entry (registro horario).
 *
 * Safety model, two gates on one mechanism:
 * - checkConfirmation('delete_shift') is the static policy gate on delete.
 * - requireTargetConfirmation (src/attendance/gate.ts) is the target-identity
 *   gate: any write aimed at someone other than FACTORIAL_EMPLOYEE_ID, or any
 *   write at all when it is unset, needs a confirmation token from a preview
 *   that names the person. log_range and log_days always need one.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
  listShifts,
  getShift,
  createShift,
  updateShift,
  deleteShift,
  listOpenShifts,
  clockIn,
  clockOut,
  formatLocalIso,
  listEditTimesheetRequests,
  createEditTimesheetRequest,
} from '../api/index.js';
import {
  hhmm,
  isoWithOffset,
  LOCATION_TYPES,
  HALF_DAY_VALUES,
  SegmentInputSchema,
  DayInputSchema,
} from '../schemas.js';
import {
  declaredMoment,
  enumerateDates,
  formatPlanPreview,
  hours,
  parseHHMM,
  planFingerprint,
} from '../attendance/planner.js';
import type { PlanRequest, PlannedWrite } from '../attendance/planner.js';
import { formatAudit, formatGaps, ENTRY_TIME_NOTE } from '../attendance/report.js';
import {
  buildLedger,
  CONSECUTIVE_FAILURE_ABORT,
  executeBackfill,
  findGaps,
  planBackfill,
  requestWindow,
} from '../attendance/backfill.js';
import {
  getConfiguredEmployeeId,
  resolveEmployeeName,
  resolveTargetEmployeeId,
} from '../attendance/identity.js';
import { payloadFingerprint, requireTargetConfirmation } from '../attendance/gate.js';

const RETRY_NOTE =
  'Re-running the identical call is safe against this run: the planner re-reads existing shifts ' +
  'and skips whatever overlaps, so it writes only the missing records. This also covers a POST ' +
  'that timed out after Factorial committed it. It does not protect against another writer ' +
  'between the read and the writes (another session, a colleague clocking in through the app).';

/** Every record when there are few; per-month counts when listing them would drown the result */
function describeWrites(writes: PlannedWrite[]): string {
  if (writes.length <= 62) {
    return writes.map(w => `  ${w.date} ${w.clock_in}-${w.clock_out}`).join('\n');
  }
  const byMonth = new Map<string, { records: number; days: Set<string>; minutes: number }>();
  for (const w of writes) {
    const month = w.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { records: 0, days: new Set<string>(), minutes: 0 };
    entry.records += 1;
    entry.days.add(w.date);
    entry.minutes += parseHHMM(w.clock_out) - parseHHMM(w.clock_in);
    byMonth.set(month, entry);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([month, e]) =>
        `  ${month}  ${e.days.size} day${e.days.size === 1 ? '' : 's'}, ${e.records} record${e.records === 1 ? '' : 's'}, ${hours(e.minutes)}`
    )
    .join('\n');
}

function shiftLine(shift: {
  date: string;
  clock_in: string | null;
  clock_out: string | null;
}): string {
  return `${shift.date} ${shift.clock_in ?? '?'}-${shift.clock_out ?? 'open'}`;
}

export function registerAttendanceTool(server: McpServer) {
  server.registerTool(
    'factorial_attendance',
    {
      title: 'FactorialHR Attendance',
      description:
        'Attendance (registro horario): list/get/create/update/delete shift records, clock_in, ' +
        'clock_out and status for live clocking, gaps and audit to find days that do not match ' +
        'the contract, log_range / log_days to enter many days at once, and list_edit_requests / ' +
        'create_edit_request for days whose timesheet has already been signed off. ' +
        'Without date and time, clock_in and clock_out record the current moment; given both, ' +
        'they record the declared moment instead, for someone who forgot to clock and knows when ' +
        'they started or stopped. A declared moment in the future is refused before anything is ' +
        'sent, and clock_out with a declared moment is refused if nothing is open or if it would ' +
        'close a shift before it started. ' +
        'Bulk writes, writes for another employee and edit requests preview first: the call ' +
        'returns a plan and a confirmation_token, and nothing is written until the identical ' +
        'call is repeated with that token within 15 minutes. ' +
        'audit, gaps and every preview begin with a Data read line saying how much of the window ' +
        'was actually read; audit reports a day Factorial returned nothing for as ' +
        'no_contract_data, and log_range never writes such a day (log_days, which takes explicit ' +
        'dates, will). Times are HH:MM in company local time, applied by Factorial in the ' +
        'company zone; the server never converts.\n\n' +
        'Declared time versus entry time: a shift carries two independent sets of timestamps. ' +
        'The declared working time is date, clock_in, clock_out and, for a shift that crosses ' +
        'midnight, reference_date; these are inputs, and they are what the attendance sheet and ' +
        'the hour totals show. Separately, Factorial sets created_at, updated_at, in_source and ' +
        'out_source on the server to record when and how the record was entered; they are ' +
        'read-only through this API and no action here can set or change them. For example, a ' +
        'record written on 2026-09-07 for 2024-01-02 09:59 comes back with date: 2024-01-02, ' +
        'clock_in: 09:59, created_at of 2026-09-07 and in_source: api; that is the correct and ' +
        'only correct outcome. Both facts are true at once: a backfilled record shows the real ' +
        "working day on the attendance sheet while Factorial's activity log shows it was entered " +
        'later through the API.',
      inputSchema: {
        action: z
          .enum([
            'list',
            'get',
            'create',
            'update',
            'delete',
            'clock_in',
            'clock_out',
            'status',
            'gaps',
            'audit',
            'log_range',
            'log_days',
            'list_edit_requests',
            'create_edit_request',
          ])
          .describe('Action'),
        id: z.number().optional().describe('Shift ID (get, update, delete)'),
        employee_id: z
          .number()
          .optional()
          .describe('Employee ID. Defaults to FACTORIAL_EMPLOYEE_ID when set'),
        employee_ids: z
          .array(z.number())
          .optional()
          .describe(
            'Employee IDs (list). Defaults to FACTORIAL_EMPLOYEE_ID; pass [] for the whole company'
          ),
        start_on: z.string().optional().describe('Start date YYYY-MM-DD (list, gaps, log_range)'),
        end_on: z.string().optional().describe('End date YYYY-MM-DD (list, gaps, log_range)'),
        ids: z.array(z.number()).optional().describe('Shift IDs (list)'),
        updated_at: z.string().optional().describe('Shifts updated at this date (list)'),
        workable: z.boolean().optional().describe('Filter or set the workable flag'),
        half_day: z
          .enum(HALF_DAY_VALUES)
          .optional()
          .describe(
            'Half day marker. "beggining_of_day" is Factorial\'s own spelling of the value and ' +
              'must be sent exactly as it is; do not correct it.'
          ),
        date: z
          .string()
          .optional()
          .describe(
            'Shift date YYYY-MM-DD (create, update). For clock_in/clock_out, the declared day; ' +
              'give it together with time to record a declared moment instead of the current one'
          ),
        time: z
          .string()
          .optional()
          .describe(
            'clock_in/clock_out: the declared time HH:MM in company local time. Without date and ' +
              'time the action records the current moment; with them it records the declared moment. ' +
              'Use this when the person forgot to clock and knows when they started or stopped'
          ),
        reference_date: z
          .string()
          .optional()
          .describe(
            'The day an overnight shift is attributed to (create, update). It must equal date ' +
              'unless the shift crosses midnight. This is not when the record was entered; that ' +
              'is created_at, which Factorial sets and is read-only.'
          ),
        clock_in: z
          .union([hhmm, isoWithOffset])
          .optional()
          .describe('Clock in: HH:MM company local, or ISO 8601 with offset (create, update)'),
        clock_out: z
          .union([hhmm, isoWithOffset])
          .optional()
          .describe('Clock out: HH:MM company local, or ISO 8601 with offset (create, update)'),
        observations: z.string().optional().describe('Free-text note stored on the record(s)'),
        location_type: z
          .enum(LOCATION_TYPES)
          .optional()
          .describe('office | business_trip | work_from_home'),
        workplace_id: z.number().optional().describe('Workplace (location) ID'),
        segments: z
          .array(SegmentInputSchema)
          .optional()
          .describe(
            'Daily pattern for log_range, e.g. [{clock_in:"09:00",clock_out:"14:00"},{clock_in:"15:00",clock_out:"18:00"}]'
          ),
        days: z
          .array(DayInputSchema)
          .optional()
          .describe('Explicit days for log_days: [{date:"2026-03-02",segments:[...]}, ...]'),
        skip_leave: z
          .boolean()
          .optional()
          .default(true)
          .describe('Skip days covered by approved leave (default true)'),
        jitter_minutes: z
          .number()
          .int()
          .min(0)
          .max(30)
          .optional()
          .default(0)
          .describe(
            'log_range/log_days: shift each segment by up to this many minutes, normally keeping ' +
              'its length (only a segment that would otherwise run into its neighbour or past ' +
              'midnight is shortened instead), so a month of entries does not all read 09:00 ' +
              'exactly. Recommended 5 to 10 when reconstructing approximate hours. It varies ' +
              'segments within a day; for the start time to drift from day to day use ' +
              'variation_minutes. Deterministic per record, so the preview lists the exact times ' +
              'that will be written.'
          ),
        format: z
          .enum(['summary', 'table', 'json'])
          .optional()
          .default('summary')
          .describe(
            'audit: "summary" (default) lists only the days that need attention, "table" lists ' +
              'every day, "json" returns the full ledger. expected counts bank holidays and ' +
              'leave at full contract minutes; the header also gives the workday expected ' +
              'total, which is the number tracked hours should meet.'
          ),
        tolerance_minutes: z
          .number()
          .int()
          .min(0)
          .max(120)
          .optional()
          .default(15)
          .describe(
            'gaps/audit: a day within this many minutes of the expected total counts as complete ' +
              '(default 15). Real clocks are never exact, so a day a few minutes over is normal ' +
              'and needs no correction.'
          ),
        statuses: z
          .array(
            z.enum([
              'future',
              'weekend',
              'bank_holiday',
              'not_workable',
              'no_contract_data',
              'on_leave',
              'half_day_leave',
              'complete',
              'missing',
              'short',
              'over',
            ])
          )
          .optional()
          .describe(
            'audit: list only days with these statuses. Default lists everything needing attention: ' +
              'missing, short, over, half_day_leave and no_contract_data'
          ),
        exclude_dates: z
          .array(z.string())
          .optional()
          .describe(
            'log_range: dates (YYYY-MM-DD) inside the range to leave alone, for days that were not worked. ' +
              'The preview lists them so the omission is visible before confirming'
          ),
        variation_minutes: z
          .number()
          .int()
          .min(0)
          .max(120)
          .optional()
          .default(0)
          .describe(
            'log_range/log_days: shift each whole day by up to this many minutes, the segments moving ' +
              'together, so the start time drifts from day to day. This is the variation jitter_minutes ' +
              'cannot produce, since jitter varies segments within a day. Deterministic per day'
          ),
        fields: z
          .enum(['full', 'compact'])
          .optional()
          .default('full')
          .describe(
            'list: "compact" returns date, clock_in, clock_out, minutes and in_source only; ' +
              '"full" (default) returns id, employee_id, date, clock_in, clock_out, minutes, ' +
              'in_source and observations. Neither is every field of the raw record; use ' +
              'action: "get" for the complete record.'
          ),
        confirmation_token: z
          .string()
          .optional()
          .describe(
            'Token from a previous preview, to execute a gated write. Valid for 15 minutes and ' +
              'bound to exactly the plan that was previewed; if anything changed in between it ' +
              'is refused and a fresh preview is returned.'
          ),
        page: z
          .number()
          .optional()
          .default(1)
          .describe(
            'Page number (list, client-side). The API returns every record in range in one ' +
              'response, so paging only slices output that has already been read.'
          ),
        limit: z
          .number()
          .optional()
          .default(100)
          .describe(
            'Items per page (list, client-side). The API returns every record in range in one ' +
              'response, so this only slices output that has already been read.'
          ),
        confirm: z.boolean().optional().describe('Confirm delete'),
        reason: z
          .string()
          .optional()
          .describe('Why the timesheet needs changing (create_edit_request, required)'),
        request_type: z
          .enum(['create_shift', 'delete_shift', 'update_shift'])
          .optional()
          .describe(
            'What the edit request asks for (create_edit_request, default create_shift). ' +
              'create_shift requires date; update_shift and delete_shift require attendance_shift_id'
          ),
        attendance_shift_id: z
          .number()
          .optional()
          .describe(
            'The shift this edit request refers to (create_edit_request). Required for ' +
              'update_shift and delete_shift, since without it the request names no shift'
          ),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            // Like every other action, list defaults to the configured identity.
            // An explicit empty employee_ids asks for the whole company.
            const configured = getConfiguredEmployeeId();
            const employeeIds =
              args.employee_ids ??
              (args.employee_id ? [args.employee_id] : configured ? [configured] : undefined);
            const scope =
              employeeIds && employeeIds.length > 0
                ? `for employee${employeeIds.length > 1 ? 's' : ''} ${employeeIds.join(', ')}`
                : configured
                  ? 'company-wide (employee_ids: [] was passed)'
                  : 'company-wide (no employee filter and FACTORIAL_EMPLOYEE_ID is not set)';
            const result = await listShifts({
              employee_ids: employeeIds && employeeIds.length > 0 ? employeeIds : undefined,
              start_on: args.start_on,
              end_on: args.end_on,
              ids: args.ids,
              updated_at: args.updated_at,
              workable: args.workable,
              half_day: args.half_day,
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(s =>
              args.fields === 'compact'
                ? {
                    date: s.date,
                    clock_in: s.clock_in,
                    clock_out: s.clock_out,
                    minutes: s.minutes,
                    in_source: s.in_source,
                  }
                : {
                    id: s.id,
                    employee_id: s.employee_id,
                    date: s.date,
                    clock_in: s.clock_in,
                    clock_out: s.clock_out,
                    minutes: s.minutes,
                    in_source: s.in_source,
                    observations: s.observations,
                  }
            );
            return textResponse(
              `Found ${result.meta.total} shift${result.meta.total === 1 ? '' : 's'} ${scope} (${formatPaginationInfo(result.meta)}; paging is ` +
                `client-side, the API returned everything in range). Times are HH:MM company local.\n\n` +
                JSON.stringify(summary, null, 2)
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required');
            const shift = await getShift(args.id);
            return textResponse(`Shift details:\n\n${JSON.stringify(shift, null, 2)}`);
          }

          case 'create': {
            if (!args.date) return textResponse('Error: date (YYYY-MM-DD) is required');
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const input = {
              employee_id: employeeId,
              date: args.date,
              clock_in: args.clock_in,
              clock_out: args.clock_out,
              reference_date: args.reference_date,
              observations: args.observations,
              location_type: args.location_type,
              workplace_id: args.workplace_id,
              half_day: args.half_day,
              workable: args.workable,
            };
            const gate = requireTargetConfirmation({
              operation: 'create_shift',
              employeeId,
              fingerprint: payloadFingerprint(input),
              preview: `Create shift for ${name} (${employeeId}) on ${args.date} ${args.clock_in ?? '?'}-${args.clock_out ?? 'open'}`,
              token: args.confirmation_token,
            });
            if (!gate.proceed) return textResponse(gate.message);
            const shift = await createShift(input);
            return textResponse(
              `Shift created for ${name} (${employeeId}): ${args.date} ${args.clock_in ?? '?'}-${args.clock_out ?? 'open'}.\n\n` +
                `${JSON.stringify(shift, null, 2)}\n\n${ENTRY_TIME_NOTE}`
            );
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required');
            const existing = await getShift(args.id);
            const employeeId = Number(existing.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const input = {
              date: args.date,
              clock_in: args.clock_in,
              clock_out: args.clock_out,
              reference_date: args.reference_date,
              observations: args.observations,
              location_type: args.location_type,
              workplace_id: args.workplace_id,
              half_day: args.half_day,
              workable: args.workable,
            };
            const changes = Object.entries(input)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(', ');
            if (!changes) return textResponse('Error: nothing to update');
            const gate = requireTargetConfirmation({
              operation: 'update_shift',
              employeeId,
              fingerprint: payloadFingerprint({ id: args.id, input }),
              preview: `Update shift ${args.id} of ${name} (${employeeId}), currently ${shiftLine(existing)}: ${changes}`,
              token: args.confirmation_token,
            });
            if (!gate.proceed) return textResponse(gate.message);
            const shift = await updateShift(args.id, input);
            return textResponse(
              `Shift updated: ${shift.date} ${shift.clock_in ?? '?'}-${shift.clock_out ?? 'open'}.\n\n` +
                `${JSON.stringify(shift, null, 2)}\n\n${ENTRY_TIME_NOTE}`
            );
          }

          case 'delete': {
            if (!args.id) return textResponse('Error: id is required');
            const check = checkConfirmation('delete_shift', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            const existing = await getShift(args.id);
            const employeeId = Number(existing.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const gate = requireTargetConfirmation({
              operation: 'delete_shift',
              employeeId,
              fingerprint: payloadFingerprint({ id: args.id }),
              preview: `Delete shift ${args.id} of ${name} (${employeeId}), ${shiftLine(existing)}`,
              token: args.confirmation_token,
            });
            if (!gate.proceed) return textResponse(gate.message);
            await deleteShift(args.id);
            return textResponse(`Shift ${args.id} of ${name} deleted successfully.`);
          }

          case 'clock_in':
          case 'clock_out': {
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const wallClock = new Date();
            let now = wallClock;
            const declared = args.date !== undefined || args.time !== undefined;
            // Both are set together whenever declared is true; the block below
            // returns before this point otherwise. Narrowed once here so the
            // declared-path calls below don't have to repeat the check.
            let declaredDate: string | undefined;
            let declaredTime: string | undefined;
            if (declared) {
              if (args.date === undefined || args.time === undefined) {
                return textResponse(
                  'Error: date and time must be given together to declare a moment. Give both, or ' +
                    'neither to record the current moment.'
                );
              }
              declaredDate = args.date;
              declaredTime = args.time;
              // Compared against wall clock below purely to refuse a future
              // moment; this Date is never sent to Factorial. What is sent for
              // a declared moment is the bare HH:MM, via createShift/updateShift
              // below, which Factorial applies in the company zone, not the
              // server's. Only the undeclared (live) path below still sends an
              // absolute instant, where the server's offset is correct because
              // the instant is unambiguous regardless of zone.
              now = declaredMoment(declaredDate, declaredTime);
              // A declared moment in the future is never a record of work done.
              if (now.getTime() > wallClock.getTime()) {
                return textResponse(
                  `Error: ${args.date} ${args.time} is in the future. A shift records work that has ` +
                    'already happened, so the declared moment must not be later than now.'
                );
              }
            }

            let openShift: Awaited<ReturnType<typeof listOpenShifts>>[number] | undefined;
            if (args.action === 'clock_out' && declared) {
              const open = await listOpenShifts(employeeId);
              if (open.length === 0) {
                return textResponse(
                  `Nothing is open for ${name} (${employeeId}), so there is no shift to close at ` +
                    `${args.date} ${args.time}. Nothing was written. To record a whole past shift, ` +
                    'use action create with date, clock_in and clock_out.'
                );
              }
              openShift = open[0];
              const startedAt = declaredMoment(
                openShift.date,
                openShift.clock_in.includes('T')
                  ? openShift.clock_in.slice(11, 16)
                  : openShift.clock_in
              );
              if (now.getTime() < startedAt.getTime()) {
                return textResponse(
                  `Error: ${args.date} ${args.time} is before the open shift started ` +
                    `(${openShift.date} ${openShift.clock_in}). Nothing was written.`
                );
              }
            }

            const input = {
              employee_id: employeeId,
              location_type: args.location_type,
              workplace_id: args.workplace_id,
              observations: args.observations,
            };
            const verb = args.action === 'clock_in' ? 'Clock in' : 'Clock out';
            const moment = declared ? `${args.date} ${args.time}` : `now (${formatLocalIso(now)})`;
            const gate = requireTargetConfirmation({
              operation: args.action,
              employeeId,
              // Bound to the person, the payload and the declared moment (if any), not the second.
              fingerprint: payloadFingerprint({
                action: args.action,
                input,
                declared: declared ? { date: args.date, time: args.time } : null,
              }),
              preview: `${verb} ${name} (${employeeId}) ${moment}`,
              token: args.confirmation_token,
            });
            if (!gate.proceed) return textResponse(gate.message);

            // A declared moment is a company-local wall-clock time (bare
            // HH:MM), never an absolute instant: it goes through the same
            // create/update shift endpoints the create/update actions use,
            // which Factorial applies in the company zone. The clock_in/
            // clock_out endpoints below take an absolute instant (`now` with a
            // server offset) and are only correct when there is no declared
            // moment, because an instant is unambiguous regardless of the
            // server's zone.
            const shift = declared
              ? args.action === 'clock_in'
                ? await createShift({
                    employee_id: employeeId,
                    date: declaredDate as string,
                    clock_in: declaredTime as string,
                    location_type: args.location_type,
                    workplace_id: args.workplace_id,
                    observations: args.observations,
                  })
                : await updateShift(Number((openShift as NonNullable<typeof openShift>).id), {
                    date: declaredDate as string,
                    clock_out: declaredTime as string,
                    location_type: args.location_type,
                    workplace_id: args.workplace_id,
                    observations: args.observations,
                  })
              : args.action === 'clock_in'
                ? await clockIn(input, now)
                : await clockOut(input, now);
            // Unlike `moment` above (which wraps the live case in "now (...)"
            // for the preview), the result names the bare declared HH:MM for a
            // declared write, since that is the value actually sent; the live
            // case keeps the exact instant it always reported.
            const resultMoment = declared ? `${args.date} ${args.time}` : formatLocalIso(now);
            return textResponse(
              `${verb} recorded for ${name} (${employeeId}) at ${resultMoment}:\n\n` +
                `${JSON.stringify(shift, null, 2)}\n\n${ENTRY_TIME_NOTE}`
            );
          }

          case 'status': {
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const configured = getConfiguredEmployeeId();
            const open = await listOpenShifts(employeeId);
            const lines: string[] = [];
            if (configured !== undefined) {
              const configuredName =
                configured === employeeId ? name : await resolveEmployeeName(configured);
              lines.push(`Configured identity: ${configuredName} (${configured})`);
            } else {
              lines.push('Configured identity: none (FACTORIAL_EMPLOYEE_ID is not set)');
            }
            if (open.length === 0) {
              lines.push(`${name} (${employeeId}) is not clocked in.`);
            } else {
              for (const shift of open) {
                const time = shift.clock_in.includes('T')
                  ? shift.clock_in.slice(11, 16)
                  : shift.clock_in;
                lines.push(
                  `${name} (${employeeId}) is clocked in since ${time} on ${shift.date} (shift ${shift.id}). ` +
                    'The API reports this time with a Z suffix but lists the same shift in company local HH:MM; treat it as company local.'
                );
              }
            }
            return textResponse(lines.join('\n'));
          }

          case 'gaps': {
            if (!args.start_on || !args.end_on) {
              return textResponse('Error: start_on and end_on (YYYY-MM-DD) are required');
            }
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const { gaps, coverage } = await findGaps(
              employeeId,
              args.start_on,
              args.end_on,
              args.tolerance_minutes
            );
            return textResponse(
              formatGaps({
                employee: { id: employeeId, name },
                startOn: args.start_on,
                endOn: args.end_on,
                gaps,
                coverage,
              })
            );
          }

          case 'audit': {
            if (!args.start_on || !args.end_on) {
              return textResponse('Error: start_on and end_on (YYYY-MM-DD) are required');
            }
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const { ledger, coverage } = await buildLedger(
              employeeId,
              args.start_on,
              args.end_on,
              args.tolerance_minutes
            );
            return textResponse(
              formatAudit({
                employee: { id: employeeId, name },
                startOn: args.start_on,
                endOn: args.end_on,
                ledger,
                coverage,
                toleranceMinutes: args.tolerance_minutes,
                format: args.format,
                statuses: args.statuses,
              })
            );
          }

          case 'list_edit_requests': {
            const configured = getConfiguredEmployeeId();
            const employeeIds =
              args.employee_ids ??
              (args.employee_id ? [args.employee_id] : configured ? [configured] : undefined);
            const requests = await listEditTimesheetRequests(employeeIds);
            if (requests.length === 0) {
              return textResponse('No edit timesheet requests on record.');
            }
            const lines = requests.map(
              r =>
                `  ${r.date ?? '-'}  ${r.request_type.padEnd(12)} ${
                  r.approved === true ? 'approved' : r.approved === false ? 'rejected' : 'pending'
                }  ${r.clock_in ?? '-'}-${r.clock_out ?? '-'}  ${r.reason ?? ''}`
            );
            return textResponse(
              `${requests.length} edit timesheet requests:\n\n${lines.join('\n')}`
            );
          }

          case 'create_edit_request': {
            const requestType = args.request_type ?? ('create_shift' as const);
            if (requestType === 'create_shift' && !args.date) {
              return textResponse(
                'Error: date (YYYY-MM-DD) is required for a create_shift edit request'
              );
            }
            if (
              (requestType === 'update_shift' || requestType === 'delete_shift') &&
              !args.attendance_shift_id
            ) {
              return textResponse(
                `Error: attendance_shift_id is required for a ${requestType} edit request, ` +
                  'so the request names the shift it refers to'
              );
            }
            if (!args.reason || args.reason.trim() === '') {
              return textResponse(
                'Error: reason is required. A person approves this request and needs to know why it was filed.'
              );
            }
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            const input = {
              employee_id: employeeId,
              request_type: requestType,
              date: args.date,
              clock_in: args.clock_in,
              clock_out: args.clock_out,
              reason: args.reason,
              observations: args.observations,
              attendance_shift_id: args.attendance_shift_id,
            };
            const gate = requireTargetConfirmation({
              operation: 'create_edit_request',
              employeeId,
              fingerprint: payloadFingerprint(input),
              preview:
                `File an edit timesheet request for ${name} (${employeeId}): ${requestType}` +
                (args.date ? ` on ${args.date}` : '') +
                (args.attendance_shift_id ? ` for shift ${args.attendance_shift_id}` : '') +
                ` ${args.clock_in ?? '?'}-${args.clock_out ?? '?'}\n` +
                `Reason: ${args.reason}\n` +
                'A person approves this request in Factorial and is notified of it.',
              token: args.confirmation_token,
              always: true,
            });
            if (!gate.proceed) return textResponse(gate.message);
            const created = await createEditTimesheetRequest(input);
            return textResponse(
              `Edit request ${created.id} filed for ${name} (${employeeId}). ` +
                'It takes effect only once someone approves it in Factorial.\n\n' +
                JSON.stringify(created, null, 2)
            );
          }

          case 'log_range':
          case 'log_days': {
            if (args.observations !== undefined && args.observations.length > 500) {
              return textResponse('Error: observations must be 500 characters or fewer');
            }
            const employeeId = resolveTargetEmployeeId(args.employee_id);
            const name = await resolveEmployeeName(employeeId);
            let request: PlanRequest;
            if (args.action === 'log_range') {
              if (!args.start_on || !args.end_on || !args.segments) {
                return textResponse(
                  'Error: start_on, end_on (YYYY-MM-DD) and segments ([{clock_in, clock_out}]) are required'
                );
              }
              request = {
                mode: 'range',
                employee_id: employeeId,
                dates: enumerateDates(args.start_on, args.end_on),
                segments: args.segments,
                skip_leave: args.skip_leave,
                jitter_minutes: args.jitter_minutes,
                exclude_dates: args.exclude_dates,
                variation_minutes: args.variation_minutes,
              };
            } else {
              if (!args.days || args.days.length === 0) {
                return textResponse('Error: days ([{date, segments}]) is required');
              }
              request = {
                mode: 'days',
                employee_id: employeeId,
                days: args.days,
                skip_leave: args.skip_leave,
                jitter_minutes: args.jitter_minutes,
                variation_minutes: args.variation_minutes,
              };
            }
            const window = requestWindow(request);
            const { plan, facts } = await planBackfill(request, window.start, window.end);
            const preview = formatPlanPreview(
              plan,
              { id: employeeId, name },
              window,
              request,
              args.observations,
              facts.coverage
            );

            if (plan.writes.length === 0) {
              return textResponse(`${preview}\n\nNothing to write.`);
            }

            const gate = requireTargetConfirmation({
              operation: 'backfill_shifts',
              employeeId,
              fingerprint: planFingerprint(employeeId, plan.writes, args.observations),
              preview,
              token: args.confirmation_token,
              always: true,
            });
            if (!gate.proceed) return textResponse(gate.message);

            const result = await executeBackfill(employeeId, plan.writes, args.observations);
            const writtenMinutes = result.written.reduce(
              (sum, w) => sum + parseHHMM(w.clock_out) - parseHHMM(w.clock_in),
              0
            );
            const lines = [
              `Wrote ${result.written.length} of ${plan.writes.length} shift record${plan.writes.length === 1 ? '' : 's'} for ${name} (${employeeId}), ${hours(writtenMinutes)}.`,
            ];
            if (result.failed.length > 0) {
              lines.push('');
              lines.push(
                `${result.failed.length} record${result.failed.length === 1 ? '' : 's'} failed:`
              );
              for (const failure of result.failed.slice(0, 20)) {
                lines.push(
                  `  ${failure.date} ${failure.clock_in}-${failure.clock_out}: ${failure.error}`
                );
              }
              if (result.failed.length > 20) {
                const remaining = result.failed.length - 20;
                lines.push(
                  `  ... ${remaining} further failure${remaining === 1 ? '' : 's'} not listed ...`
                );
              }
              if (result.abortedEarly) {
                lines.push('');
                lines.push(
                  `Stopped after ${CONSECUTIVE_FAILURE_ABORT} failures in a row, which points at the ` +
                    `request rather than the records. ${result.notAttempted.length} record${result.notAttempted.length === 1 ? '' : 's'} not attempted.`
                );
              }
              lines.push('');
              lines.push(RETRY_NOTE);
            }
            if (result.written.length > 0) {
              lines.push('');
              lines.push(describeWrites(result.written));
              lines.push('');
              lines.push(ENTRY_TIME_NOTE);
            }
            return textResponse(lines.join('\n'));
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
