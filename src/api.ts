/**
 * FactorialHR API Client
 *
 * Provides access to FactorialHR API endpoints with caching, pagination, and retry logic.
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne, postAction } from './http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from './cache.js';
import {
  buildPaginationParams,
  paginateResponse,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from './pagination.js';
import {
  type Employee,
  type Team,
  type Location,
  type Contract,
  type Leave,
  type LeaveType,
  type Allowance,
  type Shift,
  type Folder,
  type Document,
  type JobRole,
  type JobLevel,
  type Project,
  type ProjectTask,
  type ProjectWorker,
  type TimeRecord,
  type Training,
  type TrainingSession,
  type TrainingMembership,
  type WorkArea,
  type JobPosting,
  type Candidate,
  type Application,
  type HiringStage,
  type PayrollSupplement,
  type TaxIdentifier,
  type FamilySituation,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type CreateLocationInput,
  type UpdateLocationInput,
  type CreateLeaveInput,
  type UpdateLeaveInput,
  type LeaveDecisionInput,
  type CreateShiftInput,
  type UpdateShiftInput,
  type CreateProjectInput,
  type UpdateProjectInput,
  type CreateProjectTaskInput,
  type UpdateProjectTaskInput,
  type AssignProjectWorkerInput,
  type CreateTimeRecordInput,
  type UpdateTimeRecordInput,
  type CreateTrainingInput,
  type UpdateTrainingInput,
  type CreateTrainingSessionInput,
  type UpdateTrainingSessionInput,
  type EnrollTrainingInput,
  type CreateWorkAreaInput,
  type UpdateWorkAreaInput,
  type CreateJobPostingInput,
  type UpdateJobPostingInput,
  type CreateCandidateInput,
  type UpdateCandidateInput,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from './schemas.js';
import { AuditAction, auditedOperation } from './audit.js';
import type {
  ListEmployeesOptions,
  ListLeavesOptions,
  ListAllowancesOptions,
  ListShiftsOptions,
  ListDocumentsOptions,
} from './types.js';

// ============================================================================
// Employee endpoints
// ============================================================================

/**
 * List all employees with optional filtering and pagination
 */
export async function listEmployees(
  options?: ListEmployeesOptions
): Promise<PaginatedResponse<Employee>> {
  const params = buildPaginationParams(options);
  const cacheKey = CacheManager.key('employees', options);

  // For filtered requests, we need to fetch all and filter client-side
  // because the API doesn't reliably filter
  if (options?.team_id || options?.location_id) {
    const allEmployees = await cached(
      'employees:all',
      () => fetchList<Employee>('/employees/employees'),
      CACHE_TTL.employees
    );

    let filtered = allEmployees;
    if (options.team_id) {
      filtered = filtered.filter(e => e.team_ids?.includes(options.team_id!));
    }
    if (options.location_id) {
      filtered = filtered.filter(e => e.location_id === options.location_id);
    }

    return sliceForPagination(filtered, params);
  }

  // Without filters, use pagination directly
  const employees = await cached(
    cacheKey,
    () => fetchList<Employee>('/employees/employees', { params }),
    CACHE_TTL.employees
  );

  return paginateResponse(employees, params.page, params.limit);
}

/**
 * Get a specific employee by ID
 */
export async function getEmployee(id: number): Promise<Employee> {
  if (!id || id <= 0) {
    throw new Error('Invalid employee ID. Please provide a positive number.');
  }

  return cached(
    `employee:${id}`,
    () => fetchOne<Employee>(`/employees/employees/${id}`),
    CACHE_TTL.employees
  );
}

/**
 * Search employees by name or email
 */
export async function searchEmployees(query: string): Promise<Employee[]> {
  if (!query || query.trim().length < 2) {
    throw new Error('Search query must be at least 2 characters long.');
  }

  const allEmployees = await cached(
    'employees:all',
    () => fetchList<Employee>('/employees/employees'),
    CACHE_TTL.employees
  );

  const lowerQuery = query.toLowerCase().trim();

  return allEmployees.filter(
    emp =>
      emp.full_name?.toLowerCase().includes(lowerQuery) ||
      emp.email?.toLowerCase().includes(lowerQuery) ||
      emp.first_name?.toLowerCase().includes(lowerQuery) ||
      emp.last_name?.toLowerCase().includes(lowerQuery)
  );
}

// ============================================================================
// Team endpoints
// ============================================================================

/**
 * List all teams
 */
