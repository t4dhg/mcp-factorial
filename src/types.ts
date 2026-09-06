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
 * Half day values as the API serialises them (Factorial's spelling)
 */
export type HalfDay = 'beggining_of_day' | 'end_of_day';

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
  /** Filter by employee IDs (employee_ids[]) */
  employee_ids?: number[];
  /** Leaves overlapping the window starting on this date (YYYY-MM-DD) */
  from?: string;
  /** Leaves overlapping the window ending on this date (YYYY-MM-DD) */
  to?: string;
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
 *
 * Only filters the API honours are listed. /attendance/shifts ignores
 * `employee_id` (singular), `clock_in_gte`, `clock_in_lte`, `page` and
 * `limit`, and returns every matching record with `paginateable: false`, so
 * page and limit are applied client-side.
 */
export interface ListShiftsOptions {
  employee_ids?: number[];
  start_on?: string;
  end_on?: string;
  ids?: number[];
  updated_at?: string;
  workable?: boolean;
  half_day?: HalfDay;
  page?: number;
  limit?: number;
}

/**
 * Options for the per-day attendance summaries (estimated_times, worked_times)
 */
export interface DailyTimesOptions {
  employee_ids: number[];
  start_on: string;
  end_on: string;
}

/**
 * Options for listing documents
 */
export interface ListDocumentsOptions {
  folder_id?: number;
  employee_ids?: Array<number | string>; // Filter by employee IDs
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
