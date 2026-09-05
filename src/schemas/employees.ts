/**
 * Employee, Team, Location, and Contract schemas
 */

import { z } from 'zod';
import { dateString, resourceId } from './shared.js';

/**
 * Employee schema
 *
 * Field set verified against live /employees/employees responses on API
 * version 2026-07-01.
 */
export const EmployeeSchema = z.object({
  // Core identity
  id: resourceId,
  access_id: resourceId.nullable().optional(),
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
  // Added in API 2026-07-01: address for company communications, separate from login email
  communications_email: z.string().nullable().optional(),
  unconfirmed_communications_email: z.string().nullable().optional(),
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
  company_id: resourceId.nullable(),
  legal_entity_id: resourceId.nullable(),
  location_id: resourceId.nullable(),
  // Added in API 2026-04-01: default work area at the default workplace (locations/work_areas)
  default_work_area_id: resourceId.nullable().optional(),
  manager_id: resourceId.nullable(),
  timeoff_manager_id: resourceId.nullable(),
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
 *
 * Field set verified against live /teams/teams responses on API version
 * 2026-07-01. Teams carry no timestamps.
 */
export const TeamSchema = z.object({
  id: resourceId,
  name: z.string(),
  description: z.string().nullable(),
  avatar: z.string().nullable().optional(),
  company_id: resourceId.nullable(),
  employee_ids: z.array(resourceId).default([]),
  lead_ids: z.array(resourceId).default([]),
});

export type Team = z.infer<typeof TeamSchema>;

/**
 * Location schema
 *
 * Field set verified against live /locations/locations responses on API
 * version 2026-07-01. Locations carry no timestamps.
 */
export const LocationSchema = z.object({
  id: resourceId,
  name: z.string(),
  country: z.string().nullable(),
  phone_number: z.string().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address_line_1: z.string().nullable(),
  address_line_2: z.string().nullable(),
  postal_code: z.string().nullable(),
  timezone: z.string().nullable().optional(),
  main: z.boolean().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  radius: z.number().nullable().optional(),
  siret: z.string().nullable().optional(),
  company_id: resourceId.nullable(),
});

export type Location = z.infer<typeof LocationSchema>;

/**
 * Contract schema
 *
 * Field set verified against live /contracts/contract-versions responses on
 * API version 2026-07-01. The endpoint returns many more country-specific
 * fields (es_*, fr_*, de_*, pt_*) that are not modelled here.
 */
export const ContractSchema = z.object({
  id: resourceId,
  company_id: resourceId.optional(),
  employee_id: resourceId,
  // Removed from the contract DTO in API 2026-04-01 in favour of the job
  // catalog tree; the key is still returned, always null.
  job_title: z.string().nullable(),
  effective_on: z.string().nullable(),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
  country: z.string().nullable().optional(),

  // Salary and compensation fields
  salary_amount: z.number().nullable().optional(),
  salary_frequency: z
    .enum(['yearly', 'monthly', 'weekly', 'daily', 'hourly'])
    .nullable()
    .optional(),
  working_hours: z.number().nullable().optional(),
  working_hours_frequency: z.enum(['day', 'week', 'month', 'year']).nullable().optional(),
  working_week_days: z.string().nullable().optional(),
  working_time_percentage_in_cents: z.number().nullable().optional(),
  bank_holiday_treatment: z.enum(['workable', 'non_workable']).nullable().optional(),
  has_payroll: z.boolean().optional(),
  has_trial_period: z.boolean().optional(),
  trial_period_ends_on: z.string().nullable().optional(),

  // Job catalog references
  // Removed from the DTO in API 2026-04-01; the key is still returned, always null.
  job_catalog_level_id: resourceId.nullable().optional(),
  // Never returned by the API on either version. Kept only because
  // listEmployeesByJobRole() still reads it; see the changelog for 9.0.0.
  job_catalog_role_id: resourceId.nullable().optional(),
  // Added in API 2026-01-01: level node in the job catalog tree (job_catalog/tree_nodes)
  job_catalog_tree_node_uuid: z.string().nullable().optional(),

  // Added in API 2026-04-01: German base salary payroll concept
  de_base_salary_type_id: resourceId.nullable().optional(),

  // Added in API 2026-07-01: country-specific template fragments and fields
  version_data: z.record(z.string(), z.unknown()).nullable().optional(),

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
  id: resourceId,
  employee_id: resourceId,
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
