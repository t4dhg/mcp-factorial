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

import { loadEnv } from '../config.js';

// Load environment variables before other imports
loadEnv();

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { cache } from '../cache.js';
import { textResponse } from '../tool-utils.js';
import { listEmployees, getEmployee, getTeam, listLeaves, listAllowances } from '../api/index.js';

// Tool registration imports
import { CATEGORIES, formatCategory } from './shared.js';
import { registerEmployeesTool } from './employees.js';
import { registerTeamsTool } from './teams.js';
import { registerLocationsTool } from './locations.js';
import { registerContractsTool } from './contracts.js';
import { registerTimeOffTool } from './time-off.js';
import { registerAttendanceTool } from './attendance.js';
import { registerDocumentsTool } from './documents.js';
import { registerJobCatalogTool } from './job-catalog.js';
import { registerProjectsTool } from './projects.js';
import { registerTrainingTool } from './training.js';
import { registerWorkAreasTool } from './work-areas.js';
import { registerAtsTool } from './ats.js';
import { registerPayrollTool } from './payroll.js';
import { registerAttendancePrompts, GUIDE_URI } from '../prompts/attendance.js';

// Keep in step with package.json and server.json; a unit test asserts all three agree.
export const SERVER_VERSION = '11.0.1';

// Create server instance
const server = new McpServer({
  name: 'factorial-hr',
  version: SERVER_VERSION,
});

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
      return textResponse(formatCategory(category));
    }

    const categoryList = Object.entries(CATEGORIES)
      .map(
        ([key, cat]) => `- **factorial_${key}**: ${cat.description} (${cat.actions.length} actions)`
      )
      .join('\n');

    return textResponse(
      `# FactorialHR Tool Categories\n\nUse \`factorial_discover(category: "name")\` for action details.\n\n${categoryList}\n\n**Total: 14 tools covering 117 operations**\n\nFor the registro horario (attendance record) workflows, read the guide resource ${GUIDE_URI} or use the prompts attendance_audit, attendance_fill, attendance_today, attendance_reconcile and attendance_fill_days.`
    );
  }
);

// ============================================================================
// Register All Domain Tools
// ============================================================================

registerEmployeesTool(server);
registerTeamsTool(server);
registerLocationsTool(server);
registerContractsTool(server);
registerTimeOffTool(server);
registerAttendanceTool(server);
registerDocumentsTool(server);
registerJobCatalogTool(server);
registerProjectsTool(server);
registerTrainingTool(server);
registerWorkAreasTool(server);
registerAtsTool(server);
registerPayrollTool(server);

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
      id: string;
      name: string | null;
      email: string | null;
      manager_id: string | null;
      reports: OrgNode[];
    }

    const buildOrgChart = (): OrgNode[] => {
      const employeeMap = new Map<string, OrgNode>();
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
    const employeeDetails = await Promise.all(members.map(id => getEmployee(Number(id))));

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
    const leaves = await listLeaves({ employee_ids: [Number(employee_id)] });
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

// Attendance (registro horario): three prompts and the guide resource
registerAttendancePrompts(server);

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

// Export server for testing
export { server };
