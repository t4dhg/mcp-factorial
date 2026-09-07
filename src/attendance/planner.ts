/**
 * Backfill planner for attendance shifts (registro horario).
 *
 * Everything in this module is pure: no network, no clock, no configuration.
 * The caller gathers facts from the API (worked_times, estimated_times,
 * existing shifts, approved leaves) and the planner turns them plus the
 * requested segments into an explicit list of writes and skips. Every rule is
 * a unit test in src/__tests__/unit/attendance/planner.test.ts.
 */

import { createHash } from 'node:crypto';

/**
 * Printed once on every attendance write result and preview.
 *
 * A backfilled record shows the real working day and hours on the attendance
 * sheet, while Factorial's own activity log shows it was entered later through
 * the API. Both are true at once, and neither can be altered through the API.
 * Saying so plainly stops a user believing either that the entry is hidden or
 * that the working time is wrong.
 */
export const ENTRY_TIME_NOTE =
  'Declared working time is the date, clock in and clock out above, and that is what the ' +
  'attendance sheet and the hour totals show. Separately, Factorial stamps created_at, ' +
  'updated_at and in_source/out_source with the moment and channel of entry; those are set by ' +
  'Factorial, are visible in its activity log, and cannot be set or changed through the API.';

/** A working segment on one day, in company local wall-clock time */
export interface Segment {
  clock_in: string;
  clock_out: string;
}

/** One planned shift record */
export interface PlannedWrite extends Segment {
  date: string;
}

/** What is known about one calendar day for one employee */
export interface DayFacts {
  /** worked_times.day_type: workday | saturday | sunday | bank_holiday */
  day_type: string;
  /** estimated_times.expected_minutes, from the contract pattern */
  expected_minutes: number;
  /** worked_times.tracked_minutes */
  tracked_minutes: number;
}

/** An existing shift as the API reports it; clock_out null means still open */
export interface ExistingShift {
  date: string;
  clock_in: string;
  clock_out: string | null;
}

/** How an approved leave covers a date */
export type LeaveCover = 'full' | 'beggining_of_day' | 'end_of_day';

/** The subset of a leave record the planner needs */
export interface LeaveLike {
  start_on: string;
  finish_on: string;
  half_day: string | null;
  approved: boolean | null;
  deleted_at: string | null;
}

/**
 * How much of the requested window the API actually returned data for. Printed
 * at the top of every audit, gaps and bulk-write preview so that a gap in the
 * data is visible before anyone reasons from it.
 */
export interface FactsCoverage {
  days_in_window: number;
  days_with_contract_data: number;
  /** First and last date in the window with no contract data, if any */
  first_uncovered: string | null;
  last_uncovered: string | null;
  leave_records: number;
  shift_records: number;
  review_records: number;
  /**
   * Set when the signed-off-dates read (listReviews) failed; review_records
   * is then 0 and facts.reviews is empty, not because nothing is signed off
   * but because it could not be read. Printed prominently: a plan built on
   * this may queue writes to dates that are actually signed off and will be
   * refused by Factorial.
   */
  reviews_error: string | null;
}

export interface PlanFacts {
  /** Today's date, YYYY-MM-DD, in the zone the caller considers local */
  today: string;
  /** Per-date facts; a date missing from the map has no contract data */
  days: Map<string, DayFacts>;
  /** Existing shifts for the employee within the planned dates */
  shifts: ExistingShift[];
  /** Approved leave cover per date, see expandLeaves */
  leaves: Map<string, LeaveCover>;
  /** Dates whose timesheet has been signed off; closed for writing */
  reviews: Set<string>;
  /** What the reads covered; absent when the facts were not read from the API */
  coverage?: FactsCoverage;
}

/** Measure how much of a date window the per-day facts cover */
export function measureCoverage(
  dates: string[],
  days: Map<string, DayFacts>,
  leaveRecords: number,
  shiftRecords: number,
  reviewRecords: number,
  reviewsError: string | null = null
): FactsCoverage {
  const uncovered = dates.filter(date => !days.has(date));
  return {
    days_in_window: dates.length,
    days_with_contract_data: dates.length - uncovered.length,
    first_uncovered: uncovered[0] ?? null,
    last_uncovered: uncovered.length > 0 ? uncovered[uncovered.length - 1] : null,
    leave_records: leaveRecords,
    shift_records: shiftRecords,
    review_records: reviewRecords,
    reviews_error: reviewsError,
  };
}

