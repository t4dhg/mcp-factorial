/**
 * Training API endpoints: Trainings, Sessions, Enrollments
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne } from '../http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type {
  Training,
  TrainingSession,
  TrainingMembership,
  CreateTrainingInput,
  UpdateTrainingInput,
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
  EnrollTrainingInput,
} from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';

// ============================================================================
// Training - READ endpoints
// ============================================================================

/**
 * List all trainings
 */
export async function listTrainings(
  options?: PaginationInput
): Promise<PaginatedResponse<Training>> {
  const params = buildPaginationParams(options);
  const trainings = await cached(
    CacheManager.key('trainings', options),
    () => fetchList<Training>(ENDPOINTS.trainings),
    CACHE_TTL.default
  );
  return sliceForPagination(trainings, params);
}

/**
 * Get a specific training by ID
 */
export async function getTraining(id: number): Promise<Training> {
  validateId(id, 'training');
  return cached(
    `training:${id}`,
    () => fetchOne<Training>(endpointWithId(ENDPOINTS.trainings, id)),
    CACHE_TTL.default
  );
}

/**
 * List training sessions
 */
export async function listTrainingSessions(
  trainingId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<TrainingSession>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (trainingId) queryParams.training_id = trainingId;

  const sessions = await fetchList<TrainingSession>(ENDPOINTS.trainingSessions, {
    params: queryParams,
  });
  return sliceForPagination(sessions, params);
}

/**
 * Get a specific training session by ID
 */
export async function getTrainingSession(id: number): Promise<TrainingSession> {
  validateId(id, 'session');
  return fetchOne<TrainingSession>(endpointWithId(ENDPOINTS.trainingSessions, id));
}

/**
 * List training enrollments
 */
export async function listTrainingEnrollments(
  trainingId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<TrainingMembership>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (trainingId) queryParams.training_id = trainingId;

  const enrollments = await fetchList<TrainingMembership>(ENDPOINTS.trainingMemberships, {
    params: queryParams,
  });
  return sliceForPagination(enrollments, params);
}

/**
 * Get a specific training enrollment by ID
 */
export async function getTrainingEnrollment(id: number): Promise<TrainingMembership> {
  validateId(id, 'enrollment');
  return fetchOne<TrainingMembership>(endpointWithId(ENDPOINTS.trainingMemberships, id));
}

// ============================================================================
// Training - WRITE endpoints
// ============================================================================

/**
 * Create a training program
 */
export async function createTraining(input: CreateTrainingInput): Promise<Training> {
  return auditedOperation(AuditAction.CREATE, 'training', undefined, async () => {
    const training = await postOne<Training>(ENDPOINTS.trainings, input);
    cache.invalidatePrefix('trainings');
    return training;
  });
}

/**
 * Update a training program
 */
export async function updateTraining(id: number, input: UpdateTrainingInput): Promise<Training> {
  validateId(id, 'training');

  return auditedOperation(AuditAction.UPDATE, 'training', id, async () => {
    const training = await patchOne<Training>(endpointWithId(ENDPOINTS.trainings, id), input);
    cache.invalidate(`training:${id}`);
    cache.invalidatePrefix('trainings');
    return training;
  });
}

/**
 * Delete a training program
 */
export async function deleteTraining(id: number): Promise<void> {
  validateId(id, 'training');

  return auditedOperation(AuditAction.DELETE, 'training', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.trainings, id));
    cache.invalidate(`training:${id}`);
    cache.invalidatePrefix('trainings');
  });
}

/**
 * Create a training session
 */
export async function createTrainingSession(
  input: CreateTrainingSessionInput
): Promise<TrainingSession> {
  return auditedOperation(AuditAction.CREATE, 'training_session', undefined, async () => {
    return postOne<TrainingSession>(ENDPOINTS.trainingSessions, input);
  });
}

/**
 * Update a training session
 */
export async function updateTrainingSession(
  id: number,
  input: UpdateTrainingSessionInput
): Promise<TrainingSession> {
  validateId(id, 'session');

  return auditedOperation(AuditAction.UPDATE, 'training_session', id, async () => {
    return patchOne<TrainingSession>(endpointWithId(ENDPOINTS.trainingSessions, id), input);
  });
}

/**
 * Delete a training session
 */
export async function deleteTrainingSession(id: number): Promise<void> {
  validateId(id, 'session');

  return auditedOperation(AuditAction.DELETE, 'training_session', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.trainingSessions, id));
  });
}

/**
 * Enroll an employee in a training
 */
export async function enrollInTraining(input: EnrollTrainingInput): Promise<TrainingMembership> {
  return auditedOperation(AuditAction.ASSIGN, 'training_enrollment', undefined, async () => {
    return postOne<TrainingMembership>(ENDPOINTS.trainingMemberships, input);
  });
}

/**
 * Remove enrollment from a training
 */
export async function unenrollFromTraining(id: number): Promise<void> {
  validateId(id, 'enrollment');

  return auditedOperation(AuditAction.UNASSIGN, 'training_enrollment', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.trainingMemberships, id));
  });
}
