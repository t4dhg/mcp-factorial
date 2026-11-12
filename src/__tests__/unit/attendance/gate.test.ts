import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { confirmationManager } from '../../../confirmation.js';
import { payloadFingerprint, requireTargetConfirmation } from '../../../attendance/gate.js';
import {
  getConfiguredEmployeeId,
  isConfiguredIdentity,
  resolveTargetEmployeeId,
} from '../../../attendance/identity.js';

const TOKEN = /confirmation_token: ([0-9a-f]{32})/;

function tokenIn(message: string): string {
  const match = TOKEN.exec(message);
  if (!match) throw new Error(`no token in:\n${message}`);
  return match[1];
}

describe('identity configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is undefined when FACTORIAL_EMPLOYEE_ID is unset or blank', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    expect(getConfiguredEmployeeId()).toBeUndefined();
    expect(isConfiguredIdentity(5)).toBe(false);
  });

  it('parses a positive integer and rejects anything else loudly', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '  4242 ');
    expect(getConfiguredEmployeeId()).toBe(4242);
    expect(isConfiguredIdentity(4242)).toBe(true);
    for (const bad of ['abc', '0', '-3', '12.5', '1e3']) {
      vi.stubEnv('FACTORIAL_EMPLOYEE_ID', bad);
      expect(() => getConfiguredEmployeeId()).toThrow(/positive integer/);
    }
  });

  it('resolves the target: explicit argument, then configured default, else an error', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '7');
    expect(resolveTargetEmployeeId(3)).toBe(3);
    expect(resolveTargetEmployeeId(undefined)).toBe(7);
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    expect(() => resolveTargetEmployeeId(undefined)).toThrow(/FACTORIAL_EMPLOYEE_ID is not set/);
    expect(() => resolveTargetEmployeeId(0)).toThrow(/positive integer/);
  });
});

describe('requireTargetConfirmation', () => {
  beforeEach(() => confirmationManager.clear());
  afterEach(() => vi.unstubAllEnvs());

  const base = {
    operation: 'clock_in',
    employeeId: 42,
    fingerprint: payloadFingerprint({ a: 1 }),
    preview: 'Clock in Placeholder Person (42) now',
  };

  it('lets a write aimed at the configured identity through without a token', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '42');
    expect(requireTargetConfirmation(base)).toEqual({ proceed: true });
  });

  it('requires a token for another person, and for everyone when no identity is configured', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '1');
    const other = requireTargetConfirmation(base);
    expect(other.proceed).toBe(false);
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const nobody = requireTargetConfirmation(base);
    expect(nobody.proceed).toBe(false);
    if (!nobody.proceed) {
      expect(nobody.message).toContain('Placeholder Person (42)');
      expect(nobody.message).toContain('Nothing has been written');
      expect(nobody.message).toMatch(TOKEN);
    }
  });

  it('always gates when asked, even for the configured identity', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '42');
    expect(requireTargetConfirmation({ ...base, always: true }).proceed).toBe(false);
  });

  it('accepts the token from its own preview exactly once', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const first = requireTargetConfirmation(base);
    if (first.proceed) throw new Error('expected a preview');
    const token = tokenIn(first.message);
    expect(requireTargetConfirmation({ ...base, token })).toEqual({ proceed: true });
    // One-time use: the same token again is treated as expired and a new preview is issued.
    const again = requireTargetConfirmation({ ...base, token });
    expect(again.proceed).toBe(false);
    if (!again.proceed) expect(again.message).toMatch(/invalid or had expired/);
  });

  it('refuses a token whose plan fingerprint no longer matches, and issues a fresh one', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const first = requireTargetConfirmation(base);
    if (first.proceed) throw new Error('expected a preview');
    const token = tokenIn(first.message);
    const changed = requireTargetConfirmation({
      ...base,
      token,
      fingerprint: payloadFingerprint({ a: 2 }),
    });
    expect(changed.proceed).toBe(false);
    if (!changed.proceed) {
      expect(changed.message).toMatch(/plan changed/);
      expect(tokenIn(changed.message)).not.toBe(token);
    }
    // The old token was consumed by the refused attempt.
    expect(confirmationManager.isValid(token)).toBe(false);
  });

  it('refuses a token issued for a different operation', () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const first = requireTargetConfirmation(base);
    if (first.proceed) throw new Error('expected a preview');
    const token = tokenIn(first.message);
    const other = requireTargetConfirmation({ ...base, token, operation: 'clock_out' });
    expect(other.proceed).toBe(false);
  });
});

describe('the credential a preview was made under', () => {
  it('does not let a token previewed as the logged-in user confirm a company-key write', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { writeStoredLogin, deleteStoredLogin } = await import('../../../auth/token-store.js');
    const { requireTargetConfirmation: gate } = await import('../../../attendance/gate.js');
    const dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-gate-'));
    const savedFile = process.env.FACTORIAL_TOKEN_FILE;
    const savedKey = process.env.FACTORIAL_API_KEY;
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    process.env.FACTORIAL_API_KEY = 'test-key';
    try {
      writeStoredLogin({
        version: 1,
        client_id: 'client-1',
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_at: Date.now() + 60_000,
        scope: null,
        employee_id: '2',
        employee_name: null,
        email: null,
        obtained_at: '2026-01-01T00:00:00.000Z',
      });
      const request = {
        operation: 'log_days',
        employeeId: 2,
        fingerprint: 'same-plan',
        preview: 'Log 1 day for employee 2',
        always: true,
      };
      const preview = gate(request);
      expect(preview.proceed).toBe(false);
      const text = (preview as { message: string }).message;
      expect(text).not.toContain('Attribution:');
      const token = /confirmation_token: ([0-9a-f]{32})/.exec(text)![1];

      // The login goes away; the same plan would now be written with the company key.
      deleteStoredLogin();
      const confirmed = gate({ ...request, token });
      expect(confirmed.proceed).toBe(false);
      expect((confirmed as { message: string }).message).toContain(
        "under the company API key's account"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      process.env.FACTORIAL_TOKEN_FILE = savedFile;
      if (savedKey === undefined) delete process.env.FACTORIAL_API_KEY;
      else process.env.FACTORIAL_API_KEY = savedKey;
    }
  });
});
