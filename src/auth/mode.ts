/**
 * Which credential a request uses, and so who Factorial records as its author.
 *
 * A company API key acts as the company: Factorial has no person to record a
 * write under. A user login (OAuth authorization code flow) acts as the
 * employee who logged in. Writes prefer the login, because a write that is
 * recorded under somebody else is worse than a write that does not happen.
 */

import { ConfigurationError, FactorialError } from '../errors.js';
import { readStoredLogin, type StoredLogin } from './token-store.js';

export type AuthMode = 'auto' | 'api_key' | 'oauth';

/** The command a person runs to log in, as it appears in every message */
export const LOGIN_COMMAND = 'npx -y @t4dhg/mcp-factorial login';

/** No usable login: the person has to run the login command */
export class LoginRequiredError extends FactorialError {
  constructor(message: string) {
    super(message, { isRetryable: false });
    this.name = 'LoginRequiredError';
  }
}

/**
 * FACTORIAL_AUTH_MODE: `auto` (default) writes with a login when one is stored
 * and with the API key otherwise; `api_key` ignores any login; `oauth` never
 * writes with the API key.
 */
export function getAuthMode(): AuthMode {
  const raw = process.env.FACTORIAL_AUTH_MODE?.trim().toLowerCase();
  if (raw === undefined || raw === '') return 'auto';
  if (raw === 'auto' || raw === 'api_key' || raw === 'oauth') return raw;
  throw new ConfigurationError(
    `FACTORIAL_AUTH_MODE must be auto, api_key or oauth, got "${process.env.FACTORIAL_AUTH_MODE}".`
  );
}

/** The stored login this process may use; undefined in api_key mode or when there is none */
export function getUserLogin(): StoredLogin | undefined {
  if (getAuthMode() === 'api_key') return undefined;
  return readStoredLogin();
}

export type WriteActor = { kind: 'user'; login: StoredLogin } | { kind: 'company' };

/**
 * Who the next write will be recorded under.
 *
 * @throws LoginRequiredError in oauth mode when nobody has logged in
 */
export function writeActor(): WriteActor {
  const login = getUserLogin();
  if (login) return { kind: 'user', login };
  if (getAuthMode() === 'oauth') {
    throw new LoginRequiredError(
      'FACTORIAL_AUTH_MODE is oauth and nobody has logged in, so nothing can be written. ' +
        `Run \`${LOGIN_COMMAND}\` in a terminal, then try again. Nothing was written.`
    );
  }
  return { kind: 'company' };
}

/** FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS=true, and nothing looser */
export function companyKeyApprovalsAllowed(): boolean {
  return process.env.FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS?.trim().toLowerCase() === 'true';
}
