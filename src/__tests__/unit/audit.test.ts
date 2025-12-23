import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditAction, auditedOperation, auditLogger } from '../../audit.js';

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

  describe('AuditLogger', () => {
    beforeEach(() => {
      auditLogger.clear();
    });

    it('should filter logs by entity type', async () => {
      const op1 = vi.fn().mockResolvedValue({ id: 1 });
      const op2 = vi.fn().mockResolvedValue({ id: 2 });
      const op3 = vi.fn().mockResolvedValue({ id: 3 });

      await auditedOperation(AuditAction.CREATE, 'employee', 1, op1);
      await auditedOperation(AuditAction.UPDATE, 'team', 2, op2);
      await auditedOperation(AuditAction.DELETE, 'employee', 3, op3);

      const employeeLogs = auditLogger.getLogsByEntityType('employee');
      expect(employeeLogs).toHaveLength(2);
      expect(employeeLogs.every(log => log.entityType === 'employee')).toBe(true);

      const teamLogs = auditLogger.getLogsByEntityType('team');
      expect(teamLogs).toHaveLength(1);
      expect(teamLogs[0].entityType).toBe('team');
    });

    it('should filter logs by entity type and ID', async () => {
      const op1 = vi.fn().mockResolvedValue({ id: 1 });
      const op2 = vi.fn().mockResolvedValue({ id: 2 });
      const op3 = vi.fn().mockResolvedValue({ id: 3 });

      await auditedOperation(AuditAction.CREATE, 'employee', 1, op1);
      await auditedOperation(AuditAction.UPDATE, 'employee', 1, op2);
      await auditedOperation(AuditAction.CREATE, 'employee', 2, op3);

      const employee1Logs = auditLogger.getLogsByEntity('employee', 1);
      expect(employee1Logs).toHaveLength(2);
      expect(employee1Logs.every(log => log.entityId === 1)).toBe(true);

      const employee2Logs = auditLogger.getLogsByEntity('employee', 2);
      expect(employee2Logs).toHaveLength(1);
      expect(employee2Logs[0].entityId).toBe(2);
    });

    it('should clear all logs', async () => {
      const op1 = vi.fn().mockResolvedValue({ id: 1 });
      const op2 = vi.fn().mockResolvedValue({ id: 2 });

      await auditedOperation(AuditAction.CREATE, 'employee', 1, op1);
      await auditedOperation(AuditAction.UPDATE, 'team', 2, op2);

      expect(auditLogger.getLogsByEntityType('employee')).toHaveLength(1);
      expect(auditLogger.getLogsByEntityType('team')).toHaveLength(1);

      auditLogger.clear();

      expect(auditLogger.getLogsByEntityType('employee')).toHaveLength(0);
      expect(auditLogger.getLogsByEntityType('team')).toHaveLength(0);
    });
  });
});
