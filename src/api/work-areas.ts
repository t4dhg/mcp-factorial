/**
 * Work Areas API endpoints
 */

import { fetchList, fetchOne, postOne, patchOne, postAction } from '../http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type { WorkArea, CreateWorkAreaInput, UpdateWorkAreaInput } from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId, endpointWithAction } from '../endpoints.js';

/**
 * List all work areas
 */
export async function listWorkAreas(
  options?: PaginationInput
): Promise<PaginatedResponse<WorkArea>> {
  const params = buildPaginationParams(options);
  const workAreas = await cached(
    CacheManager.key('work_areas', options),
    () => fetchList<WorkArea>(ENDPOINTS.workAreas),
    CACHE_TTL.locations
  );
  return sliceForPagination(workAreas, params);
}

/**
 * Get a specific work area by ID
 */
export async function getWorkArea(id: number): Promise<WorkArea> {
  validateId(id, 'work area');
  return cached(
    `work_area:${id}`,
    () => fetchOne<WorkArea>(endpointWithId(ENDPOINTS.workAreas, id)),
    CACHE_TTL.locations
  );
}

/**
 * Create a work area
 */
export async function createWorkArea(input: CreateWorkAreaInput): Promise<WorkArea> {
  return auditedOperation(AuditAction.CREATE, 'work_area', undefined, async () => {
    const workArea = await postOne<WorkArea>(ENDPOINTS.workAreas, input);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

/**
 * Update a work area
 */
export async function updateWorkArea(id: number, input: UpdateWorkAreaInput): Promise<WorkArea> {
  validateId(id, 'work area');

  return auditedOperation(AuditAction.UPDATE, 'work_area', id, async () => {
    const workArea = await patchOne<WorkArea>(endpointWithId(ENDPOINTS.workAreas, id), input);
    cache.invalidate(`work_area:${id}`);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

/**
 * Archive a work area
 */
export async function archiveWorkArea(id: number): Promise<WorkArea> {
  validateId(id, 'work area');

  return auditedOperation(AuditAction.ARCHIVE, 'work_area', id, async () => {
    const workArea = await postAction<WorkArea>(
      endpointWithAction(ENDPOINTS.workAreas, id, 'archive')
    );
    cache.invalidate(`work_area:${id}`);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

/**
 * Unarchive a work area
 */
export async function unarchiveWorkArea(id: number): Promise<WorkArea> {
  validateId(id, 'work area');

  return auditedOperation(AuditAction.UNARCHIVE, 'work_area', id, async () => {
    const workArea = await postAction<WorkArea>(
      endpointWithAction(ENDPOINTS.workAreas, id, 'unarchive')
    );
    cache.invalidate(`work_area:${id}`);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}
