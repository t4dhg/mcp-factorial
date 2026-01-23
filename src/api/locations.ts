/**
 * Location API endpoints
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne } from '../http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type { Location, CreateLocationInput, UpdateLocationInput } from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';

/**
 * List all locations
 */
export async function listLocations(
  options?: PaginationInput
): Promise<PaginatedResponse<Location>> {
  const params = buildPaginationParams(options);
  const cacheKey = CacheManager.key('locations', options);

  const locations = await cached(
    cacheKey,
    () => fetchList<Location>(ENDPOINTS.locations),
    CACHE_TTL.locations
  );

  return sliceForPagination(locations, params);
}

/**
 * Get a specific location by ID
 */
export async function getLocation(id: number): Promise<Location> {
  validateId(id, 'location');

  return cached(
    `location:${id}`,
    () => fetchOne<Location>(endpointWithId(ENDPOINTS.locations, id)),
    CACHE_TTL.locations
  );
}

/**
 * Create a new location
 */
export async function createLocation(input: CreateLocationInput): Promise<Location> {
  return auditedOperation(AuditAction.CREATE, 'location', undefined, async () => {
    const location = await postOne<Location>(ENDPOINTS.locations, input);
    cache.invalidatePrefix('locations');
    return location;
  });
}

/**
 * Update an existing location
 */
export async function updateLocation(id: number, input: UpdateLocationInput): Promise<Location> {
  validateId(id, 'location');

  return auditedOperation(AuditAction.UPDATE, 'location', id, async () => {
    const location = await patchOne<Location>(endpointWithId(ENDPOINTS.locations, id), input);
    cache.invalidate(`location:${id}`);
    cache.invalidatePrefix('locations');
    return location;
  });
}

/**
 * Delete a location
 */
export async function deleteLocation(id: number): Promise<void> {
  validateId(id, 'location');

  return auditedOperation(AuditAction.DELETE, 'location', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.locations, id));
    cache.invalidate(`location:${id}`);
    cache.invalidatePrefix('locations');
  });
}
