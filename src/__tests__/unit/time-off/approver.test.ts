import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerTimeOffTool } = await import('../../../tools/time-off.js');
const { confirmationManager } = await import('../../../confirmation.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');
const { auditLogger } = await import('../../../audit.js');
const { OPERATION_POLICIES } = await import('../../../write-safety.js');

type Result = { content: Array<{ text: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

function capture(): {
  handler: Handler;
  config: { description: string; inputSchema: Record<string, { description?: string }> };
} {
  let handler: Handler | undefined;
  let config: unknown;
  const fake = {
    registerTool: (_name: string, cfg: unknown, fn: Handler) => {
      config = cfg;
      handler = fn;
    },
  } as unknown as McpServer;
  registerTimeOffTool(fake);
  if (!handler) throw new Error('tool not registered');
  return { handler, config: config as never };
}

const TOKEN = /confirmation_token: ([0-9a-f]{32})/;

const person = (id: string, full_name: string, timeoff_manager_id: string | null) => ({
  id,
  first_name: full_name.split(' ')[0],
  last_name: full_name.split(' ')[1],
  full_name,
  manager_id: null,
  timeoff_manager_id,
});

const leave = (id: string, employee_id: string, approved: boolean | null) => ({
  id,
  employee_id,
  leave_type_id: '1',
  start_on: '2026-02-04',
  finish_on: '2026-02-06',
  half_day: null,
  approved,
  description: null,
  deleted_at: null,
});

/**
 * The caller is employee 2. Employee 3's leave is routed to the caller,
 * employee 4's to employee 5, and employee 6 has no approver on record.
 */
let employees: Array<ReturnType<typeof person>>;
let leaves: Array<ReturnType<typeof leave>>;
let requests: Array<{ method: string; path: string; search: URLSearchParams }>;
/** When false the mock ignores include_pending, as an API that dropped the parameter would */
let honourPendingFilter: boolean;
/** When true the single-employee endpoint answers 404, forcing the list fallback */
let directEmployeeMissing: boolean;

const posts = () => requests.filter(r => r.method === 'POST');
const gets = (path: string) => requests.filter(r => r.method === 'GET' && r.path.endsWith(path));

function routeFetch() {
  mockFetch.mockImplementation(async (input: string, init?: { method?: string }) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    requests.push({ method, path, search: url.searchParams });
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
      if (directEmployeeMissing) return notFound;
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
    if (path.endsWith('/timeoff/leaves')) {
      const ids = url.searchParams.getAll('employee_ids[]');
      const pendingOnly = honourPendingFilter && url.searchParams.get('include_pending') === 'true';
      return list(
        leaves.filter(
          l =>
            (ids.length === 0 || ids.includes(l.employee_id)) &&
            (!pendingOnly || l.approved === null)
        )
      );
    }
    throw new Error(`unrouted ${method} ${path}`);
  });
}

/** The JSON array a list response carries after its heading line */
function rows(text: string): Array<Record<string, unknown>> {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  return JSON.parse(text.slice(start, end + 1)) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
  employees = [
    person('2', 'Placeholder Caller', '9'),
    person('3', 'Routed Report', '2'),
    person('4', 'Other Report', '5'),
    person('5', 'Other Approver', null),
    person('6', 'Unassigned Person', null),
  ];
  leaves = [
    leave('11', '3', null),
    leave('12', '4', null),
    leave('13', '6', null),
    leave('14', '3', true),
  ];
  requests = [];
  honourPendingFilter = true;
  directEmployeeMissing = false;
  mockFetch.mockReset();
  routeFetch();
  clearCache();
  clearResolvedNames();
  confirmationManager.clear();
  auditLogger.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
});

describe('list_leaves approver fields', () => {
  it('carries the approver id, the approver name and routed_to_me on every row', async () => {
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves' })).content[0].text;
    const byId = Object.fromEntries(rows(text).map(r => [r.id as string, r]));

    expect(byId['11']).toMatchObject({
      timeoff_manager_id: '2',
      timeoff_manager_name: 'Placeholder Caller',
      routed_to_me: true,
    });
    expect(byId['12']).toMatchObject({
      timeoff_manager_id: '5',
      timeoff_manager_name: 'Other Approver',
      routed_to_me: false,
    });
    expect(byId['13']).toMatchObject({
      timeoff_manager_id: null,
      timeoff_manager_name: null,
      routed_to_me: false,
    });
  });

  it('reads the employee directory once, not once per row', async () => {
    const { handler } = capture();
    await handler({ action: 'list_leaves' });
    expect(requests.filter(r => r.path.includes('/employees/employees'))).toHaveLength(1);
  });

  it('says which pending requests are the caller’s and which are not', async () => {
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves' })).content[0].text;
    expect(text).toContain('1 pending request is routed to you: 11.');
    expect(text).toContain('2 pending requests are not routed to you: 12, 13.');
  });

  it('reports routed_to_me as null when the caller is unknown, and says why', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves' })).content[0].text;

    expect(rows(text).map(r => r.routed_to_me)).toEqual([null, null, null, null]);
    expect(rows(text)[0].timeoff_manager_name).toBe('Placeholder Caller');
    expect(text).toContain('FACTORIAL_EMPLOYEE_ID is not set');
    expect(text).not.toContain('routed to you:');
  });
});

