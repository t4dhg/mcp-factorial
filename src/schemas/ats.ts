/**
 * ATS (Applicant Tracking System) schemas: JobPosting, Candidate, Application, HiringStage
 */

import { z } from 'zod';

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