export async function listTeams(options?: PaginationInput): Promise<PaginatedResponse<Team>> {
  const params = buildPaginationParams(options);
  const cacheKey = CacheManager.key('teams', options);

  const teams = await cached(cacheKey, () => fetchList<Team>('/teams/teams'), CACHE_TTL.teams);

  return sliceForPagination(teams, params);
}

/**
 * Get a specific team by ID
 */
export async function getTeam(id: number): Promise<Team> {
  if (!id || id <= 0) {
    throw new Error('Invalid team ID. Please provide a positive number.');
  }

  return cached(`team:${id}`, () => fetchOne<Team>(`/teams/teams/${id}`), CACHE_TTL.teams);
}

// ============================================================================
// Location endpoints
// ============================================================================

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
    () => fetchList<Location>('/locations/locations'),
    CACHE_TTL.locations
  );

  return sliceForPagination(locations, params);
}

/**
 * Get a specific location by ID
 */
export async function getLocation(id: number): Promise<Location> {
  if (!id || id <= 0) {
    throw new Error('Invalid location ID. Please provide a positive number.');
  }

  return cached(
    `location:${id}`,
    () => fetchOne<Location>(`/locations/locations/${id}`),
    CACHE_TTL.locations
  );
}

// ============================================================================
// Contract endpoints
// ============================================================================

/**
 * List contracts, optionally filtered by employee ID
 */
export async function listContracts(
  employeeId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<Contract>> {
  if (employeeId !== undefined && employeeId <= 0) {
    throw new Error('Invalid employee ID. Please provide a positive number.');
  }

  const params = buildPaginationParams(options);

  // Note: The API doesn't reliably filter by employee_id query param,
  // so we fetch all contracts and filter client-side
  const allContracts = await cached(
    'contracts:all',
    () => fetchList<Contract>('/contracts/contract-versions'),
    CACHE_TTL.contracts
  );

  const filtered =
    employeeId !== undefined
      ? allContracts.filter(c => c.employee_id === employeeId)
      : allContracts;

  return sliceForPagination(filtered, params);
}

// ============================================================================
// Time Off / Leave endpoints
// ============================================================================

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

  const leaves = await fetchList<Leave>('/timeoff/leaves', { params: queryParams });

  return paginateResponse(leaves, params.page, params.limit);
}

/**
 * Get a specific leave by ID
 */
export async function getLeave(id: number): Promise<Leave> {
  if (!id || id <= 0) {
    throw new Error('Invalid leave ID. Please provide a positive number.');
  }

  return fetchOne<Leave>(`/timeoff/leaves/${id}`);
}

/**
 * List all leave types
 */
export async function listLeaveTypes(): Promise<LeaveType[]> {
  return cached(
    'leave-types:all',
    () => fetchList<LeaveType>('/timeoff/leave-types'),
    CACHE_TTL.leaves
  );
}

/**
 * Get a specific leave type by ID
 */
export async function getLeaveType(id: number): Promise<LeaveType> {
  if (!id || id <= 0) {
    throw new Error('Invalid leave type ID. Please provide a positive number.');
  }

  return fetchOne<LeaveType>(`/timeoff/leave-types/${id}`);
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

  const allowances = await fetchList<Allowance>('/timeoff/allowances', { params: queryParams });

  return paginateResponse(allowances, params.page, params.limit);
}

// ============================================================================
// Attendance / Shifts endpoints
// ============================================================================

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

  const shifts = await fetchList<Shift>('/attendance/shifts', { params: queryParams });

  return paginateResponse(shifts, params.page, params.limit);
}

/**
 * Get a specific shift by ID
 */
export async function getShift(id: number): Promise<Shift> {
  if (!id || id <= 0) {
    throw new Error('Invalid shift ID. Please provide a positive number.');
  }

  return fetchOne<Shift>(`/attendance/shifts/${id}`);
}

// ============================================================================
// Document endpoints (Read-only)
// ============================================================================

/**
 * List all folders
 */
export async function listFolders(): Promise<Folder[]> {
  return cached('folders:all', () => fetchList<Folder>('/documents/folders'), CACHE_TTL.default);
}

/**
 * Get a specific folder by ID
 */
export async function getFolder(id: number): Promise<Folder> {
  if (!id || id <= 0) {
    throw new Error('Invalid folder ID. Please provide a positive number.');
  }

  return fetchOne<Folder>(`/documents/folders/${id}`);
}

/**
 * List documents with optional filtering by folder
 */
