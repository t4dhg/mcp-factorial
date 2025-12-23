#!/usr/bin/env node

/**
 * MCP Server for FactorialHR
 *
 * Provides access to employee and organizational data from FactorialHR
 * through the Model Context Protocol for use with Claude Code and other MCP clients.
 *
 * Features:
 * - 22 tools for employees, teams, locations, contracts, time off, attendance, documents, and job catalog
 * - Pagination support for all list operations
 * - Caching for improved performance
 * - Retry logic with exponential backoff
 * - Runtime validation with Zod schemas
 */

import { loadEnv } from './config.js';

// Load environment variables before other imports
loadEnv();

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

import {
  // Employees
  listEmployees,
  getEmployee,
  searchEmployees,
  // Teams
  listTeams,
  getTeam,
  // Locations
  listLocations,
  getLocation,
  // Contracts
  listContracts,
  // Time Off
  listLeaves,
  getLeave,
  listLeaveTypes,
  getLeaveType,
  listAllowances,
  // Shifts
  listShifts,
  getShift,
  // Documents
  listFolders,
  getFolder,
  listDocuments,
  getDocument,
  // Job Catalog
  listJobRoles,
  getJobRole,
  listJobLevels,
} from './api.js';

import { formatPaginationInfo } from './pagination.js';

const server = new McpServer({
  name: 'factorial-hr',
  version: '2.0.0',
});

// ============================================================================
// Employee Tools
// ============================================================================

