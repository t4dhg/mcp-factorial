import { describe, it, expect } from 'vitest';
import {
  buildBackfillPlan,
  computeGaps,
  enumerateDates,
  expandLeaves,
  intervalsOverlap,
  parseHHMM,
  planFingerprint,
  validateSegments,
  type PlanFacts,
} from '../../../attendance/planner.js';

// Facts mirror what the live API returned for December 2026 on one employee:
// bank holidays 21-25 and 31, a weekend on 26-27, workdays 28-30.
// estimated_times reports full expected minutes on every bank holiday, so a
// planner that trusted it alone would write hours onto Christmas Day.
function decemberFacts(overrides: Partial<PlanFacts> = {}): PlanFacts {
  const days = new Map<
    string,
    { day_type: string; expected_minutes: number; tracked_minutes: number }
  >();
  const put = (date: string, day_type: string, expected: number, tracked = 0) =>
    days.set(date, { day_type, expected_minutes: expected, tracked_minutes: tracked });
  put('2026-12-21', 'bank_holiday', 240);
  put('2026-12-22', 'bank_holiday', 240);
  put('2026-12-23', 'bank_holiday', 240);
  put('2026-12-24', 'bank_holiday', 240);
  put('2026-12-25', 'bank_holiday', 240);
  put('2026-12-26', 'saturday', 0);
  put('2026-12-27', 'sunday', 0);
  put('2026-12-28', 'workday', 240);
  put('2026-12-29', 'workday', 240);
  put('2026-12-30', 'workday', 240);
  put('2026-12-31', 'bank_holiday', 240);
  return {
    today: '2027-01-15',
    days,
    shifts: [],
    leaves: new Map(),
    ...overrides,
  };
}

const morning = { clock_in: '09:00', clock_out: '13:00' };
const afternoon = { clock_in: '14:00', clock_out: '18:00' };

function rangeRequest(overrides = {}) {
  return {
    mode: 'range' as const,
    employee_id: 2,
    dates: enumerateDates('2026-12-21', '2026-12-31'),
    segments: [morning],
    skip_leave: true,
    ...overrides,
  };
}

