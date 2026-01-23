/**
 * Time Off schemas: Leave, LeaveType, Allowance, Shift
 */

import { z } from 'zod';
import { dateString } from './shared.js';

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

// ============================================================================
// Write Input Schemas
// ============================================================================

/**
 * Leave create input schema
 */
export const CreateLeaveInputSchema = z.object({
  employee_id: z.number().positive(),
  leave_type_id: z.number().positive(),
  start_on: dateString,
  finish_on: dateString,
  half_day: z.enum(['all_day', 'start', 'finish']).optional(),
  description: z.string().max(500).optional(),
});

export type CreateLeaveInput = z.infer<typeof CreateLeaveInputSchema>;

/**
 * Leave update input schema
 */
export const UpdateLeaveInputSchema = CreateLeaveInputSchema.partial().omit({ employee_id: true });

export type UpdateLeaveInput = z.infer<typeof UpdateLeaveInputSchema>;

/**
 * Leave approval/rejection input schema
 */
export const LeaveDecisionInputSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type LeaveDecisionInput = z.infer<typeof LeaveDecisionInputSchema>;

/**
 * Shift create input schema
 */
export const CreateShiftInputSchema = z.object({
  employee_id: z.number().positive(),
  clock_in: z.string().datetime(),
  clock_out: z.string().datetime().optional(),
  break_minutes: z.number().min(0).max(480).optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftInputSchema>;

/**
 * Shift update input schema
 */
export const UpdateShiftInputSchema = CreateShiftInputSchema.partial().omit({ employee_id: true });

export type UpdateShiftInput = z.infer<typeof UpdateShiftInputSchema>;
