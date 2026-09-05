/**
 * Work Area schemas
 *
 * Response field set taken from the 2026-07-01 reference for
 * /locations/work_areas; the verification tenant has no work areas, so it
 * could not be checked against a live record.
 */

import { z } from 'zod';
import { resourceId } from './shared.js';

/**
 * Work Area schema
 */
export const WorkAreaSchema = z.object({
  id: resourceId,
  location_id: resourceId,
  name: z.string(),
  /** Set when the work area is archived; null while it is active */
  archived_at: z.string().nullable().optional(),
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