export async function listDocuments(
  options?: ListDocumentsOptions
): Promise<PaginatedResponse<Document>> {
  const params = buildPaginationParams(options);

  const queryParams: Record<string, string | number | undefined> = {
    page: params.page,
    limit: params.limit,
  };

  if (options?.folder_id) queryParams.folder_id = options.folder_id;

  const documents = await fetchList<Document>('/documents/documents', { params: queryParams });

  return paginateResponse(documents, params.page, params.limit);
}

/**
 * Get a specific document by ID
 */
export async function getDocument(id: number): Promise<Document> {
  if (!id || id <= 0) {
    throw new Error('Invalid document ID. Please provide a positive number.');
  }

  return fetchOne<Document>(`/documents/documents/${id}`);
}

// ============================================================================
// Job Catalog endpoints
// ============================================================================

/**
 * List all job roles
 */
export async function listJobRoles(): Promise<JobRole[]> {
  return cached('job-roles:all', () => fetchList<JobRole>('/job_catalog/roles'), CACHE_TTL.default);
}

/**
 * Get a specific job role by ID
 */
export async function getJobRole(id: number): Promise<JobRole> {
  if (!id || id <= 0) {
    throw new Error('Invalid job role ID. Please provide a positive number.');
  }

  return fetchOne<JobRole>(`/job_catalog/roles/${id}`);
}

/**
 * List all job levels
 */
export async function listJobLevels(): Promise<JobLevel[]> {
  return cached(
    'job-levels:all',
    () => fetchList<JobLevel>('/job_catalog/levels'),
    CACHE_TTL.default
  );
}

/**
 * Get a specific job level by ID
 */
export async function getJobLevel(id: number): Promise<JobLevel> {
  if (!id || id <= 0) {
    throw new Error('Invalid job level ID. Please provide a positive number.');
  }

  return fetchOne<JobLevel>(`/job_catalog/levels/${id}`);
}

// ============================================================================
// Cache utilities
// ============================================================================

/**
 * Invalidate all cached data
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Invalidate cached data for a specific resource type
 */
export function invalidateCache(resourceType: string): void {
  cache.invalidatePrefix(resourceType);
}

// ============================================================================
// WRITE OPERATIONS - Employee endpoints
// ============================================================================

/**
 * Create a new employee
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  return auditedOperation(
    AuditAction.CREATE,
    'employee',
    undefined,
    async () => {
      const employee = await postOne<Employee>('/employees/employees', input);
      cache.invalidatePrefix('employees');
      return employee;
    },
    Object.fromEntries(Object.entries(input).map(([k, v]) => [k, { to: v }]))
  );
}

/**
 * Update an existing employee
 */
export async function updateEmployee(id: number, input: UpdateEmployeeInput): Promise<Employee> {
  if (!id || id <= 0) {
    throw new Error('Invalid employee ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'employee', id, async () => {
    const employee = await patchOne<Employee>(`/employees/employees/${id}`, input);
    cache.invalidate(`employee:${id}`);
    cache.invalidatePrefix('employees');
    return employee;
  });
}

/**
 * Terminate an employee (soft delete)
 */
export async function terminateEmployee(
  id: number,
  terminatedOn: string,
  reason?: string
): Promise<Employee> {
  if (!id || id <= 0) {
    throw new Error('Invalid employee ID. Please provide a positive number.');
  }

  return auditedOperation(
    AuditAction.TERMINATE,
    'employee',
    id,
    async () => {
      const employee = await patchOne<Employee>(`/employees/employees/${id}`, {
        terminated_on: terminatedOn,
      });
      cache.invalidate(`employee:${id}`);
      cache.invalidatePrefix('employees');
      return employee;
    },
    { terminated_on: { to: terminatedOn }, reason: { to: reason } }
  );
}

// ============================================================================
// WRITE OPERATIONS - Team endpoints
// ============================================================================

/**
 * Create a new team
 */
export async function createTeam(input: CreateTeamInput): Promise<Team> {
  return auditedOperation(AuditAction.CREATE, 'team', undefined, async () => {
    const team = await postOne<Team>('/teams/teams', input);
    cache.invalidatePrefix('teams');
    return team;
  });
}

/**
 * Update an existing team
 */
export async function updateTeam(id: number, input: UpdateTeamInput): Promise<Team> {
  if (!id || id <= 0) {
    throw new Error('Invalid team ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'team', id, async () => {
    const team = await patchOne<Team>(`/teams/teams/${id}`, input);
    cache.invalidate(`team:${id}`);
    cache.invalidatePrefix('teams');
    return team;
  });
}

/**
 * Delete a team
 */
