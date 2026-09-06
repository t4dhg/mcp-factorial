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

export interface PlanFacts {
  /** Today's date, YYYY-MM-DD, in the zone the caller considers local */
  today: string;
  /** Per-date facts; a date missing from the map has no contract data */
  days: Map<string, DayFacts>;
  /** Existing shifts for the employee within the planned dates */
  shifts: ExistingShift[];
  /** Approved leave cover per date, see expandLeaves */
  leaves: Map<string, LeaveCover>;
}

export interface RangeRequest {
  mode: 'range';
  employee_id: number;
  dates: string[];
  segments: Segment[];
  skip_leave: boolean;
}

export interface DaysRequest {
  mode: 'days';
  employee_id: number;
  days: Array<{ date: string; segments: Segment[] }>;
  skip_leave: boolean;
}

export type PlanRequest = RangeRequest | DaysRequest;

export type SkipReason =
  | 'future_date'
  | 'weekend'
  | 'bank_holiday'
  | 'not_workable'
  | 'on_leave'
  | 'half_day_leave';

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
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const END_OF_DAY = 24 * 60;

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
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Date "${value}" must be YYYY-MM-DD`);
  }
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
    return { date, reason: 'future_date', detail: `today is ${facts.today}` };
  }
  const day = facts.days.get(date);
  if (request.mode === 'range') {
    if (day?.day_type === 'saturday' || day?.day_type === 'sunday') {
      return { date, reason: 'weekend' };
    }
    if (day?.day_type === 'bank_holiday') {
      return { date, reason: 'bank_holiday' };
    }
    if (!day || day.expected_minutes <= 0) {
      return {
        date,
        reason: 'not_workable',
        detail: day ? 'contract expects 0 minutes' : 'no contract data for this date',
      };
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
      const start = parseHHMM(shift.clock_in);
      const end = shift.clock_out === null ? END_OF_DAY : parseHHMM(shift.clock_out);
      const label = `${shift.clock_in}-${shift.clock_out ?? 'open'}`;
      return [start, Math.max(end, start), label];
    });
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
    for (const segment of segments) {
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

/** Stable digest of who and what a plan writes; the confirmation token is bound to it */
export function planFingerprint(employeeId: number, writes: PlannedWrite[]): string {
  const canonical = writes
    .map(w => `${w.date} ${w.clock_in} ${w.clock_out}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(`${employeeId}\n${canonical}`).digest('hex');
}

/** Workdays where the contract expects more than was tracked and no full-day leave applies */
export function computeGaps(facts: PlanFacts): Gap[] {
  const gaps: Gap[] = [];
  for (const [date, day] of [...facts.days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (day.day_type !== 'workday') continue;
    if (day.expected_minutes <= day.tracked_minutes) continue;
    const cover = facts.leaves.get(date);
    if (cover === 'full') continue;
    gaps.push({
      date,
      expected_minutes: day.expected_minutes,
      tracked_minutes: day.tracked_minutes,
      missing_minutes: day.expected_minutes - day.tracked_minutes,
      half_day_leave: cover ?? null,
    });
  }
  return gaps;
}

function hours(minutes: number): string {
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
  request: PlanRequest
): string {
  const lines: string[] = [];
  lines.push(`Plan for ${employee.name} (${employee.id})`);
  lines.push(`${range.start} .. ${range.end}`);
  lines.push('');
  lines.push(
    `  ${plan.totals.days} days to write, ${plan.totals.records} shift records, ${hours(plan.totals.minutes)}`
  );
  if (request.mode === 'range') {
    lines.push(`  ${request.segments.map(s => `${s.clock_in}-${s.clock_out}`).join(' and ')}`);
  }

  if (plan.skippedDays.length > 0) {
    lines.push('');
    lines.push(`  Skipping ${plan.skippedDays.length} days:`);
    const byReason = countBy(plan.skippedDays);
    const labels: Record<SkipReason, string> = {
      future_date: 'in the future',
      weekend: 'weekend',
      bank_holiday: 'bank holiday',
      not_workable: 'not workable under the contract',
      on_leave: 'approved leave',
      half_day_leave: 'half-day leave, write it with log_days if the other half was worked',
    };
    for (const [reason, count] of byReason) {
      const dates = plan.skippedDays.filter(d => d.reason === reason).map(d => d.date);
      const suffix = reason === 'weekend' ? '' : ` (${dates.join(', ')})`;
      lines.push(`    ${count} ${labels[reason]}${suffix}`);
    }
  }

  if (plan.skippedSegments.length > 0) {
    lines.push('');
    lines.push(`  Skipping ${plan.skippedSegments.length} segments that overlap existing shifts:`);
    for (const segment of plan.skippedSegments) {
      lines.push(`    ${segment.date} ${segment.clock_in}-${segment.clock_out} ${segment.detail}`);
    }
  }

  return lines.join('\n');
}
