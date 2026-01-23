/**
 * Contracts tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
  listContracts,
  getEmployeeWithContract,
  listEmployeesByJobRole,
  listEmployeesByJobLevel,
} from '../api/index.js';

export function registerContractsTool(server: McpServer) {
  server.registerTool(
    'factorial_contracts',
    {
      title: 'FactorialHR Contracts',
      description: 'Contract and salary data: list, get with employee, filter by job role/level',
      inputSchema: {
        action: z
          .enum(['list', 'get_with_employee', 'by_job_role', 'by_job_level'])
          .describe('Action'),
        employee_id: z.number().optional().describe('Employee ID (for list/get_with_employee)'),
        job_role_id: z.number().optional().describe('Job role ID (for by_job_role)'),
        job_level_id: z.number().optional().describe('Job level ID (for by_job_level)'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listContracts(args.employee_id, {
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(c => ({
              id: c.id,
              employee_id: c.employee_id,
              job_title: c.job_title,
              effective_on: c.effective_on,
            }));
            return textResponse(
              `Found ${result.data.length} contracts (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get_with_employee': {
            if (!args.employee_id) return textResponse('Error: employee_id is required');
            const data = await getEmployeeWithContract(args.employee_id);
            return textResponse(`Employee with contract:\n\n${JSON.stringify(data, null, 2)}`);
          }

          case 'by_job_role': {
            if (!args.job_role_id) return textResponse('Error: job_role_id is required');
            const result = await listEmployeesByJobRole(args.job_role_id);
            return textResponse(
              `Found ${result.data.length} employees with job role ${args.job_role_id}:\n\n${JSON.stringify(result.data, null, 2)}`
            );
          }

          case 'by_job_level': {
            if (!args.job_level_id) return textResponse('Error: job_level_id is required');
            const result = await listEmployeesByJobLevel(args.job_level_id);
            return textResponse(
              `Found ${result.data.length} employees at job level ${args.job_level_id}:\n\n${JSON.stringify(result.data, null, 2)}`
            );
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
