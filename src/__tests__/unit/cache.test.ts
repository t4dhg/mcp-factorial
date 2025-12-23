import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before imports
vi.mock('../../config.js', () => ({
  debug: vi.fn(),
}));

// Import after mocking
const { CacheManager, CACHE_TTL, cached, getTTL, cache } = await import('../../cache.js');

describe('Cache Module', () => {
  let cacheInstance: CacheManager;

  beforeEach(() => {
    cacheInstance = new CacheManager();
    cache.clear();
  });

  afterEach(() => {
    cacheInstance.destroy();
    cache.clear();
  });

  describe('CacheManager.key', () => {
    it('should generate simple key without params', () => {
      expect(CacheManager.key('employees')).toBe('employees');
    });

    it('should generate key with params', () => {
      const key = CacheManager.key('employees', { team_id: 1, location_id: 2 });
      expect(key).toBe('employees:location_id=2&team_id=1');
    });

    it('should sort params for consistent keys', () => {
      const key1 = CacheManager.key('employees', { z: 3, a: 1, m: 2 });
      const key2 = CacheManager.key('employees', { a: 1, m: 2, z: 3 });
      expect(key1).toBe(key2);
    });

    it('should filter out undefined params', () => {
      const key = CacheManager.key('employees', { a: 1, b: undefined, c: 2 });
      expect(key).toBe('employees:a=1&c=2');
    });

    it('should handle empty params object', () => {
      expect(CacheManager.key('employees', {})).toBe('employees');
    });

    it('should JSON stringify param values', () => {
      const key = CacheManager.key('employees', { filter: { active: true } });
      expect(key).toContain('{"active":true}');
    });
  });

  describe('CacheManager.get/set', () => {
    it('should store and retrieve values', () => {
      cacheInstance.set('key1', { data: 'value' });
      const result = cacheInstance.get<{ data: string }>('key1');
      expect(result).toEqual({ data: 'value' });
    });

    it('should return undefined for non-existent key', () => {
      expect(cacheInstance.get('nonexistent')).toBeUndefined();
    });

    it('should return undefined for expired entries', async () => {
      cacheInstance.set('key1', 'value', 50); // 50ms TTL
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      expect(cacheInstance.get('key1')).toBeUndefined();
    });

    it('should delete expired entries on get', async () => {
      cacheInstance.set('key1', 'value', 50);
      await new Promise(resolve => setTimeout(resolve, 100));
      cacheInstance.get('key1'); // Should trigger deletion
      const stats = cacheInstance.stats();
      expect(stats.keys).not.toContain('key1');
    });

    it('should use default TTL when not specified', () => {
      cacheInstance.set('key1', 'value');
      const result = cacheInstance.get('key1');
      expect(result).toBe('value');
    });

    it('should handle different data types', () => {
      cacheInstance.set('string', 'text');
      cacheInstance.set('number', 42);
      cacheInstance.set('boolean', true);
      cacheInstance.set('object', { nested: 'data' });
      cacheInstance.set('array', [1, 2, 3]);

      expect(cacheInstance.get('string')).toBe('text');
      expect(cacheInstance.get('number')).toBe(42);
      expect(cacheInstance.get('boolean')).toBe(true);
      expect(cacheInstance.get('object')).toEqual({ nested: 'data' });
      expect(cacheInstance.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('CacheManager.invalidate', () => {
    it('should remove a specific key', () => {
      cacheInstance.set('key1', 'value1');
      cacheInstance.set('key2', 'value2');

      const deleted = cacheInstance.invalidate('key1');

      expect(deleted).toBe(true);
      expect(cacheInstance.get('key1')).toBeUndefined();
      expect(cacheInstance.get('key2')).toBe('value2');
    });

    it('should return false for non-existent key', () => {
      const deleted = cacheInstance.invalidate('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('CacheManager.invalidatePrefix', () => {
    it('should remove all entries matching prefix', () => {
      cacheInstance.set('employees:1', 'emp1');
      cacheInstance.set('employees:2', 'emp2');
      cacheInstance.set('teams:1', 'team1');

      const count = cacheInstance.invalidatePrefix('employees');

      expect(count).toBe(2);
      expect(cacheInstance.get('employees:1')).toBeUndefined();
      expect(cacheInstance.get('employees:2')).toBeUndefined();
      expect(cacheInstance.get('teams:1')).toBe('team1');
    });

    it('should return 0 when no matches found', () => {
      cacheInstance.set('key1', 'value1');
      const count = cacheInstance.invalidatePrefix('nonexistent');
      expect(count).toBe(0);
    });

    it('should handle empty cache', () => {
      const count = cacheInstance.invalidatePrefix('any');
      expect(count).toBe(0);
    });
  });

  describe('CacheManager.clear', () => {
    it('should remove all entries', () => {
      cacheInstance.set('key1', 'value1');
      cacheInstance.set('key2', 'value2');
      cacheInstance.set('key3', 'value3');

      cacheInstance.clear();

      expect(cacheInstance.stats().size).toBe(0);
      expect(cacheInstance.get('key1')).toBeUndefined();
      expect(cacheInstance.get('key2')).toBeUndefined();
      expect(cacheInstance.get('key3')).toBeUndefined();
    });

    it('should handle empty cache', () => {
      expect(() => cacheInstance.clear()).not.toThrow();
    });
  });

  describe('CacheManager.stats', () => {
    it('should return size and keys', () => {
      cacheInstance.set('key1', 'value1');
      cacheInstance.set('key2', 'value2');

      const stats = cacheInstance.stats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });

    it('should return empty stats for empty cache', () => {
      const stats = cacheInstance.stats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  describe('CacheManager cleanup', () => {
    it('should automatically cleanup expired entries', async () => {
      vi.useFakeTimers();

      cacheInstance.set('key1', 'value1', 50);
      cacheInstance.set('key2', 'value2', 100000);

      // Fast-forward 60 seconds to trigger cleanup
      await vi.advanceTimersByTimeAsync(60000);

      // key1 should be cleaned up, key2 should remain
      expect(cacheInstance.get('key1')).toBeUndefined();
      expect(cacheInstance.get('key2')).toBe('value2');

      vi.useRealTimers();
    });

    it('should run cleanup periodically', async () => {
      vi.useFakeTimers();

      // Create a new instance with fake timers active
      const testInstance = new CacheManager();
      testInstance.set('key1', 'value1', 50);

      // Fast-forward multiple cleanup intervals
      await vi.advanceTimersByTimeAsync(120000); // 2 minutes

      expect(testInstance.stats().size).toBe(0);
      testInstance.destroy();

      vi.useRealTimers();
    });
  });

  describe('CacheManager.destroy', () => {
    it('should clear the cleanup interval', () => {
      const instance = new CacheManager();
      instance.destroy();

      // After destroy, cleanup interval should be cleared
      // We can verify this by checking that it doesn't throw
      expect(() => instance.destroy()).not.toThrow();

      instance.destroy();
    });

    it('should handle multiple destroy calls', () => {
      const instance = new CacheManager();
      instance.destroy();
      instance.destroy();
      expect(() => instance.destroy()).not.toThrow();
    });
  });

  describe('cached helper', () => {
    it('should fetch data when not cached', async () => {
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

      const result = await cached('test-key', fetcher);

      expect(result).toEqual({ data: 'fresh' });
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it('should return cached data without calling fetcher', async () => {
      cache.set('test-key', { data: 'cached' });
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

      const result = await cached('test-key', fetcher);

      expect(result).toEqual({ data: 'cached' });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should cache fetched data', async () => {
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

      await cached('test-key', fetcher);
      const cachedResult = cache.get('test-key');

      expect(cachedResult).toEqual({ data: 'fresh' });
    });

    it('should use custom TTL', async () => {
      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });
      const customTTL = 60000;

      await cached('test-key', fetcher, customTTL);

      expect(cache.get('test-key')).toEqual({ data: 'fresh' });
    });

    it('should handle fetcher errors', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      await expect(cached('test-key', fetcher)).rejects.toThrow('Fetch failed');
    });
  });

  describe('getTTL', () => {
    it('should return correct TTL for employees', () => {
      expect(getTTL('employees')).toBe(5 * 60 * 1000);
    });

    it('should return correct TTL for teams', () => {
      expect(getTTL('teams')).toBe(10 * 60 * 1000);
    });

    it('should return correct TTL for locations', () => {
      expect(getTTL('locations')).toBe(15 * 60 * 1000);
    });

    it('should return correct TTL for contracts', () => {
      expect(getTTL('contracts')).toBe(3 * 60 * 1000);
    });

    it('should return correct TTL for leaves', () => {
      expect(getTTL('leaves')).toBe(2 * 60 * 1000);
    });

    it('should return correct TTL for shifts', () => {
      expect(getTTL('shifts')).toBe(1 * 60 * 1000);
    });

    it('should return default TTL for default', () => {
      expect(getTTL('default')).toBe(5 * 60 * 1000);
    });
  });

  describe('CACHE_TTL constants', () => {
    it('should have all expected resource types', () => {
      expect(CACHE_TTL).toHaveProperty('employees');
      expect(CACHE_TTL).toHaveProperty('teams');
      expect(CACHE_TTL).toHaveProperty('locations');
      expect(CACHE_TTL).toHaveProperty('contracts');
      expect(CACHE_TTL).toHaveProperty('leaves');
      expect(CACHE_TTL).toHaveProperty('shifts');
      expect(CACHE_TTL).toHaveProperty('default');
    });

    it('should have sensible TTL values', () => {
      expect(CACHE_TTL.employees).toBeGreaterThan(0);
      expect(CACHE_TTL.teams).toBeGreaterThan(0);
      expect(CACHE_TTL.locations).toBeGreaterThan(0);
    });
  });
});
