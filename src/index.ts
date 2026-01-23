#!/usr/bin/env node

/**
 * MCP Server for FactorialHR - Hierarchical Tool Discovery
 *
 * v8.0.0 introduces hierarchical tool discovery to reduce context usage.
 * Instead of 117 individual tools, we now have 14 category-based tools.
 *
 * Usage:
 * 1. Use `factorial_discover` to list available categories and their actions
 * 2. Use category tools like `factorial_employees` with an `action` parameter
 *
 * This reduces context token usage by ~88% while maintaining full functionality.
 */

import { loadEnv } from './config.js';

// Load environment variables before other imports
loadEnv();

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { cache } from './cache.js';

import {
  // Employees
  listEmployees,
  getEmployee,
  searchEmployees,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  // Teams
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  // Locations
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
  // Contracts
  listContracts,
  getEmployeeWithContract,
  listEmployeesByJobRole,
  listEmployeesByJobLevel,
  // Time Off
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
  // Shifts
  listShifts,
  getShift,
  createShift,
  updateShift,
  deleteShift,
  // Documents
  listFolders,
  getFolder,
  listDocuments,
  getDocument,
  downloadEmployeePayslips,
  downloadEmployeeDocument,
  // Job Catalog
  listJobRoles,
  getJobRole,
  listJobLevels,
  // Projects
  listProjects,
  getProject,
  listProjectTasks,
  listProjectWorkers,
  listTimeRecords,
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
  // Training
  listTrainings,
  getTraining,
  listTrainingSessions,
  listTrainingEnrollments,
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
  // ATS
  listJobPostings,
  getJobPosting,
  listCandidates,
  getCandidate,
  listApplications,
  getApplication,
  listHiringStages,
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
  // Payroll
  listPayrollSupplements,
  getPayrollSupplement,
  listTaxIdentifiers,
  getTaxIdentifier,
  listFamilySituations,
  getFamilySituation,
} from './api.js';

import { formatPaginationInfo } from './pagination.js';
import { textResponse, formatToolError } from './tool-utils.js';
import { getOperationPolicy, getWarningMessage } from './write-safety.js';

const server = new McpServer({
  name: 'factorial-hr',
  version: '8.0.0',
});

// ============================================================================
// Category Definitions
// ============================================================================

const CATEGORIES = {
  employees: {
    name: 'Employees',
    description: 'Manage employee records',
    actions: ['list', 'get', 'search', 'create', 'update', 'terminate'],
  },
  teams: {
    name: 'Teams',
    description: 'Manage team structure',
    actions: ['list', 'get', 'create', 'update', 'delete'],
  },
  locations: {
    name: 'Locations',
    description: 'Manage company locations',
    actions: ['list', 'get', 'create', 'update', 'delete'],
  },
  contracts: {
    name: 'Contracts',
    description: 'Employee contract and salary data',
    actions: ['list', 'get_with_employee', 'by_job_role', 'by_job_level'],
  },
  time_off: {
    name: 'Time Off',
    description: 'Leave requests and allowances',
    actions: [
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
    ],
  },
  attendance: {
    name: 'Attendance',
    description: 'Clock in/out and shift records',
    actions: ['list', 'get', 'create', 'update', 'delete'],
  },
  documents: {
    name: 'Documents',
    description: 'Document management and downloads',
    actions: [
      'list_folders',
      'get_folder',
      'list',
      'get',
      'get_by_employee',
      'search',
      'download_payslips',
      'download',
    ],
  },
  job_catalog: {
    name: 'Job Catalog',
    description: 'Job roles and levels',
    actions: ['list_roles', 'get_role', 'list_levels'],
  },
  projects: {
    name: 'Projects',
    description: 'Project management with tasks, workers, and time tracking',
    actions: [
      'list',
      'get',
      'create',
      'update',
      'delete',
      'list_tasks',
      'create_task',
      'update_task',
      'delete_task',
      'list_workers',
      'assign_worker',
      'remove_worker',
      'list_time',
      'create_time',
      'update_time',
      'delete_time',
    ],
  },
  training: {
    name: 'Training',
    description: 'Training programs, sessions, and enrollments',
    actions: [
      'list',
      'get',
      'create',
      'update',
      'delete',
      'list_sessions',
      'create_session',
      'update_session',
      'delete_session',
      'list_enrollments',
      'enroll',
      'unenroll',
    ],
  },
  work_areas: {
    name: 'Work Areas',
    description: 'Work areas within locations',
    actions: ['list', 'get', 'create', 'update', 'archive', 'unarchive'],
  },
  ats: {
    name: 'ATS (Recruiting)',
    description: 'Applicant tracking: job postings, candidates, applications',
    actions: [
      'list_postings',
      'get_posting',
      'create_posting',
      'update_posting',
      'delete_posting',
      'list_candidates',
      'get_candidate',
      'create_candidate',
      'update_candidate',
      'delete_candidate',
      'list_applications',
      'get_application',
      'create_application',
      'update_application',
      'delete_application',
      'advance_application',
      'list_stages',
    ],
  },
  payroll: {
    name: 'Payroll',
    description: 'Payroll supplements, tax IDs, family situations (read-only)',
    actions: [
      'list_supplements',
      'get_supplement',
      'list_tax_ids',
      'get_tax_id',
      'list_family',
      'get_family',
    ],
  },
} as const;

