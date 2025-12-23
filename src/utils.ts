/**
 * Shared utilities for MCP FactorialHR
 *
 * Provides common validation and helper functions used across the codebase.
 */

/**
 * Validate that a value is a positive integer ID
 *
 * @param id - The value to validate
 * @param resourceType - The type of resource for error messages (e.g., "employee", "team")
 * @returns The validated ID as a number
 * @throws Error if the ID is invalid
 */
export function validateId(id: unknown, resourceType: string): number {
  if (typeof id !== 'number' || !id || id <= 0 || !Number.isInteger(id)) {
    throw new Error(`Invalid ${resourceType} ID. Please provide a positive integer.`);
  }
  return id;
}

/**
 * Validate that a value is a positive number
 *
 * @param value - The value to validate
 * @param fieldName - The field name for error messages
 * @returns The validated number
 * @throws Error if the value is invalid
 */
export function validatePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || value <= 0) {
    throw new Error(`Invalid ${fieldName}. Please provide a positive number.`);
  }
  return value;
}

/**
 * Validate that a value is a non-empty string
 *
 * @param value - The value to validate
 * @param fieldName - The field name for error messages
 * @returns The validated string
 * @throws Error if the value is invalid
 */
export function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}. Please provide a non-empty string.`);
  }
  return value.trim();
}