/** One line for the header of an audit, gaps or preview */
export function formatCoverage(coverage: FactsCoverage): string {
  const day = coverage.days_in_window === 1 ? 'day' : 'days';
  const leaveRecord = coverage.leave_records === 1 ? 'leave record' : 'leave records';
  const shiftRecord = coverage.shift_records === 1 ? 'shift record' : 'shift records';
  const signedOffDay = coverage.review_records === 1 ? 'signed-off day' : 'signed-off days';
  const base =
    `Data read: contract data for ${coverage.days_with_contract_data} of ${coverage.days_in_window} ${day}, ` +
    `${coverage.leave_records} ${leaveRecord}, ${coverage.shift_records} ${shiftRecord}, ` +
    `${coverage.review_records} ${signedOffDay}.`;
  const reviewsWarning = coverage.reviews_error
    ? ` Signed-off dates could not be read (${coverage.reviews_error}); none are known here, so a ` +
      'plan below may queue writes to dates that are actually signed off and will be refused by ' +
      'Factorial.'
    : '';
  if (coverage.days_with_contract_data === coverage.days_in_window)
    return `${base}${reviewsWarning}`;
  return (
    `${base} Days without contract data (${coverage.first_uncovered} to ${coverage.last_uncovered}) ` +
    'are reported as no_contract_data and are never written; they usually precede the start of ' +
    `employment. If that is not the case here, the read is incomplete and the result must not be trusted.${reviewsWarning}`
  );
}

export interface RangeRequest {
  mode: 'range';
  employee_id: number;
  dates: string[];
  segments: Segment[];
  skip_leave: boolean;
  /** Vary each written time by up to this many minutes, deterministically per record */
  jitter_minutes?: number;
  /** Shift each whole day by up to this many minutes, deterministically per day */
  variation_minutes?: number;
  /** Dates inside the range to leave alone, for days not worked */
  exclude_dates?: string[];
}

export interface DaysRequest {
  mode: 'days';
  employee_id: number;
  days: Array<{ date: string; segments: Segment[] }>;
  skip_leave: boolean;
  /** Vary each written time by up to this many minutes, deterministically per record */
  jitter_minutes?: number;
  /** Shift each whole day by up to this many minutes, deterministically per day */
  variation_minutes?: number;
}

export type PlanRequest = RangeRequest | DaysRequest;

export type SkipReason =
  | 'future_date'
  | 'weekend'
  | 'bank_holiday'
  | 'not_workable'
  | 'no_contract_data'
  | 'on_leave'
  | 'half_day_leave'
  | 'signed_off'
  | 'excluded';

export interface SkippedDay {
  date: string;
  reason: SkipReason;
  detail?: string;
}

export interface SkippedSegment extends Segment {
  date: string;
  reason: 'overlaps_existing';
  detail: string;
}

export interface BackfillPlan {
  writes: PlannedWrite[];
  skippedDays: SkippedDay[];
  skippedSegments: SkippedSegment[];
  totals: { days: number; records: number; minutes: number };
}

