/**
 * Project Management schemas: Project, ProjectTask, ProjectWorker, TimeRecord
 */

import { z } from 'zod';
import { dateString, resourceId } from './shared.js';

/**
 * Project schema
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no projects, so it could not be checked against a live record.
 */
export const ProjectSchema = z.object({
  id: resourceId,
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(['active', 'closed', 'draft', 'processing']),
  employees_assignment: z.enum(['manual', 'company']),
  legal_entity_id: resourceId.optional(),
  client_id: resourceId.nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  is_billable: z.boolean().optional(),
  inputed_minutes: z.number().nullable().optional(),
  fixed_cost_cents: z.number().nullable().optional(),
  labor_cost_cents: z.number().nullable().optional(),
  spending_cost_cents: z.number().nullable().optional(),
  total_cost_cents: z.number().nullable().optional(),
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
 *
 * A project task links a project (or subproject) to a task in the tasks
 * module; the task's own name, description and due date live on that task.
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no project tasks, so it could not be checked against a live record.
 */
export const ProjectTaskSchema = z.object({
  id: resourceId,
  project_id: resourceId,
  subproject_id: resourceId.nullable(),
  task_id: resourceId,
  follow_up: z.boolean(),
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
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no project workers, so it could not be checked against a live record.
 */
export const ProjectWorkerSchema = z.object({
  id: resourceId,
  project_id: resourceId,
  employee_id: resourceId,
  assigned: z.boolean().optional(),
  inputed_minutes: z.number().nullable().optional(),
  labor_cost_cents: z.number().nullable().optional(),
  company_labor_cost_cents: z.number().nullable().optional(),
  spending_cost_cents: z.number().nullable().optional(),
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
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no time records, so it could not be checked against a live record.
 */
export const TimeRecordSchema = z.object({
  id: resourceId,
  project_worker_id: resourceId,
  subproject_id: resourceId.nullable().optional(),
  attendance_shift_id: resourceId.nullable().optional(),
  date: z.string().nullable().optional(),
  imputed_minutes: z.number().nullable().optional(),
  clock_in: z.string().nullable().optional(),
  clock_out: z.string().nullable().optional(),
  // Added in API 2026-07-01: comment for the time record
  observations: z.string().nullable().optional(),
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
