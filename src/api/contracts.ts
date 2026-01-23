/**
 * Contract API endpoints
 */

import { fetchList } from '../http-client.js';
import { cached, CACHE_TTL } from '../cache.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type { Employee, Contract } from '../schemas.js';
import { validateId } from '../utils.js';
import { ENDPOINTS } from '../endpoints.js';
import { getEmployee } from './employees.js';

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

/**
 * Get the latest contract for an employee
 * Returns the most recent contract based on effective_on date
 */
export async function getLatestContract(employeeId: number): Promise<Contract | null> {
  validateId(employeeId, 'employee');

  const allContracts = await cached(
    'contracts:all',
    () => fetchList<Contract>(ENDPOINTS.contracts),
    CACHE_TTL.contracts
  );

  const employeeContracts = allContracts.filter(c => c.employee_id === employeeId);

  if (employeeContracts.length === 0) {
    return null;
  }

  // Sort by effective_on descending (most recent first)
  employeeContracts.sort((a, b) => {
    const dateA = a.effective_on ? new Date(a.effective_on).getTime() : 0;
    const dateB = b.effective_on ? new Date(b.effective_on).getTime() : 0;
    return dateB - dateA;
  });

  return employeeContracts[0];
}

/**
 * Employee with their latest contract data
 */
export interface EmployeeWithContract {
  employee: Employee;
  contract: Contract | null;
}

/**
 * Get an employee with their latest contract
 * Combines employee data with compensation/job role info from their contract
 */
export async function getEmployeeWithContract(employeeId: number): Promise<EmployeeWithContract> {
  validateId(employeeId, 'employee');

  // Fetch employee and contract in parallel
  const [employee, contract] = await Promise.all([
    getEmployee(employeeId),
    getLatestContract(employeeId),
  ]);

  return { employee, contract };
}

/**
 * List employees by job role ID
 * Uses contract data to find employees assigned to a specific job role
 *
 * Note: Job role assignment is stored in contracts (job_catalog_role_id),
 * not on the employee object itself. This is an API design choice by Factorial.
 */
export async function listEmployeesByJobRole(
  jobRoleId: number,
  options?: PaginationInput
): Promise<PaginatedResponse<EmployeeWithContract>> {
  validateId(jobRoleId, 'job role');
  const params = buildPaginationParams(options);

  // Get all contracts and filter by job role
  const allContracts = await cached(
    'contracts:all',
    () => fetchList<Contract>(ENDPOINTS.contracts),
    CACHE_TTL.contracts
  );

  // Find contracts with this job role, grouped by employee (latest contract per employee)
  const latestContractsByEmployee = new Map<number, Contract>();

  for (const contract of allContracts) {
    if (contract.job_catalog_role_id === jobRoleId) {
      const existing = latestContractsByEmployee.get(contract.employee_id);
      if (!existing) {
        latestContractsByEmployee.set(contract.employee_id, contract);
      } else {
        // Keep the more recent contract
        const existingDate = existing.effective_on ? new Date(existing.effective_on).getTime() : 0;
        const contractDate = contract.effective_on ? new Date(contract.effective_on).getTime() : 0;
        if (contractDate > existingDate) {
          latestContractsByEmployee.set(contract.employee_id, contract);
        }
      }
    }
  }

  const employeeIds = Array.from(latestContractsByEmployee.keys());

  if (employeeIds.length === 0) {
    return { data: [], meta: { page: params.page, limit: params.limit, total: 0 } };
  }

  // Get all employees
  const allEmployees = await cached(
    'employees:all',
    () => fetchList<Employee>(ENDPOINTS.employees),
    CACHE_TTL.employees
  );

  // Match employees with their contracts
  const results: EmployeeWithContract[] = [];
  for (const emp of allEmployees) {
    const contract = latestContractsByEmployee.get(emp.id);
    if (contract) {
      results.push({ employee: emp, contract });
    }
  }

  return sliceForPagination(results, params);
}

/**
 * List employees by job level ID
 * Uses contract data to find employees at a specific job level
 */
export async function listEmployeesByJobLevel(
  jobLevelId: number,
  options?: PaginationInput
): Promise<PaginatedResponse<EmployeeWithContract>> {
  validateId(jobLevelId, 'job level');
  const params = buildPaginationParams(options);

  // Get all contracts and filter by job level
  const allContracts = await cached(
    'contracts:all',
    () => fetchList<Contract>(ENDPOINTS.contracts),
    CACHE_TTL.contracts
  );

  // Find contracts with this job level, grouped by employee (latest contract per employee)
  const latestContractsByEmployee = new Map<number, Contract>();

  for (const contract of allContracts) {
    if (contract.job_catalog_level_id === jobLevelId) {
      const existing = latestContractsByEmployee.get(contract.employee_id);
      if (!existing) {
        latestContractsByEmployee.set(contract.employee_id, contract);
      } else {
        const existingDate = existing.effective_on ? new Date(existing.effective_on).getTime() : 0;
        const contractDate = contract.effective_on ? new Date(contract.effective_on).getTime() : 0;
        if (contractDate > existingDate) {
          latestContractsByEmployee.set(contract.employee_id, contract);
        }
      }
    }
  }

  const employeeIds = Array.from(latestContractsByEmployee.keys());

  if (employeeIds.length === 0) {
    return { data: [], meta: { page: params.page, limit: params.limit, total: 0 } };
  }

  // Get all employees
  const allEmployees = await cached(
    'employees:all',
    () => fetchList<Employee>(ENDPOINTS.employees),
    CACHE_TTL.employees
  );

  // Match employees with their contracts
  const results: EmployeeWithContract[] = [];
  for (const emp of allEmployees) {
    const contract = latestContractsByEmployee.get(emp.id);
    if (contract) {
      results.push({ employee: emp, contract });
    }
  }

  return sliceForPagination(results, params);
}
