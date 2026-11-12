import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readStoredLogin,
  tokenFilePath,
  writeStoredLogin,
  type StoredLogin,
} from '../../../auth/token-store.js';
import { LoginRequiredError } from '../../../auth/mode.js';
import { getUserAccessToken, oauthEndpoints } from '../../../auth/user-token.js';

const mockFetch = vi.fn();

const NOW = 1_800_000_000_000;

function loginWith(overrides: Partial<StoredLogin> = {}): StoredLogin {
  return {
    version: 1,
    client_id: 'client-1',
    access_token: 'access-old',
    refresh_token: 'refresh-old',
    expires_at: NOW + 30 * 60 * 1000,
    scope: 'time_off',
    employee_id: '2',
    employee_name: 'Test Person',
    email: null,
    obtained_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function tokenResponse(body: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** The form fields of the n-th token request */
function formOf(call: number): URLSearchParams {
  const init = mockFetch.mock.calls[call][1] as RequestInit;
  return new URLSearchParams(init.body as string);
}

describe('user access token', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-token-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    delete process.env.FACTORIAL_OAUTH_CLIENT_SECRET;
    delete process.env.FACTORIAL_OAUTH_TOKEN_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it('uses the Factorial ID endpoints unless overridden', () => {
    expect(oauthEndpoints()).toEqual({
      authorize: 'https://id.factorialhr.com/oauth/authorize',
      token: 'https://id.factorialhr.com/api/oauth/token',
      revoke: 'https://id.factorialhr.com/api/oauth/revoke',
    });
    process.env.FACTORIAL_OAUTH_TOKEN_URL = 'https://id.example.test/api/oauth/token';
    expect(oauthEndpoints().token).toBe('https://id.example.test/api/oauth/token');
  });

  it('asks for a login when there is none', async () => {
    await expect(getUserAccessToken()).rejects.toThrow(LoginRequiredError);
    await expect(getUserAccessToken()).rejects.toThrow(/npx -y @t4dhg\/mcp-factorial login/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns a token that is still valid without touching the network', async () => {
    writeStoredLogin(loginWith());
    expect(await getUserAccessToken()).toBe('access-old');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and stores the rotated refresh token', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValueOnce(
      tokenResponse({
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        expires_in: 3600,
        scope: 'time_off',
      })
    );

    expect(await getUserAccessToken()).toBe('access-new');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://id.factorialhr.com/api/oauth/token');
    const form = formOf(0);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('refresh-old');
    expect(form.get('client_id')).toBe('client-1');
    // A public client has no secret to send.
    expect(form.has('client_secret')).toBe(false);

    const stored = readStoredLogin();
    expect(stored?.access_token).toBe('access-new');
    expect(stored?.refresh_token).toBe('refresh-new');
    expect(stored?.expires_at).toBe(NOW + 3600 * 1000);
    expect(stored?.employee_id).toBe('2');
  });

  it('refreshes a token that is about to expire', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW + 30 * 1000 }));
    mockFetch.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    expect(await getUserAccessToken()).toBe('access-new');
  });

  it('sends the client secret of a confidential client', async () => {
    process.env.FACTORIAL_OAUTH_CLIENT_SECRET = 'placeholder-secret';
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    await getUserAccessToken();
    expect(formOf(0).get('client_secret')).toBe('placeholder-secret');
  });

  it('keeps the old refresh token when the response carries none', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValueOnce(tokenResponse({ access_token: 'access-new', expires_in: 60 }));
    await getUserAccessToken();
    expect(readStoredLogin()?.refresh_token).toBe('refresh-old');
    expect(readStoredLogin()?.expires_at).toBe(NOW + 60 * 1000);
  });

  it('makes one refresh request for concurrent callers', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValue(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    const tokens = await Promise.all([
      getUserAccessToken(),
      getUserAccessToken(),
      getUserAccessToken(),
    ]);
    expect(tokens).toEqual(['access-new', 'access-new', 'access-new']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('says to log in again when the refresh token is no longer valid', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValue(
      tokenResponse({ error: 'invalid_grant', error_description: 'revoked' }, 400)
    );
    let error: unknown;
    try {
      await getUserAccessToken();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LoginRequiredError);
    const message = (error as Error).message;
    expect(message).toContain('expired or was revoked');
    expect(message).toContain('npx -y @t4dhg/mcp-factorial login');
    expect(message).not.toContain('refresh-old');
    expect(message).not.toContain('access-old');
  });

  it('does not call a server failure an expired login', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValue(tokenResponse({ error: 'server_error' }, 503));
    let error: unknown;
    try {
      await getUserAccessToken();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(LoginRequiredError);
    expect((error as Error).message).toContain('503');
    // The login is still there to try again with.
    expect(readStoredLogin()?.refresh_token).toBe('refresh-old');
  });

  it('releases the refresh lock after a failure', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValueOnce(tokenResponse({ error: 'server_error' }, 503));
    await expect(getUserAccessToken()).rejects.toThrow();
    expect(existsSync(`${tokenFilePath()}.lock`)).toBe(false);
    mockFetch.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    expect(await getUserAccessToken()).toBe('access-new');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails instead of spinning when the lock cannot be created',
    async () => {
      writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
      chmodSync(dir, 0o500);
      try {
        await expect(getUserAccessToken()).rejects.toThrow(/EACCES|EPERM|EROFS/);
        expect(mockFetch).not.toHaveBeenCalled();
      } finally {
        chmodSync(dir, 0o700);
      }
    }
  );

  it('takes over a lock a dead process left behind', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    const lock = `${tokenFilePath()}.lock`;
    writeFileSync(lock, 'someone-else');
    utimesSync(lock, new Date(NOW - 60_000), new Date(NOW - 60_000));
    mockFetch.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    expect(await getUserAccessToken()).toBe('access-new');
    expect(existsSync(lock)).toBe(false);
  });

  it('uses the pair another process stored when its own refresh token was already spent', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockImplementationOnce(async () => {
      // The other process won the race and has already written its result.
      writeStoredLogin(
        loginWith({ access_token: 'access-elsewhere', refresh_token: 'refresh-elsewhere' })
      );
      return tokenResponse({ error: 'invalid_grant' }, 400);
    });
    expect(await getUserAccessToken()).toBe('access-elsewhere');
  });

  it('gives the token request a time limit', async () => {
    writeStoredLogin(loginWith({ expires_at: NOW - 1 }));
    mockFetch.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    await getUserAccessToken();
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('forces a refresh when the API rejected a token that looked valid', async () => {
    writeStoredLogin(loginWith());
    mockFetch.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 })
    );
    expect(await getUserAccessToken({ rejected: 'access-old' })).toBe('access-new');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses the token another process already refreshed instead of refreshing again', async () => {
    // This process was rejected with access-old; meanwhile the file moved on.
    writeStoredLogin(
      loginWith({ access_token: 'access-elsewhere', refresh_token: 'refresh-elsewhere' })
    );
    expect(await getUserAccessToken({ rejected: 'access-old' })).toBe('access-elsewhere');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
