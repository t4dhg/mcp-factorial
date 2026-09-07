import { describe, it, expect } from 'vitest';
import {
  buildBackfillPlan,
  computeGaps,
  computeLedger,
  jitterSegments,
  varySegments,
  enumerateDates,
  expandLeaves,
  formatCoverage,
  formatPlanPreview,
  intervalsOverlap,
  parseHHMM,
  planFingerprint,
  validateSegments,
  type FactsCoverage,
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
    reviews: new Set<string>(),
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

  // A date the API returned nothing for is not a fact about the contract. In
  // 10.1.0 it was reported as not_workable, which is how a truncated read of a
  // 249-day window presented itself as "every day from 11 April is not workable".
  it('reports a date absent from the facts as no_contract_data, never as not_workable', () => {
    const facts = decemberFacts();
    facts.days.delete('2026-12-29');
    const plan = buildBackfillPlan(rangeRequest(), facts);
    expect(plan.writes.map(w => w.date)).toEqual(['2026-12-28', '2026-12-30']);
    const skipped = plan.skippedDays.find(d => d.date === '2026-12-29');
    expect(skipped?.reason).toBe('no_contract_data');
    expect(skipped?.reason).not.toBe('not_workable');
    expect(plan.skippedDays.filter(d => d.reason === 'not_workable')).toEqual([]);
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
    facts.days.set('2026-12-21', {
      day_type: 'workday',
      expected_minutes: 240,
      tracked_minutes: 232,
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

describe('formatPlanPreview', () => {
  it('lists every record up to 62 and the first and last few above that, with the hidden count', () => {
    const small = buildBackfillPlan(rangeRequest({ segments: [morning] }), decemberFacts());
    const smallText = formatPlanPreview(
      small,
      { id: 2, name: 'Placeholder Person' },
      { start: '2026-12-21', end: '2026-12-31' },
      rangeRequest({ segments: [morning] })
    );
    expect(smallText).toContain('Records to write:');
    expect(smallText).toContain('    2026-12-30 09:00-13:00');
    expect(smallText).not.toContain('more records not listed');

    // 50 workdays x 2 segments = 100 records, well over the full-list limit
    const dates = enumerateDates('2026-03-02', '2026-05-10');
    const days = new Map<
      string,
      { day_type: string; expected_minutes: number; tracked_minutes: number }
    >();
    for (const d of dates) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      days.set(d, {
        day_type: dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'workday',
        expected_minutes: dow === 0 || dow === 6 ? 0 : 480,
        tracked_minutes: 0,
      });
    }
    const request = {
      ...rangeRequest({ segments: [morning, afternoon], jitter_minutes: 6 }),
      dates,
    };
    const facts: PlanFacts = {
      today: '2026-06-01',
      days,
      shifts: [],
      leaves: new Map(),
      reviews: new Set<string>(),
    };
    const big = buildBackfillPlan(request, facts);
    expect(big.writes.length).toBe(100);
    const text = formatPlanPreview(
      big,
      { id: 2, name: 'Placeholder Person' },
      { start: '2026-03-02', end: '2026-05-10' },
      request
    );
    expect(text).toContain('Records to write:');
    expect(text).toContain(
      `    ${big.writes[0].date} ${big.writes[0].clock_in}-${big.writes[0].clock_out}`
    );
    expect(text).toContain(
      `    ${big.writes[99].date} ${big.writes[99].clock_in}-${big.writes[99].clock_out}`
    );
    expect(text).toContain(
      '... 70 more records not listed; the confirmation token binds to all of them ...'
    );
    expect(text).toContain('fixed per record, listed below');
    expect(text.split('\n').filter(l => /^ {4}2026-\d{2}-\d{2} /.test(l))).toHaveLength(30);
  });
});

describe('preview shape', () => {
  it('collapses the overlap list to one line per day above the cap', () => {
    const shifts = [];
    const days = new Map<
      string,
      { day_type: string; expected_minutes: number; tracked_minutes: number }
    >();
    for (let d = 1; d <= 20; d++) {
      const date = `2026-06-${String(d).padStart(2, '0')}`;
      days.set(date, { day_type: 'workday', expected_minutes: 480, tracked_minutes: 480 });
      shifts.push({ date, clock_in: '09:00', clock_out: '17:00' });
    }
    const facts: PlanFacts = {
      today: '2026-12-31',
      days,
      shifts,
      leaves: new Map(),
      reviews: new Set(),
    };
    const request = {
      mode: 'range' as const,
      employee_id: 1,
      dates: [...days.keys()],
      segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      skip_leave: true,
    };
    const text = formatPlanPreview(
      buildBackfillPlan(request, facts),
      { id: 1, name: 'X' },
      { start: '2026-06-01', end: '2026-06-20' },
      request
    );

    expect(text).toContain('20 segments on 20 days overlap existing shifts');
    // At most ten days named, then a count.
    expect(text).toContain('10 further days not listed');
  });

  it('agrees noun and number in the singular overlap case: "1 segment on 1 day", not "1 segments on 1 days"', () => {
    const facts: PlanFacts = {
      today: '2026-12-31',
      days: new Map([
        ['2026-06-01', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 480 }],
      ]),
      shifts: [{ date: '2026-06-01', clock_in: '09:00', clock_out: '17:00' }],
      leaves: new Map(),
      reviews: new Set(),
    };
    const request = {
      mode: 'range' as const,
      employee_id: 1,
      dates: ['2026-06-01'],
      segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      skip_leave: true,
    };
    const text = formatPlanPreview(
      buildBackfillPlan(request, facts),
      { id: 1, name: 'X' },
      { start: '2026-06-01', end: '2026-06-01' },
      request
    );

    expect(text).toContain('1 segment on 1 day overlap existing shifts');
    expect(text).not.toContain('1 segments');
    expect(text).not.toContain('1 days');
  });

  it('puts the Data read line at the top when coverage is given', () => {
    const facts: PlanFacts = {
      today: '2026-12-31',
      days: new Map([
        ['2026-06-01', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 0 }],
      ]),
      shifts: [],
      leaves: new Map(),
      reviews: new Set(),
      coverage: {
        days_in_window: 1,
        days_with_contract_data: 1,
        first_uncovered: null,
        last_uncovered: null,
        leave_records: 0,
        shift_records: 0,
        review_records: 0,
      },
    };
    const request = {
      mode: 'range' as const,
      employee_id: 1,
      dates: ['2026-06-01'],
      segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      skip_leave: true,
    };
    const text = formatPlanPreview(
      buildBackfillPlan(request, facts),
      { id: 1, name: 'X' },
      { start: '2026-06-01', end: '2026-06-01' },
      request,
      undefined,
      facts.coverage
    );

    expect(text.split('\n')[0]).toContain('Data read:');
  });
});

describe('jitterSegments', () => {
  const pattern = [
    { clock_in: '09:00', clock_out: '14:00' },
    { clock_in: '15:00', clock_out: '18:00' },
  ];

  it('returns the pattern untouched when the magnitude is zero', () => {
    expect(jitterSegments(2, '2026-12-28', pattern, 0)).toEqual(pattern);
  });

  it('is deterministic per employee, date and segment, and stays within the magnitude', () => {
    const a = jitterSegments(2, '2026-12-28', pattern, 7);
    const b = jitterSegments(2, '2026-12-28', pattern, 7);
    expect(a).toEqual(b);
    expect(jitterSegments(2, '2026-12-29', pattern, 7)).not.toEqual(a);
    expect(jitterSegments(3, '2026-12-28', pattern, 7)).not.toEqual(a);
    a.forEach((segment, i) => {
      expect(
        Math.abs(parseHHMM(segment.clock_in) - parseHHMM(pattern[i].clock_in))
      ).toBeLessThanOrEqual(7);
      expect(
        Math.abs(parseHHMM(segment.clock_out) - parseHHMM(pattern[i].clock_out))
      ).toBeLessThanOrEqual(7);
      expect(parseHHMM(segment.clock_in)).toBeLessThan(parseHHMM(segment.clock_out));
    });
  });

  it('shifts clock_in and clock_out of a segment by the same offset, so its duration is preserved', () => {
    // Independent offsets let a two-segment day drift up to 4x the magnitude
    // from its expected total, and an audit with the default tolerance then
    // reported a freshly written day as missing hours.
    for (const date of enumerateDates('2026-03-02', '2026-03-31')) {
      const jittered = jitterSegments(2, date, pattern, 8);
      jittered.forEach((segment, i) => {
        const base = parseHHMM(pattern[i].clock_out) - parseHHMM(pattern[i].clock_in);
        expect(parseHHMM(segment.clock_out) - parseHHMM(segment.clock_in)).toBe(base);
      });
    }
  });

  it('actually varies the times across a month', () => {
    const starts = new Set(
      enumerateDates('2026-03-02', '2026-03-31').map(
        d => jitterSegments(2, d, pattern, 10)[0].clock_in
      )
    );
    expect(starts.size).toBeGreaterThan(5);
  });

  it('never lets touching segments cross each other or midnight', () => {
    const touching = [
      { clock_in: '09:00', clock_out: '14:00' },
      { clock_in: '14:00', clock_out: '23:58' },
    ];
    for (const date of enumerateDates('2026-03-02', '2026-03-31')) {
      const [first, second] = jitterSegments(2, date, touching, 15);
      expect(parseHHMM(first.clock_out)).toBeLessThanOrEqual(parseHHMM(second.clock_in));
      expect(parseHHMM(second.clock_out)).toBeLessThanOrEqual(23 * 60 + 59);
      expect(parseHHMM(first.clock_in)).toBeLessThan(parseHHMM(first.clock_out));
      expect(parseHHMM(second.clock_in)).toBeLessThan(parseHHMM(second.clock_out));
    }
  });

  it('keeps the plan fingerprint stable across a re-plan, so the token still matches', () => {
    const request = rangeRequest({ segments: pattern, jitter_minutes: 8 });
    const first = buildBackfillPlan(request, decemberFacts());
    const second = buildBackfillPlan(request, decemberFacts());
    expect(first.writes).toEqual(second.writes);
    expect(first.writes[0].clock_in).not.toBe('09:00');
    expect(planFingerprint(2, first.writes)).toBe(planFingerprint(2, second.writes));
  });

  it('recognises its own jittered writes on a retry', () => {
    const request = rangeRequest({ segments: pattern, jitter_minutes: 8 });
    const first = buildBackfillPlan(request, decemberFacts());
    const rerun = buildBackfillPlan(request, decemberFacts({ shifts: first.writes.slice(0, 3) }));
    expect(rerun.writes).toEqual(first.writes.slice(3));
  });

  it('builds a ledger with one status per day, tolerating small deviations', () => {
    const facts = decemberFacts({
      today: '2026-12-30',
      shifts: [
        { date: '2026-12-28', clock_in: '09:03', clock_out: '13:07' },
        { date: '2026-12-29', clock_in: '08:00', clock_out: '13:30' },
      ],
      leaves: new Map([['2026-12-30', 'end_of_day' as const]]),
    });
    facts.days.set('2026-12-28', {
      day_type: 'workday',
      expected_minutes: 240,
      tracked_minutes: 244,
    });
    facts.days.set('2026-12-29', {
      day_type: 'workday',
      expected_minutes: 240,
      tracked_minutes: 330,
    });
    const ledger = computeLedger(enumerateDates('2026-12-25', '2026-12-31'), facts);
    expect(ledger.map(d => `${d.date}:${d.status}`)).toEqual([
      '2026-12-25:bank_holiday',
      '2026-12-26:weekend',
      '2026-12-27:weekend',
      '2026-12-28:complete',
      '2026-12-29:over',
      '2026-12-30:half_day_leave',
      '2026-12-31:future',
    ]);
    expect(ledger[3].shifts).toEqual([{ clock_in: '09:03', clock_out: '13:07', minutes: 244 }]);
    expect(ledger[3].delta_minutes).toBe(4);
    expect(computeLedger(['2026-12-28'], facts, 0)[0].status).toBe('over');
  });

  it('gives a date with no facts the status no_contract_data with a null day type', () => {
    const facts = decemberFacts({ today: '2026-12-30' });
    facts.days.delete('2026-12-29');
    const [row] = computeLedger(['2026-12-29'], facts);
    expect(row.status).toBe('no_contract_data');
    expect(row.day_type).toBeNull();
    expect(row.expected_minutes).toBe(0);
    expect(computeLedger(['2026-12-28'], facts)[0].status).not.toBe('no_contract_data');
  });
});

describe('varySegments', () => {
  const segments = [
    { clock_in: '09:00', clock_out: '14:00' },
    { clock_in: '15:00', clock_out: '18:00' },
  ];

  it('shifts every segment of a day by the same offset', () => {
    const varied = varySegments(7, '2026-03-02', segments, 30);
    const shiftOf = (a: string, b: string) => parseHHMM(b) - parseHHMM(a);
    const first = shiftOf(segments[0].clock_in, varied[0].clock_in);
    expect(shiftOf(segments[0].clock_out, varied[0].clock_out)).toBe(first);
    expect(shiftOf(segments[1].clock_in, varied[1].clock_in)).toBe(first);
    expect(shiftOf(segments[1].clock_out, varied[1].clock_out)).toBe(first);
  });

  it('preserves the total worked minutes', () => {
    const varied = varySegments(7, '2026-03-02', segments, 30);
    const total = (list: typeof segments) =>
      list.reduce((sum, s) => sum + parseHHMM(s.clock_out) - parseHHMM(s.clock_in), 0);
    expect(total(varied)).toBe(total(segments));
  });

  it('gives different days different offsets', () => {
    const a = varySegments(7, '2026-03-02', segments, 30)[0].clock_in;
    const b = varySegments(7, '2026-03-03', segments, 30)[0].clock_in;
    const c = varySegments(7, '2026-03-04', segments, 30)[0].clock_in;
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it('is deterministic, so a preview and its confirmation agree', () => {
    expect(varySegments(7, '2026-03-02', segments, 30)).toEqual(
      varySegments(7, '2026-03-02', segments, 30)
    );
  });

  it('returns the pattern untouched at magnitude 0', () => {
    expect(varySegments(7, '2026-03-02', segments, 0)).toEqual(segments);
  });

  it('never pushes the earliest segment before midnight or the latest past it', () => {
    for (const date of enumerateDates('2026-03-02', '2026-03-31')) {
      const varied = varySegments(7, date, segments, 600);
      expect(parseHHMM(varied[0].clock_in)).toBeGreaterThanOrEqual(0);
      expect(parseHHMM(varied[1].clock_out)).toBeLessThanOrEqual(23 * 60 + 59);
    }
  });

  it('composes with jitter rather than cancelling or doubling it: variation moves the whole day, jitter then varies segments inside it', () => {
    const jitterMagnitude = 5;
    for (const [employeeId, date] of [
      [7, '2026-03-02'],
      [11, '2026-04-15'],
      [22, '2026-07-09'],
    ] as const) {
      const variationOnly = varySegments(employeeId, date, segments, 45);
      const composed = jitterSegments(employeeId, date, variationOnly, jitterMagnitude);
      const dayShift = parseHHMM(variationOnly[0].clock_in) - parseHHMM(segments[0].clock_in);
      // A day-level shift of 0 would make this seed uninformative; every seed
      // here is checked to actually move the day, so the assertions below are
      // pinned to real behaviour rather than a coincidence.
      expect(dayShift).not.toBe(0);
      // Composition means the day-level shift survives: composing does not
      // cancel it back toward the original pattern, and jitter only adds its
      // own bounded wobble on top, never doubling the day-level offset.
      const composedShiftFromOriginal =
        parseHHMM(composed[0].clock_in) - parseHHMM(segments[0].clock_in);
      expect(Math.abs(composedShiftFromOriginal - dayShift)).toBeLessThanOrEqual(jitterMagnitude);
    }
  });
});

describe('short versus missing', () => {
  const facts = (tracked: number): PlanFacts => ({
    today: '2026-12-31',
    days: new Map([
      ['2026-12-28', { day_type: 'workday', expected_minutes: 480, tracked_minutes: tracked }],
    ]),
    shifts: [],
    leaves: new Map(),
    reviews: new Set<string>(),
  });

  it('reports a day with nothing tracked as missing', () => {
    const [day] = computeLedger(['2026-12-28'], facts(0), 15);
    expect(day.status).toBe('missing');
    expect(day.delta_minutes).toBe(-480);
  });

  it('reports a day tracked but under tolerance as short', () => {
    const [day] = computeLedger(['2026-12-28'], facts(463), 15);
    expect(day.status).toBe('short');
    expect(day.delta_minutes).toBe(-17);
  });

  it('counts a day within tolerance as complete', () => {
    const [day] = computeLedger(['2026-12-28'], facts(470), 15);
    expect(day.status).toBe('complete');
  });
});

describe('signed_off', () => {
  const reviewedFacts = (tracked: number): PlanFacts => ({
    today: '2026-12-31',
    days: new Map([
      ['2026-12-28', { day_type: 'workday', expected_minutes: 480, tracked_minutes: tracked }],
    ]),
    shifts: [],
    leaves: new Map(),
    reviews: new Set(['2026-12-28']),
  });

  it('marks a signed-off day without replacing its status', () => {
    const [day] = computeLedger(['2026-12-28'], reviewedFacts(0), 15);
    expect(day.signed_off).toBe(true);
    expect(day.status).toBe('missing');
  });

  it('marks a signed-off day that is merely short', () => {
    const [day] = computeLedger(['2026-12-28'], reviewedFacts(463), 15);
    expect(day.signed_off).toBe(true);
    expect(day.status).toBe('short');
  });

  it('leaves an unreviewed day unmarked', () => {
    const facts = reviewedFacts(0);
    facts.reviews = new Set();
    const [day] = computeLedger(['2026-12-28'], facts, 15);
    expect(day.signed_off).toBe(false);
  });

  it('skips a signed-off date instead of planning writes into it', () => {
    const plan = buildBackfillPlan(
      {
        mode: 'range',
        employee_id: 1,
        dates: ['2026-12-28'],
        segments: [{ clock_in: '09:00', clock_out: '17:00' }],
        skip_leave: true,
      },
      reviewedFacts(0)
    );
    expect(plan.writes).toHaveLength(0);
    expect(plan.skippedDays).toEqual([
      {
        date: '2026-12-28',
        reason: 'signed_off',
        detail: 'the timesheet for this date has been signed off and is closed for writing',
      },
    ]);
  });

  it('skips a signed-off date in log_days too, where the calendar rules do not apply', () => {
    const plan = buildBackfillPlan(
      {
        mode: 'days',
        employee_id: 1,
        days: [{ date: '2026-12-28', segments: [{ clock_in: '09:00', clock_out: '17:00' }] }],
        skip_leave: true,
      },
      reviewedFacts(0)
    );
    expect(plan.writes).toHaveLength(0);
    expect(plan.skippedDays[0].reason).toBe('signed_off');
  });
});

describe('exclude_dates', () => {
  it('leaves excluded dates out and says they were excluded on purpose', () => {
    const days = new Map([
      ['2026-06-01', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 0 }],
      ['2026-06-02', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 0 }],
    ]);
    const facts: PlanFacts = {
      today: '2026-12-31',
      days,
      shifts: [],
      leaves: new Map(),
      reviews: new Set(),
    };
    const plan = buildBackfillPlan(
      {
        mode: 'range',
        employee_id: 1,
        dates: ['2026-06-01', '2026-06-02'],
        segments: [{ clock_in: '09:00', clock_out: '17:00' }],
        skip_leave: true,
        exclude_dates: ['2026-06-01'],
      },
      facts
    );
    expect(plan.writes.map(w => w.date)).toEqual(['2026-06-02']);
    expect(plan.skippedDays[0]).toEqual({
      date: '2026-06-01',
      reason: 'excluded',
      detail: 'listed in exclude_dates',
    });
  });

  it('takes priority over signed_off, since the caller explicitly asked to skip it', () => {
    const days = new Map([
      ['2026-06-01', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 0 }],
    ]);
    const facts: PlanFacts = {
      today: '2026-12-31',
      days,
      shifts: [],
      leaves: new Map(),
      reviews: new Set(['2026-06-01']),
    };
    const plan = buildBackfillPlan(
      {
        mode: 'range',
        employee_id: 1,
        dates: ['2026-06-01'],
        segments: [{ clock_in: '09:00', clock_out: '17:00' }],
        skip_leave: true,
        exclude_dates: ['2026-06-01'],
      },
      facts
    );
    expect(plan.skippedDays[0].reason).toBe('excluded');
  });

  it('has no effect in log_days mode, which has no calendar concept to exclude from', () => {
    const facts: PlanFacts = {
      today: '2026-12-31',
      days: new Map([
        ['2026-06-01', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 0 }],
      ]),
      shifts: [],
      leaves: new Map(),
      reviews: new Set(),
    };
    const plan = buildBackfillPlan(
      {
        mode: 'days',
        employee_id: 1,
        days: [{ date: '2026-06-01', segments: [{ clock_in: '09:00', clock_out: '17:00' }] }],
        skip_leave: true,
      },
      facts
    );
    expect(plan.writes.map(w => w.date)).toEqual(['2026-06-01']);
  });
});