// ============================================================================
// Discovery Tool
// ============================================================================

server.registerTool(
  'factorial_discover',
  {
    title: 'Discover FactorialHR Tools',
    description:
      'List available FactorialHR tool categories and their actions. Use this first to understand what operations are available.',
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe('Get details for a specific category (e.g., "employees", "time_off")'),
    },
  },
  ({ category }) => {
    if (category) {
      const cat = CATEGORIES[category as keyof typeof CATEGORIES];
      if (!cat) {
        return textResponse(
          `Unknown category: "${category}". Available: ${Object.keys(CATEGORIES).join(', ')}`
        );
      }
      return textResponse(
        `## ${cat.name}\n\n${cat.description}\n\n**Available actions:**\n${cat.actions.map(a => `- ${a}`).join('\n')}\n\n**Usage:** factorial_${category}(action: "${cat.actions[0]}", ...)`
      );
    }

    const categoryList = Object.entries(CATEGORIES)
      .map(
        ([key, cat]) => `- **factorial_${key}**: ${cat.description} (${cat.actions.length} actions)`
      )
      .join('\n');

    return textResponse(
      `# FactorialHR Tool Categories\n\nUse \`factorial_discover(category: "name")\` for action details.\n\n${categoryList}\n\n**Total: 14 tools covering 117 operations**`
    );
  }
);

// ============================================================================
// Helper: Check confirmation for high-risk operations
// ============================================================================

function checkConfirmation(
  operationName: string,
  confirm?: boolean
): { needsConfirmation: true; message: string } | { needsConfirmation: false } {
  const policy = getOperationPolicy(operationName);
  if (policy.requiresConfirmation && !confirm) {
    const warning = getWarningMessage(operationName);
    return {
      needsConfirmation: true,
      message: `${warning}\n\nTo proceed, call this tool again with \`confirm: true\`.`,
    };
  }
  return { needsConfirmation: false };
}

// ============================================================================
// Employees Tool
// ============================================================================

