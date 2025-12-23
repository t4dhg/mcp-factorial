/**
 * Configuration management for MCP FactorialHR
 *
 * Centralizes all configuration options and environment variable handling.
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Configuration interface for FactorialHR API client
 */
export interface FactorialConfig {
  /** FactorialHR API key (required) */
  apiKey: string;
  /** API version (e.g., '2025-10-01') */
  apiVersion: string;
  /** Base URL for the Factorial API */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Enable debug logging */
  debug: boolean;
}

// Default configuration values
const DEFAULT_API_VERSION = '2025-10-01';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;

/**
 * Load environment variables from .env file with priority:
 * 1. ENV_FILE_PATH environment variable
 * 2. Current working directory .env
 * 3. Home directory .env
 * 4. Common project locations
 * 5. Default dotenv behavior
 */
export function loadEnv(): void {
  // 1. Check if explicit path provided
  if (process.env.ENV_FILE_PATH && existsSync(process.env.ENV_FILE_PATH)) {
    config({ path: process.env.ENV_FILE_PATH });
    return;
  }

  // 2. Check current working directory
  const cwdEnv = join(process.cwd(), '.env');
  if (existsSync(cwdEnv)) {
    config({ path: cwdEnv });
    return;
  }

  // 3. Check home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const homeEnv = join(homeDir, '.env');
  if (existsSync(homeEnv)) {
    config({ path: homeEnv });
    return;
  }

  // 4. Check common project locations
  const commonPaths = [join(homeDir, 'turborepo', '.env'), join(homeDir, 'projects', '.env')];

  for (const envPath of commonPaths) {
    if (existsSync(envPath)) {
      config({ path: envPath });
      return;
    }
  }

  // Fall back to default dotenv behavior
  config();
}

/**
 * Get the Factorial API key from environment variables
 * @throws Error if API key is not set
 */
export function getApiKey(): string {
  const apiKey = process.env.FACTORIAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      'FACTORIAL_API_KEY is not set. ' +
        'Please add it to your .env file or pass it via the MCP configuration. ' +
        'See https://github.com/t4dhg/mcp-factorial for setup instructions.'
    );
  }
  return apiKey;
}

/**
 * Get the API version from environment or default
 */
export function getApiVersion(): string {
  return process.env.FACTORIAL_API_VERSION || DEFAULT_API_VERSION;
}

/**
 * Get the base URL for the Factorial API
 */
export function getBaseUrl(): string {
  if (process.env.FACTORIAL_BASE_URL) {
    return process.env.FACTORIAL_BASE_URL;
  }
  return `https://api.factorialhr.com/api/${getApiVersion()}/resources`;
}

/**
 * Get the complete configuration object
 */
export function getConfig(): FactorialConfig {
  return {
    apiKey: getApiKey(),
    apiVersion: getApiVersion(),
    baseUrl: getBaseUrl(),
    timeout: parseInt(process.env.FACTORIAL_TIMEOUT_MS || String(DEFAULT_TIMEOUT), 10),
    maxRetries: parseInt(process.env.FACTORIAL_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10),
    debug: process.env.DEBUG === 'true',
  };
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return process.env.DEBUG === 'true';
}

/**
 * Debug logger - only logs when DEBUG=true
 */
export function debug(message: string, data?: unknown): void {
  if (isDebugEnabled()) {
    const timestamp = new Date().toISOString();
    if (data !== undefined) {
      console.error(`[${timestamp}] [mcp-factorial] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`[${timestamp}] [mcp-factorial] ${message}`);
    }
  }
}
