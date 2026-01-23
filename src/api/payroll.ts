/**
 * Payroll API endpoints (Read-only)
 */

import { fetchList, fetchOne } from '../http-client.js';
import {
  buildPaginationParams,
  sliceForPagination,
  type PaginatedResponse,
  type PaginationInput,
} from '../pagination.js';
import type { PayrollSupplement, TaxIdentifier, FamilySituation } from '../schemas.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';

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
