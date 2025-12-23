/**
 * FactorialHR API Client
 *
 * Provides access to FactorialHR API endpoints with caching, pagination, and retry logic.
 */

import { fetchList, fetchOne, postOne, patchOne, deleteOne, postAction } from './http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from './cache.js';
import { debug } from './config.js';
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
import { validateId } from './utils.js';
import { ENDPOINTS, endpointWithId, endpointWithAction } from './endpoints.js';
import { NotFoundError } from './errors.js';
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
      () => fetchList<Employee>(ENDPOINTS.employees),
      CACHE_TTL.employees
    );

    let filtered = allEmployees;
    // Note: team_id filtering requires fetching teams separately (not on Employee object)
    // TODO: Implement team filtering via teams endpoint if needed
    if (options.location_id) {
      filtered = filtered.filter(e => e.location_id === options.location_id);
    }

    return sliceForPagination(filtered, params);
  }

  // Without filters, use pagination directly
  const employees = await cached(
    cacheKey,
    () => fetchList<Employee>(ENDPOINTS.employees, { params }),
    CACHE_TTL.employees
  );

  return paginateResponse(employees, params.page, params.limit);
}

/**
 * Get a specific employee by ID
 *
 * Note: The Factorial API's individual employee endpoint (/employees/employees/{id})
 * can be unreliable. This function falls back to fetching all employees and filtering
 * if the direct endpoint fails or returns no data.
 */
