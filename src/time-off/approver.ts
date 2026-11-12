/**
 * Who a leave request is routed to, and whether the caller may decide it.
 *
 * A pending leave is pending for one person: the time-off approver named on
 * the employee's record (`timeoff_manager_id`). The leave itself does not carry
 * that, and a company API key is allowed to approve or reject any leave, so
 * without this module "every pending request" and "every request awaiting my
 * decision" look identical to a client.
 *
 * The caller is the employee who logged in, or under a company API key the
 * employee in FACTORIAL_EMPLOYEE_ID: /api_public/credentials reports no
 * employee for a company key. With neither the caller is unknown, and nothing
 * here guesses.
 *
 * A decision is also somebody's, in Factorial's own record. Under a company
 * API key it would be recorded under the key's account rather than the person
 * who took it, so it is refused unless the operator has allowed that.
 *
 * This is not a third confirmation gate. It is a precondition that refuses,
 * and its one exception (deciding on another approver's behalf) goes through
 * the existing token gate in attendance/gate.ts.
 */

import { getEmployee, listAllEmployees } from '../api/employees.js';
import { getLeave, type ApproverOverride } from '../api/time-off.js';
import { getConfiguredEmployeeId, resolveEmployeeName } from '../attendance/identity.js';
import { payloadFingerprint } from '../attendance/gate.js';
import {
  companyKeyApprovalsAllowed,
  LOGIN_COMMAND,
  LoginRequiredError,
  writeActor,
} from '../auth/mode.js';
import type { Employee, Leave } from '../schemas.js';

/** The approver fields added to a leave in list_leaves and get_leave */
export interface LeaveRouting {
  /** The employee's time-off approver; null when their record names none or it could not be read */
  timeoff_manager_id: string | null;
  timeoff_manager_name: string | null;
  /** true or false when it can be told; null when the caller or the employee is unknown */
  routed_to_me: boolean | null;
}

/** The caller's employee id as the API serialises ids; undefined when unset */
export function getCallerEmployeeId(): string | undefined {
  const configured = getConfiguredEmployeeId();
  return configured === undefined ? undefined : String(configured);
}