server.registerTool(
  'list_employees',
  {
    title: 'List Employees',
    description:
      'Get employees from FactorialHR. Can filter by team or location. Supports pagination.',
    inputSchema: {
      team_id: z.number().optional().describe('Filter by team ID'),
      location_id: z.number().optional().describe('Filter by location ID'),
      page: z.number().optional().default(1).describe('Page number (default: 1)'),
      limit: z.number().optional().default(100).describe('Items per page (max: 100)'),
    },
  },
  async ({ team_id, location_id, page, limit }) => {
    try {
      const result = await listEmployees({ team_id, location_id, page, limit });
      const summary = result.data.map(e => ({
        id: e.id,
        name: e.full_name,
        email: e.email,
        role: e.role,
        team_ids: e.team_ids,
        location_id: e.location_id,
        manager_id: e.manager_id,
        hired_on: e.hired_on,
        terminated_on: e.terminated_on,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} employees (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
    description: 'Get all teams in the organization. Supports pagination.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listTeams({ page, limit });
      const summary = result.data.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        employee_count: t.employee_ids?.length || 0,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} teams (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
    description: 'Get all company locations. Supports pagination.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listLocations({ page, limit });
      const summary = result.data.map(l => ({
        id: l.id,
        name: l.name,
        city: l.city,
        country: l.country,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} locations (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
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
      const result = await listContracts(employee_id);
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} contracts:\n\n${JSON.stringify(result.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Time Off / Leave Tools
// ============================================================================

server.registerTool(
  'list_leaves',
  {
    title: 'List Leaves',
    description:
      'Get time off/leave requests. Filter by employee, status, or date range. Supports pagination.',
    inputSchema: {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      status: z
        .enum(['pending', 'approved', 'declined'])
        .optional()
        .describe('Filter by leave status'),
      start_on_gte: z
        .string()
        .optional()
        .describe('Filter leaves starting on or after this date (YYYY-MM-DD)'),
      start_on_lte: z
        .string()
        .optional()
        .describe('Filter leaves starting on or before this date (YYYY-MM-DD)'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page (max: 100)'),
    },
  },
  async ({ employee_id, status, start_on_gte, start_on_lte, page, limit }) => {
    try {
      const result = await listLeaves({
        employee_id,
        status,
        start_on_gte,
        start_on_lte,
        page,
        limit,
      });
      const summary = result.data.map(l => ({
        id: l.id,
        employee_id: l.employee_id,
        leave_type_id: l.leave_type_id,
        start_on: l.start_on,
        finish_on: l.finish_on,
        status: l.status,
        days: l.duration_attributes?.days,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} leaves (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_leave',
  {
    title: 'Get Leave Details',
    description: 'Get detailed information about a specific leave request.',
    inputSchema: {
      id: z.number().describe('The leave ID'),
    },
  },
  async ({ id }) => {
    try {
      const leave = await getLeave(id);
      return {
        content: [
          {
            type: 'text',
            text: `Leave details:\n\n${JSON.stringify(leave, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'list_leave_types',
  {
    title: 'List Leave Types',
    description: 'Get all leave types (vacation, sick leave, etc.) configured in the organization.',
    inputSchema: {},
  },
  async () => {
    try {
      const types = await listLeaveTypes();
      return {
        content: [
          {
            type: 'text',
            text: `Found ${types.length} leave types:\n\n${JSON.stringify(types, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_leave_type',
  {
    title: 'Get Leave Type',
    description: 'Get details about a specific leave type.',
    inputSchema: {
      id: z.number().describe('The leave type ID'),
    },
  },
  async ({ id }) => {
    try {
      const leaveType = await getLeaveType(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(leaveType, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'list_allowances',
  {
    title: 'List Time Off Allowances',
    description:
      'Get time off balances/allowances for employees. Shows available, consumed, and total days.',
    inputSchema: {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page (max: 100)'),
    },
  },
  async ({ employee_id, page, limit }) => {
    try {
      const result = await listAllowances({ employee_id, page, limit });
      const summary = result.data.map(a => ({
        id: a.id,
        employee_id: a.employee_id,
        leave_type_id: a.leave_type_id,
        available_days: a.available_days,
        consumed_days: a.consumed_days,
        balance_days: a.balance_days,
        valid_from: a.valid_from,
        valid_to: a.valid_to,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} allowances (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Attendance / Shift Tools
// ============================================================================

server.registerTool(
  'list_shifts',
  {
    title: 'List Shifts',
    description:
      'Get employee attendance shifts. Filter by employee or date range. Read-only access.',
    inputSchema: {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      clock_in_gte: z
        .string()
        .optional()
        .describe('Filter shifts clocking in after this time (ISO 8601)'),
      clock_in_lte: z
        .string()
        .optional()
        .describe('Filter shifts clocking in before this time (ISO 8601)'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page (max: 100)'),
    },
  },
  async ({ employee_id, clock_in_gte, clock_in_lte, page, limit }) => {
    try {
      const result = await listShifts({ employee_id, clock_in_gte, clock_in_lte, page, limit });
      const summary = result.data.map(s => ({
        id: s.id,
        employee_id: s.employee_id,
        clock_in: s.clock_in,
        clock_out: s.clock_out,
        worked_hours: s.worked_hours,
        break_minutes: s.break_minutes,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} shifts (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_shift',
  {
    title: 'Get Shift Details',
    description: 'Get detailed information about a specific shift.',
    inputSchema: {
      id: z.number().describe('The shift ID'),
    },
  },
  async ({ id }) => {
    try {
      const shift = await getShift(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(shift, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Document Tools (Read-Only)
// ============================================================================

server.registerTool(
  'list_folders',
  {
    title: 'List Folders',
    description: 'Get all document folders. Read-only access.',
    inputSchema: {},
  },
  async () => {
    try {
      const folders = await listFolders();
      return {
        content: [
          {
            type: 'text',
            text: `Found ${folders.length} folders:\n\n${JSON.stringify(folders, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_folder',
  {
    title: 'Get Folder',
    description: 'Get details about a specific folder.',
    inputSchema: {
      id: z.number().describe('The folder ID'),
    },
  },
  async ({ id }) => {
    try {
      const folder = await getFolder(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(folder, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'list_documents',
  {
    title: 'List Documents',
    description: 'Get documents. Filter by folder. Read-only access.',
    inputSchema: {
      folder_id: z.number().optional().describe('Filter by folder ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page (max: 100)'),
    },
  },
  async ({ folder_id, page, limit }) => {
    try {
      const result = await listDocuments({ folder_id, page, limit });
      const summary = result.data.map(d => ({
        id: d.id,
        name: d.name,
        folder_id: d.folder_id,
        mime_type: d.mime_type,
        size_bytes: d.size_bytes,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} documents (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_document',
  {
    title: 'Get Document',
    description: 'Get document metadata and URL. Read-only access.',
    inputSchema: {
      id: z.number().describe('The document ID'),
    },
  },
  async ({ id }) => {
    try {
      const document = await getDocument(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(document, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Job Catalog Tools
// ============================================================================

server.registerTool(
  'list_job_roles',
  {
    title: 'List Job Roles',
    description: 'Get all job roles defined in the job catalog.',
    inputSchema: {},
  },
  async () => {
    try {
      const roles = await listJobRoles();
      return {
        content: [
          {
            type: 'text',
            text: `Found ${roles.length} job roles:\n\n${JSON.stringify(roles, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'get_job_role',
  {
    title: 'Get Job Role',
    description: 'Get details about a specific job role.',
    inputSchema: {
      id: z.number().describe('The job role ID'),
    },
  },
  async ({ id }) => {
    try {
      const role = await getJobRole(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(role, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'list_job_levels',
  {
    title: 'List Job Levels',
    description: 'Get all job levels defined in the job catalog.',
    inputSchema: {},
  },
  async () => {
    try {
      const levels = await listJobLevels();
      return {
        content: [
          {
            type: 'text',
            text: `Found ${levels.length} job levels:\n\n${JSON.stringify(levels, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// MCP Resources
// ============================================================================

/**
 * Build an org chart showing manager-report relationships
 */
async function buildOrgChart(): Promise<string> {
  const result = await listEmployees();
  const employees = result.data;

  // Build a map of manager_id -> reports
  const managerMap = new Map<number | null, typeof employees>();
  for (const emp of employees) {
    const managerId = emp.manager_id;
    if (!managerMap.has(managerId)) {
      managerMap.set(managerId, []);
    }
    managerMap.get(managerId)!.push(emp);
  }

  // Find top-level employees (no manager)
  const topLevel = managerMap.get(null) || [];

  // Recursive function to build tree
  function buildTree(managerId: number, depth = 0): string[] {
    const reports = managerMap.get(managerId) || [];
    const lines: string[] = [];
    for (const emp of reports) {
      const indent = '  '.repeat(depth);
      lines.push(
        `${indent}- ${emp.full_name || 'Unknown'} (${emp.role || 'No role'}) [ID: ${emp.id}]`
      );
      lines.push(...buildTree(emp.id, depth + 1));
    }
    return lines;
  }

  const lines: string[] = ['# Organization Chart\n'];

  // Add top-level employees
  for (const emp of topLevel) {
    lines.push(`## ${emp.full_name || 'Unknown'} (${emp.role || 'No role'}) [ID: ${emp.id}]`);
    lines.push(...buildTree(emp.id, 1));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build employee directory organized by team
 */
async function buildEmployeeDirectory(): Promise<string> {
  const [empResult, teamsResult] = await Promise.all([listEmployees(), listTeams()]);
  const employees = empResult.data;
  const teams = teamsResult.data;

  const lines: string[] = ['# Employee Directory\n'];

  // Group employees by team
  const teamEmployees = new Map<number | string, typeof employees>();
  for (const emp of employees) {
    const teamIds = emp.team_ids || [];
    if (teamIds.length === 0) {
      const key = 'no-team';
      if (!teamEmployees.has(key)) teamEmployees.set(key, []);
      teamEmployees.get(key)!.push(emp);
    } else {
      for (const teamId of teamIds) {
        if (!teamEmployees.has(teamId)) teamEmployees.set(teamId, []);
        teamEmployees.get(teamId)!.push(emp);
      }
    }
  }

  // Output by team
  for (const team of teams) {
    const emps = teamEmployees.get(team.id) || [];
    lines.push(`## ${team.name}`);
    if (team.description) lines.push(`*${team.description}*\n`);
    if (emps.length === 0) {
      lines.push('No employees assigned.\n');
    } else {
      for (const emp of emps) {
        lines.push(`- **${emp.full_name || 'Unknown'}** - ${emp.role || 'No role'}`);
        if (emp.email) lines.push(`  - Email: ${emp.email}`);
      }
      lines.push('');
    }
  }

  // Employees without teams
  const noTeam = teamEmployees.get('no-team') || [];
  if (noTeam.length > 0) {
    lines.push('## Unassigned\n');
    for (const emp of noTeam) {
      lines.push(`- **${emp.full_name || 'Unknown'}** - ${emp.role || 'No role'}`);
      if (emp.email) lines.push(`  - Email: ${emp.email}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build location directory
 */
async function buildLocationDirectory(): Promise<string> {
  const [locResult, empResult] = await Promise.all([listLocations(), listEmployees()]);
  const locations = locResult.data;
  const employees = empResult.data;

  // Group employees by location
  const locationEmployees = new Map<number, typeof employees>();
  for (const emp of employees) {
    if (emp.location_id) {
      if (!locationEmployees.has(emp.location_id)) locationEmployees.set(emp.location_id, []);
      locationEmployees.get(emp.location_id)!.push(emp);
    }
  }

  const lines: string[] = ['# Location Directory\n'];

  for (const loc of locations) {
    const emps = locationEmployees.get(loc.id) || [];
    lines.push(`## ${loc.name}`);
    const address = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
    if (address) lines.push(`📍 ${address}\n`);

    lines.push(`**Employees:** ${emps.length}`);
    if (emps.length > 0 && emps.length <= 10) {
      for (const emp of emps) {
        lines.push(`- ${emp.full_name || 'Unknown'} (${emp.role || 'No role'})`);
      }
    } else if (emps.length > 10) {
      lines.push(
        `*... ${emps.length} employees (use list_employees with location_id=${loc.id} to see all)*`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Register static resources
server.registerResource(
  'org-chart',
  'factorial://org-chart',
  {
    description:
      'Complete organizational hierarchy showing manager-report relationships. Useful for understanding team structure.',
    mimeType: 'text/markdown',
  },
  async () => {
    return {
      contents: [
        {
          uri: 'factorial://org-chart',
          mimeType: 'text/markdown',
          text: await buildOrgChart(),
        },
      ],
    };
  }
);

server.registerResource(
  'employees-directory',
  'factorial://employees/directory',
  {
    description:
      'Employee directory organized by team. Shows all employees with their roles and contact info.',
    mimeType: 'text/markdown',
  },
  async () => {
    return {
      contents: [
        {
          uri: 'factorial://employees/directory',
          mimeType: 'text/markdown',
          text: await buildEmployeeDirectory(),
        },
      ],
    };
  }
);

server.registerResource(
  'locations-directory',
  'factorial://locations/directory',
  {
    description: 'Directory of all company locations with employee counts.',
    mimeType: 'text/markdown',
  },
  async () => {
    return {
      contents: [
        {
          uri: 'factorial://locations/directory',
          mimeType: 'text/markdown',
          text: await buildLocationDirectory(),
        },
      ],
    };
  }
);

server.registerResource(
  'timeoff-policies',
  'factorial://timeoff/policies',
  {
    description: 'All leave types and time off policies configured in the organization.',
    mimeType: 'application/json',
  },
  async () => {
    const types = await listLeaveTypes();
    return {
      contents: [
        {
          uri: 'factorial://timeoff/policies',
          mimeType: 'application/json',
          text: JSON.stringify(types, null, 2),
        },
      ],
    };
  }
);

// Register resource template for teams
const teamTemplate = new ResourceTemplate('factorial://teams/{team_id}', {
  list: async () => {
    const result = await listTeams();
    return {
      resources: result.data.map(t => ({
        uri: `factorial://teams/${t.id}`,
        name: t.name,
        description: t.description || undefined,
        mimeType: 'application/json',
      })),
    };
  },
});

server.registerResource(
  'team-details',
  teamTemplate,
  {
    description: 'Get detailed information about a specific team including all members.',
    mimeType: 'application/json',
  },
  async (uri, variables) => {
    const teamId = parseInt(variables.team_id as string, 10);
    if (isNaN(teamId)) {
      throw new Error('Invalid team ID');
    }
    const [team, empResult] = await Promise.all([
      getTeam(teamId),
      listEmployees({ team_id: teamId }),
    ]);

    const teamDetails = {
      ...team,
      members: empResult.data.map(e => ({
        id: e.id,
        name: e.full_name,
        role: e.role,
        email: e.email,
      })),
    };

    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: 'application/json',
          text: JSON.stringify(teamDetails, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// MCP Prompts
// ============================================================================

server.registerPrompt(
  'onboard-employee',
  {
    description:
      'Generate a personalized onboarding checklist for a new employee based on their team and role.',
    argsSchema: {
      employee_id: z.string().describe('The ID of the employee to onboard'),
    },
  },
  async ({ employee_id }) => {
    const empId = parseInt(employee_id, 10);
    const employee = await getEmployee(empId);
    const teamsResult = await listTeams();
    const teams = teamsResult.data;

    const employeeTeams = teams.filter(t => employee.team_ids?.includes(t.id));
    const teamNames = employeeTeams.map(t => t.name).join(', ') || 'No team assigned';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please create a comprehensive onboarding checklist for the following new employee:

**Employee Details:**
- Name: ${employee.full_name}
- Role: ${employee.role || 'Not specified'}
- Team(s): ${teamNames}
- Start Date: ${employee.hired_on || employee.start_date || 'Not specified'}
- Email: ${employee.email}

Please include:
1. First day essentials
2. First week goals
3. Team introductions
4. Tools and access setup
5. Key meetings to schedule
6. 30/60/90 day milestones

Tailor the checklist to their specific role and team.`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  'analyze-org-structure',
  {
    description:
      'Analyze the organizational structure for insights on reporting lines, team sizes, and distribution.',
    argsSchema: {
      focus_area: z
        .string()
        .optional()
        .describe('Area to focus on: reporting_lines, team_sizes, location_distribution'),
    },
  },
  async ({ focus_area }) => {
    const [empResult, teamsResult, locResult] = await Promise.all([
      listEmployees(),
      listTeams(),
      listLocations(),
    ]);

    const employees = empResult.data;
    const teams = teamsResult.data;
    const locations = locResult.data;

    // Compute basic stats
    const totalEmployees = employees.length;
    const managersCount = new Set(employees.map(e => e.manager_id).filter(Boolean)).size;
    const avgTeamSize =
      teams.length > 0
        ? (teams.reduce((sum, t) => sum + (t.employee_ids?.length || 0), 0) / teams.length).toFixed(
            1
          )
        : 0;

    let focusPrompt = '';
    if (focus_area === 'reporting_lines') {
      focusPrompt =
        'Focus particularly on reporting line depth, span of control, and potential bottlenecks.';
    } else if (focus_area === 'team_sizes') {
      focusPrompt =
        'Focus particularly on team size distribution, under/over-staffed teams, and growth patterns.';
    } else if (focus_area === 'location_distribution') {
      focusPrompt =
        'Focus particularly on geographic distribution, remote vs on-site, and location-based team composition.';
    }

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the following organizational structure:

**Summary Statistics:**
- Total Employees: ${totalEmployees}
- Total Teams: ${teams.length}
- Total Locations: ${locations.length}
- Unique Managers: ${managersCount}
- Average Team Size: ${avgTeamSize}

**Teams:**
${teams.map(t => `- ${t.name}: ${t.employee_ids?.length || 0} members`).join('\n')}

**Locations:**
${locations.map(l => `- ${l.name} (${[l.city, l.country].filter(Boolean).join(', ')})`).join('\n')}

${focusPrompt}

Please provide:
1. Key observations about the org structure
2. Potential areas of concern
3. Recommendations for improvement
4. Comparison to industry best practices`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  'timeoff-report',
  {
    description: 'Generate a time off report for a team or date range.',
    argsSchema: {
      team_id: z.string().optional().describe('Team ID to filter by'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
      include_pending: z.string().optional().describe('Include pending requests (true/false)'),
    },
  },
  async ({ team_id, start_date, end_date, include_pending }) => {
    const teamId = team_id ? parseInt(team_id, 10) : undefined;
    const includePending = include_pending === 'true';

    // Get leaves
    const leavesResult = await listLeaves({
      start_on_gte: start_date,
      start_on_lte: end_date,
    });

    // Get leave types for names
    const leaveTypes = await listLeaveTypes();
    const leaveTypeMap = new Map(leaveTypes.map(lt => [lt.id, lt.name]));

    // Filter by team if needed
    let leaves = leavesResult.data;
    if (teamId) {
      const teamEmps = (await listEmployees({ team_id: teamId })).data;
      const teamEmpIds = new Set(teamEmps.map(e => e.id));
      leaves = leaves.filter(l => teamEmpIds.has(l.employee_id));
    }

    // Filter by status
    if (!includePending) {
      leaves = leaves.filter(l => l.status === 'approved');
    }

    // Get employee names
    const empResult = await listEmployees();
    const empMap = new Map(empResult.data.map(e => [e.id, e.full_name]));

    const leaveSummary = leaves.map(l => ({
      employee: empMap.get(l.employee_id) || `Employee ${l.employee_id}`,
      type: leaveTypeMap.get(l.leave_type_id) || `Type ${l.leave_type_id}`,
      dates: `${l.start_on} to ${l.finish_on}`,
      days: l.duration_attributes?.days || 'N/A',
      status: l.status,
    }));

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please generate a time off report based on the following data:

**Report Parameters:**
- Date Range: ${start_date || 'All'} to ${end_date || 'All'}
- Team: ${teamId ? `Team ${teamId}` : 'All teams'}
- Including Pending: ${includePending ? 'Yes' : 'No'}

**Time Off Requests (${leaves.length} total):**
${JSON.stringify(leaveSummary, null, 2)}

Please provide:
1. Summary of time off by type
2. Peak absence periods
3. Coverage concerns (if any patterns suggest coverage gaps)
4. Recommendations for planning`,
          },
        },
      ],
    };
  }
);

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
