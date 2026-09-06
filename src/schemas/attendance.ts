/**
 * Attendance schemas: Shift, OpenShift, EstimatedTime, WorkedTime, and the
 * write inputs for shifts, clocking and bulk time entry.
 *
 * Response shapes were captured from the live API on version 2026-07-01 on
 * 2026-09-06 with read-only requests. All response schemas are declared with
 * passthrough so a field Factorial adds later does not break parsing.
 */

import { z } from 'zod';
import { dateString, resourceId } from './shared.js';

/** "HH:MM", 24-hour, company local wall-clock time */
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM in 24-hour company local time');

/** ISO 8601 date-time with an explicit offset, e.g. 2026-09-05T09:12:00+02:00 */
export const isoWithOffset = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
    'Date-time must be ISO 8601 with an explicit offset'
  );

// Known `source` values: desktop | mobile | face_recognition | qr_code |
// mobile_geolocation | shared_device | api | system. This server always writes `api`.

export const LOCATION_TYPES = ['office', 'business_trip', 'work_from_home'] as const;

export const HALF_DAY_VALUES = ['beggining_of_day', 'end_of_day'] as const;

/**
 * Shift record as /attendance/shifts returns it. Times are HH:MM strings, not
 * ISO 8601; `date` carries the day. `minutes` is the worked duration.
 */
export const ShiftSchema = z
  .object({
    id: resourceId,
    employee_id: resourceId,
    date: z.string(),
    reference_date: z.string().nullable(),
    clock_in: z.string().nullable(),
    clock_out: z.string().nullable(),
    clock_in_with_seconds: z.string().nullable().optional(),
    in_source: z.string().nullable(),
    out_source: z.string().nullable(),
    observations: z.string().nullable(),
    location_type: z.string().nullable(),
    half_day: z.string().nullable(),
    workable: z.boolean().nullable(),
    minutes: z.number().nullable(),
    workplace_id: resourceId.nullable(),
    time_settings_break_configuration_id: resourceId.nullable(),
    company_id: resourceId.nullable().optional(),
    in_location_latitude: z.number().nullable().optional(),
    in_location_longitude: z.number().nullable().optional(),
    in_location_accuracy: z.number().nullable().optional(),
    out_location_latitude: z.number().nullable().optional(),
    out_location_longitude: z.number().nullable().optional(),
    out_location_accuracy: z.number().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export type Shift = z.infer<typeof ShiftSchema>;

/**
 * Currently open shift as /attendance/open_shifts returns it. This is a
 * different object from Shift: clock_in is a date-time on the placeholder
 * date 2000-01-01 and there is a `status` field.
 */
export const OpenShiftSchema = z
  .object({
    id: resourceId,
    employee_id: resourceId,
    date: z.string(),
    reference_date: z.string().nullable(),
    clock_in: z.string(),
    clock_out: z.string().nullable(),
    status: z.string(),
    workable: z.boolean().nullable(),
    automatic_clock_in: z.boolean().nullable().optional(),
    location_type: z.string().nullable(),
    workplace_id: resourceId.nullable(),
    time_settings_break_configuration_id: resourceId.nullable(),
  })
  .passthrough();

export type OpenShift = z.infer<typeof OpenShiftSchema>;

/**
 * Expected minutes per day from the weekly contract pattern
 * (/attendance/estimated_times). Knows nothing about bank holidays or leave.
 */
export const EstimatedTimeSchema = z
  .object({
    id: z.string(),
    employee_id: resourceId,
    company_id: resourceId.nullable().optional(),
    date: z.string(),
    expected_minutes: z.number(),
    regular_minutes: z.number().nullable().optional(),
    overtime_minutes: z.number().nullable().optional(),
    minutes: z.number().nullable().optional(),
    estimated_half_days: z.number().nullable().optional(),
    source: z.string().nullable().optional(),
    time_unit: z.string().nullable().optional(),
    breaks: z.array(z.unknown()).optional(),
    shifts: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type EstimatedTime = z.infer<typeof EstimatedTimeSchema>;

// Known `day_type` values: workday | saturday | sunday | bank_holiday.

/**
 * Tracked minutes per day plus the day type (/attendance/worked_times). The
 * company's holiday calendar surfaces here as day_type "bank_holiday".
 */
export const WorkedTimeSchema = z
  .object({
    id: z.string(),
    employee_id: resourceId,
    company_id: resourceId.nullable().optional(),
    date: z.string(),
    day_type: z.string(),
    tracked_minutes: z.number(),
    multiplied_minutes: z.number().nullable().optional(),
    pending_minutes: z.number().nullable().optional(),
    minutes: z.number().nullable().optional(),
    time_unit: z.string().nullable().optional(),
    worked_time_blocks: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type WorkedTime = z.infer<typeof WorkedTimeSchema>;

// ============================================================================
// Write Input Schemas
// ============================================================================

/** Either HH:MM (company local) or ISO 8601 with an explicit offset */
const shiftTime = z.union([hhmm, isoWithOffset]);

/**
 * Shift create input. `date` is the only field the API requires, but with a
 * company-scoped key a missing employee_id is answered with a misleading 404,
 * so it is required here too.
 */
export const CreateShiftInputSchema = z.object({
  employee_id: z.number().int().positive(),
  date: dateString,
  clock_in: shiftTime.optional(),
  clock_out: shiftTime.optional(),
  reference_date: dateString.optional(),
  observations: z.string().max(500).optional(),
  location_type: z.enum(LOCATION_TYPES).optional(),
  workplace_id: z.number().int().positive().optional(),
  half_day: z.enum(HALF_DAY_VALUES).optional(),
  workable: z.boolean().optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftInputSchema>;

/** Shift update input: any subset of the create fields except the employee */
export const UpdateShiftInputSchema = CreateShiftInputSchema.partial().omit({ employee_id: true });

export type UpdateShiftInput = z.infer<typeof UpdateShiftInputSchema>;

/** Clock in / clock out input; `now` is supplied by the server */
export const ClockInputSchema = z.object({
  employee_id: z.number().int().positive(),
  location_type: z.enum(LOCATION_TYPES).optional(),
  workplace_id: z.number().int().positive().optional(),
  observations: z.string().max(500).optional(),
});

export type ClockInput = z.infer<typeof ClockInputSchema>;

/** One working segment of a day for the bulk actions; HH:MM only */
export const SegmentInputSchema = z.object({
  clock_in: hhmm,
  clock_out: hhmm,
});

export type SegmentInput = z.infer<typeof SegmentInputSchema>;

/** One explicit day for log_days */
export const DayInputSchema = z.object({
  date: dateString,
  segments: z.array(SegmentInputSchema).min(1),
});

export type DayInput = z.infer<typeof DayInputSchema>;
