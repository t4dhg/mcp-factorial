/**
 * Text rendering of an attendance audit. Shared by the `audit` action of the
 * factorial_attendance tool and by the attendance prompts, so that a model
 * reads the same report whichever way it arrives at it.
 */

import { formatCoverage, hours, type FactsCoverage, type Gap, type LedgerDay } from './planner.js';

export type AuditFormat = 'summary' | 'table' | 'json';

// ENTRY_TIME_NOTE lives in planner.ts (the lower layer, which report.ts already
// depends on) and is re-exported here so existing importers, including
// src/tools/attendance.ts, keep working unchanged.
export { ENTRY_TIME_NOTE } from './planner.js';

export interface AuditReportInput {
  employee: { id: number; name: string };
  startOn: string;
  endOn: string;
  ledger: LedgerDay[];
  coverage: FactsCoverage;
  toleranceMinutes: number;
  format: AuditFormat;
  /** Restrict the summary to these statuses; absent means the default quiet set applies */
  statuses?: LedgerDay['status'][];
}

/**
 * Statuses the summary counts rather than lists. These are the days that need
 * no attention: a bank holiday and a full-day leave are as settled as a
 * complete day, and listing 14 of them buried the 9 that mattered.
 */
const QUIET_STATUSES = new Set<LedgerDay['status']>([
  'complete',
  'weekend',
  'future',
  'bank_holiday',
  'on_leave',
  'not_workable',
]);

/** `+20 min`, `-17 min`, or blank when the day matches its expectation */
function delta(minutes: number): string {
  if (minutes === 0) return '';
  return `  (${minutes > 0 ? '+' : ''}${minutes} min)`;
}

/**
 * Minutes actually owed for a day, as distinct from `expected_minutes`, which
 * comes straight from the contract pattern and does not know about leave or
 * holidays. A bank holiday, full-day leave, not-workable day, or future date
 * owes nothing. A half-day leave owes half; the planner does not prorate
 * `expected_minutes` itself, so a half-day-leave day still reports a full
 * day's expected minutes and would otherwise overstate what was owed by half
 * a contract day. Every other day owes its full expected minutes.
 */
function minutesOwed(d: LedgerDay): number {
  if (['bank_holiday', 'on_leave', 'not_workable', 'future'].includes(d.status)) return 0;
  if (d.status === 'half_day_leave') return Math.round(d.expected_minutes / 2);
  return d.expected_minutes;
}

export function ledgerRow(d: LedgerDay): string {
  const shifts = d.shifts.length
    ? d.shifts.map(sh => `${sh.clock_in}-${sh.clock_out ?? 'open'}`).join(' ')
    : '-';
  const leave = d.leave ? `  leave:${d.leave}` : '';
  const locked = d.signed_off ? '  signed off' : '';
  return `  ${d.date}  ${(d.day_type ?? '-').padEnd(12)} ${d.status.padEnd(16)} expected ${hours(d.expected_minutes).padEnd(6)} tracked ${hours(d.tracked_minutes).padEnd(6)} ${shifts}${delta(d.delta_minutes)}${leave}${locked}`;
}

/** Count ledger days per status, in first-seen order */
export function countStatuses(ledger: LedgerDay[]): Map<LedgerDay['status'], number> {
  const counts = new Map<LedgerDay['status'], number>();
  for (const day of ledger) counts.set(day.status, (counts.get(day.status) ?? 0) + 1);
  return counts;
}

