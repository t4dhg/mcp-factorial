import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listEditTimesheetRequests, createEditTimesheetRequest } from '../../../api/attendance.js';
import { clearCache } from '../../../api/shared.js';

describe('edit timesheet requests', () => {
  beforeEach(() => {
    vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn());
    clearCache();
  });

  it('lists requests with their approval state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: '5',
            request_type: 'create_shift',
            employee_id: '7',
            approved: null,
            date: '2025-02-03',
            clock_in: '09:00',
            clock_out: '17:00',
            reason: 'Hours worked but never clocked',
          },
        ],
        meta: { has_next_page: false },
      }),
    } as Response);

    const requests = await listEditTimesheetRequests([7]);
    expect(requests).toHaveLength(1);
    expect(requests[0].request_type).toBe('create_shift');
    expect(requests[0].approved).toBeNull();
  });

  it('sends a create_shift request with the fields Factorial requires', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '6', request_type: 'create_shift', employee_id: '7' }),
    } as Response);

    await createEditTimesheetRequest({
      employee_id: 7,
      request_type: 'create_shift',
      date: '2025-02-03',
      clock_in: '09:00',
      clock_out: '17:00',
      reason: 'Hours worked but never clocked',
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/attendance/edit_timesheet_requests');
    expect(call[1]?.method).toBe('POST');
    const body = JSON.parse(String(call[1]?.body));
    expect(body.request_type).toBe('create_shift');
    // Identifiers go over the wire as strings, per stringifyIdentifiers.
    expect(body.employee_id).toBe('7');
  });

  it('rejects a request_type the API does not define', async () => {
    await expect(
      createEditTimesheetRequest({
        employee_id: 7,
        // @ts-expect-error deliberately invalid
        request_type: 'create',
        date: '2025-02-03',
      })
    ).rejects.toThrow();
  });
});
