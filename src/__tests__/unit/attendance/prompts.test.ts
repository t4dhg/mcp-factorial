import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import shiftsFixture from '../../fixtures/shifts.json' with { type: 'json' };
import estimatedFixture from '../../fixtures/estimated-times.json' with { type: 'json' };
import workedFixture from '../../fixtures/worked-times.json' with { type: 'json' };

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerAttendancePrompts, parseSegmentsArg, defaultWindow, GUIDE_URI } =
  await import('../../../prompts/attendance.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');

type PromptHandler = (
  args: Record<string, string | undefined>
) => Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }>;
type ResourceHandler = (uri: URL) => { contents: Array<{ uri: string; text: string }> };

function capture() {
  const prompts = new Map<string, { config: Record<string, unknown>; handler: PromptHandler }>();
  const resources = new Map<string, { uri: string; handler: ResourceHandler }>();
  const fake = {
    registerPrompt: (name: string, config: Record<string, unknown>, handler: PromptHandler) => {
      prompts.set(name, { config, handler });
    },
    registerResource: (name: string, uri: string, _config: unknown, handler: ResourceHandler) => {
      resources.set(name, { uri, handler });
    },
  } as unknown as McpServer;
  registerAttendancePrompts(fake, { now: () => new Date() });
  return { prompts, resources };
}

const EMPLOYEE = { id: '2', first_name: 'P', last_name: 'P', full_name: 'Placeholder Person' };

function routeFetch(shifts: unknown[] = [], failPerDay = false) {
  mockFetch.mockImplementation(async (input: string, init?: { method?: string }) => {
    const url = new URL(input);
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
    if (init?.method && init.method !== 'GET') throw new Error(`unexpected write ${url.pathname}`);
    if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
    if (failPerDay && /worked_times|estimated_times/.test(url.pathname)) {
      return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    }
    if (url.pathname.endsWith('/attendance/worked_times')) return ok({ data: workedFixture.data });
    if (url.pathname.endsWith('/attendance/estimated_times'))
      return ok({ data: estimatedFixture.data });
    if (url.pathname.endsWith('/attendance/shifts')) return ok({ data: shifts });
    if (url.pathname.endsWith('/timeoff/leaves')) return ok({ data: [] });
    throw new Error(`unexpected ${url.pathname}`);
  });
}

function text(result: Awaited<ReturnType<PromptHandler>>): string {
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].role).toBe('user');
  return result.messages[0].content.text;
}

describe('parseSegmentsArg', () => {
  it('parses a comma-separated pattern', () => {
    expect(parseSegmentsArg('09:00-14:00, 15:00-18:00')).toEqual([
      { clock_in: '09:00', clock_out: '14:00' },
      { clock_in: '15:00', clock_out: '18:00' },
    ]);
    expect(parseSegmentsArg('09:00-17:00')).toEqual([{ clock_in: '09:00', clock_out: '17:00' }]);
    expect(parseSegmentsArg('09:00-14:00; 15:00-18:00')).toHaveLength(2);
  });

  it('accepts the JSON array the tool takes', () => {
    expect(
      parseSegmentsArg(
        '[{"clock_in":"09:00","clock_out":"14:00"},{"clock_in":"15:00","clock_out":"18:00"}]'
      )
    ).toHaveLength(2);
  });

  it('rejects malformed or overlapping patterns with a usable message', () => {
    expect(() => parseSegmentsArg('')).toThrow(/segments is required/);
    expect(() => parseSegmentsArg('9-14')).toThrow(/HH:MM-HH:MM/);
    expect(() => parseSegmentsArg('09:00-14:00, 13:00-18:00')).toThrow(/overlap/);
    expect(() => parseSegmentsArg('14:00-09:00')).toThrow(/ends before it starts/);
    expect(() => parseSegmentsArg('[{"clock_in":"09:00"}]')).toThrow(/clock_in and clock_out/);
  });
});

describe('defaultWindow', () => {
  it('runs from the first of the month to today', () => {
    expect(defaultWindow('2026-12-28')).toEqual({ start_on: '2026-12-01', end_on: '2026-12-28' });
  });
});

