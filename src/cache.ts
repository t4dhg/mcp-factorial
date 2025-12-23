/**
 * Simple in-memory TTL cache for MCP FactorialHR
 *
 * Reduces API calls by caching frequently accessed data.
 */

import { debug } from './config.js';

/**
 * Cache entry with data and expiration
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * TTL values for different resource types (in milliseconds)
 */
export const CACHE_TTL = {
  employees: 5 * 60 * 1000, // 5 minutes
  teams: 10 * 60 * 1000, // 10 minutes
  locations: 15 * 60 * 1000, // 15 minutes
  contracts: 3 * 60 * 1000, // 3 minutes
  leaves: 2 * 60 * 1000, // 2 minutes
  shifts: 1 * 60 * 1000, // 1 minute
  default: 5 * 60 * 1000, // 5 minutes default
} as const;

/**
 * Resource types for TTL lookup
 */
export type ResourceType = keyof typeof CACHE_TTL;

/**
 * Simple TTL-based cache manager
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Generate a cache key from resource type and parameters
   */
  static key(resource: string, params?: object): string {
    if (!params || Object.keys(params).length === 0) {
      return resource;
    }
    // Sort params for consistent key generation
    const record = params as Record<string, unknown>;
    const sortedParams = Object.keys(record)
      .sort()
      .filter(k => record[k] !== undefined)
      .map(k => `${k}=${JSON.stringify(record[k])}`)
      .join('&');
    return `${resource}:${sortedParams}`;
  }

  /**
   * Get a value from the cache
   * @returns The cached value or undefined if not found/expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      debug(`Cache miss (expired): ${key}`);
      return undefined;
    }

    debug(`Cache hit: ${key}`);
    return entry.data as T;
  }

  /**
   * Set a value in the cache
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttlMs - Time to live in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number = CACHE_TTL.default): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    debug(`Cache set: ${key} (TTL: ${ttlMs}ms)`);
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      debug(`Cache invalidated: ${key}`);
    }
    return deleted;
  }

  /**
   * Invalidate all cache entries matching a prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      debug(`Cache invalidated ${count} entries with prefix: ${prefix}`);
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    debug(`Cache cleared (${size} entries)`);
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      debug(`Cache cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Stop the cleanup interval (for testing/cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Global cache instance
 */
export const cache = new CacheManager();

/**
 * Helper to get cached data or fetch it
 * @param key - Cache key
 * @param fetcher - Function to fetch data if not cached
 * @param ttlMs - Time to live in milliseconds
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = CACHE_TTL.default
): Promise<T> {
  const cachedValue = cache.get<T>(key);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const data = await fetcher();
  cache.set(key, data, ttlMs);
  return data;
}

/**
 * Get the TTL for a resource type
 */
export function getTTL(resourceType: ResourceType): number {
  return CACHE_TTL[resourceType] ?? CACHE_TTL.default;
}
