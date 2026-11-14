import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerTimeOffTool } = await import('../../../tools/time-off.js');
const { installAttribution } = await import('../../../auth/attribution.js');
const { writeStoredLogin } = await import('../../../auth/token-store.js');
const { confirmationManager } = await import('../../../confirmation.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');

type Result = { content: Array<{ text: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

/** The tool as the server registers it: with the attribution wrapper installed */
function capture(): { handler: Handler; description: string } {
  let handler: Handler | undefined;
  let description = '';
  const fake = {
    registerTool: (_name: string, cfg: { description: string }, fn: Handler) => {
      description = cfg.description;
      handler = fn;
    },
  };
  installAttribution(fake);
  registerTimeOffTool(fake as unknown as McpServer);
  if (!handler) throw new Error('tool not registered');
  return { handler, description };
}

const TOKEN = /confirmation_token: ([0-9a-f]{32})/;
const all = (result: Result) => result.content.map(c => c.text).join('\n');

const person = (id: string, full_name: string, timeoff_manager_id: string | null) => ({
  id,
  first_name: full_name.split(' ')[0],
  last_name: full_name.split(' ')[1],
  full_name,
  manager_id: null,
  timeoff_manager_id,
});

const leave = (id: string, employee_id: string) => ({
  id,
  employee_id,
  leave_type_id: '1',
  start_on: '2026-02-04',
  finish_on: '2026-02-06',
  half_day: null,
  approved: null,
  description: null,
  deleted_at: null,
});

/** Employee 3's leave (11) is routed to employee 2; employee 4's (12) to employee 5 */
const employees = [
  person('2', 'Placeholder Caller', '9'),
  person('3', 'Routed Report', '2'),
  person('4', 'Other Report', '5'),
  person('5', 'Other Approver', null),
];
const leaves = [leave('11', '3'), leave('12', '4')];

let requests: Array<{ method: string; path: string; headers: Record<string, string> }>;
const posts = () => requests.filter(r => r.method === 'POST');

function routeFetch() {
  mockFetch.mockImplementation(
    async (input: string, init?: { method?: string; headers?: Record<string, string> }) => {
      const url = new URL(input);
      const method = init?.method ?? 'GET';
      const path = url.pathname;
      requests.push({ method, path, headers: init?.headers ?? {} });
      const ok = (json: unknown) => ({
        ok: true,
        status: 200,
        json: async () => json,
        text: async () => JSON.stringify(json),
      });
      const list = (data: unknown[]) =>
        ok({ data, meta: { has_next_page: false, total: data.length, limit: 100 } });
      const notFound = { ok: false, status: 404, json: async () => ({}), text: async () => '' };

      const employee = /\/employees\/employees\/(\d+)$/.exec(path);
      if (employee) {
        const found = employees.find(e => e.id === employee[1]);
        return found ? ok(found) : notFound;
      }
      if (path.endsWith('/employees/employees')) return list(employees);
      const decision = /\/timeoff\/leaves\/(\d+)\/(approve|reject)$/.exec(path);
      if (decision && method === 'POST') {
        const found = leaves.find(l => l.id === decision[1]);
        return found ? ok({ ...found, approved: decision[2] === 'approve' }) : notFound;
      }
      const single = /\/timeoff\/leaves\/(\d+)$/.exec(path);
      if (single) {
        const found = leaves.find(l => l.id === single[1]);
        return found ? ok(found) : notFound;
      }
      if (path.endsWith('/timeoff/leaves')) return list(leaves);
      throw new Error(`unrouted ${method} ${path}`);
    }
  );
}

let dir: string;

function logInAs(employeeId: string) {
  writeStoredLogin({
    version: 1,
    client_id: 'client-1',
    access_token: 'user-access-token',
    refresh_token: 'user-refresh-token',
    expires_at: Date.now() + 30 * 60 * 1000,
    scope: 'time_off employees',
    employee_id: employeeId,
    employee_name: null,
    email: null,
    obtained_at: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-timeoff-attr-'));
  vi.stubEnv('FACTORIAL_TOKEN_FILE', join(dir, 'login.json'));
  vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
  requests = [];
  mockFetch.mockReset();
  routeFetch();
  clearCache();
  clearResolvedNames();
  confirmationManager.clear();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
});

describe('leave decisions under a company API key', () => {
  it.each(['approve', 'reject'] as const)(
    'refuses to %s by default, even a leave routed to the caller',
    async action => {
      const { handler } = capture();
      const result = await handler({ action, id: 11, confirm: true });
      const text = all(result);

      expect(result.isError).toBe(true);
      expect(posts()).toHaveLength(0);
      expect(text).toContain("under the company API key's account, not under you");
      expect(text).toContain('Nothing was written');
      expect(text).toContain('npx -y @t4dhg/mcp-factorial login');
      expect(text).toContain('FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS=true');
    }
  );

  it('refuses before reading anything about the leave', async () => {
    const { handler } = capture();
    await handler({ action: 'approve', id: 11 });
    expect(requests).toEqual([]);
  });

  it('is not opened by the approver override, and mints no token', async () => {
    const { handler } = capture();
    const result = await handler({
      action: 'approve',
      id: 12,
      override_approver: true,
      override_reason: 'Asked by the approver while they are away',
    });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(all(result)).toContain("under the company API key's account");
    expect(all(result)).not.toMatch(TOKEN);
  });

  describe('when the operator has allowed it', () => {
    beforeEach(() => vi.stubEnv('FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS', 'true'));

    it('approves with the key and says in the result who Factorial recorded', async () => {
      const { handler } = capture();
      const result = await handler({ action: 'approve', id: 11 });

      expect(result.isError).toBeUndefined();
      expect(posts()).toHaveLength(1);
      expect(posts()[0].headers['x-api-key']).toBe('test-key');
      expect(result.content[0].text).toContain('Leave approved');
      expect(all(result)).toContain(
        "Factorial recorded this action under the company API key's account, not under you"
      );
    });

    it('says so when asking to confirm a reject, before anything is written', async () => {
      const { handler } = capture();
      const result = await handler({ action: 'reject', id: 11 });
      expect(posts()).toHaveLength(0);
      expect(all(result)).toContain('confirm: true');
      expect(all(result)).toContain(
        "Factorial will record this action under the company API key's account, not under you"
      );
    });

    it('says so in the override preview, before the token', async () => {
      const { handler } = capture();
      const result = await handler({
        action: 'approve',
        id: 12,
        override_approver: true,
        override_reason: 'Asked by the approver while they are away',
      });
      const text = all(result);
      expect(posts()).toHaveLength(0);
      expect(text).toMatch(TOKEN);
      expect(text.indexOf('Factorial will record this action under the company')).toBeGreaterThan(
        -1
      );
      expect(text.indexOf('Factorial will record this action under the company')).toBeLessThan(
        text.indexOf('confirmation_token:')
      );
    });

    it('still refuses a leave routed to someone else', async () => {
      const { handler } = capture();
      const result = await handler({ action: 'approve', id: 12 });
      expect(result.isError).toBe(true);
      expect(all(result)).toContain('Other Approver (employee 5)');
    });
  });
});

describe('leave decisions as a logged-in user', () => {
  it('approves as the user, with no opt-in and no notice', async () => {
    logInAs('2');
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 11 });

    expect(result.isError).toBeUndefined();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].headers.Authorization).toBe('Bearer user-access-token');
    expect('x-api-key' in posts()[0].headers).toBe(false);
    expect(all(result)).not.toContain('Attribution:');
  });

  it('takes the caller from the login, not from FACTORIAL_EMPLOYEE_ID', async () => {
    // The setting says employee 5; the person who logged in is employee 2.
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '5');
    logInAs('2');
    const { handler } = capture();

    const mine = await handler({ action: 'approve', id: 11 });
    expect(mine.isError).toBeUndefined();

    const theirs = await handler({ action: 'approve', id: 12 });
    expect(theirs.isError).toBe(true);
    expect(all(theirs)).toContain('Other Approver (employee 5)');
    expect(all(theirs)).toContain('Placeholder Caller (employee 2)');
    expect(posts()).toHaveLength(1);
  });

  it('needs no FACTORIAL_EMPLOYEE_ID at all', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    logInAs('2');
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 11 });
    expect(result.isError).toBeUndefined();
    expect(posts()).toHaveLength(1);
  });

  it('computes routed_to_me from the login', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    logInAs('5');
    const { handler } = capture();
    const result = await handler({ action: 'list_leaves' });
    const text = result.content[0].text;
    const rows = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)) as Array<{
      id: string;
      routed_to_me: boolean | null;
    }>;
    expect(rows.map(r => [r.id, r.routed_to_me])).toEqual([
      ['11', false],
      ['12', true],
    ]);
  });

  it('asks to confirm a reject without an attribution warning', async () => {
    logInAs('2');
    const { handler } = capture();
    const result = await handler({ action: 'reject', id: 11 });
    expect(all(result)).toContain('confirm: true');
    expect(all(result)).not.toContain('Attribution:');
  });
});

describe('when nobody is identified', () => {
  it('names both ways to say who you are', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    vi.stubEnv('FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS', 'true');
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 11 });
    expect(result.isError).toBe(true);
    expect(all(result)).toContain('FACTORIAL_EMPLOYEE_ID is not set');
    expect(all(result)).toContain('npx -y @t4dhg/mcp-factorial login');
  });
});

describe('oauth mode without a login', () => {
  it('refuses a decision and says to log in', async () => {
    vi.stubEnv('FACTORIAL_AUTH_MODE', 'oauth');
    vi.stubEnv('FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS', 'true');
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 11 });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(all(result)).toContain('nobody has logged in');
  });
});

describe('what a model reads before it acts', () => {
  it('states the attribution rule and the company-key refusal in the description', () => {
    const { description } = capture();
    expect(description).toContain("With only a company API key it is the key's account");
    expect(description).toContain(
      'approve and reject are refused under a company API key unless the operator has set ' +
        'FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS=true'
    );
    expect(description).toContain('the employee who logged in');
  });
});
