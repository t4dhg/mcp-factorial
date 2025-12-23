import { describe, it, expect } from 'vitest';
import {
  FactorialError,
  HttpError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  ConflictError,
  UnprocessableEntityError,
  ServerError,
  TimeoutError,
  NetworkError,
  ConfigurationError,
  SchemaValidationError,
  OperationCancelledError,
  ConfirmationExpiredError,
  isRetryableError,
  getUserMessage,
  formatValidationErrors,
} from '../../errors.js';

describe('Error Classes', () => {
  describe('FactorialError', () => {
    it('should create basic error', () => {
      const error = new FactorialError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('FactorialError');
      expect(error.isRetryable).toBe(false);
    });

    it('should support retryable flag', () => {
      const error = new FactorialError('Test error', { isRetryable: true });
      expect(error.isRetryable).toBe(true);
    });

    it('should support context', () => {
      const context = { foo: 'bar', count: 42 };
      const error = new FactorialError('Test error', { context });
      expect(error.context).toEqual(context);
    });

    it('should support cause', () => {
      const cause = new Error('Original error');
      const error = new FactorialError('Test error', { cause });
      expect(error.cause).toBe(cause);
    });

    it('should combine all options', () => {
      const cause = new Error('Original');
      const context = { key: 'value' };
      const error = new FactorialError('Test error', {
        isRetryable: true,
        context,
        cause,
      });

      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual(context);
      expect(error.cause).toBe(cause);
    });
  });

  describe('HttpError', () => {
    it('should create HTTP error with status code and endpoint', () => {
      const error = new HttpError(400, '/api/employees', 'Bad request');

      expect(error.name).toBe('HttpError');
      expect(error.statusCode).toBe(400);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toBe('Bad request');
    });

    it('should support context and retryable flag', () => {
      const error = new HttpError(503, '/api/teams', 'Service unavailable', {
        isRetryable: true,
        context: { retry: true },
      });

      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual({ retry: true });
    });
  });

  describe('AuthenticationError', () => {
    it('should create 401 error with helpful message', () => {
      const error = new AuthenticationError('/api/employees');

      expect(error.name).toBe('AuthenticationError');
      expect(error.statusCode).toBe(401);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toContain('Invalid API key');
      expect(error.isRetryable).toBe(false);
    });

    it('should support context', () => {
      const error = new AuthenticationError('/api/teams', { attempted: true });
      expect(error.context).toEqual({ attempted: true });
    });
  });

  describe('AuthorizationError', () => {
    it('should create 403 error with helpful message', () => {
      const error = new AuthorizationError('/api/employees');

      expect(error.name).toBe('AuthorizationError');
      expect(error.statusCode).toBe(403);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toContain('Access denied');
      expect(error.isRetryable).toBe(false);
    });

    it('should support context', () => {
      const error = new AuthorizationError('/api/teams', { role: 'viewer' });
      expect(error.context).toEqual({ role: 'viewer' });
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error with helpful message', () => {
      const error = new NotFoundError('/api/employees/123');

      expect(error.name).toBe('NotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.endpoint).toBe('/api/employees/123');
      expect(error.message).toContain('Resource not found');
      expect(error.isRetryable).toBe(false);
    });

    it('should support context', () => {
      const error = new NotFoundError('/api/teams/456', { id: 456 });
      expect(error.context).toEqual({ id: 456 });
    });
  });

  describe('RateLimitError', () => {
    it('should create 429 error without retry-after', () => {
      const error = new RateLimitError('/api/employees');

      expect(error.name).toBe('RateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toContain('Rate limit exceeded');
      expect(error.isRetryable).toBe(true);
      expect(error.retryAfter).toBeUndefined();
    });

    it('should create 429 error with retry-after', () => {
      const error = new RateLimitError('/api/teams', 60);

      expect(error.message).toContain('wait 60 seconds');
      expect(error.retryAfter).toBe(60);
      expect(error.isRetryable).toBe(true);
    });

    it('should support context', () => {
      const error = new RateLimitError('/api/locations', 30, { limit: 100 });
      expect(error.context).toEqual({ limit: 100 });
    });
  });

  describe('ValidationError', () => {
    it('should create 400 error with custom message', () => {
      const error = new ValidationError('/api/employees', 'Email is required');

      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toBe('Email is required');
      expect(error.isRetryable).toBe(false);
    });

    it('should support context', () => {
      const error = new ValidationError('/api/teams', 'Name is required', { field: 'name' });
      expect(error.context).toEqual({ field: 'name' });
    });
  });

  describe('ConflictError', () => {
    it('should create 409 error with custom message', () => {
      const error = new ConflictError('/api/teams', 'Team already exists');

      expect(error.name).toBe('ConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.endpoint).toBe('/api/teams');
      expect(error.message).toBe('Team already exists');
      expect(error.isRetryable).toBe(false);
    });

    it('should support context', () => {
      const error = new ConflictError('/api/locations', 'Location exists', { code: 'LOC1' });
      expect(error.context).toEqual({ code: 'LOC1' });
    });
  });

  describe('UnprocessableEntityError', () => {
    it('should create 422 error with validation errors', () => {
      const context = {
        raw: {
          errors: {
            email: ['must be valid email'],
            name: ['is required', 'must be at least 3 characters'],
          },
        },
      };

      const error = new UnprocessableEntityError('/api/employees', 'Validation failed', context);

      expect(error.name).toBe('UnprocessableEntityError');
      expect(error.statusCode).toBe(422);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toBe('Validation failed');
      expect(error.isRetryable).toBe(false);
      expect(error.validationErrors).toEqual({
        email: ['must be valid email'],
        name: ['is required', 'must be at least 3 characters'],
      });
    });

    it('should handle missing errors in context', () => {
      const error = new UnprocessableEntityError('/api/employees', 'Validation failed');
      expect(error.validationErrors).toEqual({});
    });

    it('should handle context without raw property', () => {
      const error = new UnprocessableEntityError('/api/employees', 'Validation failed', {
        other: 'data',
      });
      expect(error.validationErrors).toEqual({});
    });
  });

  describe('ServerError', () => {
    it('should create 500 error with default message', () => {
      const error = new ServerError(500, '/api/employees');

      expect(error.name).toBe('ServerError');
      expect(error.statusCode).toBe(500);
      expect(error.endpoint).toBe('/api/employees');
      expect(error.message).toContain('Server error (500)');
      expect(error.isRetryable).toBe(true);
    });

    it('should create 503 error with custom message', () => {
      const error = new ServerError(503, '/api/teams', 'Service temporarily unavailable');

      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.isRetryable).toBe(true);
    });

    it('should support context', () => {
      const error = new ServerError(502, '/api/locations', 'Bad gateway', { upstream: 'db' });
      expect(error.context).toEqual({ upstream: 'db' });
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with timeout value', () => {
      const error = new TimeoutError(30000, '/api/employees');

      expect(error.name).toBe('TimeoutError');
      expect(error.message).toContain('timed out after 30 seconds');
      expect(error.timeoutMs).toBe(30000);
      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual({ endpoint: '/api/employees', timeoutMs: 30000 });
    });

    it('should work without endpoint', () => {
      const error = new TimeoutError(15000);

      expect(error.timeoutMs).toBe(15000);
      expect(error.message).toContain('15 seconds');
      expect(error.context).toEqual({ endpoint: undefined, timeoutMs: 15000 });
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection refused');

      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection refused');
      expect(error.isRetryable).toBe(true);
    });

    it('should support cause', () => {
      const cause = new Error('ECONNREFUSED');
      const error = new NetworkError('Connection failed', cause);

      expect(error.cause).toBe(cause);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('API key is missing');

      expect(error.name).toBe('ConfigurationError');
      expect(error.message).toBe('API key is missing');
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('SchemaValidationError', () => {
    it('should create schema validation error', () => {
      const error = new SchemaValidationError('EmployeeSchema', 'Missing required field: email');

      expect(error.name).toBe('SchemaValidationError');
      expect(error.schemaName).toBe('EmployeeSchema');
      expect(error.message).toContain('EmployeeSchema');
      expect(error.message).toContain('Missing required field: email');
      expect(error.isRetryable).toBe(false);
    });

    it('should support context', () => {
      const context = { field: 'email', value: null };
      const error = new SchemaValidationError('EmployeeSchema', 'Invalid email', context);

      expect(error.context).toEqual(context);
    });
  });

  describe('OperationCancelledError', () => {
    it('should create operation cancelled error', () => {
      const error = new OperationCancelledError('terminate_employee');

      expect(error.name).toBe('OperationCancelledError');
      expect(error.operation).toBe('terminate_employee');
      expect(error.message).toContain('terminate_employee');
      expect(error.message).toContain('cancelled');
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('ConfirmationExpiredError', () => {
    it('should create confirmation expired error', () => {
      const error = new ConfirmationExpiredError();

      expect(error.name).toBe('ConfirmationExpiredError');
      expect(error.message).toContain('expired or is invalid');
      expect(error.isRetryable).toBe(false);
    });
  });
});

describe('Error Utility Functions', () => {
  describe('isRetryableError', () => {
    it('should return true for retryable FactorialError', () => {
      const error = new FactorialError('Test', { isRetryable: true });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable FactorialError', () => {
      const error = new FactorialError('Test', { isRetryable: false });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for RateLimitError', () => {
      const error = new RateLimitError('/api/test');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ServerError', () => {
      const error = new ServerError(500, '/api/test');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for AuthenticationError', () => {
      const error = new AuthenticationError('/api/test');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for AbortError', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isRetryableError('string error')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
      expect(isRetryableError(42)).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('should return message from FactorialError', () => {
      const error = new FactorialError('Factorial error message');
      expect(getUserMessage(error)).toBe('Factorial error message');
    });

    it('should return message from AuthenticationError', () => {
      const error = new AuthenticationError('/api/test');
      expect(getUserMessage(error)).toContain('Invalid API key');
    });

    it('should return message from regular Error', () => {
      const error = new Error('Regular error message');
      expect(getUserMessage(error)).toBe('Regular error message');
    });

    it('should return default message for non-Error values', () => {
      expect(getUserMessage('string error')).toBe('An unexpected error occurred');
      expect(getUserMessage(null)).toBe('An unexpected error occurred');
      expect(getUserMessage(undefined)).toBe('An unexpected error occurred');
      expect(getUserMessage({ foo: 'bar' })).toBe('An unexpected error occurred');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format validation errors from object', () => {
      const errorData = {
        errors: {
          email: ['must be valid email'],
          name: ['is required', 'must be at least 3 characters'],
          age: ['must be a number'],
        },
      };

      const result = formatValidationErrors(errorData);

      expect(result).toContain('Validation failed');
      expect(result).toContain('email: must be valid email');
      expect(result).toContain('name: is required, must be at least 3 characters');
      expect(result).toContain('age: must be a number');
    });

    it('should handle message field when no errors object', () => {
      const errorData = { message: 'Custom validation message' };
      const result = formatValidationErrors(errorData);
      expect(result).toBe('Custom validation message');
    });

    it('should return default message for null', () => {
      const result = formatValidationErrors(null);
      expect(result).toBe('Validation failed');
    });

    it('should return default message for empty object', () => {
      const result = formatValidationErrors({});
      expect(result).toBe('Validation failed');
    });

    it('should prioritize errors over message', () => {
      const errorData = {
        errors: { email: ['invalid'] },
        message: 'This message should be ignored',
      };

      const result = formatValidationErrors(errorData);

      expect(result).toContain('email: invalid');
      expect(result).not.toContain('This message should be ignored');
    });

    it('should handle multiple errors for same field', () => {
      const errorData = {
        errors: {
          password: ['is required', 'must be at least 8 characters', 'must contain a number'],
        },
      };

      const result = formatValidationErrors(errorData);

      expect(result).toContain(
        'password: is required, must be at least 8 characters, must contain a number'
      );
    });
  });
});