describe('time helpers', () => {
  it('parses HH:MM into minutes and rejects anything else', () => {
    expect(parseHHMM('09:05')).toBe(545);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(() => parseHHMM('9:05')).toThrow();
    expect(() => parseHHMM('24:00')).toThrow();
    expect(() => parseHHMM('2026-12-21T09:00:00+01:00')).toThrow();
  });

  it('treats touching intervals as not overlapping', () => {
    expect(intervalsOverlap([540, 840], [840, 1080])).toBe(false);
    expect(intervalsOverlap([540, 840], [839, 1080])).toBe(true);
    expect(intervalsOverlap([555, 795], [540, 840])).toBe(true);
  });

  it('enumerates inclusive date ranges', () => {
    expect(enumerateDates('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(() => enumerateDates('2026-03-02', '2026-03-01')).toThrow();
  });
});

describe('validateSegments', () => {
  it('accepts a split day', () => {
    expect(() => validateSegments([morning, afternoon])).not.toThrow();
  });

  it('rejects clock_in at or after clock_out, including overnight shifts', () => {
    expect(() => validateSegments([{ clock_in: '09:00', clock_out: '09:00' }])).toThrow(/before/);
    expect(() => validateSegments([{ clock_in: '22:00', clock_out: '06:00' }])).toThrow(
      /overnight|reference_date/i
    );
  });

  it('rejects segments that overlap each other within the request', () => {
    expect(() =>
      validateSegments([
        { clock_in: '09:00', clock_out: '14:00' },
        { clock_in: '13:30', clock_out: '18:00' },
      ])
    ).toThrow(/overlap/);
  });

  it('rejects non HH:MM times and empty lists', () => {
    expect(() =>
      validateSegments([{ clock_in: '2026-01-01T09:00:00Z', clock_out: '17:00' }])
    ).toThrow(/HH:MM/);
    expect(() => validateSegments([])).toThrow(/at least one/);
  });
});

describe('expandLeaves', () => {
  it('expands approved, undeleted leaves into a per-date cover map and ignores the rest', () => {
    const cover = expandLeaves([
      {
        start_on: '2026-08-24',
        finish_on: '2026-08-26',
        half_day: null,
        approved: true,
        deleted_at: null,
      },
      {
        start_on: '2026-08-27',
        finish_on: '2026-08-27',
        half_day: 'beggining_of_day',
        approved: true,
        deleted_at: null,
      },
      {
        start_on: '2026-08-28',
        finish_on: '2026-08-28',
        half_day: null,
        approved: false,
        deleted_at: null,
      },
      {
        start_on: '2026-08-29',
        finish_on: '2026-08-29',
        half_day: null,
        approved: true,
        deleted_at: '2026-08-01T00:00:00Z',
      },
      {
        start_on: '2026-08-30',
        finish_on: '2026-08-30',
        half_day: null,
        approved: null,
        deleted_at: null,
      },
    ]);
    expect([...cover.entries()]).toEqual([
      ['2026-08-24', 'full'],
      ['2026-08-25', 'full'],
      ['2026-08-26', 'full'],
      ['2026-08-27', 'beggining_of_day'],
    ]);
  });
});

describe('buildBackfillPlan for a range', () => {
  it('skips weekends, bank holidays and refuses future dates, writing only real workdays', () => {
    const plan = buildBackfillPlan(rangeRequest(), decemberFacts());
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30']);
    const reasons = plan.skippedDays.map(d => `${d.date}:${d.reason}`);
    expect(reasons).toContain('2026-12-25:bank_holiday');
    expect(reasons).toContain('2026-12-26:weekend');
    expect(reasons).toContain('2026-12-27:weekend');
    expect(reasons).toContain('2026-12-31:bank_holiday');
    expect(plan.totals).toEqual({ days: 3, records: 3, minutes: 720 });
  });

  it('refuses future dates before any other rule', () => {
    const plan = buildBackfillPlan(rangeRequest(), decemberFacts({ today: '2026-12-29' }));
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-29']);
    expect(plan.skippedDays.find(d => d.date === '2026-12-30')?.reason).toBe('future_date');
    expect(plan.skippedDays.find(d => d.date === '2026-12-31')?.reason).toBe('future_date');
  });

  it('skips a workday with zero expected minutes as not_workable', () => {
    const facts = decemberFacts();
    facts.days.set('2026-12-29', { day_type: 'workday', expected_minutes: 0, tracked_minutes: 0 });
    const plan = buildBackfillPlan(rangeRequest(), facts);
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-30']);
    expect(plan.skippedDays.find(d => d.date === '2026-12-29')?.reason).toBe('not_workable');
  });

  it('skips full-day leave, and skips the whole day on half-day leave with a pointer to log_days', () => {
    const leaves = new Map([
      ['2026-12-28', 'full' as const],
      ['2026-12-29', 'end_of_day' as const],
    ]);
    const plan = buildBackfillPlan(rangeRequest(), decemberFacts({ leaves }));
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-30']);
    expect(plan.skippedDays.find(d => d.date === '2026-12-28')?.reason).toBe('on_leave');
    const half = plan.skippedDays.find(d => d.date === '2026-12-29');
    expect(half?.reason).toBe('half_day_leave');
    expect(half?.detail).toMatch(/log_days/);
  });

  it('writes over leave when skip_leave is false', () => {
    const leaves = new Map([['2026-12-28', 'full' as const]]);
    const plan = buildBackfillPlan(rangeRequest({ skip_leave: false }), decemberFacts({ leaves }));
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30']);
  });

  it('skips only the overlapping segment against a non-round existing clock-in', () => {
    const facts = decemberFacts({
      shifts: [{ date: '2026-12-29', clock_in: '09:15', clock_out: '13:15' }],
    });
    const plan = buildBackfillPlan(rangeRequest({ segments: [morning, afternoon] }), facts);
    expect(plan.writes.filter(w => w.date === '2026-12-29')).toEqual([
      { date: '2026-12-29', clock_in: '14:00', clock_out: '18:00' },
    ]);
    expect(plan.skippedSegments).toEqual([
      {
        date: '2026-12-29',
        clock_in: '09:00',
        clock_out: '13:00',
        reason: 'overlaps_existing',
        detail: 'overlaps existing 09:15-13:15',
      },
    ]);
    expect(plan.totals.records).toBe(5);
  });

  it('does not treat a touching existing shift as an overlap', () => {
    const facts = decemberFacts({
      shifts: [{ date: '2026-12-29', clock_in: '13:00', clock_out: '14:00' }],
    });
    const plan = buildBackfillPlan(rangeRequest({ segments: [morning, afternoon] }), facts);
    expect(plan.writes.filter(w => w.date === '2026-12-29')).toHaveLength(2);
    expect(plan.skippedSegments).toEqual([]);
  });

  it('treats an open shift as occupying until the end of the day', () => {
    const facts = decemberFacts({
      shifts: [{ date: '2026-12-29', clock_in: '13:30', clock_out: null }],
    });
    const plan = buildBackfillPlan(rangeRequest({ segments: [morning, afternoon] }), facts);
    expect(plan.writes.filter(w => w.date === '2026-12-29')).toEqual([
      { date: '2026-12-29', clock_in: '09:00', clock_out: '13:00' },
    ]);
    expect(plan.skippedSegments[0].detail).toBe('overlaps existing 13:30-open');
  });

  it('drops a day entirely when every segment overlaps, without counting it as written', () => {
    const facts = decemberFacts({
      shifts: [{ date: '2026-12-29', clock_in: '08:00', clock_out: '19:00' }],
    });
    const plan = buildBackfillPlan(rangeRequest(), facts);
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-30']);
    expect(plan.totals.days).toBe(2);
  });

  it('returns an empty plan when nothing is writable', () => {
    const plan = buildBackfillPlan(
      rangeRequest({ dates: enumerateDates('2026-12-21', '2026-12-27') }),
      decemberFacts()
    );
    expect(plan.writes).toEqual([]);
    expect(plan.totals).toEqual({ days: 0, records: 0, minutes: 0 });
  });

  it('re-planning after a partial write produces exactly the missing segments', () => {
    const first = buildBackfillPlan(
      rangeRequest({ segments: [morning, afternoon] }),
      decemberFacts()
    );
    expect(first.writes).toHaveLength(6);
    // Simulate the first four writes succeeding and the fifth failing.
    const written = first.writes.slice(0, 4);
    const facts = decemberFacts({ shifts: written });
    const second = buildBackfillPlan(rangeRequest({ segments: [morning, afternoon] }), facts);
    expect(second.writes).toEqual(first.writes.slice(4));
    expect(second.skippedSegments).toHaveLength(4);
  });
});

describe('buildBackfillPlan for explicit days', () => {
  it('writes a Saturday and a bank holiday someone genuinely worked, but still refuses future dates and leave', () => {
    const facts = decemberFacts({
      today: '2026-12-30',
      leaves: new Map([['2026-12-28', 'full' as const]]),
    });
    const plan = buildBackfillPlan(
      {
        mode: 'days',
        employee_id: 2,
        days: [
          { date: '2026-12-25', segments: [morning] },
          { date: '2026-12-26', segments: [morning, afternoon] },
          { date: '2026-12-28', segments: [morning] },
          { date: '2026-12-31', segments: [morning] },
        ],
        skip_leave: true,
      },
      facts
    );
    expect(plan.writes.map(w => `${w.date} ${w.clock_in}`)).toEqual([
      '2026-12-25 09:00',
      '2026-12-26 09:00',
      '2026-12-26 14:00',
    ]);
    expect(plan.skippedDays.map(d => `${d.date}:${d.reason}`)).toEqual([
      '2026-12-28:on_leave',
      '2026-12-31:future_date',
    ]);
  });

  it('writes the other half of a half-day leave day', () => {
    const facts = decemberFacts({ leaves: new Map([['2026-12-29', 'beggining_of_day' as const]]) });
    const plan = buildBackfillPlan(
      {
        mode: 'days',
        employee_id: 2,
        days: [{ date: '2026-12-29', segments: [afternoon] }],
        skip_leave: true,
      },
      facts
    );
    expect(plan.writes).toEqual([{ date: '2026-12-29', clock_in: '14:00', clock_out: '18:00' }]);
    expect(plan.skippedDays).toEqual([]);
  });

  it('rejects duplicate dates in the request', () => {
    expect(() =>
      buildBackfillPlan(
        {
          mode: 'days',
          employee_id: 1,
          days: [
            { date: '2026-12-29', segments: [morning] },
            { date: '2026-12-29', segments: [afternoon] },
          ],
          skip_leave: true,
        },
        decemberFacts()
      )
    ).toThrow(/2026-12-29/);
  });
});

describe('planFingerprint', () => {
  const writes = [
    { date: '2026-12-28', clock_in: '09:00', clock_out: '13:00' },
    { date: '2026-12-29', clock_in: '09:00', clock_out: '13:00' },
  ];

  it('is stable for the same writes and changes when a write changes', () => {
    expect(planFingerprint(1, writes)).toBe(planFingerprint(1, [...writes]));
    expect(planFingerprint(1, writes)).not.toBe(planFingerprint(2, writes));
    expect(planFingerprint(1, writes)).not.toBe(planFingerprint(1, writes.slice(1)));
  });

  it('covers the note written onto every record', () => {
    expect(planFingerprint(1, writes, 'migrated')).not.toBe(planFingerprint(1, writes));
    expect(planFingerprint(1, writes, 'migrated')).toBe(planFingerprint(1, writes, 'migrated'));
  });
});

describe('existing shifts the planner cannot interpret', () => {
  it('names the record instead of blaming the request', () => {
    const facts = decemberFacts({
      shifts: [{ date: '2026-12-29', clock_in: '2000-01-01T09:00:00Z', clock_out: null }],
    });
    expect(() => buildBackfillPlan(rangeRequest(), facts)).toThrow(/existing shift on 2026-12-29/);
  });

  it('treats an overnight existing shift as occupying to the end of its day', () => {
    const facts = decemberFacts({
      shifts: [{ date: '2026-12-29', clock_in: '22:00', clock_out: '06:00' }],
    });
    const plan = buildBackfillPlan(
      rangeRequest({ segments: [{ clock_in: '22:30', clock_out: '23:30' }] }),
      facts
    );
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-30']);
  });
});

describe('computeGaps', () => {
  it('lists past workdays where expected exceeds tracked and are not on leave, flagging half days', () => {
    const facts = decemberFacts({
      leaves: new Map([
        ['2026-12-28', 'full' as const],
        ['2026-12-29', 'end_of_day' as const],
      ]),
    });
    facts.days.set('2026-12-30', {
      day_type: 'workday',
      expected_minutes: 240,
      tracked_minutes: 240,
    });
    facts.days.set('2027-02-01', {
      day_type: 'workday',
      expected_minutes: 240,
      tracked_minutes: 0,
    });
    facts.days.set('2026-12-29', {
      day_type: 'workday',
      expected_minutes: 240,
      tracked_minutes: 60,
    });
    const gaps = computeGaps(facts);
    expect(gaps).toEqual([
      {
        date: '2026-12-29',
        expected_minutes: 240,
        tracked_minutes: 60,
        missing_minutes: 180,
        half_day_leave: 'end_of_day',
      },
    ]);
  });
});
