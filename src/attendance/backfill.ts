/**
 * Gathers facts, plans, and executes bulk shift entry.
 *
 * The planner in planner.ts is pure; this module is the impure shell around
 * it: it reads worked_times, estimated_times, existing shifts and leaves,
 * writes the planned records one POST at a time, and invalidates the shift
 * cache before planning and after writing whatever happened in between.
 */

import { cache } from '../cache.js';
import {
  createShift,
  listEstimatedTimes,
  listShiftsInRange,
  listWorkedTimes,
  localToday,
} from '../api/attendance.js';
import { listLeaves } from '../api/time-off.js';
import {
  buildBackfillPlan,
  computeGaps,
  expandLeaves,
  type BackfillPlan,
  type DayFacts,
  type Gap,
  type PlanFacts,
  type PlanRequest,
  type PlannedWrite,
} from './planner.js';

/** Read everything the planner needs for one employee and date window */
export async function gatherFacts(
  employeeId: number,
  startOn: string,
  endOn: string,
  now: Date = new Date()
): Promise<PlanFacts> {
  // A plan must never reason from a shift list older than the call. None of
  // the reads below is cached today; this keeps that true if one becomes so.
  cache.invalidatePrefix('shifts');

  const range = { employee_ids: [employeeId], start_on: startOn, end_on: endOn };
  const [worked, estimated, shifts, leaves] = await Promise.all([
    listWorkedTimes(range),
    listEstimatedTimes(range),
    listShiftsInRange([employeeId], startOn, endOn),
    listLeaves({ employee_ids: [employeeId], from: startOn, to: endOn, limit: 100 }),
  ]);

  const days = new Map<string, DayFacts>();
  for (const day of worked) {
    days.set(day.date, {
      day_type: day.day_type,
      expected_minutes: 0,
      tracked_minutes: day.tracked_minutes,
    });
  }
  for (const day of estimated) {
    const existing = days.get(day.date);
    if (existing) {
      existing.expected_minutes = day.expected_minutes;
    } else {
      days.set(day.date, {
        day_type: 'workday',
        expected_minutes: day.expected_minutes,
        tracked_minutes: 0,
      });
    }
  }

  return {
    today: localToday(now),
    days,
    shifts: shifts
      .filter(s => s.clock_in !== null)
      .map(s => ({ date: s.date, clock_in: s.clock_in as string, clock_out: s.clock_out })),
    leaves: expandLeaves(leaves.data),
  };
}

/** Plan without writing */
export async function planBackfill(
  request: PlanRequest,
  startOn: string,
  endOn: string
): Promise<{ plan: BackfillPlan; facts: PlanFacts }> {
  const facts = await gatherFacts(request.employee_id, startOn, endOn);
  return { plan: buildBackfillPlan(request, facts), facts };
}

/** Workdays where the contract expects more than was tracked */
export async function findGaps(employeeId: number, startOn: string, endOn: string): Promise<Gap[]> {
  const facts = await gatherFacts(employeeId, startOn, endOn);
  return computeGaps(facts);
}

export interface BackfillResult {
  written: PlannedWrite[];
  failed: Array<PlannedWrite & { error: string }>;
}

/**
 * Write the planned records sequentially. Stops at the first failure so the
 * summary can say exactly where it stopped; re-running the identical call is
 * safe because the planner re-reads shifts and skips what already exists.
 */
export async function executeBackfill(
  employeeId: number,
  writes: PlannedWrite[],
  observations?: string
): Promise<BackfillResult> {
  const result: BackfillResult = { written: [], failed: [] };
  try {
    for (const write of writes) {
      try {
        await createShift({
          employee_id: employeeId,
          date: write.date,
          clock_in: write.clock_in,
          clock_out: write.clock_out,
          observations,
        });
        result.written.push(write);
      } catch (error) {
        result.failed.push({
          ...write,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  } finally {
    cache.invalidatePrefix('shifts');
  }
  return result;
}

/** The dates a request spans, for the preview header */
export function requestWindow(request: PlanRequest): { start: string; end: string } {
  const dates = request.mode === 'range' ? request.dates : request.days.map(d => d.date);
  const sorted = [...dates].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}
