/**
 * Locations tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../api/index.js';

export function registerLocationsTool(server: McpServer) {
  server.registerTool(
    'factorial_locations',
    {
      title: 'FactorialHR Locations',
      description: 'Manage locations: list, get, create, update, delete',
      inputSchema: {
        action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Action'),
        id: z.number().optional().describe('Location ID (for get/update/delete)'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
        name: z.string().optional().describe('Location name'),
        address_line_1: z.string().optional().describe('Address line 1'),
        address_line_2: z.string().optional().describe('Address line 2'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State/province'),
        postal_code: z.string().optional().describe('Postal code'),
        country: z.string().optional().describe('Country code (e.g., ES, US)'),
        phone_number: z.string().optional().describe('Phone number'),
        confirm: z.boolean().optional().describe('Confirm delete'),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list': {
            const result = await listLocations({ page: args.page, limit: args.limit });
            const summary = result.data.map(l => ({
              id: l.id,
              name: l.name,
              city: l.city,
              country: l.country,
            }));
            return textResponse(
              `Found ${result.data.length} locations (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
            );
          }

          case 'get': {
            if (!args.id) return textResponse('Error: id is required');
            const location = await getLocation(args.id);
            return textResponse(`Location details:\n\n${JSON.stringify(location, null, 2)}`);
          }

          case 'create': {
            if (!args.name) return textResponse('Error: name is required');
            const location = await createLocation({
              name: args.name,
              address_line_1: args.address_line_1,
              address_line_2: args.address_line_2,
              city: args.city,
              state: args.state,
              postal_code: args.postal_code,
              country: args.country,
              phone_number: args.phone_number,
            });
            return textResponse(`Location created:\n\n${JSON.stringify(location, null, 2)}`);
          }

          case 'update': {
            if (!args.id) return textResponse('Error: id is required');
            const location = await updateLocation(args.id, {
              name: args.name,
              address_line_1: args.address_line_1,
              address_line_2: args.address_line_2,
              city: args.city,
              state: args.state,
              postal_code: args.postal_code,
              country: args.country,
              phone_number: args.phone_number,
            });
            return textResponse(`Location updated:\n\n${JSON.stringify(location, null, 2)}`);
          }

          case 'delete': {
            if (!args.id) return textResponse('Error: id is required');
            const check = checkConfirmation('delete_location', args.confirm);
            if (check.needsConfirmation) return textResponse(check.message);
            await deleteLocation(args.id);
            return textResponse(`Location ${args.id} deleted successfully.`);
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
