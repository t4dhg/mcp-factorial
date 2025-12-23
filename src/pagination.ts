/**
 * Pagination utilities for MCP FactorialHR
 *
 * Provides consistent pagination handling across all list operations.
 */

/**
 * Input parameters for paginated requests from MCP tools
 */
export interface PaginationInput {
  /** Page number (1-based) */
  page?: number;
  /** Items per page (max: 100) */
  limit?: number;
}

/**
 * Parameters sent to the Factorial API
 */
export interface PaginationParams extends Record<string, number> {
  page: number;
  limit: number;
}

/**
 * Metadata about the paginated response
 */
export interface PaginationMeta {
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of items (if available) */
  total?: number;
  /** Total number of pages (if available) */
  totalPages?: number;
  /** Whether there are more pages */
  hasNextPage?: boolean;
  /** Whether there are previous pages */
  hasPreviousPage?: boolean;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** The data items */
  data: T[];
  /** Pagination metadata */
  meta: PaginationMeta;
}

/**
 * Default and maximum values for pagination
 */
export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 100,
  maxLimit: 100,
} as const;

/**
 * Build pagination parameters from user input
 * @param input - User-provided pagination options
 * @returns Validated pagination parameters
 */
export function buildPaginationParams(input?: PaginationInput): PaginationParams {
  const page = Math.max(1, input?.page ?? PAGINATION_DEFAULTS.page);
  const limit = Math.min(
    Math.max(1, input?.limit ?? PAGINATION_DEFAULTS.limit),
    PAGINATION_DEFAULTS.maxLimit
  );

  return { page, limit };
}

/**
 * Calculate offset from page and limit
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Calculate total pages from total items and limit
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Create pagination metadata from response
 * @param page - Current page
 * @param limit - Items per page
 * @param itemCount - Number of items in current response
 * @param total - Total items (if known)
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  itemCount: number,
  total?: number
): PaginationMeta {
  const meta: PaginationMeta = {
    page,
    limit,
  };

  if (total !== undefined) {
    meta.total = total;
    meta.totalPages = calculateTotalPages(total, limit);
    meta.hasNextPage = page < meta.totalPages;
    meta.hasPreviousPage = page > 1;
  } else {
    // Estimate hasNextPage based on whether we got a full page
    meta.hasNextPage = itemCount === limit;
    meta.hasPreviousPage = page > 1;
  }

  return meta;
}

/**
 * Wrap data with pagination metadata
 */
export function paginateResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total?: number
): PaginatedResponse<T> {
  return {
    data,
    meta: createPaginationMeta(page, limit, data.length, total),
  };
}

/**
 * Format pagination info for MCP tool response
 */
export function formatPaginationInfo(meta: PaginationMeta): string {
  const parts: string[] = [`Page ${meta.page}`];

  if (meta.totalPages) {
    parts.push(`of ${meta.totalPages}`);
  }

  if (meta.total !== undefined) {
    parts.push(`(${meta.total} total items)`);
  }

  if (meta.hasNextPage) {
    parts.push('- More pages available');
  }

  return parts.join(' ');
}

/**
 * Fetch all pages of a paginated resource
 * @param fetcher - Function that fetches a single page
 * @param maxPages - Maximum number of pages to fetch (safety limit)
 */
export async function fetchAllPages<T>(
  fetcher: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
  maxPages = 10
): Promise<T[]> {
  const allData: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const response = await fetcher({ page, limit: PAGINATION_DEFAULTS.maxLimit });
    allData.push(...response.data);

    hasMore = response.meta.hasNextPage ?? false;
    page++;
  }

  if (page > maxPages && hasMore) {
    console.warn(
      `[mcp-factorial] Stopped fetching at page ${maxPages}. More data may be available.`
    );
  }

  return allData;
}

/**
 * Slice an array to simulate pagination (for client-side filtering)
 */
export function sliceForPagination<T>(data: T[], params: PaginationParams): PaginatedResponse<T> {
  const offset = calculateOffset(params.page, params.limit);
  const sliced = data.slice(offset, offset + params.limit);
  return paginateResponse(sliced, params.page, params.limit, data.length);
}
