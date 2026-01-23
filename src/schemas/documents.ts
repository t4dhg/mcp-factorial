/**
 * Document schemas: Folder, Document
 */

import { z } from 'zod';

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
