/**
 * Document schemas: Folder, Document
 *
 * Field sets verified against live /documents/folders and /documents/documents
 * responses on API version 2026-07-01.
 */

import { z } from 'zod';
import { resourceId } from './shared.js';

/**
 * Folder schema
 */
export const FolderSchema = z.object({
  id: resourceId,
  name: z.string(),
  parent_folder_id: resourceId.nullable(),
  company_id: resourceId.nullable().optional(),
  active: z.boolean(),
  /** 'company_internal', 'employee_my_documents' or 'unknown' */
  space: z.string(),
});

export type Folder = z.infer<typeof FolderSchema>;

/**
 * Document schema
 *
 * Note that the API exposes the file name as `filename`, the MIME type as
 * `content_type` and the size as `file_size`. It has no `name`, `mime_type`,
 * `size_bytes` or `file_url` fields; the download URL is obtained separately
 * through the download-urls endpoint.
 */
export const DocumentSchema = z.object({
  id: resourceId,
  filename: z.string(),
  extension: z.string().nullable().optional(),
  content_type: z.string().nullable(),
  file_size: z.number().nullable(),
  folder_id: resourceId.nullable(),
  employee_id: resourceId.nullable(), // Employee the document belongs to
  author_id: resourceId.nullable(),
  company_id: resourceId.nullable(),
  leave_id: resourceId.nullable().optional(),
  public: z.boolean().default(false),
  space: z.string(),
  is_company_document: z.boolean().optional(),
  is_management_document: z.boolean().optional(),
  is_pending_assignment: z.boolean().optional(),
  signature_status: z
    .enum([
      'pending',
      'partially_signed',
      'declined',
      'completed',
      'bounced_email',
      'cancelled',
      'error',
      'expired',
    ])
    .nullable()
    .optional(),
  signees: z.array(resourceId).optional(),
  deleted_at: z.string().nullable().optional(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Document = z.infer<typeof DocumentSchema>;