export async function deleteTeam(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid team ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'team', id, async () => {
    await deleteOne(`/teams/teams/${id}`);
    cache.invalidate(`team:${id}`);
    cache.invalidatePrefix('teams');
  });
}

// ============================================================================
// WRITE OPERATIONS - Location endpoints
// ============================================================================

/**
 * Create a new location
 */
export async function createLocation(input: CreateLocationInput): Promise<Location> {
  return auditedOperation(AuditAction.CREATE, 'location', undefined, async () => {
    const location = await postOne<Location>('/locations/locations', input);
    cache.invalidatePrefix('locations');
    return location;
  });
}

/**
 * Update an existing location
 */
export async function updateLocation(id: number, input: UpdateLocationInput): Promise<Location> {
  if (!id || id <= 0) {
    throw new Error('Invalid location ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'location', id, async () => {
    const location = await patchOne<Location>(`/locations/locations/${id}`, input);
    cache.invalidate(`location:${id}`);
    cache.invalidatePrefix('locations');
    return location;
  });
}

/**
 * Delete a location
 */
export async function deleteLocation(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid location ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'location', id, async () => {
    await deleteOne(`/locations/locations/${id}`);
    cache.invalidate(`location:${id}`);
    cache.invalidatePrefix('locations');
  });
}

// ============================================================================
// WRITE OPERATIONS - Leave endpoints
// ============================================================================

/**
 * Create a new leave request
 */
export async function createLeave(input: CreateLeaveInput): Promise<Leave> {
  return auditedOperation(AuditAction.CREATE, 'leave', undefined, async () => {
    const leave = await postOne<Leave>('/timeoff/leaves', input);
    return leave;
  });
}

/**
 * Update a leave request
 */
export async function updateLeave(id: number, input: UpdateLeaveInput): Promise<Leave> {
  if (!id || id <= 0) {
    throw new Error('Invalid leave ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'leave', id, async () => {
    const leave = await patchOne<Leave>(`/timeoff/leaves/${id}`, input);
    return leave;
  });
}

/**
 * Cancel a leave request
 */
export async function cancelLeave(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid leave ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'leave', id, async () => {
    await deleteOne(`/timeoff/leaves/${id}`);
  });
}

/**
 * Approve a leave request
 */
export async function approveLeave(id: number, input?: LeaveDecisionInput): Promise<Leave> {
  if (!id || id <= 0) {
    throw new Error('Invalid leave ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.APPROVE, 'leave', id, async () => {
    const leave = await postAction<Leave>(`/timeoff/leaves/${id}/approve`, input || {});
    return leave;
  });
}

/**
 * Reject a leave request
 */
export async function rejectLeave(id: number, input?: LeaveDecisionInput): Promise<Leave> {
  if (!id || id <= 0) {
    throw new Error('Invalid leave ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.REJECT, 'leave', id, async () => {
    const leave = await postAction<Leave>(`/timeoff/leaves/${id}/reject`, input || {});
    return leave;
  });
}

// ============================================================================
// WRITE OPERATIONS - Shift endpoints
// ============================================================================

/**
 * Create a new shift
 */
export async function createShift(input: CreateShiftInput): Promise<Shift> {
  return auditedOperation(AuditAction.CREATE, 'shift', undefined, async () => {
    const shift = await postOne<Shift>('/attendance/shifts', input);
    return shift;
  });
}

/**
 * Update a shift
 */
export async function updateShift(id: number, input: UpdateShiftInput): Promise<Shift> {
  if (!id || id <= 0) {
    throw new Error('Invalid shift ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'shift', id, async () => {
    const shift = await patchOne<Shift>(`/attendance/shifts/${id}`, input);
    return shift;
  });
}

/**
 * Delete a shift
 */
export async function deleteShift(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid shift ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'shift', id, async () => {
    await deleteOne(`/attendance/shifts/${id}`);
  });
}

// ============================================================================
// Projects & Time Tracking - READ endpoints
// ============================================================================

/**
 * List all projects
 */
export async function listProjects(options?: PaginationInput): Promise<PaginatedResponse<Project>> {
  const params = buildPaginationParams(options);
  const projects = await cached(
    CacheManager.key('projects', options),
    () => fetchList<Project>('/project_management/projects'),
    CACHE_TTL.default
  );
  return sliceForPagination(projects, params);
}

/**
 * Get a specific project by ID
 */
