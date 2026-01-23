/**
 * Time Off tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
  listLeaves,
  getLeave,
  listLeaveTypes,
  getLeaveType,
  listAllowances,
  createLeave,
  updateLeave,
  cancelLeave,
  approveLeave,
  rejectLeave,
} from '../api/index.js';

export function registerTimeOffTool(server: McpServer) {
  server.registerTool(
    'factorial_time_off',
    {
      title: 'FactorialHR Time Off',
      description:
        'Manage leave requests: list, get, create, update, cancel, approve, reject, view types and allowances',
      inputSchema: {
        action: z
          .enum([
            'list_leaves',
            'get_leave',
            'list_types',
            'get_type',
            'list_allowances',
            'create',
            'update',
            'cancel',
            'approve',
            'reject',
          ])
          .describe('Action'),
        id: z.number().optional().describe('Leave/type ID'),
        employee_id: z.number().optional().describe('Employee ID'),
        leave_type_id: z.number().optional().describe('Leave type ID'),
        start_on: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        finish_on: z.string().optional().describe('End date (YYYY-MM-DD)'),
        half_day: z.enum(['all_day', 'start', 'finish']).optional().describe('Half day option'),
        description: z.string().optional().describe('Leave description'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
        confirm: z.boolean().optional().describe('Confirm cancel/reject'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list_leaves': {
            const result = await listLeaves({
              employee_id: args.employee_id,
              start_on_gte: args.start_on,
              start_on_lte: args.finish_on,
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(l => ({
              id: l.id,
              employee_id: l.employee_id,
              leave_type_id: l.leave_type_id,
              start_on: l.start_on,
              finish_on: l.finish_on,
              status: l.status,
            }));
            return textResponse(
              `Found ${result.data.length} leaves (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get_leave': {
            if (!args.id) return textResponse('Error: id is required');
            const leave = await getLeave(args.id);
            return textResponse(`Leave details:\n\n${JSON.stringify(leave, null, 2)}`);
          }

          case 'list_types': {
            const types = await listLeaveTypes();
            const summary = types.map(t => ({
              id: t.id,
              name: t.name,
            }));
            return textResponse(
              `Found ${types.length} leave types:\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get_type': {
            if (!args.id) return textResponse('Error: id is required');
            const leaveType = await getLeaveType(args.id);
            return textResponse(`Leave type details:\n\n${JSON.stringify(leaveType, null, 2)}`);
          }

          case 'list_allowances': {
            const result = await listAllowances({
              employee_id: args.employee_id,
              page: args.page,
              limit: args.limit,
            });
            return textResponse(
              `Found ${result.data.length} allowances:\n\n${JSON.stringify(result.data, null, 2)}`
            );
          }

          case 'create': {
            if (!args.employee_id || !args.leave_type_id || !args.start_on || !args.finish_on) {
              return textResponse(
                'Error: employee_id, leave_type_id, start_on, and finish_on are required'
              );
            }
            const leave = await createLeave({
              employee_id: args.employee_id,
              leave_type_id: args.leave_type_id,
              start_on: args.start_on,
              finish_on: args.finish_on,
              half_day: args.half_day,
              description: args.description,
            });
            return textResponse(`Leave created:\n\n${JSON.stringify(leave, null, 2)}`);
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required');
            const leave = await updateLeave(args.id, {
              start_on: args.start_on,
              finish_on: args.finish_on,
              half_day: args.half_day,
              description: args.description,
            });
            return textResponse(`Leave updated:\n\n${JSON.stringify(leave, null, 2)}`);
          }

          case 'cancel': {
            if (!args.id) return textResponse('Error: id is required');
            const check = checkConfirmation('cancel_leave', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            await cancelLeave(args.id);
            return textResponse(`Leave ${args.id} cancelled successfully.`);
          }

          case 'approve': {
            if (!args.id) return textResponse('Error: id is required');
            const leave = await approveLeave(args.id);
            return textResponse(`Leave approved:\n\n${JSON.stringify(leave, null, 2)}`);
          }

          case 'reject': {
            if (!args.id) return textResponse('Error: id is required');
            const check = checkConfirmation('reject_leave', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            const leave = await rejectLeave(args.id);
            return textResponse(`Leave rejected:\n\n${JSON.stringify(leave, null, 2)}`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
