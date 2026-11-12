/**
 * HTTP client with retry logic for MCP FactorialHR
 *
 * Implements exponential backoff retry for transient failures.
 */

import { getRequestSettings, debug, getApiKey } from './config.js';
import { getUserLogin, LOGIN_COMMAND, LoginRequiredError, writeActor } from './auth/mode.js';
import { getUserAccessToken } from './auth/user-token.js';
import { noteCompanyKeyWrite } from './auth/attribution.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
  ValidationError,
  ConflictError,
  UnprocessableEntityError,
  isRetryableError,
  formatValidationErrors,
} from './errors.js';

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request options for the HTTP client
 */
/** A query parameter value; arrays are sent as repeated `key[]=value` pairs */
export type QueryParamValue =
  string | number | boolean | undefined | Array<string | number | boolean>;

export interface RequestOptions {
  /** Query parameters */
  params?: Record<string, QueryParamValue>;
  /** Request timeout in milliseconds (overrides default) */
  timeout?: number;
  /** Maximum retry attempts (overrides default) */
  maxRetries?: number;
  /** Skip retry logic */
  noRetry?: boolean;
}

/**
 * Extended options for write operations (POST, PUT, PATCH, DELETE)
 */
export interface WriteRequestOptions extends RequestOptions {
  /** HTTP method */
  method?: HttpMethod;
  /** Request body (will be JSON serialized) */
  body?: Record<string, unknown>;
  /** Idempotency key for safe retries */
  idempotencyKey?: string;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 * @param attempt - Current attempt number (1-based)
 * @param baseDelay - Base delay in milliseconds
 * @returns Delay in milliseconds with jitter
 */
function getBackoffDelay(attempt: number, baseDelay = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const maxDelay = 10000; // Cap at 10 seconds
  const delay = Math.min(exponentialDelay, maxDelay);
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Build URL with query parameters
 */
function buildUrl(endpoint: string, params?: Record<string, QueryParamValue>): string {
  const config = getRequestSettings();
  const url = new URL(`${config.baseUrl}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        // Factorial expects Rails-style arrays: employee_ids[]=1&employee_ids[]=2
        const name = key.endsWith('[]') ? key : `${key}[]`;
        for (const item of value) url.searchParams.append(name, String(item));
        return;
      }
      url.searchParams.append(key, String(value));
    });
  }

  return url.toString();
}

/**
 * Parse error response body
 */
function parseErrorBody(errorText: string): unknown {
  try {
    return JSON.parse(errorText);
  } catch {
    return null;
  }
}

/**
 * Pull a quotable sentence out of an error body. Factorial uses three shapes:
 * `{errors: {errors: [...]}}` for DTO validation, `{errors: [...]}` for missing
 * resources, and `{message: "..."}` elsewhere.
 */
export function extractApiMessage(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const record = body as { errors?: unknown; message?: unknown };
  if (typeof record.message === 'string' && record.message !== '') return record.message;
  const errors = record.errors;
  if (Array.isArray(errors) && typeof errors[0] === 'string') return errors[0];
  if (errors !== null && typeof errors === 'object') {
    const nested = (errors as { errors?: unknown }).errors;
    if (Array.isArray(nested) && typeof nested[0] === 'string') return nested[0];
  }
  return undefined;
}

/**
 * The credential one request carries.
 *
 * A company API key acts as the company; a user token acts as the employee who
 * logged in, and Factorial records what it writes under that employee.
 */
type Credential =
  | { kind: 'company'; headers: Record<string, string> }
  | { kind: 'user'; token: string; headers: Record<string, string> };

async function userCredential(rejected?: string): Promise<Credential> {
  const token = await getUserAccessToken({ rejected });
  return { kind: 'user', token, headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Choose the credential for a request.
 *
 * A write goes out as the logged-in user whenever there is a login, and a
 * login that cannot be refreshed is an error: a write never falls back to the
 * API key, because that would record it under the company without anyone
 * having chosen that. A read uses the API key when there is one, since the key
 * sees the whole company and a user token sees only what that user may.
 *
 * @param rejected - a user token the API has just refused with a 401
 */
async function credentialFor(method: HttpMethod, rejected?: string): Promise<Credential> {
  if (rejected !== undefined) return userCredential(rejected);
  if (method !== 'GET') {
    // Throws in oauth mode when nobody has logged in.
    if (writeActor().kind === 'user') return userCredential();
    return { kind: 'company', headers: { 'x-api-key': getApiKey() } };
  }
  if (!process.env.FACTORIAL_API_KEY && getUserLogin()) return userCredential();
  return { kind: 'company', headers: { 'x-api-key': getApiKey() } };
}

/**
 * Handle HTTP response and throw appropriate errors
 */
async function handleResponse<T>(
  response: Response,
  endpoint: string,
  method: HttpMethod = 'GET',
  credential: Credential['kind'] = 'company'
): Promise<T> {
  if (response.ok) {
    // Handle 204 No Content (common for DELETE operations)
    if (response.status === 204) {
      return undefined as T;
    }
    const data = (await response.json()) as T;
    debug('Response received', { endpoint, method, status: response.status });
    return data;
  }

  const errorText = await response.text();
  const errorData = parseErrorBody(errorText);
  debug(`API error (${response.status})`, { endpoint, method, error: errorText });

  const validationBody = errorData as {
    errors?: Record<string, string[]>;
    message?: string;
  } | null;

  switch (response.status) {
    case 400:
      throw new ValidationError(endpoint, formatValidationErrors(validationBody), {
        raw: errorData,
      });
    case 401:
      throw new AuthenticationError(endpoint);
    case 403:
      throw new AuthorizationError(
        endpoint,
        extractApiMessage(errorData),
        { raw: errorData },
        credential
      );
    case 404:
      throw new NotFoundError(endpoint);
    case 409:
      throw new ConflictError(endpoint, validationBody?.message || 'Resource conflict');
    case 422:
      throw new UnprocessableEntityError(endpoint, formatValidationErrors(validationBody), {
        raw: errorData,
      });
    case 429: {
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError(endpoint, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }
    default:
      if (response.status >= 500) {
        throw new ServerError(response.status, endpoint, errorText);
      }
      throw new Error(`FactorialHR API error (${response.status}): ${errorText}`);
  }
}

/**
 * Keys that carry a Factorial resource identifier: `id`, `ids`, `*_id`, `*_ids`.
 */
const IDENTIFIER_KEY = /^(id|ids|.+_id|.+_ids)$/;

/**
 * Serialise identifiers in a request body as strings.
 *
 * Since API version 2026-07-01 Factorial types every `id` and `*_id` field as a
 * string in request payloads as well as in responses (see
 * https://apidoc.factorialhr.com/changelog/string-migration-of-resource-identifiers).
 * The tools still accept numeric identifiers from callers, so numbers (and
 * arrays of numbers) under identifier keys are converted here, at the HTTP
 * boundary, before the body is sent. Nested objects and arrays are handled;
 * everything else is passed through untouched.
 */
export function stringifyIdentifiers(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map(item => stringifyIdentifiers(item, key));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        stringifyIdentifiers(v, k),
      ])
    );
  }
  if (typeof value === 'number' && key !== undefined && IDENTIFIER_KEY.test(key)) {
    return String(value);
  }
  return value;
}

/**
 * Make an HTTP request with retry logic
 * Supports both read (GET) and write (POST, PUT, PATCH, DELETE) operations
 */
export async function factorialRequest<T>(
  endpoint: string,
  options: WriteRequestOptions = {}
): Promise<T> {
  const config = getRequestSettings();
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.params);
  const timeout = options.timeout ?? config.timeout;
  const body = options.body ? JSON.stringify(stringifyIdentifiers(options.body)) : undefined;

  // Write operations should not retry by default (except with idempotency key)
  const defaultMaxRetries = method === 'GET' ? config.maxRetries : options.idempotencyKey ? 2 : 1;
  const maxRetries = options.noRetry ? 1 : (options.maxRetries ?? defaultMaxRetries);

  debug(`${method} ${url}`);

  let lastError: Error | undefined;
  // A user token Factorial has refused. Set once: the request is retried a
  // single time with a fresh token, as Factorial's own guidance says.
  let rejectedToken: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Resolved outside the timed section: a token refresh is its own request.
    const credential = await credentialFor(method, rejectedToken);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build headers
      const headers: Record<string, string> = {
        ...credential.headers,
        Accept: 'application/json',
      };

      // Add Content-Type for requests with body
      if (options.body) {
        headers['Content-Type'] = 'application/json';
      }

      // Add idempotency key header for write operations
      if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
      }

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const result = await handleResponse<T>(response, endpoint, method, credential.kind);
      if (method !== 'GET' && credential.kind === 'company') noteCompanyKeyWrite();
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      // A 401 means the request was not carried out, so repeating it is safe
      // for a write too. It does not count against the retry budget.
      if (error instanceof AuthenticationError && credential.kind === 'user') {
        if (rejectedToken === undefined) {
          rejectedToken = credential.token;
          attempt -= 1;
          continue;
        }
        throw new LoginRequiredError(
          'Factorial rejected your login (HTTP 401), and a freshly refreshed token as well. ' +
            `Run \`${LOGIN_COMMAND}\` in a terminal to log in again, then try again.`
        );
      }

      // Convert abort to timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new TimeoutError(timeout, endpoint);
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new NetworkError('An unexpected network error occurred');
      }

