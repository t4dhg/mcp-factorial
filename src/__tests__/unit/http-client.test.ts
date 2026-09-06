import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally BEFORE any imports
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment BEFORE any imports
vi.stubEnv('FACTORIAL_API_KEY', 'test-api-key');

// Import after mocking
const {
  factorialRequest,
  fetchOne,
  fetchList,
  fetchPage,
  postOne,
  patchOne,
  deleteOne,
  postAction,
  stringifyIdentifiers,
  unwrapRecord,
} = await import('../../http-client.js');

// Import error types for assertions
const {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
  ConflictError,
  UnprocessableEntityError,
} = await import('../../errors.js');

describe('HTTP Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('factorialRequest', () => {
    it('should make successful GET request', async () => {
      const mockData = { data: { id: 1, name: 'Test' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await factorialRequest<{ data: { id: number; name: string } }>(
        '/employees/employees/1'
      );

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/employees/employees/1'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('should make successful POST request with body', async () => {
      const mockData = { data: { id: 1, name: 'New Employee' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockData,
      });

      const result = await factorialRequest<{ data: { id: number; name: string } }>(
        '/employees/employees',
        {
          method: 'POST',
          body: { first_name: 'John', last_name: 'Doe' },
        }
      );

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/employees/employees'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ first_name: 'John', last_name: 'Doe' }),
        })
      );
    });

    it('should handle 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await factorialRequest<void>('/employees/employees/1', { method: 'DELETE' });

      expect(result).toBeUndefined();
    });

    it('should add query parameters to URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      await factorialRequest('/employees/employees', {
        params: { page: 1, limit: 50, active: true },
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('limit=50');
      expect(calledUrl).toContain('active=true');
    });

    it('should skip undefined query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      await factorialRequest('/employees/employees', {
        params: { page: 1, limit: undefined },
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).not.toContain('limit');
    });

    it('should add idempotency key header when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1 } }),
      });

      await factorialRequest('/employees/employees', {
        method: 'POST',
        body: {},
        idempotencyKey: 'unique-key-123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': 'unique-key-123',
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw AuthenticationError for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(factorialRequest('/test')).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthorizationError for 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(factorialRequest('/test')).rejects.toThrow(AuthorizationError);
    });

    it('should throw NotFoundError for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      await expect(factorialRequest('/test')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: { email: ['is invalid'] } }),
      });

      await expect(factorialRequest('/test')).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError for 409', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ message: 'Resource already exists' }),
      });

      await expect(factorialRequest('/test')).rejects.toThrow(ConflictError);
    });

    it('should throw UnprocessableEntityError for 422', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ errors: { email: ['is taken'] } }),
      });

      await expect(factorialRequest('/test')).rejects.toThrow(UnprocessableEntityError);
    });

    it('should throw RateLimitError for 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '60' }),
      });

      await expect(factorialRequest('/test', { noRetry: true })).rejects.toThrow(RateLimitError);
    });

    it('should throw RateLimitError with retryAfter value', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '120' }),
      });

      try {
        await factorialRequest('/test', { noRetry: true });
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as typeof RateLimitError.prototype).retryAfter).toBe(120);
      }
    });

    it('should throw ServerError for 5xx responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(factorialRequest('/test', { noRetry: true })).rejects.toThrow(ServerError);
    });

    it('should throw ServerError for 503 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      await expect(factorialRequest('/test', { noRetry: true })).rejects.toThrow(ServerError);
    });

    it('should throw generic error for unexpected status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 418,
        text: async () => "I'm a teapot",
      });

      await expect(factorialRequest('/test')).rejects.toThrow('FactorialHR API error (418)');
    });
  });

  describe('Retry Logic', () => {
    it('should retry GET requests on server error', async () => {
      // First request fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      // Second request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1 } }),
      });

      const result = await factorialRequest('/test', { maxRetries: 2 });

      expect(result).toEqual({ data: { id: 1 } });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-idempotent POST requests by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      await expect(
        factorialRequest('/test', {
          method: 'POST',
          body: {},
        })
      ).rejects.toThrow(ServerError);

      // Should only call once (no retry for non-idempotent POST)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry POST requests with idempotency key', async () => {
      // First request fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      // Second request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1 } }),
      });

      const result = await factorialRequest('/test', {
        method: 'POST',
        body: {},
        idempotencyKey: 'key-123',
      });

      expect(result).toEqual({ data: { id: 1 } });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(factorialRequest('/test', { maxRetries: 3 })).rejects.toThrow(
        AuthenticationError
      );

      // Should only call once (401 is not retryable)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect noRetry option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      await expect(factorialRequest('/test', { noRetry: true })).rejects.toThrow(ServerError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should throw TimeoutError when request times out', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            setTimeout(() => reject(error), 10);
          })
      );

      await expect(factorialRequest('/test', { timeout: 5, noRetry: true })).rejects.toThrow(
        TimeoutError
      );
    });
  });

  describe('fetchOne', () => {
    // Factorial returns single records at the top level; only list endpoints
    // wrap in { data, meta }. Verified live on 2026-09-06 against
    // /employees/employees/{id} and /teams/teams/{id} on API 2026-07-01.
    it('returns a bare record as the API sends it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: '1', name: 'Test Employee', data: null }),
      });

      const result = await fetchOne<{ id: string; name: string }>('/employees/employees/1');

      expect(result).toEqual({ id: '1', name: 'Test Employee', data: null });
    });

    it('should unwrap single item from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1, name: 'Test Employee' } }),
      });

      const result = await fetchOne<{ id: number; name: string }>('/employees/employees/1');

      expect(result).toEqual({ id: 1, name: 'Test Employee' });
    });
  });

  describe('unwrapRecord', () => {
    it('unwraps a { data: record } envelope', () => {
      expect(unwrapRecord({ data: { id: '1' } })).toEqual({ id: '1' });
    });

    it('returns a bare record untouched, including one that has a data field', () => {
      expect(unwrapRecord({ id: '1', data: null })).toEqual({ id: '1', data: null });
      expect(unwrapRecord({ id: '1', data: 'x' })).toEqual({ id: '1', data: 'x' });
    });

    it('does not treat a list envelope as a record', () => {
      expect(unwrapRecord({ data: [{ id: '1' }] })).toEqual({ data: [{ id: '1' }] });
    });

    it('passes through non-object bodies', () => {
      expect(unwrapRecord(undefined)).toBeUndefined();
      expect(unwrapRecord(null)).toBeNull();
    });
  });

  describe('fetchList', () => {
    it('should unwrap list from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 1, name: 'Employee 1' },
            { id: 2, name: 'Employee 2' },
          ],
        }),
      });

      const result = await fetchList<{ id: number; name: string }>('/employees/employees');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Employee 1');
    });

    it('should return empty array when data is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const result = await fetchList('/employees/employees');

      expect(result).toEqual([]);
    });

    // Factorial pages list endpoints at 100 items and says so in
    // meta.has_next_page (verified live on 2026-09-06 on estimated_times and
    // worked_times: 249 days came back as 100 + 100 + 49). Reading only the
    // first page made every date-window feature go blind after day 100.
    it('follows meta.has_next_page until every page has been read', async () => {
      const page = (from: number, count: number, hasNext: boolean) => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: Array.from({ length: count }, (_, i) => ({ id: from + i })),
          meta: { has_next_page: hasNext, has_previous_page: from > 0, total: 249, limit: 100 },
        }),
      });
      mockFetch
        .mockResolvedValueOnce(page(0, 100, true))
        .mockResolvedValueOnce(page(100, 100, true))
        .mockResolvedValueOnce(page(200, 49, false));

      const result = await fetchList<{ id: number }>('/attendance/estimated_times', {
        params: { employee_ids: [2], start_on: '2026-01-01', end_on: '2026-09-06' },
      });

      expect(result).toHaveLength(249);
      expect(result[0].id).toBe(0);
      expect(result[248].id).toBe(248);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const urls = mockFetch.mock.calls.map(([url]) => new URL(url as string));
      expect(urls[0].searchParams.has('page')).toBe(false);
      expect(urls[1].searchParams.get('page')).toBe('2');
      expect(urls[2].searchParams.get('page')).toBe('3');
      // The filter parameters travel with every page
      expect(urls[2].searchParams.getAll('employee_ids[]')).toEqual(['2']);
      expect(urls[2].searchParams.get('end_on')).toBe('2026-09-06');
    });

    it('stops after one request when the endpoint is not paginateable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 1 }],
          meta: { has_next_page: false, total: 1, limit: null, paginateable: false },
        }),
      });
      const result = await fetchList('/attendance/shifts');
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('refuses to loop forever when has_next_page never turns false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 1 }], meta: { has_next_page: true } }),
      });
      await expect(fetchList('/employees/employees')).rejects.toThrow(/more than 1000 pages/);
    });
  });

  describe('fetchPage', () => {
    it('reads exactly the requested page and returns the meta with it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 3 }],
          meta: { has_next_page: true, has_previous_page: true, total: 250, limit: 1 },
        }),
      });
      const result = await fetchPage<{ id: number }>('/timeoff/leaves', {
        params: { page: 3, limit: 1 },
      });
      expect(result.data).toEqual([{ id: 3 }]);
      expect(result.meta?.total).toBe(250);
      expect(result.meta?.has_next_page).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('identifiers in request bodies', () => {
    // Since API 2026-07-01 every id and *_id field is a string in request
    // payloads. Tools still take numbers, so the conversion happens here.
    it('converts numeric identifier fields to strings, including arrays and nested objects', () => {
      const body = {
        id: 42,
        employee_id: 7,
        leave_type_id: null,
        team_ids: [1, 2],
        ids: [3],
        nested: { manager_id: 9, items: [{ location_id: 4 }] },
      };

      expect(stringifyIdentifiers(body)).toEqual({
        id: '42',
        employee_id: '7',
        leave_type_id: null,
        team_ids: ['1', '2'],
        ids: ['3'],
        nested: { manager_id: '9', items: [{ location_id: '4' }] },
      });
    });

    it('leaves non-identifier numbers and already-string identifiers alone', () => {
      const body = {
        employee_id: '36893488147419100',
        minutes: 480,
        salary_amount: 3500000,
        video_id_count: 3,
        valid: true,
        description: 'text',
      };

      expect(stringifyIdentifiers(body)).toEqual(body);
    });

    it('sends identifiers as strings on the wire', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: '10' }),
      });

      await postOne('/timeoff/leaves', {
        employee_id: 5,
        leave_type_id: 2,
        start_on: '2025-02-01',
      });

      const sent = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(sent).toEqual({ employee_id: '5', leave_type_id: '2', start_on: '2025-02-01' });
    });
  });

  describe('postOne', () => {
    it('returns a bare created record as the API sends it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: '10', first_name: 'John' }),
      });

      const result = await postOne<{ id: string; first_name: string }>('/employees/employees', {
        first_name: 'John',
      });

      expect(result).toEqual({ id: '10', first_name: 'John' });
    });

    it('should create resource and return data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 1, first_name: 'John' } }),
      });

      const result = await postOne<{ id: number; first_name: string }>('/employees/employees', {
        first_name: 'John',
        last_name: 'Doe',
      });

      expect(result).toEqual({ id: 1, first_name: 'John' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('patchOne', () => {
    it('should update resource and return data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1, first_name: 'Jane' } }),
      });

      const result = await patchOne<{ id: number; first_name: string }>('/employees/employees/1', {
        first_name: 'Jane',
      });

      expect(result).toEqual({ id: 1, first_name: 'Jane' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });
  });

  describe('deleteOne', () => {
    it('should delete resource and return undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await deleteOne('/employees/employees/1');

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('postAction', () => {
    it('should perform action and return data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1, status: 'approved' } }),
      });

      const result = await postAction<{ id: number; status: string }>('/leaves/1/approve', {
        comment: 'Approved!',
      });

      expect(result).toEqual({ id: 1, status: 'approved' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ comment: 'Approved!' }),
        })
      );
    });

    it('should send empty body when no body provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1 } }),
      });

      await postAction('/leaves/1/approve');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({}),
        })
      );
    });
  });
});
