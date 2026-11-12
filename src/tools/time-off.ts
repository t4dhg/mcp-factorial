/**
 * Time Off tool registration
 *
 * Safety model for decisions: a leave is approved or rejected by its own
 * time-off approver. checkLeaveApprover (src/time-off/approver.ts) refuses a
 * leave routed to anyone else, and its one exception, deciding on another
 * approver's behalf, goes through the token gate requireTargetConfirmation.
 * checkConfirmation('reject_leave') remains the static policy gate on reject.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { checkConfirmation } from './shared.js';
import { textResponse, refusalResponse, formatToolError } from '../tool-utils.js';
import { formatPaginationInfo } from '../pagination.js';
import {
  listLeaves,
  listPendingLeaves,
  getLeave,
  listLeaveTypes,
  getLeaveType,
  listAllowances,
  createLeave,
  updateLeave,
  cancelLeave,
  approveLeave,
  rejectLeave,
} from '../api/index.js';
import { resolveEmployeeName } from '../attendance/identity.js';
import { requireTargetConfirmation } from '../attendance/gate.js';
import {
  checkLeaveApprover,
  getCallerEmployeeId,
  loadEmployeeDirectory,
  reportsOf,
  routeLeave,
  routeSingleLeave,
  type LeaveRouting,
} from '../time-off/approver.js';
import type { Employee, Leave } from '../schemas.js';

/** One list row: the leave's own fields, then who decides it */
function leaveRow(leave: Leave, routing: LeaveRouting, directory: Map<string, Employee>) {
  return {
    id: leave.id,
    employee_id: leave.employee_id,
    employee_name:
      leave.employee_full_name ?? directory.get(String(leave.employee_id))?.full_name ?? null,
    leave_type_id: leave.leave_type_id,
    start_on: leave.start_on,
    finish_on: leave.finish_on,
    half_day: leave.half_day,
    // null while the request is pending
    approved: leave.approved,
    deleted_at: leave.deleted_at,
    ...routing,
  };
}

const requests = (n: number) => (n === 1 ? 'request is' : 'requests are');

/** Say which of the pending rows await the caller and which belong to someone else */
function routingNote(rows: Array<ReturnType<typeof leaveRow>>, callerKnown: boolean): string {
  const pending = rows.filter(row => row.approved === null && row.deleted_at === null);
  if (pending.length === 0) return '';
  if (!callerKnown) {
    return (
      '\n\nrouted_to_me is null on every row: nobody has logged in and FACTORIAL_EMPLOYEE_ID is ' +
      'not set, so the server does not know who you are. Log in, or set it to your own ' +
      'employee id, to see which requests await your decision. Until then, do not approve or ' +
      'reject on the strength of this list.'
    );
  }
  const mine = pending.filter(row => row.routed_to_me === true);
  const others = pending.filter(row => row.routed_to_me !== true);
  const parts: string[] = [];
  if (mine.length > 0) {
    parts.push(
      `${mine.length} pending ${requests(mine.length)} routed to you: ${mine.map(r => r.id).join(', ')}.`
    );
  }
  if (others.length > 0) {
    parts.push(
      `${others.length} pending ${requests(others.length)} not routed to you: ` +
        `${others.map(r => r.id).join(', ')}. Those are for their own approver ` +
        '(timeoff_manager_name) to decide; approve and reject refuse them.'
    );
  }
  return `\n\n${parts.join(' ')}`;
}

