#!/usr/bin/env node

/**
 * MCP Server for FactorialHR
 *
 * Provides access to employee and organizational data from FactorialHR
 * through the Model Context Protocol for use with Claude Code and other MCP clients.
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
// Priority: ENV_FILE_PATH > cwd/.env > home/.env
function loadEnv(): void {
  // 1. Check if explicit path provided
  if (process.env.ENV_FILE_PATH && existsSync(process.env.ENV_FILE_PATH)) {
    config({ path: process.env.ENV_FILE_PATH });
    return;
  }

  // 2. Check current working directory
  const cwdEnv = join(process.cwd(), '.env');
  if (existsSync(cwdEnv)) {
    config({ path: cwdEnv });
    return;
  }

  // 3. Check home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const homeEnv = join(homeDir, '.env');
  if (existsSync(homeEnv)) {
    config({ path: homeEnv });
    return;
  }

  // 4. Check common project locations
  const commonPaths = [
    join(homeDir, 'turborepo', '.env'),
    join(homeDir, 'projects', '.env'),
  ];

  for (const envPath of commonPaths) {
    if (existsSync(envPath)) {
      config({ path: envPath });
      return;
    }
  }

  // Fall back to default dotenv behavior
  config();
}

loadEnv();

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

import {
  listEmployees,
  getEmployee,
  searchEmployees,
  listTeams,
  getTeam,
  listLocations,
  getLocation,
  listContracts,
} from './api.js';

const server = new McpServer({
  name: 'factorial-hr',
  version: '1.0.0',
});

// ============================================================================
// Employee Tools
// ============================================================================

server.registerTool(
  'list_employees',
  {
    title: 'List Employees',
    description: 'Get all employees from FactorialHR. Can filter by team or location.',
    inputSchema: {
      team_id: z.number().optional().describe('Filter by team ID'),
      location_id: z.number().optional().describe('Filter by location ID'),
    },
  },
  async ({ team_id, location_id }) => {
    try {
      const employees = await listEmployees({ team_id, location_id });
      const summary = employees.map(e => ({
        id: e.id,
        name: e.full_name,
        email: e.email,
        role: e.role,
        team_ids: e.team_ids,
        location_id: e.location_id,
        manager_id: e.manager_id,
        hired_on: e.hired_on,
        terminated_on: e.terminated_on,
        birthday_on: e.birthday_on,
        created_at: e.created_at,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${employees.length} employees:\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_employee',
  {
    title: 'Get Employee',
    description: 'Get detailed information about a specific employee by their ID.',
    inputSchema: {
      id: z.number().describe('The employee ID'),
    },
  },
  async ({ id }) => {
    try {
      const employee = await getEmployee(id);
      if (!employee) {
        return {
          content: [{ type: 'text', text: `Employee with ID ${id} not found.` }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Employee details:\n\n${JSON.stringify(employee, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'search_employees',
  {
    title: 'Search Employees',
    description: 'Search for employees by name or email.',
    inputSchema: {
      query: z.string().describe('Search query (name or email)'),
    },
  },
  async ({ query }) => {
    try {
      const employees = await searchEmployees(query);
      if (employees.length === 0) {
        return {
          content: [{ type: 'text', text: `No employees found matching "${query}"` }],
        };
      }
      const summary = employees.map(e => ({
        id: e.id,
        name: e.full_name,
        email: e.email,
        role: e.role,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${employees.length} employees matching "${query}":\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Team Tools
// ============================================================================

server.registerTool(
  'list_teams',
  {
    title: 'List Teams',
    description: 'Get all teams in the organization.',
    inputSchema: {},
  },
  async () => {
    try {
      const teams = await listTeams();
      const summary = teams.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        employee_count: t.employee_ids?.length || 0,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${teams.length} teams:\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_team',
  {
    title: 'Get Team',
    description: 'Get detailed information about a specific team by its ID.',
    inputSchema: {
      id: z.number().describe('The team ID'),
    },
  },
  async ({ id }) => {
    try {
      const team = await getTeam(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(team, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Location Tools
// ============================================================================

server.registerTool(
  'list_locations',
  {
    title: 'List Locations',
    description: 'Get all company locations.',
    inputSchema: {},
  },
  async () => {
    try {
      const locations = await listLocations();
      const summary = locations.map(l => ({
        id: l.id,
        name: l.name,
        city: l.city,
        country: l.country,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${locations.length} locations:\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_location',
  {
    title: 'Get Location',
    description: 'Get detailed information about a specific location by its ID.',
    inputSchema: {
      id: z.number().describe('The location ID'),
    },
  },
  async ({ id }) => {
    try {
      const location = await getLocation(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(location, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Contract Tools
// ============================================================================

server.registerTool(
  'get_employee_contracts',
  {
    title: 'Get Employee Contracts',
    description: 'Get contract versions for an employee, including job title and effective date.',
    inputSchema: {
      employee_id: z.number().describe('The employee ID'),
    },
  },
  async ({ employee_id }) => {
    try {
      const contracts = await listContracts(employee_id);
      return {
        content: [
          {
            type: 'text',
            text: `Found ${contracts.length} contracts:\n\n${JSON.stringify(contracts, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
