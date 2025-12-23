/**
 * HTTP client with retry logic for MCP FactorialHR
 *
 * Implements exponential backoff retry for transient failures.
 */

import { getConfig, debug, getApiKey } from './config.js';
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
export interface RequestOptions {
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
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
function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const config = getConfig();
  const url = new URL(`${config.baseUrl}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

/**
 * Parse error response body
 */
function parseErrorBody(
  errorText: string
): { errors?: Record<string, string[]>; message?: string } | null {
  try {
    return JSON.parse(errorText) as { errors?: Record<string, string[]>; message?: string };
  } catch {
    return null;
  }
}

/**
 * Handle HTTP response and throw appropriate errors
 */
async function handleResponse<T>(
  response: Response,
  endpoint: string,
  method: HttpMethod = 'GET'
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

  switch (response.status) {
    case 400:
      throw new ValidationError(endpoint, formatValidationErrors(errorData), { raw: errorData });
    case 401:
      throw new AuthenticationError(endpoint);
    case 403:
      throw new AuthorizationError(endpoint);
    case 404:
      throw new NotFoundError(endpoint);
    case 409:
      throw new ConflictError(endpoint, errorData?.message || 'Resource conflict');
    case 422:
      throw new UnprocessableEntityError(endpoint, formatValidationErrors(errorData), {
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
 * Make an HTTP request with retry logic
 * Supports both read (GET) and write (POST, PUT, PATCH, DELETE) operations
 */
export async function factorialRequest<T>(
  endpoint: string,
  options: WriteRequestOptions = {}
): Promise<T> {
  const config = getConfig();
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.params);
  const timeout = options.timeout ?? config.timeout;

  // Write operations should not retry by default (except with idempotency key)
  const defaultMaxRetries = method === 'GET' ? config.maxRetries : options.idempotencyKey ? 2 : 1;
  const maxRetries = options.noRetry ? 1 : (options.maxRetries ?? defaultMaxRetries);

  debug(`${method} ${url}`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build headers
      const headers: Record<string, string> = {
        'x-api-key': getApiKey(),
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
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return await handleResponse<T>(response, endpoint, method);
    } catch (error) {
      clearTimeout(timeoutId);

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
 * Wrapper type for list API responses
 */
export interface ApiListResponse<T> {
  data: T[];
}

/**
 * Make a request expecting a single item response
 */
export async function fetchOne<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const response = await factorialRequest<ApiResponse<T>>(endpoint, options);
  return response.data;
}

/**
 * Make a request expecting a list response
 */
export async function fetchList<T>(endpoint: string, options?: RequestOptions): Promise<T[]> {
  const response = await factorialRequest<ApiListResponse<T>>(endpoint, options);
  return response.data || [];
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
  const response = await factorialRequest<ApiResponse<T>>(endpoint, {
    ...options,
    method: 'POST',
    body,
  });
  return response.data;
}

/**
 * Update a resource (PUT request expecting single item response)
 */
export async function putOne<T>(
  endpoint: string,
  body: Record<string, unknown>,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await factorialRequest<ApiResponse<T>>(endpoint, {
    ...options,
    method: 'PUT',
    body,
  });
  return response.data;
}

/**
 * Partially update a resource (PATCH request expecting single item response)
 */
export async function patchOne<T>(
  endpoint: string,
  body: Record<string, unknown>,
  options?: Omit<WriteRequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await factorialRequest<ApiResponse<T>>(endpoint, {
    ...options,
    method: 'PATCH',
    body,
  });
  return response.data;
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
  const response = await factorialRequest<ApiResponse<T>>(endpoint, {
    ...options,
    method: 'POST',
    body: body || {},
  });
  return response.data;
}
