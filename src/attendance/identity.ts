/**
 * Who "I" am for attendance actions and leave decisions.
 *
 * With a user login it is the employee who logged in: the login records the
 * employee /api_public/credentials reported for the token, and
 * FACTORIAL_EMPLOYEE_ID is ignored. A company-scoped API key carries no
 * employee (the same endpoint returns employee_id null), so there the optional
 * FACTORIAL_EMPLOYEE_ID variable supplies it. Either way it is the default
 * target for every attendance action, and every write aimed at anyone else is
 * treated as aimed at another person by the safety gate in tools/attendance.ts.
 */

import { getEmployee } from '../api/employees.js';
import { getUserLogin } from '../auth/mode.js';

let resolvedNames = new Map<number, string>();

/**
 * The caller's employee id: the logged-in user's, or else a validated
 * FACTORIAL_EMPLOYEE_ID; undefined when neither is there
 */
export function getConfiguredEmployeeId(): number | undefined {
  const login = getUserLogin();
  if (login) {
    if (!/^[1-9]\d*$/.test(login.employee_id)) {
      throw new Error('The stored login names no valid employee. Run the login command again.');
    }
    return Number(login.employee_id);
  }
  const raw = process.env.FACTORIAL_EMPLOYEE_ID;
  if (raw === undefined || raw.trim() === '') return undefined;
  if (!/^[1-9]\d*$/.test(raw.trim())) {
    throw new Error(
      `FACTORIAL_EMPLOYEE_ID must be a positive integer employee id, got "${raw}". ` +
        'Unset it to require employee_id on every attendance action.'
    );
  }
  return Number(raw.trim());
}

/**
 * Resolve the employee an action targets: the explicit argument wins, then the
 * configured default. With neither, the caller must name someone.
 */
export function resolveTargetEmployeeId(explicit: number | undefined): number {
  if (explicit !== undefined) {
    if (!Number.isInteger(explicit) || explicit <= 0) {
      throw new Error('employee_id must be a positive integer');
    }
    return explicit;
  }
  const configured = getConfiguredEmployeeId();
  if (configured === undefined) {
    throw new Error(
      'employee_id is required: FACTORIAL_EMPLOYEE_ID is not set, so there is no default identity.'
    );
  }
  return configured;
}

/** True when the target is the configured identity (never true when unset) */
export function isConfiguredIdentity(employeeId: number): boolean {
  const configured = getConfiguredEmployeeId();
  return configured !== undefined && configured === employeeId;
}

/**
 * Resolve an employee id to a display name through the employees API, cached
 * for the life of the process. Fails loudly when the id does not resolve, so a
 * mistyped FACTORIAL_EMPLOYEE_ID cannot silently write onto a colleague.
 */
export async function resolveEmployeeName(employeeId: number): Promise<string> {
  const cached = resolvedNames.get(employeeId);
  if (cached) return cached;
  let name: string;
  try {
    const employee = await getEmployee(employeeId);
    name = employee.full_name || `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Employee ${employeeId} could not be resolved (${reason}). ` +
        'Check the employee_id argument or the FACTORIAL_EMPLOYEE_ID setting.',
      { cause: error }
    );
  }
  if (!name) name = `employee ${employeeId}`;
  resolvedNames.set(employeeId, name);
  return name;
}

/** Forget resolved names (tests) */
export function clearResolvedNames(): void {
  resolvedNames = new Map();
}
