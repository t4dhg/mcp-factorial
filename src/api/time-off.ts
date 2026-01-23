/**
 * Time Off API endpoints: Leaves, Leave Types, Allowances
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne, postAction } from '../http-client.js';
import { cached, CACHE_TTL } from '../cache.js';
import { buildPaginationParams, paginateResponse, type PaginatedResponse } from '../pagination.js';
import type {
  Leave,
  LeaveType,
  Allowance,
  CreateLeaveInput,
  UpdateLeaveInput,
  LeaveDecisionInput,
} from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId, endpointWithAction } from '../endpoints.js';
import type { ListLeavesOptions, ListAllowancesOptions } from '../types.js';

/**
 * List leaves with optional filtering
 */
export async function listLeaves(options?: ListLeavesOptions): Promise<PaginatedResponse<Leave>> {
  const params = buildPaginationParams(options);

  const queryParams: Record<string, string | number | undefined> = {
    page: params.page,
    limit: params.limit,
  };

  if (options?.employee_id) queryParams.employee_id = options.employee_id;
  if (options?.status) queryParams.status = options.status;
  if (options?.start_on_gte) queryParams.start_on_gte = options.start_on_gte;
  if (options?.start_on_lte) queryParams.start_on_lte = options.start_on_lte;

  const leaves = await fetchList<Leave>(ENDPOINTS.leaves, { params: queryParams });

  return paginateResponse(leaves, params.page, params.limit);
}

/**
 * Get a specific leave by ID
 */
export async function getLeave(id: number): Promise<Leave> {
  validateId(id, 'leave');

  return fetchOne<Leave>(endpointWithId(ENDPOINTS.leaves, id));
}

/**
 * List all leave types
 */
export async function listLeaveTypes(): Promise<LeaveType[]> {
  return cached(
    'leave-types:all',
    () => fetchList<LeaveType>(ENDPOINTS.leaveTypes),
    CACHE_TTL.leaves
  );
}

/**
 * Get a specific leave type by ID
 */
export async function getLeaveType(id: number): Promise<LeaveType> {
  validateId(id, 'leave type');

  return fetchOne<LeaveType>(endpointWithId(ENDPOINTS.leaveTypes, id));
}

/**
 * List allowances with optional filtering by employee
 */
export async function listAllowances(
  options?: ListAllowancesOptions
): Promise<PaginatedResponse<Allowance>> {
  const params = buildPaginationParams(options);

  const queryParams: Record<string, string | number | undefined> = {
    page: params.page,
    limit: params.limit,
  };

  if (options?.employee_id) queryParams.employee_id = options.employee_id;

  const allowances = await fetchList<Allowance>(ENDPOINTS.allowances, { params: queryParams });

  return paginateResponse(allowances, params.page, params.limit);
}

/**
 * Create a new leave request
 */
export async function createLeave(input: CreateLeaveInput): Promise<Leave> {
  return auditedOperation(AuditAction.CREATE, 'leave', undefined, async () => {
    const leave = await postOne<Leave>(ENDPOINTS.leaves, input);
    return leave;
  });
}

/**
 * Update a leave request
 */
export async function updateLeave(id: number, input: UpdateLeaveInput): Promise<Leave> {
  validateId(id, 'leave');

  return auditedOperation(AuditAction.UPDATE, 'leave', id, async () => {
    const leave = await patchOne<Leave>(endpointWithId(ENDPOINTS.leaves, id), input);
    return leave;
  });
}

/**
 * Cancel a leave request
 */
export async function cancelLeave(id: number): Promise<void> {
  validateId(id, 'leave');

  return auditedOperation(AuditAction.DELETE, 'leave', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.leaves, id));
  });
}

/**
 * Approve a leave request
 */
export async function approveLeave(id: number, input?: LeaveDecisionInput): Promise<Leave> {
  validateId(id, 'leave');

  return auditedOperation(AuditAction.APPROVE, 'leave', id, async () => {
    const leave = await postAction<Leave>(
      endpointWithAction(ENDPOINTS.leaves, id, 'approve'),
      input || {}
    );
    return leave;
  });
}

/**
 * Reject a leave request
 */
export async function rejectLeave(id: number, input?: LeaveDecisionInput): Promise<Leave> {
  validateId(id, 'leave');

  return auditedOperation(AuditAction.REJECT, 'leave', id, async () => {
    const leave = await postAction<Leave>(
      endpointWithAction(ENDPOINTS.leaves, id, 'reject'),
      input || {}
    );
    return leave;
  });
}
