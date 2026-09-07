import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import shiftsFixture from '../../fixtures/shifts.json' with { type: 'json' };
import estimatedFixture from '../../fixtures/estimated-times.json' with { type: 'json' };
import workedFixture from '../../fixtures/worked-times.json' with { type: 'json' };

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const {
  registerAttendancePrompts,
  parseSegmentsArg,
  defaultWindow,
  GUIDE_URI,
  REGISTRO_HORARIO_GUIDE,
} = await import('../../../prompts/attendance.js');
const { clearResolvedNames } = await import('../../../attendance/identity.js');
const { clearCache } = await import('../../../api.js');

const PROMPT_NAMES = [
  'attendance_audit',
  'attendance_fill',
  'attendance_today',
  'attendance_reconcile',
  'attendance_fill_days',
];

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

function routeFetch(
  shifts: unknown[] = [],
  failPerDay = false,
  workedMinutesByDate: Record<string, number> = {}
) {
  mockFetch.mockImplementation(async (input: string, init?: { method?: string }) => {
    const url = new URL(input);
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
    if (init?.method && init.method !== 'GET') throw new Error(`unexpected write ${url.pathname}`);
    if (url.pathname.endsWith('/employees/employees/2')) return ok(EMPLOYEE);
    if (failPerDay && /worked_times|estimated_times/.test(url.pathname)) {
      return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    }
    if (url.pathname.endsWith('/attendance/worked_times')) {
      const data =
        Object.keys(workedMinutesByDate).length === 0
          ? workedFixture.data
          : workedFixture.data.map(d =>
              d.date in workedMinutesByDate
                ? {
                    ...d,
                    tracked_minutes: workedMinutesByDate[d.date],
                    minutes: workedMinutesByDate[d.date],
                  }
                : d
            );
      return ok({ data });
    }
    if (url.pathname.endsWith('/attendance/estimated_times'))
      return ok({ data: estimatedFixture.data });
    if (url.pathname.endsWith('/attendance/shifts')) return ok({ data: shifts });
    if (url.pathname.endsWith('/timeoff/leaves')) return ok({ data: [] });
    if (url.pathname.endsWith('/attendance/reviews')) return ok({ data: [] });
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

describe('the guide', () => {
  const required = [
    'short',
    'signed off',
    'variation_minutes',
    'company zone',
    'Example report',
    'one employee',
  ];
  it.each(required)('covers %s', topic => {
    expect(REGISTRO_HORARIO_GUIDE).toContain(topic);
  });

  it('uses no em-dash', () => {
    expect(REGISTRO_HORARIO_GUIDE).not.toContain('—');
  });

  it('distinguishes missing from short and teaches signed off separately from status', () => {
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/missing \(nothing on record at all\)/);
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/short \(hours tracked but under expected/);
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/create_edit_request/);
  });

  it('explains jitter_minutes and variation_minutes are for different things', () => {
    expect(REGISTRO_HORARIO_GUIDE).toMatch(
      /jitter_minutes.*varies segments within a day and cannot make the start time drift/
    );
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/variation_minutes.*moves a whole day together/);
  });

  it('prefers exclude_dates over splitting a range in Workflow B', () => {
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/exclude_dates.*Prefer this to narrowing the range/);
  });

  it('explains that backfilled records and the activity log both stay correct', () => {
    expect(REGISTRO_HORARIO_GUIDE).toMatch(
      /Backfilled records show the real working day and hours on the attendance sheet/
    );
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/entered later through the API/);
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/Both are correct, and neither can be altered/);
  });

  it('does not document date/time arguments on clock_in or clock_out', () => {
    expect(REGISTRO_HORARIO_GUIDE).not.toMatch(/clock_in.*\bdate\b/);
  });

  it('treats over as an anomaly that exceeds the tolerance, never as normal rounding', () => {
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/over.*exceed expected by more than the tolerance/);
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/forgotten clock-out/);
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/entered twice/);
    expect(REGISTRO_HORARIO_GUIDE).toMatch(/never delete or overwrite records to correct one/);
    // The exact defect that shipped: dismissing an excess above the tolerance as benign.
    expect(REGISTRO_HORARIO_GUIDE).not.toMatch(/is normal/);
    expect(REGISTRO_HORARIO_GUIDE).not.toMatch(/tolerance already allows for it/);
  });

  it('the worked example day counts sum to the window length', () => {
    const need = (pattern: RegExp): number => {
      const match = pattern.exec(REGISTRO_HORARIO_GUIDE);
      expect(match).not.toBeNull();
      return Number(match![1]);
    };
    const complete = need(/(\d+) days? complete,/);
    const bankHolidays = need(/(\d+) bank holidays,/);
    const weekend = need(/(\d+) weekend days,/);
    const onLeave = need(/(\d+) on leave\./);
    const missing = need(/(\d+) days? missing entirely/);
    const short = need(/(\d+) days? short, tracked but under expected/);
    const over = need(/(\d+) days? over by more than the tolerance/);
    expect(complete + bankHolidays + weekend + onLeave + missing + short + over).toBe(249);
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

  it('registers five prompts and the guide resource', () => {
    expect([...prompts.keys()].sort()).toEqual([...PROMPT_NAMES].sort());
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

  it('publishes every prompt body as a readable resource', () => {
    const uris = [...resources.values()].map(r => r.uri);
    for (const name of PROMPT_NAMES) {
      expect(prompts.has(name)).toBe(true);
      expect(uris).toContain(`factorial://prompts/${name}`);
    }
  });

  it('serves the procedure text when the resource is read', () => {
    const entry = [...resources.values()].find(
      r => r.uri === 'factorial://prompts/attendance_audit'
    );
    expect(entry).toBeDefined();
    const out = entry!.handler(new URL(entry!.uri)).contents[0].text;
    expect(out).toContain('Data read');
    expect(out).toMatch(/missing day \(nothing on record\)/);
    expect(out).toMatch(/short day \(some hours, not enough\)/);
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
    expect(out).toContain('1 day with missing hours for Placeholder Person (2), 4h in total.');
    const call = /factorial_attendance\((\{"action":"log_range".*?\})\)/.exec(out);
    expect(call).not.toBeNull();
    expect(JSON.parse(call![1])).toEqual({
      action: 'log_range',
      employee_id: 2,
      start_on: '2026-12-21',
      end_on: '2026-12-31',
      segments: [{ clock_in: '09:00', clock_out: '13:00' }],
      jitter_minutes: 5,
      variation_minutes: 0,
      observations: 'Entered from calendar',
    });
    expect(out).toMatch(/Ask them to confirm/);
    expect(out).toMatch(/Only after they confirm/);
    expect(out).toMatch(/Never invent hours/);
    expect(out).toContain('"action":"log_days"');
  });

  it('fill prompt passes variation_minutes through to the log_range call', async () => {
    routeFetch();
    const out = text(
      await prompts.get('attendance_fill')!.handler({
        segments: '09:00-13:00',
        start_on: '2026-12-21',
        end_on: '2026-12-31',
        jitter_minutes: '5',
        variation_minutes: '10',
      })
    );
    const call = /factorial_attendance\((\{"action":"log_range".*?\})\)/.exec(out);
    expect(call).not.toBeNull();
    expect(JSON.parse(call![1])).toMatchObject({ jitter_minutes: 5, variation_minutes: 10 });
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

  it('audit prompt lists missing and short days separately rather than as one combined status', async () => {
    routeFetch();
    const out = text(await prompts.get('attendance_audit')!.handler({}));
    expect(out).toMatch(/missing day \(nothing on record\) separately from every short day/);
  });

  it('reconcile lists only the days that disagree with the stated absences', async () => {
    routeFetch();
    const out = text(
      await prompts.get('attendance_reconcile')!.handler({
        known_absences: '12 March was a day off',
        start_on: '2026-03-01',
        end_on: '2026-03-31',
      })
    );
    expect(out).toContain('12 March was a day off');
    expect(out).toContain('disagree');
    expect(out).not.toMatch(/Write nothing\. This is a read-only report\./);
    expect(out).toMatch(/Write nothing\. This is a read-only reconciliation\./);
  });

  it('fill_days prompt builds a single log_days call from explicit day entries', async () => {
    routeFetch();
    const days = JSON.stringify([
      { date: '2026-12-24', segments: '09:00-13:00' },
      { date: '2026-12-28', segments: '09:00-14:00, 15:00-18:00' },
    ]);
    const out = text(await prompts.get('attendance_fill_days')!.handler({ days }));
    const call = /factorial_attendance\((\{"action":"log_days".*?\})\)/.exec(out);
    expect(call).not.toBeNull();
    expect(JSON.parse(call![1])).toEqual({
      action: 'log_days',
      employee_id: 2,
      days: [
        { date: '2026-12-24', segments: [{ clock_in: '09:00', clock_out: '13:00' }] },
        {
          date: '2026-12-28',
          segments: [
            { clock_in: '09:00', clock_out: '14:00' },
            { clock_in: '15:00', clock_out: '18:00' },
          ],
        },
      ],
      jitter_minutes: 8,
      observations: expect.any(String),
    });
    expect(out).toMatch(/Ask them to confirm/);
    expect(out).toMatch(/signed off/);
    expect(out).toContain('2026-12-24, 2026-12-28');
  });

  it('fill_days prompt rejects malformed days JSON before resolving the employee', async () => {
    mockFetch.mockReset();
    await expect(
      prompts.get('attendance_fill_days')!.handler({ days: 'not json' })
    ).rejects.toThrow(/days must be valid JSON/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fill_days prompt rejects a day missing its date', async () => {
    routeFetch();
    await expect(
      prompts.get('attendance_fill_days')!.handler({ days: '[{"segments":"09:00-13:00"}]' })
    ).rejects.toThrow(/date/);
  });

  it('today prompt instructs writing nothing and reporting the partial day when today is short', async () => {
    routeFetch([], false, { '2026-12-28': 120 });
    const out = text(await prompts.get('attendance_today')!.handler({ segments: '09:00-13:00' }));
    expect(out).toContain('Today 2026-12-28 for Placeholder Person (2): status short');
    expect(out).toMatch(
      /5\. If the status is short \(some hours already tracked, not enough\), write nothing and report the partial day; a person decides how to complete it\./
    );
  });
});
