/**
 * Attendance prompts and the registro horario guide.
 *
 * A prompt is a procedure the user invokes (a slash command in Claude Code,
 * an entry in the prompt menu elsewhere). Each one here pre-reads the facts
 * the procedure starts from, states the exact tool calls that follow with
 * their arguments filled in, and spells out the decision rules, so that a
 * small model can carry the workflow through without having to design it.
 * Nothing is written by a prompt itself; writes happen only through the
 * factorial_attendance tool and its confirmation gate.
 *
 * The guide resource (factorial://guides/registro-horario) is the same
 * knowledge for a model that discovers resources on its own.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { localToday } from '../api/attendance.js';
import { buildLedger, findGaps } from '../attendance/backfill.js';
import { resolveEmployeeName, resolveTargetEmployeeId } from '../attendance/identity.js';
import {
  DEFAULT_TOLERANCE_MINUTES,
  hours,
  validateSegments,
  type Segment,
} from '../attendance/planner.js';
import { formatAudit, formatGaps, ledgerRow } from '../attendance/report.js';

export const GUIDE_URI = 'factorial://guides/registro-horario';

const SEGMENT = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse the `segments` prompt argument. Prompt arguments are strings, so the
 * daily pattern arrives as "09:00-14:00, 15:00-18:00" (comma, semicolon or
 * whitespace separated) or as the JSON array the tool takes.
 */
export function parseSegmentsArg(text: string): Segment[] {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new Error('segments is required, for example "09:00-14:00, 15:00-18:00"');
  }
  let segments: Segment[];
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('segments JSON must be an array');
    segments = parsed.map((item: unknown) => {
      if (
        item === null ||
        typeof item !== 'object' ||
        typeof (item as Segment).clock_in !== 'string' ||
        typeof (item as Segment).clock_out !== 'string'
      ) {
        throw new Error('each segment needs clock_in and clock_out as "HH:MM" strings');
      }
      return { clock_in: (item as Segment).clock_in, clock_out: (item as Segment).clock_out };
    });
  } else {
    segments = trimmed
      .split(/[,;\s]+/)
      .filter(part => part !== '')
      .map(part => {
        if (!SEGMENT.test(part)) {
          throw new Error(
            `Segment "${part}" must be HH:MM-HH:MM in 24-hour company local time, ` +
              'for example "09:00-14:00, 15:00-18:00"'
          );
        }
        const [clock_in, clock_out] = part.split('-');
        return { clock_in, clock_out };
      });
  }
  validateSegments(segments);
  return segments;
}

/** Sum of a daily pattern in minutes */
function patternMinutes(segments: Segment[]): number {
  return segments.reduce((sum, s) => {
    const [ih, im] = s.clock_in.split(':').map(Number);
    const [oh, om] = s.clock_out.split(':').map(Number);
    return sum + (oh * 60 + om) - (ih * 60 + im);
  }, 0);
}

function parseOptionalInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

/** First day of the month of `today` up to `today`, the default audit window */
export function defaultWindow(today: string): { start_on: string; end_on: string } {
  return { start_on: `${today.slice(0, 7)}-01`, end_on: today };
}

function resolveWindow(startOn: string | undefined, endOn: string | undefined, today: string) {
  const fallback = defaultWindow(today);
  return {
    start_on: startOn && startOn.trim() !== '' ? startOn.trim() : fallback.start_on,
    end_on: endOn && endOn.trim() !== '' ? endOn.trim() : fallback.end_on,
  };
}

function toolCall(args: Record<string, unknown>): string {
  return `factorial_attendance(${JSON.stringify(args)})`;
}

function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

/** Pre-read the data a procedure starts from; on failure, say so instead of failing the prompt */
async function preRead(label: string, read: () => Promise<string>): Promise<string> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      `The server could not pre-read ${label}: ${message}\n` +
      'Run the corresponding factorial_attendance call yourself before continuing.'
    );
  }
}