describe('attendance prompts', () => {
  let prompts: ReturnType<typeof capture>['prompts'];
  let resources: ReturnType<typeof capture>['resources'];

  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
    clearResolvedNames();
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '2');
    vi.useFakeTimers({ toFake: ['Date'] });
    // Midday UTC keeps the local date at 28 December in every zone the tests may run in
    vi.setSystemTime(new Date('2026-12-28T12:00:00Z'));
    ({ prompts, resources } = capture());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers three prompts and the guide resource', () => {
    expect([...prompts.keys()].sort()).toEqual([
      'attendance_audit',
      'attendance_fill',
      'attendance_today',
    ]);
    const guide = resources.get('registro_horario_guide');
    expect(guide?.uri).toBe(GUIDE_URI);
    const contents = guide!.handler(new URL(GUIDE_URI)).contents[0];
    expect(contents.uri).toBe(GUIDE_URI);
    expect(contents.text).toContain('# Registro horario with factorial_attendance');
    for (const status of ['no_contract_data', 'half_day_leave', 'not_workable']) {
      expect(contents.text).toContain(status);
    }
    expect(contents.text).toContain('confirmation_token');
    expect(contents.text).toContain('MCP has no scheduler');
  });

  it('audit prompt embeds the audit for the current month and instructs a read-only report', async () => {
    routeFetch();
    const out = text(await prompts.get('attendance_audit')!.handler({}));
    expect(out).toContain(
      'Audit the registro horario of Placeholder Person (2) from 2026-12-01 to 2026-12-28'
    );
    expect(out).toContain('Attendance audit for Placeholder Person (2), 2026-12-01 to 2026-12-28');
    expect(out).toContain('Data read: contract data for 8 of 28 days');
    expect(out).toMatch(/Write nothing/);
    expect(out).toContain('"format":"table"');
    expect(out).toContain(GUIDE_URI);
    expect(
      mockFetch.mock.calls.some(([, init]) => (init as { method?: string })?.method === 'POST')
    ).toBe(false);
  });

  it('audit prompt honours explicit dates and employee_id given as strings', async () => {
    routeFetch();
    const out = text(
      await prompts.get('attendance_audit')!.handler({
        start_on: '2026-12-24',
        end_on: '2026-12-31',
        employee_id: '2',
      })
    );
    expect(out).toContain('from 2026-12-24 to 2026-12-31');
    expect(out).toContain('Data read: contract data for 8 of 8 days');
  });

  it('fill prompt embeds the gaps and the exact log_range call with the parsed pattern', async () => {
    routeFetch();
    const out = text(
      await prompts.get('attendance_fill')!.handler({
        segments: '09:00-13:00',
        start_on: '2026-12-21',
        end_on: '2026-12-31',
        observations: 'Entered from calendar',
        jitter_minutes: '5',
      })
    );
    expect(out).toContain('with the daily pattern 09:00-13:00 (4h a day)');
    expect(out).toContain('1 days with missing hours for Placeholder Person (2), 4h in total.');
    const call = /factorial_attendance\((\{"action":"log_range".*?\})\)/.exec(out);
    expect(call).not.toBeNull();
    expect(JSON.parse(call![1])).toEqual({
      action: 'log_range',
      employee_id: 2,
      start_on: '2026-12-21',
      end_on: '2026-12-31',
      segments: [{ clock_in: '09:00', clock_out: '13:00' }],
      jitter_minutes: 5,
      observations: 'Entered from calendar',
    });
    expect(out).toMatch(/Ask them to confirm/);
    expect(out).toMatch(/Only after they confirm/);
    expect(out).toMatch(/Never invent hours/);
    expect(out).toContain('"action":"log_days"');
  });

  it('fill prompt rejects a malformed pattern before reading anything', async () => {
    routeFetch();
    await expect(
      prompts.get('attendance_fill')!.handler({ segments: 'nine to five' })
    ).rejects.toThrow(/HH:MM-HH:MM/);
  });

  it("today prompt embeds today's status and the log_days call bound to today", async () => {
    routeFetch();
    const out = text(await prompts.get('attendance_today')!.handler({ segments: '09:00-13:00' }));
    expect(out).toContain(
      "Record today's registro horario (2026-12-28) for Placeholder Person (2)"
    );
    expect(out).toContain(
      'Today 2026-12-28 for Placeholder Person (2): status missing, no shifts on record.'
    );
    const call = /factorial_attendance\((\{"action":"log_days".*?\})\)/.exec(out);
    expect(JSON.parse(call![1])).toEqual({
      action: 'log_days',
      employee_id: 2,
      days: [{ date: '2026-12-28', segments: [{ clock_in: '09:00', clock_out: '13:00' }] }],
      jitter_minutes: 8,
      observations: 'Daily record',
    });
    expect(out).toMatch(/only when the employee is the configured identity/);
    expect(out).not.toMatch(/an explicit employee_id was given/);
  });

  it('today prompt shows the shift already on record and warns when an explicit employee is given', async () => {
    routeFetch([
      { ...shiftsFixture.data[0], date: '2026-12-28', clock_in: '09:00', clock_out: '11:00' },
    ]);
    const out = text(
      await prompts.get('attendance_today')!.handler({ segments: '09:00-13:00', employee_id: '2' })
    );
    expect(out).toContain('status missing, shifts on record 09:00-11:00');
    expect(out).toMatch(/an explicit employee_id was given/);
  });

  it('still returns the procedure when the pre-read fails, saying what failed', async () => {
    routeFetch([], true);
    const out = text(await prompts.get('attendance_audit')!.handler({}));
    expect(out).toContain('The server could not pre-read the audit:');
    expect(out).toMatch(/Run the corresponding factorial_attendance call yourself/);
    expect(out).toMatch(/Write nothing/);
  });

  it('fails clearly when no employee can be resolved', async () => {
    vi.stubEnv('FACTORIAL_EMPLOYEE_ID', '');
    ({ prompts } = capture());
    routeFetch();
    await expect(prompts.get('attendance_audit')!.handler({})).rejects.toThrow();
  });
});
