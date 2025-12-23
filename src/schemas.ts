/**
 * Zod schemas for runtime validation of API responses
 *
 * Catches API version mismatches and ensures type safety at runtime.
 */

import { z } from 'zod';
import { SchemaValidationError } from './errors.js';

/**
 * Employee schema
 */
export const EmployeeSchema = z.object({
  id: z.number(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  birthday_on: z.string().nullable(),
  hired_on: z.string().nullable(),
  start_date: z.string().nullable(),
  terminated_on: z.string().nullable(),
  gender: z.string().nullable(),
  nationality: z.string().nullable(),
  manager_id: z.number().nullable(),
  role: z.string().nullable(),
  timeoff_manager_id: z.number().nullable(),
  company_id: z.number().nullable(),
  legal_entity_id: z.number().nullable(),
  team_ids: z.array(z.number()).default([]),
  location_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Employee = z.infer<typeof EmployeeSchema>;

/**
 * Team schema
 */
export const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  employee_ids: z.array(z.number()).default([]),
  lead_ids: z.array(z.number()).default([]),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Team = z.infer<typeof TeamSchema>;

/**
 * Location schema
 */
export const LocationSchema = z.object({
  id: z.number(),
  name: z.string(),
  country: z.string().nullable(),
  phone_number: z.string().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address_line_1: z.string().nullable(),
  address_line_2: z.string().nullable(),
  postal_code: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Location = z.infer<typeof LocationSchema>;

/**
 * Contract schema
 */
export const ContractSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  job_title: z.string().nullable(),
  effective_on: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Contract = z.infer<typeof ContractSchema>;

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

/**
 * Folder schema
 */
export const FolderSchema = z.object({
  id: z.number(),
  name: z.string(),
  parent_id: z.number().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Folder = z.infer<typeof FolderSchema>;

/**
 * Document schema
 */
export const DocumentSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  folder_id: z.number().nullable(),
  employee_id: z.number().nullable(), // Employee the document belongs to
  author_id: z.number().nullable(),
  company_id: z.number().nullable(),
  public: z.boolean().default(false),
  space: z.string().nullable(),
  file_url: z.string().nullable(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Document = z.infer<typeof DocumentSchema>;

/**
 * Job role schema
 */
export const JobRoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type JobRole = z.infer<typeof JobRoleSchema>;

/**
 * Job level schema
 */
export const JobLevelSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type JobLevel = z.infer<typeof JobLevelSchema>;

// ============================================================================
// Write Input Schemas (for create/update operations)
// ============================================================================

/**
 * Date string pattern (YYYY-MM-DD)
 */
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateString = z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format');

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

// ============================================================================
// New Entity Schemas (Projects, Training, ATS, Work Areas, Payroll)
// ============================================================================

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

/**
 * Work Area schema
 */
export const WorkAreaSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  location_id: z.number().nullable(),
  company_id: z.number().nullable(),
  archived: z.boolean().default(false),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type WorkArea = z.infer<typeof WorkAreaSchema>;

/**
 * Work Area create input schema
 */
export const CreateWorkAreaInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  location_id: z.number().positive().optional(),
});

export type CreateWorkAreaInput = z.infer<typeof CreateWorkAreaInputSchema>;

/**
 * Work Area update input schema
 */
export const UpdateWorkAreaInputSchema = CreateWorkAreaInputSchema.partial();

export type UpdateWorkAreaInput = z.infer<typeof UpdateWorkAreaInputSchema>;

/**
 * Job Posting schema
 */
export const JobPostingSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  department: z.string().nullable(),
  location_id: z.number().nullable(),
  team_id: z.number().nullable(),
  status: z.enum(['draft', 'published', 'closed', 'archived']).nullable(),
  employment_type: z.string().nullable(),
  remote_status: z.string().nullable(),
  company_id: z.number().nullable(),
  published_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;

/**
 * Job Posting create input schema
 */
export const CreateJobPostingInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  department: z.string().max(100).optional(),
  location_id: z.number().positive().optional(),
  team_id: z.number().positive().optional(),
  employment_type: z.string().max(50).optional(),
  remote_status: z.string().max(50).optional(),
});

export type CreateJobPostingInput = z.infer<typeof CreateJobPostingInputSchema>;

/**
 * Job Posting update input schema
 */
export const UpdateJobPostingInputSchema = CreateJobPostingInputSchema.partial().extend({
  status: z.enum(['draft', 'published', 'closed', 'archived']).optional(),
});

export type UpdateJobPostingInput = z.infer<typeof UpdateJobPostingInputSchema>;

/**
 * Candidate schema
 */
export const CandidateSchema = z.object({
  id: z.number(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  source: z.string().nullable(),
  resume_url: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

/**
 * Candidate create input schema
 */
export const CreateCandidateInputSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  source: z.string().max(100).optional(),
  linkedin_url: z.string().url().optional(),
});

export type CreateCandidateInput = z.infer<typeof CreateCandidateInputSchema>;

/**
 * Candidate update input schema
 */
export const UpdateCandidateInputSchema = CreateCandidateInputSchema.partial();

export type UpdateCandidateInput = z.infer<typeof UpdateCandidateInputSchema>;

/**
 * Application schema
 */
export const ApplicationSchema = z.object({
  id: z.number(),
  job_posting_id: z.number(),
  candidate_id: z.number(),
  hiring_stage_id: z.number().nullable(),
  ats_application_phase_id: z.number().nullable(),
  status: z.string().nullable(),
  rating: z.number().nullable(),
  notes: z.string().nullable(),
  applied_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
  hired_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Application = z.infer<typeof ApplicationSchema>;

/**
 * Application create input schema
 */
export const CreateApplicationInputSchema = z.object({
  job_posting_id: z.number().positive(),
  candidate_id: z.number().positive(),
  notes: z.string().max(2000).optional(),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationInputSchema>;

/**
 * Application update input schema
 */
export const UpdateApplicationInputSchema = z.object({
  hiring_stage_id: z.number().positive().optional(),
  rating: z.number().min(0).max(5).optional(),
  notes: z.string().max(2000).optional(),
});

export type UpdateApplicationInput = z.infer<typeof UpdateApplicationInputSchema>;

/**
 * Hiring Stage schema
 */
export const HiringStageSchema = z.object({
  id: z.number(),
  name: z.string(),
  label: z.string().nullable(),
  ats_application_phase_id: z.number().nullable(),
  position: z.number().nullable(),
  company_id: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type HiringStage = z.infer<typeof HiringStageSchema>;

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
  identifier_type: z.string().nullable(),
  identifier_value: z.string().nullable(),
  country: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
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

// ============================================================================
// API Response Helpers
// ============================================================================

/**
 * API response wrapper schema
 */
export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}

/**
 * API list response wrapper schema
 */
export function createApiListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
  });
}

/**
 * Parse and validate data against a schema
 * @throws SchemaValidationError if validation fails
 */
export function parseData<T>(schemaName: string, schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new SchemaValidationError(schemaName, issues, { data });
  }
  return result.data;
}

/**
 * Safely parse data without throwing (returns undefined on failure)
 */
export function safeParseData<T>(schema: z.ZodSchema<T>, data: unknown): T | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Parse an array of items against a schema
 */
export function parseArray<T>(schemaName: string, itemSchema: z.ZodSchema<T>, data: unknown): T[] {
  if (!Array.isArray(data)) {
    throw new SchemaValidationError(schemaName, 'Expected an array', { data });
  }
  return data.map((item, index) => {
    const result = itemSchema.safeParse(item);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new SchemaValidationError(`${schemaName}[${index}]`, issues, { item });
    }
    return result.data;
  });
}
