/**
 * TypeScript types for MCP FactorialHR
 *
 * Re-exports types from schemas for backward compatibility
 * and adds additional utility types.
 */

// Re-export all types from schemas
export type {
  Employee,
  Team,
  Location,
  Contract,
  ContractSummary,
  Leave,
  LeaveType,
  Allowance,
  Shift,
  Folder,
  Document,
  JobRole,
  JobLevel,
} from './schemas.js';

// Re-export pagination types
export type {
  PaginationInput,
  PaginationParams,
  PaginationMeta,
  PaginatedResponse,
} from './pagination.js';

/**
 * Leave status options
 */
export type LeaveStatus = 'pending' | 'approved' | 'declined';

/**
 * Half day options
 */
export type HalfDay = 'all_day' | 'start' | 'finish';

/**
 * Options for listing employees
 */
export interface ListEmployeesOptions {
  team_id?: number;
  location_id?: number;
  page?: number;
  limit?: number;
}

/**
 * Options for listing leaves
 */
export interface ListLeavesOptions {
  employee_id?: number;
  status?: LeaveStatus;
  start_on_gte?: string;
  start_on_lte?: string;
  page?: number;
  limit?: number;
}

/**
 * Options for listing allowances
 */
export interface ListAllowancesOptions {
  employee_id?: number;
  page?: number;
  limit?: number;
}

/**
 * Options for listing shifts
 */
export interface ListShiftsOptions {
  employee_id?: number;
  clock_in_gte?: string;
  clock_in_lte?: string;
  page?: number;
  limit?: number;
}

/**
 * Options for listing documents
 */
export interface ListDocumentsOptions {
  folder_id?: number;
  employee_ids?: number[]; // Filter by employee IDs
  page?: number;
  limit?: number;
}

/**
 * Legacy ApiError type (for backward compatibility)
 */
export interface ApiError {
  error: string;
  message: string;
  status: number;
}