      // Only retry writes if idempotent and retryable
      const canRetryWrite = method === 'GET' || options.idempotencyKey;
      const shouldRetry = attempt < maxRetries && isRetryableError(lastError) && canRetryWrite;

      if (shouldRetry) {
        // Handle rate limit with Retry-After header
        let delay: number;
        if (lastError instanceof RateLimitError && lastError.retryAfter) {
          delay = lastError.retryAfter * 1000;
        } else {
          delay = getBackoffDelay(attempt);
        }

        debug(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, {
          error: lastError.message,
        });
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  throw lastError ?? new NetworkError('Request failed after all retries');
}

/**
 * Wrapper type for paginated API responses
 */
export interface ApiResponse<T> {
  data: T;
}

/**
 * Pagination block Factorial attaches to every list response. Verified live on
 * 2026-09-06 on API 2026-07-01: `has_next_page`, `has_previous_page`, `total`
 * and `limit` are always present; the first page also carries `start_cursor`
 * and `end_cursor`; endpoints that return everything at once (shifts) say
 * `paginateable: false` with `limit: null`. There is no `current_page` or
 * `total_pages`.
 */
export interface ApiListMeta {
  has_next_page?: boolean;
  has_previous_page?: boolean;
  total?: number;
  limit?: number | null;
  paginateable?: boolean;
  start_cursor?: string;
  end_cursor?: string;
}

/**
 * Wrapper type for list API responses
 */
export interface ApiListResponse<T> {
  data: T[];
  meta?: ApiListMeta;
}

/** One page of a list endpoint, with the pagination block the API sent */
export interface ApiPage<T> {
  data: T[];
  meta?: ApiListMeta;
}

/**
 * Safety cap on the exhaustive read. At 100 items a page this is 100,000
 * records, far beyond any real query this server makes; it exists so that an
 * endpoint that never turns `has_next_page` off cannot spin forever.
 */
export const MAX_LIST_PAGES = 1000;

/**
 * Extract a single record from a response.
 *
 * Factorial returns single records at the top level: `GET /{resource}/{id}`
 * and every `POST`, `PUT` and `PATCH` respond with the record itself, and only
 * list endpoints wrap their payload as `{ data: [...], meta: {...} }`. This was
 * verified live on 2026-09-06 on API 2026-07-01 and the reference agrees. The
 * `{ data: record }` envelope is still accepted so that a tenant or version
 * that does wrap single records keeps working.
 */
export function unwrapRecord<T>(response: unknown): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    !Array.isArray(response) &&
    'data' in response
  ) {
    const inner = response.data;
    if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as T;
    }
  }
  return response as T;
}

