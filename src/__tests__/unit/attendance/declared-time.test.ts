import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import shiftsFixture from '../../fixtures/shifts.json' with { type: 'json' };

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerAttendanceTool } = await import('../../../tools/attendance.js');
const { confirmationManager } = await import('../../../confirmation.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');
const { declaredMoment } = await import('../../../attendance/planner.js');

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

const EMPLOYEE = {
  id: '2',
  first_name: 'Placeholder',
  last_name: 'Person',
  full_name: 'Placeholder Person',
};

/** Route mocked fetches by URL, for the clock_in/clock_out declared-moment paths */
function routeFetch(routes: { openShifts?: unknown[] }) {
  mockFetch.mockImplementation(async (input: string, init?: { method?: string; body?: string }) => {
    const url = new URL(input);
    const path = url.pathname;
    const ok = (json: unknown, status = 200) => ({
      ok: true,
      status,
      json: async () => json,
      text: async () => '',
    });
    if (init?.method === 'POST' && path.endsWith('/attendance/shifts/clock_in')) {
      const body = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
      return ok(
        { ...shiftsFixture.data[0], ...body, id: '901', clock_out: null, minutes: null },
        201
      );
    }
    if (init?.method === 'POST' && path.endsWith('/attendance/shifts/clock_out')) {
      const body = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
      return ok({ ...shiftsFixture.data[0], ...body, id: '902', minutes: 60 }, 201);
    }
    if (path.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
    if (path.endsWith('/attendance/open_shifts')) return ok({ data: routes.openShifts ?? [] });
    throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${path}`);
  });
}

function posts(): Array<Record<string, unknown>> {
  return mockFetch.mock.calls
    .filter(([, init]) => (init as { method?: string } | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse((init as { body: string }).body) as Record<string, unknown>);
}

describe('declaredMoment', () => {
  it('builds a local Date from a company-local day and wall-clock time', () => {
    const d = declaredMoment('2026-03-02', '09:00');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('rejects a malformed date or time', () => {
    expect(() => declaredMoment('2026-3-2', '09:00')).toThrow();
    expect(() => declaredMoment('2026-03-02', '9:00')).toThrow();
    expect(() => declaredMoment('2026-03-02', '24:00')).toThrow();
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    // Date.parse silently rolls 2026-02-30 over into 2026-03-02; a typo must
    // never write to a different day than the one the caller typed.
    expect(() => declaredMoment('2026-02-30', '09:00')).toThrow();
    expect(() => declaredMoment('2026-13-01', '09:00')).toThrow();
    // 2025 is not a leap year, so February has 28 days.
    expect(() => declaredMoment('2025-02-29', '09:00')).toThrow();
  });

  it('accepts a real leap day', () => {
    const d = declaredMoment('2024-02-29', '09:00');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });
});

describe('clock_in and clock_out with a declared moment', () => {
  let call: Handler;

  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
    clearResolvedNames();
    confirmationManager.clear();
    // The configured identity clocks itself in/out without a confirmation
    // token, which keeps these tests focused on the declared-moment behaviour
    // rather than the target-identity gate (already covered elsewhere).
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
    vi.useFakeTimers({ toFake: ['Date'] });
    // Wall clock is 14:00 local on 2027-01-15, well after any declared moment
    // used below on the same day.
    vi.setSystemTime(new Date(2027, 0, 15, 14, 0, 0));
    call = captureHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses date or time given alone, without writing anything', async () => {
    routeFetch({});
    // Warm the employee-name cache first (a read, and not the thing under
    // test) so the assertion below isolates the together-refusal itself.
    await call({ action: 'clock_in', date: '2027-01-15', time: '10:00' });
    mockFetch.mockClear();

    const dateOnly = await call({ action: 'clock_in', date: '2027-01-15' });
    expect(dateOnly.content[0].text).toMatch(/date and time must be given together/);
    expect(mockFetch).not.toHaveBeenCalled();

    const timeOnly = await call({ action: 'clock_out', time: '09:00' });
    expect(timeOnly.content[0].text).toMatch(/date and time must be given together/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('records the declared time rather than the current moment', async () => {
    routeFetch({});
    const result = await call({ action: 'clock_in', date: '2027-01-15', time: '09:00' });
    expect(result.content[0].text).toContain('Clock in recorded for Placeholder Person (2) at');
    expect(result.content[0].text).toMatch(/2027-01-15T09:00:00[+-]\d{2}:\d{2}/);
    const sent = posts();
    expect(sent).toHaveLength(1);
    expect(String(sent[0].now)).toMatch(/^2027-01-15T09:00:00[+-]\d{2}:\d{2}$/);
  });

  it('refuses a declared moment in the future without sending a request', async () => {
    routeFetch({});
    // Warm the employee-name cache so the assertion below isolates the
    // future-moment refusal rather than the (harmless, read-only) name lookup.
    await call({ action: 'clock_in', date: '2027-01-15', time: '10:00' });
    mockFetch.mockClear();

    const laterToday = await call({ action: 'clock_in', date: '2027-01-15', time: '23:59' });
    expect(laterToday.content[0].text).toMatch(/is in the future/);
    expect(mockFetch).not.toHaveBeenCalled();

    const futureDate = await call({ action: 'clock_out', date: '2027-01-16', time: '09:00' });
    expect(futureDate.content[0].text).toMatch(/is in the future/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("closes yesterday's open shift at the declared time and creates no second record", async () => {
    routeFetch({
      openShifts: [
        {
          id: '801',
          employee_id: '2',
          date: '2027-01-14',
          reference_date: '2027-01-14',
          clock_in: '2000-01-01T09:00:00.000Z',
          clock_out: null,
          status: 'opened',
          workable: true,
          location_type: null,
          workplace_id: null,
          time_settings_break_configuration_id: null,
        },
      ],
    });
    const result = await call({ action: 'clock_out', date: '2027-01-14', time: '18:00' });
    expect(result.content[0].text).toContain('Clock out recorded for Placeholder Person (2) at');
    const allPosts = mockFetch.mock.calls.filter(
      ([, init]) => (init as { method?: string } | undefined)?.method === 'POST'
    );
    expect(allPosts).toHaveLength(1);
    expect(String(allPosts[0][0])).toContain('/attendance/shifts/clock_out');
    const body = JSON.parse((allPosts[0][1] as { body: string }).body) as Record<string, unknown>;
    expect(String(body.now)).toMatch(/^2027-01-14T18:00:00[+-]\d{2}:\d{2}$/);
  });

  it('refuses to clock out before the open shift started', async () => {
    routeFetch({
      openShifts: [
        {
          id: '802',
          employee_id: '2',
          date: '2027-01-15',
          reference_date: '2027-01-15',
          clock_in: '2000-01-01T09:00:00.000Z',
          clock_out: null,
          status: 'opened',
          workable: true,
          location_type: null,
          workplace_id: null,
          time_settings_break_configuration_id: null,
        },
      ],
    });
    const result = await call({ action: 'clock_out', date: '2027-01-15', time: '08:00' });
    expect(result.content[0].text).toMatch(/is before the open shift started/);
    expect(posts()).toEqual([]);
  });

  it('refuses to clock out when nothing is open', async () => {
    routeFetch({ openShifts: [] });
    const result = await call({ action: 'clock_out', date: '2027-01-15', time: '10:00' });
    expect(result.content[0].text).toMatch(/Nothing is open for Placeholder Person \(2\)/);
    expect(posts()).toEqual([]);
  });

  it('is unchanged when date and time are absent', async () => {
    routeFetch({});
    const result = await call({ action: 'clock_in' });
    expect(result.content[0].text).toMatch(
      /Clock in recorded for Placeholder Person \(2\) at 2027-01-15T14:00:00/
    );
    const sent = posts();
    expect(sent).toHaveLength(1);
    expect(String(sent[0].now)).toMatch(/^2027-01-15T14:00:00[+-]\d{2}:\d{2}$/);
  });
});
