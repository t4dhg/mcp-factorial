/**
 * Configuration management for MCP FactorialHR
 *
 * Centralizes all configuration options and environment variable handling.
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigurationError } from './errors.js';

/**
 * Configuration interface for FactorialHR API client
 */
export interface FactorialConfig {
  /** FactorialHR API key (required) */
  apiKey: string;
  /** API version (e.g., '2026-07-01') */
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
// Factorial supports each quarterly version for one year and then serves it with
// the oldest schema, so this must be bumped at least yearly. 2026-07-01 changed
// every resource identifier from a number to a string; see schemas/shared.ts.
const DEFAULT_API_VERSION = '2026-07-01';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;

/** Settings naming a host that credentials are sent to */
const ADDRESS_SETTINGS = [
  'FACTORIAL_BASE_URL',
  'FACTORIAL_OAUTH_AUTHORIZE_URL',
  'FACTORIAL_OAUTH_TOKEN_URL',
  'FACTORIAL_OAUTH_REVOKE_URL',
] as const;

/** Address settings that a found .env file tried to supply, and the file each came from */
const refusedAddressSettings = new Map<string, string>();

/**
 * Load a .env file nobody named. Whoever supplied the directory supplied the
 * file, so it may not say where credentials go: an address it sets is taken
 * back out and remembered, to be refused by name when it is asked for.
 */
function loadFoundEnv(path?: string): void {
  const alreadySet = new Set(ADDRESS_SETTINGS.filter(name => process.env[name] !== undefined));
  if (path) config({ path });
  else config();
  for (const name of ADDRESS_SETTINGS) {
    if (alreadySet.has(name) || process.env[name] === undefined) continue;
    delete process.env[name];
    refusedAddressSettings.set(name, path ?? join(process.cwd(), '.env'));
  }
}

/**
 * Load environment variables from a .env file:
 * 1. The file ENV_FILE_PATH names, and nothing else when it is set
 * 2. Current working directory .env
 * 3. Home directory .env
 * 4. Default dotenv behavior
 *
 * Only the first is a file somebody chose. The others are found, and may not
 * set an address that credentials are sent to.
 */
export function loadEnv(): void {
  refusedAddressSettings.clear();

  // 1. An explicit path is the only file read, whether or not it exists
  const explicit = process.env.ENV_FILE_PATH;
  if (explicit) {
    if (existsSync(explicit)) config({ path: explicit });
    return;
  }

  // 2. Check current working directory
  const cwdEnv = join(process.cwd(), '.env');
  if (existsSync(cwdEnv)) {
    loadFoundEnv(cwdEnv);
    return;
  }

  // 3. Check home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const homeEnv = join(homeDir, '.env');
  if (existsSync(homeEnv)) {
    loadFoundEnv(homeEnv);
    return;
  }

  // Fall back to default dotenv behavior
  loadFoundEnv();
}

/**
 * An address setting, checked: undefined when unset.
 *
 * @throws ConfigurationError when a found .env file tried to supply it, or it is not https
 */
export function addressSetting(name: string): string | undefined {
  const source = refusedAddressSettings.get(name);
  if (source !== undefined) {
    throw new ConfigurationError(
      `${name} is set in ${source}, a .env file this server found by itself rather than one ` +
        'it was told to use. An address that credentials are sent to is accepted only from ' +
        `the environment or from the file named by ENV_FILE_PATH. Remove ${name} from that ` +
        'file, or set ENV_FILE_PATH to it if the file is yours. Nothing was sent.'
    );
  }
  const value = process.env[name]?.trim();
  return value ? secureUrl(name, value) : undefined;
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
        'Please add it to your .env file or pass it via the MCP configuration, or log in as ' +
        'yourself with `npx -y @t4dhg/mcp-factorial login`. ' +
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

/** Hosts that never leave this machine, where plain http exposes nothing */
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * A configured address that credentials are sent to: https, or a loopback host.
 * Over plain http to another machine, a key or a token would cross the network
 * in the clear.
 *
 * @throws ConfigurationError naming the setting
 */
export function secureUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError(`${name} is not a valid URL.`);
  }
  if (url.protocol === 'https:') return value;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname)) return value;
  throw new ConfigurationError(
    `${name} must be an https URL: credentials are sent to it. Plain http is accepted only ` +
      'for a loopback address such as http://127.0.0.1.'
  );
}

/**
 * Get the base URL for the Factorial API
 */
export function getBaseUrl(): string {
  const custom = addressSetting('FACTORIAL_BASE_URL');
  if (custom) return custom;
  return `https://api.factorialhr.com/api/${getApiVersion()}/resources`;
}

/**
 * Get the complete configuration object
 */
export function getConfig(): FactorialConfig {
  return {
    apiKey: getApiKey(),
    apiVersion: getApiVersion(),
    ...getRequestSettings(),
    debug: process.env.DEBUG === 'true',
  };
}

/** What a request needs besides a credential */
export type RequestSettings = Pick<FactorialConfig, 'baseUrl' | 'timeout' | 'maxRetries'>;

/**
 * The request settings, without the API key.
 *
 * getConfig() throws when FACTORIAL_API_KEY is unset, which is wrong for a
 * server that is logged in as a user and has no key at all.
 */
export function getRequestSettings(): RequestSettings {
  return {
    baseUrl: getBaseUrl(),
    timeout: parseInt(process.env.FACTORIAL_TIMEOUT_MS || String(DEFAULT_TIMEOUT), 10),
    maxRetries: parseInt(process.env.FACTORIAL_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10),
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
