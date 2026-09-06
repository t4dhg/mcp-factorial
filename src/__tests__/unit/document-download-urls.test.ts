import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../oauth.js', () => ({
  isOAuth2Configured: () => true,
  getOAuth2AccessToken: async () => 'test-access-token',
}));

const { getDocumentDownloadUrls } = await import('../../api/documents.js');

describe('getDocumentDownloadUrls', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubEnv('FACTORIAL_API_KEY', 'test-key');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends numeric identifiers to the 2025-01-01 download-urls endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ document_id: 123, url: 'https://signed.example/123' }] }),
    });

    const result = await getDocumentDownloadUrls(['123', '456']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, { body: string; method: string }];
    expect(url).toBe(
      'https://api.factorialhr.com/api/2025-01-01/resources/documents/download-urls/bulk-create'
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ document_ids: [123, 456] });
    expect(result).toEqual([{ document_id: 123, url: 'https://signed.example/123' }]);
  });
});
