/**
 * Work Area schemas
 */

import { z } from 'zod';

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