describe('noun agreement in rendered counts (pluralisation sweep)', () => {
  it('formatCoverage uses the singular noun for every field at 1, and the plural otherwise', () => {
    const singular: FactsCoverage = {
      days_in_window: 1,
      days_with_contract_data: 1,
      first_uncovered: null,
      last_uncovered: null,
      leave_records: 1,
      shift_records: 1,
      review_records: 1,
      reviews_error: null,
    };
    expect(formatCoverage(singular)).toBe(
      'Data read: contract data for 1 of 1 day, 1 leave record, 1 shift record, 1 signed-off day.'
    );

    const plural: FactsCoverage = {
      days_in_window: 2,
      days_with_contract_data: 2,
      first_uncovered: null,
      last_uncovered: null,
      leave_records: 2,
      shift_records: 2,
      review_records: 2,
      reviews_error: null,
    };
    expect(formatCoverage(plural)).toBe(
      'Data read: contract data for 2 of 2 days, 2 leave records, 2 shift records, 2 signed-off days.'
    );
  });

  it('formatCoverage warns when signed-off dates could not be read, saying a plan may queue refused writes', () => {
    const coverage: FactsCoverage = {
      days_in_window: 1,
      days_with_contract_data: 1,
      first_uncovered: null,
      last_uncovered: null,
      leave_records: 0,
      shift_records: 0,
      review_records: 0,
      reviews_error: 'Forbidden',
    };
    const rendered = formatCoverage(coverage);
    expect(rendered).toContain('Signed-off dates could not be read (Forbidden)');
    expect(rendered).toMatch(/queue writes to dates that are actually signed off/);
    expect(rendered).toMatch(/refused by Factorial/);
  });

  it('says "Skipping 1 day" rather than "Skipping 1 days" when only one day is skipped', () => {
    const facts: PlanFacts = {
      today: '2026-12-31',
      days: new Map([
        ['2026-06-06', { day_type: 'saturday', expected_minutes: 0, tracked_minutes: 0 }],
        ['2026-06-08', { day_type: 'workday', expected_minutes: 480, tracked_minutes: 0 }],
      ]),
      shifts: [],
      leaves: new Map(),
      reviews: new Set(),
    };
    const request = {
      mode: 'range' as const,
      employee_id: 1,
      dates: ['2026-06-06', '2026-06-08'],
      segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      skip_leave: true,
    };
    const plan = buildBackfillPlan(request, facts);
    const text = formatPlanPreview(
      plan,
      { id: 1, name: 'X' },
      { start: '2026-06-06', end: '2026-06-08' },
      request
    );
    expect(text).toContain('Skipping 1 day:');
    expect(text).not.toContain('Skipping 1 days:');
  });

  it('agrees the variation and jitter minute count in the singular', () => {
    const facts = decemberFacts();
    const request = rangeRequest({ segments: [morning], variation_minutes: 1, jitter_minutes: 1 });
    const plan = buildBackfillPlan(request, facts);
    const text = formatPlanPreview(
      plan,
      { id: 2, name: 'Placeholder Person' },
      { start: '2026-12-21', end: '2026-12-31' },
      request
    );
    expect(text).toContain('up to 1 minute earlier or later than the pattern');
    expect(text).toContain('varies by up to 1 minute from the pattern');
    expect(text).not.toContain('1 minutes');
  });

  it('agrees "further day" in the singular when exactly one day is left off the overlap list', () => {
    const shifts = [];
    const days = new Map<
      string,
      { day_type: string; expected_minutes: number; tracked_minutes: number }
    >();
    // PREVIEW_SKIP_DAYS_MAX is 10, so 11 overlapping days leaves exactly one further day unlisted.
    for (let d = 1; d <= 11; d++) {
      const date = `2026-06-${String(d).padStart(2, '0')}`;
      days.set(date, { day_type: 'workday', expected_minutes: 480, tracked_minutes: 480 });
      shifts.push({ date, clock_in: '09:00', clock_out: '17:00' });
    }
    const facts: PlanFacts = {
      today: '2026-12-31',
      days,
      shifts,
      leaves: new Map(),
      reviews: new Set(),
    };
    const request = {
      mode: 'range' as const,
      employee_id: 1,
      dates: [...days.keys()],
      segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      skip_leave: true,
    };
    const text = formatPlanPreview(
      buildBackfillPlan(request, facts),
      { id: 1, name: 'X' },
      { start: '2026-06-01', end: '2026-06-11' },
      request
    );
    expect(text).toContain('1 further day not listed');
    expect(text).not.toContain('1 further days not listed');
  });
});