const STATUS_LEGEND = [
  'Statuses: complete (tracked within tolerance of expected), missing (hours short), over (hours in',
  'excess), weekend, bank_holiday, on_leave (approved full-day leave), half_day_leave (approved half',
  'day; the other half may be missing), not_workable (the contract expects 0 minutes), no_contract_data',
  '(Factorial returned nothing for the date; usually before the start of employment, never a fact about',
  'hours), future (after today, never written).',
].join(' ');

export const REGISTRO_HORARIO_GUIDE = `# Registro horario with factorial_attendance

This guide is for the model driving the tool. Every step below is a call to the \`factorial_attendance\` tool with an \`action\`. Times are HH:MM in company local time. Dates are YYYY-MM-DD.

## What the data means

- **Expected** minutes come from the employee's contract pattern (\`estimated_times\`).
- **Tracked** minutes come from the shift records on file (\`worked_times\`, \`shifts\`).
- **Day type** and bank holidays come from the company calendar in Factorial (\`worked_times.day_type\`).
- **Leave** comes from approved \`timeoff/leaves\` records. Pending or rejected leave does not count.
- ${STATUS_LEGEND}
- Every \`gaps\`, \`audit\` and bulk preview starts with a **Data read** line saying how many days of the window have contract data and how many leave and shift records were read. If it reports uncovered days that do not precede the start of employment, stop and report; do not write.
- The server reads every page of every list, so a window of any length is read completely. There is no need to split a range into chunks unless the result is too large to read; if it is, use \`format: "summary"\` on \`audit\` or split by month.

## Workflow A: audit and report

1. \`audit\` with \`start_on\`, \`end_on\` (default \`format\` is \`summary\`: only the days needing attention).
2. Read the Data read line first. Then report: expected vs tracked for the window, the list of \`missing\` days with how much is missing on each, any \`over\` days, any \`half_day_leave\` days whose worked half is untracked, and any \`no_contract_data\` days with the warning above.
3. Write nothing. An audit is read-only.

## Workflow B: fill what is missing

1. \`gaps\` for the window to see which workdays are short and by how much.
2. Ask the person for their usual daily pattern if you do not have it, as segments such as \`[{"clock_in":"09:00","clock_out":"14:00"},{"clock_in":"15:00","clock_out":"18:00"}]\`. Never invent hours; the record is a legal document of time actually worked.
3. \`log_range\` with \`start_on\`, \`end_on\`, \`segments\`, and usually \`jitter_minutes\` (5 to 10) and an \`observations\` note saying why the records are being entered now. The first call returns a **preview** and a \`confirmation_token\`; nothing is written. The preview skips weekends, bank holidays, approved leave, days the contract does not expect work, future dates, days without contract data, and any segment overlapping an existing shift.
4. Show the preview to the person and ask them to confirm. Only then repeat the identical call with \`confirmation_token\`. The token lasts 5 minutes and matches exactly that plan. A bulk write always needs this step; there is no way around it and you must not look for one.
5. Days the person did not work in the range (sick without a leave record, a day off) must be excluded: either narrow the range, or run \`log_range\` on the sub-ranges around them. Days worked outside the pattern (a Saturday, a half day) are written one by one with \`log_days\`, which takes explicit dates and segments and skips only future dates, approved leave and overlaps.
6. If the write stops part way, the result says where. Re-running the identical call is safe: the planner re-reads existing shifts and writes only what is still missing.
7. \`audit\` the same window again and report what changed. Every workday should now read \`complete\`.

## Workflow C: today's record (for a daily routine)

1. \`status\` to see whether the employee is clocked in. If a shift is open, do not write; report it.
2. \`audit\` with \`start_on\` and \`end_on\` both set to today. If the status for today is \`complete\`, \`weekend\`, \`bank_holiday\`, \`on_leave\` or \`not_workable\`, there is nothing to do; report in one line.
3. If today is \`missing\`, \`log_days\` with \`days: [{"date": today, "segments": [...]}]\`, the person's stated pattern, and \`jitter_minutes\`. Then repeat the same call with the returned \`confirmation_token\` in the same session, only if the target is the configured identity (\`FACTORIAL_EMPLOYEE_ID\`). For anyone else, stop and ask.
4. Report in one line what was written or why nothing was.

MCP has no scheduler. To run this daily, schedule it in the client: in Claude Code, \`/schedule\` creates a routine that invokes the \`attendance_today\` prompt, and \`/loop\` repeats it while a session is open; any cron can run \`claude -p\` with the prompt as its input.

## Rules that always apply

- Never write hours for someone other than the person asking unless they name that employee explicitly; the tool requires a confirmation token for it, and so should you.
- Never pass a \`confirmation_token\` without the person having seen the preview it belongs to, except in Workflow C for the configured identity.
- Never delete or overwrite records to make an audit look right. Report discrepancies instead.
- Prefer \`jitter_minutes\` when reconstructing approximate hours, so a month does not read 09:00 on every line. Records still carry \`source: "api"\`.
- The records carry the \`observations\` note; write in it why they were entered (for example "Entered from calendar records on 2026-09-06").
`;

