/**
 * Shared API utilities
 */

import { cache } from '../cache.js';

/**
 * Invalidate all cached data
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Invalidate cached data for a specific resource type
 */
export function invalidateCache(resourceType: string): void {
  cache.invalidatePrefix(resourceType);
}