export function formatAudit(input: AuditReportInput): string {
  const { employee, startOn, endOn, ledger, coverage, toleranceMinutes, format } = input;
  const counts = countStatuses(ledger);
  const expected = ledger.reduce((sum, d) => sum + d.expected_minutes, 0);
  const tracked = ledger.reduce((sum, d) => sum + d.tracked_minutes, 0);
  // expected counts bank holidays and leave at full contract minutes, because
  // that is what the contract pattern says about those days. It is not the
  // number tracked hours should be compared against, so give both.
  const workdayExpected = ledger.reduce((sum, d) => sum + minutesOwed(d), 0);
  const signedOff = ledger.filter(d => d.signed_off).length;
  const summary = [...counts.entries()].map(([k, v]) => `${v} ${k}`).join(', ');
  const header =
    `Attendance audit for ${employee.name} (${employee.id}), ${startOn} to ${endOn}\n` +
    `Expected ${hours(expected)} across the range (workday expected ${hours(workdayExpected)}, ` +
    `the target tracked hours should meet), tracked ${hours(tracked)}; days: ${summary}` +
    `${signedOff > 0 ? `; ${signedOff} signed off and closed for writing` : ''}.\n` +
    `${formatCoverage(coverage)}\n` +
    'Expected comes from the contract pattern; day type and bank holidays from the company ' +
    'calendar in Factorial; leave from approved timeoff records. Times are HH:MM company local. ' +
    `A day within ${toleranceMinutes} minute${toleranceMinutes === 1 ? '' : 's'} of its expected total counts as complete.`;
  if (format === 'json') {
    return `${header}\n\nMachine-readable ledger:\n${JSON.stringify(ledger)}`;
  }
  const statusFilter = input.statuses && input.statuses.length > 0 ? input.statuses : undefined;
  const listed =
    format === 'table'
      ? ledger
      : statusFilter
        ? ledger.filter(d => statusFilter.includes(d.status))
        : ledger.filter(d => !QUIET_STATUSES.has(d.status));
  const rows = listed.map(ledgerRow);
  const ledgerDay = ledger.length === 1 ? 'day' : 'days';
  const footer =
    format === 'table'
      ? ''
      : statusFilter
        ? `\n\n${listed.length} of ${ledger.length} ${ledgerDay} listed; filtered to status ` +
          `${statusFilter.map(s => `"${s}"`).join(', ')}. Every other day in the window was omitted by ` +
          'that filter, not because it is settled. Drop statuses to see the default summary, ' +
          'format: "table" for every day, or format: "json" for the ledger.'
        : `\n\n${listed.length} of ${ledger.length} ${ledgerDay} listed; complete days, weekends, bank holidays, ` +
          'approved leave, days the contract does not expect work, and future dates are only counted above. ' +
          'Pass statuses: ["missing"] to narrow further, format: "table" for every day, or format: "json" for the ledger.';
  return `${header}\n\n${rows.length > 0 ? rows.join('\n') : '  (nothing needs attention)'}${footer}`;
}

export interface GapsReportInput {
  employee: { id: number; name: string };
  startOn: string;
  endOn: string;
  gaps: Gap[];
  coverage: FactsCoverage;
}

/** Text rendering of the `gaps` action, shared with the attendance prompts */
export function formatGaps(input: GapsReportInput): string {
  const { employee, startOn, endOn, gaps, coverage } = input;
  if (gaps.length === 0) {
    return (
      `No gaps for ${employee.name} (${employee.id}) between ${startOn} and ${endOn}: ` +
      'every workday not on leave has at least the expected minutes tracked.\n' +
      formatCoverage(coverage)
    );
  }
  const rows = gaps.map(
    g =>
      `  ${g.date}  expected ${hours(g.expected_minutes)}  tracked ${hours(g.tracked_minutes)}  ` +
      `missing ${hours(g.missing_minutes)}${g.half_day_leave ? `  (half-day leave: ${g.half_day_leave})` : ''}` +
      `${g.signed_off ? '  signed off' : ''}`
  );
  const total = gaps.reduce((sum, g) => sum + g.missing_minutes, 0);
  const gapDay = gaps.length === 1 ? 'day' : 'days';
  const signedOffGaps = gaps.filter(g => g.signed_off);
  const openGaps = gaps.filter(g => !g.signed_off);
  // A signed-off date is closed for writing: log_range and log_days both skip
  // it, so telling the reader to fill every listed gap the same way sends
  // them at a call that will refuse the ones marked "signed off" above.
  let instruction: string;
  if (signedOffGaps.length === 0) {
    instruction = 'Use log_range with the same dates and your daily segments to fill them.';
  } else if (openGaps.length === 0) {
    instruction =
      `Every day listed is signed off and closed for writing; log_range and log_days will refuse ` +
      `all of them. Use create_edit_request instead, one per day, with a reason.`;
  } else {
    const signedOffDay = signedOffGaps.length === 1 ? 'day' : 'days';
    instruction =
      `Use log_range with the same dates and your daily segments to fill the days not marked ` +
      `"signed off". The ${signedOffGaps.length} signed-off ${signedOffDay} (${signedOffGaps.map(g => g.date).join(', ')}) ` +
      `are closed for writing; log_range and log_days will refuse them. Use create_edit_request ` +
      'instead for those, one per day, with a reason.';
  }
  return (
    `${gaps.length} ${gapDay} with missing hours for ${employee.name} (${employee.id}), ${hours(total)} in total.\n` +
    `${formatCoverage(coverage)}\n\n` +
    `${rows.join('\n')}\n\nWeekends, bank holidays and full-day leave are excluded. ${instruction}`
  );
}
