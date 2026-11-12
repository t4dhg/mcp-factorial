import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStoredLogin, tokenFilePath, writeStoredLogin } from '../../../auth/token-store.js';
import {
  buildAuthorizeUrl,
  completeLogin,
  createPkce,
  describeLogin,
  loginSettings,
  openInBrowser,
  parseRedirect,
  runLogin,
  runLogout,
  waitForCallback,
} from '../../../auth/login.js';

const mockFetch = vi.fn();
const TOKEN_URL = 'https://id.factorialhr.com/api/oauth/token';
const REVOKE_URL = 'https://id.factorialhr.com/api/oauth/revoke';
const CREDENTIALS_PATH = '/api_public/credentials';

const json = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

/** A port nothing is listening on */
async function freePort(): Promise<number> {
  return new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/** What a browser does when Factorial redirects it back */
function visit(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get(url, response => {
      let body = '';
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

const userIdentity = {
  data: [
    {
      id: 'access-1',
      company_id: '1',
      employee_id: '2',
      full_name: 'Test Person',
      email: 'person@example.com',
    },
  ],
};
const companyIdentity = { data: [{ id: 'company-1', company_id: '1', employee_id: null }] };

function routeFetch(identity: unknown = userIdentity) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url === TOKEN_URL) {
      return json({
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        expires_in: 3600,
        scope: 'read write time_off',
      });
    }
    if (url === REVOKE_URL) return json({});
    if (String(url).endsWith(CREDENTIALS_PATH)) return json(identity);
    throw new Error(`unrouted ${url}`);
  });
}

const formOf = (url: string): URLSearchParams => {
  const call = mockFetch.mock.calls.find(([u]) => u === url);
  return new URLSearchParams((call?.[1] as RequestInit).body as string);
};

