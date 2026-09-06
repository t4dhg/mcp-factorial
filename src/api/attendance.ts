/**
 * Attendance API endpoints: shifts, open shifts, per-day summaries, clocking
 *
 * Verified against the live API on version 2026-07-01 (read-only, 2026-09-06):
 * - /attendance/shifts honours employee_ids[], start_on, end_on, ids[],
 *   updated_at, workable and half_day. It ignores employee_id (singular),
 *   clock_in_gte, clock_in_lte, page and limit, and returns every matching
 *   record with `paginateable: false`. Pagination is therefore client-side.
 * - Single-record GETs and every write return the record at the top level.
 * - estimated_times and worked_times require employee_ids[] and start_on.
 */

import {
  fetchList,
  fetchOne,
  postOne,
  patchOne,
  deleteOne,
  factorialRequest,
} from '../http-client.js';
import { cache } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
} from '../pagination.js';
import {
  ShiftSchema,
  OpenShiftSchema,
  EstimatedTimeSchema,
  WorkedTimeSchema,
  CreateShiftInputSchema,
  UpdateShiftInputSchema,
  ClockInputSchema,
  type Shift,
  type OpenShift,
  type EstimatedTime,
  type WorkedTime,
  type CreateShiftInput,
  type UpdateShiftInput,
  type ClockInput,
} from '../schemas.js';
import { parseData, parseArray } from '../schemas/shared.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';
import { NotFoundError, UnprocessableEntityError, ValidationError } from '../errors.js';
import type { ListShiftsOptions, DailyTimesOptions } from '../types.js';

/**
 * Format a Date as ISO 8601 with the offset of the machine running the server,
 * which is what the clock_in and clock_out endpoints expect in `now`.
 */
export function formatLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Today's date, YYYY-MM-DD, in the zone of the machine running the server */
export function localToday(now: Date = new Date()): string {
  return formatLocalIso(now).slice(0, 10);
}

/**
 * Factorial answers a shift write for a missing or invisible employee with
 * `404 El recurso no existe`, which points at the wrong thing entirely.
 */
function rewriteShiftWriteError(error: unknown, employeeId: number | undefined): never {
  if (error instanceof NotFoundError) {
    throw new Error(
      `Factorial answered 404 to the shift write. For this endpoint that means the employee ` +
        `(${employeeId ?? 'not provided'}) does not exist or is not visible to this API key, ` +
        'not that the shift endpoint is missing.'
    );
  }
  if (error instanceof UnprocessableEntityError || error instanceof ValidationError) {
    const message = error.message.toLowerCase();
    if (message.includes('approv') || message.includes('request') || message.includes('permi')) {
      throw new Error(
        `${error.message}\n\nThis tenant appears to require approval for attendance edits. ` +
          'Factorial offers an edit-timesheet-request flow (POST /attendance/edit_timesheet_requests) ' +
          'that a manager approves; this server does not implement it yet.'
      );
    }
  }
  throw error;
}

/**
 * List shifts. Refuses an unbounded query: with no date range, no ids and no
 * updated_at the endpoint returns every shift in the company (tens of
 * thousands of records on a real tenant).
 */
export async function listShifts(
  options: ListShiftsOptions = {}
): Promise<PaginatedResponse<Shift>> {
  const bounded =
    (options.start_on && options.end_on) ||
    (options.ids && options.ids.length > 0) ||
    options.updated_at;
  if (!bounded) {
    throw new Error(
      'Refusing to list shifts without bounds: pass start_on and end_on (YYYY-MM-DD), or ids, ' +
        'or updated_at. Factorial ignores page and limit on this endpoint and returns every ' +
        'shift in the company otherwise.'
    );
  }

  const params = buildPaginationParams(options);
  const shifts = await fetchList<unknown>(ENDPOINTS.shifts, {
    params: {
      employee_ids: options.employee_ids,
      start_on: options.start_on,
      end_on: options.end_on,
      ids: options.ids,
      updated_at: options.updated_at,
      workable: options.workable,
      half_day: options.half_day,
    },
  });

  const parsed = parseArray('Shift', ShiftSchema, shifts);
  return sliceForPagination(parsed, params);
}

/** All shifts for some employees in a date range, unpaginated and validated */
export async function listShiftsInRange(
  employeeIds: number[],
  startOn: string,
  endOn: string
): Promise<Shift[]> {
  const shifts = await fetchList<unknown>(ENDPOINTS.shifts, {
    params: { employee_ids: employeeIds, start_on: startOn, end_on: endOn },
  });
  return parseArray('Shift', ShiftSchema, shifts);
}

