/**
 * Employee, Team, Location, and Contract schemas
 */

import { z } from 'zod';
import { dateString } from './shared.js';

/**
 * Employee schema
 */
export const EmployeeSchema = z.object({
  // Core identity
  id: z.number(),
  access_id: z.number().nullable().optional(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  full_name: z.string().nullable(),
  preferred_name: z.string().nullable().optional(),
  birth_name: z.string().nullable().optional(),
  gender: z.string().nullable(),
  pronouns: z.string().nullable().optional(),

  // Identification
  identifier: z.string().nullable().optional(),
  identifier_type: z.string().nullable().optional(),
  identifier_expiration_date: z.string().nullable().optional(),
  social_security_number: z.string().nullable().optional(),

  // Contact
  email: z.string().nullable(),
  login_email: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  personal_email: z.string().nullable().optional(),

  // Address
  address_line_1: z.string().nullable().optional(),
  address_line_2: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),

  // Personal details
  birthday_on: z.string().nullable(),
  nationality: z.string().nullable(),
  country_of_birth: z.string().nullable().optional(),
  birthplace: z.string().nullable().optional(),
  age_number: z.number().nullable().optional(),
  disability_percentage_cents: z.number().nullable().optional(),

  // Banking
  bank_number: z.string().nullable().optional(),
  swift_bic: z.string().nullable().optional(),
  bank_number_format: z.string().nullable().optional(),

  // Organization
  company_id: z.number().nullable(),
  legal_entity_id: z.number().nullable(),
  location_id: z.number().nullable(),
  manager_id: z.number().nullable(),
  timeoff_manager_id: z.number().nullable(),
  company_identifier: z.string().nullable().optional(),

  // Employment status
  active: z.boolean().nullable().optional(),
  attendable: z.boolean().nullable().optional(),
  seniority_calculation_date: z.string().nullable().optional(),

  // Termination
  terminated_on: z.string().nullable(),
  is_terminating: z.boolean().nullable().optional(),
  termination_reason_type: z.string().nullable().optional(),
  termination_reason: z.string().nullable().optional(),
  termination_observations: z.string().nullable().optional(),
  termination_type_description: z.string().nullable().optional(),

  // Emergency contact
  contact_name: z.string().nullable().optional(),
  contact_number: z.string().nullable().optional(),

  // Timestamps
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
 *
 * Extended to include salary, job catalog, and compensation fields
 * available in the /contracts/contract-versions endpoint.
 */
export const ContractSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  job_title: z.string().nullable(),
  effective_on: z.string().nullable(),

  // Salary and compensation fields
  salary_amount: z.number().nullable().optional(),
  salary_frequency: z
    .enum(['yearly', 'monthly', 'weekly', 'daily', 'hourly'])
    .nullable()
    .optional(),
  working_hours: z.number().nullable().optional(),
  working_hours_frequency: z.enum(['day', 'week', 'month', 'year']).nullable().optional(),

  // Job catalog references
  job_catalog_level_id: z.number().nullable().optional(),
  job_catalog_role_id: z.number().nullable().optional(),

  // Contract type and status
  contract_type: z.string().nullable().optional(),
  trial_period_ends_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),

  // Working time distribution (added in API 2025-07-01)
  annual_working_time_distribution: z.string().nullable().optional(),

  // Timestamps
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Contract = z.infer<typeof ContractSchema>;

/**
 * Contract summary schema for list operations
 * Returns minimal fields to reduce response size
 */
export const ContractSummarySchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  job_title: z.string().nullable(),
  effective_on: z.string().nullable(),
});

export type ContractSummary = z.infer<typeof ContractSummarySchema>;

// ============================================================================
// Write Input Schemas (for create/update operations)
// ============================================================================

/**
 * Employee create input schema
 */
export const CreateEmployeeInputSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  birthday_on: dateString.optional(),
  hired_on: dateString.optional(),
  start_date: dateString.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  nationality: z.string().max(50).optional(),
  manager_id: z.number().positive().optional(),
  role: z.string().max(100).optional(),
  team_ids: z.array(z.number().positive()).optional(),
  location_id: z.number().positive().optional(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInputSchema>;

/**
 * Employee update input schema (all fields optional)
 */
export const UpdateEmployeeInputSchema = CreateEmployeeInputSchema.partial();

export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeInputSchema>;

/**
 * Employee termination input schema
 */
export const TerminateEmployeeInputSchema = z.object({
  terminated_on: dateString,
  reason: z.string().max(500).optional(),
});

export type TerminateEmployeeInput = z.infer<typeof TerminateEmployeeInputSchema>;

/**
 * Team create input schema
 */
export const CreateTeamInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  lead_ids: z.array(z.number().positive()).optional(),
  employee_ids: z.array(z.number().positive()).optional(),
});

export type CreateTeamInput = z.infer<typeof CreateTeamInputSchema>;

/**
 * Team update input schema
 */
export const UpdateTeamInputSchema = CreateTeamInputSchema.partial();

export type UpdateTeamInput = z.infer<typeof UpdateTeamInputSchema>;

/**
 * Location create input schema
 */
export const CreateLocationInputSchema = z.object({
  name: z.string().min(1).max(100),
  country: z.string().max(50).optional(),
  state: z.string().max(50).optional(),
  city: z.string().max(50).optional(),
  address_line_1: z.string().max(200).optional(),
  address_line_2: z.string().max(200).optional(),
  postal_code: z.string().max(20).optional(),
  phone_number: z.string().max(30).optional(),
});

export type CreateLocationInput = z.infer<typeof CreateLocationInputSchema>;

/**
 * Location update input schema
 */
export const UpdateLocationInputSchema = CreateLocationInputSchema.partial();

export type UpdateLocationInput = z.infer<typeof UpdateLocationInputSchema>;
