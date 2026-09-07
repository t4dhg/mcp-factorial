import { describe, it, expect, vi, beforeEach } from 'vitest';
import fixture from '../../fixtures/attendance-reviews.json' with { type: 'json' };

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { listReviews } = await import('../../../api/attendance.js');
const { clearCache } = await import('../../../api.js');

describe('listReviews', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  it('parses review records and sends the range filters the endpoint honours', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: fixture, meta: { has_next_page: false } }),
    } as Response);

    const reviews = await listReviews({
      employee_ids: [2],
      start_on: '2025-02-01',
      end_on: '2025-02-28',
    });

    expect(reviews).toHaveLength(2);
    expect(reviews[0].date).toBe('2025-02-01');
    expect(reviews[0].employee_id).toBe('2');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/attendance/reviews');
    expect(url).toContain('employee_ids%5B%5D=2');
    expect(url).toContain('start_on=2025-02-01');
    expect(url).toContain('end_on=2025-02-28');
  });

  it('accepts a record with no reviewer recorded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: '1',
            employee_id: '2',
            date: '2025-05-01',
            reviewed_at: null,
            author_id: null,
          },
        ],
        meta: { has_next_page: false },
      }),
    } as Response);

    const reviews = await listReviews({
      employee_ids: [2],
      start_on: '2025-05-01',
      end_on: '2025-05-31',
    });
    expect(reviews[0].reviewed_at).toBeNull();
  });
});