/** Get a specific shift by ID */
export async function getShift(id: number): Promise<Shift> {
  validateId(id, 'shift');
  const shift = await fetchOne<unknown>(endpointWithId(ENDPOINTS.shifts, id));
  return parseData('Shift', ShiftSchema, shift);
}

/**
 * Create a shift. `source` is always sent as `api`, so the record is
 * distinguishable from a live clock in Factorial's own activity log.
 */
export async function createShift(input: CreateShiftInput): Promise<Shift> {
  const body = CreateShiftInputSchema.parse(input);
  return auditedOperation(AuditAction.CREATE, 'shift', undefined, async () => {
    try {
      const shift = await postOne<unknown>(ENDPOINTS.shifts, { ...body, source: 'api' });
      cache.invalidatePrefix('shifts');
      return parseData('Shift', ShiftSchema, shift);
    } catch (error) {
      rewriteShiftWriteError(error, body.employee_id);
    }
  });
}

/** Update a shift */
export async function updateShift(id: number, input: UpdateShiftInput): Promise<Shift> {
  validateId(id, 'shift');
  const body = UpdateShiftInputSchema.parse(input);
  return auditedOperation(AuditAction.UPDATE, 'shift', id, async () => {
    const shift = await patchOne<unknown>(endpointWithId(ENDPOINTS.shifts, id), body);
    cache.invalidatePrefix('shifts');
    return parseData('Shift', ShiftSchema, shift);
  });
}

/** Delete a shift */
export async function deleteShift(id: number): Promise<void> {
  validateId(id, 'shift');
  return auditedOperation(AuditAction.DELETE, 'shift', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.shifts, id));
    cache.invalidatePrefix('shifts');
  });
}

/** Currently open shifts, optionally for one employee */
export async function listOpenShifts(employeeId?: number): Promise<OpenShift[]> {
  const data = await fetchList<unknown>(ENDPOINTS.openShifts, {
    params: { employee_ids: employeeId ? [employeeId] : undefined },
  });
  const parsed = parseArray('OpenShift', OpenShiftSchema, data);
  return employeeId ? parsed.filter(s => s.employee_id === String(employeeId)) : parsed;
}

/** Expected minutes per day from the weekly contract pattern */
export async function listEstimatedTimes(options: DailyTimesOptions): Promise<EstimatedTime[]> {
  const data = await fetchList<unknown>(ENDPOINTS.estimatedTimes, {
    params: {
      employee_ids: options.employee_ids,
      start_on: options.start_on,
      end_on: options.end_on,
    },
  });
  return parseArray('EstimatedTime', EstimatedTimeSchema, data);
}

/** Tracked minutes and day type per day; the holiday calendar surfaces here */
export async function listWorkedTimes(options: DailyTimesOptions): Promise<WorkedTime[]> {
  const data = await fetchList<unknown>(ENDPOINTS.workedTimes, {
    params: {
      employee_ids: options.employee_ids,
      start_on: options.start_on,
      end_on: options.end_on,
    },
  });
  return parseArray('WorkedTime', WorkedTimeSchema, data);
}

async function clockAction(
  action: 'clock_in' | 'clock_out',
  input: ClockInput,
  now: Date
): Promise<Shift> {
  const body = ClockInputSchema.parse(input);
  const endpoint = action === 'clock_in' ? ENDPOINTS.clockIn : ENDPOINTS.clockOut;
  return auditedOperation(AuditAction.CREATE, `shift_${action}`, undefined, async () => {
    try {
      const shift = await factorialRequest<unknown>(endpoint, {
        method: 'POST',
        body: { ...body, now: formatLocalIso(now) },
      });
      cache.invalidatePrefix('shifts');
      return parseData('Shift', ShiftSchema, shift);
    } catch (error) {
      rewriteShiftWriteError(error, body.employee_id);
    }
  });
}

/** Clock an employee in now */
export async function clockIn(input: ClockInput, now: Date = new Date()): Promise<Shift> {
  return clockAction('clock_in', input, now);
}

/** Clock an employee out now */
export async function clockOut(input: ClockInput, now: Date = new Date()): Promise<Shift> {
  return clockAction('clock_out', input, now);
}
