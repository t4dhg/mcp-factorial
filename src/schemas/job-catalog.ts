/**
 * Job Catalog schemas: JobRole, JobLevel
 */

import { z } from 'zod';

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
