/**
 * Training schemas: Training, TrainingSession, TrainingMembership
 */

import { z } from 'zod';
import { dateString } from './shared.js';

/**
 * Training schema
 */
export const TrainingSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  category_id: z.number().nullable(),
  status: z.string().nullable(),
  subsidized: z.boolean().nullable(),
  total_training_indirect_cost: z.number().nullable(),
  total_training_salary_cost: z.number().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
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
 */
export const TrainingSessionSchema = z.object({
  id: z.number(),
  training_id: z.number(),
  name: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  location: z.string().nullable(),
  max_attendees: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
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
 */
export const TrainingMembershipSchema = z.object({
  id: z.number(),
  training_id: z.number(),
  employee_id: z.number(),
  session_id: z.number().nullable(),
  status: z.string().nullable(),
  enrolled_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
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