export interface AttendancePromptDeps {
  now?: () => Date;
}

/**
 * Register the three attendance prompts and the guide resource on a server.
 * `deps.now` exists for tests; the server uses the wall clock.
 */
export function registerAttendancePrompts(server: McpServer, deps: AttendancePromptDeps = {}) {
  const today = () => localToday((deps.now ?? (() => new Date()))());

  server.registerResource(
    'registro_horario_guide',
    GUIDE_URI,
    {
      title: 'Registro horario guide',
      description:
        "How to audit, fill and maintain an employee's registro horario (attendance record) with " +
        'the factorial_attendance tool: what the data means, the three workflows, and the rules.',
      mimeType: 'text/markdown',
    },
    uri => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: REGISTRO_HORARIO_GUIDE }],
    })
  );

  server.registerPrompt(
    'attendance_audit',
    {
      title: 'Audit registro horario',
      description:
        "Audit an employee's registro horario for a date window and report what is missing, in " +
        'excess or inconsistent. Read-only. Defaults to the current month up to today and to ' +
        'FACTORIAL_EMPLOYEE_ID.',
      argsSchema: {
        start_on: z
          .string()
          .optional()
          .describe('Start date YYYY-MM-DD (default: 1st of this month)'),
        end_on: z.string().optional().describe('End date YYYY-MM-DD (default: today)'),
        employee_id: z.string().optional().describe('Employee ID (default: FACTORIAL_EMPLOYEE_ID)'),
      },
    },
    async ({ start_on, end_on, employee_id }) => {
      const employeeId = resolveTargetEmployeeId(parseOptionalInt(employee_id, 'employee_id'));
      const name = await resolveEmployeeName(employeeId);
      const window = resolveWindow(start_on, end_on, today());
      const report = await preRead('the audit', async () => {
        const { ledger, coverage } = await buildLedger(employeeId, window.start_on, window.end_on);
        return formatAudit({
          employee: { id: employeeId, name },
          startOn: window.start_on,
          endOn: window.end_on,
          ledger,
          coverage,
          toleranceMinutes: DEFAULT_TOLERANCE_MINUTES,
          format: 'summary',
        });
      });
      return userMessage(
        [
          `Audit the registro horario of ${name} (${employeeId}) from ${window.start_on} to ${window.end_on} and report on it.`,
          '',
          'The audit has already been run for you:',
          '',
          report,
          '',
          'Do this:',
          '1. Read the Data read line. If it names days without contract data that are not before the start of employment, say so first and treat the audit as unreliable.',
          '2. Report expected vs tracked hours for the window and the count of days per status.',
          '3. List every missing day with the hours missing on it, grouped by month. List over days. Mention half_day_leave days whose worked half has no record.',
          '4. If nothing needs attention, say so in one line.',
          '5. Write nothing. This is a read-only report. If the person then wants to fill the gaps, use the attendance_fill prompt or follow Workflow B in the guide (' +
            GUIDE_URI +
            ').',
          '',
          `To see every day rather than only the exceptions: ${toolCall({ action: 'audit', employee_id: employeeId, start_on: window.start_on, end_on: window.end_on, format: 'table' })}`,
          STATUS_LEGEND,
        ].join('\n')
      );
    }
  );

  server.registerPrompt(
    'attendance_fill',
    {
      title: 'Fill missing registro horario',
      description:
        "Find the workdays with missing hours in a window and enter them with the employee's daily " +
        'pattern, through a preview the person confirms. Defaults to the current month up to today ' +
        'and to FACTORIAL_EMPLOYEE_ID.',
      argsSchema: {
        segments: z
          .string()
          .describe('Daily pattern in company local time, e.g. "09:00-14:00, 15:00-18:00"'),
        start_on: z
          .string()
          .optional()
          .describe('Start date YYYY-MM-DD (default: 1st of this month)'),
        end_on: z.string().optional().describe('End date YYYY-MM-DD (default: today)'),
        employee_id: z.string().optional().describe('Employee ID (default: FACTORIAL_EMPLOYEE_ID)'),
        observations: z
          .string()
          .optional()
          .describe('Note stored on every record, e.g. why the hours are being entered now'),
        jitter_minutes: z
          .string()
          .optional()
          .describe('Vary each time by up to this many minutes (default 8, 0 for exact times)'),
      },
    },
    async ({ segments, start_on, end_on, employee_id, observations, jitter_minutes }) => {
      const employeeId = resolveTargetEmployeeId(parseOptionalInt(employee_id, 'employee_id'));
      const name = await resolveEmployeeName(employeeId);
      const window = resolveWindow(start_on, end_on, today());
      const pattern = parseSegmentsArg(segments);
      const jitter = parseOptionalInt(jitter_minutes, 'jitter_minutes') ?? 8;
      const note =
        observations && observations.trim() !== ''
          ? observations.trim()
          : `Entered with the daily pattern on ${today()}`;
      const gapsReport = await preRead('the gaps', async () => {
        const { gaps, coverage } = await findGaps(employeeId, window.start_on, window.end_on);
        return formatGaps({
          employee: { id: employeeId, name },
          startOn: window.start_on,
          endOn: window.end_on,
          gaps,
          coverage,
        });
      });
      const rangeCall = {
        action: 'log_range',
        employee_id: employeeId,
        start_on: window.start_on,
        end_on: window.end_on,
        segments: pattern,
        jitter_minutes: jitter,
        observations: note,
      };
      return userMessage(
        [
          `Fill the missing registro horario of ${name} (${employeeId}) from ${window.start_on} to ${window.end_on} with the daily pattern ${pattern.map(s => `${s.clock_in}-${s.clock_out}`).join(' and ')} (${hours(patternMinutes(pattern))} a day).`,
          '',
          'The gaps have already been read for you:',
          '',
          gapsReport,
          '',
          'Do this, in order:',
          '1. Read the Data read line. If it names days without contract data that are not before the start of employment, stop and report; do not write.',
          '2. Tell the person which days are short and ask whether any of them were not worked (illness without a leave record, a day off). Exclude such days by narrowing the range or by running the call on the sub-ranges around them. Never invent hours.',
          `3. Preview the write. Nothing is written by this call: ${toolCall(rangeCall)}`,
          '4. Show the person the preview: how many days and records, the hours, and every skipped day with its reason. Ask them to confirm.',
          '5. Only after they confirm, repeat exactly the same call adding the confirmation_token from the preview. The token lasts 5 minutes and matches only that plan. If it expired, run the preview again.',
          '6. If the result says the write stopped part way, re-run the identical call; the planner writes only what is still missing.',
          `7. Verify: ${toolCall({ action: 'audit', employee_id: employeeId, start_on: window.start_on, end_on: window.end_on })} and report what changed. Every workday should read complete.`,
          '',
          'For days worked outside the pattern (a Saturday, a half day next to half-day leave), write them one by one with action log_days, for example ' +
            toolCall({
              action: 'log_days',
              employee_id: employeeId,
              days: [{ date: window.end_on, segments: pattern.slice(0, 1) }],
              observations: note,
            }) +
            ', with the same preview and confirmation steps.',
          '',
          `Full guide: ${GUIDE_URI}`,
        ].join('\n')
      );
    }
  );

  server.registerPrompt(
    'attendance_today',
    {
      title: "Record today's registro horario",
      description:
        "Enter today's hours for the configured employee if today is a workday with nothing " +
        'tracked yet. Made for a daily routine (Claude Code /schedule or a cron running claude -p). ' +
        'Does nothing on weekends, bank holidays, leave, or when a shift is open or today is complete.',
      argsSchema: {
        segments: z
          .string()
          .describe('Daily pattern in company local time, e.g. "09:00-14:00, 15:00-18:00"'),
        employee_id: z.string().optional().describe('Employee ID (default: FACTORIAL_EMPLOYEE_ID)'),
        observations: z.string().optional().describe('Note stored on the records'),
        jitter_minutes: z
          .string()
          .optional()
          .describe('Vary each time by up to this many minutes (default 8, 0 for exact times)'),
      },
    },
    async ({ segments, employee_id, observations, jitter_minutes }) => {
      const explicit = parseOptionalInt(employee_id, 'employee_id');
      const employeeId = resolveTargetEmployeeId(explicit);
      const name = await resolveEmployeeName(employeeId);
      const date = today();
      const pattern = parseSegmentsArg(segments);
      const jitter = parseOptionalInt(jitter_minutes, 'jitter_minutes') ?? 8;
      const note =
        observations && observations.trim() !== '' ? observations.trim() : 'Daily record';
      const todayReport = await preRead("today's ledger", async () => {
        const { ledger, coverage } = await buildLedger(employeeId, date, date);
        const [row] = ledger;
        return (
          `Today ${date} for ${name} (${employeeId}): status ${row.status}` +
          (row.shifts.length
            ? `, shifts on record ${row.shifts.map(s => `${s.clock_in}-${s.clock_out ?? 'open'}`).join(' ')}`
            : ', no shifts on record') +
          `.\n${ledgerRow(row)}\n` +
          `Data read: contract data for ${coverage.days_with_contract_data} of 1 day, ${coverage.leave_records} leave records, ${coverage.shift_records} shift records.`
        );
      });
      const daysCall = {
        action: 'log_days',
        employee_id: employeeId,
        days: [{ date, segments: pattern }],
        jitter_minutes: jitter,
        observations: note,
      };
      return userMessage(
        [
          `Record today's registro horario (${date}) for ${name} (${employeeId}) with the pattern ${pattern.map(s => `${s.clock_in}-${s.clock_out}`).join(' and ')} (${hours(patternMinutes(pattern))}), if and only if today is a workday with nothing tracked yet.`,
          '',
          "Today's ledger has already been read for you:",
          '',
          todayReport,
          '',
          'Decide as follows:',
          `1. ${toolCall({ action: 'status', employee_id: employeeId })}. If the employee is clocked in (an open shift), write nothing and report that a shift is open.`,
          '2. If the status above is complete, weekend, bank_holiday, on_leave, not_workable or future, write nothing and report in one line why.',
          '3. If the status is no_contract_data, write nothing and report that Factorial has no contract data for today.',
          '4. If the status is half_day_leave, write nothing and report it; the worked half needs a person to say which half it was.',
          `5. If the status is missing and no shift is on record, preview the write: ${toolCall(daysCall)}. Then, in this same session, repeat the identical call adding the confirmation_token from the preview. This unattended confirmation is allowed only when the employee is the configured identity (FACTORIAL_EMPLOYEE_ID)${explicit !== undefined ? '; an explicit employee_id was given, so confirm that it is the configured identity before proceeding, and otherwise stop and ask' : ''}.`,
          '6. If the status is missing but a shift is already on record for today, write nothing and report the partial day; a person decides how to complete it.',
          `7. Verify with ${toolCall({ action: 'audit', employee_id: employeeId, start_on: date, end_on: date })} and report in one line what was written or why nothing was.`,
          '',
          `Full guide: ${GUIDE_URI}`,
        ].join('\n')
      );
    }
  );
}
