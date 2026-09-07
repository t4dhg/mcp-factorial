import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import shiftsFixture from '../../fixtures/shifts.json' with { type: 'json' };
import estimatedFixture from '../../fixtures/estimated-times.json' with { type: 'json' };
import workedFixture from '../../fixtures/worked-times.json' with { type: 'json' };
import leavesFixture from '../../fixtures/leaves.json' with { type: 'json' };

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerAttendanceTool } = await import('../../../tools/attendance.js');
const { confirmationManager } = await import('../../../confirmation.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');
const { enumerateDates } = await import('../../../attendance/planner.js');

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

/** Sibling of captureHandler that keeps the registered config instead of discarding it */
function captureConfig(): {
  description: string;
  inputSchema: Record<string, { description?: string }>;
} {
  let config: { description: string; inputSchema: Record<string, unknown> } | undefined;
  const fake = {
    registerTool: (_name: string, cfg: typeof config, _fn: unknown) => {
      config = cfg;
    },
  } as unknown as McpServer;
  registerAttendanceTool(fake);
  if (!config) throw new Error('tool not registered');
  return config as never;
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
  reviews?: unknown[];
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
    if (path.endsWith('/attendance/reviews')) return ok({ data: routes.reviews ?? [] });
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

  it('list defaults to the configured identity and says so; [] asks for the whole company', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
    routeFetch({ shifts: [shiftsFixture.data[0]] });
    const mine = await call({ action: 'list', start_on: '2026-12-01', end_on: '2026-12-31' });
    expect(mine.content[0].text).toContain('Found 1 shift for employee 2 (');
    const listUrl = new URL(
      mockFetch.mock.calls.find(([u]) => /attendance\/shifts/.test(u as string))![0] as string
    );
    expect(listUrl.searchParams.getAll('employee_ids[]')).toEqual(['2']);

    mockFetch.mockClear();
    const everyone = await call({
      action: 'list',
      employee_ids: [],
      start_on: '2026-12-01',
      end_on: '2026-12-31',
    });
    expect(everyone.content[0].text).toContain('company-wide (employee_ids: [] was passed)');
    const allUrl = new URL(
      mockFetch.mock.calls.find(([u]) => /attendance\/shifts/.test(u as string))![0] as string
    );
    expect(allUrl.searchParams.getAll('employee_ids[]')).toEqual([]);
  });

  it('list without a configured identity is company-wide and says so', async () => {
    routeFetch({ shifts: [shiftsFixture.data[0]] });
    const result = await call({ action: 'list', start_on: '2026-12-01', end_on: '2026-12-31' });
    expect(result.content[0].text).toContain(
      'company-wide (no employee filter and FACTORIAL_EMPLOYEE_ID is not set)'
    );
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
    // The overlap list now collapses to a per-day count instead of a
    // per-segment line; this pins what the collapsed line actually renders.
    // Singular counts get singular nouns: "1 segment on 1 day", not
    // "1 segments on 1 days".
    expect(text).toContain('1 segment on 1 day overlap existing shifts and are skipped:');
    expect(text).toContain('2026-12-29  1 segment already covered');
    expect(text).toMatch(TOKEN);
    expect(posts()).toEqual([]);
  });

  it('reports a partial write honestly, attempting every record instead of stopping', async () => {
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
        if (url.pathname.endsWith('/attendance/reviews')) return ok({ data: [] });
        throw new Error(`unexpected ${url.pathname}`);
      }
    );
    const first = await call(range);
    const token = TOKEN.exec(first.content[0].text)?.[1];
    const second = await call({ ...range, confirmation_token: token });
    const text = second.content[0].text;
    expect(text).toContain('Wrote 2 of 3 shift records');
    expect(text).toContain('1 record failed:');
    expect(text).toMatch(/2026-12-29 09:00-13:00: boom/);
    expect(text).not.toMatch(/Stopped at/);
    expect(text).not.toMatch(/not attempted/);
    expect(text).toMatch(/Re-running the identical call is safe/);
    expect(text).toMatch(/does not protect against another writer/);
    // The whole point of attempting every record: a write after an earlier
    // failure still lands, and shows up as written.
    expect(text).toMatch(/2026-12-30 09:00-13:00/);
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

  const auditShifts = [
    {
      ...shiftsFixture.data[0],
      date: '2026-12-28',
      clock_in: '09:02',
      clock_out: '13:05',
      minutes: 243,
    },
  ];
  const audit = { action: 'audit', employee_id: 2, start_on: '2026-12-24', end_on: '2026-12-31' };

  it('audit defaults to a summary: the header, what was read, and only the days needing attention', async () => {
    routeFetch({ shifts: auditShifts });
    const text = (await call(audit)).content[0].text;
    expect(text).toContain('Attendance audit for Placeholder Person (2), 2026-12-24 to 2026-12-31');
    expect(text).toContain(
      'Data read: contract data for 8 of 8 days, 0 leave records, 1 shift record, 0 signed-off days.'
    );
    expect(text).toMatch(/2026-12-28\s+workday\s+missing.*09:02-13:05/);
    // Weekends, complete days, and bank holidays are counted in the summary
    // line, not listed
    expect(text).not.toMatch(/2026-12-26\s+saturday/);
    expect(text).not.toMatch(/2026-12-25\s+bank_holiday\s+bank_holiday/);
    expect(text).toMatch(/2 weekend/);
    expect(text).toMatch(/3 bank_holiday/);
    expect(text).not.toContain('Machine-readable ledger');
    expect(text).toContain('format: "table"');
  });

  it('audit format table lists every day and format json returns the full ledger', async () => {
    routeFetch({ shifts: auditShifts });
    const table = (await call({ ...audit, format: 'table' })).content[0].text;
    expect(table).toMatch(/2026-12-26\s+saturday\s+weekend/);
    expect(table).toMatch(/2026-12-28\s+workday\s+missing.*09:02-13:05/);
    expect(table).not.toContain('Machine-readable ledger');

    const jsonText = (await call({ ...audit, format: 'json' })).content[0].text;
    const json = JSON.parse(
      jsonText.slice(
        jsonText.indexOf('Machine-readable ledger:') + 'Machine-readable ledger:'.length
      )
    );
    expect(json).toHaveLength(8);
    expect(json.find((d: { date: string }) => d.date === '2026-12-28').shifts[0].minutes).toBe(243);
  });

  // Regression for the 10.1.0 bug: estimated_times and worked_times page at 100
  // days, the client read one page, and every day from the 101st on was
  // reported as not workable. This serves a 249-day window in three pages the
  // way the live API does and expects every day to be classified.
  it('audit over a 249-day window reads every page of the per-day endpoints', async () => {
    const dates = enumerateDates('2026-01-01', '2026-09-06');
    expect(dates).toHaveLength(249);
    const dayType = (date: string) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      return dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'workday';
    };
    const paged = (url: URL, rows: unknown[]) => {
      const page = Number(url.searchParams.get('page') ?? '1');
      const slice = rows.slice((page - 1) * 100, page * 100);
      return {
        data: slice,
        meta: { has_next_page: page * 100 < rows.length, total: rows.length, limit: 100 },
      };
    };
    const worked = dates.map(date => ({
      ...workedFixture.data[0],
      id: `2_${date}`,
      date,
      day_type: dayType(date),
      tracked_minutes: 0,
    }));
    const estimated = dates.map(date => ({
      ...estimatedFixture.data[0],
      id: `2_${date}`,
      date,
      expected_minutes: dayType(date) === 'workday' ? 480 : 0,
    }));
    mockFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
      if (url.pathname.endsWith('/attendance/worked_times')) return ok(paged(url, worked));
      if (url.pathname.endsWith('/attendance/estimated_times')) return ok(paged(url, estimated));
      if (url.pathname.endsWith('/attendance/shifts'))
        return ok({ data: [], meta: { has_next_page: false, paginateable: false } });
      if (url.pathname.endsWith('/timeoff/leaves'))
        return ok({ data: [], meta: { has_next_page: false, total: 0, limit: 100 } });
      if (url.pathname.endsWith('/attendance/reviews')) return ok({ data: [] });
      throw new Error(`unexpected ${url.pathname}`);
    });
    const text = (
      await call({ action: 'audit', employee_id: 2, start_on: '2026-01-01', end_on: '2026-09-06' })
    ).content[0].text;
    expect(text).toContain('Data read: contract data for 249 of 249 days');
    expect(text).not.toContain('no_contract_data');
    expect(text).not.toContain('unknown');
    const workdays = dates.filter(d => dayType(d) === 'workday').length;
    expect(text).toContain(`${workdays} missing`);
    expect(text).toContain(`Expected ${workdays * 8}h`);
    const perDayCalls = mockFetch.mock.calls.filter(([url]) =>
      /worked_times|estimated_times/.test(url as string)
    );
    expect(perDayCalls).toHaveLength(6);
  });

  it('audit names the days the API returned nothing for instead of calling them not workable', async () => {
    mockFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
      // Contract data starts on the 28th, as for someone hired that day
      if (url.pathname.endsWith('/attendance/worked_times'))
        return ok({ data: workedFixture.data.filter(d => d.date >= '2026-12-28') });
      if (url.pathname.endsWith('/attendance/estimated_times'))
        return ok({ data: estimatedFixture.data.filter(d => d.date >= '2026-12-28') });
      if (url.pathname.endsWith('/attendance/shifts')) return ok({ data: [] });
      if (url.pathname.endsWith('/timeoff/leaves')) return ok({ data: [] });
      if (url.pathname.endsWith('/attendance/reviews')) return ok({ data: [] });
      throw new Error(`unexpected ${url.pathname}`);
    });
    const text = (await call(audit)).content[0].text;
    expect(text).toContain('Data read: contract data for 4 of 8 days');
    expect(text).toContain('Days without contract data (2026-12-24 to 2026-12-27)');
    expect(text).toMatch(/2026-12-24\s+-\s+no_contract_data/);
    expect(text).not.toContain('not_workable');

    const preview = (await call(range)).content[0].text;
    expect(preview).toContain('Data read: contract data for 4 of 11 days');
    expect(preview).toMatch(/7 without contract data in Factorial/);
    expect(preview).not.toMatch(/not workable under the contract/);
  });

  it('log_range reads every page of leaves before deciding what is on leave', async () => {
    const filler = Array.from({ length: 100 }, (_, i) => ({
      ...leavesFixture.data[0],
      id: String(1000 + i),
      employee_id: '2',
      start_on: '2026-01-05',
      finish_on: '2026-01-05',
      half_day: null,
      approved: true,
      deleted_at: null,
    }));
    const december = {
      ...leavesFixture.data[0],
      id: '2000',
      employee_id: '2',
      start_on: '2026-12-29',
      finish_on: '2026-12-29',
      half_day: null,
      approved: true,
      deleted_at: null,
    };
    mockFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
      if (url.pathname.endsWith('/attendance/worked_times'))
        return ok({ data: workedFixture.data });
      if (url.pathname.endsWith('/attendance/estimated_times'))
        return ok({ data: estimatedFixture.data });
      if (url.pathname.endsWith('/attendance/shifts')) return ok({ data: [] });
      if (url.pathname.endsWith('/timeoff/leaves')) {
        const page = Number(url.searchParams.get('page') ?? '1');
        return ok(
          page === 1
            ? { data: filler, meta: { has_next_page: true, total: 101, limit: 100 } }
            : { data: [december], meta: { has_next_page: false, total: 101, limit: 100 } }
        );
      }
      if (url.pathname.endsWith('/attendance/reviews')) return ok({ data: [] });
      throw new Error(`unexpected ${url.pathname}`);
    });
    const text = (await call(range)).content[0].text;
    expect(text).toContain('2 days to write, 2 shift records, 8h');
    expect(text).toMatch(/1 approved leave \(2026-12-29\)/);
    expect(text).toContain('101 leave records');
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
    expect(text).toContain('1 day to write, 1 shift record, 4h');
    expect(text).toMatch(/1 in the future \(2027-02-01\)/);
    const token = TOKEN.exec(text)?.[1];
    await call({ ...args, confirmation_token: token });
    expect(posts().map(p => p.date)).toEqual(['2026-12-25']);
  });

  it('surfaces abortedEarly and notAttempted when failures abort the run', async () => {
    // log_days bypasses the weekend/holiday skip rules, so every one of these
    // 15 explicit days is planned; all fail, tripping the consecutive-failure
    // abort at 10 and leaving the last 5 unattempted.
    const days = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-12-${String(i + 1).padStart(2, '0')}`,
      segments: [{ clock_in: '09:00', clock_out: '17:00' }],
    }));
    routeFetch({
      shifts: [],
      onPost: () => {
        throw new Error('Factorial refused this write (HTTP 403).');
      },
    });
    const args = { action: 'log_days', employee_id: 2, days };
    const preview = (await call(args)).content[0].text;
    const token = TOKEN.exec(preview)?.[1];
    expect(token).toBeDefined();

    const text = (await call({ ...args, confirmation_token: token })).content[0].text;

    expect(text).toContain('Wrote 0 of 15 shift records');
    expect(text).toContain('10 records failed:');
    expect(text).toContain(
      'Stopped after 10 failures in a row, which points at the request rather than the records. ' +
        '5 records not attempted.'
    );
    expect(text).toMatch(/Re-running the identical call is safe/);
  });

  it('summarizes a bulk write by month once it exceeds 62 records, singular nouns for a 1-day month', async () => {
    // 63 records spread across four months, two of which land exactly one
    // day, to exercise both the plural and singular branches of the summary.
    const days = [
      { date: '2026-10-31', segments: [{ clock_in: '09:00', clock_out: '17:00' }] },
      ...Array.from({ length: 30 }, (_, i) => ({
        date: `2026-11-${String(i + 1).padStart(2, '0')}`,
        segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      })),
      ...Array.from({ length: 31 }, (_, i) => ({
        date: `2026-12-${String(i + 1).padStart(2, '0')}`,
        segments: [{ clock_in: '09:00', clock_out: '17:00' }],
      })),
      { date: '2027-01-01', segments: [{ clock_in: '09:00', clock_out: '17:00' }] },
    ];
    expect(days).toHaveLength(63);
    routeFetch({ shifts: [] });
    const args = { action: 'log_days', employee_id: 2, days };
    const preview = (await call(args)).content[0].text;
    const token = TOKEN.exec(preview)?.[1];
    expect(token).toBeDefined();

    const text = (await call({ ...args, confirmation_token: token })).content[0].text;

    expect(text).toContain('Wrote 63 of 63 shift records');
    expect(text).toContain('2026-10  1 day, 1 record, 8h');
    expect(text).toContain('2026-11  30 days, 30 records, 240h');
    expect(text).toContain('2026-12  31 days, 31 records, 248h');
    expect(text).toContain('2027-01  1 day, 1 record, 8h');
    // Per-record lines are the other branch of describeWrites; this run must
    // not fall back to them.
    expect(text).not.toContain('2026-11-01 09:00-17:00');
  });
});

describe('create_edit_request and list_edit_requests', () => {
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

  function jsonResponse(json: unknown) {
    return { ok: true, status: 200, json: async () => json, text: async () => '' };
  }

  it('previews an edit request before filing it, and files it on the second call', async () => {
    mockFetch.mockImplementation(async (input: string, init?: { method?: string }) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/employees/employees/2')) return jsonResponse(EMPLOYEE);
      if (init?.method === 'POST' && path.endsWith('/attendance/edit_timesheet_requests')) {
        return jsonResponse({ id: '6', request_type: 'create_shift', employee_id: '2' });
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const args = {
      action: 'create_edit_request',
      employee_id: 2,
      date: '2025-02-03',
      clock_in: '09:00',
      clock_out: '17:00',
      reason: 'Hours worked but never clocked',
    };

    const first = (await call(args)).content[0].text;
    expect(first).toContain('Nothing has been written');
    expect(first).toContain('2025-02-03');
    expect(first).toContain('Hours worked but never clocked');

    const token = TOKEN.exec(first)?.[1];
    const second = (await call({ ...args, confirmation_token: token })).content[0].text;
    expect(second).toContain('Edit request 6 filed');
  });

  it('refuses to file an edit request with no reason', async () => {
    const text = (await call({ action: 'create_edit_request', employee_id: 2, date: '2025-02-03' }))
      .content[0].text;
    expect(text).toContain('reason is required');
  });

  it('refuses to file a create_shift edit request with no date, before any token is issued', async () => {
    const text = (
      await call({ action: 'create_edit_request', employee_id: 2, reason: 'Forgot to clock in' })
    ).content[0].text;
    expect(text).toContain('date (YYYY-MM-DD) is required');
    expect(text).not.toMatch(TOKEN);
  });

  it('refuses to file an update_shift edit request with no attendance_shift_id', async () => {
    const text = (
      await call({
        action: 'create_edit_request',
        employee_id: 2,
        request_type: 'update_shift',
        reason: 'Wrong clock out time',
      })
    ).content[0].text;
    expect(text).toContain('attendance_shift_id is required');
    expect(text).not.toMatch(TOKEN);
  });

  it('refuses to file a delete_shift edit request with no attendance_shift_id', async () => {
    const text = (
      await call({
        action: 'create_edit_request',
        employee_id: 2,
        request_type: 'delete_shift',
        reason: 'Duplicate record',
      })
    ).content[0].text;
    expect(text).toContain('attendance_shift_id is required');
    expect(text).not.toMatch(TOKEN);
  });

  it('passes attendance_shift_id through to the created request for update_shift', async () => {
    let postedBody: Record<string, unknown> | undefined;
    mockFetch.mockImplementation(
      async (input: string, init?: { method?: string; body?: string }) => {
        const path = new URL(input).pathname;
        if (path.endsWith('/employees/employees/2')) return jsonResponse(EMPLOYEE);
        if (init?.method === 'POST' && path.endsWith('/attendance/edit_timesheet_requests')) {
          postedBody = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
          return jsonResponse({ id: '7', request_type: 'update_shift', employee_id: '2' });
        }
        throw new Error(`unexpected fetch ${path}`);
      }
    );

    const args = {
      action: 'create_edit_request',
      employee_id: 2,
      request_type: 'update_shift',
      attendance_shift_id: 42,
      clock_out: '18:00',
      reason: 'Left later than recorded',
    };
    const preview = (await call(args)).content[0].text;
    expect(preview).toContain('for shift 42');
    const token = TOKEN.exec(preview)?.[1];
    await call({ ...args, confirmation_token: token });
    // Identifier-shaped fields are stringified before the request body is
    // serialized (http-client.ts stringifyIdentifiers), matching how Factorial
    // returns ids, so the number the caller passed arrives on the wire as a string.
    expect(postedBody?.attendance_shift_id).toBe('42');
  });

  it('lists edit timesheet requests', async () => {
    mockFetch.mockImplementation(async (input: string) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/attendance/edit_timesheet_requests')) {
        return jsonResponse({
          data: [
            {
              id: '6',
              request_type: 'create_shift',
              employee_id: '2',
              date: '2025-02-03',
              clock_in: '09:00',
              clock_out: '17:00',
              approved: null,
              reason: 'Hours worked but never clocked',
            },
          ],
        });
      }
      throw new Error(`unexpected fetch ${path}`);
    });
    const text = (await call({ action: 'list_edit_requests', employee_id: 2 })).content[0].text;
    expect(text).toContain('1 edit timesheet requests');
    expect(text).toContain('2025-02-03');
    expect(text).toContain('pending');
  });

  it('reports no edit timesheet requests on record when there are none', async () => {
    mockFetch.mockImplementation(async (input: string) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/attendance/edit_timesheet_requests')) return jsonResponse({ data: [] });
      throw new Error(`unexpected fetch ${path}`);
    });
    const text = (await call({ action: 'list_edit_requests', employee_id: 2 })).content[0].text;
    expect(text).toBe('No edit timesheet requests on record.');
  });
});

describe('tool descriptions', () => {
  it('describes the confirmation flow and the time zone contract', () => {
    const { description } = captureConfig();
    expect(description).toContain('confirmation_token');
    expect(description).toContain('15 minutes');
    expect(description).toContain('company zone');
    expect(description).toContain('no_contract_data');
  });

  it('says jitter preserves each segment length, and points at variation_minutes', () => {
    const { inputSchema } = captureConfig();
    const jitter = inputSchema.jitter_minutes.description ?? '';
    expect(jitter).toContain('keeping its length');
    expect(jitter).toContain('variation_minutes');
  });

  it("warns that beggining_of_day is Factorial's own spelling", () => {
    const { inputSchema } = captureConfig();
    expect(inputSchema.half_day.description ?? '').toContain('do not correct it');
  });

  it('carries the declared time versus entry time passage', () => {
    const { description } = captureConfig();
    expect(description).toContain('Declared time versus entry time');
    expect(description).toContain(
      'Factorial sets created_at, updated_at, in_source and out_source on the server'
    );
    expect(description).toContain(
      'read-only through this API and no action here can set or change them'
    );
  });

  it('says fields returns eight fixed fields, not every field of the record', () => {
    const { inputSchema } = captureConfig();
    const fields = inputSchema.fields.description ?? '';
    expect(fields).toContain(
      '"full" (default) returns id, employee_id, date, clock_in, clock_out, minutes, ' +
        'in_source and observations'
    );
    expect(fields).toContain('Neither is every field of the raw record');
    expect(fields).not.toContain('every field of the record');
  });

  it('uses no em-dash in any description', () => {
    const { description, inputSchema } = captureConfig();
    const all = [description, ...Object.values(inputSchema).map(f => f.description ?? '')];
    for (const text of all) expect(text).not.toContain('—');
  });
});
