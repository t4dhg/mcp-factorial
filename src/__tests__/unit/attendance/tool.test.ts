import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import shiftsFixture from '../../fixtures/shifts.json' with { type: 'json' };
import estimatedFixture from '../../fixtures/estimated-times.json' with { type: 'json' };
import workedFixture from '../../fixtures/worked-times.json' with { type: 'json' };

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerAttendanceTool } = await import('../../../tools/attendance.js');
const { confirmationManager } = await import('../../../confirmation.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function captureHandler(): Handler {
  let handler: Handler | undefined;
  const fake = {
    registerTool: (_name: string, _config: unknown, fn: Handler) => {
      handler = fn;
    },
  } as unknown as McpServer;
  registerAttendanceTool(fake);
  if (!handler) throw new Error('tool not registered');
  return handler;
}

const TOKEN = /confirmation_token: ([0-9a-f]{32})/;
const EMPLOYEE = {
  id: '2',
  first_name: 'Placeholder',
  last_name: 'Person',
  full_name: 'Placeholder Person',
};

/** Route mocked fetches by URL so Promise.all ordering does not matter */
function routeFetch(routes: {
  shifts?: unknown[];
  openShifts?: unknown[];
  leaves?: unknown[];
  onPost?: (body: Record<string, unknown>) => unknown;
}) {
  mockFetch.mockImplementation(async (input: string, init?: { method?: string; body?: string }) => {
    const url = new URL(input);
    const path = url.pathname;
    const ok = (json: unknown, status = 200) => ({
      ok: true,
      status,
      json: async () => json,
      text: async () => '',
    });
    if (init?.method === 'POST' && path.endsWith('/attendance/shifts')) {
      const body = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
      if (routes.onPost) return ok(routes.onPost(body), 201);
      return ok({ ...shiftsFixture.data[0], ...body, id: '999', minutes: 240 }, 201);
    }
    if (path.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
    if (path.endsWith('/employees/employees/3'))
      return ok({ ...EMPLOYEE, id: '3', full_name: 'Other Colleague' });
    if (path.endsWith('/attendance/worked_times')) return ok({ data: workedFixture.data });
    if (path.endsWith('/attendance/estimated_times')) return ok({ data: estimatedFixture.data });
    if (path.endsWith('/attendance/shifts')) return ok({ data: routes.shifts ?? [] });
    if (path.endsWith('/attendance/open_shifts')) return ok({ data: routes.openShifts ?? [] });
    if (path.endsWith('/timeoff/leaves')) return ok({ data: routes.leaves ?? [] });
    throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${path}`);
  });
}

function posts(): Array<Record<string, unknown>> {
  return mockFetch.mock.calls
    .filter(([, init]) => (init as { method?: string } | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse((init as { body: string }).body) as Record<string, unknown>);
}

describe('factorial_attendance tool', () => {
  let call: Handler;

  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
    clearResolvedNames();
    confirmationManager.clear();
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-15T10:00:00Z'));
    call = captureHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const range = {
    action: 'log_range',
    employee_id: 2,
    start_on: '2026-12-21',
    end_on: '2026-12-31',
    segments: [{ clock_in: '09:00', clock_out: '13:00' }],
    skip_leave: true,
  };

  it('refuses an unbounded list', async () => {
    routeFetch({});
    const result = await call({ action: 'list', employee_id: 2 });
    expect(result.content[0].text).toMatch(/Refusing to list shifts without bounds/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns a preview and writes nothing on a first bulk call, even with confirm: true', async () => {
    routeFetch({});
    const result = await call({ ...range, confirm: true });
    const text = result.content[0].text;
    expect(text).toContain('Plan for Placeholder Person (2)');
    expect(text).toContain('3 days to write, 3 shift records, 12h');
    expect(text).toMatch(/bank holiday/);
    expect(text).toMatch(/weekend/);
    expect(text).toMatch(TOKEN);
    expect(posts()).toEqual([]);
  });

  it('writes the plan when called again with the token, sending source api', async () => {
    routeFetch({});
    const first = await call({ ...range, observations: 'migrated' });
    expect(first.content[0].text).toContain('Note on every record: "migrated"');
    const token = TOKEN.exec(first.content[0].text)?.[1];
    expect(token).toBeDefined();

    // A note that was not previewed changes the fingerprint and is refused.
    const sneaky = await call({ ...range, confirmation_token: token, observations: 'other' });
    expect(sneaky.content[0].text).toMatch(/plan changed/);
    expect(posts()).toEqual([]);

    const again = await call({ ...range, observations: 'migrated' });
    const token2 = TOKEN.exec(again.content[0].text)?.[1];
    const second = await call({ ...range, confirmation_token: token2, observations: 'migrated' });
    expect(second.content[0].text).toContain(
      'Wrote 3 of 3 shift records for Placeholder Person (2), 12h'
    );
    expect(posts()).toEqual([
      {
        employee_id: '2',
        date: '2026-12-28',
        clock_in: '09:00',
        clock_out: '13:00',
        observations: 'migrated',
        source: 'api',
      },
      {
        employee_id: '2',
        date: '2026-12-29',
        clock_in: '09:00',
        clock_out: '13:00',
        observations: 'migrated',
        source: 'api',
      },
      {
        employee_id: '2',
        date: '2026-12-30',
        clock_in: '09:00',
        clock_out: '13:00',
        observations: 'migrated',
        source: 'api',
      },
    ]);
  });

  it('refuses a token when the plan changed underneath it and writes nothing', async () => {
    routeFetch({});
    const first = await call(range);
    const token = TOKEN.exec(first.content[0].text)?.[1];
    // Someone clocked a live shift on one of the planned days in the meantime.
    routeFetch({
      shifts: [
        { ...shiftsFixture.data[0], date: '2026-12-29', clock_in: '09:15', clock_out: '13:15' },
      ],
    });
    const second = await call({ ...range, confirmation_token: token });
    const text = second.content[0].text;
    expect(text).toMatch(/plan changed/);
    expect(text).toContain('2026-12-29 09:00-13:00 overlaps existing 09:15-13:15');
    expect(text).toMatch(TOKEN);
    expect(posts()).toEqual([]);
  });

  it('reports a partial write honestly and stops at the first failure', async () => {
    let count = 0;
    mockFetch.mockImplementation(
      async (input: string, init?: { method?: string; body?: string }) => {
        const url = new URL(input);
        if (init?.method === 'POST') {
          count++;
          if (count === 2) {
            return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
          }
          const body = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
          return {
            ok: true,
            status: 201,
            json: async () => ({ ...shiftsFixture.data[0], ...body, id: String(count) }),
          };
        }
        const ok = (json: unknown) => ({
          ok: true,
          status: 200,
          json: async () => json,
          text: async () => '',
        });
        if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
        if (url.pathname.endsWith('/attendance/worked_times'))
          return ok({ data: workedFixture.data });
        if (url.pathname.endsWith('/attendance/estimated_times'))
          return ok({ data: estimatedFixture.data });
        if (url.pathname.endsWith('/attendance/shifts')) return ok({ data: [] });
        if (url.pathname.endsWith('/timeoff/leaves')) return ok({ data: [] });
        throw new Error(`unexpected ${url.pathname}`);
      }
    );
    const first = await call(range);
    const token = TOKEN.exec(first.content[0].text)?.[1];
    const second = await call({ ...range, confirmation_token: token });
    const text = second.content[0].text;
    expect(text).toContain('Wrote 1 of 3 shift records');
    expect(text).toMatch(/Stopped at 2026-12-29 09:00-13:00/);
    expect(text).toContain('1 further records were not attempted');
    expect(text).toMatch(/Re-running the identical call is safe/);
    expect(text).toMatch(/does not protect against another writer/);
  });

  it('gates a single-record write for another person when no identity is configured', async () => {
    routeFetch({});
    const result = await call({
      action: 'create',
      employee_id: 2,
      date: '2026-12-29',
      clock_in: '09:00',
      clock_out: '13:00',
    });
    expect(result.content[0].text).toContain(
      'Create shift for Placeholder Person (2) on 2026-12-29 09:00-13:00'
    );
    expect(result.content[0].text).toMatch(TOKEN);
    expect(posts()).toEqual([]);
  });

  it('lets the configured identity clock in without a token but gates a colleague', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
    mockFetch.mockImplementation(
      async (input: string, init?: { method?: string; body?: string }) => {
        const url = new URL(input);
        const ok = (json: unknown, status = 200) => ({
          ok: true,
          status,
          json: async () => json,
          text: async () => '',
        });
        if (init?.method === 'POST' && url.pathname.endsWith('/attendance/shifts/clock_in')) {
          return ok({ ...shiftsFixture.data[0], clock_out: null, minutes: null }, 201);
        }
        if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
        if (url.pathname.endsWith('/employees/employees/3'))
          return ok({ ...EMPLOYEE, id: '3', full_name: 'Other Colleague' });
        throw new Error(`unexpected ${init?.method ?? 'GET'} ${url.pathname}`);
      }
    );

    const self = await call({ action: 'clock_in' });
    expect(self.content[0].text).toMatch(
      /Clock in recorded for Placeholder Person \(2\) at 2027-01-15T/
    );
    const sent = posts();
    expect(sent).toHaveLength(1);
    expect(sent[0].employee_id).toBe('2');
    expect(String(sent[0].now)).toMatch(/^2027-01-15T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

    const colleague = await call({ action: 'clock_in', employee_id: 3 });
    expect(colleague.content[0].text).toContain('Clock in Other Colleague (3) now');
    expect(colleague.content[0].text).toMatch(TOKEN);
    expect(posts()).toHaveLength(1);
  });

  it('delete of a foreign shift needs confirm: true and then a token; update needs a token', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '3');
    const foreign = { ...shiftsFixture.data[0], id: '77', employee_id: '2' };
    mockFetch.mockImplementation(async (input: string, init?: { method?: string }) => {
      const url = new URL(input);
      const ok = (json: unknown) => ({
        ok: true,
        status: 200,
        json: async () => json,
        text: async () => '',
      });
      if (init?.method === 'DELETE' || init?.method === 'PATCH')
        throw new Error('write reached the API');
      if (url.pathname.endsWith('/attendance/shifts/77')) return ok(foreign);
      if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
      throw new Error(`unexpected ${url.pathname}`);
    });

    const noConfirm = await call({ action: 'delete', id: 77 });
    expect(noConfirm.content[0].text).toMatch(/confirm: true/);

    const confirmed = await call({ action: 'delete', id: 77, confirm: true });
    expect(confirmed.content[0].text).toContain('Delete shift 77 of Placeholder Person (2)');
    expect(confirmed.content[0].text).toMatch(TOKEN);

    const update = await call({ action: 'update', id: 77, clock_out: '14:00' });
    expect(update.content[0].text).toContain('Update shift 77 of Placeholder Person (2)');
    expect(update.content[0].text).toMatch(TOKEN);
  });

  it('errors clearly on a malformed FACTORIAL_EMPLOYEE_ID', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', 'me');
    routeFetch({});
    const result = await call({ action: 'status' });
    expect(result.content[0].text).toMatch(/FACTORIAL_EMPLOYEE_ID must be a positive integer/);
  });

  it('status names the configured identity and reports the open shift', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
    routeFetch({
      openShifts: [
        {
          id: '201',
          employee_id: '2',
          date: '2027-01-15',
          reference_date: '2027-01-15',
          clock_in: '2000-01-01T08:31:00.000Z',
          clock_out: null,
          status: 'opened',
          workable: true,
          automatic_clock_in: false,
          location_type: null,
          workplace_id: null,
          time_settings_break_configuration_id: null,
        },
      ],
    });
    const result = await call({ action: 'status' });
    const text = result.content[0].text;
    expect(text).toContain('Configured identity: Placeholder Person (2)');
    expect(text).toContain('clocked in since 08:31 on 2027-01-15');
  });

  it('gaps lists only workdays with missing hours', async () => {
    routeFetch({});
    const result = await call({
      action: 'gaps',
      employee_id: 2,
      start_on: '2026-12-21',
      end_on: '2026-12-31',
    });
    const text = result.content[0].text;
    expect(text).toContain('3 days with missing hours for Placeholder Person (2), 12h in total');
    expect(text).toContain('2026-12-28');
    expect(text).not.toContain('2026-12-25');
    expect(text).not.toContain('2026-12-26');
  });

  it('audit lists every day in the range with a status and a machine-readable ledger', async () => {
    routeFetch({
      shifts: [
        {
          ...shiftsFixture.data[0],
          date: '2026-12-28',
          clock_in: '09:02',
          clock_out: '13:05',
          minutes: 243,
        },
      ],
    });
    const result = await call({
      action: 'audit',
      employee_id: 2,
      start_on: '2026-12-24',
      end_on: '2026-12-31',
    });
    const text = result.content[0].text;
    expect(text).toContain('Attendance audit for Placeholder Person (2), 2026-12-24 to 2026-12-31');
    expect(text).toMatch(/2026-12-25\s+bank_holiday\s+bank_holiday/);
    expect(text).toMatch(/2026-12-26\s+saturday\s+weekend/);
    expect(text).toMatch(/2026-12-28\s+workday\s+missing.*09:02-13:05/);
    const json = JSON.parse(
      text.slice(text.indexOf('Machine-readable ledger:') + 'Machine-readable ledger:'.length)
    );
    expect(json).toHaveLength(8);
    expect(json.find((d: { date: string }) => d.date === '2026-12-28').shifts[0].minutes).toBe(243);
  });

  it('log_range with jitter previews the exact varied times and writes those same times', async () => {
    routeFetch({});
    const args = { ...range, jitter_minutes: 6 };
    const first = await call(args);
    const text = first.content[0].text;
    expect(text).toContain('varies by up to 6 minutes');
    const listed = [...text.matchAll(/^\s{4}(2026-12-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2})$/gm)].map(
      m => `${m[1]} ${m[2]}-${m[3]}`
    );
    expect(listed).toHaveLength(3);
    expect(listed.some(l => !l.endsWith('09:00-13:00'))).toBe(true);
    const token = TOKEN.exec(text)?.[1];
    await call({ ...args, confirmation_token: token });
    expect(posts().map(p => `${p.date} ${p.clock_in}-${p.clock_out}`)).toEqual(listed);
  });

  it('log_days writes a bank holiday someone worked but refuses a future date', async () => {
    routeFetch({});
    const args = {
      action: 'log_days',
      employee_id: 2,
      days: [
        { date: '2026-12-25', segments: [{ clock_in: '09:00', clock_out: '13:00' }] },
        { date: '2027-02-01', segments: [{ clock_in: '09:00', clock_out: '13:00' }] },
      ],
    };
    const first = await call(args);
    const text = first.content[0].text;
    expect(text).toContain('1 days to write, 1 shift records, 4h');
    expect(text).toMatch(/1 in the future \(2027-02-01\)/);
    const token = TOKEN.exec(text)?.[1];
    await call({ ...args, confirmation_token: token });
    expect(posts().map(p => p.date)).toEqual(['2026-12-25']);
  });
});
