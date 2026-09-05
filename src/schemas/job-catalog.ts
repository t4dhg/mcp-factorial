/**
 * Job Catalog schemas: JobRole, JobLevel
 *
 * Field sets verified against live /job_catalog/roles and /job_catalog/levels
 * responses on API version 2026-07-01. Neither resource carries timestamps.
 */

import { z } from 'zod';
import { resourceId } from './shared.js';

/**
 * Job role schema
 */
export const JobRoleSchema = z.object({
  id: resourceId,
  name: z.string(),
  description: z.string().nullable(),
  company_id: resourceId.nullable(),
  archived: z.boolean(),
  legal_entities_ids: z.array(resourceId).optional(),
  supervisors_ids: z.array(resourceId).optional(),
  competencies_ids: z.array(resourceId).optional(),
});

export type JobRole = z.infer<typeof JobRoleSchema>;

/**
 * Job level schema
 */
export const JobLevelSchema = z.object({
  id: resourceId,
  role_id: resourceId,
  name: z.string(),
  role_name: z.string(),
  order: z.number(),
  archived: z.boolean(),
  is_default: z.boolean(),
});

export type JobLevel = z.infer<typeof JobLevelSchema>;
