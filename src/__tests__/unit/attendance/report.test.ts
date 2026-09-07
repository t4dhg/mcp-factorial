import { describe, it, expect } from 'vitest';
import { formatAudit } from '../../../attendance/report.js';
import type { FactsCoverage, LedgerDay } from '../../../attendance/planner.js';

const coverage: FactsCoverage = {
  days_in_window: 4,
  days_with_contract_data: 4,
  first_uncovered: null,
  last_uncovered: null,
  leave_records: 1,
  shift_records: 2,
  review_records: 1,
};

const day = (over: Partial<LedgerDay>): LedgerDay => ({
  date: '2026-03-02',
  day_type: 'workday',
  expected_minutes: 480,
  tracked_minutes: 480,
  leave: null,
  shifts: [],
  status: 'complete',
  signed_off: false,
  delta_minutes: 0,
  ...over,
});

const ledger: LedgerDay[] = [
  day({ date: '2026-03-02', status: 'short', tracked_minutes: 463, delta_minutes: -17 }),
  day({ date: '2026-03-03', status: 'over', tracked_minutes: 500, delta_minutes: 20 }),
  day({
    date: '2026-03-04',
    day_type: 'bank_holiday',
    status: 'bank_holiday',
    tracked_minutes: 0,
    delta_minutes: -480,
  }),
  day({
    date: '2026-03-05',
    status: 'missing',
    tracked_minutes: 0,
    delta_minutes: -480,
    signed_off: true,
  }),
];

const input = {
  employee: { id: 7, name: 'Someone' },
  startOn: '2026-03-02',
  endOn: '2026-03-05',
  ledger,
  coverage,
  toleranceMinutes: 15,
  format: 'summary' as const,
};

describe('formatAudit', () => {
  it('shows the delta so nobody has to subtract', () => {
    const text = formatAudit(input);
    expect(text).toContain('-17 min');
    expect(text).toContain('+20 min');
  });

  it('reports the workable target beside the raw expected total', () => {
    const text = formatAudit(input);
    // 4 days at 480 is 32h expected; the bank holiday is not work to be made up,
    // so the workable target is the other three days, 24h.
    expect(text).toContain('Expected 32h');
    expect(text).toContain('workday expected 24h');
  });

  it('marks a signed-off day in its row', () => {
    expect(formatAudit(input)).toContain('signed off');
  });

  it('counts bank holidays rather than listing them, and says so accurately', () => {
    const text = formatAudit(input);
    expect(text).not.toContain('2026-03-04');
    expect(text).toContain('1 bank_holiday');
    expect(text).toContain('bank holidays');
  });

  it('filters to the statuses asked for', () => {
    // The header always repeats startOn (2026-03-02) and endOn (2026-03-05) verbatim,
    // so a plain toContain on those dates would fail regardless of filtering. Pin the
    // actual row format instead: a listed row starts the line with two spaces then
    // the date, which the header text never does.
    const text = formatAudit({ ...input, statuses: ['over'] });
    expect(text).toMatch(/^ {2}2026-03-03/m);
    expect(text).not.toMatch(/^ {2}2026-03-02/m);
    expect(text).not.toMatch(/^ {2}2026-03-05/m);
  });

  it('lists every day in table format', () => {
    const text = formatAudit({ ...input, format: 'table' });
    expect(text).toContain('2026-03-04');
  });
});
