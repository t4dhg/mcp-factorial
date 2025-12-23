/**
 * FactorialHR API Client
 *
 * Provides access to FactorialHR API endpoints with caching, pagination, and retry logic.
 */

import { fetchList, fetchOne } from './http-client.js';
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
} from './schemas.js';
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
