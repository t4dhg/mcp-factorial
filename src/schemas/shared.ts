/**
 * Shared schema utilities and validation helpers
 */

import { z } from 'zod';
import { SchemaValidationError } from '../errors.js';

/**
 * Date string pattern (YYYY-MM-DD)
 */
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date string validator - validates YYYY-MM-DD format
 */
export const dateString = z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format');

/**
 * API response wrapper schema
 */
export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}

/**
 * API list response wrapper schema
 */
export function createApiListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
  });
}

/**
 * Parse and validate data against a schema
 * @throws SchemaValidationError if validation fails
 */
export function parseData<T>(schemaName: string, schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new SchemaValidationError(schemaName, issues, { data });
  }
  return result.data;
}

/**
 * Safely parse data without throwing (returns undefined on failure)
 */
export function safeParseData<T>(schema: z.ZodSchema<T>, data: unknown): T | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Parse an array of items against a schema
 */
export function parseArray<T>(schemaName: string, itemSchema: z.ZodSchema<T>, data: unknown): T[] {
  if (!Array.isArray(data)) {
    throw new SchemaValidationError(schemaName, 'Expected an array', { data });
  }
  return data.map((item, index) => {
    const result = itemSchema.safeParse(item);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new SchemaValidationError(`${schemaName}[${index}]`, issues, { item });
    }
    return result.data;
  });
}
