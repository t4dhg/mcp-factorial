import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStoredLogin, writeStoredLogin, type StoredLogin } from '../../../auth/token-store.js';
import { LoginRequiredError } from '../../../auth/mode.js';
import { installAttribution } from '../../../auth/attribution.js';
import { factorialRequest, postAction } from '../../../http-client.js';
import { AuthenticationError, AuthorizationError } from '../../../errors.js';

const mockFetch = vi.fn();
const TOKEN_URL = 'https://id.factorialhr.com/api/oauth/token';

function loginWith(overrides: Partial<StoredLogin> = {}): StoredLogin {
  return {
    version: 1,
    client_id: 'client-1',
    access_token: 'access-old',
    refresh_token: 'refresh-old',
    expires_at: Date.now() + 30 * 60 * 1000,
    scope: 'time_off',
    employee_id: '2',
    employee_name: 'Test Person',
    email: null,
    obtained_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const json = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

/** Headers of every request sent to the resource API, in order */
function apiCalls(): Array<{ url: string; method: string; headers: Record<string, string> }> {
  return mockFetch.mock.calls
    .filter(([url]) => String(url) !== TOKEN_URL)
    .map(([url, init]) => ({
      url: String(url),
      method: (init as RequestInit).method ?? 'GET',
      headers: (init as RequestInit).headers as Record<string, string>,
    }));
}

describe('which credential a request carries', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-http-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    process.env.FACTORIAL_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  describe('with only a company API key', () => {
    it('reads and writes with the key', async () => {
      mockFetch.mockResolvedValue(json({ id: '1' }));
      await factorialRequest('/teams/teams');
      await postAction('/timeoff/leaves/approve', { id: 1 });
      const calls = apiCalls();
      expect(calls.map(c => c.headers['x-api-key'])).toEqual(['test-api-key', 'test-api-key']);
      expect(calls.every(c => !('Authorization' in c.headers))).toBe(true);
    });
  });

  describe('with a user login and an API key', () => {
    beforeEach(() => writeStoredLogin(loginWith()));

    it('writes as the user and never sends the key with a write', async () => {
      mockFetch.mockResolvedValue(json({ id: '1' }));
      await postAction('/timeoff/leaves/approve', { id: 1 });
      const [call] = apiCalls();
      expect(call.method).toBe('POST');
      expect(call.headers.Authorization).toBe('Bearer access-old');
      expect('x-api-key' in call.headers).toBe(false);
    });

    it.each(['PUT', 'PATCH', 'DELETE'] as const)('writes %s as the user', async method => {
      mockFetch.mockResolvedValue(json({ id: '1' }));
      await factorialRequest('/teams/teams/1', { method, body: { name: 'x' } });
      expect(apiCalls()[0].headers.Authorization).toBe('Bearer access-old');
      expect('x-api-key' in apiCalls()[0].headers).toBe(false);
    });

    it('keeps reading with the key, so nothing readable today disappears', async () => {
      mockFetch.mockResolvedValue(json({ data: [] }));
      await factorialRequest('/employees/employees');
      const [call] = apiCalls();
      expect(call.headers['x-api-key']).toBe('test-api-key');
      expect('Authorization' in call.headers).toBe(false);
    });

    it('ignores the login in api_key mode', async () => {
      process.env.FACTORIAL_AUTH_MODE = 'api_key';
      mockFetch.mockResolvedValue(json({ id: '1' }));
      await postAction('/timeoff/leaves/approve', { id: 1 });
      expect(apiCalls()[0].headers['x-api-key']).toBe('test-api-key');
      expect('Authorization' in apiCalls()[0].headers).toBe(false);
    });
  });

  describe('with a user login and no API key', () => {
    beforeEach(() => {
      delete process.env.FACTORIAL_API_KEY;
      writeStoredLogin(loginWith());
    });

    it('reads as the user', async () => {
      mockFetch.mockResolvedValue(json({ data: [] }));
      await factorialRequest('/employees/employees');
      expect(apiCalls()[0].headers.Authorization).toBe('Bearer access-old');
      expect('x-api-key' in apiCalls()[0].headers).toBe(false);
    });
  });

  describe('with no credential at all', () => {
    it('names both ways to supply one', async () => {
      delete process.env.FACTORIAL_API_KEY;
      await expect(factorialRequest('/employees/employees')).rejects.toThrow(
        /FACTORIAL_API_KEY is not set.*npx -y @t4dhg\/mcp-factorial login/s
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('oauth mode without a login', () => {
    it('refuses the write instead of falling back to the key', async () => {
      process.env.FACTORIAL_AUTH_MODE = 'oauth';
      await expect(postAction('/timeoff/leaves/approve', { id: 1 })).rejects.toThrow(
        LoginRequiredError
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('an expired login', () => {
    it('refreshes first, then writes with the new token', async () => {
      writeStoredLogin(loginWith({ expires_at: Date.now() - 1 }));
      mockFetch.mockImplementation(async (url: string) =>
        url === TOKEN_URL
          ? json({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
          : json({ id: '1' })
      );
      await postAction('/timeoff/leaves/approve', { id: 1 });
      expect(apiCalls().map(c => c.headers.Authorization)).toEqual(['Bearer access-new']);
      expect(readStoredLogin()?.refresh_token).toBe('refresh-new');
    });

    it('never falls back to the API key for a write when the refresh is refused', async () => {
      writeStoredLogin(loginWith({ expires_at: Date.now() - 1 }));
      mockFetch.mockImplementation(async (url: string) =>
        url === TOKEN_URL ? json({ error: 'invalid_grant' }, 400) : json({ id: '1' })
      );
      const error = await postAction('/timeoff/leaves/approve', { id: 1 }).catch(e => e);
      expect(error).toBeInstanceOf(LoginRequiredError);
      expect(error.message).toContain('expired or was revoked');
      // Nothing reached the resource API under any credential.
      expect(apiCalls()).toEqual([]);
    });
  });

  describe('a 401 on a user token', () => {
    it('refreshes once and retries once, even for a write', async () => {
      writeStoredLogin(loginWith());
      let apiAttempts = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url === TOKEN_URL) {
          return json({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 3600,
          });
        }
        apiAttempts += 1;
        return apiAttempts === 1 ? json({}, 401) : json({ id: '1' });
      });
      await postAction('/timeoff/leaves/approve', { id: 1 });
      expect(apiCalls().map(c => c.headers.Authorization)).toEqual([
        'Bearer access-old',
        'Bearer access-new',
      ]);
    });

    it('asks for a new login when the fresh token is rejected too', async () => {
      writeStoredLogin(loginWith());
      mockFetch.mockImplementation(async (url: string) =>
        url === TOKEN_URL
          ? json({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
          : json({}, 401)
      );
      const error = await postAction('/timeoff/leaves/approve', { id: 1 }).catch(e => e);
      expect(error).toBeInstanceOf(LoginRequiredError);
      expect(error.message).toContain('npx -y @t4dhg/mcp-factorial login');
      expect(apiCalls()).toHaveLength(2);
      expect(apiCalls().every(c => !('x-api-key' in c.headers))).toBe(true);
    });

    it('leaves a 401 on the API key as it was', async () => {
      mockFetch.mockResolvedValue(json({}, 401));
      await expect(factorialRequest('/employees/employees')).rejects.toThrow(AuthenticationError);
      expect(apiCalls()).toHaveLength(1);
    });
  });

  describe('a 403 on a user token', () => {
    it('points at the user’s permissions and the application’s scopes, not at an API key', async () => {
      writeStoredLogin(loginWith());
      mockFetch.mockResolvedValue(json({ message: 'Forbidden' }, 403));
      const error = await postAction('/timeoff/leaves/approve', { id: 1 }).catch(e => e);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toContain('Factorial said: Forbidden');
      expect(error.message).toContain('permission group');
      expect(error.message).toContain('scope');
    });
  });

  describe('reporting company-key writes', () => {
    type Result = { content: Array<{ type: 'text'; text: string }> };
    function run(work: () => Promise<unknown>): Promise<Result> {
      let handler!: (args: unknown) => Promise<Result>;
      const server = {
        registerTool(_n: string, _c: object, h: (args: unknown) => Promise<Result>) {
          handler = h;
        },
      };
      installAttribution(server);
      server.registerTool('factorial_teams', {}, async () => {
        await work();
        return { content: [{ type: 'text', text: 'done' }] };
      });
      return handler({});
    }

    it('flags a write made with the key', async () => {
      mockFetch.mockResolvedValue(json({ id: '1' }));
      const result = await run(() => postAction('/timeoff/leaves/approve', { id: 1 }));
      expect(result.content).toHaveLength(2);
      expect(result.content[1].text).toContain("under the company API key's account");
    });

    it('does not flag a read made with the key', async () => {
      mockFetch.mockResolvedValue(json({ data: [] }));
      const result = await run(() => factorialRequest('/employees/employees'));
      expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
    });

    it('does not flag a write made as the user', async () => {
      writeStoredLogin(loginWith());
      mockFetch.mockResolvedValue(json({ id: '1' }));
      const result = await run(() => postAction('/timeoff/leaves/approve', { id: 1 }));
      expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
    });

    it('does not flag a write that failed', async () => {
      mockFetch.mockResolvedValue(json({ message: 'no' }, 422));
      const result = await run(() =>
        postAction('/timeoff/leaves/approve', { id: 1 }).catch(() => undefined)
      );
      expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
    });
  });
});
