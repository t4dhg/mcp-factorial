/**
 * Zod schemas for runtime validation of API responses
 *
 * Catches API version mismatches and ensures type safety at runtime.
 */

import { z } from 'zod';
import { SchemaValidationError } from './errors.js';

/**
 * Employee schema
 */
export const EmployeeSchema = z.object({
  id: z.number(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  birthday_on: z.string().nullable(),
  hired_on: z.string().nullable(),
  start_date: z.string().nullable(),
  terminated_on: z.string().nullable(),
  gender: z.string().nullable(),
  nationality: z.string().nullable(),
  manager_id: z.number().nullable(),
  role: z.string().nullable(),
  timeoff_manager_id: z.number().nullable(),
  company_id: z.number().nullable(),
  legal_entity_id: z.number().nullable(),
  team_ids: z.array(z.number()).default([]),
  location_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Employee = z.infer<typeof EmployeeSchema>;

/**
 * Team schema
 */
export const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  employee_ids: z.array(z.number()).default([]),
  lead_ids: z.array(z.number()).default([]),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Team = z.infer<typeof TeamSchema>;

/**
 * Location schema
 */
export const LocationSchema = z.object({
  id: z.number(),
  name: z.string(),
  country: z.string().nullable(),
  phone_number: z.string().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address_line_1: z.string().nullable(),
  address_line_2: z.string().nullable(),
  postal_code: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Location = z.infer<typeof LocationSchema>;

/**
 * Contract schema
 */
export const ContractSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  job_title: z.string().nullable(),
  effective_on: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Contract = z.infer<typeof ContractSchema>;

/**
 * Leave schema
 */
export const LeaveSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  leave_type_id: z.number(),
  start_on: z.string(),
  finish_on: z.string(),
  half_day: z.enum(['all_day', 'start', 'finish']).nullable(),
  status: z.enum(['pending', 'approved', 'declined']),
  description: z.string().nullable(),
  deleted_at: z.string().nullable(),
  duration_attributes: z
    .object({
      days: z.number(),
      hours: z.number(),
    })
    .nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Leave = z.infer<typeof LeaveSchema>;

/**
 * Leave type schema
 */
export const LeaveTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type LeaveType = z.infer<typeof LeaveTypeSchema>;

/**
 * Allowance schema
 */
export const AllowanceSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  leave_type_id: z.number(),
  policy_id: z.number().nullable(),
  balance_days: z.number(),
  consumed_days: z.number(),
  available_days: z.number(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Allowance = z.infer<typeof AllowanceSchema>;

/**
 * Shift schema
 */
export const ShiftSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  clock_in: z.string(),
  clock_out: z.string().nullable(),
  worked_hours: z.number().nullable(),
  break_minutes: z.number().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Shift = z.infer<typeof ShiftSchema>;

/**
 * Folder schema
 */
export const FolderSchema = z.object({
  id: z.number(),
  name: z.string(),
  parent_id: z.number().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Folder = z.infer<typeof FolderSchema>;

/**
 * Document schema
 */
export const DocumentSchema = z.object({
  id: z.number(),
  name: z.string(),
  folder_id: z.number().nullable(),
  author_id: z.number().nullable(),
  company_id: z.number().nullable(),
  public: z.boolean().default(false),
  space: z.string().nullable(),
  file_url: z.string().nullable(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Document = z.infer<typeof DocumentSchema>;

/**
 * Job role schema
 */
export const JobRoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type JobRole = z.infer<typeof JobRoleSchema>;

/**
 * Job level schema
 */
export const JobLevelSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type JobLevel = z.infer<typeof JobLevelSchema>;

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
