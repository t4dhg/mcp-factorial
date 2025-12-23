#!/usr/bin/env node

/**
 * MCP Server for FactorialHR
 *
 * Provides comprehensive access to FactorialHR data through the Model Context Protocol
 * for use with Claude Code and other MCP clients.
 *
 * Features:
 * - 80+ tools for employees, teams, locations, contracts, time off, attendance,
 *   documents, job catalog, projects, training, work areas, recruiting (ATS), and payroll
 * - Full CRUD operations with safety guardrails for high-risk actions
 * - Pagination support for all list operations
 * - Caching for improved performance
 * - Retry logic with exponential backoff
 * - Runtime validation with Zod schemas
 * - Audit logging for all write operations
 */

import { loadEnv } from './config.js';

// Load environment variables before other imports
loadEnv();

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { cache } from './cache.js';

import {
  // Employees - Read
  listEmployees,
  getEmployee,
  searchEmployees,
  // Employees - Write
  createEmployee,
  updateEmployee,
  terminateEmployee,
  // Teams - Read
  listTeams,
  getTeam,
  // Teams - Write
  createTeam,
  updateTeam,
  deleteTeam,
  // Locations - Read
  listLocations,
  getLocation,
  // Locations - Write
  createLocation,
  updateLocation,
  deleteLocation,
  // Contracts
  listContracts,
  // Time Off - Read
  listLeaves,
  getLeave,
  listLeaveTypes,
  getLeaveType,
  listAllowances,
  // Time Off - Write
  createLeave,
  updateLeave,
  cancelLeave,
  approveLeave,
  rejectLeave,
  // Shifts - Read
  listShifts,
  getShift,
  // Shifts - Write
  createShift,
  updateShift,
  deleteShift,
  // Documents
  listFolders,
  getFolder,
  listDocuments,
  getDocument,
  // Job Catalog
  listJobRoles,
  getJobRole,
  listJobLevels,
  // Projects - Read
  listProjects,
  getProject,
  listProjectTasks,
  listProjectWorkers,
  listTimeRecords,
  // Projects - Write
  createProject,
  updateProject,
  deleteProject,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  assignProjectWorker,
  removeProjectWorker,
  createTimeRecord,
  updateTimeRecord,
  deleteTimeRecord,
  // Training - Read
  listTrainings,
  getTraining,
  listTrainingSessions,
  listTrainingEnrollments,
  // Training - Write
  createTraining,
  updateTraining,
  deleteTraining,
  createTrainingSession,
  updateTrainingSession,
  deleteTrainingSession,
  enrollInTraining,
  unenrollFromTraining,
  // Work Areas
  listWorkAreas,
  getWorkArea,
  createWorkArea,
  updateWorkArea,
  archiveWorkArea,
  unarchiveWorkArea,
  // ATS - Read
  listJobPostings,
  getJobPosting,
  listCandidates,
  getCandidate,
  listApplications,
  getApplication,
  listHiringStages,
  // ATS - Write
  createJobPosting,
  updateJobPosting,
  deleteJobPosting,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  createApplication,
  updateApplication,
  deleteApplication,
  advanceApplication,
  // Payroll (Read-only)
  listPayrollSupplements,
  getPayrollSupplement,
  listTaxIdentifiers,
  getTaxIdentifier,
  listFamilySituations,
  getFamilySituation,
} from './api.js';

import { formatPaginationInfo } from './pagination.js';
import { wrapHighRiskToolHandler, textResponse } from './tool-utils.js';

