/**
 * Structured error types for MCP FactorialHR
 *
 * Provides a clear error hierarchy for better error handling and user messages.
 */

/**
 * Base error class for all Factorial-related errors
 */
export class FactorialError extends Error {
  public readonly isRetryable: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      isRetryable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'FactorialError';
    this.isRetryable = options?.isRetryable ?? false;
    this.context = options?.context;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * HTTP-related errors with status code
 */
export class HttpError extends FactorialError {
  public readonly statusCode: number;
  public readonly endpoint: string;

  constructor(
    statusCode: number,
    endpoint: string,
    message: string,
    options?: {
      isRetryable?: boolean;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, options);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends HttpError {
  constructor(endpoint: string, context?: Record<string, unknown>) {
    super(401, endpoint, 'Invalid API key. Please check your FACTORIAL_API_KEY.', {
      isRetryable: false,
      context,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends HttpError {
  constructor(endpoint: string, context?: Record<string, unknown>) {
    super(
      403,
      endpoint,
      'Access denied. Your API key may not have permission for this operation.',
      {
        isRetryable: false,
        context,
      }
    );
    this.name = 'AuthorizationError';
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends HttpError {
  constructor(endpoint: string, context?: Record<string, unknown>) {
    super(
      404,
      endpoint,
      'Resource not found. The requested employee, team, or location may not exist.',
      {
        isRetryable: false,
        context,
      }
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends HttpError {
  public readonly retryAfter?: number;

  constructor(endpoint: string, retryAfter?: number, context?: Record<string, unknown>) {
    const message = retryAfter
      ? `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`
      : 'Rate limit exceeded. Please wait a moment before trying again.';

    super(429, endpoint, message, {
      isRetryable: true,
      context,
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends HttpError {
  constructor(endpoint: string, message: string, context?: Record<string, unknown>) {
    super(400, endpoint, message, {
      isRetryable: false,
      context,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Server error (5xx)
 */
export class ServerError extends HttpError {
  constructor(
    statusCode: number,
    endpoint: string,
    message?: string,
    context?: Record<string, unknown>
  ) {
    super(
      statusCode,
      endpoint,
      message || `Server error (${statusCode}). Please try again later.`,
      {
        isRetryable: true,
        context,
      }
    );
    this.name = 'ServerError';
  }
}

/**
 * Request timeout error
 */
export class TimeoutError extends FactorialError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, endpoint?: string) {
    super(`Request timed out after ${timeoutMs / 1000} seconds. Please try again.`, {
      isRetryable: true,
      context: { endpoint, timeoutMs },
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Network error (connection issues)
 */
export class NetworkError extends FactorialError {
  constructor(message: string, cause?: Error) {
    super(message, {
      isRetryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends FactorialError {
  constructor(message: string) {
    super(message, { isRetryable: false });
    this.name = 'ConfigurationError';
  }
}

/**
 * Schema validation error (response doesn't match expected format)
 */
export class SchemaValidationError extends FactorialError {
  public readonly schemaName: string;

  constructor(schemaName: string, message: string, context?: Record<string, unknown>) {
    super(`API response validation failed for ${schemaName}: ${message}`, {
      isRetryable: false,
      context,
    });
    this.name = 'SchemaValidationError';
    this.schemaName = schemaName;
  }
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof FactorialError) {
    return error.isRetryable;
  }
  // Network errors are generally retryable
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return false;
}

/**
 * Get a user-friendly error message from any error
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof FactorialError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
