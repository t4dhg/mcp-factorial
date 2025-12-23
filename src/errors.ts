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
 * Conflict error (409) - Resource already exists or state conflict
 */
export class ConflictError extends HttpError {
  constructor(endpoint: string, message: string, context?: Record<string, unknown>) {
    super(409, endpoint, message, {
      isRetryable: false,
      context,
    });
    this.name = 'ConflictError';
  }
}

/**
 * Safely extract validation errors from raw API response
 */
function extractValidationErrors(context?: Record<string, unknown>): Record<string, string[]> {
  if (!context?.raw || typeof context.raw !== 'object') {
    return {};
  }

  const raw = context.raw as Record<string, unknown>;
  if (!raw.errors || typeof raw.errors !== 'object') {
    return {};
  }

  // Validate that each entry is an array of strings
  const errors = raw.errors as Record<string, unknown>;
  const result: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(errors)) {
    if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Unprocessable Entity error (422) - Validation failed on the server
 */
export class UnprocessableEntityError extends HttpError {
  public readonly validationErrors: Record<string, string[]>;

  constructor(endpoint: string, message: string, context?: Record<string, unknown>) {
    super(422, endpoint, message, {
      isRetryable: false,
      context,
    });
    this.name = 'UnprocessableEntityError';
    this.validationErrors = extractValidationErrors(context);
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

// ============================================================================
// Write Operation Errors
// ============================================================================

/**
 * Operation cancelled by user (e.g., confirmation declined)
 */
export class OperationCancelledError extends FactorialError {
  public readonly operation: string;

  constructor(operation: string) {
    super(`Operation "${operation}" was cancelled.`, { isRetryable: false });
    this.name = 'OperationCancelledError';
    this.operation = operation;
  }
}

/**
 * Confirmation token expired or invalid
 */
export class ConfirmationExpiredError extends FactorialError {
  constructor() {
    super('Confirmation token has expired or is invalid. Please try the operation again.', {
      isRetryable: false,
    });
    this.name = 'ConfirmationExpiredError';
  }
}

/**
 * Format validation errors from API response into a human-readable message
 */
export function formatValidationErrors(
  errorData: { errors?: Record<string, string[]>; message?: string } | null
): string {
  if (!errorData) return 'Validation failed';

  if (errorData.errors) {
    const messages = Object.entries(errorData.errors)
      .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
      .join('; ');
    return `Validation failed: ${messages}`;
  }

  return errorData.message || 'Validation failed';
}
