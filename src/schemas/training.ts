/**
 * Training schemas: Training, TrainingSession, TrainingMembership
 */

import { z } from 'zod';
import { dateString, resourceId } from './shared.js';

/**
 * Training schema
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no trainings, so it could not be checked against a live record.
 * Note that the cost totals are serialised as decimal strings.
 */
export const TrainingSchema = z.object({
  id: resourceId,
  company_id: resourceId.optional(),
  author_id: resourceId.optional(),
  // Added in API 2026-07-01
  author_employee_id: resourceId.nullable().optional(),
  name: z.string(),
  code: z.string().nullable().optional(),
  description: z.string().nullable(),
  objectives: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'deleted']).nullable().optional(),
  catalog: z.boolean().optional(),
  external: z.boolean().optional(),
  external_provider: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  category_ids: z.array(resourceId).optional(),
  competency_ids: z.array(resourceId).optional(),
  // Added in API 2026-01-01
  is_mandatory: z.boolean().optional(),
  total_duration: z.number().nullable().optional(),
  valid_for: z.number().nullable().optional(),
  subsidized: z.boolean().nullable(),
  fundae_subsidized: z.boolean().optional(),
  cost: z.number().nullable().optional(),
  subsidized_cost: z.number().nullable().optional(),
  total_cost: z.number().nullable().optional(),
  cost_decimal: z.string().nullable().optional(),
  subsidized_cost_decimal: z.string().nullable().optional(),
  total_cost_decimal: z.string().nullable().optional(),
  total_training_cost: z.string().nullable().optional(),
  total_training_indirect_cost: z.string().nullable().optional(),
  total_training_salary_cost: z.string().nullable().optional(),
  total_training_subsidized_cost: z.string().nullable().optional(),
  total_participants: z.number().nullable().optional(),
  number_of_expired_participants: z.number().nullable().optional(),
  training_attendance_status: z
    .enum(['notassigned', 'notstarted', 'missing', 'started', 'partiallycompleted', 'completed'])
    .nullable()
    .optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type Training = z.infer<typeof TrainingSchema>;

/**
 * Training create input schema
 */
export const CreateTrainingInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  category_id: z.number().positive().optional(),
  subsidized: z.boolean().optional(),
});

export type CreateTrainingInput = z.infer<typeof CreateTrainingInputSchema>;

/**
 * Training update input schema
 */
export const UpdateTrainingInputSchema = CreateTrainingInputSchema.partial();

export type UpdateTrainingInput = z.infer<typeof UpdateTrainingInputSchema>;

/**
 * Training Session schema
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no sessions, so it could not be checked against a live record.
 */
export const TrainingSessionSchema = z.object({
  id: resourceId,
  training_id: resourceId,
  training_class_id: resourceId.nullable().optional(),
  parent_id: resourceId.nullable().optional(),
  session_feedback_id: resourceId.nullable().optional(),
  session_attendance_ids: z.array(resourceId).optional(),
  name: z.string().nullable(),
  description: z.string().nullable().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  modality: z.enum(['online', 'inperson', 'mixed']).nullable().optional(),
  schedule: z.enum(['scheduled', 'selfpaced']).nullable().optional(),
  link: z.string().nullable().optional(),
  location: z.string().nullable(),
  status: z.string().nullable().optional(),
  subsidized: z.boolean().optional(),
});

export type TrainingSession = z.infer<typeof TrainingSessionSchema>;

/**
 * Training Session create input schema
 */
export const CreateTrainingSessionInputSchema = z.object({
  training_id: z.number().positive(),
  name: z.string().max(100).optional(),
  start_date: dateString.optional(),
  end_date: dateString.optional(),
  location: z.string().max(200).optional(),
  max_attendees: z.number().positive().optional(),
});

export type CreateTrainingSessionInput = z.infer<typeof CreateTrainingSessionInputSchema>;

/**
 * Training Session update input schema
 */
export const UpdateTrainingSessionInputSchema = CreateTrainingSessionInputSchema.partial().omit({
  training_id: true,
});

export type UpdateTrainingSessionInput = z.infer<typeof UpdateTrainingSessionInputSchema>;

/**
 * Training Membership (Enrollment) schema
 *
 * Response field set taken from the 2026-07-01 reference for
 * /trainings/training_memberships; the verification tenant has no trainings,
 * so it could not be checked against a live record.
 */
export const TrainingMembershipSchema = z.object({
  id: resourceId,
  training_id: resourceId,
  employee_id: resourceId,
  access_id: resourceId.optional(),
  status: z
    .enum(['notassigned', 'notstarted', 'missing', 'started', 'partiallycompleted', 'completed'])
    .nullable()
    .optional(),
  training_due_date: z.string().nullable().optional(),
  training_completed_at: z.string().nullable().optional(),
});

export type TrainingMembership = z.infer<typeof TrainingMembershipSchema>;

/**
 * Training enrollment input schema
 */
export const EnrollTrainingInputSchema = z.object({
  training_id: z.number().positive(),
  employee_id: z.number().positive(),
  session_id: z.number().positive().optional(),
});

export type EnrollTrainingInput = z.infer<typeof EnrollTrainingInputSchema>;
