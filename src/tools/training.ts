/**
 * Training tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
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
} from '../api/index.js';

export function registerTrainingTool(server: McpServer) {
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
}
