import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  statSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  tokenFilePath,
  readStoredLogin,
  writeStoredLogin,
  deleteStoredLogin,
  type StoredLogin,
} from '../../../auth/token-store.js';

const login: StoredLogin = {
  version: 1,
  client_id: 'client-1',
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 1_900_000_000_000,
  scope: 'time_off employees',
  employee_id: '2',
  employee_name: 'Test Person',
  email: 'person@example.com',
  obtained_at: '2026-01-01T00:00:00.000Z',
};

describe('token store', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-store-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'nested', 'login.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it('uses FACTORIAL_TOKEN_FILE when set', () => {
    expect(tokenFilePath()).toBe(join(dir, 'nested', 'login.json'));
  });

  it('defaults to the user config directory, never the working directory', () => {
    delete process.env.FACTORIAL_TOKEN_FILE;
    process.env.XDG_CONFIG_HOME = join(dir, 'xdg');
    expect(tokenFilePath()).toBe(join(dir, 'xdg', 'mcp-factorial', 'login.json'));
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = join(dir, 'home');
    if (process.platform !== 'win32') {
      expect(tokenFilePath()).toBe(join(dir, 'home', '.config', 'mcp-factorial', 'login.json'));
    }
    expect(tokenFilePath().startsWith(process.cwd())).toBe(false);
  });

  it('returns undefined when there is no login', () => {
    expect(readStoredLogin()).toBeUndefined();
  });

  it('round-trips a login', () => {
    writeStoredLogin(login);
    expect(readStoredLogin()).toEqual(login);
  });

  it.skipIf(process.platform === 'win32')('writes the file readable by its owner only', () => {
    writeStoredLogin(login);
    expect(statSync(tokenFilePath()).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'nested')).mode & 0o777).toBe(0o700);
  });

  it.skipIf(process.platform === 'win32')(
    'tightens the mode when overwriting a file that was left open',
    () => {
      writeStoredLogin(login);
      chmodSync(tokenFilePath(), 0o644);
      writeStoredLogin({ ...login, access_token: 'access-2' });
      expect(statSync(tokenFilePath()).mode & 0o777).toBe(0o600);
      expect(readStoredLogin()?.access_token).toBe('access-2');
    }
  );

  it.skipIf(process.platform === 'win32')(
    'refuses to read a file other users can read, without echoing it',
    () => {
      writeStoredLogin(login);
      chmodSync(tokenFilePath(), 0o644);
      let message = '';
      try {
        readStoredLogin();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('chmod 600');
      expect(message).not.toContain('refresh-1');
      expect(message).not.toContain('access-1');
    }
  );

  it('rejects a malformed file without echoing its contents', () => {
    writeStoredLogin(login);
    writeFileSync(tokenFilePath(), JSON.stringify({ version: 1, refresh_token: 'leaky-secret' }), {
      mode: 0o600,
    });
    let message = '';
    try {
      readStoredLogin();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('login again');
    expect(message).not.toContain('leaky-secret');
  });

  it('picks up a change another process wrote', () => {
    writeStoredLogin(login);
    expect(readStoredLogin()?.refresh_token).toBe('refresh-1');
    const other = {
      ...login,
      refresh_token: 'refresh-rotated-elsewhere',
      expires_at: 1_900_000_000_001,
    };
    writeFileSync(tokenFilePath(), JSON.stringify(other), { mode: 0o600 });
    expect(readStoredLogin()?.refresh_token).toBe('refresh-rotated-elsewhere');
  });

  it('leaves nothing but the login file behind', () => {
    writeStoredLogin(login);
    writeStoredLogin({ ...login, access_token: 'access-2' });
    expect(JSON.parse(readFileSync(tokenFilePath(), 'utf8'))).toEqual({
      ...login,
      access_token: 'access-2',
    });
    expect(readdirSync(join(dir, 'nested'))).toEqual(['login.json']);
  });

  it.skipIf(process.platform === 'win32')(
    'does not write through a symlink planted at the old predictable temporary name',
    () => {
      writeStoredLogin(login);
      const victim = join(dir, 'victim.txt');
      writeFileSync(victim, 'untouched');
      symlinkSync(victim, `${tokenFilePath()}.${process.pid}.tmp`);
      writeStoredLogin({ ...login, access_token: 'access-2' });
      expect(readFileSync(victim, 'utf8')).toBe('untouched');
      expect(readStoredLogin()?.access_token).toBe('access-2');
    }
  );

  it('deletes the login and reports whether there was one', () => {
    expect(deleteStoredLogin()).toBe(false);
    writeStoredLogin(login);
    expect(deleteStoredLogin()).toBe(true);
    expect(readStoredLogin()).toBeUndefined();
  });
});
