/**
 * Teams tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import { listTeams, getTeam, createTeam, updateTeam, deleteTeam } from '../api/index.js';

export function registerTeamsTool(server: McpServer) {
  server.registerTool(
    'factorial_teams',
    {
      title: 'FactorialHR Teams',
      description: 'Manage teams: list, get, create, update, delete',
      inputSchema: {
        action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Action'),
        id: z.number().optional().describe('Team ID (for get/update/delete)'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
        name: z.string().optional().describe('Team name'),
        description: z.string().optional().describe('Team description'),
        lead_ids: z.array(z.number()).optional().describe('Team lead employee IDs'),
        employee_ids: z.array(z.number()).optional().describe('Member employee IDs'),
        confirm: z.boolean().optional().describe('Confirm delete'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listTeams({ page: args.page, limit: args.limit });
            const summary = result.data.map(t => ({
              id: t.id,
              name: t.name,
              lead_ids: t.lead_ids,
              employee_count: t.employee_ids?.length || 0,
            }));
            return textResponse(
              `Found ${result.data.length} teams (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required');
            const team = await getTeam(args.id);
            return textResponse(`Team details:\n\n${JSON.stringify(team, null, 2)}`);
          }

          case 'create': {
            if (!args.name) return textResponse('Error: name is required');
            const team = await createTeam({
              name: args.name,
              description: args.description,
              lead_ids: args.lead_ids,
              employee_ids: args.employee_ids,
            });
            return textResponse(`Team created:\n\n${JSON.stringify(team, null, 2)}`);
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required');
            const team = await updateTeam(args.id, {
              name: args.name,
              description: args.description,
              lead_ids: args.lead_ids,
              employee_ids: args.employee_ids,
            });
            return textResponse(`Team updated:\n\n${JSON.stringify(team, null, 2)}`);
          }

          case 'delete': {
            if (!args.id) return textResponse('Error: id is required');
            const check = checkConfirmation('delete_team', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            await deleteTeam(args.id);
            return textResponse(`Team ${args.id} deleted successfully.`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
