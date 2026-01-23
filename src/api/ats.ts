/**
 * ATS (Applicant Tracking System) API endpoints
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne, postAction } from '../http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type {
  JobPosting,
  Candidate,
  Application,
  HiringStage,
  CreateJobPostingInput,
  UpdateJobPostingInput,
  CreateCandidateInput,
  UpdateCandidateInput,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId, endpointWithAction } from '../endpoints.js';

// ============================================================================
// ATS - READ endpoints
// ============================================================================

/**
 * List all job postings
 */
export async function listJobPostings(
  options?: PaginationInput
): Promise<PaginatedResponse<JobPosting>> {
  const params = buildPaginationParams(options);
  const postings = await cached(
    CacheManager.key('job_postings', options),
    () => fetchList<JobPosting>(ENDPOINTS.jobPostings),
    CACHE_TTL.default
  );
  return sliceForPagination(postings, params);
}

/**
 * Get a specific job posting by ID
 */
export async function getJobPosting(id: number): Promise<JobPosting> {
  validateId(id, 'job posting');
  return cached(
    `job_posting:${id}`,
    () => fetchOne<JobPosting>(endpointWithId(ENDPOINTS.jobPostings, id)),
    CACHE_TTL.default
  );
}

/**
 * List all candidates
 */
export async function listCandidates(
  options?: PaginationInput
): Promise<PaginatedResponse<Candidate>> {
  const params = buildPaginationParams(options);
  const candidates = await fetchList<Candidate>(ENDPOINTS.candidates);
  return sliceForPagination(candidates, params);
}

/**
 * Get a specific candidate by ID
 */
export async function getCandidate(id: number): Promise<Candidate> {
  validateId(id, 'candidate');
  return fetchOne<Candidate>(endpointWithId(ENDPOINTS.candidates, id));
}

/**
 * List all applications
 */
export async function listApplications(
  jobPostingId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<Application>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (jobPostingId) queryParams.job_posting_id = jobPostingId;

  const applications = await fetchList<Application>(ENDPOINTS.applications, {
    params: queryParams,
  });
  return sliceForPagination(applications, params);
}

/**
 * Get a specific application by ID
 */
export async function getApplication(id: number): Promise<Application> {
  validateId(id, 'application');
  return fetchOne<Application>(endpointWithId(ENDPOINTS.applications, id));
}

/**
 * List all hiring stages
 */
export async function listHiringStages(): Promise<HiringStage[]> {
  return cached(
    'hiring_stages:all',
    () => fetchList<HiringStage>(ENDPOINTS.hiringStages),
    CACHE_TTL.default
  );
}

/**
 * Get a specific hiring stage by ID
 */
export async function getHiringStage(id: number): Promise<HiringStage> {
  validateId(id, 'hiring stage');
  return fetchOne<HiringStage>(endpointWithId(ENDPOINTS.hiringStages, id));
}

// ============================================================================
// ATS - WRITE endpoints
// ============================================================================

/**
 * Create a job posting
 */
export async function createJobPosting(input: CreateJobPostingInput): Promise<JobPosting> {
  return auditedOperation(AuditAction.CREATE, 'job_posting', undefined, async () => {
    const posting = await postOne<JobPosting>(ENDPOINTS.jobPostings, input);
    cache.invalidatePrefix('job_postings');
    return posting;
  });
}

/**
 * Update a job posting
 */
export async function updateJobPosting(
  id: number,
  input: UpdateJobPostingInput
): Promise<JobPosting> {
  validateId(id, 'job posting');

  return auditedOperation(AuditAction.UPDATE, 'job_posting', id, async () => {
    const posting = await patchOne<JobPosting>(endpointWithId(ENDPOINTS.jobPostings, id), input);
    cache.invalidate(`job_posting:${id}`);
    cache.invalidatePrefix('job_postings');
    return posting;
  });
}

/**
 * Delete a job posting
 */
export async function deleteJobPosting(id: number): Promise<void> {
  validateId(id, 'job posting');

  return auditedOperation(AuditAction.DELETE, 'job_posting', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.jobPostings, id));
    cache.invalidate(`job_posting:${id}`);
    cache.invalidatePrefix('job_postings');
  });
}

/**
 * Create a candidate
 */
export async function createCandidate(input: CreateCandidateInput): Promise<Candidate> {
  return auditedOperation(AuditAction.CREATE, 'candidate', undefined, async () => {
    return postOne<Candidate>(ENDPOINTS.candidates, input);
  });
}

/**
 * Update a candidate
 */
export async function updateCandidate(id: number, input: UpdateCandidateInput): Promise<Candidate> {
  validateId(id, 'candidate');

  return auditedOperation(AuditAction.UPDATE, 'candidate', id, async () => {
    return patchOne<Candidate>(endpointWithId(ENDPOINTS.candidates, id), input);
  });
}

/**
 * Delete a candidate
 */
export async function deleteCandidate(id: number): Promise<void> {
  validateId(id, 'candidate');

  return auditedOperation(AuditAction.DELETE, 'candidate', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.candidates, id));
  });
}

/**
 * Create an application
 */
export async function createApplication(input: CreateApplicationInput): Promise<Application> {
  return auditedOperation(AuditAction.CREATE, 'application', undefined, async () => {
    return postOne<Application>(ENDPOINTS.applications, input);
  });
}

/**
 * Update an application
 */
export async function updateApplication(
  id: number,
  input: UpdateApplicationInput
): Promise<Application> {
  validateId(id, 'application');

  return auditedOperation(AuditAction.UPDATE, 'application', id, async () => {
    return patchOne<Application>(endpointWithId(ENDPOINTS.applications, id), input);
  });
}

/**
 * Delete an application
 */
export async function deleteApplication(id: number): Promise<void> {
  validateId(id, 'application');

  return auditedOperation(AuditAction.DELETE, 'application', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.applications, id));
  });
}

/**
 * Advance an application to the next stage
 */
export async function advanceApplication(id: number): Promise<Application> {
  validateId(id, 'application');

  return auditedOperation(AuditAction.UPDATE, 'application', id, async () => {
    return postAction<Application>(endpointWithAction(ENDPOINTS.applications, id, 'apply'));
  });
}
