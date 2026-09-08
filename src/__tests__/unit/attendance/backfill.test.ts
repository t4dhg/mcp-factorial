import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { gatherFacts, executeBackfill, CONSECUTIVE_FAILURE_ABORT } =
  await import('../../../attendance/backfill.js');
const { clearCache } = await import('../../../api.js');

/** Serve one workday, with whatever review records the test wants */
function route(reviews: unknown[]) {
  mockFetch.mockImplementation(async (input: string) => {
    const path = new URL(input).pathname;
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
    if (path.endsWith('/attendance/worked_times'))
      return ok({
        data: [
          {
            id: '1',
            employee_id: '7',
            date: '2025-02-03',
            day_type: 'workday',
            tracked_minutes: 0,
          },
        ],
      });
    if (path.endsWith('/attendance/estimated_times'))
      return ok({
        data: [{ id: '1', employee_id: '7', date: '2025-02-03', expected_minutes: 480 }],
      });
    if (path.endsWith('/attendance/reviews')) return ok({ data: reviews });
    if (path.endsWith('/attendance/shifts')) return ok({ data: [] });
    if (path.endsWith('/timeoff/leaves')) return ok({ data: [] });
    throw new Error(`unexpected fetch ${path}`);
  });
}

describe('gatherFacts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  it('collects signed-off dates into facts.reviews and counts them in coverage', async () => {
    route([
      {
        id: '9',
        employee_id: '7',
        date: '2025-02-03',
        reviewed_at: '2025-08-07T09:58:39.000Z',
        author_id: '1',
      },
    ]);

    const facts = await gatherFacts(7, '2025-02-03', '2025-02-03');

    expect(facts.reviews.has('2025-02-03')).toBe(true);
    expect(facts.coverage?.review_records).toBe(1);
  });

  it('leaves reviews empty when nothing is signed off', async () => {
    route([]);

    const facts = await gatherFacts(7, '2025-02-03', '2025-02-03');

    expect(facts.reviews.size).toBe(0);
    expect(facts.coverage?.review_records).toBe(0);
  });

  it('degrades to an empty review set instead of failing the whole read when listReviews rejects', async () => {
    mockFetch.mockImplementation(async (input: string) => {
      const path = new URL(input).pathname;
      const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (path.endsWith('/attendance/worked_times'))
        return ok({
          data: [
            {
              id: '1',
              employee_id: '7',
              date: '2025-02-03',
              day_type: 'workday',
              tracked_minutes: 0,
            },
          ],
        });
      if (path.endsWith('/attendance/estimated_times'))
        return ok({
          data: [{ id: '1', employee_id: '7', date: '2025-02-03', expected_minutes: 480 }],
        });
      if (path.endsWith('/attendance/reviews')) {
        return { ok: false, status: 403, text: async () => 'Forbidden', json: async () => ({}) };
      }
      if (path.endsWith('/attendance/shifts')) return ok({ data: [] });
      if (path.endsWith('/timeoff/leaves')) return ok({ data: [] });
      throw new Error(`unexpected fetch ${path}`);
    });

    // A rejected listReviews must not reject gatherFacts itself: audit, gaps,
    // log_range, log_days and the prompts all depend on this read for
    // everything, not just the signed-off signal.
    const facts = await gatherFacts(7, '2025-02-03', '2025-02-03');

    expect(facts.reviews.size).toBe(0);
    expect(facts.coverage?.review_records).toBe(0);
    expect(facts.coverage?.reviews_error).toBeTruthy();
    expect(facts.days.get('2025-02-03')).toBeDefined();
  });
});

/** Fail the POST for any date in `failDates`, succeed for the rest */
function routeWrites(failDates: string[]) {
  mockFetch.mockImplementation(async (input: string, init?: { method?: string; body?: string }) => {
    const path = new URL(input).pathname;
    if (init?.method === 'POST' && path.endsWith('/attendance/shifts')) {
      const body = JSON.parse(init.body ?? '{}') as {
        date: string;
        employee_id: string;
        clock_in: string;
        clock_out: string;
      };
      if (failDates.includes(body.date)) {
        return {
          ok: false,
          status: 403,
          text: async () => JSON.stringify({ errors: ['Attendance period is closed'] }),
          json: async () => ({ errors: ['Attendance period is closed'] }),
        };
      }
      // The full shape ShiftSchema requires; a bare { id } fails validation
      // and would make a successful write look like a failure.
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: '1',
          employee_id: body.employee_id,
          date: body.date,
          reference_date: null,
          clock_in: body.clock_in,
          clock_out: body.clock_out,
          in_source: 'api',
          out_source: 'api',
          observations: null,
          location_type: null,
          half_day: null,
          workable: true,
          minutes: null,
          workplace_id: null,
          time_settings_break_configuration_id: null,
        }),
        text: async () => '',
      };
    }
    throw new Error(`unexpected fetch ${path}`);
  });
}

describe('executeBackfill', () => {
  const write = (date: string) => ({ date, clock_in: '09:00', clock_out: '17:00' });

  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  it('carries on after a failure and attempts every record', async () => {
    routeWrites(['2025-02-03']);

    const result = await executeBackfill(7, [
      write('2025-02-03'),
      write('2025-03-03'),
      write('2025-04-01'),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.written.map(w => w.date)).toEqual(['2025-03-03', '2025-04-01']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].date).toBe('2025-02-03');
    expect(result.notAttempted).toHaveLength(0);
    expect(result.abortedEarly).toBe(false);
  });

  it('aborts once failures are consecutive enough to be systemic', async () => {
    const writes = Array.from({ length: 25 }, (_, i) =>
      write(`2025-02-${String(i + 1).padStart(2, '0')}`)
    );
    routeWrites(writes.map(w => w.date));

    const result = await executeBackfill(7, writes);

    expect(result.failed).toHaveLength(CONSECUTIVE_FAILURE_ABORT);
    expect(result.notAttempted).toHaveLength(25 - CONSECUTIVE_FAILURE_ABORT);
    expect(result.abortedEarly).toBe(true);
  });

  it('resets the consecutive counter on a success', async () => {
    const writes = Array.from({ length: 20 }, (_, i) =>
      write(`2025-03-${String(i + 1).padStart(2, '0')}`)
    );
    // Every other date fails, so failures never reach the abort threshold.
    routeWrites(writes.filter((_, i) => i % 2 === 0).map(w => w.date));

    const result = await executeBackfill(7, writes);

    expect(result.abortedEarly).toBe(false);
    expect(result.written).toHaveLength(10);
    expect(result.failed).toHaveLength(10);
  });
});