describe('list_leaves pending_for_me', () => {
  it('returns only pending leaves whose approver is the caller', async () => {
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves', pending_for_me: true })).content[0].text;

    expect(rows(text).map(r => r.id)).toEqual(['11']);
    const request = gets('/timeoff/leaves')[0];
    expect(request.search.getAll('employee_ids[]')).toEqual(['3']);
    expect(request.search.get('include_pending')).toBe('true');
  });

  it('drops decided leaves itself rather than trusting the server filter', async () => {
    honourPendingFilter = false;
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves', pending_for_me: true })).content[0].text;
    expect(rows(text).map(r => r.id)).toEqual(['11']);
  });

  it('narrows to one employee when employee_id is also given', async () => {
    employees.push(person('7', 'Second Report', '2'));
    leaves.push(leave('15', '7', null));
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves', pending_for_me: true, employee_id: 7 }))
      .content[0].text;
    expect(rows(text).map(r => r.id)).toEqual(['15']);
  });

  it('asks for no leaves at all when nobody has the caller as approver', async () => {
    employees = employees.filter(e => e.id !== '3');
    const { handler } = capture();
    const text = (await handler({ action: 'list_leaves', pending_for_me: true })).content[0].text;
    expect(text).toContain('No employee has you');
    expect(gets('/timeoff/leaves')).toHaveLength(0);
  });

  it('refuses when the caller is unknown instead of returning everything', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const { handler } = capture();
    const result = await handler({ action: 'list_leaves', pending_for_me: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('FACTORIAL_EMPLOYEE_ID');
    expect(gets('/timeoff/leaves')).toHaveLength(0);
  });
});

describe('get_leave approver fields', () => {
  it('adds the approver and routed_to_me to the leave', async () => {
    const { handler } = capture();
    const text = (await handler({ action: 'get_leave', id: 12 })).content[0].text;
    const record = JSON.parse(text.slice(text.indexOf('{'))) as Record<string, unknown>;
    expect(record).toMatchObject({
      id: '12',
      timeoff_manager_id: '5',
      timeoff_manager_name: 'Other Approver',
      routed_to_me: false,
    });
  });
});

describe('approve', () => {
  it('approves a leave routed to the caller', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 11 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Leave approved');
    expect(posts().map(r => r.path.split('/resources')[1])).toEqual(['/timeoff/leaves/11/approve']);
  });

  it('refuses a leave routed to someone else and names the approver', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 12 });
    const text = result.content[0].text;

    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(text).toContain('Other Approver (employee 5)');
    expect(text).toContain('Other Report');
    expect(text).toContain('Nothing was written');
    expect(text).toContain('override_approver: true');
    expect(text).toContain('asked to act on');
    expect(text).not.toMatch(TOKEN);
  });

  it('refuses a leave whose employee has no approver on record', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 13 });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('no time-off approver');
  });

  it('refuses when the caller is unknown, naming the setting and the approver', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 11 });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('FACTORIAL_EMPLOYEE_ID is not set');
    expect(result.content[0].text).toContain('Placeholder Caller (employee 2)');
  });

  it('checks the approver afresh rather than from a cached employee', async () => {
    const { handler } = capture();
    await handler({ action: 'get_leave', id: 11 });
    // Replace the record rather than mutating it: the cache holds the object the
    // first read returned, so an in-place edit would change the cached copy too.
    employees = employees.map(e => (e.id === '3' ? { ...e, timeoff_manager_id: '5' } : e));

    const result = await handler({ action: 'approve', id: 11 });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('Other Approver (employee 5)');
  });
});

describe('approve, when the employee is only readable through the list', () => {
  it('still checks the approver afresh rather than from the cached list', async () => {
    directEmployeeMissing = true;
    const { handler } = capture();
    await handler({ action: 'list_leaves' });
    employees = employees.map(e => (e.id === '3' ? { ...e, timeoff_manager_id: '5' } : e));

    const result = await handler({ action: 'approve', id: 11 });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('Other Approver (employee 5)');
  });
});

