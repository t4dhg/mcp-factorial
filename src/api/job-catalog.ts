/**
 * Job Catalog API endpoints: Job Roles, Job Levels
 */

import { fetchList, fetchOne } from '../http-client.js';
import { cached, CACHE_TTL } from '../cache.js';
import type { JobRole, JobLevel } from '../schemas.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';

/**
 * List all job roles
 */
export async function listJobRoles(): Promise<JobRole[]> {
  return cached('job-roles:all', () => fetchList<JobRole>(ENDPOINTS.jobRoles), CACHE_TTL.default);
}

/**
 * Get a specific job role by ID
 */
export async function getJobRole(id: number): Promise<JobRole> {
  validateId(id, 'job role');

  return fetchOne<JobRole>(endpointWithId(ENDPOINTS.jobRoles, id));
}

/**
 * List all job levels
 */
export async function listJobLevels(): Promise<JobLevel[]> {
  return cached(
    'job-levels:all',
    () => fetchList<JobLevel>(ENDPOINTS.jobLevels),
    CACHE_TTL.default
  );
}

/**
 * Get a specific job level by ID
 */
export async function getJobLevel(id: number): Promise<JobLevel> {
  validateId(id, 'job level');

  return fetchOne<JobLevel>(endpointWithId(ENDPOINTS.jobLevels, id));
}
