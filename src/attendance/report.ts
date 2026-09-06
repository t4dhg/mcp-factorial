/**
 * Text rendering of an attendance audit. Shared by the `audit` action of the
 * factorial_attendance tool and by the attendance prompts, so that a model
 * reads the same report whichever way it arrives at it.
 */

import { formatCoverage, hours, type FactsCoverage, type Gap, type LedgerDay } from './planner.js';

export type AuditFormat = 'summary' | 'table' | 'json';

export interface AuditReportInput {
  employee: { id: number; name: string };
  startOn: string;
  endOn: string;
  ledger: LedgerDay[];
  coverage: FactsCoverage;
  toleranceMinutes: number;
  format: AuditFormat;
}

/** Statuses an audit summary lists; the rest are counted in the header only */
const QUIET_STATUSES = new Set<LedgerDay['status']>(['complete', 'weekend', 'future']);

export function ledgerRow(d: LedgerDay): string {
  const shifts = d.shifts.length
    ? d.shifts.map(sh => `${sh.clock_in}-${sh.clock_out ?? 'open'}`).join(' ')
    : '-';
  const leave = d.leave ? `  leave:${d.leave}` : '';
  return `  ${d.date}  ${(d.day_type ?? '-').padEnd(12)} ${d.status.padEnd(16)} expected ${hours(d.expected_minutes).padEnd(6)} tracked ${hours(d.tracked_minutes).padEnd(6)} ${shifts}${leave}`;
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
  const summary = [...counts.entries()].map(([k, v]) => `${v} ${k}`).join(', ');
  const header =
    `Attendance audit for ${employee.name} (${employee.id}), ${startOn} to ${endOn}\n` +
    `Expected ${hours(expected)} across the range, tracked ${hours(tracked)}; days: ${summary}.\n` +
    `${formatCoverage(coverage)}\n` +
    'Expected comes from the contract pattern; day type and bank holidays from the company ' +
    'calendar in Factorial; leave from approved timeoff records. Times are HH:MM company local. ' +
    `A day within ${toleranceMinutes} minutes of its expected total counts as complete.`;
  if (format === 'json') {
    return `${header}\n\nMachine-readable ledger:\n${JSON.stringify(ledger)}`;
  }
  const listed = format === 'table' ? ledger : ledger.filter(d => !QUIET_STATUSES.has(d.status));
  const rows = listed.map(ledgerRow);
  const footer =
    format === 'table'
      ? ''
      : `\n\n${listed.length} of ${ledger.length} days listed; complete days, weekends and future dates are ` +
        'only counted above. Pass format: "table" for every day or format: "json" for the ledger.';
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
      `missing ${hours(g.missing_minutes)}${g.half_day_leave ? `  (half-day leave: ${g.half_day_leave})` : ''}`
  );
  const total = gaps.reduce((sum, g) => sum + g.missing_minutes, 0);
  return (
    `${gaps.length} days with missing hours for ${employee.name} (${employee.id}), ${hours(total)} in total.\n` +
    `${formatCoverage(coverage)}\n\n` +
    `${rows.join('\n')}\n\nWeekends, bank holidays and full-day leave are excluded. ` +
    'Use log_range with the same dates and your daily segments to fill them.'
  );
}
