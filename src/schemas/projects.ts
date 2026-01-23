/**
 * Project Management schemas: Project, ProjectTask, ProjectWorker, TimeRecord
 */

import { z } from 'zod';
import { dateString } from './shared.js';

/**
 * Project schema
 */
export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(['active', 'inactive', 'archived']).nullable(),
  employees_assignment: z.enum(['manual', 'company']).nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;

/**
 * Project create input schema
 */
export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  employees_assignment: z.enum(['manual', 'company']).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

/**
 * Project update input schema
 */
export const UpdateProjectInputSchema = CreateProjectInputSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

/**
 * Project Task schema
 */
export const ProjectTaskSchema = z.object({
  id: z.number(),
  name: z.string(),
  project_id: z.number(),
  subproject_id: z.number().nullable(),
  description: z.string().nullable(),
  completed: z.boolean().default(false),
  due_on: z.string().nullable(),
  due_status: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type ProjectTask = z.infer<typeof ProjectTaskSchema>;

/**
 * Project Task create input schema
 */
export const CreateProjectTaskInputSchema = z.object({
  name: z.string().min(1).max(100),
  project_id: z.number().positive(),
  description: z.string().max(500).optional(),
  due_on: dateString.optional(),
});

export type CreateProjectTaskInput = z.infer<typeof CreateProjectTaskInputSchema>;

/**
 * Project Task update input schema
 */
export const UpdateProjectTaskInputSchema = CreateProjectTaskInputSchema.partial()
  .omit({ project_id: true })
  .extend({
    completed: z.boolean().optional(),
  });

export type UpdateProjectTaskInput = z.infer<typeof UpdateProjectTaskInputSchema>;

/**
 * Project Worker schema
 */
export const ProjectWorkerSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  employee_id: z.number(),
  company_labor_cost_cents: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type ProjectWorker = z.infer<typeof ProjectWorkerSchema>;

/**
 * Project Worker assign input schema
 */
export const AssignProjectWorkerInputSchema = z.object({
  project_id: z.number().positive(),
  employee_id: z.number().positive(),
});

export type AssignProjectWorkerInput = z.infer<typeof AssignProjectWorkerInputSchema>;

/**
 * Time Record schema
 */
export const TimeRecordSchema = z.object({
  id: z.number(),
  project_worker_id: z.number(),
  subproject_id: z.number().nullable(),
  attendance_shift_id: z.number().nullable(),
  minutes: z.number(),
  date: z.string(),
  description: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type TimeRecord = z.infer<typeof TimeRecordSchema>;

/**
 * Time Record create input schema
 */
export const CreateTimeRecordInputSchema = z.object({
  project_worker_id: z.number().positive(),
  date: dateString,
  minutes: z.number().min(1).max(1440),
  description: z.string().max(500).optional(),
});

export type CreateTimeRecordInput = z.infer<typeof CreateTimeRecordInputSchema>;

/**
 * Time Record update input schema
 */
export const UpdateTimeRecordInputSchema = CreateTimeRecordInputSchema.partial().omit({
  project_worker_id: true,
});

export type UpdateTimeRecordInput = z.infer<typeof UpdateTimeRecordInputSchema>;