export async function getProject(id: number): Promise<Project> {
  if (!id || id <= 0) {
    throw new Error('Invalid project ID. Please provide a positive number.');
  }
  return cached(
    `project:${id}`,
    () => fetchOne<Project>(`/project_management/projects/${id}`),
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

  const tasks = await fetchList<ProjectTask>('/project_management/project_tasks', {
    params: queryParams,
  });
  return sliceForPagination(tasks, params);
}

/**
 * Get a specific project task by ID
 */
export async function getProjectTask(id: number): Promise<ProjectTask> {
  if (!id || id <= 0) {
    throw new Error('Invalid task ID. Please provide a positive number.');
  }
  return fetchOne<ProjectTask>(`/project_management/project_tasks/${id}`);
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

  const workers = await fetchList<ProjectWorker>('/project_management/project_workers', {
    params: queryParams,
  });
  return sliceForPagination(workers, params);
}

/**
 * Get a specific project worker by ID
 */
export async function getProjectWorker(id: number): Promise<ProjectWorker> {
  if (!id || id <= 0) {
    throw new Error('Invalid project worker ID. Please provide a positive number.');
  }
  return fetchOne<ProjectWorker>(`/project_management/project_workers/${id}`);
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

  const records = await fetchList<TimeRecord>('/project_management/time_records', {
    params: queryParams,
  });
  return sliceForPagination(records, params);
}

/**
 * Get a specific time record by ID
 */
export async function getTimeRecord(id: number): Promise<TimeRecord> {
  if (!id || id <= 0) {
    throw new Error('Invalid time record ID. Please provide a positive number.');
  }
  return fetchOne<TimeRecord>(`/project_management/time_records/${id}`);
}

// ============================================================================
// Projects & Time Tracking - WRITE endpoints
// ============================================================================

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return auditedOperation(AuditAction.CREATE, 'project', undefined, async () => {
    const project = await postOne<Project>('/project_management/projects', input);
    cache.invalidatePrefix('projects');
    return project;
  });
}

/**
 * Update a project
 */
export async function updateProject(id: number, input: UpdateProjectInput): Promise<Project> {
  if (!id || id <= 0) {
    throw new Error('Invalid project ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'project', id, async () => {
    const project = await patchOne<Project>(`/project_management/projects/${id}`, input);
    cache.invalidate(`project:${id}`);
    cache.invalidatePrefix('projects');
    return project;
  });
}

/**
 * Delete a project
 */
export async function deleteProject(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid project ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'project', id, async () => {
    await deleteOne(`/project_management/projects/${id}`);
    cache.invalidate(`project:${id}`);
    cache.invalidatePrefix('projects');
  });
}

/**
 * Create a project task
 */
export async function createProjectTask(input: CreateProjectTaskInput): Promise<ProjectTask> {
  return auditedOperation(AuditAction.CREATE, 'project_task', undefined, async () => {
    return postOne<ProjectTask>('/project_management/project_tasks', input);
  });
}

/**
 * Update a project task
 */
export async function updateProjectTask(
  id: number,
  input: UpdateProjectTaskInput
): Promise<ProjectTask> {
  if (!id || id <= 0) {
    throw new Error('Invalid task ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'project_task', id, async () => {
    return patchOne<ProjectTask>(`/project_management/project_tasks/${id}`, input);
  });
}

/**
 * Delete a project task
 */
export async function deleteProjectTask(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid task ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'project_task', id, async () => {
    await deleteOne(`/project_management/project_tasks/${id}`);
  });
}

/**
 * Assign a worker to a project
 */
export async function assignProjectWorker(input: AssignProjectWorkerInput): Promise<ProjectWorker> {
  return auditedOperation(AuditAction.ASSIGN, 'project_worker', undefined, async () => {
    return postOne<ProjectWorker>('/project_management/project_workers', input);
  });
}

/**
 * Remove a worker from a project
 */
export async function removeProjectWorker(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid project worker ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UNASSIGN, 'project_worker', id, async () => {
    await deleteOne(`/project_management/project_workers/${id}`);
  });
}

/**
 * Create a time record
 */
export async function createTimeRecord(input: CreateTimeRecordInput): Promise<TimeRecord> {
  return auditedOperation(AuditAction.CREATE, 'time_record', undefined, async () => {
    return postOne<TimeRecord>('/project_management/time_records', input);
  });
}

/**
 * Update a time record
 */
export async function updateTimeRecord(
  id: number,
  input: UpdateTimeRecordInput
): Promise<TimeRecord> {
  if (!id || id <= 0) {
    throw new Error('Invalid time record ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'time_record', id, async () => {
    return patchOne<TimeRecord>(`/project_management/time_records/${id}`, input);
  });
}

/**
 * Delete a time record
 */
