/**
 * Tests for OAuth2 token management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isOAuth2Configured,
  getOAuth2Config,
  getOAuth2AccessToken,
  clearOAuth2Cache,
  getOAuth2Status,
} from '../../oauth.js';

describe('OAuth2 Module', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear any cached tokens between tests
    clearOAuth2Cache();
    // Reset environment
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  describe('isOAuth2Configured', () => {
    it('should return false when no OAuth2 credentials are set', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', '');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', '');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', '');

      expect(isOAuth2Configured()).toBe(false);
    });

    it('should return false when only client_id is set', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', '');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', '');

      expect(isOAuth2Configured()).toBe(false);
    });

    it('should return false when only client_id and client_secret are set', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', '');

      expect(isOAuth2Configured()).toBe(false);
    });

    it('should return true when all OAuth2 credentials are set', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      expect(isOAuth2Configured()).toBe(true);
    });
  });

  describe('getOAuth2Config', () => {
    it('should throw error when OAuth2 is not configured', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', '');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', '');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', '');

      expect(() => getOAuth2Config()).toThrow('OAuth2 credentials not configured');
    });

    it('should return config when all credentials are set', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      const config = getOAuth2Config();

      expect(config.clientId).toBe('test-client-id');
      expect(config.clientSecret).toBe('test-client-secret');
      expect(config.refreshToken).toBe('test-refresh-token');
    });
  });

  describe('getOAuth2Status', () => {
    it('should return not configured status when credentials are missing', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', '');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', '');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', '');

      const status = getOAuth2Status();

      expect(status.configured).toBe(false);
      expect(status.hasToken).toBe(false);
      expect(status.tokenExpiresAt).toBeNull();
      expect(status.tokenValid).toBe(false);
    });

    it('should return configured status when credentials are set but no token yet', () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      const status = getOAuth2Status();

      expect(status.configured).toBe(true);
      expect(status.hasToken).toBe(false);
      expect(status.tokenExpiresAt).toBeNull();
      expect(status.tokenValid).toBe(false);
    });
  });

  describe('getOAuth2AccessToken', () => {
    it('should throw error when OAuth2 is not configured', async () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', '');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', '');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', '');

      await expect(getOAuth2AccessToken()).rejects.toThrow('OAuth2 credentials not configured');
    });

    it('should fetch and return access token when credentials are valid', async () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      // Mock fetch
      const mockResponse = {
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 7200,
        refresh_token: 'new-refresh-token',
        scope: 'read write',
        created_at: Math.floor(Date.now() / 1000),
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const token = await getOAuth2AccessToken();

      expect(token).toBe('mock-access-token');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.factorialhr.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should return cached token on subsequent calls', async () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      const mockResponse = {
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 7200,
        refresh_token: 'new-refresh-token',
        scope: 'read write',
        created_at: Math.floor(Date.now() / 1000),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      vi.stubGlobal('fetch', mockFetch);

      // First call
      await getOAuth2AccessToken();
      // Second call should use cache
      await getOAuth2AccessToken();

      // Fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle refresh token expiry error', async () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'expired-refresh-token');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'The refresh token has expired',
              })
            ),
        })
      );

      await expect(getOAuth2AccessToken()).rejects.toThrow('OAuth2 refresh token has expired');
    });

    it('should handle generic OAuth2 error', async () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                error: 'invalid_client',
                error_description: 'Client credentials are invalid',
              })
            ),
        })
      );

      await expect(getOAuth2AccessToken()).rejects.toThrow(
        'OAuth2 error: Client credentials are invalid'
      );
    });
  });

  describe('clearOAuth2Cache', () => {
    it('should clear cached token', async () => {
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('FACTORIAL_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('FACTORIAL_OAUTH_REFRESH_TOKEN', 'test-refresh-token');

      const mockResponse = {
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 7200,
        refresh_token: 'new-refresh-token',
        scope: 'read write',
        created_at: Math.floor(Date.now() / 1000),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      vi.stubGlobal('fetch', mockFetch);

      // First call
      await getOAuth2AccessToken();

      // Clear cache
      clearOAuth2Cache();

      // Second call should fetch again
      await getOAuth2AccessToken();

      // Fetch should be called twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
