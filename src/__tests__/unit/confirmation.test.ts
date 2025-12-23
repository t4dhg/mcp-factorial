import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { confirmationManager, requestConfirmation } from '../../confirmation.js';

describe('Confirmation Module', () => {
  beforeEach(() => {
    confirmationManager.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('confirmationManager', () => {
    it('should create a confirmation request', () => {
      const token = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should validate a valid token', () => {
      const token = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      const isValid = confirmationManager.isValid(token);
      expect(isValid).toBe(true);
    });

    it('should invalidate an invalid token', () => {
      const isValid = confirmationManager.isValid('invalid-token');
      expect(isValid).toBe(false);
    });

    it('should confirm and consume a token', () => {
      const token = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      const pending = confirmationManager.confirm(token);

      expect(pending).toBeDefined();
      expect(pending.operation).toBe('delete_team');
      expect(pending.payload).toEqual({ id: 1 });

      // Token should no longer be valid after confirmation
      expect(confirmationManager.isValid(token)).toBe(false);
    });

    it('should throw when confirming an invalid token', () => {
      expect(() => confirmationManager.confirm('invalid-token')).toThrow();
    });

    it('should expire tokens after TTL', () => {
      const token = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      // Token should be valid initially
      expect(confirmationManager.isValid(token)).toBe(true);

      // Advance time past TTL (5 minutes + 1 second)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Token should now be expired
      expect(confirmationManager.isValid(token)).toBe(false);
    });

    it('should generate unique tokens', () => {
      const token1 = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      const token2 = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      expect(token1).not.toBe(token2);
    });

    it('should store multiple tokens', () => {
      const token1 = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      const token2 = confirmationManager.createConfirmation(
        'delete_location',
        { id: 2 },
        {
          operation: 'delete',
          entityType: 'location',
          entityId: 2,
          entityName: 'SF Office',
          warnings: [],
        }
      );

      expect(confirmationManager.isValid(token1)).toBe(true);
      expect(confirmationManager.isValid(token2)).toBe(true);

      expect(confirmationManager.getPreview(token1)?.entityType).toBe('team');
      expect(confirmationManager.getPreview(token2)?.entityType).toBe('location');
    });

    it('should handle warnings in preview', () => {
      const token = confirmationManager.createConfirmation(
        'terminate_employee',
        { id: 1, terminated_on: '2025-01-31' },
        {
          operation: 'terminate',
          entityType: 'employee',
          entityId: 1,
          entityName: 'John Doe',
          warnings: ['This is a permanent action', 'Employee will lose access immediately'],
        }
      );

      const preview = confirmationManager.getPreview(token);
      expect(preview).toBeDefined();
      expect(preview?.warnings).toHaveLength(2);
      expect(preview?.warnings[0]).toBe('This is a permanent action');
    });

    it('should cancel a confirmation', () => {
      const token = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      expect(confirmationManager.isValid(token)).toBe(true);

      const cancelled = confirmationManager.cancel(token);
      expect(cancelled).toBe(true);

      expect(confirmationManager.isValid(token)).toBe(false);
    });

    it('should get preview for a token', () => {
      const token = confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: ['Team will be permanently deleted'],
        }
      );

      const preview = confirmationManager.getPreview(token);
      expect(preview).toBeDefined();
      expect(preview?.operation).toBe('delete');
      expect(preview?.entityType).toBe('team');
      expect(preview?.entityId).toBe(1);
      expect(preview?.entityName).toBe('Engineering');
      expect(preview?.confirmationToken).toBe(token);
    });

    it('should count pending confirmations', () => {
      expect(confirmationManager.getPendingCount()).toBe(0);

      confirmationManager.createConfirmation(
        'delete_team',
        { id: 1 },
        {
          operation: 'delete',
          entityType: 'team',
          entityId: 1,
          entityName: 'Engineering',
          warnings: [],
        }
      );

      expect(confirmationManager.getPendingCount()).toBe(1);

      confirmationManager.createConfirmation(
        'delete_location',
        { id: 2 },
        {
          operation: 'delete',
          entityType: 'location',
          entityId: 2,
          entityName: 'SF Office',
          warnings: [],
        }
      );

      expect(confirmationManager.getPendingCount()).toBe(2);

      confirmationManager.clear();
      expect(confirmationManager.getPendingCount()).toBe(0);
    });
  });

  describe('requestConfirmation helper', () => {
    it('should create a confirmation request with token and preview', () => {
      const result = requestConfirmation('delete', 'team', 1, 'Engineering', { id: 1 }, [
        'This will delete all team data',
      ]);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      expect(result.preview).toBeDefined();
      expect(result.preview.operation).toBe('delete');
      expect(result.preview.entityType).toBe('team');
      expect(result.preview.entityId).toBe(1);
      expect(result.preview.entityName).toBe('Engineering');
      expect(result.preview.warnings).toHaveLength(1);
    });

    it('should work without warnings', () => {
      const result = requestConfirmation('update', 'employee', 42, 'Jane Smith', {
        id: 42,
        role: 'Manager',
      });

      expect(result.token).toBeDefined();
      expect(result.preview.warnings).toEqual([]);
    });

    it('should work with undefined entity ID and name', () => {
      const result = requestConfirmation('create', 'team', undefined, undefined, {
        name: 'New Team',
      });

      expect(result.token).toBeDefined();
      expect(result.preview.entityId).toBeUndefined();
      expect(result.preview.entityName).toBeUndefined();
    });
  });
});
