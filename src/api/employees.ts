/**
 * Employee API endpoints
 */

import { fetchList, fetchOne, postOne, patchOne } from '../http-client.js';
import { cache, cached, CACHE_TTL, CacheManager } from '../cache.js';
import {
  buildPaginationParams,
  paginateResponse,
  sliceForPagination,
  type PaginatedResponse,
} from '../pagination.js';
import type { Employee, CreateEmployeeInput, UpdateEmployeeInput } from '../schemas.js';
import { AuditAction, auditedOperation } from '../audit.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';
import { NotFoundError } from '../errors.js';
import type { ListEmployeesOptions } from '../types.js';

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
