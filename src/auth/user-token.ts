/**
 * The access token of the logged-in user, refreshed when it runs out.
 *
 * A user access token lasts one hour. Refreshing it returns a new refresh
 * token and retires the old one, so the new pair is written back to the store
 * before anything else happens, and only one process refreshes at a time: two
 * processes refreshing with the same token would leave one of them holding a
 * dead one.
 *
 * A refresh that Factorial rejects means the login is over. That is reported
 * as such, and the caller is never handed a different credential in its place.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { debug } from '../config.js';
import { FactorialError } from '../errors.js';
import { getUserLogin, LOGIN_COMMAND, LoginRequiredError } from './mode.js';
import { tokenFilePath, writeStoredLogin, type StoredLogin } from './token-store.js';

const DEFAULT_ENDPOINTS = {
  authorize: 'https://id.factorialhr.com/oauth/authorize',
  token: 'https://id.factorialhr.com/api/oauth/token',
  revoke: 'https://id.factorialhr.com/api/oauth/revoke',
};

/** The Factorial ID endpoints; each can be overridden, for the demo environment */
export function oauthEndpoints(): { authorize: string; token: string; revoke: string } {
  return {
    authorize: process.env.FACTORIAL_OAUTH_AUTHORIZE_URL?.trim() || DEFAULT_ENDPOINTS.authorize,
    token: process.env.FACTORIAL_OAUTH_TOKEN_URL?.trim() || DEFAULT_ENDPOINTS.token,
    revoke: process.env.FACTORIAL_OAUTH_REVOKE_URL?.trim() || DEFAULT_ENDPOINTS.revoke,
  };
}

/** What the token endpoint answers on success */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  /** Seconds the access token lasts */
  expires_in?: number;
  scope?: string;
}

/** The token endpoint refused the request */
export class OAuthTokenError extends FactorialError {
  constructor(
    public readonly status: number,
    /** The OAuth error code, e.g. invalid_grant */
    public readonly code: string | undefined,
    description: string | undefined
  ) {
    super(
      `Factorial refused the token request (${status}${code ? ` ${code}` : ''})` +
        (description ? `: ${description}` : '')
    );
    this.name = 'OAuthTokenError';
  }

  /** True when the grant itself is dead, as opposed to the request having failed */
  get grantIsDead(): boolean {
    return this.code === 'invalid_grant' || this.code === 'invalid_client';
  }
}

/** POST a grant to the token endpoint */
export async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const secret = process.env.FACTORIAL_OAUTH_CLIENT_SECRET?.trim();
  const form = new URLSearchParams(params);
  // A confidential client proves itself with its secret; a public one has none.
  if (secret) form.set('client_secret', secret);

  const response = await fetch(oauthEndpoints().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
    // Without a limit, a stalled request would hold the refresh lock for good.
    signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    let body: { error?: unknown; error_description?: unknown } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Not JSON; the status is all there is to report.
    }
    throw new OAuthTokenError(
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
      typeof body.error_description === 'string' ? body.error_description : undefined
    );
  }

  const data = (await response.json()) as TokenResponse;
  if (typeof data?.access_token !== 'string' || data.access_token === '') {
    throw new FactorialError('Factorial answered the token request without an access token.');
  }
  return data;
}

const TOKEN_REQUEST_TIMEOUT_MS = 15 * 1000;

/** Access tokens are documented to last an hour; used when the response does not say */
const DEFAULT_LIFETIME_SECONDS = 3600;

/** Fold a token response into a login */
export function applyTokenResponse(login: StoredLogin, response: TokenResponse): StoredLogin {
  return {
    ...login,
    access_token: response.access_token,
    refresh_token: response.refresh_token || login.refresh_token,
    expires_at: Date.now() + (response.expires_in ?? DEFAULT_LIFETIME_SECONDS) * 1000,
    scope: response.scope ?? login.scope,
  };
}

