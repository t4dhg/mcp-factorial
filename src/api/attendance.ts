/**
 * Attendance API endpoints: Shifts
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne } from '../http-client.js';
import { buildPaginationParams, paginateResponse, type PaginatedResponse } from '../pagination.js';
import type { Shift, CreateShiftInput, UpdateShiftInput } from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';
import type { ListShiftsOptions } from '../types.js';

/**
 * List shifts with optional filtering
 */
export async function listShifts(options?: ListShiftsOptions): Promise<PaginatedResponse<Shift>> {
  const params = buildPaginationParams(options);

  const queryParams: Record<string, string | number | undefined> = {
    page: params.page,
    limit: params.limit,
  };

  if (options?.employee_id) queryParams.employee_id = options.employee_id;
  if (options?.clock_in_gte) queryParams.clock_in_gte = options.clock_in_gte;
  if (options?.clock_in_lte) queryParams.clock_in_lte = options.clock_in_lte;

  const shifts = await fetchList<Shift>(ENDPOINTS.shifts, { params: queryParams });

  return paginateResponse(shifts, params.page, params.limit);
}

/**
 * Get a specific shift by ID
 */
export async function getShift(id: number): Promise<Shift> {
  validateId(id, 'shift');

  return fetchOne<Shift>(endpointWithId(ENDPOINTS.shifts, id));
}

/**
 * Create a new shift
 */
export async function createShift(input: CreateShiftInput): Promise<Shift> {
  return auditedOperation(AuditAction.CREATE, 'shift', undefined, async () => {
    const shift = await postOne<Shift>(ENDPOINTS.shifts, input);
    return shift;
  });
}

/**
 * Update a shift
 */
export async function updateShift(id: number, input: UpdateShiftInput): Promise<Shift> {
  validateId(id, 'shift');

  return auditedOperation(AuditAction.UPDATE, 'shift', id, async () => {
    const shift = await patchOne<Shift>(endpointWithId(ENDPOINTS.shifts, id), input);
    return shift;
  });
}

/**
 * Delete a shift
 */
export async function deleteShift(id: number): Promise<void> {
  validateId(id, 'shift');

  return auditedOperation(AuditAction.DELETE, 'shift', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.shifts, id));
  });
}
