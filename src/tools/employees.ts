/**
 * Employees tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
  listEmployees,
  getEmployee,
  searchEmployees,
  createEmployee,
  updateEmployee,
  terminateEmployee,
} from '../api/index.js';

export function registerEmployeesTool(server: McpServer) {
  server.registerTool(
    'factorial_employees',
    {
      title: 'FactorialHR Employees',
      description: 'Manage employees: list, get, search, create, update, terminate',
      inputSchema: {
        action: z
          .enum(['list', 'get', 'search', 'create', 'update', 'terminate'])
          .describe('Action'),
        id: z.number().optional().describe('Employee ID (for get/update/terminate)'),
        query: z.string().optional().describe('Search query (for search)'),
        team_id: z.number().optional().describe('Filter by team ID (for list)'),
        location_id: z.number().optional().describe('Filter by location ID (for list)'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
        first_name: z.string().optional().describe('First name'),
        last_name: z.string().optional().describe('Last name'),
        email: z.string().optional().describe('Email address'),
        birthday_on: z.string().optional().describe('Birthday (YYYY-MM-DD)'),
        gender: z.enum(['male', 'female', 'other']).optional().describe('Gender'),
        nationality: z.string().optional().describe('Nationality'),
        manager_id: z.number().optional().describe('Manager ID'),
        terminated_on: z.string().optional().describe('Termination date (YYYY-MM-DD)'),
        termination_reason: z.string().optional().describe('Reason for termination'),
        confirm: z.boolean().optional().describe('Confirm high-risk operation'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listEmployees({
              team_id: args.team_id,
              location_id: args.location_id,
              page: args.page,
              limit: args.limit,
            });
            const summary = result.data.map(e => ({
              id: e.id,
              name: e.full_name,
              email: e.email,
              identifier: e.identifier || null,
              location_id: e.location_id,
              manager_id: e.manager_id,
              active: e.active,
            }));
            return textResponse(
              `Found ${result.data.length} employees (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required for get action');
            const employee = await getEmployee(args.id);
            return textResponse(`Employee details:\n\n${JSON.stringify(employee, null, 2)}`);
          }

          case 'search': {
            if (!args.query) return textResponse('Error: query is required for search action');
            const employees = await searchEmployees(args.query);
            if (employees.length === 0) {
              return textResponse(`No employees found matching "${args.query}"`);
            }
            const summary = employees.map(e => ({
              id: e.id,
              name: e.full_name,
              email: e.email,
              identifier: e.identifier,
            }));
            return textResponse(
              `Found ${employees.length} employees matching "${args.query}":\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'create': {
            if (!args.first_name || !args.last_name || !args.email) {
              return textResponse(
                'Error: first_name, last_name, and email are required for create'
              );
            }
            const employee = await createEmployee({
              first_name: args.first_name,
              last_name: args.last_name,
              email: args.email,
              birthday_on: args.birthday_on,
              gender: args.gender,
              nationality: args.nationality,
              manager_id: args.manager_id,
              location_id: args.location_id,
            });
            return textResponse(`Employee created:\n\n${JSON.stringify(employee, null, 2)}`);
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required for update action');
            const employee = await updateEmployee(args.id, {
              first_name: args.first_name,
              last_name: args.last_name,
              email: args.email,
              birthday_on: args.birthday_on,
              gender: args.gender,
              nationality: args.nationality,
              manager_id: args.manager_id,
              location_id: args.location_id,
            });
            return textResponse(`Employee updated:\n\n${JSON.stringify(employee, null, 2)}`);
          }

          case 'terminate': {
            if (!args.id) return textResponse('Error: id is required for terminate action');
            if (!args.terminated_on) return textResponse('Error: terminated_on is required');
            const check = checkConfirmation('terminate_employee', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            const employee = await terminateEmployee(
              args.id,
              args.terminated_on,
              args.termination_reason
            );
            return textResponse(`Employee terminated:\n\n${JSON.stringify(employee, null, 2)}`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
