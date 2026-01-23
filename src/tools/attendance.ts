/**
 * Attendance tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import { listShifts, getShift, createShift, updateShift, deleteShift } from '../api/index.js';

export function registerAttendanceTool(server: McpServer) {
  server.registerTool(
    'factorial_attendance',
    {
      title: 'FactorialHR Attendance',
      description: 'Manage shifts (clock in/out): list, get, create, update, delete',
      inputSchema: {
        action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Action'),
        id: z.number().optional().describe('Shift ID'),
        employee_id: z.number().optional().describe('Employee ID'),
        clock_in_gte: z.string().optional().describe('Clock in >= date (ISO datetime)'),
        clock_in_lte: z.string().optional().describe('Clock in <= date (ISO datetime)'),
        clock_in: z.string().optional().describe('Clock in time (ISO 8601)'),
        clock_out: z.string().optional().describe('Clock out time (ISO 8601)'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
        confirm: z.boolean().optional().describe('Confirm delete'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listShifts({
              employee_id: args.employee_id,
              clock_in_gte: args.clock_in_gte,
              clock_in_lte: args.clock_in_lte,
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(s => ({
              id: s.id,
              employee_id: s.employee_id,
              clock_in: s.clock_in,
              clock_out: s.clock_out,
            }));
            return textResponse(
              `Found ${result.data.length} shifts (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required');
            const shift = await getShift(args.id);
            return textResponse(`Shift details:\n\n${JSON.stringify(shift, null, 2)}`);
          }

          case 'create': {
            if (!args.employee_id || !args.clock_in) {
              return textResponse('Error: employee_id and clock_in are required');
            }
            const shift = await createShift({
              employee_id: args.employee_id,
              clock_in: args.clock_in,
              clock_out: args.clock_out,
            });
            return textResponse(`Shift created:\n\n${JSON.stringify(shift, null, 2)}`);
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required');
            const shift = await updateShift(args.id, {
              clock_in: args.clock_in,
              clock_out: args.clock_out,
            });
            return textResponse(`Shift updated:\n\n${JSON.stringify(shift, null, 2)}`);
          }

          case 'delete': {
            if (!args.id) return textResponse('Error: id is required');
            const check = checkConfirmation('delete_shift', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            await deleteShift(args.id);
            return textResponse(`Shift ${args.id} deleted successfully.`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
