/**
 * OAuth2 Token Management for FactorialHR
 *
 * Handles OAuth2 authentication for endpoints that require it (e.g., document downloads).
 * The MCP server uses refresh tokens to obtain access tokens automatically.
 *
 * Setup flow for users:
 * 1. Create an OAuth2 application in Factorial (Settings → Integrations → OAuth2)
 * 2. Complete the authorization flow once to get a refresh token
 * 3. Provide FACTORIAL_OAUTH_CLIENT_ID, FACTORIAL_OAUTH_CLIENT_SECRET, and FACTORIAL_OAUTH_REFRESH_TOKEN
 *
 * Token lifecycle:
 * - Access tokens expire after 1 hour (we refresh at 50 minutes to be safe)
 * - Refresh tokens expire after 1 week (user must re-authorize if expired)
 */

import { debug } from './config.js';

// OAuth2 endpoints
const OAUTH_TOKEN_URL = 'https://api.factorialhr.com/oauth/token';

/**
 * OAuth2 configuration
 */
export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * OAuth2 token response from Factorial API
 * @see https://apidoc.factorialhr.com/docs/request-an-access-token
 */
interface TokenResponse {
  /** The access token string */
  access_token: string;
  /** Token type, always "Bearer" */
  token_type: string;
  /** Token lifetime in seconds (typically 7200 = 2 hours) */
  expires_in: number;
  /** New refresh token (may be rotated) */
  refresh_token: string;
  /** Granted scopes (e.g., "read write") */
  scope: string;
  /** Unix timestamp when token was created */
  created_at: number;
}

/**
 * Cached token with expiry tracking
 */
interface CachedToken {
  /** The current access token */
  accessToken: string;
  /** The current refresh token (may differ from config if rotated) */
  refreshToken: string;
  /** Unix timestamp in milliseconds when token expires */
  expiresAt: number;
}

/**
 * OAuth2 status information for debugging
 */
export interface OAuth2Status {
  /** Whether OAuth2 credentials are configured in environment */
  configured: boolean;
  /** Whether a cached token exists */
  hasToken: boolean;
  /** ISO timestamp when cached token expires, or null if no token */
  tokenExpiresAt: string | null;
  /** Whether the cached token is still valid (not expired) */
  tokenValid: boolean;
}

// In-memory token cache
let cachedToken: CachedToken | null = null;

// Safety margin for token refresh (refresh 5 minutes before expiry)
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Check if OAuth2 credentials are configured
 */
export function isOAuth2Configured(): boolean {
  return !!(
    process.env.FACTORIAL_OAUTH_CLIENT_ID &&
    process.env.FACTORIAL_OAUTH_CLIENT_SECRET &&
    process.env.FACTORIAL_OAUTH_REFRESH_TOKEN
  );
}

/**
 * Get OAuth2 configuration from environment variables
 * @throws Error if OAuth2 is not configured
 */
export function getOAuth2Config(): OAuth2Config {
  const clientId = process.env.FACTORIAL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.FACTORIAL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.FACTORIAL_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'OAuth2 credentials not configured. Required environment variables:\n' +
        '  - FACTORIAL_OAUTH_CLIENT_ID\n' +
        '  - FACTORIAL_OAUTH_CLIENT_SECRET\n' +
        '  - FACTORIAL_OAUTH_REFRESH_TOKEN\n\n' +
        'See https://apidoc.factorialhr.com/docs/authentication for OAuth2 setup instructions.'
    );
  }

  return { clientId, clientSecret, refreshToken };
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(config: OAuth2Config): Promise<CachedToken> {
  debug('Refreshing OAuth2 access token');

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OAuth2 token refresh failed: ${response.status}`;

    try {
      const errorData = JSON.parse(errorText) as { error?: string; error_description?: string };
      if (errorData.error === 'invalid_grant') {
        errorMessage =
          'OAuth2 refresh token has expired. Refresh tokens are valid for 1 week.\n' +
          'Please re-authorize the OAuth2 application to get a new refresh token.\n' +
          'See https://apidoc.factorialhr.com/docs/request-an-authorization-code';
      } else if (errorData.error_description) {
        errorMessage = `OAuth2 error: ${errorData.error_description}`;
      }
    } catch {
      // Use generic error message
    }

    throw new Error(errorMessage);
  }

  const tokenData = (await response.json()) as TokenResponse;

  const newToken: CachedToken = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  // Update the cached token
  cachedToken = newToken;

  // If we got a new refresh token, log it (user may want to update their config)
  if (tokenData.refresh_token !== config.refreshToken) {
    debug('New refresh token received - consider updating FACTORIAL_OAUTH_REFRESH_TOKEN', {
      hint: 'The refresh token has been rotated. Update your environment variable to prevent re-authorization.',
    });
  }

  debug('OAuth2 access token refreshed successfully', {
    expiresIn: tokenData.expires_in,
    scope: tokenData.scope,
  });

  return newToken;
}

/**
 * Get a valid OAuth2 access token
 *
 * Returns a cached token if still valid, otherwise refreshes it.
 * @throws Error if OAuth2 is not configured or token refresh fails
 */
export async function getOAuth2AccessToken(): Promise<string> {
  const config = getOAuth2Config();

  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
    debug('Using cached OAuth2 access token');
    return cachedToken.accessToken;
  }

  // Need to refresh the token
  const newToken = await refreshAccessToken(config);
  return newToken.accessToken;
}

/**
 * Clear the cached OAuth2 token
 * Useful for testing or forcing a token refresh
 */
export function clearOAuth2Cache(): void {
  cachedToken = null;
}

/**
 * Get OAuth2 token status for debugging
 * @returns Status object with configuration and token information
 */
export function getOAuth2Status(): OAuth2Status {
  const configured = isOAuth2Configured();
  const hasToken = cachedToken !== null;
  const tokenExpiresAt = cachedToken ? new Date(cachedToken.expiresAt).toISOString() : null;
  const tokenValid = cachedToken
    ? cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS
    : false;

  return { configured, hasToken, tokenExpiresAt, tokenValid };
}
