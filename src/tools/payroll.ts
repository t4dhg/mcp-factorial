/**
 * Payroll tool registration (Read-only)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { textResponse, formatToolError } from '../tool-utils.js';
import {
  listPayrollSupplements,
  getPayrollSupplement,
  listTaxIdentifiers,
  getTaxIdentifier,
  listFamilySituations,
  getFamilySituation,
} from '../api/index.js';

export function registerPayrollTool(server: McpServer) {
  server.registerTool(
    'factorial_payroll',
    {
      title: 'FactorialHR Payroll',
      description: 'View payroll data: supplements, tax identifiers, family situations (read-only)',
      inputSchema: {
        action: z
          .enum([
            'list_supplements',
            'get_supplement',
            'list_tax_ids',
            'get_tax_id',
            'list_family',
            'get_family',
          ])
          .describe('Action'),
        id: z.number().optional().describe('Item ID'),
        employee_id: z.number().optional().describe('Employee ID filter'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list_supplements': {
            const result = await listPayrollSupplements(args.employee_id, {
              page: args.page,
              limit: args.limit,
            });
            return textResponse(
              `Found ${result.data.length} payroll supplements:\n\n${JSON.stringify(result.data, null, 2)}`
            );
          }

          case 'get_supplement': {
            if (!args.id) return textResponse('Error: id is required');
            const supplement = await getPayrollSupplement(args.id);
            return textResponse(`Payroll supplement:\n\n${JSON.stringify(supplement, null, 2)}`);
          }

          case 'list_tax_ids': {
            const result = await listTaxIdentifiers(args.employee_id, {
              page: args.page,
              limit: args.limit,
            });
            return textResponse(
              `Found ${result.data.length} tax identifiers:\n\n${JSON.stringify(result.data, null, 2)}`
            );
          }

          case 'get_tax_id': {
            if (!args.id) return textResponse('Error: id is required');
            const taxId = await getTaxIdentifier(args.id);
            return textResponse(`Tax identifier:\n\n${JSON.stringify(taxId, null, 2)}`);
          }

          case 'list_family': {
            const result = await listFamilySituations(args.employee_id, {
              page: args.page,
              limit: args.limit,
            });
            return textResponse(
              `Found ${result.data.length} family situations:\n\n${JSON.stringify(result.data, null, 2)}`
            );
          }

          case 'get_family': {
            if (!args.id) return textResponse('Error: id is required');
            const family = await getFamilySituation(args.id);
            return textResponse(`Family situation:\n\n${JSON.stringify(family, null, 2)}`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