/** Refresh this long before the token runs out, so a request never starts with a dying one */
const REFRESH_MARGIN_MS = 60 * 1000;
// Longer than a token request can take, so a live holder is never mistaken for a dead one.
const LOCK_WAIT_MS = 20 * 1000;
const LOCK_STALE_MS = 30 * 1000;
const LOCK_POLL_MS = 100;

const usable = (login: StoredLogin, rejected?: string): boolean =>
  login.access_token !== rejected && login.expires_at > Date.now() + REFRESH_MARGIN_MS;

/** Hold the refresh lock while `work` runs; a lock left by a dead process is taken over */
async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const lockPath = `${tokenFilePath()}.lock`;
  // Written into the lock, so that only its owner ever removes it.
  const owner = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const holder = (): string | undefined => {
    try {
      return readFileSync(lockPath, 'utf8');
    } catch {
      return undefined;
    }
  };
  const deadline = performance.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      writeFileSync(lockPath, owner, { flag: 'wx', mode: 0o600 });
      break;
    } catch (error) {
      // Only "somebody holds it" is worth waiting for. A directory that cannot
      // be written to will not become writable by trying again.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    let age: number | undefined;
    try {
      // Wall-clock on both sides: the file's time is the filesystem's.
      age = new Date().getTime() - statSync(lockPath).mtimeMs;
    } catch {
      // Released between the two calls.
    }
    if (age !== undefined && age > LOCK_STALE_MS) {
      // Take over only the lock that was just seen to be stale, not one a
      // third process created in the meantime.
      const seen = holder();
      if (seen !== undefined && seen === holder()) rmSync(lockPath, { force: true });
      continue;
    }
    if (performance.now() >= deadline) {
      throw new FactorialError(
        'Another process has been refreshing the Factorial login for too long. Try again.',
        { isRetryable: true }
      );
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
  }
  try {
    return await work();
  } finally {
    if (holder() === owner) rmSync(lockPath, { force: true });
  }
}

const loginRequired = (): LoginRequiredError =>
  new LoginRequiredError(
    'There is no Factorial login for this server to act as. ' +
      `Run \`${LOGIN_COMMAND}\` in a terminal, then try again.`
  );

async function refresh(rejected?: string): Promise<string> {
  return withRefreshLock(async () => {
    // Another process may have refreshed while this one waited for the lock.
    const login = getUserLogin();
    if (!login) throw loginRequired();
    if (usable(login, rejected)) return login.access_token;

    debug('Refreshing the user access token');
    let response: TokenResponse;
    try {
      response = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: login.refresh_token,
        client_id: login.client_id,
      });
    } catch (error) {
      if (error instanceof OAuthTokenError && error.grantIsDead) {
        // A refresh token is spent the moment it is used. If the store moved on
        // while this request was out, another process spent it first and its
        // result is the one to use.
        const current = getUserLogin();
        if (current && current.refresh_token !== login.refresh_token && usable(current, rejected)) {
          return current.access_token;
        }
        throw new LoginRequiredError(
          'Your Factorial login has expired or was revoked, so this server can no longer act ' +
            `as you. Run \`${LOGIN_COMMAND}\` in a terminal to log in again, then try again.`
        );
      }
      throw error;
    }
    const refreshed = applyTokenResponse(login, response);
    writeStoredLogin(refreshed);
    return refreshed.access_token;
  });
}

let inFlight: Promise<string> | undefined;

export interface AccessTokenOptions {
  /** An access token the API has just rejected: never return this one again */
  rejected?: string;
}

/**
 * A valid access token for the logged-in user.
 *
 * @throws LoginRequiredError when nobody has logged in or the login has ended
 */
export async function getUserAccessToken(options: AccessTokenOptions = {}): Promise<string> {
  const login = getUserLogin();
  if (!login) throw loginRequired();
  if (usable(login, options.rejected)) return login.access_token;

  inFlight ??= refresh(options.rejected).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}
