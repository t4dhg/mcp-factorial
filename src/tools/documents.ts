/**
 * Documents tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { textResponse, formatToolError } from '../tool-utils.js';
import {
  listFolders,
  getFolder,
  listDocuments,
  getDocument,
  downloadEmployeePayslips,
  downloadEmployeeDocument,
  searchEmployees,
} from '../api/index.js';

export function registerDocumentsTool(server: McpServer) {
  server.registerTool(
    'factorial_documents',
    {
      title: 'FactorialHR Documents',
      description:
        'Document management: list folders, list/get documents, search, download (OAuth2 required for downloads)',
      inputSchema: {
        action: z
          .enum([
            'list_folders',
            'get_folder',
            'list',
            'get',
            'get_by_employee',
            'search',
            'download_payslips',
            'download',
          ])
          .describe('Action'),
        id: z.number().optional().describe('Folder/document ID'),
        employee_id: z.number().optional().describe('Employee ID'),
        folder_id: z.number().optional().describe('Folder ID filter'),
        employee_name: z.string().optional().describe('Employee name (for search)'),
        document_pattern: z.string().optional().describe('Document name pattern (for search)'),
        output_dir: z.string().optional().describe('Output directory (for downloads)'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list_folders': {
            const folders = await listFolders();
            const summary = folders.map(f => ({
              id: f.id,
              name: f.name,
            }));
            return textResponse(
              `Found ${folders.length} folders:\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get_folder': {
            if (!args.id) return textResponse('Error: id is required');
            const folder = await getFolder(args.id);
            return textResponse(`Folder details:\n\n${JSON.stringify(folder, null, 2)}`);
          }

          case 'list': {
            const result = await listDocuments({
              folder_id: args.folder_id,
              employee_ids: args.employee_id ? [args.employee_id] : undefined,
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(d => ({
              id: d.id,
              name: d.name,
              folder_id: d.folder_id,
              employee_id: d.employee_id,
              mime_type: d.mime_type,
            }));
            return textResponse(
              `Found ${result.data.length} documents:\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required');
            const doc = await getDocument(args.id);
            return textResponse(`Document details:\n\n${JSON.stringify(doc, null, 2)}`);
          }

          case 'get_by_employee': {
            if (!args.employee_id) return textResponse('Error: employee_id is required');
            const result = await listDocuments({ employee_ids: [args.employee_id] });
            const summary = result.data.map(d => ({
              id: d.id,
              name: d.name,
              folder_id: d.folder_id,
              mime_type: d.mime_type,
            }));
            return textResponse(
              `Found ${result.data.length} documents for employee ${args.employee_id}:\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'search': {
            if (!args.employee_name) return textResponse('Error: employee_name is required');
            const employees = await searchEmployees(args.employee_name);
            if (employees.length === 0) {
              return textResponse(`No employees found matching "${args.employee_name}"`);
            }
            const allDocs: unknown[] = [];
            for (const emp of employees.slice(0, 5)) {
              const result = await listDocuments({ employee_ids: [emp.id] });
              let docs = result.data;
              if (args.document_pattern) {
                const pattern = args.document_pattern.toLowerCase();
                docs = docs.filter(d => d.name?.toLowerCase().includes(pattern));
              }
              allDocs.push(
                ...docs.map(d => ({
                  id: d.id,
                  name: d.name,
                  employee: emp.full_name,
                  folder_id: d.folder_id,
                }))
              );
            }
            return textResponse(
              `Found ${allDocs.length} documents:\n\n${JSON.stringify(allDocs, null, 2)}`
            );
          }

          case 'download_payslips': {
            if (!args.employee_id) return textResponse('Error: employee_id is required');
            if (!args.output_dir)
              return textResponse('Error: output_dir is required for downloads');
            const payslipResults = await downloadEmployeePayslips(
              args.employee_id,
              args.output_dir
            );
            return textResponse(
              `Downloaded ${payslipResults.length} payslips:\n\n${JSON.stringify(
                payslipResults.map(r => r.path),
                null,
                2
              )}`
            );
          }

          case 'download': {
            if (!args.id) return textResponse('Error: id (document ID) is required');
            if (!args.output_dir)
              return textResponse('Error: output_dir is required for downloads');
            const downloadResult = await downloadEmployeeDocument(args.id, args.output_dir);
            return textResponse(`Downloaded document to: ${downloadResult.path}`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
