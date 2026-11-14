/**
 * Target-identity confirmation gate, for attendance writes and for deciding a
 * leave on another approver's behalf.
 *
 * The policy gate in tools/shared.ts (checkConfirmation) is static per
 * operation and cannot express "depends on who the target is" or "depends on
 * how many records". This gate can. A first call without a token writes
 * nothing and returns a preview plus a token bound to a fingerprint of what
 * would be written; the confirming call re-derives the fingerprint and
 * refuses if it changed. A `confirm: true` boolean cannot bypass it, because
 * there is no token to pass on a first call.
 */

import { createHash } from 'node:crypto';
import { confirmationManager, type OperationPreview } from '../confirmation.js';
import { ConfirmationExpiredError } from '../errors.js';
import { isConfiguredIdentity } from './identity.js';
import { attributionPreviewNote } from '../auth/attribution.js';
import { LoginRequiredError, writeActor } from '../auth/mode.js';

export interface GateRequest {
  /** Operation name, e.g. 'backfill_shifts' or 'clock_in' */
  operation: string;
  /** Employee the write targets */
  employeeId: number;
  /** Digest of exactly what would be written */
  fingerprint: string;
  /** Human-readable preview that always names the person */
  preview: string;
  /** Token from a previous preview, if the caller is confirming */
  token?: string;
  /** Gate regardless of target (bulk writes) */
  always?: boolean;
  /** What the stored preview describes; a shift being created unless stated */
  entityType?: string;
  previewOperation?: OperationPreview['operation'];
}

export type GateResult = { proceed: true } | { proceed: false; message: string };

/** Stable digest of an arbitrary payload */
export function payloadFingerprint(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Who Factorial would record the write under right now. Part of what a token
 * confirms: a plan previewed as the logged-in user must not be executed with
 * the company API key because the login went away in between.
 */
function recordedUnder(): string {
  try {
    const actor = writeActor();
    return actor.kind === 'user' ? `employee ${actor.login.employee_id}` : 'company';
  } catch (error) {
    if (error instanceof LoginRequiredError) return 'nobody';
    throw error;
  }
}

/** The plan's fingerprint together with the credential it would be written with */
const boundFingerprint = (request: GateRequest): string =>
  payloadFingerprint({ plan: request.fingerprint, recordedUnder: recordedUnder() });

function issue(request: GateRequest, prefix = ''): GateResult {
  const token = confirmationManager.createConfirmation(
    request.operation,
    { fingerprint: boundFingerprint(request), employeeId: request.employeeId },
    {
      operation: request.previewOperation ?? 'create',
      entityType: request.entityType ?? 'shift',
      entityId: request.employeeId,
      entityName: request.preview.split('\n')[0],
      warnings: [],
    }
  );
  // Under a company API key the preview is the last moment to say whose name
  // the write will carry in Factorial.
  const attribution = attributionPreviewNote();
  return {
    proceed: false,
    message:
      `${prefix}${request.preview}\n\n${attribution ? `${attribution}\n\n` : ''}` +
      'Nothing has been written. ' +
      `To proceed, call this action again with the same arguments and confirmation_token: ${token}\n` +
      'The token is valid for 15 minutes and for exactly this plan.',
  };
}

/**
 * Decide whether a write may proceed. Writes aimed at the configured identity
 * pass without a token unless `always` is set; every other write, and every
 * write when the caller is unknown (no login and no FACTORIAL_EMPLOYEE_ID),
 * needs one.
 */
export function requireTargetConfirmation(request: GateRequest): GateResult {
  const gated = request.always === true || !isConfiguredIdentity(request.employeeId);
  if (!gated) return { proceed: true };

  if (!request.token) return issue(request);

  let pending;
  try {
    pending = confirmationManager.confirm(request.token);
  } catch (error) {
    if (error instanceof ConfirmationExpiredError) {
      return issue(
        request,
        'The confirmation token was invalid or had expired. Here is the current plan.\n\n'
      );
    }
    throw error;
  }

  if (
    pending.operation !== request.operation ||
    pending.payload.fingerprint !== boundFingerprint(request)
  ) {
    return issue(
      request,
      'The plan changed between the preview and this call (someone wrote in the meantime, the ' +
        'arguments differ, or the credential the write would use changed). The old token has ' +
        'been discarded. Here is the current plan.\n\n'
    );
  }

  return { proceed: true };
}
