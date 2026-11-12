/**
 * Logging in as a user: the OAuth 2.0 authorization code flow with PKCE.
 *
 * The person opens Factorial's authorization page in their browser, signs in
 * and approves; Factorial redirects the browser to a loopback address this
 * process is listening on, with a one-time code; the code is exchanged for an
 * access token and a refresh token that act as that person. Nothing here asks
 * for a company token, and a login that turns out to be one is thrown away:
 * the point of logging in is that writes carry a person's name.
 *
 * This runs as a command in a terminal, not inside the MCP server: a stdio
 * server has no way to show a URL or wait for a browser mid-conversation.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { getBaseUrl } from '../config.js';
import { ConfigurationError, FactorialError } from '../errors.js';
import { getAuthMode, LOGIN_COMMAND } from './mode.js';
import {
  deleteStoredLogin,
  readStoredLogin,
  tokenFilePath,
  writeStoredLogin,
  type StoredLogin,
} from './token-store.js';
import { applyTokenResponse, oauthEndpoints, requestToken } from './user-token.js';

export interface LoginSettings {
  clientId: string;
  redirectUri: string;
  /** Space-separated; undefined leaves the choice to the OAuth application */
  scopes: string | undefined;
}

const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:53682/callback';

/** What the login needs, from the environment */
export function loginSettings(): LoginSettings {
  const clientId = process.env.FACTORIAL_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new ConfigurationError(
      'FACTORIAL_OAUTH_CLIENT_ID is not set. Create an OAuth application in Factorial ' +
        '(Settings, Advanced configuration, OAuth applications) with the redirect URI ' +
        `${DEFAULT_REDIRECT_URI}, and set FACTORIAL_OAUTH_CLIENT_ID to its client id.`
    );
  }
  return {
    clientId,
    redirectUri: process.env.FACTORIAL_OAUTH_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI,
    scopes: process.env.FACTORIAL_OAUTH_SCOPES?.trim() || undefined,
  };
}