function displayName(employee: Employee | undefined): string | null {
  if (!employee) return null;
  const name =
    employee.full_name || `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim();
  return name || null;
}

/** "Name (employee 5)", or "employee 5" when no name is known */
function label(id: string, name: string | null): string {
  return name ? `${name} (employee ${id})` : `employee ${id}`;
}

/** Every employee by id, from one cached read */
export async function loadEmployeeDirectory(): Promise<Map<string, Employee>> {
  const employees = await listAllEmployees();
  return new Map(employees.map(employee => [String(employee.id), employee]));
}

/** Route one leave using an already-loaded directory */
export function routeLeave(
  leave: Pick<Leave, 'employee_id'>,
  directory: Map<string, Employee>,
  callerId: string | undefined
): LeaveRouting {
  const employee = directory.get(String(leave.employee_id));
  if (!employee) {
    return { timeoff_manager_id: null, timeoff_manager_name: null, routed_to_me: null };
  }
  const approverId = employee.timeoff_manager_id ?? null;
  return {
    timeoff_manager_id: approverId,
    timeoff_manager_name: approverId ? displayName(directory.get(approverId)) : null,
    routed_to_me: callerId === undefined ? null : approverId === callerId,
  };
}

/** Ids of the employees whose time-off approver is the given employee */
export function reportsOf(directory: Map<string, Employee>, approverId: string): string[] {
  return [...directory.values()]
    .filter(employee => employee.timeoff_manager_id === approverId)
    .map(employee => String(employee.id));
}

async function nameOrNull(employeeId: string): Promise<string | null> {
  try {
    return await resolveEmployeeName(Number(employeeId));
  } catch {
    return null;
  }
}

/** Route one leave on its own, for get_leave; unknown rather than failing the read */
export async function routeSingleLeave(leave: Leave): Promise<LeaveRouting> {
  let employee: Employee;
  try {
    employee = await getEmployee(Number(leave.employee_id));
  } catch {
    return { timeoff_manager_id: null, timeoff_manager_name: null, routed_to_me: null };
  }
  const approverId = employee.timeoff_manager_id ?? null;
  const callerId = getCallerEmployeeId();
  return {
    timeoff_manager_id: approverId,
    timeoff_manager_name: approverId ? await nameOrNull(approverId) : null,
    routed_to_me: callerId === undefined ? null : approverId === callerId,
  };
}

/** An override that passed the check and still has to pass the token gate */
export interface PendingOverride extends ApproverOverride {
  /** The employee whose leave it is */
  employeeId: number;
  /** Digest of everything the override decides and records */
  fingerprint: string;
  /** What the token gate shows before anything is written */
  preview: string;
}

export type ApproverCheck =
  { allowed: false; message: string } | { allowed: true; override?: PendingOverride };

export interface ApproverCheckOptions {
  /** override_approver */
  override?: boolean;
  /** override_reason */
  reason?: string;
}

const OVERRIDE_HINT =
  "The override exists only for when you have been asked to act on that approver's behalf: " +
  'repeat the call with override_approver: true and an override_reason saying who asked and ' +
  'why. That returns a preview and a confirmation token before anything is written.';

const NO_APPROVER_HINT =
  "The override exists only for when you have been asked to act on an approver's behalf, or " +
  'when the decision is yours because nobody else is assigned: repeat the call with ' +
  'override_approver: true and an override_reason saying why it falls to you. That returns a ' +
  'preview and a confirmation token before anything is written.';

/**
 * Decide whether the caller may approve or reject a leave.
 *
 * Reads the leave and its employee afresh. Allowed outright when the
 * employee's approver is the caller. Otherwise refused with the approver
 * named, unless the caller overrides with a reason, in which case the result
 * carries what the token gate needs.
 */
export async function checkLeaveApprover(
  action: 'approve' | 'reject',
  leaveId: number,
  options: ApproverCheckOptions = {}
): Promise<ApproverCheck> {
  // Who Factorial would record the decision under comes first: it needs no
  // read, and no override or confirmation changes the answer.
  let actor;
  try {
    actor = writeActor();
  } catch (error) {
    if (error instanceof LoginRequiredError) {
      return { allowed: false, message: `Refused: ${error.message}` };
    }
    throw error;
  }
  if (actor.kind === 'company' && !companyKeyApprovalsAllowed()) {
    const decision = action === 'approve' ? 'approval' : 'rejection';
    return {
      allowed: false,
      message:
        'Refused: this server is using a company API key, so Factorial would record this ' +
        `${decision} under the company API key's account, not under you. A decision on ` +
        "someone's leave should carry the name of the person who took it. Nothing was " +
        `written.\n\nLog in as yourself with \`${LOGIN_COMMAND}\` in a terminal and repeat ` +
        'the call: the decision is then recorded under your own user. To decide under the ' +
        "company key anyway, the server's operator can set " +
        'FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS=true in its environment; that is a setting, ' +
        'not a parameter of this tool, and every such decision still says who it was ' +
        'recorded under.',
    };
  }

  const reason = options.reason?.trim() ?? '';
  // Validate before reading anything, and long before a token could be minted.
  if (options.override && reason === '') {
    return {
      allowed: false,
      message:
        'Error: override_reason is required with override_approver: say who asked you to ' +
        `${action} this request and why. Nothing was written.`,
    };
  }

  const leave = await getLeave(leaveId);
  const employee = await getEmployee(Number(leave.employee_id), { fresh: true });
  const approverId = employee.timeoff_manager_id ?? null;
  const callerId = getCallerEmployeeId() ?? null;

  if (callerId !== null && approverId === callerId) return { allowed: true };

  const employeeLabel = label(
    String(leave.employee_id),
    leave.employee_full_name || displayName(employee)
  );
  const dates =
    leave.finish_on === leave.start_on ? leave.start_on : `${leave.start_on} to ${leave.finish_on}`;
  const subject = `leave ${leave.id} of ${employeeLabel}, ${dates}`;
  const approverLabel = approverId ? label(approverId, await nameOrNull(approverId)) : null;
  // An unidentified caller can neither be the approver nor override one: the
  // override records who took the decision, and there would be nobody to record.
  if (callerId === null) {
    return {
      allowed: false,
      message:
        'Refused: nobody has logged in and FACTORIAL_EMPLOYEE_ID is not set, so the server ' +
        `does not know who you are and cannot tell whether ${subject} is yours to decide. ` +
        (approverLabel
          ? `It is routed to ${approverLabel}. `
          : 'Its employee has no time-off approver on record. ') +
        `Nothing was written.\n\nLog in as yourself with \`${LOGIN_COMMAND}\` in a ` +
        'terminal, or set FACTORIAL_EMPLOYEE_ID to your own employee id in the ' +
        "server's environment, and try again. No leave can be approved or rejected, with or " +
        'without an override, until the server knows who you are.',
    };
  }
  // resolveEmployeeName fails loudly on an id that does not resolve, so a
  // mistyped FACTORIAL_EMPLOYEE_ID is reported rather than acted on.
  const callerLabel = label(callerId, await resolveEmployeeName(Number(callerId)));

  if (!options.override) {
    if (approverLabel === null) {
      return {
        allowed: false,
        message:
          `Refused: ${subject} is not routed to you (${callerLabel}). Its employee has no ` +
          'time-off approver on their record, so the server cannot confirm that the decision ' +
          `is yours. Nothing was written.\n\n${NO_APPROVER_HINT}`,
      };
    }
    return {
      allowed: false,
      message:
        `Refused: ${subject} is routed to ${approverLabel}, not to you (${callerLabel}). ` +
        `Whether to ${action} it is their decision; a credential that would let the call ` +
        `through does not make it yours. Nothing was written.\n\n${OVERRIDE_HINT}`,
    };
  }

  const verb = action === 'approve' ? 'Approve' : 'Reject';
  const preview =
    `${verb} ${subject}, ` +
    (approverLabel
      ? `on behalf of its approver ${approverLabel}.`
      : 'which has no time-off approver on record.') +
    `\nYou (${callerLabel}) are not this request's approver.\nReason given: ${reason}`;

  return {
    allowed: true,
    override: {
      approverId,
      callerId,
      reason,
      employeeId: Number(leave.employee_id),
      preview,
      // Everything the decision writes or records, plus the state it was
      // previewed against, so a token cannot confirm a different decision.
      fingerprint: payloadFingerprint({
        action,
        // A preview made under one credential cannot confirm a write under another.
        recordedUnder: actor.kind === 'user' ? `employee ${actor.login.employee_id}` : 'company',
        leaveId: leave.id,
        employeeId: leave.employee_id,
        approverId,
        callerId,
        reason,
        approved: leave.approved,
        start_on: leave.start_on,
        finish_on: leave.finish_on,
      }),
    },
  };
}