/**
 * Make a request expecting a single item response
 */
export async function fetchOne<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const response = await factorialRequest<unknown>(endpoint, options);
  return unwrapRecord<T>(response);
}

/**
 * Read exactly one page of a list endpoint and return it with its meta.
 * This is for user-facing pagers that expose page and limit to the caller.
 * Anything that needs the whole result set must use fetchList.
 */
export async function fetchPage<T>(
  endpoint: string,
  options?: RequestOptions
): Promise<ApiPage<T>> {
  const response = await factorialRequest<ApiListResponse<T>>(endpoint, options);
  return { data: response?.data ?? [], meta: response?.meta };
}

/**
 * Read a list endpoint exhaustively.
 *
 * Factorial pages list endpoints at 100 items by default and reports the
 * remainder in `meta.has_next_page`, so a single request silently truncates
 * anything longer than a page: a 249-day window of estimated_times came back
 * as the first 100 days and nothing else (found 2026-09-06). This follows
 * `has_next_page` until it is false. Filters in `options.params` travel with
 * every page; a caller-supplied `page` is where the read starts and a
 * caller-supplied `limit` is kept. A response without `meta` is taken as
 * complete, which is what endpoints marked `paginateable: false` also say.
 */
export async function fetchList<T>(endpoint: string, options?: RequestOptions): Promise<T[]> {
  const params = options?.params ?? {};
  const startPage = typeof params.page === 'number' && params.page > 0 ? params.page : 1;
  const all: T[] = [];
  let page = startPage;
  for (;;) {
    // The first request goes out exactly as the caller built it; only the
    // follow-up pages add `page`, so endpoints that ignore it never see it.
    const response = await factorialRequest<ApiListResponse<T>>(
      endpoint,
      page === startPage ? options : { ...options, params: { ...params, page } }
    );
    const batch = response?.data ?? [];
    all.push(...batch);
    const more = response?.meta?.has_next_page === true && batch.length > 0;
    if (!more) break;
    page += 1;
    if (page - startPage >= MAX_LIST_PAGES) {
      throw new Error(
        `fetchList(${endpoint}): more than ${MAX_LIST_PAGES} pages, refusing to continue`
      );
    }
  }
  if (page > startPage) {
    debug(
      `fetchList(${endpoint}): read ${all.length} records across ${page - startPage + 1} pages`
    );
  }
  return all;
}

