/**
 * Payroll schemas: PayrollSupplement, TaxIdentifier, FamilySituation
 *
 * Response field sets taken from the 2026-07-01 reference. The verification
 * tenant has no supplements or family situations, and the identifiers endpoint
 * refuses to list without a `country` filter, so none of these could be
 * checked against a live record.
 */

import { z } from 'zod';
import { resourceId } from './shared.js';

/**
 * Payroll Supplement schema
 */
export const PayrollSupplementSchema = z.object({
  id: resourceId,
  employee_id: resourceId,
  company_id: resourceId.optional(),
  legal_entity_id: resourceId.nullable().optional(),
  contracts_compensation_id: resourceId.nullable().optional(),
  contracts_taxonomy_id: resourceId.nullable().optional(),
  payroll_policy_period_id: resourceId.nullable().optional(),
  unit: z.enum(['money', 'units', 'time']).optional(),
  amount_in_cents: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  raw_minutes_in_cents: z.number().nullable().optional(),
  minutes_in_cents: z.number().nullable().optional(),
  equivalent_minutes_in_cents: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  employee_observations: z.array(z.string()).nullable().optional(),
  effective_on: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type PayrollSupplement = z.infer<typeof PayrollSupplementSchema>;

/**
 * Tax Identifier schema (payroll_employees/identifiers)
 *
 * Only exists for Portuguese, German and Italian legal entities.
 */
export const TaxIdentifierSchema = z.object({
  id: resourceId,
  employee_id: resourceId,
  country: z.enum(['pt', 'de', 'it']),
  tax_id: z.string().nullable().optional(),
  social_security_number: z.string().nullable().optional(),
});

export type TaxIdentifier = z.infer<typeof TaxIdentifierSchema>;

/**
 * Family Situation schema
 */
export const FamilySituationSchema = z.object({
  id: resourceId,
  employee_id: resourceId,
  civil_status: z
    .enum([
      'single',
      'cohabitating',
      'divorced',
      'married',
      'unknown',
      'civil_partnership',
      'separated',
      'widow',
      'not_applicable',
    ])
    .nullable()
    .optional(),
  number_of_dependants: z.number().nullable().optional(),
});

export type FamilySituation = z.infer<typeof FamilySituationSchema>;
