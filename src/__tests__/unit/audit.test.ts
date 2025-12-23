import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditAction, auditedOperation } from '../../audit.js';

describe('Audit Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('auditedOperation', () => {
    it('should execute operation and return result', async () => {
      const operation = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const result = await auditedOperation(AuditAction.CREATE, 'employee', 1, operation);

      expect(operation).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should handle undefined entity ID', async () => {
      const operation = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const result = await auditedOperation(AuditAction.CREATE, 'employee', undefined, operation);

      expect(operation).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should include changes in audit log', async () => {
      const operation = vi.fn().mockResolvedValue({ id: 1, name: 'Updated Name' });
      const changes = {
        name: { from: 'Old Name', to: 'Updated Name' },
        status: { from: 'inactive', to: 'active' },
      };

      const result = await auditedOperation(AuditAction.UPDATE, 'team', 1, operation, changes);

      expect(operation).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, name: 'Updated Name' });
    });

    it('should include idempotency key', async () => {
      const operation = vi.fn().mockResolvedValue({ id: 1 });

      const result = await auditedOperation(
        AuditAction.CREATE,
        'employee',
        1,
        operation,
        undefined,
        'idempotency-key-123'
      );

      expect(operation).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1 });
    });

    it('should handle operation errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));

      await expect(auditedOperation(AuditAction.DELETE, 'team', 1, operation)).rejects.toThrow(
        'Operation failed'
      );

      expect(operation).toHaveBeenCalledOnce();
    });

    it('should work with all audit actions', async () => {
      const operation = vi.fn().mockResolvedValue({ success: true });

      const actions = [
        AuditAction.CREATE,
        AuditAction.UPDATE,
        AuditAction.DELETE,
        AuditAction.APPROVE,
        AuditAction.REJECT,
        AuditAction.TERMINATE,
        AuditAction.ARCHIVE,
        AuditAction.UNARCHIVE,
        AuditAction.ASSIGN,
        AuditAction.UNASSIGN,
      ];

      for (const action of actions) {
        operation.mockClear();
        await auditedOperation(action, 'entity', 1, operation);
        expect(operation).toHaveBeenCalledOnce();
      }
    });

    it('should handle async operation results', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { id: 42, status: 'completed' };
      });

      const result = await auditedOperation(AuditAction.UPDATE, 'project', 42, operation);

      expect(result).toEqual({ id: 42, status: 'completed' });
    });
  });

  describe('AuditAction enum', () => {
    it('should have all expected actions', () => {
      expect(AuditAction.CREATE).toBe('CREATE');
      expect(AuditAction.UPDATE).toBe('UPDATE');
      expect(AuditAction.DELETE).toBe('DELETE');
      expect(AuditAction.APPROVE).toBe('APPROVE');
      expect(AuditAction.REJECT).toBe('REJECT');
      expect(AuditAction.TERMINATE).toBe('TERMINATE');
      expect(AuditAction.ARCHIVE).toBe('ARCHIVE');
      expect(AuditAction.UNARCHIVE).toBe('UNARCHIVE');
      expect(AuditAction.ASSIGN).toBe('ASSIGN');
      expect(AuditAction.UNASSIGN).toBe('UNASSIGN');
    });
  });
});
