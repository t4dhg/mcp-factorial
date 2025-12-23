/**
 * Audit logging for write operations
 *
 * Logs all write operations for compliance and debugging.
 * In production, this could be extended to log to external systems.
 */

import { debug } from './config.js';

/**
 * Audit action types for write operations
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  TERMINATE = 'TERMINATE',
  ARCHIVE = 'ARCHIVE',
  UNARCHIVE = 'UNARCHIVE',
  ASSIGN = 'ASSIGN',
  UNASSIGN = 'UNASSIGN',
}

/**
 * Audit log entry structure
 */
export interface AuditEntry {
  timestamp: string;
  action: AuditAction;
  entityType: string;
  entityId?: number;
  changes?: Record<string, { from?: unknown; to: unknown }>;
  success: boolean;
  error?: string;
  durationMs: number;
  idempotencyKey?: string;
}

/**
 * Audit logger class
 *
 * Maintains an in-memory log of recent write operations for debugging.
 * In production, this could be extended to persist logs to external systems.
 */
class AuditLogger {
  private logs: AuditEntry[] = [];
  private readonly maxEntries = 1000; // Keep last 1000 entries in memory

  /**
   * Log an audit entry
   */
  log(entry: AuditEntry): void {
    this.logs.push(entry);

    // Trim old entries
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries);
    }

    // Always debug log write operations
    const status = entry.success ? 'SUCCESS' : 'FAILED';
    const entityRef = entry.entityId ? ` #${entry.entityId}` : '';
    debug(
      `[AUDIT] ${status} ${entry.action} ${entry.entityType}${entityRef} (${entry.durationMs}ms)`,
      {
        changes: entry.changes,
        error: entry.error,
      }
    );
  }

  /**
   * Get recent audit logs
   */
  getRecentLogs(limit = 100): AuditEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs for a specific entity type
   */
  getLogsByEntityType(entityType: string): AuditEntry[] {
    return this.logs.filter(log => log.entityType === entityType);
  }

  /**
   * Get logs for a specific entity
   */
  getLogsByEntity(entityType: string, entityId: number): AuditEntry[] {
    return this.logs.filter(log => log.entityType === entityType && log.entityId === entityId);
  }

  /**
   * Clear all logs (useful for testing)
   */
  clear(): void {
    this.logs = [];
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

/**
 * Helper to wrap write operations with audit logging
 *
 * @param action - The audit action type
 * @param entityType - The type of entity being modified
 * @param entityId - Optional ID of the entity
 * @param operation - The async operation to execute
 * @param changes - Optional changes being made
 * @param idempotencyKey - Optional idempotency key
 * @returns The result of the operation
 */
export async function auditedOperation<T>(
  action: AuditAction,
  entityType: string,
  entityId: number | undefined,
  operation: () => Promise<T>,
  changes?: Record<string, { from?: unknown; to: unknown }>,
  idempotencyKey?: string
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operation();

    auditLogger.log({
      timestamp: new Date().toISOString(),
      action,
      entityType,
      entityId,
      changes,
      success: true,
      durationMs: Date.now() - startTime,
      idempotencyKey,
    });

    return result;
  } catch (error) {
    auditLogger.log({
      timestamp: new Date().toISOString(),
      action,
      entityType,
      entityId,
      changes,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
      idempotencyKey,
    });

    throw error;
  }
}
