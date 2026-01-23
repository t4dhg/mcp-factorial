/**
 * Work Areas tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { textResponse, formatToolError } from '../tool-utils.js';
import {
  listWorkAreas,
  getWorkArea,
  createWorkArea,
  updateWorkArea,
  archiveWorkArea,
  unarchiveWorkArea,
} from '../api/index.js';

export function registerWorkAreasTool(server: McpServer) {
  server.registerTool(
    'factorial_work_areas',
    {
      title: 'FactorialHR Work Areas',
      description: 'Manage work areas within locations',
      inputSchema: {
        action: z
          .enum(['list', 'get', 'create', 'update', 'archive', 'unarchive'])
          .describe('Action'),
        id: z.number().optional().describe('Work area ID'),
        location_id: z.number().optional().describe('Location ID'),
        name: z.string().optional().describe('Work area name'),
        description: z.string().optional().describe('Description'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listWorkAreas({ page: args.page, limit: args.limit });
            // Filter by location_id client-side if specified
            let data = result.data;
            if (args.location_id) {
              data = data.filter(w => w.location_id === args.location_id);
            }
            const summary = data.map(w => ({
              id: w.id,
              name: w.name,
              location_id: w.location_id,
              archived: w.archived,
            }));
            return textResponse(
              `Found ${summary.length} work areas:\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required');
            const workArea = await getWorkArea(args.id);
            return textResponse(`Work area details:\n\n${JSON.stringify(workArea, null, 2)}`);
          }

          case 'create': {
            if (!args.location_id || !args.name) {
              return textResponse('Error: location_id and name are required');
            }
            const workArea = await createWorkArea({
              location_id: args.location_id,
              name: args.name,
              description: args.description,
            });
            return textResponse(`Work area created:\n\n${JSON.stringify(workArea, null, 2)}`);
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required');
            const workArea = await updateWorkArea(args.id, {
              name: args.name,
              description: args.description,
            });
            return textResponse(`Work area updated:\n\n${JSON.stringify(workArea, null, 2)}`);
          }

          case 'archive': {
            if (!args.id) return textResponse('Error: id is required');
            const workArea = await archiveWorkArea(args.id);
            return textResponse(`Work area archived:\n\n${JSON.stringify(workArea, null, 2)}`);
          }

          case 'unarchive': {
            if (!args.id) return textResponse('Error: id is required');
            const workArea = await unarchiveWorkArea(args.id);
            return textResponse(`Work area unarchived:\n\n${JSON.stringify(workArea, null, 2)}`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
