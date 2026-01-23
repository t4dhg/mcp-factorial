/**
 * Payroll schemas: PayrollSupplement, TaxIdentifier, FamilySituation
 */

import { z } from 'zod';

/**
 * Payroll Supplement schema
 */
export const PayrollSupplementSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  supplement_type_id: z.number().nullable(),
  name: z.string().nullable(),
  amount_cents: z.number().nullable(),
  effective_on: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type PayrollSupplement = z.infer<typeof PayrollSupplementSchema>;

/**
 * Tax Identifier schema
 */
export const TaxIdentifierSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  identifier_type: z.string().nullable().optional(),
  identifier_value: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type TaxIdentifier = z.infer<typeof TaxIdentifierSchema>;

/**
 * Family Situation schema
 */
export const FamilySituationSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  marital_status: z.string().nullable(),
  number_of_dependents: z.number().nullable(),
  effective_on: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type FamilySituation = z.infer<typeof FamilySituationSchema>;