export async function getEmployee(id: number): Promise<Employee> {
  validateId(id, 'employee');

  // Try the direct endpoint first
  try {
    const employee = await cached(
      `employee:${id}`,
      () => fetchOne<Employee>(endpointWithId(ENDPOINTS.employees, id)),
      CACHE_TTL.employees
    );

    // If we got a valid employee, return it
    if (employee) {
      return employee;
    }
  } catch (error) {
    // If direct fetch fails with NotFoundError, try fallback
    // (other errors will be re-thrown below)
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }

  // Fallback: Fetch all employees and filter (same approach as searchEmployees)
  // This works around Factorial API limitations with the individual employee endpoint
  const allEmployees = await cached(
    'employees:all',
    () => fetchList<Employee>(ENDPOINTS.employees),
    CACHE_TTL.employees
  );

  const employee = allEmployees.find(emp => emp.id === id);

  if (!employee) {
    throw new Error(`Employee with ID ${id} not found.`);
  }

  return employee;
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
    () => fetchList<Employee>(ENDPOINTS.employees),
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
  if (employeeId !== undefined) {
    validateId(employeeId, 'employee');
  }

  const params = buildPaginationParams(options);

  // Note: The API doesn't reliably filter by employee_id query param,
  // so we fetch all contracts and filter client-side
  const allContracts = await cached(
    'contracts:all',
    () => fetchList<Contract>(ENDPOINTS.contracts),
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

// ============================================================================
// Document endpoints (Read-only)
// ============================================================================

/**
 * List all folders
 */
export async function listFolders(): Promise<Folder[]> {
  return cached('folders:all', () => fetchList<Folder>(ENDPOINTS.folders), CACHE_TTL.default);
}

/**
 * Get a specific folder by ID
 */
export async function getFolder(id: number): Promise<Folder> {
  validateId(id, 'folder');

  return fetchOne<Folder>(endpointWithId(ENDPOINTS.folders, id));
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

  // Handle employee_ids array parameter
  // Factorial API expects: employee_ids[]=123&employee_ids[]=456
  if (options?.employee_ids && options.employee_ids.length > 0) {
    // We'll need to build the query string manually for array parameters
    const employeeIdsParam = options.employee_ids.map(id => `employee_ids[]=${id}`).join('&');
    const baseParams = new URLSearchParams(queryParams as Record<string, string>).toString();
    const fullParams = baseParams ? `${baseParams}&${employeeIdsParam}` : employeeIdsParam;

    // Make request with custom query string
    const documents = await fetchList<Document>(`${ENDPOINTS.documents}?${fullParams}`);

    debug(`listDocuments returned ${documents.length} documents`, {
      sampleDocument: documents[0],
      missingNames: documents.filter(d => !d.name).length,
    });

    return paginateResponse(documents, params.page, params.limit);
  }

  const documents = await fetchList<Document>(ENDPOINTS.documents, { params: queryParams });

  debug(`listDocuments returned ${documents.length} documents`, {
    sampleDocument: documents[0],
    missingNames: documents.filter(d => !d.name).length,
  });

  return paginateResponse(documents, params.page, params.limit);
}

/**
 * Get a specific document by ID
 *
 * Note: The Factorial API's individual document endpoint (/documents/documents/{id})
 * can be unreliable, similar to the employee endpoint. This function implements a fallback
 * to listing all documents and filtering if the direct endpoint fails or returns no data.
 *
 * @param id - The document ID
 * @returns The document object
 * @throws Error if document is not found
 */
export async function getDocument(id: number): Promise<Document> {
  validateId(id, 'document');

  // Try the direct endpoint first
  try {
    const document = await fetchOne<Document>(endpointWithId(ENDPOINTS.documents, id));

    // If we got a valid document, return it
    if (document) {
      return document;
    }
  } catch (error) {
    // If direct fetch fails with NotFoundError, try fallback
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
    debug(`getDocument(${id}) - direct endpoint failed, using fallback`);
  }

  // Fallback: Fetch all documents and filter by ID
  // This works around Factorial API limitations with the individual document endpoint
  const allDocuments = await fetchList<Document>(ENDPOINTS.documents);

  const document = allDocuments.find(doc => doc.id === id);

  if (!document) {
    throw new Error(`Document with ID ${id} not found.`);
  }

  return document;
}

// ============================================================================
// Job Catalog endpoints
// ============================================================================

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
      const employee = await postOne<Employee>(ENDPOINTS.employees, input);
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
  validateId(id, 'employee');

  return auditedOperation(AuditAction.UPDATE, 'employee', id, async () => {
    const employee = await patchOne<Employee>(endpointWithId(ENDPOINTS.employees, id), input);
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
  validateId(id, 'employee');

  return auditedOperation(
    AuditAction.TERMINATE,
    'employee',
    id,
    async () => {
      const employee = await patchOne<Employee>(endpointWithId(ENDPOINTS.employees, id), {
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

// ============================================================================
// WRITE OPERATIONS - Location endpoints
// ============================================================================

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

// ============================================================================
// WRITE OPERATIONS - Leave endpoints
// ============================================================================

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

// ============================================================================
// WRITE OPERATIONS - Shift endpoints
// ============================================================================

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
// Projects & Time Tracking - WRITE endpoints
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
// Training & Development - WRITE endpoints
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
// ATS (Recruiting) - WRITE endpoints
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

  const supplements = await fetchList<PayrollSupplement>(ENDPOINTS.payrollSupplements, {
    params: queryParams,
  });
  return sliceForPagination(supplements, params);
}

/**
 * Get a specific payroll supplement by ID
 */
export async function getPayrollSupplement(id: number): Promise<PayrollSupplement> {
  validateId(id, 'supplement');
  return fetchOne<PayrollSupplement>(endpointWithId(ENDPOINTS.payrollSupplements, id));
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

  const identifiers = await fetchList<TaxIdentifier>(ENDPOINTS.taxIdentifiers, {
    params: queryParams,
  });
  return sliceForPagination(identifiers, params);
}

/**
 * Get a specific tax identifier by ID
 */
export async function getTaxIdentifier(id: number): Promise<TaxIdentifier> {
  validateId(id, 'tax identifier');
  return fetchOne<TaxIdentifier>(endpointWithId(ENDPOINTS.taxIdentifiers, id));
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

  const situations = await fetchList<FamilySituation>(ENDPOINTS.familySituations, {
    params: queryParams,
  });
  return sliceForPagination(situations, params);
}

/**
 * Get a specific family situation by ID
 */
export async function getFamilySituation(id: number): Promise<FamilySituation> {
  validateId(id, 'family situation');
  return fetchOne<FamilySituation>(endpointWithId(ENDPOINTS.familySituations, id));
}