describe('login', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-login-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    process.env.FACTORIAL_OAUTH_CLIENT_ID = 'client-1';
    delete process.env.FACTORIAL_OAUTH_CLIENT_SECRET;
    delete process.env.FACTORIAL_OAUTH_REDIRECT_URI;
    delete process.env.FACTORIAL_OAUTH_SCOPES;
    delete process.env.FACTORIAL_API_KEY;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  describe('settings', () => {
    it('needs the client id of an OAuth application', () => {
      delete process.env.FACTORIAL_OAUTH_CLIENT_ID;
      expect(() => loginSettings()).toThrow(/FACTORIAL_OAUTH_CLIENT_ID is not set/);
    });

    it('defaults to a loopback redirect and no scope parameter', () => {
      expect(loginSettings()).toEqual({
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:53682/callback',
        scopes: undefined,
      });
    });

    it('takes the redirect and the scopes from the environment', () => {
      process.env.FACTORIAL_OAUTH_REDIRECT_URI = 'https://example.test/cb';
      process.env.FACTORIAL_OAUTH_SCOPES = 'read write time_off';
      expect(loginSettings()).toEqual({
        clientId: 'client-1',
        redirectUri: 'https://example.test/cb',
        scopes: 'read write time_off',
      });
    });
  });

  describe('PKCE', () => {
    it('derives the challenge from the verifier with SHA-256', () => {
      const { verifier, challenge } = createPkce();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
      expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    });

    it('never repeats a verifier', () => {
      expect(createPkce().verifier).not.toBe(createPkce().verifier);
    });
  });

  describe('authorize URL', () => {
    it('asks for a user token with PKCE', () => {
      const url = new URL(
        buildAuthorizeUrl(
          {
            clientId: 'client-1',
            redirectUri: 'http://127.0.0.1:53682/callback',
            scopes: 'read write',
          },
          'state-1',
          'challenge-1'
        )
      );
      expect(url.origin + url.pathname).toBe('https://id.factorialhr.com/oauth/authorize');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: 'client-1',
        redirect_uri: 'http://127.0.0.1:53682/callback',
        response_type: 'code',
        scope: 'read write',
        state: 'state-1',
        code_challenge: 'challenge-1',
        code_challenge_method: 'S256',
      });
    });

    it('never asks for a company token', () => {
      const url = buildAuthorizeUrl(
        { clientId: 'client-1', redirectUri: 'http://127.0.0.1:53682/callback', scopes: undefined },
        'state-1',
        'challenge-1'
      );
      expect(url).not.toContain('resource_owner_type');
      expect(new URL(url).searchParams.has('scope')).toBe(false);
    });
  });

  describe('completing a login', () => {
    const settings = {
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:53682/callback',
      scopes: undefined,
    };

    it('exchanges the code with the verifier and stores who logged in', async () => {
      routeFetch();
      const login = await completeLogin(settings, 'code-1', 'verifier-1');

      const form = formOf(TOKEN_URL);
      expect(Object.fromEntries(form)).toEqual({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: 'http://127.0.0.1:53682/callback',
        client_id: 'client-1',
        code_verifier: 'verifier-1',
      });

      const identityCall = mockFetch.mock.calls.find(([u]) => String(u).endsWith(CREDENTIALS_PATH));
      expect((identityCall?.[1] as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer access-new',
      });

      expect(login.employee_id).toBe('2');
      expect(readStoredLogin()).toMatchObject({
        client_id: 'client-1',
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        employee_id: '2',
        employee_name: 'Test Person',
        email: 'person@example.com',
        scope: 'read write time_off',
      });
      if (process.platform !== 'win32') {
        expect(statSync(tokenFilePath()).mode & 0o777).toBe(0o600);
      }
    });

    it('refuses a company token and stores nothing', async () => {
      routeFetch(companyIdentity);
      await expect(completeLogin(settings, 'code-1', 'verifier-1')).rejects.toThrow(
        /company token, not a user token/
      );
      expect(existsSync(tokenFilePath())).toBe(false);
    });

    it('refuses a token response with no refresh token and stores nothing', async () => {
      mockFetch.mockImplementation(async (url: string) =>
        url === TOKEN_URL
          ? json({ access_token: 'access-new', expires_in: 3600 })
          : json(userIdentity)
      );
      await expect(completeLogin(settings, 'code-1', 'verifier-1')).rejects.toThrow(
        /no refresh token/
      );
      expect(existsSync(tokenFilePath())).toBe(false);
    });
  });

  describe('the loopback callback', () => {
    it('hands back the code when the state matches', async () => {
      const port = await freePort();
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const waiting = waitForCallback(redirectUri, 'state-1');
      await waiting.ready;
      const page = await visit(`${redirectUri}?code=code-1&state=state-1`);
      expect(page.status).toBe(200);
      expect(page.body).toContain('You can close this tab');
      expect(await waiting.code).toBe('code-1');
    });

    it('refuses a callback whose state does not match, and keeps waiting for the real one', async () => {
      const port = await freePort();
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const waiting = waitForCallback(redirectUri, 'state-1');
      await waiting.ready;
      const forged = await visit(`${redirectUri}?code=code-forged&state=forged`);
      expect(forged.status).toBe(400);
      expect(forged.body).not.toContain('code-forged');
      const missing = await visit(`${redirectUri}?code=code-forged`);
      expect(missing.status).toBe(400);
      // Another page poking the port cannot end the login or supply the code.
      await visit(`${redirectUri}?code=code-1&state=state-1`);
      expect(await waiting.code).toBe('code-1');
    });

    it('answers a malformed request line without falling over', async () => {
      const port = await freePort();
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const waiting = waitForCallback(redirectUri, 'state-1');
      await waiting.ready;
      expect((await visit(`http://127.0.0.1:${port}//`)).status).toBe(400);
      await visit(`${redirectUri}?code=code-1&state=state-1`);
      expect(await waiting.code).toBe('code-1');
    });

    it('reports a refusal from the authorization page', async () => {
      const port = await freePort();
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const waiting = waitForCallback(redirectUri, 'state-1');
      const outcome = waiting.code.catch((error: Error) => error);
      await waiting.ready;
      await visit(`${redirectUri}?error=access_denied&error_description=Denied&state=state-1`);
      expect(((await outcome) as Error).message).toMatch(/access_denied.*Denied/);
    });

    it('ignores requests for other paths', async () => {
      const port = await freePort();
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const waiting = waitForCallback(redirectUri, 'state-1');
      await waiting.ready;
      expect((await visit(`http://127.0.0.1:${port}/favicon.ico`)).status).toBe(404);
      await visit(`${redirectUri}?code=code-1&state=state-1`);
      expect(await waiting.code).toBe('code-1');
    });
  });

  describe('opening the browser', () => {
    it('refuses anything that is not a web address', () => {
      expect(() => openInBrowser('file:///etc/hosts')).toThrow(/http/);
      expect(() => openInBrowser('not a url')).toThrow(/http/);
    });
  });

  describe('a pasted redirect', () => {
    it('takes the code from a full URL after checking the state', () => {
      expect(parseRedirect('https://example.test/cb?code=code-1&state=state-1', 'state-1')).toBe(
        'code-1'
      );
      expect(() =>
        parseRedirect('https://example.test/cb?code=code-1&state=other', 'state-1')
      ).toThrow(/state did not match/);
    });

    it('accepts a bare code', () => {
      expect(parseRedirect('  code-1  ', 'state-1')).toBe('code-1');
    });

    it('rejects an empty answer', () => {
      expect(() => parseRedirect('   ', 'state-1')).toThrow(/No authorization code/);
    });
  });

  describe('the whole flow', () => {
    it('opens the browser, catches the redirect and stores the login', async () => {
      routeFetch();
      const port = await freePort();
      process.env.FACTORIAL_OAUTH_REDIRECT_URI = `http://127.0.0.1:${port}/callback`;
      const printed: string[] = [];

      const login = await runLogin({
        print: line => printed.push(line),
        openBrowser: url => {
          const authorize = new URL(url);
          const state = authorize.searchParams.get('state');
          void visit(`${authorize.searchParams.get('redirect_uri')}?code=code-1&state=${state}`);
        },
        readLine: async () => {
          throw new Error('not expected to prompt');
        },
      });

      expect(login.employee_id).toBe('2');
      expect(readStoredLogin()?.refresh_token).toBe('refresh-new');
      const output = printed.join('\n');
      expect(output).toContain('https://id.factorialhr.com/oauth/authorize?');
      expect(output).toContain('Logged in as Test Person (employee 2)');
      expect(output).not.toContain('access-new');
      expect(output).not.toContain('refresh-new');
    });

    it('asks for the redirect to be pasted when it cannot listen for it', async () => {
      routeFetch();
      process.env.FACTORIAL_OAUTH_REDIRECT_URI = 'https://example.test/cb';
      let state = '';
      const login = await runLogin({
        print: () => undefined,
        openBrowser: url => {
          state = new URL(url).searchParams.get('state') ?? '';
        },
        readLine: async () => `https://example.test/cb?code=code-1&state=${state}`,
      });
      expect(login.employee_id).toBe('2');
      expect(formOf(TOKEN_URL).get('redirect_uri')).toBe('https://example.test/cb');
    });
  });

  describe('logout', () => {
    const stored = {
      version: 1 as const,
      client_id: 'client-1',
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_at: Date.now() + 1000,
      scope: null,
      employee_id: '2',
      employee_name: 'Test Person',
      email: null,
      obtained_at: '2026-01-01T00:00:00.000Z',
    };

    it('revokes the refresh token and deletes the file', async () => {
      routeFetch();
      writeStoredLogin(stored);
      const printed: string[] = [];
      await runLogout({ print: line => printed.push(line) });
      expect(Object.fromEntries(formOf(REVOKE_URL))).toEqual({
        client_id: 'client-1',
        token: 'refresh-1',
      });
      expect(existsSync(tokenFilePath())).toBe(false);
      expect(printed.join('\n')).toContain('Logged out');
    });

    it('still deletes the file when Factorial cannot be reached', async () => {
      mockFetch.mockRejectedValue(new Error('offline'));
      writeStoredLogin(stored);
      const printed: string[] = [];
      await runLogout({ print: line => printed.push(line) });
      expect(existsSync(tokenFilePath())).toBe(false);
      expect(printed.join('\n')).toContain('could not be revoked');
    });

    it('says so when there was no login', async () => {
      const printed: string[] = [];
      await runLogout({ print: line => printed.push(line) });
      expect(printed.join('\n')).toContain('No login');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('says who writes are recorded under, without showing a token', () => {
      writeStoredLogin({
        version: 1,
        client_id: 'client-1',
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_at: Date.now() + 1000,
        scope: 'read write',
        employee_id: '2',
        employee_name: 'Test Person',
        email: null,
        obtained_at: '2026-01-01T00:00:00.000Z',
      });
      const status = describeLogin();
      expect(status).toContain('Logged in as Test Person (employee 2)');
      expect(status).toContain('Writes are recorded in Factorial under this user');
      expect(status).toContain(tokenFilePath());
      expect(status).not.toContain('access-1');
      expect(status).not.toContain('refresh-1');
    });

    it('says writes go under the company key when there is no login', () => {
      process.env.FACTORIAL_API_KEY = 'test-api-key';
      const status = describeLogin();
      expect(status).toContain('Not logged in');
      expect(status).toContain("under the company API key's account");
    });

    it('says the login is ignored in api_key mode', () => {
      writeStoredLogin({
        version: 1,
        client_id: 'client-1',
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_at: Date.now() + 1000,
        scope: null,
        employee_id: '2',
        employee_name: 'Test Person',
        email: null,
        obtained_at: '2026-01-01T00:00:00.000Z',
      });
      process.env.FACTORIAL_AUTH_MODE = 'api_key';
      process.env.FACTORIAL_API_KEY = 'test-api-key';
      const status = describeLogin();
      expect(status).toContain('FACTORIAL_AUTH_MODE is api_key');
      expect(status).toContain("under the company API key's account");
      expect(status).not.toContain('Writes are recorded in Factorial under this user');
    });
  });
});