const server = new McpServer({
  name: 'factorial-hr',
  version: '3.0.0',
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
        identifier: e.identifier || null,
        identifier_type: e.identifier_type || null,
        location_id: e.location_id,
        manager_id: e.manager_id,
        active: e.active,
        seniority_date: e.seniority_calculation_date,
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
        identifier: e.identifier,
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

server.registerTool(
  'create_employee',
  {
    title: 'Create Employee',
    description: 'Create a new employee in FactorialHR.',
    inputSchema: {
      first_name: z.string().min(1).max(100).describe('First name'),
      last_name: z.string().min(1).max(100).describe('Last name'),
      email: z.string().email().describe('Email address'),
      birthday_on: z.string().optional().describe('Birthday (YYYY-MM-DD)'),
      hired_on: z.string().optional().describe('Hire date (YYYY-MM-DD)'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      gender: z.enum(['male', 'female', 'other']).optional().describe('Gender'),
      nationality: z.string().max(50).optional().describe('Nationality'),
      manager_id: z.number().optional().describe('Manager employee ID'),
      role: z.string().max(100).optional().describe('Job role/title'),
      team_ids: z.array(z.number()).optional().describe('Team IDs to assign'),
      location_id: z.number().optional().describe('Location ID'),
    },
  },
  async input => {
    try {
      const employee = await createEmployee(input);
      return {
        content: [
          {
            type: 'text',
            text: `Employee created successfully:\n\n${JSON.stringify(employee, null, 2)}`,
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
  'update_employee',
  {
    title: 'Update Employee',
    description: 'Update an existing employee in FactorialHR.',
    inputSchema: {
      id: z.number().describe('The employee ID to update'),
      first_name: z.string().min(1).max(100).optional().describe('First name'),
      last_name: z.string().min(1).max(100).optional().describe('Last name'),
      email: z.string().email().optional().describe('Email address'),
      birthday_on: z.string().optional().describe('Birthday (YYYY-MM-DD)'),
      hired_on: z.string().optional().describe('Hire date (YYYY-MM-DD)'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      gender: z.enum(['male', 'female', 'other']).optional().describe('Gender'),
      nationality: z.string().max(50).optional().describe('Nationality'),
      manager_id: z.number().optional().describe('Manager employee ID'),
      role: z.string().max(100).optional().describe('Job role/title'),
      team_ids: z.array(z.number()).optional().describe('Team IDs to assign'),
      location_id: z.number().optional().describe('Location ID'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const employee = await updateEmployee(id, input);
      return {
        content: [
          {
            type: 'text',
            text: `Employee updated successfully:\n\n${JSON.stringify(employee, null, 2)}`,
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
  'terminate_employee',
  {
    title: 'Terminate Employee',
    description:
      'Terminate an employee (soft delete). This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('The employee ID to terminate'),
      terminated_on: z.string().describe('Termination date (YYYY-MM-DD)'),
      reason: z.string().max(500).optional().describe('Termination reason'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('terminate_employee', async ({ id, terminated_on, reason }) => {
    const employee = await terminateEmployee(id, terminated_on, reason);
    return textResponse(
      `Employee terminated successfully. Termination date: ${terminated_on}\n\n${JSON.stringify(employee, null, 2)}`
    );
  })
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

server.registerTool(
  'create_team',
  {
    title: 'Create Team',
    description: 'Create a new team in the organization.',
    inputSchema: {
      name: z.string().min(1).max(100).describe('Team name'),
      description: z.string().max(500).optional().describe('Team description'),
      lead_ids: z.array(z.number()).optional().describe('Team lead employee IDs'),
      employee_ids: z.array(z.number()).optional().describe('Team member employee IDs'),
    },
  },
  async input => {
    try {
      const team = await createTeam(input);
      return {
        content: [
          {
            type: 'text',
            text: `Team created successfully:\n\n${JSON.stringify(team, null, 2)}`,
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
  'update_team',
  {
    title: 'Update Team',
    description: 'Update an existing team.',
    inputSchema: {
      id: z.number().describe('The team ID to update'),
      name: z.string().min(1).max(100).optional().describe('Team name'),
      description: z.string().max(500).optional().describe('Team description'),
      lead_ids: z.array(z.number()).optional().describe('Team lead employee IDs'),
      employee_ids: z.array(z.number()).optional().describe('Team member employee IDs'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const team = await updateTeam(id, input);
      return {
        content: [
          {
            type: 'text',
            text: `Team updated successfully:\n\n${JSON.stringify(team, null, 2)}`,
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
  'delete_team',
  {
    title: 'Delete Team',
    description: 'Delete a team. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('The team ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_team', async ({ id }) => {
    await deleteTeam(id);
    return textResponse(`Team ${id} deleted successfully.`);
  })
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

server.registerTool(
  'create_location',
  {
    title: 'Create Location',
    description: 'Create a new company location.',
    inputSchema: {
      name: z.string().min(1).max(100).describe('Location name'),
      country: z.string().max(50).optional().describe('Country'),
      state: z.string().max(50).optional().describe('State/Province'),
      city: z.string().max(50).optional().describe('City'),
      address_line_1: z.string().max(200).optional().describe('Address line 1'),
      address_line_2: z.string().max(200).optional().describe('Address line 2'),
      postal_code: z.string().max(20).optional().describe('Postal/ZIP code'),
      phone_number: z.string().max(30).optional().describe('Phone number'),
    },
  },
  async input => {
    try {
      const location = await createLocation(input);
      return {
        content: [
          {
            type: 'text',
            text: `Location created successfully:\n\n${JSON.stringify(location, null, 2)}`,
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
  'update_location',
  {
    title: 'Update Location',
    description: 'Update an existing location.',
    inputSchema: {
      id: z.number().describe('The location ID to update'),
      name: z.string().min(1).max(100).optional().describe('Location name'),
      country: z.string().max(50).optional().describe('Country'),
      state: z.string().max(50).optional().describe('State/Province'),
      city: z.string().max(50).optional().describe('City'),
      address_line_1: z.string().max(200).optional().describe('Address line 1'),
      address_line_2: z.string().max(200).optional().describe('Address line 2'),
      postal_code: z.string().max(20).optional().describe('Postal/ZIP code'),
      phone_number: z.string().max(30).optional().describe('Phone number'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const location = await updateLocation(id, input);
      return {
        content: [
          {
            type: 'text',
            text: `Location updated successfully:\n\n${JSON.stringify(location, null, 2)}`,
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
  'delete_location',
  {
    title: 'Delete Location',
    description: 'Delete a location. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('The location ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_location', async ({ id }) => {
    await deleteLocation(id);
    return textResponse(`Location ${id} deleted successfully.`);
  })
);

// ============================================================================
// Contract Tools
// ============================================================================

server.registerTool(
  'get_employee_contracts',
  {
    title: 'Get Employee Contracts',
    description:
      'Get contract versions for an employee. Returns contract summary (id, employee_id, job_title, effective_on).',
    inputSchema: {
      employee_id: z.number().describe('The employee ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(20).describe('Items per page (max: 100, default: 20)'),
    },
  },
  async ({ employee_id, page, limit }) => {
    try {
      const result = await listContracts(employee_id, { page, limit });

      // Create summary format
      const summary = result.data.map(c => ({
        id: c.id,
        employee_id: c.employee_id,
        job_title: c.job_title,
        effective_on: c.effective_on,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} contracts for employee ${employee_id} (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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

      // Fetch enrichment data (both are cached)
      const [employees, leaveTypes] = await Promise.all([listEmployees(), listLeaveTypes()]);
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));
      const ltMap = new Map(leaveTypes.map(lt => [lt.id, lt.name]));

      const summary = result.data.map(l => ({
        id: l.id,
        employee_id: l.employee_id,
        employee_name: empMap.get(l.employee_id) || `Employee ${l.employee_id}`,
        leave_type_id: l.leave_type_id,
        leave_type_name: ltMap.get(l.leave_type_id) || `Type ${l.leave_type_id}`,
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

      // Fetch enrichment data (both are cached)
      const [employees, leaveTypes] = await Promise.all([listEmployees(), listLeaveTypes()]);
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));
      const ltMap = new Map(leaveTypes.map(lt => [lt.id, lt.name]));

      const summary = result.data.map(a => ({
        id: a.id,
        employee_id: a.employee_id,
        employee_name: empMap.get(a.employee_id) || `Employee ${a.employee_id}`,
        leave_type_id: a.leave_type_id,
        leave_type_name: ltMap.get(a.leave_type_id) || `Type ${a.leave_type_id}`,
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

server.registerTool(
  'create_leave',
  {
    title: 'Create Leave Request',
    description: 'Create a new time off/leave request for an employee.',
    inputSchema: {
      employee_id: z.number().describe('Employee ID'),
      leave_type_id: z.number().describe('Leave type ID'),
      start_on: z.string().describe('Start date (YYYY-MM-DD)'),
      finish_on: z.string().describe('End date (YYYY-MM-DD)'),
      half_day: z.enum(['all_day', 'start', 'finish']).optional().describe('Half day option'),
      description: z.string().max(500).optional().describe('Description/reason'),
    },
  },
  async input => {
    try {
      const leave = await createLeave(input);
      return {
        content: [
          {
            type: 'text',
            text: `Leave request created successfully:\n\n${JSON.stringify(leave, null, 2)}`,
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
  'update_leave',
  {
    title: 'Update Leave Request',
    description: 'Update an existing leave request.',
    inputSchema: {
      id: z.number().describe('The leave ID to update'),
      leave_type_id: z.number().optional().describe('Leave type ID'),
      start_on: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      finish_on: z.string().optional().describe('End date (YYYY-MM-DD)'),
      half_day: z.enum(['all_day', 'start', 'finish']).optional().describe('Half day option'),
      description: z.string().max(500).optional().describe('Description/reason'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const leave = await updateLeave(id, input);
      return {
        content: [
          {
            type: 'text',
            text: `Leave request updated successfully:\n\n${JSON.stringify(leave, null, 2)}`,
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
  'cancel_leave',
  {
    title: 'Cancel Leave Request',
    description: 'Cancel a leave request. This operation requires confirmation.',
    inputSchema: {
      id: z.number().describe('The leave ID to cancel'),
      confirm: z.boolean().optional().describe('Set to true to confirm this operation'),
    },
  },
  wrapHighRiskToolHandler('cancel_leave', async ({ id }) => {
    await cancelLeave(id);
    return textResponse(`Leave request ${id} cancelled successfully.`);
  })
);

server.registerTool(
  'approve_leave',
  {
    title: 'Approve Leave Request',
    description: 'Approve a pending leave request.',
    inputSchema: {
      id: z.number().describe('The leave ID to approve'),
      reason: z.string().max(500).optional().describe('Approval comment'),
    },
  },
  async ({ id, reason }) => {
    try {
      const leave = await approveLeave(id, reason ? { reason } : undefined);
      return {
        content: [
          {
            type: 'text',
            text: `Leave request approved successfully:\n\n${JSON.stringify(leave, null, 2)}`,
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
  'reject_leave',
  {
    title: 'Reject Leave Request',
    description: 'Reject a pending leave request. This operation requires confirmation.',
    inputSchema: {
      id: z.number().describe('The leave ID to reject'),
      reason: z.string().max(500).optional().describe('Rejection reason'),
      confirm: z.boolean().optional().describe('Set to true to confirm this operation'),
    },
  },
  wrapHighRiskToolHandler('reject_leave', async ({ id, reason }) => {
    const leave = await rejectLeave(id, reason ? { reason } : undefined);
    return textResponse(`Leave request rejected:\n\n${JSON.stringify(leave, null, 2)}`);
  })
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

      // Fetch employee names for enrichment (cached)
      const employees = await listEmployees();
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));

      const summary = result.data.map(s => ({
        id: s.id,
        employee_id: s.employee_id,
        employee_name: empMap.get(s.employee_id) || `Employee ${s.employee_id}`,
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

server.registerTool(
  'create_shift',
  {
    title: 'Create Shift',
    description: 'Create a new attendance shift (clock in/out record).',
    inputSchema: {
      employee_id: z.number().describe('Employee ID'),
      clock_in: z.string().describe('Clock in time (ISO 8601)'),
      clock_out: z.string().optional().describe('Clock out time (ISO 8601)'),
      break_minutes: z.number().min(0).max(480).optional().describe('Break duration in minutes'),
      location: z.string().max(200).optional().describe('Work location'),
      notes: z.string().max(500).optional().describe('Notes'),
    },
  },
  async input => {
    try {
      const shift = await createShift(input);
      return {
        content: [
          {
            type: 'text',
            text: `Shift created successfully:\n\n${JSON.stringify(shift, null, 2)}`,
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
  'update_shift',
  {
    title: 'Update Shift',
    description: 'Update an existing shift.',
    inputSchema: {
      id: z.number().describe('The shift ID to update'),
      clock_in: z.string().optional().describe('Clock in time (ISO 8601)'),
      clock_out: z.string().optional().describe('Clock out time (ISO 8601)'),
      break_minutes: z.number().min(0).max(480).optional().describe('Break duration in minutes'),
      location: z.string().max(200).optional().describe('Work location'),
      notes: z.string().max(500).optional().describe('Notes'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const shift = await updateShift(id, input);
      return {
        content: [
          {
            type: 'text',
            text: `Shift updated successfully:\n\n${JSON.stringify(shift, null, 2)}`,
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
  'delete_shift',
  {
    title: 'Delete Shift',
    description: 'Delete a shift record. This operation requires confirmation.',
    inputSchema: {
      id: z.number().describe('The shift ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this operation'),
    },
  },
  wrapHighRiskToolHandler('delete_shift', async ({ id }) => {
    await deleteShift(id);
    return textResponse(`Shift ${id} deleted successfully.`);
  })
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
    description:
      'Get documents with folder and employee name enrichment. Filter by folder or employee. Read-only access.',
    inputSchema: {
      folder_id: z.number().optional().describe('Filter by folder ID'),
      employee_ids: z.array(z.number()).optional().describe('Filter by employee IDs'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page (max: 100)'),
    },
  },
  async ({ folder_id, employee_ids, page, limit }) => {
    try {
      const result = await listDocuments({ folder_id, employee_ids, page, limit });

      // Fetch employee names for enrichment (cached)
      const employees = await listEmployees();
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));

      // Fetch folders for name enrichment (cached)
      const folders = await listFolders();
      const folderMap = new Map(folders.map(f => [f.id, f.name]));

      const summary = result.data.map(d => ({
        id: d.id,
        name: d.name,
        folder_id: d.folder_id,
        folder_name: d.folder_id ? folderMap.get(d.folder_id) || null : null,
        employee_id: d.employee_id,
        employee_name: d.employee_id
          ? empMap.get(d.employee_id) || `Employee ${d.employee_id}`
          : null,
        author_id: d.author_id,
        author_name: d.author_id ? empMap.get(d.author_id) || `Employee ${d.author_id}` : null,
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

      // Defensive check for undefined/null document
      if (!document) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Document with ID ${id} exists but returned no data. This may be a Factorial API issue.`,
            },
          ],
          isError: true,
        };
      }

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

server.registerTool(
  'get_employee_documents',
  {
    title: 'Get Employee Documents',
    description:
      'Get all documents for a specific employee. Returns document summary with folder_name enrichment. Use get_document for full details.',
    inputSchema: {
      employee_id: z.number().describe('The employee ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(20).describe('Items per page (max: 100, default: 20)'),
    },
  },
  async ({ employee_id, page, limit }) => {
    try {
      const result = await listDocuments({ employee_ids: [employee_id], page, limit });

      // Fetch folders for name enrichment (cached)
      const folders = await listFolders();
      const folderMap = new Map(folders.map(f => [f.id, f.name]));

      // Create summary format with folder name enrichment
      const summary = result.data.map(d => ({
        id: d.id,
        name: d.name ?? '[No name]',
        folder_id: d.folder_id,
        folder_name: d.folder_id ? folderMap.get(d.folder_id) || null : null,
        employee_id: d.employee_id,
        author_id: d.author_id,
        mime_type: d.mime_type ?? 'unknown',
        size_bytes: d.size_bytes ?? 0,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} documents for employee ${employee_id} (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'search_employee_documents',
  {
    title: 'Search Employee Documents',
    description:
      'Search documents by employee name and optional document name pattern. Example: search for "Taig\'s resume" or "certifications for Saray".',
    inputSchema: {
      employee_name: z
        .string()
        .min(2)
        .describe('Employee name to search for (partial match, min 2 chars)'),
      document_query: z
        .string()
        .optional()
        .describe('Document name pattern to filter by (e.g., "resume", "certification")'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(20).describe('Items per page (max: 100, default: 20)'),
    },
  },
  async ({ employee_name, document_query, page, limit }) => {
    try {
      // Step 1: Search for employees by name
      const matchingEmployees = await searchEmployees(employee_name);

      if (matchingEmployees.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No employees found matching "${employee_name}".`,
            },
          ],
        };
      }

      // Step 2: Get documents for matching employees
      const employeeIds = matchingEmployees.map(e => e.id);
      const result = await listDocuments({ employee_ids: employeeIds, page, limit });

      // Step 3: Filter by document name pattern if provided
      let filteredDocs = result.data;
      if (document_query) {
        const queryLower = document_query.toLowerCase();
        filteredDocs = result.data.filter(d => d.name && d.name.toLowerCase().includes(queryLower));
      }

      // Step 4: Enrich with employee and folder names
      const empMap = new Map(matchingEmployees.map(e => [e.id, e.full_name]));
      const folders = await listFolders();
      const folderMap = new Map(folders.map(f => [f.id, f.name]));

      const summary = filteredDocs.map(d => ({
        id: d.id,
        name: d.name ?? '[No name]',
        folder_id: d.folder_id,
        folder_name: d.folder_id ? folderMap.get(d.folder_id) || null : null,
        employee_id: d.employee_id,
        employee_name: d.employee_id
          ? empMap.get(d.employee_id) || `Employee ${d.employee_id}`
          : null,
        mime_type: d.mime_type ?? 'unknown',
        size_bytes: d.size_bytes ?? 0,
      }));

      const employeeNames = matchingEmployees.map(e => e.full_name).join(', ');
      const queryInfo = document_query ? ` matching "${document_query}"` : '';

      return {
        content: [
          {
            type: 'text',
            text: `Found ${summary.length} documents${queryInfo} for employees matching "${employee_name}" (${employeeNames}):\n\n${JSON.stringify(summary, null, 2)}`,
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
// Project Tools
// ============================================================================

server.registerTool(
  'list_projects',
  {
    title: 'List Projects',
    description: 'Get all projects. Supports pagination.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listProjects({ page, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} projects (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(result.data, null, 2)}`,
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
  'get_project',
  {
    title: 'Get Project',
    description: 'Get detailed information about a specific project.',
    inputSchema: {
      id: z.number().describe('The project ID'),
    },
  },
  async ({ id }) => {
    try {
      const project = await getProject(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
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
  'create_project',
  {
    title: 'Create Project',
    description: 'Create a new project.',
    inputSchema: {
      name: z.string().min(1).max(100).describe('Project name'),
      code: z.string().max(20).optional().describe('Project code'),
      description: z.string().max(500).optional().describe('Description'),
      employees_assignment: z.enum(['manual', 'company']).optional().describe('Assignment mode'),
    },
  },
  async input => {
    try {
      const project = await createProject(input);
      return {
        content: [
          { type: 'text', text: `Project created:\n\n${JSON.stringify(project, null, 2)}` },
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
  'update_project',
  {
    title: 'Update Project',
    description: 'Update an existing project.',
    inputSchema: {
      id: z.number().describe('The project ID'),
      name: z.string().min(1).max(100).optional().describe('Project name'),
      code: z.string().max(20).optional().describe('Project code'),
      description: z.string().max(500).optional().describe('Description'),
      status: z.enum(['active', 'inactive', 'archived']).optional().describe('Status'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const project = await updateProject(id, input);
      return {
        content: [
          { type: 'text', text: `Project updated:\n\n${JSON.stringify(project, null, 2)}` },
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
  'delete_project',
  {
    title: 'Delete Project',
    description: 'Delete a project. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('The project ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_project', async ({ id }) => {
    await deleteProject(id);
    return textResponse(`Project ${id} deleted successfully.`);
  })
);

server.registerTool(
  'list_project_tasks',
  {
    title: 'List Project Tasks',
    description: 'Get tasks for a project.',
    inputSchema: {
      project_id: z.number().optional().describe('Filter by project ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ project_id, page, limit }) => {
    try {
      const result = await listProjectTasks(project_id, { page, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} tasks (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(result.data, null, 2)}`,
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
  'create_project_task',
  {
    title: 'Create Project Task',
    description: 'Create a new task for a project.',
    inputSchema: {
      name: z.string().min(1).max(100).describe('Task name'),
      project_id: z.number().describe('Project ID'),
      description: z.string().max(500).optional().describe('Description'),
      due_on: z.string().optional().describe('Due date (YYYY-MM-DD)'),
    },
  },
  async input => {
    try {
      const task = await createProjectTask(input);
      return {
        content: [{ type: 'text', text: `Task created:\n\n${JSON.stringify(task, null, 2)}` }],
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
  'update_project_task',
  {
    title: 'Update Project Task',
    description: 'Update a project task.',
    inputSchema: {
      id: z.number().describe('The task ID'),
      name: z.string().min(1).max(100).optional().describe('Task name'),
      description: z.string().max(500).optional().describe('Description'),
      due_on: z.string().optional().describe('Due date (YYYY-MM-DD)'),
      completed: z.boolean().optional().describe('Mark as completed'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const task = await updateProjectTask(id, input);
      return {
        content: [{ type: 'text', text: `Task updated:\n\n${JSON.stringify(task, null, 2)}` }],
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
  'delete_project_task',
  {
    title: 'Delete Project Task',
    description: 'Delete a project task.',
    inputSchema: {
      id: z.number().describe('The task ID to delete'),
    },
  },
  async ({ id }) => {
    try {
      await deleteProjectTask(id);
      return {
        content: [{ type: 'text', text: `Task ${id} deleted successfully.` }],
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
  'list_project_workers',
  {
    title: 'List Project Workers',
    description: 'Get workers assigned to projects.',
    inputSchema: {
      project_id: z.number().optional().describe('Filter by project ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ project_id, page, limit }) => {
    try {
      const result = await listProjectWorkers(project_id, { page, limit });

      // Fetch enrichment data
      const [projects, employees] = await Promise.all([listProjects(), listEmployees()]);
      const projectMap = new Map(projects.data.map(p => [p.id, p.name]));
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));

      const summary = result.data.map(w => ({
        id: w.id,
        project_id: w.project_id,
        project_name: projectMap.get(w.project_id) || `Project ${w.project_id}`,
        employee_id: w.employee_id,
        employee_name: empMap.get(w.employee_id) || `Employee ${w.employee_id}`,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} project workers (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'assign_project_worker',
  {
    title: 'Assign Project Worker',
    description: 'Assign an employee to a project.',
    inputSchema: {
      project_id: z.number().describe('Project ID'),
      employee_id: z.number().describe('Employee ID'),
    },
  },
  async input => {
    try {
      const worker = await assignProjectWorker(input);
      return {
        content: [{ type: 'text', text: `Worker assigned:\n\n${JSON.stringify(worker, null, 2)}` }],
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
  'remove_project_worker',
  {
    title: 'Remove Project Worker',
    description: 'Remove an employee from a project.',
    inputSchema: {
      id: z.number().describe('The project worker ID to remove'),
    },
  },
  async ({ id }) => {
    try {
      await removeProjectWorker(id);
      return {
        content: [{ type: 'text', text: `Project worker ${id} removed successfully.` }],
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
  'list_time_records',
  {
    title: 'List Time Records',
    description: 'Get time records for project workers.',
    inputSchema: {
      project_worker_id: z.number().optional().describe('Filter by project worker ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ project_worker_id, page, limit }) => {
    try {
      const result = await listTimeRecords(project_worker_id, { page, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} time records (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(result.data, null, 2)}`,
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
  'create_time_record',
  {
    title: 'Create Time Record',
    description: 'Log time for a project worker.',
    inputSchema: {
      project_worker_id: z.number().describe('Project worker ID'),
      date: z.string().describe('Date (YYYY-MM-DD)'),
      minutes: z.number().min(1).max(1440).describe('Minutes worked'),
      description: z.string().max(500).optional().describe('Description'),
    },
  },
  async input => {
    try {
      const record = await createTimeRecord(input);
      return {
        content: [
          { type: 'text', text: `Time record created:\n\n${JSON.stringify(record, null, 2)}` },
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
  'update_time_record',
  {
    title: 'Update Time Record',
    description: 'Update a time record.',
    inputSchema: {
      id: z.number().describe('Time record ID'),
      date: z.string().optional().describe('Date (YYYY-MM-DD)'),
      minutes: z.number().min(1).max(1440).optional().describe('Minutes worked'),
      description: z.string().max(500).optional().describe('Description'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const record = await updateTimeRecord(id, input);
      return {
        content: [
          { type: 'text', text: `Time record updated:\n\n${JSON.stringify(record, null, 2)}` },
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
  'delete_time_record',
  {
    title: 'Delete Time Record',
    description: 'Delete a time record.',
    inputSchema: {
      id: z.number().describe('Time record ID to delete'),
    },
  },
  async ({ id }) => {
    try {
      await deleteTimeRecord(id);
      return {
        content: [{ type: 'text', text: `Time record ${id} deleted successfully.` }],
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
// Training Tools
// ============================================================================

server.registerTool(
  'list_trainings',
  {
    title: 'List Trainings',
    description: 'Get all training programs.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listTrainings({ page, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} trainings (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(result.data, null, 2)}`,
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
  'get_training',
  {
    title: 'Get Training',
    description: 'Get details about a training program.',
    inputSchema: {
      id: z.number().describe('The training ID'),
    },
  },
  async ({ id }) => {
    try {
      const training = await getTraining(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(training, null, 2) }],
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
  'create_training',
  {
    title: 'Create Training',
    description: 'Create a new training program.',
    inputSchema: {
      name: z.string().min(1).max(100).describe('Training name'),
      description: z.string().max(1000).optional().describe('Description'),
      category_id: z.number().optional().describe('Category ID'),
      subsidized: z.boolean().optional().describe('Is subsidized'),
    },
  },
  async input => {
    try {
      const training = await createTraining(input);
      return {
        content: [
          { type: 'text', text: `Training created:\n\n${JSON.stringify(training, null, 2)}` },
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
  'update_training',
  {
    title: 'Update Training',
    description: 'Update a training program.',
    inputSchema: {
      id: z.number().describe('The training ID'),
      name: z.string().min(1).max(100).optional().describe('Training name'),
      description: z.string().max(1000).optional().describe('Description'),
      category_id: z.number().optional().describe('Category ID'),
      subsidized: z.boolean().optional().describe('Is subsidized'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const training = await updateTraining(id, input);
      return {
        content: [
          { type: 'text', text: `Training updated:\n\n${JSON.stringify(training, null, 2)}` },
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
  'delete_training',
  {
    title: 'Delete Training',
    description:
      'Delete a training program. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('The training ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_training', async ({ id }) => {
    await deleteTraining(id);
    return textResponse(`Training ${id} deleted successfully.`);
  })
);

server.registerTool(
  'list_training_sessions',
  {
    title: 'List Training Sessions',
    description: 'Get sessions for a training program.',
    inputSchema: {
      training_id: z.number().optional().describe('Filter by training ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ training_id, page, limit }) => {
    try {
      const result = await listTrainingSessions(training_id, { page, limit });

      // Fetch training names for enrichment
      const trainings = await listTrainings();
      const trainingMap = new Map(trainings.data.map(t => [t.id, t.name]));

      const summary = result.data.map(s => ({
        id: s.id,
        training_id: s.training_id,
        training_name: trainingMap.get(s.training_id) || `Training ${s.training_id}`,
        name: s.name,
        start_date: s.start_date,
        end_date: s.end_date,
        location: s.location,
        max_attendees: s.max_attendees,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} sessions (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'create_training_session',
  {
    title: 'Create Training Session',
    description: 'Create a session for a training program.',
    inputSchema: {
      training_id: z.number().describe('Training ID'),
      name: z.string().max(100).optional().describe('Session name'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
      location: z.string().max(200).optional().describe('Location'),
      max_attendees: z.number().optional().describe('Max attendees'),
    },
  },
  async input => {
    try {
      const session = await createTrainingSession(input);
      return {
        content: [
          { type: 'text', text: `Session created:\n\n${JSON.stringify(session, null, 2)}` },
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
  'update_training_session',
  {
    title: 'Update Training Session',
    description: 'Update a training session.',
    inputSchema: {
      id: z.number().describe('Session ID'),
      name: z.string().max(100).optional().describe('Session name'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
      location: z.string().max(200).optional().describe('Location'),
      max_attendees: z.number().optional().describe('Max attendees'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const session = await updateTrainingSession(id, input);
      return {
        content: [
          { type: 'text', text: `Session updated:\n\n${JSON.stringify(session, null, 2)}` },
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
  'delete_training_session',
  {
    title: 'Delete Training Session',
    description: 'Delete a training session.',
    inputSchema: {
      id: z.number().describe('Session ID to delete'),
    },
  },
  async ({ id }) => {
    try {
      await deleteTrainingSession(id);
      return {
        content: [{ type: 'text', text: `Session ${id} deleted successfully.` }],
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
  'list_training_enrollments',
  {
    title: 'List Training Enrollments',
    description: 'Get enrollments for a training program.',
    inputSchema: {
      training_id: z.number().optional().describe('Filter by training ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ training_id, page, limit }) => {
    try {
      const result = await listTrainingEnrollments(training_id, { page, limit });

      // Fetch enrichment data
      const [trainings, employees] = await Promise.all([listTrainings(), listEmployees()]);
      const trainingMap = new Map(trainings.data.map(t => [t.id, t.name]));
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));

      const summary = result.data.map(e => ({
        id: e.id,
        training_id: e.training_id,
        training_name: trainingMap.get(e.training_id) || `Training ${e.training_id}`,
        employee_id: e.employee_id,
        employee_name: empMap.get(e.employee_id) || `Employee ${e.employee_id}`,
        session_id: e.session_id,
        status: e.status,
        enrolled_at: e.enrolled_at,
        completed_at: e.completed_at,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} enrollments (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'enroll_in_training',
  {
    title: 'Enroll in Training',
    description: 'Enroll an employee in a training program.',
    inputSchema: {
      training_id: z.number().describe('Training ID'),
      employee_id: z.number().describe('Employee ID'),
      session_id: z.number().optional().describe('Session ID'),
    },
  },
  async input => {
    try {
      const enrollment = await enrollInTraining(input);
      return {
        content: [{ type: 'text', text: `Enrolled:\n\n${JSON.stringify(enrollment, null, 2)}` }],
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
  'unenroll_from_training',
  {
    title: 'Unenroll from Training',
    description: 'Remove an enrollment from a training.',
    inputSchema: {
      id: z.number().describe('Enrollment ID to remove'),
    },
  },
  async ({ id }) => {
    try {
      await unenrollFromTraining(id);
      return {
        content: [{ type: 'text', text: `Enrollment ${id} removed successfully.` }],
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
// Work Area Tools
// ============================================================================

server.registerTool(
  'list_work_areas',
  {
    title: 'List Work Areas',
    description: 'Get all work areas within locations.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listWorkAreas({ page, limit });

      // Fetch location names for enrichment (cached)
      const locations = await listLocations();
      const locMap = new Map(locations.data.map(l => [l.id, l.name]));

      const summary = result.data.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        location_id: w.location_id,
        location_name: w.location_id
          ? locMap.get(w.location_id) || `Location ${w.location_id}`
          : null,
        archived: w.archived,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} work areas (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'get_work_area',
  {
    title: 'Get Work Area',
    description: 'Get details about a work area.',
    inputSchema: {
      id: z.number().describe('The work area ID'),
    },
  },
  async ({ id }) => {
    try {
      const workArea = await getWorkArea(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(workArea, null, 2) }],
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
  'create_work_area',
  {
    title: 'Create Work Area',
    description: 'Create a new work area within a location.',
    inputSchema: {
      name: z.string().min(1).max(100).describe('Work area name'),
      description: z.string().max(500).optional().describe('Description'),
      location_id: z.number().optional().describe('Location ID'),
    },
  },
  async input => {
    try {
      const workArea = await createWorkArea(input);
      return {
        content: [
          { type: 'text', text: `Work area created:\n\n${JSON.stringify(workArea, null, 2)}` },
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
  'update_work_area',
  {
    title: 'Update Work Area',
    description: 'Update a work area.',
    inputSchema: {
      id: z.number().describe('Work area ID'),
      name: z.string().min(1).max(100).optional().describe('Work area name'),
      description: z.string().max(500).optional().describe('Description'),
      location_id: z.number().optional().describe('Location ID'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const workArea = await updateWorkArea(id, input);
      return {
        content: [
          { type: 'text', text: `Work area updated:\n\n${JSON.stringify(workArea, null, 2)}` },
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
  'archive_work_area',
  {
    title: 'Archive Work Area',
    description: 'Archive a work area.',
    inputSchema: {
      id: z.number().describe('Work area ID to archive'),
    },
  },
  async ({ id }) => {
    try {
      const workArea = await archiveWorkArea(id);
      return {
        content: [
          { type: 'text', text: `Work area archived:\n\n${JSON.stringify(workArea, null, 2)}` },
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
  'unarchive_work_area',
  {
    title: 'Unarchive Work Area',
    description: 'Unarchive a work area.',
    inputSchema: {
      id: z.number().describe('Work area ID to unarchive'),
    },
  },
  async ({ id }) => {
    try {
      const workArea = await unarchiveWorkArea(id);
      return {
        content: [
          { type: 'text', text: `Work area unarchived:\n\n${JSON.stringify(workArea, null, 2)}` },
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
// ATS (Recruiting) Tools
// ============================================================================

server.registerTool(
  'list_job_postings',
  {
    title: 'List Job Postings',
    description: 'Get all job postings for recruiting.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listJobPostings({ page, limit });

      // Fetch enrichment data (cached)
      const [teams, locations] = await Promise.all([listTeams(), listLocations()]);
      const teamMap = new Map(teams.data.map(t => [t.id, t.name]));
      const locMap = new Map(locations.data.map(l => [l.id, l.name]));

      const summary = result.data.map(j => ({
        id: j.id,
        title: j.title,
        department: j.department,
        team_id: j.team_id,
        team_name: j.team_id ? teamMap.get(j.team_id) || `Team ${j.team_id}` : null,
        location_id: j.location_id,
        location_name: j.location_id
          ? locMap.get(j.location_id) || `Location ${j.location_id}`
          : null,
        status: j.status,
        employment_type: j.employment_type,
        remote_status: j.remote_status,
        published_at: j.published_at,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} job postings (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'get_job_posting',
  {
    title: 'Get Job Posting',
    description: 'Get details about a job posting.',
    inputSchema: {
      id: z.number().describe('The job posting ID'),
    },
  },
  async ({ id }) => {
    try {
      const posting = await getJobPosting(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(posting, null, 2) }],
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
  'create_job_posting',
  {
    title: 'Create Job Posting',
    description: 'Create a new job posting.',
    inputSchema: {
      title: z.string().min(1).max(200).describe('Job title'),
      description: z.string().max(5000).optional().describe('Job description'),
      department: z.string().max(100).optional().describe('Department'),
      location_id: z.number().optional().describe('Location ID'),
      team_id: z.number().optional().describe('Team ID'),
      employment_type: z.string().max(50).optional().describe('Employment type'),
      remote_status: z.string().max(50).optional().describe('Remote status'),
    },
  },
  async input => {
    try {
      const posting = await createJobPosting(input);
      return {
        content: [
          { type: 'text', text: `Job posting created:\n\n${JSON.stringify(posting, null, 2)}` },
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
  'update_job_posting',
  {
    title: 'Update Job Posting',
    description: 'Update a job posting.',
    inputSchema: {
      id: z.number().describe('Job posting ID'),
      title: z.string().min(1).max(200).optional().describe('Job title'),
      description: z.string().max(5000).optional().describe('Job description'),
      department: z.string().max(100).optional().describe('Department'),
      location_id: z.number().optional().describe('Location ID'),
      team_id: z.number().optional().describe('Team ID'),
      status: z.enum(['draft', 'published', 'closed', 'archived']).optional().describe('Status'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const posting = await updateJobPosting(id, input);
      return {
        content: [
          { type: 'text', text: `Job posting updated:\n\n${JSON.stringify(posting, null, 2)}` },
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
  'delete_job_posting',
  {
    title: 'Delete Job Posting',
    description: 'Delete a job posting. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('Job posting ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_job_posting', async ({ id }) => {
    await deleteJobPosting(id);
    return textResponse(`Job posting ${id} deleted successfully.`);
  })
);

server.registerTool(
  'list_candidates',
  {
    title: 'List Candidates',
    description: 'Get all candidates.',
    inputSchema: {
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ page, limit }) => {
    try {
      const result = await listCandidates({ page, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} candidates (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(result.data, null, 2)}`,
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
  'get_candidate',
  {
    title: 'Get Candidate',
    description: 'Get details about a candidate.',
    inputSchema: {
      id: z.number().describe('The candidate ID'),
    },
  },
  async ({ id }) => {
    try {
      const candidate = await getCandidate(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(candidate, null, 2) }],
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
  'create_candidate',
  {
    title: 'Create Candidate',
    description: 'Create a new candidate.',
    inputSchema: {
      first_name: z.string().min(1).max(100).describe('First name'),
      last_name: z.string().min(1).max(100).describe('Last name'),
      email: z.string().email().optional().describe('Email'),
      phone: z.string().max(30).optional().describe('Phone'),
      source: z.string().max(100).optional().describe('Source'),
      linkedin_url: z.string().optional().describe('LinkedIn URL'),
    },
  },
  async input => {
    try {
      const candidate = await createCandidate(input);
      return {
        content: [
          { type: 'text', text: `Candidate created:\n\n${JSON.stringify(candidate, null, 2)}` },
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
  'update_candidate',
  {
    title: 'Update Candidate',
    description: 'Update a candidate.',
    inputSchema: {
      id: z.number().describe('Candidate ID'),
      first_name: z.string().min(1).max(100).optional().describe('First name'),
      last_name: z.string().min(1).max(100).optional().describe('Last name'),
      email: z.string().email().optional().describe('Email'),
      phone: z.string().max(30).optional().describe('Phone'),
      source: z.string().max(100).optional().describe('Source'),
      linkedin_url: z.string().optional().describe('LinkedIn URL'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const candidate = await updateCandidate(id, input);
      return {
        content: [
          { type: 'text', text: `Candidate updated:\n\n${JSON.stringify(candidate, null, 2)}` },
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
  'delete_candidate',
  {
    title: 'Delete Candidate',
    description: 'Delete a candidate. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('Candidate ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_candidate', async ({ id }) => {
    await deleteCandidate(id);
    return textResponse(`Candidate ${id} deleted successfully.`);
  })
);

server.registerTool(
  'list_applications',
  {
    title: 'List Applications',
    description: 'Get job applications.',
    inputSchema: {
      job_posting_id: z.number().optional().describe('Filter by job posting ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ job_posting_id, page, limit }) => {
    try {
      const result = await listApplications(job_posting_id, { page, limit });

      // Fetch enrichment data
      const [jobPostings, candidates, hiringStages] = await Promise.all([
        listJobPostings(),
        listCandidates(),
        listHiringStages(),
      ]);
      const jobMap = new Map(jobPostings.data.map(j => [j.id, j.title]));
      const candidateMap = new Map(
        candidates.data.map(c => [
          c.id,
          `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Candidate ${c.id}`,
        ])
      );
      const stageMap = new Map(hiringStages.map(s => [s.id, s.name]));

      const summary = result.data.map(a => ({
        id: a.id,
        job_posting_id: a.job_posting_id,
        job_title: jobMap.get(a.job_posting_id) || `Posting ${a.job_posting_id}`,
        candidate_id: a.candidate_id,
        candidate_name: candidateMap.get(a.candidate_id) || `Candidate ${a.candidate_id}`,
        hiring_stage_id: a.hiring_stage_id,
        hiring_stage_name: a.hiring_stage_id
          ? stageMap.get(a.hiring_stage_id) || `Stage ${a.hiring_stage_id}`
          : null,
        status: a.status,
        applied_at: a.applied_at,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} applications (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'get_application',
  {
    title: 'Get Application',
    description: 'Get details about an application.',
    inputSchema: {
      id: z.number().describe('The application ID'),
    },
  },
  async ({ id }) => {
    try {
      const application = await getApplication(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(application, null, 2) }],
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
  'create_application',
  {
    title: 'Create Application',
    description: 'Create a job application for a candidate.',
    inputSchema: {
      job_posting_id: z.number().describe('Job posting ID'),
      candidate_id: z.number().describe('Candidate ID'),
      notes: z.string().max(2000).optional().describe('Notes'),
    },
  },
  async input => {
    try {
      const application = await createApplication(input);
      return {
        content: [
          { type: 'text', text: `Application created:\n\n${JSON.stringify(application, null, 2)}` },
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
  'update_application',
  {
    title: 'Update Application',
    description: 'Update a job application.',
    inputSchema: {
      id: z.number().describe('Application ID'),
      hiring_stage_id: z.number().optional().describe('Hiring stage ID'),
      rating: z.number().min(0).max(5).optional().describe('Rating (0-5)'),
      notes: z.string().max(2000).optional().describe('Notes'),
    },
  },
  async ({ id, ...input }) => {
    try {
      const application = await updateApplication(id, input);
      return {
        content: [
          { type: 'text', text: `Application updated:\n\n${JSON.stringify(application, null, 2)}` },
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
  'delete_application',
  {
    title: 'Delete Application',
    description:
      'Delete a job application. This is a HIGH-RISK operation that requires confirmation.',
    inputSchema: {
      id: z.number().describe('Application ID to delete'),
      confirm: z.boolean().optional().describe('Set to true to confirm this high-risk operation'),
    },
  },
  wrapHighRiskToolHandler('delete_application', async ({ id }) => {
    await deleteApplication(id);
    return textResponse(`Application ${id} deleted successfully.`);
  })
);

server.registerTool(
  'advance_application',
  {
    title: 'Advance Application',
    description: 'Move an application to the next hiring stage.',
    inputSchema: {
      id: z.number().describe('Application ID'),
    },
  },
  async ({ id }) => {
    try {
      const application = await advanceApplication(id);
      return {
        content: [
          {
            type: 'text',
            text: `Application advanced:\n\n${JSON.stringify(application, null, 2)}`,
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
  'list_hiring_stages',
  {
    title: 'List Hiring Stages',
    description: 'Get all hiring stages for the recruiting workflow.',
    inputSchema: {},
  },
  async () => {
    try {
      const stages = await listHiringStages();
      return {
        content: [
          {
            type: 'text',
            text: `Found ${stages.length} hiring stages:\n\n${JSON.stringify(stages, null, 2)}`,
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
// Payroll Tools (Read-Only)
// ============================================================================

server.registerTool(
  'list_payroll_supplements',
  {
    title: 'List Payroll Supplements',
    description: 'Get payroll supplements (bonuses, allowances, etc.). Read-only.',
    inputSchema: {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ employee_id, page, limit }) => {
    try {
      const result = await listPayrollSupplements(employee_id, { page, limit });

      // Fetch employee names for enrichment (cached)
      const employees = await listEmployees();
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));

      const summary = result.data.map(s => ({
        ...s,
        employee_name: empMap.get(s.employee_id) || `Employee ${s.employee_id}`,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} supplements (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'get_payroll_supplement',
  {
    title: 'Get Payroll Supplement',
    description: 'Get details about a payroll supplement. Read-only.',
    inputSchema: {
      id: z.number().describe('The supplement ID'),
    },
  },
  async ({ id }) => {
    try {
      const supplement = await getPayrollSupplement(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(supplement, null, 2) }],
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
  'list_tax_identifiers',
  {
    title: 'List Tax Identifiers',
    description: 'Get employee tax identifiers. Read-only.',
    inputSchema: {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ employee_id, page, limit }) => {
    try {
      const result = await listTaxIdentifiers(employee_id, { page, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} tax identifiers (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(result.data, null, 2)}`,
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
  'get_tax_identifier',
  {
    title: 'Get Tax Identifier',
    description: 'Get details about a tax identifier. Read-only.',
    inputSchema: {
      id: z.number().describe('The tax identifier ID'),
    },
  },
  async ({ id }) => {
    try {
      const identifier = await getTaxIdentifier(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(identifier, null, 2) }],
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
  'list_family_situations',
  {
    title: 'List Family Situations',
    description: 'Get employee family situations. Read-only.',
    inputSchema: {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async ({ employee_id, page, limit }) => {
    try {
      const result = await listFamilySituations(employee_id, { page, limit });

      // Fetch employee names for enrichment (cached)
      const employees = await listEmployees();
      const empMap = new Map(employees.data.map(e => [e.id, e.full_name]));

      const summary = result.data.map(s => ({
        ...s,
        employee_name: empMap.get(s.employee_id) || `Employee ${s.employee_id}`,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.data.length} family situations (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`,
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
  'get_family_situation',
  {
    title: 'Get Family Situation',
    description: 'Get details about an employee family situation. Read-only.',
    inputSchema: {
      id: z.number().describe('The family situation ID'),
    },
  },
  async ({ id }) => {
    try {
      const situation = await getFamilySituation(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(situation, null, 2) }],
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
      lines.push(`${indent}- ${emp.full_name || 'Unknown'} [ID: ${emp.id}]`);
      lines.push(...buildTree(emp.id, depth + 1));
    }
    return lines;
  }

  const lines: string[] = ['# Organization Chart\n'];

  // Add top-level employees
  for (const emp of topLevel) {
    lines.push(`## ${emp.full_name || 'Unknown'} [ID: ${emp.id}]`);
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

  // Create employee lookup map
  const employeeMap = new Map(employees.map(e => [e.id, e]));

  // Track which employees are assigned to teams
  const assignedEmployeeIds = new Set<number>();

  // Output by team (using team's employee_ids)
  for (const team of teams) {
    const teamEmployeeIds = team.employee_ids || [];
    lines.push(`## ${team.name}`);
    if (team.description) lines.push(`*${team.description}*\n`);
    if (teamEmployeeIds.length === 0) {
      lines.push('No employees assigned.\n');
    } else {
      for (const empId of teamEmployeeIds) {
        const emp = employeeMap.get(empId);
        if (emp) {
          assignedEmployeeIds.add(empId);
          lines.push(`- **${emp.full_name || 'Unknown'}**`);
          if (emp.email) lines.push(`  - Email: ${emp.email}`);
        }
      }
      lines.push('');
    }
  }

  // Employees without teams
  const noTeam = employees.filter(e => !assignedEmployeeIds.has(e.id));
  if (noTeam.length > 0) {
    lines.push('## Unassigned\n');
    for (const emp of noTeam) {
      lines.push(`- **${emp.full_name || 'Unknown'}**`);
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
        lines.push(`- ${emp.full_name || 'Unknown'}`);
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

    // Find teams that have this employee (relationship is on Team, not Employee)
    const employeeTeams = teams.filter(t => t.employee_ids?.includes(empId));
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
- Team(s): ${teamNames}
- Start Date: ${employee.seniority_calculation_date || 'Not specified'}
- Email: ${employee.email}

Please include:
1. First day essentials
2. First week goals
3. Team introductions
4. Tools and access setup
5. Key meetings to schedule
6. 30/60/90 day milestones

Tailor the checklist to their team.`,
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

server.registerPrompt(
  'team-document-summary',
  {
    description:
      'Summarize documents across a team: who has certifications, payslips, missing required documents.',
    argsSchema: {
      team_id: z.string().describe('Team ID to analyze'),
      document_type: z
        .string()
        .optional()
        .describe('Focus on specific folder/type (e.g., "Certifications", "Payslips")'),
    },
  },
  async ({ team_id, document_type }) => {
    const teamId = parseInt(team_id, 10);
    const team = await getTeam(teamId);
    const employeeIds = team.employee_ids || [];

    if (employeeIds.length === 0) {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Team "${team.name}" has no members. Cannot generate document summary.`,
            },
          },
        ],
      };
    }

    // Fetch documents for all team members
    const docsResult = await listDocuments({ employee_ids: employeeIds });
    const docs = docsResult.data;

    // Fetch folders for categorization
    const folders = await listFolders();
    const folderMap = new Map(folders.map(f => [f.id, f.name]));

    // Fetch employees for names
    const empResult = await listEmployees();
    const empMap = new Map(empResult.data.map(e => [e.id, e.full_name]));

    // Group documents by employee and folder
    const docsByEmployee = new Map<number, Map<string, number>>();

    for (const empId of employeeIds) {
      docsByEmployee.set(empId, new Map());
    }

    for (const doc of docs) {
      if (!doc.employee_id) continue;
      const folderName = doc.folder_id ? folderMap.get(doc.folder_id) || 'Unknown' : 'Unfiled';
      const empDocs = docsByEmployee.get(doc.employee_id);
      if (empDocs) {
        empDocs.set(folderName, (empDocs.get(folderName) || 0) + 1);
      }
    }

    // Build summary text
    const allFolderNames = new Set<string>();
    for (const empDocs of docsByEmployee.values()) {
      for (const folderName of empDocs.keys()) {
        allFolderNames.add(folderName);
      }
    }

    const summaryLines: string[] = [];
    for (const empId of employeeIds) {
      const empName = empMap.get(empId) || `Employee ${empId}`;
      const empDocs = docsByEmployee.get(empId) || new Map<string, number>();

      const docCounts: string[] = [];
      for (const folderName of allFolderNames) {
        const count: number = empDocs.get(folderName) || 0;
        docCounts.push(`${count} ${folderName}`);
      }

      summaryLines.push(`- ${empName}: ${docCounts.join(', ') || 'No documents'}`);
    }

    const focusInfo = document_type ? `\nFocus: ${document_type}` : '';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the document summary for team "${team.name}":

**Team:** ${team.name}
**Members:** ${employeeIds.length}
**Total Documents:** ${docs.length}${focusInfo}

**Document Summary by Employee:**
${summaryLines.join('\n')}

Please analyze:
1. Document completeness across the team
2. Any employees with missing or fewer documents than others
3. Patterns in document distribution
4. Recommendations for improving documentation`,
          },
        },
      ],
    };
  }
);

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Clean up resources on process termination
 */
function shutdown() {
  cache.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

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
