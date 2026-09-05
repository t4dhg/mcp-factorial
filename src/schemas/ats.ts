/**
 * ATS (Applicant Tracking System) schemas: JobPosting, Candidate, Application, HiringStage
 */

import { z } from 'zod';
import { resourceId } from './shared.js';

/**
 * Job Posting schema
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no job postings, so it could not be checked against a live record.
 */
export const JobPostingSchema = z.object({
  id: resourceId,
  company_id: resourceId.optional(),
  ats_company_id: resourceId.optional(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['draft', 'published', 'unlisted', 'archived', 'cancelled', 'deleted']),
  contract_type: z.string().nullable().optional(),
  // Added in API 2026-07-01
  category: z.string().nullable().optional(),
  workplace_type: z.enum(['onsite', 'remote', 'hybrid']).nullable().optional(),
  remote: z.boolean().optional(),
  schedule_type: z.enum(['full_time', 'part_time']).nullable().optional(),
  team_id: resourceId.nullable(),
  location_id: resourceId.nullable(),
  legal_entity_id: resourceId.nullable().optional(),
  salary_format: z.enum(['fixed_amount', 'range']).nullable().optional(),
  salary_from_amount_in_cents: z.number().nullable().optional(),
  salary_to_amount_in_cents: z.number().nullable().optional(),
  salary_period: z.enum(['annual', 'monthly', 'daily']).nullable().optional(),
  hide_salary: z.boolean().nullable().optional(),
  cv_requirement: z.enum(['mandatory', 'optional', 'do_not_ask']).optional(),
  cover_letter_requirement: z.enum(['mandatory', 'optional', 'do_not_ask']).optional(),
  phone_requirement: z.enum(['mandatory', 'optional', 'do_not_ask']).optional(),
  photo_requirement: z.enum(['mandatory', 'optional', 'do_not_ask']).optional(),
  personal_url_requirement: z.enum(['mandatory', 'optional', 'do_not_ask']).optional(),
  url: z.string().nullable().optional(),
  published_at: z.string().nullable(),
  created_at: z.string().nullable(),
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
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no candidates, so it could not be checked against a live record.
 */
export const CandidateSchema = z.object({
  id: resourceId,
  company_id: resourceId.nullable().optional(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  email: z.string().nullable(),
  phone_number: z.string().nullable().optional(),
  personal_url: z.string().nullable().optional(),
  gender: z.enum(['female', 'male', 'unanswered', 'other']).nullable().optional(),
  talent_pool: z.boolean().optional(),
  consent_to_talent_pool: z.boolean().nullable().optional(),
  consent_given_at: z.string().nullable().optional(),
  consent_expiration_date: z.string().nullable().optional(),
  inactive_since: z.string().nullable().optional(),
  medium: z.string().nullable().optional(),
  source_id: resourceId.nullable().optional(),
  score: z.number().nullable().optional(),
  ats_job_posting_ids: z.array(resourceId).optional(),
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
 *
 * Response field set taken from the 2026-07-01 reference; the verification
 * tenant has no applications, so it could not be checked against a live record.
 * Foreign keys are prefixed `ats_` (ats_job_posting_id, ats_candidate_id) and
 * the pipeline position is `ats_application_phase_id`.
 */
export const ApplicationSchema = z.object({
  id: resourceId,
  company_id: resourceId.optional(),
  ats_job_posting_id: resourceId,
  ats_candidate_id: resourceId,
  ats_application_phase_id: resourceId.nullable(),
  ats_conversation_id: resourceId.nullable().optional(),
  ats_rejection_reason_id: resourceId.nullable().optional(),
  employee_id: resourceId.nullable().optional(),
  source_id: resourceId.nullable().optional(),
  qualified: z.boolean().nullable().optional(),
  phone: z.string().nullable().optional(),
  medium: z.string().nullable().optional(),
  cover_letter: z.string().nullable().optional(),
  // Added in API 2026-07-01: CV attachment (filename, url, byte_size, content_type, created_at)
  cv: z.record(z.string(), z.unknown()).nullable().optional(),
  rating_average: z.number().nullable().optional(),
  created_at: z.string().nullable(),
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
 *
 * Field set verified against live /ats/hiring_stages responses on API
 * version 2026-07-01. Hiring stages carry no timestamps.
 */
export const HiringStageSchema = z.object({
  id: resourceId,
  name: z.enum(['new', 'screening', 'interview', 'assessment', 'offer', 'hired']),
  label: z.string(),
  position: z.number(),
  company_id: resourceId.nullable(),
});

export type HiringStage = z.infer<typeof HiringStageSchema>;
