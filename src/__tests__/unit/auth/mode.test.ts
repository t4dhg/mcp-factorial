import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStoredLogin, type StoredLogin } from '../../../auth/token-store.js';
import {
  getAuthMode,
  getUserLogin,
  writeActor,
  companyKeyApprovalsAllowed,
} from '../../../auth/mode.js';

const login: StoredLogin = {
  version: 1,
  client_id: 'client-1',
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 1_900_000_000_000,
  scope: null,
  employee_id: '2',
  employee_name: 'Test Person',
  email: null,
  obtained_at: '2026-01-01T00:00:00.000Z',
};

describe('auth mode', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-mode-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    process.env.FACTORIAL_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it('defaults to auto and accepts the three modes', () => {
    expect(getAuthMode()).toBe('auto');
    for (const mode of ['auto', 'api_key', 'oauth'] as const) {
      process.env.FACTORIAL_AUTH_MODE = mode;
      expect(getAuthMode()).toBe(mode);
    }
  });

  it('rejects an unknown mode rather than guessing', () => {
    process.env.FACTORIAL_AUTH_MODE = 'user';
    expect(() => getAuthMode()).toThrow(/FACTORIAL_AUTH_MODE must be auto, api_key or oauth/);
  });

  it('writes as the company when nobody has logged in', () => {
    expect(getUserLogin()).toBeUndefined();
    expect(writeActor()).toEqual({ kind: 'company' });
  });

  it('writes as the user once a login is stored', () => {
    writeStoredLogin(login);
    expect(writeActor()).toEqual({ kind: 'user', login });
  });

  it('ignores a stored login in api_key mode', () => {
    writeStoredLogin(login);
    process.env.FACTORIAL_AUTH_MODE = 'api_key';
    expect(getUserLogin()).toBeUndefined();
    expect(writeActor()).toEqual({ kind: 'company' });
  });

  it('refuses to write at all in oauth mode without a login', () => {
    process.env.FACTORIAL_AUTH_MODE = 'oauth';
    expect(() => writeActor()).toThrow(/FACTORIAL_AUTH_MODE is oauth and nobody has logged in/);
  });

  it('allows company-key approvals only on the exact opt-in value', () => {
    expect(companyKeyApprovalsAllowed()).toBe(false);
    for (const value of ['1', 'yes', 'TRUE ', 'false', '']) {
      process.env.FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS = value;
      expect(companyKeyApprovalsAllowed(), value).toBe(value.trim().toLowerCase() === 'true');
    }
    process.env.FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS = 'true';
    expect(companyKeyApprovalsAllowed()).toBe(true);
  });
});
