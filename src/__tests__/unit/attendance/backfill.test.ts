import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { gatherFacts } = await import('../../../attendance/backfill.js');
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
});
