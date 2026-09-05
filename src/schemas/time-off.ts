/**
 * Time Off schemas: Leave, LeaveType, Allowance, Shift
 */

import { z } from 'zod';
import { dateString, resourceId } from './shared.js';

/**
 * Leave schema
 *
 * Only the identifier types and the `days_taken` field were changed for API
 * version 2026-07-01. The remaining fields are known not to match what the
 * live API returns (there is no `status`, approval is a boolean `approved`,
 * and `half_day` values are null, 'beggining_of_day' or 'end_of_day'); that
 * rework belongs to the attendance feature and is deliberately left out here.
 */
export const LeaveSchema = z.object({
  id: resourceId,
  employee_id: resourceId,
  leave_type_id: resourceId,
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
  // Added in API 2026-01-01: number of days taken for paid leave
  days_taken: z.number().optional(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Leave = z.infer<typeof LeaveSchema>;

/**
 * Leave type schema
 *
 * Field set verified against live /timeoff/leave-types responses on API
 * version 2026-07-01. Leave types carry no `code` and no timestamps.
 */
export const LeaveTypeSchema = z.object({
  id: resourceId,
  name: z.string(),
  translated_name: z.string().nullable().optional(),
  /** Built-in kind: 'holiday', 'sick', 'parental', 'compassionate', 'overtime_compensation', 'other', 'custom' */
  identifier: z.string(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  company_id: resourceId.nullable(),
  active: z.boolean().optional(),
  editable: z.boolean().optional(),
  approval_required: z.boolean().optional(),
  accrues: z.boolean().optional(),
  attachment: z.boolean().optional(),
  is_attachment_mandatory: z.boolean().optional(),
  allow_endless: z.boolean().optional(),
  restricted: z.boolean().optional(),
  visibility: z.boolean().optional(),
  workable: z.boolean().optional(),
  payable: z.boolean().optional(),
  details_required: z.boolean().optional(),
  half_days_units_enabled: z.boolean().optional(),
  // Added in API 2026-07-01
  eau_eligible: z.boolean().optional(),
  allowance_ids: z.array(resourceId).optional(),
  max_days_in_cents: z.number().nullable().optional(),
  min_days_in_cents: z.number().nullable().optional(),
});

export type LeaveType = z.infer<typeof LeaveTypeSchema>;

/**
 * Allowance schema
 *
 * /timeoff/allowances returns the allowance *definitions* of a time-off
 * policy (cycle, accrual, carry-over and rounding rules), not per-employee
 * balances. Field set verified against a live response on API version
 * 2026-07-01. Per-employee balances live in /timeoff/allowance_stats, which
 * this server does not call.
 */
export const AllowanceSchema = z.object({
  id: resourceId,
  timeoff_policy_id: resourceId,
  name: z.string(),
  leave_type_ids: z.array(resourceId),
  allowance_type: z.enum(['days', 'hours']),
  available_days: z.string(),
  days_type: z.string().nullable().optional(),
  timeoff_cycle: z.string(),
  cycle_start: z.string().nullable().optional(),
  cycle_length: z.number().nullable().optional(),
  frequency: z.enum(['monthly_flexible', 'yearly', 'lifetime']).nullable().optional(),
  source_units: z.string().nullable().optional(),
  accrued_units_availability: z.string().nullable().optional(),
  accrued_factor_in_cents: z.number().nullable().optional(),
  accrued_denominator_in_cents: z.number().nullable().optional(),
  holiday_allowance_in_cents: z.number().nullable().optional(),
  maximum_amount_in_cents: z.number().nullable().optional(),
  unlimited_holidays: z.boolean().optional(),
  unlimited_accrued_hours: z.boolean().optional(),
  carry_over_days: z.number().nullable().optional(),
  carry_over_units_in_cents: z.number().nullable().optional(),
  unlimited_carry_over: z.boolean().optional(),
  unlimited_carry_over_expiration: z.boolean().optional(),
  expire_in_months: z.number().nullable().optional(),
  employee_carry_over_starting_year: z.number().nullable().optional(),
  count_holiday_as_workable: z.boolean(),
  negative_counter_type: z.string().nullable().optional(),
  proration_type: z.enum(['proration_enabled', 'proration_disabled']),
  pto_proratio_enabled: z.boolean().optional(),
  range_type: z.string().nullable().optional(),
  rounding: z.enum(['half_day', 'decimals', 'quarters', 'round_up']),
  send_notification: z.boolean().nullable().optional(),
  tenure_periods_enabled: z.boolean().optional(),
  tenure_periods: z.array(z.unknown()).optional(),
  tenure_period_transition: z.string().nullable().optional(),
  position: z.number().nullable().optional(),
});

export type Allowance = z.infer<typeof AllowanceSchema>;

/**
 * Shift schema
 *
 * Only the identifier types were changed for API version 2026-07-01. The
 * remaining fields are known not to match what the live API returns; that
 * rework belongs to the attendance feature and is deliberately left out here.
 */
export const ShiftSchema = z.object({
  id: resourceId,
  employee_id: resourceId,
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
