/**
 * Project Management API endpoints: Projects, Tasks, Workers, Time Records
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
  Project,
  ProjectTask,
  ProjectWorker,
  TimeRecord,
  CreateProjectInput,
  UpdateProjectInput,
  CreateProjectTaskInput,
  UpdateProjectTaskInput,
  AssignProjectWorkerInput,
  CreateTimeRecordInput,
  UpdateTimeRecordInput,
} from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';

// ============================================================================
// Projects - READ endpoints
// ============================================================================

/**
 * List all projects
 */
export async function listProjects(options?: PaginationInput): Promise<PaginatedResponse<Project>> {
  const params = buildPaginationParams(options);
  const projects = await cached(
    CacheManager.key('projects', options),
    () => fetchList<Project>(ENDPOINTS.projects),
    CACHE_TTL.default
  );
  return sliceForPagination(projects, params);
}

/**
 * Get a specific project by ID
 */
export async function getProject(id: number): Promise<Project> {
  validateId(id, 'project');
  return cached(
    `project:${id}`,
    () => fetchOne<Project>(endpointWithId(ENDPOINTS.projects, id)),
    CACHE_TTL.default
  );
}

/**
 * List project tasks
 */
export async function listProjectTasks(
  projectId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<ProjectTask>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (projectId) queryParams.project_ids = projectId;

  const tasks = await fetchList<ProjectTask>(ENDPOINTS.projectTasks, {
    params: queryParams,
  });
  return sliceForPagination(tasks, params);
}

/**
 * Get a specific project task by ID
 */
export async function getProjectTask(id: number): Promise<ProjectTask> {
  validateId(id, 'task');
  return fetchOne<ProjectTask>(endpointWithId(ENDPOINTS.projectTasks, id));
}

/**
 * List project workers
 */
export async function listProjectWorkers(
  projectId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<ProjectWorker>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (projectId) queryParams.project_ids = projectId;

  const workers = await fetchList<ProjectWorker>(ENDPOINTS.projectWorkers, {
    params: queryParams,
  });
  return sliceForPagination(workers, params);
}

/**
 * Get a specific project worker by ID
 */
export async function getProjectWorker(id: number): Promise<ProjectWorker> {
  validateId(id, 'project worker');
  return fetchOne<ProjectWorker>(endpointWithId(ENDPOINTS.projectWorkers, id));
}

/**
 * List time records
 */
export async function listTimeRecords(
  projectWorkerId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<TimeRecord>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (projectWorkerId) queryParams.project_workers_ids = projectWorkerId;

  const records = await fetchList<TimeRecord>(ENDPOINTS.timeRecords, {
    params: queryParams,
  });
  return sliceForPagination(records, params);
}

/**
 * Get a specific time record by ID
 */
export async function getTimeRecord(id: number): Promise<TimeRecord> {
  validateId(id, 'time record');
  return fetchOne<TimeRecord>(endpointWithId(ENDPOINTS.timeRecords, id));
}

// ============================================================================
// Projects - WRITE endpoints
// ============================================================================

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return auditedOperation(AuditAction.CREATE, 'project', undefined, async () => {
    const project = await postOne<Project>(ENDPOINTS.projects, input);
    cache.invalidatePrefix('projects');
    return project;
  });
}

/**
 * Update a project
 */
export async function updateProject(id: number, input: UpdateProjectInput): Promise<Project> {
  validateId(id, 'project');

  return auditedOperation(AuditAction.UPDATE, 'project', id, async () => {
    const project = await patchOne<Project>(endpointWithId(ENDPOINTS.projects, id), input);
    cache.invalidate(`project:${id}`);
    cache.invalidatePrefix('projects');
    return project;
  });
}

/**
 * Delete a project
 */
export async function deleteProject(id: number): Promise<void> {
  validateId(id, 'project');

  return auditedOperation(AuditAction.DELETE, 'project', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.projects, id));
    cache.invalidate(`project:${id}`);
    cache.invalidatePrefix('projects');
  });
}

/**
 * Create a project task
 */
export async function createProjectTask(input: CreateProjectTaskInput): Promise<ProjectTask> {
  return auditedOperation(AuditAction.CREATE, 'project_task', undefined, async () => {
    return postOne<ProjectTask>(ENDPOINTS.projectTasks, input);
  });
}

/**
 * Update a project task
 */
export async function updateProjectTask(
  id: number,
  input: UpdateProjectTaskInput
): Promise<ProjectTask> {
  validateId(id, 'task');

  return auditedOperation(AuditAction.UPDATE, 'project_task', id, async () => {
    return patchOne<ProjectTask>(endpointWithId(ENDPOINTS.projectTasks, id), input);
  });
}

/**
 * Delete a project task
 */
export async function deleteProjectTask(id: number): Promise<void> {
  validateId(id, 'task');

  return auditedOperation(AuditAction.DELETE, 'project_task', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.projectTasks, id));
  });
}

/**
 * Assign a worker to a project
 */
export async function assignProjectWorker(input: AssignProjectWorkerInput): Promise<ProjectWorker> {
  return auditedOperation(AuditAction.ASSIGN, 'project_worker', undefined, async () => {
    return postOne<ProjectWorker>(ENDPOINTS.projectWorkers, input);
  });
}

/**
 * Remove a worker from a project
 */
export async function removeProjectWorker(id: number): Promise<void> {
  validateId(id, 'project worker');

  return auditedOperation(AuditAction.UNASSIGN, 'project_worker', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.projectWorkers, id));
  });
}

/**
 * Create a time record
 */
export async function createTimeRecord(input: CreateTimeRecordInput): Promise<TimeRecord> {
  return auditedOperation(AuditAction.CREATE, 'time_record', undefined, async () => {
    return postOne<TimeRecord>(ENDPOINTS.timeRecords, input);
  });
}

/**
 * Update a time record
 */
export async function updateTimeRecord(
  id: number,
  input: UpdateTimeRecordInput
): Promise<TimeRecord> {
  validateId(id, 'time record');

  return auditedOperation(AuditAction.UPDATE, 'time_record', id, async () => {
    return patchOne<TimeRecord>(endpointWithId(ENDPOINTS.timeRecords, id), input);
  });
}

/**
 * Delete a time record
 */
export async function deleteTimeRecord(id: number): Promise<void> {
  validateId(id, 'time record');

  return auditedOperation(AuditAction.DELETE, 'time_record', id, async () => {
    await deleteOne(endpointWithId(ENDPOINTS.timeRecords, id));
  });
}