server.registerTool(
  'factorial_employees',
  {
    title: 'FactorialHR Employees',
    description: 'Manage employees: list, get, search, create, update, terminate',
    inputSchema: {
      action: z.enum(['list', 'get', 'search', 'create', 'update', 'terminate']).describe('Action'),
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
            return textResponse('Error: first_name, last_name, and email are required for create');
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

// ============================================================================
// Teams Tool
// ============================================================================

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

// ============================================================================
// Locations Tool
// ============================================================================

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

// ============================================================================
// Contracts Tool
// ============================================================================

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

// ============================================================================
// Time Off Tool
// ============================================================================

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

// ============================================================================
// Attendance Tool
// ============================================================================

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

// ============================================================================
// Documents Tool
// ============================================================================

server.registerTool(
  'factorial_documents',
  {
    title: 'FactorialHR Documents',
    description:
      'Document management: list folders, list/get documents, search, download (OAuth2 required for downloads)',
    inputSchema: {
      action: z
        .enum([
          'list_folders',
          'get_folder',
          'list',
          'get',
          'get_by_employee',
          'search',
          'download_payslips',
          'download',
        ])
        .describe('Action'),
      id: z.number().optional().describe('Folder/document ID'),
      employee_id: z.number().optional().describe('Employee ID'),
      folder_id: z.number().optional().describe('Folder ID filter'),
      employee_name: z.string().optional().describe('Employee name (for search)'),
      document_pattern: z.string().optional().describe('Document name pattern (for search)'),
      output_dir: z.string().optional().describe('Output directory (for downloads)'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async args => {
    try {
      switch (args.action) {
        case 'list_folders': {
          const folders = await listFolders();
          const summary = folders.map(f => ({
            id: f.id,
            name: f.name,
          }));
          return textResponse(
            `Found ${folders.length} folders:\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get_folder': {
          if (!args.id) return textResponse('Error: id is required');
          const folder = await getFolder(args.id);
          return textResponse(`Folder details:\n\n${JSON.stringify(folder, null, 2)}`);
        }

        case 'list': {
          const result = await listDocuments({
            folder_id: args.folder_id,
            employee_ids: args.employee_id ? [args.employee_id] : undefined,
            page: args.page,
            limit: args.limit,
          });
          const summary = result.data.map(d => ({
            id: d.id,
            name: d.name,
            folder_id: d.folder_id,
            employee_id: d.employee_id,
            mime_type: d.mime_type,
          }));
          return textResponse(
            `Found ${result.data.length} documents:\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get': {
          if (!args.id) return textResponse('Error: id is required');
          const doc = await getDocument(args.id);
          return textResponse(`Document details:\n\n${JSON.stringify(doc, null, 2)}`);
        }

        case 'get_by_employee': {
          if (!args.employee_id) return textResponse('Error: employee_id is required');
          const result = await listDocuments({ employee_ids: [args.employee_id] });
          const summary = result.data.map(d => ({
            id: d.id,
            name: d.name,
            folder_id: d.folder_id,
            mime_type: d.mime_type,
          }));
          return textResponse(
            `Found ${result.data.length} documents for employee ${args.employee_id}:\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'search': {
          if (!args.employee_name) return textResponse('Error: employee_name is required');
          const employees = await searchEmployees(args.employee_name);
          if (employees.length === 0) {
            return textResponse(`No employees found matching "${args.employee_name}"`);
          }
          const allDocs: unknown[] = [];
          for (const emp of employees.slice(0, 5)) {
            const result = await listDocuments({ employee_ids: [emp.id] });
            let docs = result.data;
            if (args.document_pattern) {
              const pattern = args.document_pattern.toLowerCase();
              docs = docs.filter(d => d.name?.toLowerCase().includes(pattern));
            }
            allDocs.push(
              ...docs.map(d => ({
                id: d.id,
                name: d.name,
                employee: emp.full_name,
                folder_id: d.folder_id,
              }))
            );
          }
          return textResponse(
            `Found ${allDocs.length} documents:\n\n${JSON.stringify(allDocs, null, 2)}`
          );
        }

        case 'download_payslips': {
          if (!args.employee_id) return textResponse('Error: employee_id is required');
          if (!args.output_dir) return textResponse('Error: output_dir is required for downloads');
          const payslipResults = await downloadEmployeePayslips(args.employee_id, args.output_dir);
          return textResponse(
            `Downloaded ${payslipResults.length} payslips:\n\n${JSON.stringify(
              payslipResults.map(r => r.path),
              null,
              2
            )}`
          );
        }

        case 'download': {
          if (!args.id) return textResponse('Error: id (document ID) is required');
          if (!args.output_dir) return textResponse('Error: output_dir is required for downloads');
          const downloadResult = await downloadEmployeeDocument(args.id, args.output_dir);
          return textResponse(`Downloaded document to: ${downloadResult.path}`);
        }
      }
    } catch (error) {
      return formatToolError(error);
    }
  }
);

// ============================================================================
// Job Catalog Tool
// ============================================================================

server.registerTool(
  'factorial_job_catalog',
  {
    title: 'FactorialHR Job Catalog',
    description: 'View job roles and levels',
    inputSchema: {
      action: z.enum(['list_roles', 'get_role', 'list_levels']).describe('Action'),
      id: z.number().optional().describe('Job role ID (for get_role)'),
    },
  },
  async args => {
    try {
      switch (args.action) {
        case 'list_roles': {
          const roles = await listJobRoles();
          return textResponse(
            `Found ${roles.length} job roles:\n\n${JSON.stringify(roles, null, 2)}`
          );
        }

        case 'get_role': {
          if (!args.id) return textResponse('Error: id is required');
          const role = await getJobRole(args.id);
          return textResponse(`Job role details:\n\n${JSON.stringify(role, null, 2)}`);
        }

        case 'list_levels': {
          const levels = await listJobLevels();
          return textResponse(
            `Found ${levels.length} job levels:\n\n${JSON.stringify(levels, null, 2)}`
          );
        }
      }
    } catch (error) {
      return formatToolError(error);
    }
  }
);

// ============================================================================
// Projects Tool
// ============================================================================

server.registerTool(
  'factorial_projects',
  {
    title: 'FactorialHR Projects',
    description:
      'Project management: projects, tasks, workers, time records. Full CRUD operations.',
    inputSchema: {
      action: z
        .enum([
          'list',
          'get',
          'create',
          'update',
          'delete',
          'list_tasks',
          'create_task',
          'update_task',
          'delete_task',
          'list_workers',
          'assign_worker',
          'remove_worker',
          'list_time',
          'create_time',
          'update_time',
          'delete_time',
        ])
        .describe('Action'),
      id: z.number().optional().describe('Project/task/worker/time record ID'),
      project_id: z.number().optional().describe('Project ID'),
      employee_id: z.number().optional().describe('Employee ID'),
      project_worker_id: z.number().optional().describe('Project worker ID'),
      name: z.string().optional().describe('Name'),
      description: z.string().optional().describe('Description'),
      status: z.string().optional().describe('Status'),
      starts_on: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      ends_on: z.string().optional().describe('End date (YYYY-MM-DD)'),
      minutes: z.number().optional().describe('Time in minutes'),
      date: z.string().optional().describe('Date (YYYY-MM-DD)'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
      confirm: z.boolean().optional().describe('Confirm delete'),
    },
  },
  async args => {
    try {
      switch (args.action) {
        case 'list': {
          const result = await listProjects({ page: args.page, limit: args.limit });
          const summary = result.data.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
          }));
          return textResponse(
            `Found ${result.data.length} projects (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get': {
          if (!args.id) return textResponse('Error: id is required');
          const project = await getProject(args.id);
          return textResponse(`Project details:\n\n${JSON.stringify(project, null, 2)}`);
        }

        case 'create': {
          if (!args.name) return textResponse('Error: name is required');
          const project = await createProject({
            name: args.name,
            description: args.description,
          });
          return textResponse(`Project created:\n\n${JSON.stringify(project, null, 2)}`);
        }

        case 'update': {
          if (!args.id) return textResponse('Error: id is required');
          const projectStatus = args.status as 'active' | 'inactive' | 'archived' | undefined;
          const project = await updateProject(args.id, {
            name: args.name,
            description: args.description,
            status: projectStatus,
          });
          return textResponse(`Project updated:\n\n${JSON.stringify(project, null, 2)}`);
        }

        case 'delete': {
          if (!args.id) return textResponse('Error: id is required');
          const check = checkConfirmation('delete_project', args.confirm);
          if (check.needsConfirmation) return textResponse(check.message);
          await deleteProject(args.id);
          return textResponse(`Project ${args.id} deleted successfully.`);
        }

        case 'list_tasks': {
          const result = await listProjectTasks(args.project_id, {
            page: args.page,
            limit: args.limit,
          });
          return textResponse(
            `Found ${result.data.length} tasks:\n\n${JSON.stringify(result.data, null, 2)}`
          );
        }

        case 'create_task': {
          if (!args.project_id || !args.name) {
            return textResponse('Error: project_id and name are required');
          }
          const task = await createProjectTask({
            project_id: args.project_id,
            name: args.name,
            description: args.description,
          });
          return textResponse(`Task created:\n\n${JSON.stringify(task, null, 2)}`);
        }

        case 'update_task': {
          if (!args.id) return textResponse('Error: id is required');
          const task = await updateProjectTask(args.id, {
            name: args.name,
            description: args.description,
          });
          return textResponse(`Task updated:\n\n${JSON.stringify(task, null, 2)}`);
        }

        case 'delete_task': {
          if (!args.id) return textResponse('Error: id is required');
          await deleteProjectTask(args.id);
          return textResponse(`Task ${args.id} deleted successfully.`);
        }

        case 'list_workers': {
          const result = await listProjectWorkers(args.project_id, {
            page: args.page,
            limit: args.limit,
          });
          return textResponse(
            `Found ${result.data.length} project workers:\n\n${JSON.stringify(result.data, null, 2)}`
          );
        }

        case 'assign_worker': {
          if (!args.project_id || !args.employee_id) {
            return textResponse('Error: project_id and employee_id are required');
          }
          const worker = await assignProjectWorker({
            project_id: args.project_id,
            employee_id: args.employee_id,
          });
          return textResponse(`Worker assigned:\n\n${JSON.stringify(worker, null, 2)}`);
        }

        case 'remove_worker': {
          if (!args.id) return textResponse('Error: id (project_worker_id) is required');
          await removeProjectWorker(args.id);
          return textResponse(`Worker ${args.id} removed from project.`);
        }

        case 'list_time': {
          const result = await listTimeRecords(args.project_worker_id, {
            page: args.page,
            limit: args.limit,
          });
          return textResponse(
            `Found ${result.data.length} time records:\n\n${JSON.stringify(result.data, null, 2)}`
          );
        }

        case 'create_time': {
          if (!args.project_worker_id || !args.minutes || !args.date) {
            return textResponse('Error: project_worker_id, minutes, and date are required');
          }
          const record = await createTimeRecord({
            project_worker_id: args.project_worker_id,
            minutes: args.minutes,
            date: args.date,
            description: args.description,
          });
          return textResponse(`Time record created:\n\n${JSON.stringify(record, null, 2)}`);
        }

        case 'update_time': {
          if (!args.id) return textResponse('Error: id is required');
          const record = await updateTimeRecord(args.id, {
            minutes: args.minutes,
            date: args.date,
            description: args.description,
          });
          return textResponse(`Time record updated:\n\n${JSON.stringify(record, null, 2)}`);
        }

        case 'delete_time': {
          if (!args.id) return textResponse('Error: id is required');
          await deleteTimeRecord(args.id);
          return textResponse(`Time record ${args.id} deleted successfully.`);
        }
      }
    } catch (error) {
      return formatToolError(error);
    }
  }
);

// ============================================================================
// Training Tool
// ============================================================================

server.registerTool(
  'factorial_training',
  {
    title: 'FactorialHR Training',
    description: 'Training programs, sessions, and enrollments. Full CRUD operations.',
    inputSchema: {
      action: z
        .enum([
          'list',
          'get',
          'create',
          'update',
          'delete',
          'list_sessions',
          'create_session',
          'update_session',
          'delete_session',
          'list_enrollments',
          'enroll',
          'unenroll',
        ])
        .describe('Action'),
      id: z.number().optional().describe('Training/session/enrollment ID'),
      training_id: z.number().optional().describe('Training ID'),
      employee_id: z.number().optional().describe('Employee ID'),
      name: z.string().optional().describe('Name'),
      description: z.string().optional().describe('Description'),
      starts_on: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      ends_on: z.string().optional().describe('End date (YYYY-MM-DD)'),
      location: z.string().optional().describe('Location'),
      max_attendees: z.number().optional().describe('Max attendees'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
      confirm: z.boolean().optional().describe('Confirm delete'),
    },
  },
  async args => {
    try {
      switch (args.action) {
        case 'list': {
          const result = await listTrainings({ page: args.page, limit: args.limit });
          const summary = result.data.map(t => ({
            id: t.id,
            name: t.name,
          }));
          return textResponse(
            `Found ${result.data.length} trainings (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get': {
          if (!args.id) return textResponse('Error: id is required');
          const training = await getTraining(args.id);
          return textResponse(`Training details:\n\n${JSON.stringify(training, null, 2)}`);
        }

        case 'create': {
          if (!args.name) return textResponse('Error: name is required');
          const training = await createTraining({
            name: args.name,
            description: args.description,
          });
          return textResponse(`Training created:\n\n${JSON.stringify(training, null, 2)}`);
        }

        case 'update': {
          if (!args.id) return textResponse('Error: id is required');
          const training = await updateTraining(args.id, {
            name: args.name,
            description: args.description,
          });
          return textResponse(`Training updated:\n\n${JSON.stringify(training, null, 2)}`);
        }

        case 'delete': {
          if (!args.id) return textResponse('Error: id is required');
          const check = checkConfirmation('delete_training', args.confirm);
          if (check.needsConfirmation) return textResponse(check.message);
          await deleteTraining(args.id);
          return textResponse(`Training ${args.id} deleted successfully.`);
        }

        case 'list_sessions': {
          const result = await listTrainingSessions(args.training_id, {
            page: args.page,
            limit: args.limit,
          });
          return textResponse(
            `Found ${result.data.length} sessions:\n\n${JSON.stringify(result.data, null, 2)}`
          );
        }

        case 'create_session': {
          if (!args.training_id) {
            return textResponse('Error: training_id is required');
          }
          const session = await createTrainingSession({
            training_id: args.training_id,
            start_date: args.starts_on,
            end_date: args.ends_on,
            location: args.location,
            max_attendees: args.max_attendees,
          });
          return textResponse(`Session created:\n\n${JSON.stringify(session, null, 2)}`);
        }

        case 'update_session': {
          if (!args.id) return textResponse('Error: id is required');
          const session = await updateTrainingSession(args.id, {
            start_date: args.starts_on,
            end_date: args.ends_on,
            location: args.location,
            max_attendees: args.max_attendees,
          });
          return textResponse(`Session updated:\n\n${JSON.stringify(session, null, 2)}`);
        }

        case 'delete_session': {
          if (!args.id) return textResponse('Error: id is required');
          await deleteTrainingSession(args.id);
          return textResponse(`Session ${args.id} deleted successfully.`);
        }

        case 'list_enrollments': {
          const result = await listTrainingEnrollments(args.training_id, {
            page: args.page,
            limit: args.limit,
          });
          return textResponse(
            `Found ${result.data.length} enrollments:\n\n${JSON.stringify(result.data, null, 2)}`
          );
        }

        case 'enroll': {
          if (!args.training_id || !args.employee_id) {
            return textResponse('Error: training_id and employee_id are required');
          }
          const enrollment = await enrollInTraining({
            training_id: args.training_id,
            employee_id: args.employee_id,
          });
          return textResponse(`Enrolled:\n\n${JSON.stringify(enrollment, null, 2)}`);
        }

        case 'unenroll': {
          if (!args.id) return textResponse('Error: id (enrollment_id) is required');
          await unenrollFromTraining(args.id);
          return textResponse(`Enrollment ${args.id} removed.`);
        }
      }
    } catch (error) {
      return formatToolError(error);
    }
  }
);

// ============================================================================
// Work Areas Tool
// ============================================================================

server.registerTool(
  'factorial_work_areas',
  {
    title: 'FactorialHR Work Areas',
    description: 'Manage work areas within locations',
    inputSchema: {
      action: z
        .enum(['list', 'get', 'create', 'update', 'archive', 'unarchive'])
        .describe('Action'),
      id: z.number().optional().describe('Work area ID'),
      location_id: z.number().optional().describe('Location ID'),
      name: z.string().optional().describe('Work area name'),
      description: z.string().optional().describe('Description'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
    },
  },
  async args => {
    try {
      switch (args.action) {
        case 'list': {
          const result = await listWorkAreas({ page: args.page, limit: args.limit });
          // Filter by location_id client-side if specified
          let data = result.data;
          if (args.location_id) {
            data = data.filter(w => w.location_id === args.location_id);
          }
          const summary = data.map(w => ({
            id: w.id,
            name: w.name,
            location_id: w.location_id,
            archived: w.archived,
          }));
          return textResponse(
            `Found ${summary.length} work areas:\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get': {
          if (!args.id) return textResponse('Error: id is required');
          const workArea = await getWorkArea(args.id);
          return textResponse(`Work area details:\n\n${JSON.stringify(workArea, null, 2)}`);
        }

        case 'create': {
          if (!args.location_id || !args.name) {
            return textResponse('Error: location_id and name are required');
          }
          const workArea = await createWorkArea({
            location_id: args.location_id,
            name: args.name,
            description: args.description,
          });
          return textResponse(`Work area created:\n\n${JSON.stringify(workArea, null, 2)}`);
        }

        case 'update': {
          if (!args.id) return textResponse('Error: id is required');
          const workArea = await updateWorkArea(args.id, {
            name: args.name,
            description: args.description,
          });
          return textResponse(`Work area updated:\n\n${JSON.stringify(workArea, null, 2)}`);
        }

        case 'archive': {
          if (!args.id) return textResponse('Error: id is required');
          const workArea = await archiveWorkArea(args.id);
          return textResponse(`Work area archived:\n\n${JSON.stringify(workArea, null, 2)}`);
        }

        case 'unarchive': {
          if (!args.id) return textResponse('Error: id is required');
          const workArea = await unarchiveWorkArea(args.id);
          return textResponse(`Work area unarchived:\n\n${JSON.stringify(workArea, null, 2)}`);
        }
      }
    } catch (error) {
      return formatToolError(error);
    }
  }
);

// ============================================================================
// ATS (Recruiting) Tool
// ============================================================================

server.registerTool(
  'factorial_ats',
  {
    title: 'FactorialHR ATS (Recruiting)',
    description:
      'Applicant tracking: job postings, candidates, applications, hiring stages. Full CRUD.',
    inputSchema: {
      action: z
        .enum([
          'list_postings',
          'get_posting',
          'create_posting',
          'update_posting',
          'delete_posting',
          'list_candidates',
          'get_candidate',
          'create_candidate',
          'update_candidate',
          'delete_candidate',
          'list_applications',
          'get_application',
          'create_application',
          'update_application',
          'delete_application',
          'advance_application',
          'list_stages',
        ])
        .describe('Action'),
      id: z.number().optional().describe('Posting/candidate/application ID'),
      job_posting_id: z.number().optional().describe('Job posting ID'),
      candidate_id: z.number().optional().describe('Candidate ID'),
      hiring_stage_id: z.number().optional().describe('Hiring stage ID'),
      title: z.string().optional().describe('Job title'),
      description: z.string().optional().describe('Description'),
      status: z.enum(['archived', 'draft', 'published', 'closed']).optional().describe('Status'),
      first_name: z.string().optional().describe('First name'),
      last_name: z.string().optional().describe('Last name'),
      email: z.string().optional().describe('Email'),
      phone: z.string().optional().describe('Phone'),
      page: z.number().optional().default(1).describe('Page number'),
      limit: z.number().optional().default(100).describe('Items per page'),
      confirm: z.boolean().optional().describe('Confirm delete'),
    },
  },
  async args => {
    try {
      switch (args.action) {
        case 'list_postings': {
          const result = await listJobPostings({ page: args.page, limit: args.limit });
          const summary = result.data.map(p => ({
            id: p.id,
            title: p.title,
            status: p.status,
          }));
          return textResponse(
            `Found ${result.data.length} job postings (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get_posting': {
          if (!args.id) return textResponse('Error: id is required');
          const posting = await getJobPosting(args.id);
          return textResponse(`Job posting details:\n\n${JSON.stringify(posting, null, 2)}`);
        }

        case 'create_posting': {
          if (!args.title) return textResponse('Error: title is required');
          const posting = await createJobPosting({
            title: args.title,
            description: args.description,
          });
          return textResponse(`Job posting created:\n\n${JSON.stringify(posting, null, 2)}`);
        }

        case 'update_posting': {
          if (!args.id) return textResponse('Error: id is required');
          const posting = await updateJobPosting(args.id, {
            title: args.title,
            description: args.description,
            status: args.status,
          });
          return textResponse(`Job posting updated:\n\n${JSON.stringify(posting, null, 2)}`);
        }

        case 'delete_posting': {
          if (!args.id) return textResponse('Error: id is required');
          const check = checkConfirmation('delete_job_posting', args.confirm);
          if (check.needsConfirmation) return textResponse(check.message);
          await deleteJobPosting(args.id);
          return textResponse(`Job posting ${args.id} deleted successfully.`);
        }

        case 'list_candidates': {
          const result = await listCandidates({ page: args.page, limit: args.limit });
          const summary = result.data.map(c => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
            email: c.email,
          }));
          return textResponse(
            `Found ${result.data.length} candidates (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get_candidate': {
          if (!args.id) return textResponse('Error: id is required');
          const candidate = await getCandidate(args.id);
          return textResponse(`Candidate details:\n\n${JSON.stringify(candidate, null, 2)}`);
        }

        case 'create_candidate': {
          if (!args.first_name || !args.last_name || !args.email) {
            return textResponse('Error: first_name, last_name, and email are required');
          }
          const candidate = await createCandidate({
            first_name: args.first_name,
            last_name: args.last_name,
            email: args.email,
            phone: args.phone,
          });
          return textResponse(`Candidate created:\n\n${JSON.stringify(candidate, null, 2)}`);
        }

        case 'update_candidate': {
          if (!args.id) return textResponse('Error: id is required');
          const candidate = await updateCandidate(args.id, {
            first_name: args.first_name,
            last_name: args.last_name,
            email: args.email,
            phone: args.phone,
          });
          return textResponse(`Candidate updated:\n\n${JSON.stringify(candidate, null, 2)}`);
        }

        case 'delete_candidate': {
          if (!args.id) return textResponse('Error: id is required');
          const check = checkConfirmation('delete_candidate', args.confirm);
          if (check.needsConfirmation) return textResponse(check.message);
          await deleteCandidate(args.id);
          return textResponse(`Candidate ${args.id} deleted successfully.`);
        }

        case 'list_applications': {
          const result = await listApplications(args.job_posting_id, {
            page: args.page,
            limit: args.limit,
          });
          const summary = result.data.map(a => ({
            id: a.id,
            job_posting_id: a.job_posting_id,
            candidate_id: a.candidate_id,
            hiring_stage_id: a.hiring_stage_id,
          }));
          return textResponse(
            `Found ${result.data.length} applications (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}`
          );
        }

        case 'get_application': {
          if (!args.id) return textResponse('Error: id is required');
          const application = await getApplication(args.id);
          return textResponse(`Application details:\n\n${JSON.stringify(application, null, 2)}`);
        }

        case 'create_application': {
          if (!args.job_posting_id || !args.candidate_id) {
            return textResponse('Error: job_posting_id and candidate_id are required');
          }
          const application = await createApplication({
            job_posting_id: args.job_posting_id,
            candidate_id: args.candidate_id,
          });
          return textResponse(`Application created:\n\n${JSON.stringify(application, null, 2)}`);
        }

        case 'update_application': {
          if (!args.id) return textResponse('Error: id is required');
          const application = await updateApplication(args.id, {
            hiring_stage_id: args.hiring_stage_id,
          });
          return textResponse(`Application updated:\n\n${JSON.stringify(application, null, 2)}`);
        }

        case 'delete_application': {
          if (!args.id) return textResponse('Error: id is required');
          const check = checkConfirmation('delete_application', args.confirm);
          if (check.needsConfirmation) return textResponse(check.message);
          await deleteApplication(args.id);
          return textResponse(`Application ${args.id} deleted successfully.`);
        }

        case 'advance_application': {
          if (!args.id) return textResponse('Error: id is required');
          const application = await advanceApplication(args.id);
          return textResponse(`Application advanced:\n\n${JSON.stringify(application, null, 2)}`);
        }

        case 'list_stages': {
          const stages = await listHiringStages();
          return textResponse(
            `Found ${stages.length} hiring stages:\n\n${JSON.stringify(stages, null, 2)}`
          );
        }
      }
    } catch (error) {
      return formatToolError(error);
    }
  }
);

// ============================================================================
// Payroll Tool (Read-only)
// ============================================================================

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

// ============================================================================
// Resources
// ============================================================================

// Organization chart resource
server.registerResource(
  'org_chart',
  'factorial://org-chart',
  {
    description: 'View the organizational hierarchy of employees and their managers',
    mimeType: 'application/json',
  },
  async () => {
    const result = await listEmployees({ page: 1, limit: 500 });
    const employees = result.data;

    interface OrgNode {
      id: number;
      name: string | null;
      email: string | null;
      manager_id: number | null;
      reports: OrgNode[];
    }

    const buildOrgChart = (): OrgNode[] => {
      const employeeMap = new Map<number, OrgNode>();
      employees.forEach(e => {
        employeeMap.set(e.id, {
          id: e.id,
          name: e.full_name,
          email: e.email,
          manager_id: e.manager_id,
          reports: [],
        });
      });

      const roots: OrgNode[] = [];
      employeeMap.forEach(node => {
        if (node.manager_id && employeeMap.has(node.manager_id)) {
          employeeMap.get(node.manager_id)!.reports.push(node);
        } else {
          roots.push(node);
        }
      });

      return roots;
    };

    return {
      contents: [
        {
          uri: 'factorial://org-chart',
          mimeType: 'application/json',
          text: JSON.stringify(buildOrgChart(), null, 2),
        },
      ],
    };
  }
);

// Employee directory resource template
server.registerResource(
  'employee_directory',
  new ResourceTemplate('factorial://employees/{id}', {
    list: async () => {
      const result = await listEmployees({ page: 1, limit: 100 });
      return {
        resources: result.data.map(e => ({
          name: e.full_name || `Employee ${e.id}`,
          uri: `factorial://employees/${e.id}`,
          description: `Employee: ${e.full_name} (${e.email})`,
          mimeType: 'application/json',
        })),
      };
    },
  }),
  {
    description: 'Get detailed information about an employee',
    mimeType: 'application/json',
  },
  async (uri, variables) => {
    const employee = await getEmployee(Number(variables.id));
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(employee, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// Prompts
// ============================================================================

server.registerPrompt(
  'summarize_team',
  {
    description: 'Generate a summary of a team including its members and their roles',
    argsSchema: {
      team_id: z.string().describe('The team ID to summarize'),
    },
  },
  async ({ team_id }) => {
    const team = await getTeam(Number(team_id));
    const members = team.employee_ids || [];
    const employeeDetails = await Promise.all(members.map(id => getEmployee(id)));

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please summarize this team:\n\nTeam: ${team.name}\nDescription: ${team.description || 'N/A'}\nLead IDs: ${team.lead_ids?.join(', ') || 'None'}\n\nMembers (${members.length}):\n${employeeDetails.map(e => `- ${e.full_name} (${e.email})`).join('\n')}`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  'time_off_report',
  {
    description: 'Generate a time off report for an employee',
    argsSchema: {
      employee_id: z.string().describe('The employee ID'),
    },
  },
  async ({ employee_id }) => {
    const employee = await getEmployee(Number(employee_id));
    const leaves = await listLeaves({ employee_id: Number(employee_id) });
    const allowances = await listAllowances({ employee_id: Number(employee_id) });

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a time off report for ${employee.full_name}:\n\nAllowances:\n${JSON.stringify(allowances.data, null, 2)}\n\nRecent Leaves:\n${JSON.stringify(leaves.data.slice(0, 10), null, 2)}`,
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

  // Clear cache on shutdown
  process.on('SIGINT', () => {
    cache.clear();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cache.clear();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