describe('approver override', () => {
  const reason = 'Asked by the approver to cover while they are away';

  it('needs a reason before anything else happens', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'approve', id: 12, override_approver: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('override_reason is required');
    expect(result.content[0].text).not.toMatch(TOKEN);
    expect(posts()).toHaveLength(0);
  });

  it('treats a blank reason as no reason', async () => {
    const { handler } = capture();
    const result = await handler({
      action: 'approve',
      id: 12,
      override_approver: true,
      override_reason: '   ',
    });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
  });

  it('previews first, then approves with the token and audits the override', async () => {
    const { handler } = capture();
    const args = { action: 'approve', id: 12, override_approver: true, override_reason: reason };

    const preview = (await handler(args)).content[0].text;
    expect(posts()).toHaveLength(0);
    expect(preview).toContain('Other Approver (employee 5)');
    expect(preview).toContain('Other Report');
    expect(preview).toContain(reason);
    expect(preview).toContain('Nothing has been written');
    const token = TOKEN.exec(preview)![1];

    const done = await handler({ ...args, confirmation_token: token });
    expect(done.isError).toBeUndefined();
    expect(done.content[0].text).toContain('Leave approved');
    expect(posts().map(r => r.path.split('/resources')[1])).toEqual(['/timeoff/leaves/12/approve']);

    const entries = auditLogger.getLogsByEntity('leave', 12);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'APPROVE',
      success: true,
      changes: {
        approver_override: { from: '5', to: '2' },
        override_reason: { to: reason },
      },
    });
  });

  it('records no override on an ordinary approval', async () => {
    const { handler } = capture();
    await handler({ action: 'approve', id: 11 });
    const entries = auditLogger.getLogsByEntity('leave', 11);
    expect(entries).toHaveLength(1);
    expect(entries[0].changes).toBeUndefined();
  });

  it('does not let a token minted for one reason confirm another', async () => {
    const { handler } = capture();
    const args = { action: 'approve', id: 12, override_approver: true };
    const preview = (await handler({ ...args, override_reason: reason })).content[0].text;
    const token = TOKEN.exec(preview)![1];

    const second = await handler({
      ...args,
      override_reason: 'A different reason entirely',
      confirmation_token: token,
    });
    expect(posts()).toHaveLength(0);
    expect(second.content[0].text).toContain('A different reason entirely');
    expect(second.content[0].text).toMatch(TOKEN);
  });

  it('does not let an approve token confirm a reject', async () => {
    const { handler } = capture();
    const shared = { id: 12, override_approver: true, override_reason: reason };
    const preview = (await handler({ action: 'approve', ...shared })).content[0].text;
    const token = TOKEN.exec(preview)![1];

    await handler({ action: 'reject', ...shared, confirmation_token: token });
    expect(posts()).toHaveLength(0);
  });

  it('is refused when the caller is unknown, without minting a token', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    const { handler } = capture();
    const result = await handler({
      action: 'approve',
      id: 12,
      override_approver: true,
      override_reason: reason,
    });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('FACTORIAL_EMPLOYEE_ID is not set');
    expect(result.content[0].text).not.toMatch(TOKEN);
    expect(result.content[0].text).not.toContain('override_approver: true');
    expect(confirmationManager.getPendingCount()).toBe(0);
  });

  it('ignores the override when the leave is routed to the caller anyway', async () => {
    const { handler } = capture();
    const result = await handler({
      action: 'approve',
      id: 11,
      override_approver: true,
      override_reason: reason,
    });
    expect(result.content[0].text).toContain('Leave approved');
    expect(auditLogger.getLogsByEntity('leave', 11)[0].changes).toBeUndefined();
  });
});

describe('reject', () => {
  it('refuses a leave routed to someone else even with confirm: true', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'reject', id: 12, confirm: true });
    expect(result.isError).toBe(true);
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('Other Approver (employee 5)');
  });

  it('still asks for confirm: true on a leave routed to the caller', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'reject', id: 11 });
    expect(posts()).toHaveLength(0);
    expect(result.content[0].text).toContain('confirm: true');
  });

  it('rejects a leave routed to the caller once confirmed', async () => {
    const { handler } = capture();
    const result = await handler({ action: 'reject', id: 11, confirm: true });
    expect(result.content[0].text).toContain('Leave rejected');
    expect(posts().map(r => r.path.split('/resources')[1])).toEqual(['/timeoff/leaves/11/reject']);
  });

  it('rejects on another approver’s behalf through the token, and audits it', async () => {
    const { handler } = capture();
    const args = {
      action: 'reject',
      id: 12,
      override_approver: true,
      override_reason: 'Asked by the approver to decline it',
    };
    const token = TOKEN.exec((await handler(args)).content[0].text)![1];
    expect(posts()).toHaveLength(0);

    await handler({ ...args, confirmation_token: token });
    expect(posts().map(r => r.path.split('/resources')[1])).toEqual(['/timeoff/leaves/12/reject']);
    expect(auditLogger.getLogsByEntity('leave', 12)[0]).toMatchObject({
      action: 'REJECT',
      changes: { approver_override: { from: '5', to: '2' } },
    });
  });
});

describe('what a model reads before it acts', () => {
  it('states the approver rule in the tool description', () => {
    const { config } = capture();
    expect(config.description).toContain(
      'Approve or reject only requests whose time-off approver is you'
    );
    expect(config.description).toContain('pending does not mean pending for you');
    expect(config.description).toContain('pending_for_me');
  });

  it('describes the override parameters as an exception, not an option', () => {
    const { config } = capture();
    expect(config.inputSchema.override_approver.description).toContain('asked to act on');
    expect(config.inputSchema.override_reason.description).toContain('Required with');
  });

  it('states the rule in the approve and reject policies', () => {
    for (const name of ['approve_leave', 'reject_leave']) {
      expect(OPERATION_POLICIES[name].impactDescription).toContain(
        "Only the request's own time-off approver should decide it"
      );
    }
  });
});
