/**
 * ATS (Recruiting) tool registration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
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
} from '../api/index.js';

export function registerAtsTool(server: McpServer) {
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
}
