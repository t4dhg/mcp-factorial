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
  isRetryableError,
} from './errors.js';

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
 * Handle HTTP response and throw appropriate errors
 */
async function handleResponse<T>(response: Response, endpoint: string): Promise<T> {
  if (response.ok) {
    const data = (await response.json()) as T;
    debug('Response received', { endpoint, status: response.status });
    return data;
  }

  const errorText = await response.text();
  debug(`API error (${response.status})`, { endpoint, error: errorText });

  switch (response.status) {
    case 401:
      throw new AuthenticationError(endpoint);
    case 403:
      throw new AuthorizationError(endpoint);
    case 404:
      throw new NotFoundError(endpoint);
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
 */
export async function factorialRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const config = getConfig();
  const url = buildUrl(endpoint, options.params);
  const timeout = options.timeout ?? config.timeout;
  const maxRetries = options.noRetry ? 1 : (options.maxRetries ?? config.maxRetries);

  debug(`Fetching: ${url}`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': getApiKey(),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return await handleResponse<T>(response, endpoint);
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

      // Check if we should retry
      const shouldRetry = attempt < maxRetries && isRetryableError(lastError);

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
