/**
 * Team API endpoints
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne } from '../http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type { Team, CreateTeamInput, UpdateTeamInput } from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';

/**
 * List all teams
 */
export async function listTeams(options?: PaginationInput): Promise<PaginatedResponse<Team>> {
  const params = buildPaginationParams(options);
  const cacheKey = CacheManager.key('teams', options);

  const teams = await cached(cacheKey, () => fetchList<Team>(ENDPOINTS.teams), CACHE_TTL.teams);

  return sliceForPagination(teams, params);
}

/**
 * Get a specific team by ID
 */
export async function getTeam(id: number): Promise<Team> {
  validateId(id, 'team');

  return cached(
    `team:${id}`,
    () => fetchOne<Team>(endpointWithId(ENDPOINTS.teams, id)),
    CACHE_TTL.teams
  );
}

/**
 * Create a new team
 */
export async function createTeam(input: CreateTeamInput): Promise<Team> {
  return auditedOperation(AuditAction.CREATE, 'team', undefined, async () => {
    const team = await postOne<Team>(ENDPOINTS.teams, input);
    cache.invalidatePrefix('teams');
    return team;
  });
}

/**
 * Update an existing team
 */
export async function updateTeam(id: number, input: UpdateTeamInput): Promise<Team> {
  validateId(id, 'team');

  return auditedOperation(AuditAction.UPDATE, 'team', id, async () => {
    const team = await patchOne<Team>(endpointWithId(ENDPOINTS.teams, id), input);
    cache.invalidate(`team:${id}`);
    cache.invalidatePrefix('teams');
    return team;
  });
}

/**
 * Delete a team
 */
export async function deleteTeam(id: number): Promise<void> {
  validateId(id, 'team');

  return auditedOperation(AuditAction.DELETE, 'team', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.teams, id));
    cache.invalidate(`team:${id}`);
    cache.invalidatePrefix('teams');
  });
}