export async function deleteTimeRecord(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid time record ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'time_record', id, async () => {
    await deleteOne(`/project_management/time_records/${id}`);
  });
}

// ============================================================================
// Training & Development - READ endpoints
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
    () => fetchList<Training>('/trainings/trainings'),
    CACHE_TTL.default
  );
  return sliceForPagination(trainings, params);
}

/**
 * Get a specific training by ID
 */
export async function getTraining(id: number): Promise<Training> {
  if (!id || id <= 0) {
    throw new Error('Invalid training ID. Please provide a positive number.');
  }
  return cached(
    `training:${id}`,
    () => fetchOne<Training>(`/trainings/trainings/${id}`),
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

  const sessions = await fetchList<TrainingSession>('/trainings/sessions', { params: queryParams });
  return sliceForPagination(sessions, params);
}

/**
 * Get a specific training session by ID
 */
export async function getTrainingSession(id: number): Promise<TrainingSession> {
  if (!id || id <= 0) {
    throw new Error('Invalid session ID. Please provide a positive number.');
  }
  return fetchOne<TrainingSession>(`/trainings/sessions/${id}`);
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

  const enrollments = await fetchList<TrainingMembership>('/trainings/memberships', {
    params: queryParams,
  });
  return sliceForPagination(enrollments, params);
}

/**
 * Get a specific training enrollment by ID
 */
export async function getTrainingEnrollment(id: number): Promise<TrainingMembership> {
  if (!id || id <= 0) {
    throw new Error('Invalid enrollment ID. Please provide a positive number.');
  }
  return fetchOne<TrainingMembership>(`/trainings/memberships/${id}`);
}

// ============================================================================
// Training & Development - WRITE endpoints
// ============================================================================

/**
 * Create a training program
 */
export async function createTraining(input: CreateTrainingInput): Promise<Training> {
  return auditedOperation(AuditAction.CREATE, 'training', undefined, async () => {
    const training = await postOne<Training>('/trainings/trainings', input);
    cache.invalidatePrefix('trainings');
    return training;
  });
}

/**
 * Update a training program
 */
export async function updateTraining(id: number, input: UpdateTrainingInput): Promise<Training> {
  if (!id || id <= 0) {
    throw new Error('Invalid training ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'training', id, async () => {
    const training = await patchOne<Training>(`/trainings/trainings/${id}`, input);
    cache.invalidate(`training:${id}`);
    cache.invalidatePrefix('trainings');
    return training;
  });
}

/**
 * Delete a training program
 */
export async function deleteTraining(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid training ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'training', id, async () => {
    await deleteOne(`/trainings/trainings/${id}`);
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
    return postOne<TrainingSession>('/trainings/sessions', input);
  });
}

/**
 * Update a training session
 */
export async function updateTrainingSession(
  id: number,
  input: UpdateTrainingSessionInput
): Promise<TrainingSession> {
  if (!id || id <= 0) {
    throw new Error('Invalid session ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'training_session', id, async () => {
    return patchOne<TrainingSession>(`/trainings/sessions/${id}`, input);
  });
}

/**
 * Delete a training session
 */
export async function deleteTrainingSession(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid session ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'training_session', id, async () => {
    await deleteOne(`/trainings/sessions/${id}`);
  });
}

/**
 * Enroll an employee in a training
 */
export async function enrollInTraining(input: EnrollTrainingInput): Promise<TrainingMembership> {
  return auditedOperation(AuditAction.ASSIGN, 'training_enrollment', undefined, async () => {
    return postOne<TrainingMembership>('/trainings/memberships', input);
  });
}

/**
 * Remove enrollment from a training
 */
export async function unenrollFromTraining(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid enrollment ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UNASSIGN, 'training_enrollment', id, async () => {
    await deleteOne(`/trainings/memberships/${id}`);
  });
}

// ============================================================================
// Work Areas - READ/WRITE endpoints
// ============================================================================

/**
 * List all work areas
 */
export async function listWorkAreas(
  options?: PaginationInput
): Promise<PaginatedResponse<WorkArea>> {
  const params = buildPaginationParams(options);
  const workAreas = await cached(
    CacheManager.key('work_areas', options),
    () => fetchList<WorkArea>('/locations/work_areas'),
    CACHE_TTL.locations
  );
  return sliceForPagination(workAreas, params);
}

/**
 * Get a specific work area by ID
 */