/** A PKCE verifier and its S256 challenge */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** The page the person opens. No resource_owner_type: that would ask for a company token. */
export function buildAuthorizeUrl(
  settings: LoginSettings,
  state: string,
  challenge: string
): string {
  const url = new URL(oauthEndpoints().authorize);
  url.searchParams.set('client_id', settings.clientId);
  url.searchParams.set('redirect_uri', settings.redirectUri);
  url.searchParams.set('response_type', 'code');
  if (settings.scopes) url.searchParams.set('scope', settings.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

interface Identity {
  employee_id: string | null;
  name: string | null;
  email: string | null;
}

/** Who a token acts as, from /api_public/credentials */
async function fetchIdentity(accessToken: string): Promise<Identity> {
  const response = await fetch(`${getBaseUrl()}/api_public/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new FactorialError(
      `Factorial would not say who the new token belongs to (HTTP ${response.status}). ` +
        'The OAuth application may be missing the read scope.'
    );
  }
  const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const credential = body.data?.[0] ?? {};
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;
  const id = credential.employee_id;
  const joined = [text(credential.first_name), text(credential.last_name)]
    .filter(Boolean)
    .join(' ');
  return {
    employee_id: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
    name: text(credential.full_name) ?? (joined || null),
    email: text(credential.email) ?? text(credential.login_email),
  };
}

/** Exchange the code, find out who it is, and store the login */
export async function completeLogin(
  settings: LoginSettings,
  code: string,
  verifier: string
): Promise<StoredLogin> {
  const response = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: settings.redirectUri,
    client_id: settings.clientId,
    code_verifier: verifier,
  });
  if (!response.refresh_token) {
    throw new FactorialError(
      'Factorial issued an access token with no refresh token, so the login would end within ' +
        'the hour. Nothing was stored.'
    );
  }
  const identity = await fetchIdentity(response.access_token);
  if (identity.employee_id === null || !/^[1-9]\d*$/.test(identity.employee_id)) {
    throw new FactorialError(
      'Factorial issued a company token, not a user token: it names no employee, so writes ' +
        'made with it would not be recorded under you. Nothing was stored. Log in as an ' +
        'employee of the company rather than authorizing on behalf of the company.'
    );
  }
  const login = applyTokenResponse(
    {
      version: 1,
      client_id: settings.clientId,
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      expires_at: 0,
      scope: null,
      employee_id: identity.employee_id,
      employee_name: identity.name,
      email: identity.email,
      obtained_at: new Date().toISOString(),
    },
    response
  );
  writeStoredLogin(login);
  return login;
}

function sameState(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const page = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui;margin:3rem"><h1>${title}</h1><p>${body}</p></body>`;

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

/** True when this process can listen for the redirect itself */
export function isLoopbackRedirect(redirectUri: string): boolean {
  const url = new URL(redirectUri);
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
}

/**
 * Listen on the loopback redirect address for the browser coming back.
 * `ready` resolves once the listener is up; `code` resolves with the
 * authorization code, or rejects on a refusal or a timeout. A request that does
 * not carry this login's state is answered with an error and otherwise ignored.
 */
export function waitForCallback(
  redirectUri: string,
  state: string
): { ready: Promise<void>; code: Promise<string> } {
  const target = new URL(redirectUri);
  let settle!: { resolve: (code: string) => void; reject: (error: Error) => void };
  const code = new Promise<string>((resolve, reject) => (settle = { resolve, reject }));

  const server = createServer((request, response) => {
    let outcome: (() => void) | undefined;
    const finish = () => {
      if (!outcome) return;
      server.close();
      server.closeAllConnections();
      outcome();
    };
    const respond = (status: number, html: string) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html, finish);
    };
    let url: URL;
    try {
      url = new URL(request.url ?? '/', redirectUri);
    } catch {
      respond(400, page('Bad request', 'This address only receives the Factorial login redirect.'));
      return;
    }
    if (url.pathname !== target.pathname) {
      respond(404, page('Not found', 'This address only receives the Factorial login redirect.'));
      return;
    }
    // Anything can reach a loopback port, including a page open in the same
    // browser. A request without this login's state is refused and the wait
    // goes on: it can neither supply a code nor end the login.
    if (!sameState(url.searchParams.get('state'), state)) {
      respond(400, page('Login failed', 'This redirect does not belong to the login in progress.'));
      return;
    }
    const error = url.searchParams.get('error');
    const received = url.searchParams.get('code');
    if (error || !received) {
      const description = url.searchParams.get('error_description');
      outcome = () =>
        settle.reject(
          new FactorialError(
            `Factorial did not authorize the login (${error ?? 'no code'}` +
              `${description ? `: ${description}` : ''}).`
          )
        );
      respond(400, page('Login failed', 'Factorial did not authorize the login.'));
      return;
    }
    outcome = () => settle.resolve(received);
    respond(200, page('Logged in', 'You can close this tab and return to the terminal.'));
  });

  const timer = setTimeout(() => {
    server.close();
    server.closeAllConnections();
    settle.reject(new FactorialError('The login timed out waiting for the browser.'));
  }, CALLBACK_TIMEOUT_MS);
  timer.unref();
  void code.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer)
  );

  const ready = new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      const failure = new FactorialError(
        `Could not listen on ${target.host} for the login redirect (${error.code ?? error.message}). ` +
          'Free that port, or set FACTORIAL_OAUTH_REDIRECT_URI to another loopback address ' +
          'registered on the OAuth application.'
      );
      settle.reject(failure);
      reject(failure);
    });
    const hostname = target.hostname === '[::1]' ? '::1' : target.hostname;
    server.listen(Number(target.port || 80), hostname, () => resolve());
  });

  return { ready, code };
}

/** The code from what a person pasted: the whole redirect URL, or the code itself */
export function parseRedirect(input: string, state: string): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new FactorialError('No authorization code was given.');
  let url: URL | undefined;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (!sameState(url.searchParams.get('state'), state)) {
    throw new FactorialError(
      'The state did not match the one this login started with, so that redirect did not ' +
        'come from it.'
    );
  }
  const code = url.searchParams.get('code');
  if (!code) throw new FactorialError('No authorization code was found in that address.');
  return code;
}

/** Open a URL in the default browser; failure is fine, the URL is printed as well */
export function openInBrowser(url: string): void {
  if (!/^https?:\/\//i.test(url)) {
    throw new ConfigurationError('Only an http or https address can be opened in the browser.');
  }
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? // No shell: the URL is one argument and nothing in it is interpreted.
          ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // No browser to open; the person has the printed URL.
  }
}

