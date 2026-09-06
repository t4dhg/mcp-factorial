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
} from '../api/index.js';
import {
  hhmm,
  isoWithOffset,
  LOCATION_TYPES,
  HALF_DAY_VALUES,
  SegmentInputSchema,
  DayInputSchema,
} from '../schemas.js';
import { enumerateDates, formatPlanPreview, planFingerprint } from '../attendance/planner.js';
import type { PlanRequest, PlannedWrite } from '../attendance/planner.js';
import { executeBackfill, findGaps, planBackfill, requestWindow } from '../attendance/backfill.js';
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

function hours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${whole}h` : `${whole}h${String(rest).padStart(2, '0')}`;
}

function describeWrites(writes: PlannedWrite[]): string {
  return writes.map(w => `  ${w.date} ${w.clock_in}-${w.clock_out}`).join('\n');
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
        'clock_out and status for live clocking, gaps to find days with missing hours, and ' +
        'log_range / log_days to enter many days at once. Bulk writes and writes for another ' +
        'employee return a preview plus a confirmation_token first; nothing is written until the ' +
        'call is repeated with that token. Times are HH:MM in company local time.',
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
            'log_range',
            'log_days',
          ])
          .describe('Action'),
        id: z.number().optional().describe('Shift ID (get, update, delete)'),
        employee_id: z
          .number()
          .optional()
          .describe('Employee ID. Defaults to FACTORIAL_EMPLOYEE_ID when set'),
        employee_ids: z.array(z.number()).optional().describe('Employee IDs (list)'),
        start_on: z.string().optional().describe('Start date YYYY-MM-DD (list, gaps, log_range)'),
        end_on: z.string().optional().describe('End date YYYY-MM-DD (list, gaps, log_range)'),
        ids: z.array(z.number()).optional().describe('Shift IDs (list)'),
        updated_at: z.string().optional().describe('Shifts updated at this date (list)'),
        workable: z.boolean().optional().describe('Filter or set the workable flag'),
        half_day: z.enum(HALF_DAY_VALUES).optional().describe('Half day marker'),
        date: z.string().optional().describe('Shift date YYYY-MM-DD (create, update)'),
        reference_date: z
          .string()
          .optional()
          .describe('Reference date YYYY-MM-DD (create, update)'),
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
        confirmation_token: z
          .string()
          .optional()
          .describe('Token from a previous preview, to execute a gated write'),
        page: z.number().optional().default(1).describe('Page number (list, client-side)'),
        limit: z.number().optional().default(100).describe('Items per page (list, client-side)'),
        confirm: z.boolean().optional().describe('Confirm delete'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listShifts({
              employee_ids:
                args.employee_ids ?? (args.employee_id ? [args.employee_id] : undefined),
              start_on: args.start_on,
              end_on: args.end_on,
              ids: args.ids,
              updated_at: args.updated_at,
              workable: args.workable,
              half_day: args.half_day,
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(s => ({
              id: s.id,
              employee_id: s.employee_id,
              date: s.date,
              clock_in: s.clock_in,
              clock_out: s.clock_out,
              minutes: s.minutes,
              in_source: s.in_source,
              observations: s.observations,
            }));
            return textResponse(
              `Found ${result.meta.total} shifts (${formatPaginationInfo(result.meta)}; paging is ` +
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
              `Shift created for ${name} (${employeeId}):\n\n${JSON.stringify(shift, null, 2)}`
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
            return textResponse(`Shift updated:\n\n${JSON.stringify(shift, null, 2)}`);
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
            const now = new Date();
            const input = {
              employee_id: employeeId,
              location_type: args.location_type,
              workplace_id: args.workplace_id,
              observations: args.observations,
            };
            const verb = args.action === 'clock_in' ? 'Clock in' : 'Clock out';
            const gate = requireTargetConfirmation({
              operation: args.action,
              employeeId,
              // The preview is bound to the person and the payload, not the second.
              fingerprint: payloadFingerprint({ action: args.action, input }),
              preview: `${verb} ${name} (${employeeId}) now (${formatLocalIso(now)})`,
              token: args.confirmation_token,
            });
            if (!gate.proceed) return textResponse(gate.message);
            const shift =
              args.action === 'clock_in' ? await clockIn(input, now) : await clockOut(input, now);
            return textResponse(
              `${verb} recorded for ${name} (${employeeId}) at ${formatLocalIso(now)}:\n\n` +
                JSON.stringify(shift, null, 2)
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
            const gaps = await findGaps(employeeId, args.start_on, args.end_on);
            if (gaps.length === 0) {
              return textResponse(
                `No gaps for ${name} (${employeeId}) between ${args.start_on} and ${args.end_on}: ` +
                  'every workday not on leave has at least the expected minutes tracked.'
              );
            }
            const rows = gaps.map(
              g =>
                `  ${g.date}  expected ${hours(g.expected_minutes)}  tracked ${hours(g.tracked_minutes)}  ` +
                `missing ${hours(g.missing_minutes)}${g.half_day_leave ? `  (half-day leave: ${g.half_day_leave})` : ''}`
            );
            const total = gaps.reduce((sum, g) => sum + g.missing_minutes, 0);
            return textResponse(
              `${gaps.length} days with missing hours for ${name} (${employeeId}), ${hours(total)} in total:\n\n` +
                `${rows.join('\n')}\n\nWeekends, bank holidays and full-day leave are excluded. ` +
                'Use log_range with the same dates and your daily segments to fill them.'
            );
          }

          case 'log_range':
          case 'log_days': {
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
              };
            }
            const window = requestWindow(request);
            const { plan } = await planBackfill(request, window.start, window.end);
            const preview = formatPlanPreview(plan, { id: employeeId, name }, window, request);

            if (plan.writes.length === 0) {
              return textResponse(`${preview}\n\nNothing to write.`);
            }

            const gate = requireTargetConfirmation({
              operation: 'backfill_shifts',
              employeeId,
              fingerprint: planFingerprint(employeeId, plan.writes),
              preview,
              token: args.confirmation_token,
              always: true,
            });
            if (!gate.proceed) return textResponse(gate.message);

            const result = await executeBackfill(employeeId, plan.writes, args.observations);
            const writtenMinutes = result.written.reduce(
              (sum, w) =>
                sum +
                (Number(w.clock_out.slice(0, 2)) * 60 +
                  Number(w.clock_out.slice(3)) -
                  Number(w.clock_in.slice(0, 2)) * 60 -
                  Number(w.clock_in.slice(3))),
              0
            );
            const lines = [
              `Wrote ${result.written.length} of ${plan.writes.length} shift records for ${name} (${employeeId}), ${hours(writtenMinutes)}.`,
            ];
            if (result.failed.length > 0) {
              const failed = result.failed[0];
              const remaining = plan.writes.length - result.written.length - 1;
              lines.push('');
              lines.push(
                `Stopped at ${failed.date} ${failed.clock_in}-${failed.clock_out}: ${failed.error}`
              );
              if (remaining > 0) lines.push(`${remaining} further records were not attempted.`);
              lines.push('');
              lines.push(RETRY_NOTE);
            } else {
              lines.push('');
              lines.push(describeWrites(result.written));
              lines.push('');
              lines.push(
                'Records carry source "api", so they are distinguishable from live clocks in Factorial\'s activity log.'
              );
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
