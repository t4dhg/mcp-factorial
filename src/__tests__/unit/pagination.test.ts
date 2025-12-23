import { describe, it, expect, vi } from 'vitest';
import {
  buildPaginationParams,
  calculateOffset,
  calculateTotalPages,
  createPaginationMeta,
  paginateResponse,
  formatPaginationInfo,
  fetchAllPages,
  sliceForPagination,
  PAGINATION_DEFAULTS,
  type PaginationInput,
  type PaginationParams,
  type PaginatedResponse,
} from '../../pagination.js';

describe('Pagination Module', () => {
  describe('PAGINATION_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(PAGINATION_DEFAULTS.page).toBe(1);
      expect(PAGINATION_DEFAULTS.limit).toBe(100);
      expect(PAGINATION_DEFAULTS.maxLimit).toBe(100);
    });
  });

  describe('buildPaginationParams', () => {
    it('should use defaults when no input provided', () => {
      const params = buildPaginationParams();
      expect(params).toEqual({ page: 1, limit: 100 });
    });

    it('should use provided page and limit', () => {
      const params = buildPaginationParams({ page: 3, limit: 50 });
      expect(params).toEqual({ page: 3, limit: 50 });
    });

    it('should enforce minimum page of 1', () => {
      const params = buildPaginationParams({ page: 0 });
      expect(params.page).toBe(1);

      const params2 = buildPaginationParams({ page: -5 });
      expect(params2.page).toBe(1);
    });

    it('should enforce maximum limit', () => {
      const params = buildPaginationParams({ limit: 200 });
      expect(params.limit).toBe(100);
    });

    it('should enforce minimum limit of 1', () => {
      const params = buildPaginationParams({ limit: 0 });
      expect(params.limit).toBe(1);

      const params2 = buildPaginationParams({ limit: -10 });
      expect(params2.limit).toBe(1);
    });

    it('should handle partial input', () => {
      const params1 = buildPaginationParams({ page: 5 });
      expect(params1).toEqual({ page: 5, limit: 100 });

      const params2 = buildPaginationParams({ limit: 25 });
      expect(params2).toEqual({ page: 1, limit: 25 });
    });
  });

  describe('calculateOffset', () => {
    it('should calculate offset for page 1', () => {
      expect(calculateOffset(1, 100)).toBe(0);
    });

    it('should calculate offset for page 2', () => {
      expect(calculateOffset(2, 100)).toBe(100);
    });

    it('should calculate offset for page 3', () => {
      expect(calculateOffset(3, 50)).toBe(100);
    });

    it('should calculate offset for various page sizes', () => {
      expect(calculateOffset(5, 20)).toBe(80);
      expect(calculateOffset(10, 10)).toBe(90);
      expect(calculateOffset(1, 25)).toBe(0);
    });
  });

  describe('calculateTotalPages', () => {
    it('should calculate total pages evenly', () => {
      expect(calculateTotalPages(100, 100)).toBe(1);
      expect(calculateTotalPages(200, 100)).toBe(2);
      expect(calculateTotalPages(300, 100)).toBe(3);
    });

    it('should round up for partial pages', () => {
      expect(calculateTotalPages(150, 100)).toBe(2);
      expect(calculateTotalPages(101, 100)).toBe(2);
      expect(calculateTotalPages(250, 100)).toBe(3);
    });

    it('should handle small datasets', () => {
      expect(calculateTotalPages(50, 100)).toBe(1);
      expect(calculateTotalPages(1, 100)).toBe(1);
    });

    it('should handle various page sizes', () => {
      expect(calculateTotalPages(100, 25)).toBe(4);
      expect(calculateTotalPages(75, 25)).toBe(3);
      expect(calculateTotalPages(76, 25)).toBe(4);
    });
  });

  describe('createPaginationMeta', () => {
    it('should create meta with total', () => {
      const meta = createPaginationMeta(2, 50, 50, 150);

      expect(meta).toEqual({
        page: 2,
        limit: 50,
        total: 150,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('should indicate no next page on last page', () => {
      const meta = createPaginationMeta(3, 50, 50, 150);

      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(true);
    });

    it('should indicate no previous page on first page', () => {
      const meta = createPaginationMeta(1, 50, 50, 150);

      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPreviousPage).toBe(false);
    });

    it('should estimate hasNextPage without total', () => {
      const meta = createPaginationMeta(1, 100, 100);

      expect(meta.total).toBeUndefined();
      expect(meta.totalPages).toBeUndefined();
      expect(meta.hasNextPage).toBe(true); // Full page suggests more data
      expect(meta.hasPreviousPage).toBe(false);
    });

    it('should indicate no next page for partial results without total', () => {
      const meta = createPaginationMeta(1, 100, 50);

      expect(meta.hasNextPage).toBe(false); // Partial page suggests end
    });

    it('should handle single page dataset', () => {
      const meta = createPaginationMeta(1, 100, 50, 50);

      expect(meta.totalPages).toBe(1);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });

    it('should handle empty results', () => {
      const meta = createPaginationMeta(1, 100, 0, 0);

      expect(meta.totalPages).toBe(0);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });
  });

  describe('paginateResponse', () => {
    it('should wrap data with pagination meta', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const response = paginateResponse(data, 1, 100, 3);

      expect(response.data).toEqual(data);
      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(100);
      expect(response.meta.total).toBe(3);
    });

    it('should work without total', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = paginateResponse(data, 2, 50);

      expect(response.data).toEqual(data);
      expect(response.meta.total).toBeUndefined();
      expect(response.meta.totalPages).toBeUndefined();
    });
  });

  describe('formatPaginationInfo', () => {
    it('should format complete pagination info', () => {
      const meta = {
        page: 2,
        limit: 50,
        total: 150,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      };

      const info = formatPaginationInfo(meta);

      expect(info).toContain('Page 2');
      expect(info).toContain('of 3');
      expect(info).toContain('(150 total items)');
      expect(info).toContain('More pages available');
    });

    it('should format without total pages', () => {
      const meta = {
        page: 1,
        limit: 100,
        total: 50,
        hasPreviousPage: false,
      };

      const info = formatPaginationInfo(meta);

      expect(info).toContain('Page 1');
      expect(info).toContain('(50 total items)');
      expect(info).not.toContain('of');
      expect(info).not.toContain('More pages');
    });

    it('should format without total', () => {
      const meta = {
        page: 3,
        limit: 25,
        hasNextPage: true,
        hasPreviousPage: true,
      };

      const info = formatPaginationInfo(meta);

      expect(info).toContain('Page 3');
      expect(info).toContain('More pages available');
      expect(info).not.toContain('total items');
    });

    it('should format last page', () => {
      const meta = {
        page: 5,
        limit: 20,
        total: 100,
        totalPages: 5,
        hasNextPage: false,
        hasPreviousPage: true,
      };

      const info = formatPaginationInfo(meta);

      expect(info).toContain('Page 5');
      expect(info).toContain('of 5');
      expect(info).not.toContain('More pages');
    });
  });

  describe('fetchAllPages', () => {
    it('should fetch all pages until hasNextPage is false', async () => {
      const mockFetcher = vi.fn();

      // Page 1: has next
      mockFetcher.mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        meta: { page: 1, limit: 100, hasNextPage: true, hasPreviousPage: false },
      });

      // Page 2: has next
      mockFetcher.mockResolvedValueOnce({
        data: [{ id: 3 }, { id: 4 }],
        meta: { page: 2, limit: 100, hasNextPage: true, hasPreviousPage: true },
      });

      // Page 3: no next
      mockFetcher.mockResolvedValueOnce({
        data: [{ id: 5 }],
        meta: { page: 3, limit: 100, hasNextPage: false, hasPreviousPage: true },
      });

      const result = await fetchAllPages(mockFetcher);

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
      expect(mockFetcher).toHaveBeenCalledTimes(3);
      expect(mockFetcher).toHaveBeenNthCalledWith(1, { page: 1, limit: 100 });
      expect(mockFetcher).toHaveBeenNthCalledWith(2, { page: 2, limit: 100 });
      expect(mockFetcher).toHaveBeenNthCalledWith(3, { page: 3, limit: 100 });
    });

    it('should respect maxPages limit', async () => {
      const mockFetcher = vi.fn();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // All pages have next
      for (let i = 0; i < 5; i++) {
        mockFetcher.mockResolvedValueOnce({
          data: [{ id: i }],
          meta: { page: i + 1, limit: 100, hasNextPage: true, hasPreviousPage: i > 0 },
        });
      }

      const result = await fetchAllPages(mockFetcher, 3);

      expect(result).toHaveLength(3);
      expect(mockFetcher).toHaveBeenCalledTimes(3);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stopped fetching at page 3')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle single page response', async () => {
      const mockFetcher = vi.fn().mockResolvedValueOnce({
        data: [{ id: 1 }],
        meta: { page: 1, limit: 100, hasNextPage: false, hasPreviousPage: false },
      });

      const result = await fetchAllPages(mockFetcher);

      expect(result).toEqual([{ id: 1 }]);
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('should handle empty first page', async () => {
      const mockFetcher = vi.fn().mockResolvedValueOnce({
        data: [],
        meta: { page: 1, limit: 100, hasNextPage: false, hasPreviousPage: false },
      });

      const result = await fetchAllPages(mockFetcher);

      expect(result).toEqual([]);
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('should use custom maxPages', async () => {
      const mockFetcher = vi.fn();

      for (let i = 0; i < 20; i++) {
        mockFetcher.mockResolvedValueOnce({
          data: [{ id: i }],
          meta: { page: i + 1, limit: 100, hasNextPage: true, hasPreviousPage: i > 0 },
        });
      }

      const result = await fetchAllPages(mockFetcher, 5);

      expect(result).toHaveLength(5);
      expect(mockFetcher).toHaveBeenCalledTimes(5);
    });

    it('should not warn if stopped naturally before maxPages', async () => {
      const mockFetcher = vi.fn();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetcher.mockResolvedValueOnce({
        data: [{ id: 1 }],
        meta: { page: 1, limit: 100, hasNextPage: true, hasPreviousPage: false },
      });

      mockFetcher.mockResolvedValueOnce({
        data: [{ id: 2 }],
        meta: { page: 2, limit: 100, hasNextPage: false, hasPreviousPage: true },
      });

      await fetchAllPages(mockFetcher, 10);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('sliceForPagination', () => {
    const testData = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));

    it('should slice first page', () => {
      const result = sliceForPagination(testData, { page: 1, limit: 100 });

      expect(result.data).toHaveLength(100);
      expect(result.data[0].id).toBe(1);
      expect(result.data[99].id).toBe(100);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(100);
      expect(result.meta.total).toBe(250);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(false);
    });

    it('should slice middle page', () => {
      const result = sliceForPagination(testData, { page: 2, limit: 100 });

      expect(result.data).toHaveLength(100);
      expect(result.data[0].id).toBe(101);
      expect(result.data[99].id).toBe(200);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(true);
    });

    it('should slice last page', () => {
      const result = sliceForPagination(testData, { page: 3, limit: 100 });

      expect(result.data).toHaveLength(50);
      expect(result.data[0].id).toBe(201);
      expect(result.data[49].id).toBe(250);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(true);
    });

    it('should handle small datasets', () => {
      const smallData = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = sliceForPagination(smallData, { page: 1, limit: 100 });

      expect(result.data).toHaveLength(3);
      expect(result.meta.total).toBe(3);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
    });

    it('should handle page beyond data length', () => {
      const result = sliceForPagination(testData, { page: 10, limit: 100 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.page).toBe(10);
    });

    it('should handle custom page sizes', () => {
      const result = sliceForPagination(testData, { page: 2, limit: 50 });

      expect(result.data).toHaveLength(50);
      expect(result.data[0].id).toBe(51);
      expect(result.data[49].id).toBe(100);
      expect(result.meta.totalPages).toBe(5);
    });

    it('should handle empty array', () => {
      const result = sliceForPagination([], { page: 1, limit: 100 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasNextPage).toBe(false);
    });
  });
});
