/**
 * Confirmation token management for high-risk operations
 *
 * Provides a mechanism for two-phase confirmation of dangerous operations.
 * Phase 1: Generate a preview and confirmation token
 * Phase 2: Execute with the confirmation token
 */

import { randomBytes } from 'crypto';
import { ConfirmationExpiredError } from './errors.js';

/**
 * Structure of a pending operation awaiting confirmation
 */
export interface PendingOperation {
  /** Unique confirmation token */
  token: string;
  /** Name of the operation (e.g., 'terminate_employee') */
  operation: string;
  /** The original payload for the operation */
  payload: Record<string, unknown>;
  /** Preview information shown to the user */
  preview: OperationPreview;
  /** When the confirmation was created */
  createdAt: number;
  /** When the confirmation expires */
  expiresAt: number;
}

/**
 * Preview information for a pending operation
 */
export interface OperationPreview {
  /** Type of operation */
  operation: 'create' | 'update' | 'delete' | 'terminate' | 'approve' | 'reject' | 'archive';
  /** Type of entity being affected */
  entityType: string;
  /** ID of the entity (if applicable) */
  entityId?: number;
  /** Human-readable name/description of the entity */
  entityName?: string;
  /** Changes that will be made */
  changes?: Record<string, { from?: unknown; to: unknown }>;
  /** Warnings about the operation */
  warnings: string[];
  /** The confirmation token to use */
  confirmationToken: string;
  /** When the token expires */
  expiresAt: string;
}

/**
 * Confirmation manager class
 *
 * Manages pending operations that require user confirmation.
 * Tokens expire after a configurable TTL to prevent stale confirmations.
 */
class ConfirmationManager {
  private pending = new Map<string, PendingOperation>();
  private readonly tokenTtlMs: number;

  constructor(tokenTtlMs = 5 * 60 * 1000) {
    // Default 5 minutes
    this.tokenTtlMs = tokenTtlMs;
  }

  /**
   * Create a confirmation request for an operation
   *
   * @param operation - Name of the operation
   * @param payload - The operation payload
   * @param preview - Preview information to show the user
   * @returns The confirmation token
   */
  createConfirmation(
    operation: string,
    payload: Record<string, unknown>,
    preview: Omit<OperationPreview, 'confirmationToken' | 'expiresAt'>
  ): string {
    // Clean up expired tokens first
    this.cleanup();

    const token = randomBytes(16).toString('hex');
    const now = Date.now();
    const expiresAt = now + this.tokenTtlMs;

    const pendingOp: PendingOperation = {
      token,
      operation,
      payload,
      preview: {
        ...preview,
        confirmationToken: token,
        expiresAt: new Date(expiresAt).toISOString(),
      },
      createdAt: now,
      expiresAt,
    };

    this.pending.set(token, pendingOp);

    return token;
  }

  /**
   * Confirm and retrieve a pending operation
   *
   * @param token - The confirmation token
   * @returns The pending operation if valid
   * @throws ConfirmationExpiredError if token is invalid or expired
   */
  confirm(token: string): PendingOperation {
    const pending = this.pending.get(token);

    if (!pending) {
      throw new ConfirmationExpiredError();
    }

    if (Date.now() > pending.expiresAt) {
      this.pending.delete(token);
      throw new ConfirmationExpiredError();
    }

    // Remove the token after successful confirmation (one-time use)
    this.pending.delete(token);

    return pending;
  }

  /**
   * Check if a token is valid (without consuming it)
   */
  isValid(token: string): boolean {
    const pending = this.pending.get(token);
    if (!pending) return false;
    if (Date.now() > pending.expiresAt) {
      this.pending.delete(token);
      return false;
    }
    return true;
  }

  /**
   * Cancel a pending confirmation
   */
  cancel(token: string): boolean {
    return this.pending.delete(token);
  }

  /**
   * Get preview for a pending confirmation
   */
  getPreview(token: string): OperationPreview | null {
    const pending = this.pending.get(token);
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) {
      this.pending.delete(token);
      return null;
    }
    return pending.preview;
  }

  /**
   * Clean up expired tokens
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [token, pending] of this.pending) {
      if (now > pending.expiresAt) {
        this.pending.delete(token);
      }
    }
  }

  /**
   * Clear all pending confirmations (useful for testing)
   */
  clear(): void {
    this.pending.clear();
  }

  /**
   * Get count of pending confirmations (useful for debugging)
   */
  getPendingCount(): number {
    this.cleanup();
    return this.pending.size;
  }
}

// Singleton instance
export const confirmationManager = new ConfirmationManager();

/**
 * Generate a confirmation preview for a high-risk operation
 *
 * @param operation - The operation type
 * @param entityType - Type of entity
 * @param entityId - ID of entity (if applicable)
 * @param entityName - Human-readable name
 * @param payload - The operation payload
 * @param warnings - Additional warnings
 * @returns The confirmation token
 */
export function requestConfirmation(
  operation: OperationPreview['operation'],
  entityType: string,
  entityId: number | undefined,
  entityName: string | undefined,
  payload: Record<string, unknown>,
  warnings: string[] = []
): { token: string; preview: OperationPreview } {
  const token = confirmationManager.createConfirmation(`${operation}_${entityType}`, payload, {
    operation,
    entityType,
    entityId,
    entityName,
    warnings,
  });

  const preview = confirmationManager.getPreview(token)!;
  return { token, preview };
}