export async function getWorkArea(id: number): Promise<WorkArea> {
  if (!id || id <= 0) {
    throw new Error('Invalid work area ID. Please provide a positive number.');
  }
  return cached(
    `work_area:${id}`,
    () => fetchOne<WorkArea>(`/locations/work_areas/${id}`),
    CACHE_TTL.locations
  );
}

/**
 * Create a work area
 */
export async function createWorkArea(input: CreateWorkAreaInput): Promise<WorkArea> {
  return auditedOperation(AuditAction.CREATE, 'work_area', undefined, async () => {
    const workArea = await postOne<WorkArea>('/locations/work_areas', input);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

/**
 * Update a work area
 */
export async function updateWorkArea(id: number, input: UpdateWorkAreaInput): Promise<WorkArea> {
  if (!id || id <= 0) {
    throw new Error('Invalid work area ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'work_area', id, async () => {
    const workArea = await patchOne<WorkArea>(`/locations/work_areas/${id}`, input);
    cache.invalidate(`work_area:${id}`);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

/**
 * Archive a work area
 */
export async function archiveWorkArea(id: number): Promise<WorkArea> {
  if (!id || id <= 0) {
    throw new Error('Invalid work area ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.ARCHIVE, 'work_area', id, async () => {
    const workArea = await postAction<WorkArea>(`/locations/work_areas/${id}/archive`);
    cache.invalidate(`work_area:${id}`);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

/**
 * Unarchive a work area
 */
export async function unarchiveWorkArea(id: number): Promise<WorkArea> {
  if (!id || id <= 0) {
    throw new Error('Invalid work area ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UNARCHIVE, 'work_area', id, async () => {
    const workArea = await postAction<WorkArea>(`/locations/work_areas/${id}/unarchive`);
    cache.invalidate(`work_area:${id}`);
    cache.invalidatePrefix('work_areas');
    return workArea;
  });
}

// ============================================================================
// ATS (Recruiting) - READ endpoints
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
    () => fetchList<JobPosting>('/ats/job_postings'),
    CACHE_TTL.default
  );
  return sliceForPagination(postings, params);
}

/**
 * Get a specific job posting by ID
 */
export async function getJobPosting(id: number): Promise<JobPosting> {
  if (!id || id <= 0) {
    throw new Error('Invalid job posting ID. Please provide a positive number.');
  }
  return cached(
    `job_posting:${id}`,
    () => fetchOne<JobPosting>(`/ats/job_postings/${id}`),
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
  const candidates = await fetchList<Candidate>('/ats/candidates');
  return sliceForPagination(candidates, params);
}

/**
 * Get a specific candidate by ID
 */
export async function getCandidate(id: number): Promise<Candidate> {
  if (!id || id <= 0) {
    throw new Error('Invalid candidate ID. Please provide a positive number.');
  }
  return fetchOne<Candidate>(`/ats/candidates/${id}`);
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

  const applications = await fetchList<Application>('/ats/applications', { params: queryParams });
  return sliceForPagination(applications, params);
}

/**
 * Get a specific application by ID
 */
export async function getApplication(id: number): Promise<Application> {
  if (!id || id <= 0) {
    throw new Error('Invalid application ID. Please provide a positive number.');
  }
  return fetchOne<Application>(`/ats/applications/${id}`);
}

/**
 * List all hiring stages
 */
export async function listHiringStages(): Promise<HiringStage[]> {
  return cached(
    'hiring_stages:all',
    () => fetchList<HiringStage>('/ats/hiring_stages'),
    CACHE_TTL.default
  );
}

/**
 * Get a specific hiring stage by ID
 */
export async function getHiringStage(id: number): Promise<HiringStage> {
  if (!id || id <= 0) {
    throw new Error('Invalid hiring stage ID. Please provide a positive number.');
  }
  return fetchOne<HiringStage>(`/ats/hiring_stages/${id}`);
}

// ============================================================================
// ATS (Recruiting) - WRITE endpoints
// ============================================================================

/**
 * Create a job posting
 */
export async function createJobPosting(input: CreateJobPostingInput): Promise<JobPosting> {
  return auditedOperation(AuditAction.CREATE, 'job_posting', undefined, async () => {
    const posting = await postOne<JobPosting>('/ats/job_postings', input);
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
  if (!id || id <= 0) {
    throw new Error('Invalid job posting ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'job_posting', id, async () => {
    const posting = await patchOne<JobPosting>(`/ats/job_postings/${id}`, input);
    cache.invalidate(`job_posting:${id}`);
    cache.invalidatePrefix('job_postings');
    return posting;
  });
}

/**
 * Delete a job posting
 */
export async function deleteJobPosting(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid job posting ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'job_posting', id, async () => {
    await deleteOne(`/ats/job_postings/${id}`);
    cache.invalidate(`job_posting:${id}`);
    cache.invalidatePrefix('job_postings');
  });
}

/**
 * Create a candidate
 */
export async function createCandidate(input: CreateCandidateInput): Promise<Candidate> {
  return auditedOperation(AuditAction.CREATE, 'candidate', undefined, async () => {
    return postOne<Candidate>('/ats/candidates', input);
  });
}

/**
 * Update a candidate
 */
export async function updateCandidate(id: number, input: UpdateCandidateInput): Promise<Candidate> {
  if (!id || id <= 0) {
    throw new Error('Invalid candidate ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'candidate', id, async () => {
    return patchOne<Candidate>(`/ats/candidates/${id}`, input);
  });
}

/**
 * Delete a candidate
 */
export async function deleteCandidate(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid candidate ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'candidate', id, async () => {
    await deleteOne(`/ats/candidates/${id}`);
  });
}

/**
 * Create an application
 */
export async function createApplication(input: CreateApplicationInput): Promise<Application> {
  return auditedOperation(AuditAction.CREATE, 'application', undefined, async () => {
    return postOne<Application>('/ats/applications', input);
  });
}

/**
 * Update an application
 */
export async function updateApplication(
  id: number,
  input: UpdateApplicationInput
): Promise<Application> {
  if (!id || id <= 0) {
    throw new Error('Invalid application ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'application', id, async () => {
    return patchOne<Application>(`/ats/applications/${id}`, input);
  });
}

/**
 * Delete an application
 */
export async function deleteApplication(id: number): Promise<void> {
  if (!id || id <= 0) {
    throw new Error('Invalid application ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.DELETE, 'application', id, async () => {
    await deleteOne(`/ats/applications/${id}`);
  });
}

/**
 * Advance an application to the next stage
 */
export async function advanceApplication(id: number): Promise<Application> {
  if (!id || id <= 0) {
    throw new Error('Invalid application ID. Please provide a positive number.');
  }

  return auditedOperation(AuditAction.UPDATE, 'application', id, async () => {
    return postAction<Application>(`/ats/applications/${id}/apply`);
  });
}

// ============================================================================
// Payroll - READ-ONLY endpoints (sensitive data)
// ============================================================================

/**
 * List payroll supplements for an employee
 */
export async function listPayrollSupplements(
  employeeId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<PayrollSupplement>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (employeeId) queryParams.employee_id = employeeId;

  const supplements = await fetchList<PayrollSupplement>('/payroll/supplements', {
    params: queryParams,
  });
  return sliceForPagination(supplements, params);
}

/**
 * Get a specific payroll supplement by ID
 */
export async function getPayrollSupplement(id: number): Promise<PayrollSupplement> {
  if (!id || id <= 0) {
    throw new Error('Invalid supplement ID. Please provide a positive number.');
  }
  return fetchOne<PayrollSupplement>(`/payroll/supplements/${id}`);
}

/**
 * List tax identifiers
 */
export async function listTaxIdentifiers(
  employeeId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<TaxIdentifier>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (employeeId) queryParams.employee_id = employeeId;

  const identifiers = await fetchList<TaxIdentifier>('/payroll_employees/identifiers', {
    params: queryParams,
  });
  return sliceForPagination(identifiers, params);
}

/**
 * Get a specific tax identifier by ID
 */
export async function getTaxIdentifier(id: number): Promise<TaxIdentifier> {
  if (!id || id <= 0) {
    throw new Error('Invalid tax identifier ID. Please provide a positive number.');
  }
  return fetchOne<TaxIdentifier>(`/payroll_employees/identifiers/${id}`);
}

/**
 * List family situations
 */
export async function listFamilySituations(
  employeeId?: number,
  options?: PaginationInput
): Promise<PaginatedResponse<FamilySituation>> {
  const params = buildPaginationParams(options);
  const queryParams: Record<string, string | number | undefined> = {};
  if (employeeId) queryParams.employee_id = employeeId;

  const situations = await fetchList<FamilySituation>('/payroll/family_situations', {
    params: queryParams,
  });
  return sliceForPagination(situations, params);
}

/**
 * Get a specific family situation by ID
 */
export async function getFamilySituation(id: number): Promise<FamilySituation> {
  if (!id || id <= 0) {
    throw new Error('Invalid family situation ID. Please provide a positive number.');
  }
  return fetchOne<FamilySituation>(`/payroll/family_situations/${id}`);
}