export interface Gap {
  date: string;
  expected_minutes: number;
  tracked_minutes: number;
  missing_minutes: number;
  half_day_leave: 'beggining_of_day' | 'end_of_day' | null;
  /**
   * The timesheet for this date has been signed off and is closed for
   * writing. log_range and log_days both skip it (daySkipReason's signed_off
   * rule); only create_edit_request can reach it. Still reported as a gap,
   * since the hours are genuinely missing, but the caller must not be told
   * to fill it the same way as an open date.
   */
  signed_off: boolean;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const END_OF_DAY = 24 * 60;

/**
 * A day whose tracked minutes are within this distance of the expected minutes
 * counts as complete. Real clock-ins are never exact, and jittered backfills
 * are deliberately not, so a strict comparison would flag nearly every day.
 */
export const DEFAULT_TOLERANCE_MINUTES = 15;

/** A preview lists every record up to this many; above it, the first and last few */
export const PREVIEW_FULL_LIST_MAX = 62;
const PREVIEW_HEAD = 20;
const PREVIEW_TAIL = 10;
/** Days named individually in the overlap-skip summary before it gives a count */
const PREVIEW_SKIP_DAYS_MAX = 10;

/** Parse "HH:MM" into minutes since midnight; anything else is rejected */
export function parseHHMM(value: string): number {
  const match = HHMM.exec(value);
  if (!match) {
    throw new Error(`Time "${value}" must be HH:MM in 24-hour company local time`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when two [start, end) intervals share any time; touching does not count */
export function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function assertDate(value: string): void {
  const match = DATE.exec(value);
  const parsed = match ? Date.parse(`${value}T00:00:00Z`) : NaN;
  if (!match || Number.isNaN(parsed)) {
    throw new Error(`Date "${value}" must be YYYY-MM-DD`);
  }
  // Date.parse silently rolls an impossible date (2026-02-30) over into the
  // next valid one (2026-03-02). A rolled-over date must be rejected, not
  // written to a different day than the caller typed: reparse the accepted
  // instant and compare it against the three numbers actually given.
  const rolled = new Date(parsed);
  const [year, month, day] = value.split('-').map(Number);
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    throw new Error(`Date "${value}" does not exist`);
  }
}

/**
 * Turn a company-local day and wall-clock time into a Date in the zone the
 * server runs in, which is the zone `formatLocalIso` stamps an offset from.
 *
 * This exists so a person who forgot to clock can say when they actually
 * started or stopped. The declared moment is what Factorial records as the
 * working time; the moment of the API call is recorded separately by Factorial
 * as created_at and cannot be set through the API.
 */
export function declaredMoment(date: string, time: string): Date {
  assertDate(date);
  const minutes = parseHHMM(time);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

/** Every date from start to end inclusive */
export function enumerateDates(start: string, end: string): string[] {
  assertDate(start);
  assertDate(end);
  if (start > end) {
    throw new Error(`start_on ${start} is after end_on ${end}`);
  }
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Validate the segments of one day: HH:MM only, clock_in strictly before
 * clock_out, no overnight shifts, no overlap between segments.
 */
export function validateSegments(segments: Segment[]): void {
  if (segments.length === 0) {
    throw new Error('segments must contain at least one {clock_in, clock_out} entry');
  }
  const intervals = segments.map(segment => {
    const start = parseHHMM(segment.clock_in);
    const end = parseHHMM(segment.clock_out);
    if (end < start) {
      throw new Error(
        `Segment ${segment.clock_in}-${segment.clock_out} ends before it starts. Overnight shifts ` +
          'are not supported by the bulk actions; use the create action with reference_date instead.'
      );
    }
    if (end === start) {
      throw new Error(
        `Segment ${segment.clock_in}-${segment.clock_out}: clock_in must be before clock_out`
      );
    }
    return [start, end] as [number, number];
  });
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      if (intervalsOverlap(intervals[i], intervals[j])) {
        throw new Error(
          `Segments ${segments[i].clock_in}-${segments[i].clock_out} and ` +
            `${segments[j].clock_in}-${segments[j].clock_out} overlap each other`
        );
      }
    }
  }
}

/**
 * Turn leave records into a per-date cover map. Only approved, undeleted
 * leaves count; a pending (approved: null) or rejected leave does not block
 * anything. A later leave over the same date never downgrades a full cover.
 */
export function expandLeaves(leaves: LeaveLike[]): Map<string, LeaveCover> {
  const cover = new Map<string, LeaveCover>();
  for (const leave of leaves) {
    if (leave.approved !== true || leave.deleted_at !== null) continue;
    const kind: LeaveCover =
      leave.half_day === 'beggining_of_day' || leave.half_day === 'end_of_day'
        ? leave.half_day
        : 'full';
    for (const date of enumerateDates(leave.start_on, leave.finish_on)) {
      const existing = cover.get(date);
      if (existing === 'full') continue;
      cover.set(date, kind);
    }
  }
  return cover;
}

function daySkipReason(date: string, request: PlanRequest, facts: PlanFacts): SkippedDay | null {
  if (date > facts.today) {
    return {
      date,
      reason: 'future_date',
      detail: `today is ${facts.today} in the zone of the machine running the server`,
    };
  }
  if (request.mode === 'range' && request.exclude_dates?.includes(date)) {
    return { date, reason: 'excluded', detail: 'listed in exclude_dates' };
  }
  // Applies in both modes. A signed-off date refuses a write whatever the
  // calendar says about it, so log_days must not bypass this the way it
  // deliberately bypasses the weekend and holiday rules.
  if (facts.reviews.has(date)) {
    return {
      date,
      reason: 'signed_off',
      detail: 'the timesheet for this date has been signed off and is closed for writing',
    };
  }
  const day = facts.days.get(date);
  if (request.mode === 'range') {
    if (day?.day_type === 'saturday' || day?.day_type === 'sunday') {
      return { date, reason: 'weekend' };
    }
    if (day?.day_type === 'bank_holiday') {
      return { date, reason: 'bank_holiday' };
    }
    // A date the API said nothing about is not a fact about the contract, so
    // it gets its own reason: the planner must never present a gap in the
    // data as a day that was not workable.
    if (!day) {
      return {
        date,
        reason: 'no_contract_data',
        detail: 'neither worked_times nor estimated_times returned this date',
      };
    }
    if (day.expected_minutes <= 0) {
      return { date, reason: 'not_workable', detail: 'contract expects 0 minutes' };
    }
  }
  if (request.skip_leave) {
    const cover = facts.leaves.get(date);
    if (cover === 'full') {
      return { date, reason: 'on_leave', detail: 'approved leave' };
    }
    if (cover && request.mode === 'range') {
      return {
        date,
        reason: 'half_day_leave',
        detail: `approved half-day leave (${cover}); write it with log_days if the other half was worked`,
      };
    }
  }
  return null;
}

function existingIntervals(shifts: ExistingShift[], date: string): Array<[number, number, string]> {
  return shifts
    .filter(shift => shift.date === date)
    .map(shift => {
      let start: number;
      let end: number;
      try {
        start = parseHHMM(shift.clock_in);
        end = shift.clock_out === null ? END_OF_DAY : parseHHMM(shift.clock_out);
      } catch {
        throw new Error(
          `An existing shift on ${date} has times the planner cannot read ` +
            `(${shift.clock_in}-${shift.clock_out ?? 'open'}). Fix or delete that record first.`
        );
      }
      // An overnight existing shift (clock_out before clock_in) occupies to end of day.
      if (end < start) end = END_OF_DAY;
      const label = `${shift.clock_in}-${shift.clock_out ?? 'open'}`;
      return [start, end, label];
    });
}

function formatHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(END_OF_DAY - 1, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Deterministic integer in [-magnitude, magnitude] derived from the record's identity */
function deterministicOffset(seed: string, magnitude: number): number {
  if (magnitude <= 0) return 0;
  const digest = createHash('sha256').update(seed).digest();
  const value = digest.readUInt32BE(0) % (2 * magnitude + 1);
  return value - magnitude;
}

/**
 * Apply per-record variation to a day's segments. Nobody clocks in at exactly
 * 09:00 every day, so a month of identical times is the one pattern a real
 * registro never shows. The variation is derived from a hash of the employee,
 * the date and the segment, so re-planning the same request yields the same
 * times: the preview shows exactly what will be written, the confirmation
 * token binds to it, and a retry after a partial failure recognises its own
 * earlier writes. Segments never cross each other or midnight.
 *
 * Both ends of a segment move by the same offset, so the day's total is
 * unchanged and an audit of a jittered backfill reads complete at any
 * tolerance. Only where a segment would otherwise run into its neighbour or
 * past midnight is an end clamped, and then that segment shrinks by at most
 * the magnitude.
 */
export function jitterSegments(
  employeeId: number,
  date: string,
  segments: Segment[],
  magnitude: number
): Segment[] {
  if (magnitude <= 0) return segments;
  const ordered = [...segments].sort((a, b) => parseHHMM(a.clock_in) - parseHHMM(b.clock_in));
  const result: Segment[] = [];
  let previousEnd = -Infinity;
  ordered.forEach((segment, index) => {
    const baseStart = parseHHMM(segment.clock_in);
    const baseEnd = parseHHMM(segment.clock_out);
    const nextStart =
      index + 1 < ordered.length ? parseHHMM(ordered[index + 1].clock_in) : Infinity;
    const offset = deterministicOffset(`${employeeId}|${date}|${index}`, magnitude);
    let start = baseStart + offset;
    let end = baseEnd + offset;
    // Never start before the previous segment ended, never end after the next one may start.
    start = Math.max(start, previousEnd, 0);
    end = Math.min(end, nextStart - magnitude - 1, END_OF_DAY - 1);
    if (end <= start) {
      start = baseStart;
      end = baseEnd;
    }
    previousEnd = end;
    result.push({ clock_in: formatHHMM(start), clock_out: formatHHMM(end) });
  });
  return result;
}

/**
 * Shift a whole day by one offset, so the start time drifts from day to day.
 *
 * This is the variation `jitter_minutes` cannot produce. Jitter moves each
 * segment of a day independently around the pattern, which varies the shape of
 * a day but leaves every day starting near the same time. Reconstructed
 * records that all begin at 09:00 give themselves away; this moves the whole
 * day together, so the pattern within it survives intact.
 *
 * Deterministic from the employee and the date, so the preview, the token and
 * any retry all agree. Compose it before jitter, never after.
 */
export function varySegments(
  employeeId: number,
  date: string,
  segments: Segment[],
  magnitude: number
): Segment[] {
  if (magnitude <= 0) return segments;
  const ordered = [...segments].sort((a, b) => parseHHMM(a.clock_in) - parseHHMM(b.clock_in));
  const offset = deterministicOffset(`variation|${employeeId}|${date}`, magnitude);
  const earliest = parseHHMM(ordered[0].clock_in);
  const latest = parseHHMM(ordered[ordered.length - 1].clock_out);
  // Clamp the whole day rather than any single segment, so the offset stays
  // uniform and no segment changes length.
  const applied = Math.max(-earliest, Math.min(offset, END_OF_DAY - 1 - latest));
  return ordered.map(segment => ({
    clock_in: formatHHMM(parseHHMM(segment.clock_in) + applied),
    clock_out: formatHHMM(parseHHMM(segment.clock_out) + applied),
  }));
}

/**
 * Build the plan. Skip reasons are evaluated in the documented order and the
 * first match wins. Explicit days skip the weekday, holiday and workability
 * rules on purpose: migration must be able to write a Saturday someone worked.
 */
export function buildBackfillPlan(request: PlanRequest, facts: PlanFacts): BackfillPlan {
  const requested: Array<{ date: string; segments: Segment[] }> =
    request.mode === 'range'
      ? request.dates.map(date => ({ date, segments: request.segments }))
      : request.days;

  if (request.mode === 'range') {
    validateSegments(request.segments);
  } else {
    const seen = new Set<string>();
    for (const day of request.days) {
      assertDate(day.date);
      if (seen.has(day.date)) {
        throw new Error(`Date ${day.date} appears more than once in days`);
      }
      seen.add(day.date);
      validateSegments(day.segments);
    }
  }

  const writes: PlannedWrite[] = [];
  const skippedDays: SkippedDay[] = [];
  const skippedSegments: SkippedSegment[] = [];
  const writtenDates = new Set<string>();
  let minutes = 0;

  for (const { date, segments } of requested) {
    const skip = daySkipReason(date, request, facts);
    if (skip) {
      skippedDays.push(skip);
      continue;
    }
    const existing = existingIntervals(facts.shifts, date);
    // Variation moves the whole day; jitter then varies segments inside it.
    const varied = varySegments(
      request.employee_id,
      date,
      segments,
      request.variation_minutes ?? 0
    );
    const planned = jitterSegments(request.employee_id, date, varied, request.jitter_minutes ?? 0);
    for (const segment of planned) {
      const interval: [number, number] = [
        parseHHMM(segment.clock_in),
        parseHHMM(segment.clock_out),
      ];
      const clash = existing.find(([start, end]) => intervalsOverlap(interval, [start, end]));
      if (clash) {
        skippedSegments.push({
          date,
          ...segment,
          reason: 'overlaps_existing',
          detail: `overlaps existing ${clash[2]}`,
        });
        continue;
      }
      writes.push({ date, ...segment });
      writtenDates.add(date);
      minutes += interval[1] - interval[0];
    }
  }

  return {
    writes,
    skippedDays,
    skippedSegments,
    totals: { days: writtenDates.size, records: writes.length, minutes },
  };
}

/**
 * Stable digest of who and what a plan writes, including the note stored on
 * every record; the confirmation token is bound to it.
 */
export function planFingerprint(
  employeeId: number,
  writes: PlannedWrite[],
  observations?: string
): string {
  const canonical = writes
    .map(w => `${w.date} ${w.clock_in} ${w.clock_out}`)
    .sort()
    .join('\n');
  return createHash('sha256')
    .update(`${employeeId}\n${observations ?? ''}\n${canonical}`)
    .digest('hex');
}

/**
 * Workdays up to today where the contract expects more than was tracked and no
 * full-day leave applies. Future dates are left out, since log_range would
 * refuse them anyway.
 */
export function computeGaps(facts: PlanFacts, toleranceMinutes = DEFAULT_TOLERANCE_MINUTES): Gap[] {
  const gaps: Gap[] = [];
  for (const [date, day] of [...facts.days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (date > facts.today) continue;
    if (day.day_type !== 'workday') continue;
    if (day.expected_minutes - day.tracked_minutes <= toleranceMinutes) continue;
    const cover = facts.leaves.get(date);
    if (cover === 'full') continue;
    gaps.push({
      date,
      expected_minutes: day.expected_minutes,
      tracked_minutes: day.tracked_minutes,
      missing_minutes: day.expected_minutes - day.tracked_minutes,
      half_day_leave: cover ?? null,
      signed_off: facts.reviews.has(date),
    });
  }
  return gaps;
}

export type LedgerStatus =
  | 'future'
  | 'weekend'
  | 'bank_holiday'
  | 'not_workable'
  | 'no_contract_data'
  | 'on_leave'
  | 'half_day_leave'
  | 'complete'
  | 'missing'
  | 'short'
  | 'over';

export interface LedgerDay {
  date: string;
  day_type: string | null;
  expected_minutes: number;
  tracked_minutes: number;
  leave: LeaveCover | null;
  shifts: Array<{ clock_in: string; clock_out: string | null; minutes: number | null }>;
  status: LedgerStatus;
  /** The timesheet for this date has been signed off; it is closed for writing */
  signed_off: boolean;
  /** tracked minus expected; negative means hours are missing */
  delta_minutes: number;
}

/**
 * One row per calendar day in the range, with everything the planner knows
 * about it, for auditing what was clocked against what the contract, the
 * company calendar and the leave record say should have been.
 */
export function computeLedger(
  dates: string[],
  facts: PlanFacts,
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES
): LedgerDay[] {
  return dates.map(date => {
    const day = facts.days.get(date);
    const leave = facts.leaves.get(date) ?? null;
    const shifts = facts.shifts
      .filter(s => s.date === date)
      .sort((a, b) => a.clock_in.localeCompare(b.clock_in))
      .map(s => ({
        clock_in: s.clock_in,
        clock_out: s.clock_out,
        minutes: s.clock_out === null ? null : parseHHMM(s.clock_out) - parseHHMM(s.clock_in),
      }));
    const expected = day?.expected_minutes ?? 0;
    const tracked = day?.tracked_minutes ?? 0;
    let status: LedgerStatus;
    if (date > facts.today) status = 'future';
    else if (!day) status = 'no_contract_data';
    else if (day?.day_type === 'saturday' || day?.day_type === 'sunday') status = 'weekend';
    else if (day?.day_type === 'bank_holiday') status = 'bank_holiday';
    else if (leave === 'full') status = 'on_leave';
    else if (leave) status = 'half_day_leave';
    else if (expected <= 0) status = 'not_workable';
    else if (expected - tracked > toleranceMinutes) status = tracked === 0 ? 'missing' : 'short';
    else if (tracked - expected > toleranceMinutes) status = 'over';
    else status = 'complete';
    return {
      date,
      day_type: day?.day_type ?? null,
      expected_minutes: expected,
      tracked_minutes: tracked,
      leave,
      shifts,
      status,
      signed_off: facts.reviews.has(date),
      delta_minutes: tracked - expected,
    };
  });
}

/** 720 -> "12h", 750 -> "12h30" */
export function hours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${whole}h` : `${whole}h${String(rest).padStart(2, '0')}`;
}

function countBy<T extends string>(items: Array<{ reason: T }>): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  return counts;
}

/**
 * Render the plan the way the confirmation step shows it. It always names the
 * person, because the company-wide key makes writing someone else's hours the
 * mistake worth catching.
 */
export function formatPlanPreview(
  plan: BackfillPlan,
  employee: { id: number; name: string },
  range: { start: string; end: string },
  request: PlanRequest,
  observations?: string,
  coverage?: FactsCoverage
): string {
  const lines: string[] = [];
  // The coverage line goes first, as it does in an audit. A result that is
  // truncated or spilled to a file still shows what the plan was based on.
  if (coverage) {
    lines.push(formatCoverage(coverage));
    lines.push('');
  }
  lines.push(`Plan for ${employee.name} (${employee.id})`);
  lines.push(`${range.start} .. ${range.end}`);
  lines.push('');
  const totalsDay = plan.totals.days === 1 ? 'day' : 'days';
  const totalsRecord = plan.totals.records === 1 ? 'shift record' : 'shift records';
  lines.push(
    `  ${plan.totals.days} ${totalsDay} to write, ${plan.totals.records} ${totalsRecord}, ${hours(plan.totals.minutes)}`
  );
  if (request.mode === 'range') {
    lines.push(`  ${request.segments.map(s => `${s.clock_in}-${s.clock_out}`).join(' and ')}`);
  }
  if (observations) {
    lines.push(`  Note on every record: "${observations}"`);
  }
  if (request.variation_minutes && request.variation_minutes > 0) {
    const variationMinute = request.variation_minutes === 1 ? 'minute' : 'minutes';
    lines.push(
      `  Each day starts up to ${request.variation_minutes} ${variationMinute} earlier or later than the pattern, the whole day moving together (fixed per day, listed below).`
    );
  }
  if (request.jitter_minutes && request.jitter_minutes > 0) {
    const jitterMinute = request.jitter_minutes === 1 ? 'minute' : 'minutes';
    lines.push(
      `  Each time varies by up to ${request.jitter_minutes} ${jitterMinute} from the pattern (fixed per record, listed below).`
    );
  }
  if (plan.writes.length > 0) {
    lines.push('');
    lines.push('  Records to write:');
    const record = (w: PlannedWrite) => `    ${w.date} ${w.clock_in}-${w.clock_out}`;
    if (plan.writes.length <= PREVIEW_FULL_LIST_MAX) {
      for (const w of plan.writes) lines.push(record(w));
    } else {
      // Enough to check the pattern and the jitter at both ends without
      // drowning the preview; the token binds to every record regardless.
      const head = plan.writes.slice(0, PREVIEW_HEAD);
      const tail = plan.writes.slice(-PREVIEW_TAIL);
      const hidden = plan.writes.length - head.length - tail.length;
      for (const w of head) lines.push(record(w));
      lines.push(
        `    ... ${hidden} more record${hidden === 1 ? '' : 's'} not listed; the confirmation token binds to all of them ...`
      );
      for (const w of tail) lines.push(record(w));
    }
  }

  if (plan.skippedDays.length > 0) {
    lines.push('');
    lines.push(
      `  Skipping ${plan.skippedDays.length} day${plan.skippedDays.length === 1 ? '' : 's'}:`
    );
    const byReason = countBy(plan.skippedDays);
    const labels: Record<SkipReason, string> = {
      future_date: 'in the future',
      weekend: 'weekend',
      bank_holiday: 'bank holiday',
      not_workable: 'not workable under the contract',
      no_contract_data:
        'without contract data in Factorial for the date (not written; usually before the start of employment)',
      on_leave: 'approved leave',
      half_day_leave: 'half-day leave, write it with log_days if the other half was worked',
      signed_off:
        'signed off in Factorial and closed for writing (ask the approver to reopen, or file an edit request)',
      excluded: 'excluded by the caller',
    };
    for (const [reason, count] of byReason) {
      const dates = plan.skippedDays.filter(d => d.reason === reason).map(d => d.date);
      const suffix = reason === 'weekend' ? '' : ` (${dates.join(', ')})`;
      lines.push(`    ${count} ${labels[reason]}${suffix}`);
    }
  }

  if (plan.skippedSegments.length > 0) {
    const byDate = new Map<string, number>();
    for (const segment of plan.skippedSegments) {
      byDate.set(segment.date, (byDate.get(segment.date) ?? 0) + 1);
    }
    lines.push('');
    const segmentCount = plan.skippedSegments.length;
    const dayCount = byDate.size;
    lines.push(
      `  ${segmentCount} segment${segmentCount === 1 ? '' : 's'} on ${dayCount} day${dayCount === 1 ? '' : 's'} overlap existing shifts and are skipped:`
    );
    const dates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [date, count] of dates.slice(0, PREVIEW_SKIP_DAYS_MAX)) {
      lines.push(`    ${date}  ${count} segment${count === 1 ? '' : 's'} already covered`);
    }
    if (dates.length > PREVIEW_SKIP_DAYS_MAX) {
      const further = dates.length - PREVIEW_SKIP_DAYS_MAX;
      lines.push(
        `    ... ${further} further day${further === 1 ? '' : 's'} not listed; run audit with format: "table" to see them all ...`
      );
    }
  }

  if (plan.writes.length > 0) {
    lines.push('');
    lines.push(ENTRY_TIME_NOTE);
  }

  return lines.join('\n');
}
