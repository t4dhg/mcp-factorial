/**
 * Projects tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
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
} from '../api/index.js';

export function registerProjectsTool(server: McpServer) {
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
}