// ============================================================================
// Write Operation Helpers
// ============================================================================

/**
 * Create a resource (POST request expecting single item response)
 */
export async function postOne<T>(
  endpoint: string,
  body: Record<string, unknown>,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await factorialRequest<unknown>(endpoint, {
    ...options,
    method: 'POST',
    body,
  });
  return unwrapRecord<T>(response);
}

/**
 * Update a resource (PUT request expecting single item response)
 */
export async function putOne<T>(
  endpoint: string,
  body: Record<string, unknown>,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await factorialRequest<unknown>(endpoint, {
    ...options,
    method: 'PUT',
    body,
  });
  return unwrapRecord<T>(response);
}

/**
 * Partially update a resource (PATCH request expecting single item response)
 */
export async function patchOne<T>(
  endpoint: string,
  body: Record<string, unknown>,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await factorialRequest<unknown>(endpoint, {
    ...options,
    method: 'PATCH',
    body,
  });
  return unwrapRecord<T>(response);
}

/**
 * Delete a resource (DELETE request, typically returns 204 No Content)
 */
export async function deleteOne(
  endpoint: string,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<void> {
  await factorialRequest<void>(endpoint, {
    ...options,
    method: 'DELETE',
  });
}

/**
 * Perform a custom action on a resource (POST to action endpoint)
 * Used for actions like approve, reject, archive, etc.
 */
export async function postAction<T>(
  endpoint: string,
  body?: Record<string, unknown>,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await factorialRequest<unknown>(endpoint, {
    ...options,
    method: 'POST',
    body: body || {},
  });
  return unwrapRecord<T>(response);
}