export function registerTimeOffTool(server: McpServer) {
  server.registerTool(
    'factorial_time_off',
    {
      title: 'FactorialHR Time Off',
      description:
        'Manage leave requests: list, get, create, update, cancel, approve, reject, view types and ' +
        'allowances. Approve or reject only requests whose time-off approver is you: pending does ' +
        'not mean pending for you, and a credential that would let a decision through does not ' +
        "make another approver's request yours. You are the employee who logged in, or under a " +
        'company API key the employee in FACTORIAL_EMPLOYEE_ID. ' +
        "list_leaves and get_leave show each leave's approver (timeoff_manager_id, " +
        'timeoff_manager_name) and routed_to_me; list_leaves with pending_for_me: true returns ' +
        'exactly the requests awaiting your decision. approve and reject refuse a leave routed to ' +
        'someone else, or any leave when the server does not know who you are. A decision is ' +
        'recorded in Factorial under whoever made it, so approve and reject are refused under a ' +
        'company API key unless the operator has set FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS=true.',
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
        start_on: z
          .string()
          .optional()
          .describe(
            'Start date (YYYY-MM-DD). For list_leaves: leaves overlapping a window from this date'
          ),
        finish_on: z
          .string()
          .optional()
          .describe(
            'End date (YYYY-MM-DD). For list_leaves: leaves overlapping a window to this date'
          ),
        half_day: z.enum(['all_day', 'start', 'finish']).optional().describe('Half day option'),
        description: z.string().optional().describe('Leave description'),
        page: z.number().optional().default(1).describe('Page number'),
        limit: z.number().optional().default(100).describe('Items per page'),
        confirm: z.boolean().optional().describe('Confirm cancel/reject'),
        pending_for_me: z
          .boolean()
          .optional()
          .describe(
            'For list_leaves: only leaves still awaiting a decision whose time-off approver is ' +
              'you (the logged-in user, or FACTORIAL_EMPLOYEE_ID). Reads every page, so page ' +
              'and limit are ignored; ' +
              'start_on, finish_on and employee_id still narrow it'
          ),
        override_approver: z
          .boolean()
          .optional()
          .describe(
            'For approve/reject: decide a leave that is not routed to you. Only when you have ' +
              "been asked to act on that approver's behalf, never because the leave is merely " +
              'pending. Needs override_reason. The first call writes nothing and returns a ' +
              'preview and a confirmation_token'
          ),
        override_reason: z
          .string()
          .max(500)
          .optional()
          .describe(
            'Required with override_approver: who asked you to decide this request and why. ' +
              'Recorded in the audit log; not sent to Factorial or to the employee'
          ),
        confirmation_token: z
          .string()
          .optional()
          .describe(
            'Token from an override_approver preview; repeat the same arguments with it to execute'
          ),
      },
    },
    async args => {
      try {
        switch (args.action) {
          case 'list_leaves': {
            const callerId = getCallerEmployeeId();

            if (args.pending_for_me) {
              if (callerId === undefined) {
                return refusalResponse(
                  'Error: pending_for_me needs to know who you are: nobody has logged in and ' +
                    'FACTORIAL_EMPLOYEE_ID is not set. Log in, or set it to your own employee ' +
                    "id in the server's environment. Nothing was read."
                );
              }
              const me = `${await resolveEmployeeName(Number(callerId))} (employee ${callerId})`;
              const directory = await loadEmployeeDirectory();
              let reportIds = reportsOf(directory, callerId);
              if (args.employee_id) {
                reportIds = reportIds.filter(id => id === String(args.employee_id));
              }
              if (reportIds.length === 0) {
                return textResponse(
                  args.employee_id
                    ? `Employee ${args.employee_id} does not have you, ${me}, as their time-off ` +
                        'approver, so none of their requests is pending for you.'
                    : `No employee has you, ${me}, as their time-off approver, so no request ` +
                        'is pending for you.'
                );
              }
              const leaves = await listPendingLeaves(reportIds, args.start_on, args.finish_on);
              const rows = leaves.map(l =>
                leaveRow(l, routeLeave(l, directory, callerId), directory)
              );
              return textResponse(
                `Found ${rows.length} pending ${rows.length === 1 ? 'leave' : 'leaves'} routed to ` +
                  `you, ${me} (every page read):\n\n${JSON.stringify(rows, null, 2)}`
              );
            }

            const result = await listLeaves({
              employee_ids: args.employee_id ? [args.employee_id] : undefined,
              from: args.start_on,
              to: args.finish_on,
              page: args.page,
              limit: args.limit,
            });
            const directory = await loadEmployeeDirectory();
            const summary = result.data.map(l =>
              leaveRow(l, routeLeave(l, directory, callerId), directory)
            );
            const pending = result.data.filter(l => l.approved !== true && l.deleted_at === null);
            const pendingNote =
              pending.length > 0
                ? `\n\n${pending.length} pending or unapproved: ${pending
                    .map(
                      l => `${l.start_on}${l.finish_on !== l.start_on ? ` to ${l.finish_on}` : ''}`
                    )
                    .join(', ')}. These do not block attendance writes and are not counted as ` +
                  'leave by gaps, audit or the planner. A pending record on a date that already ' +
                  'has approved leave is usually a duplicate worth cleaning up.'
                : '';
            return textResponse(
              `Found ${result.data.length} leaves (${formatPaginationInfo(result.meta)}):\n\n${JSON.stringify(summary, null, 2)}${pendingNote}${routingNote(summary, callerId !== undefined)}`
            );
          }

          case 'get_leave': {
            if (!args.id) return textResponse('Error: id is required');
            const leave = await getLeave(args.id);
            const routing = await routeSingleLeave(leave);
            return textResponse(
              `Leave details:\n\n${JSON.stringify({ ...leave, ...routing }, null, 2)}`
            );
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
            const check = await checkLeaveApprover('approve', args.id, {
              override: args.override_approver,
              reason: args.override_reason,
            });
            if (!check.allowed) return refusalResponse(check.message);
            if (check.override) {
              const gate = requireTargetConfirmation({
                operation: 'approve_leave',
                employeeId: check.override.employeeId,
                fingerprint: check.override.fingerprint,
                preview: check.override.preview,
                token: args.confirmation_token,
                always: true,
                entityType: 'leave',
                previewOperation: 'approve',
              });
              if (!gate.proceed) return textResponse(gate.message);
            }
            const leave = await approveLeave(args.id, undefined, check.override);
            return textResponse(
              `Leave approved${check.override ? " on its approver's behalf" : ''}:\n\n${JSON.stringify(leave, null, 2)}`
            );
          }

          case 'reject': {
            if (!args.id) return textResponse('Error: id is required');
            // The approver check comes first: a request that cannot succeed
            // should not be asked to confirm.
            const routing = await checkLeaveApprover('reject', args.id, {
              override: args.override_approver,
              reason: args.override_reason,
            });
            if (!routing.allowed) return refusalResponse(routing.message);
            if (routing.override) {
              // The token is the stronger confirmation, so it stands in for confirm: true.
              const gate = requireTargetConfirmation({
                operation: 'reject_leave',
                employeeId: routing.override.employeeId,
                fingerprint: routing.override.fingerprint,
                preview: routing.override.preview,
                token: args.confirmation_token,
                always: true,
                entityType: 'leave',
                previewOperation: 'reject',
              });
              if (!gate.proceed) return textResponse(gate.message);
            } else {
              const check = checkConfirmation('reject_leave', args.confirm);
              if (check.needsConfirmation) return textResponse(check.message);
            }
            const leave = await rejectLeave(args.id, undefined, routing.override);
            return textResponse(
              `Leave rejected${routing.override ? " on its approver's behalf" : ''}:\n\n${JSON.stringify(leave, null, 2)}`
            );
          }
        }
      } catch (error) {
        return formatToolError(error);
      }
    }
  );
}
