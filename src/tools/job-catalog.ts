/**
 * Job Catalog tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { textResponse, formatToolError } from '../tool-utils.js';
import { listJobRoles, getJobRole, listJobLevels } from '../api/index.js';

export function registerJobCatalogTool(server: McpServer) {
  server.registerTool(
    'factorial_job_catalog',
    {
      title: 'FactorialHR Job Catalog',
      description: 'View job roles and levels',
      inputSchema: {
        action: z.enum(['list_roles', 'get_role', 'list_levels']).describe('Action'),
        id: z.number().optional().describe('Job role ID (for get_role)'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list_roles': {
            const roles = await listJobRoles();
            return textResponse(
              `Found ${roles.length} job roles:\n\n${JSON.stringify(roles, null, 2)}`
            );
          }

          case 'get_role': {
            if (!args.id) return textResponse('Error: id is required');
            const role = await getJobRole(args.id);
            return textResponse(`Job role details:\n\n${JSON.stringify(role, null, 2)}`);
          }

          case 'list_levels': {
            const levels = await listJobLevels();
            return textResponse(
              `Found ${levels.length} job levels:\n\n${JSON.stringify(levels, null, 2)}`
            );
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
