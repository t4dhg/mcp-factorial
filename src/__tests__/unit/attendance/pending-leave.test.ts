import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { registerTimeOffTool } = await import('../../../tools/time-off.js');
const { clearCache } = await import('../../../api.js');

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function captureHandler(): Handler {
  let handler: Handler | undefined;
  const fake = {
    registerTool: (_n: string, _c: unknown, fn: Handler) => {
      handler = fn;
    },
  } as unknown as McpServer;
  registerTimeOffTool(fake);
  if (!handler) throw new Error('tool not registered');
  return handler;
}

const leave = (id: string, approved: boolean | null) => ({
  id,
  employee_id: '2',
  start_on: '2026-02-04',
  finish_on: '2026-02-04',
  approved,
  half_day: null,
  deleted_at: null,
  leave_type_id: '1',
  description: null,
});

describe('list_leaves', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
  });

  it('separates pending leave from approved leave', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [leave('1', true), leave('2', null)],
        meta: { has_next_page: false, total: 2, limit: 100 },
      }),
      text: async () => '',
    });

    const text = (
      await captureHandler()({
        action: 'list_leaves',
        start_on: '2026-02-01',
        finish_on: '2026-02-28',
      })
    ).content[0].text;

    expect(text).toContain('1 pending or unapproved');
    expect(text).toContain('2026-02-04');
    expect(text).toContain('do not block attendance writes');
  });

  it('says nothing about pending records when every leave is approved', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [leave('1', true)],
        meta: { has_next_page: false, total: 1, limit: 100 },
      }),
      text: async () => '',
    });

    const text = (
      await captureHandler()({
        action: 'list_leaves',
        start_on: '2026-02-01',
        finish_on: '2026-02-28',
      })
    ).content[0].text;

    expect(text).not.toContain('pending or unapproved');
  });
});