export interface LoginIo {
  print: (line: string) => void;
  openBrowser: (url: string) => void;
  readLine: (prompt: string) => Promise<string>;
}

const who = (login: StoredLogin): string =>
  `${login.employee_name ?? 'an employee'} (employee ${login.employee_id})`;

/** The login command */
export async function runLogin(io: LoginIo): Promise<StoredLogin> {
  const settings = loginSettings();
  const { verifier, challenge } = createPkce();
  const state = randomBytes(24).toString('base64url');
  const authorizeUrl = buildAuthorizeUrl(settings, state, challenge);

  let code: string;
  if (isLoopbackRedirect(settings.redirectUri)) {
    const waiting = waitForCallback(settings.redirectUri, state);
    await waiting.ready;
    io.print('Opening Factorial in your browser. If it does not open, visit:');
    io.print(`\n  ${authorizeUrl}\n`);
    io.print('Sign in as yourself and approve the access. Waiting for the browser...');
    io.openBrowser(authorizeUrl);
    code = await waiting.code;
  } else {
    io.print('Open this address, sign in as yourself and approve the access:');
    io.print(`\n  ${authorizeUrl}\n`);
    io.openBrowser(authorizeUrl);
    code = parseRedirect(
      await io.readLine('Paste the address your browser was sent to afterwards: '),
      state
    );
  }

  const login = await completeLogin(settings, code, verifier);
  io.print(`Logged in as ${who(login)}.`);
  io.print('Writes made through this server are now recorded in Factorial under this user.');
  io.print(`The login is stored in ${tokenFilePath()}, readable by you only.`);
  return login;
}

/** The logout command: revoke the refresh token, then delete the file whatever happened */
export async function runLogout(io: Pick<LoginIo, 'print'>): Promise<void> {
  let login: StoredLogin | undefined;
  try {
    login = readStoredLogin();
  } catch {
    // An unreadable login is still removed below.
  }
  if (!login) {
    io.print(deleteStoredLogin() ? 'Removed an unreadable login.' : 'No login to remove.');
    return;
  }
  let revoked = false;
  try {
    const form = new URLSearchParams({ client_id: login.client_id, token: login.refresh_token });
    const secret = process.env.FACTORIAL_OAUTH_CLIENT_SECRET?.trim();
    if (secret) form.set('client_secret', secret);
    const response = await fetch(oauthEndpoints().revoke, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    revoked = response.ok;
  } catch {
    // Unreachable or refused: the file is removed all the same.
  }
  deleteStoredLogin();
  io.print(
    revoked
      ? 'Logged out: the token was revoked and the stored login removed.'
      : 'Logged out: the stored login was removed, but the token could not be revoked at ' +
          'Factorial. It stops working within the hour unless it is refreshed, which nothing ' +
          'on this machine can do any more.'
  );
}

/** The status command: who writes are recorded under, without showing a credential */
export function describeLogin(): string {
  const lines: string[] = [];
  const mode = getAuthMode();
  const login = readStoredLogin();
  const hasKey = Boolean(process.env.FACTORIAL_API_KEY);

  if (login && mode !== 'api_key') {
    lines.push(`Logged in as ${who(login)}.`);
    lines.push('Writes are recorded in Factorial under this user.');
    lines.push(
      hasKey
        ? 'Reads use the company API key, which sees the whole company.'
        : 'Reads use the login too, and see what this user may see.'
    );
    if (login.scope) lines.push(`Scopes: ${login.scope}`);
  } else {
    if (login) {
      lines.push(`A login for ${who(login)} is stored but FACTORIAL_AUTH_MODE is api_key.`);
    } else {
      lines.push('Not logged in.');
    }
    if (mode === 'oauth') {
      lines.push(`Nothing can be written until you run \`${LOGIN_COMMAND}\`.`);
    } else if (hasKey) {
      lines.push(
        "Writes are recorded in Factorial under the company API key's account, not under " +
          `you. Run \`${LOGIN_COMMAND}\` to have them recorded under your own user.`
      );
    } else {
      lines.push(`No credential is configured. Set FACTORIAL_API_KEY or run \`${LOGIN_COMMAND}\`.`);
    }
  }
  lines.push(`Login file: ${tokenFilePath()}`);
  return lines.join('\n');
}
