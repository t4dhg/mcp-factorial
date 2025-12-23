/**
 * Write operation safety and risk classification
 *
 * Provides risk levels and policies for write operations to help
 * determine which operations require confirmation or special handling.
 */

/**
 * Risk levels for write operations
 */
export enum OperationRisk {
  /** Low risk - minor updates, safe to execute without confirmation */
  LOW = 'low',
  /** Medium risk - creates or significant updates, preview recommended */
  MEDIUM = 'medium',
  /** High risk - deletes, terminates, affects multiple records */
  HIGH = 'high',
  /** Critical risk - irreversible bulk operations, require explicit confirmation */
  CRITICAL = 'critical',
}

/**
 * Policy for a write operation
 */
export interface OperationPolicy {
  /** Risk level of the operation */
  risk: OperationRisk;
  /** Whether explicit confirmation is required */
  requiresConfirmation: boolean;
  /** Whether to show a preview before executing */
  requiresPreview: boolean;
  /** Maximum number of records that can be affected in batch */
  maxBatchSize?: number;
  /** Cooldown period in ms between repeated operations */
  cooldownMs?: number;
  /** Human-readable description of the operation's impact */
  impactDescription?: string;
}

/**
 * Default policies for write operations
 */
export const OPERATION_POLICIES: Record<string, OperationPolicy> = {
  // Employee operations
  create_employee: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Creates a new employee record in the system',
  },
  update_employee: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Updates employee information',
  },
  terminate_employee: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Terminates employee, revoking access and removing from active lists',
  },

  // Team operations
  create_team: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Creates a new team',
  },
  update_team: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Updates team information',
  },
  delete_team: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Deletes the team and removes all member associations',
  },
  add_team_member: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: false,
    impactDescription: 'Adds an employee to the team',
  },
  remove_team_member: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: false,
    impactDescription: 'Removes an employee from the team',
  },

  // Location operations
  create_location: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Creates a new office location',
  },
  update_location: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Updates location information',
  },
  delete_location: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Deletes the location and removes employee associations',
  },

  // Leave operations
  create_leave: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Creates a new leave request',
  },
  update_leave: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Updates leave request details',
  },
  cancel_leave: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Cancels the leave request',
  },
  approve_leave: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Approves the leave request, deducting from allowance',
  },
  reject_leave: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Rejects the leave request',
  },

  // Shift operations
  create_shift: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: false,
    impactDescription: 'Creates an attendance shift record',
  },
  update_shift: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: false,
    impactDescription: 'Updates shift clock in/out times',
  },
  delete_shift: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Deletes the shift record',
  },

  // Document operations
  upload_document: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Uploads a new document',
  },
  update_document: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: false,
    impactDescription: 'Updates document metadata',
  },
  delete_document: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Permanently deletes the document',
  },

  // Project operations
  create_project: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Creates a new project',
  },
  update_project: {
    risk: OperationRisk.LOW,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Updates project details',
  },
  delete_project: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Deletes the project and all associated tasks/time records',
  },

  // ATS operations
  create_job_posting: {
    risk: OperationRisk.MEDIUM,
    requiresConfirmation: false,
    requiresPreview: true,
    impactDescription: 'Creates a new job posting',
  },
  delete_job_posting: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Deletes the job posting and all applications',
  },
  delete_candidate: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Permanently deletes the candidate record',
  },

  // Training operations
  delete_training: {
    risk: OperationRisk.HIGH,
    requiresConfirmation: true,
    requiresPreview: true,
    impactDescription: 'Deletes the training program and all enrollments',
  },
};

/**
 * Get the policy for an operation
 */
export function getOperationPolicy(operationName: string): OperationPolicy {
  return (
    OPERATION_POLICIES[operationName] ?? {
      risk: OperationRisk.MEDIUM,
      requiresConfirmation: false,
      requiresPreview: true,
      impactDescription: 'Modifies data in FactorialHR',
    }
  );
}

/**
 * Check if an operation requires confirmation
 */
export function requiresConfirmation(operationName: string): boolean {
  return getOperationPolicy(operationName).requiresConfirmation;
}

/**
 * Get a warning message for high-risk operations
 */
export function getWarningMessage(operationName: string): string | null {
  const policy = getOperationPolicy(operationName);

  if (policy.risk === OperationRisk.HIGH || policy.risk === OperationRisk.CRITICAL) {
    return (
      `**Warning:** This is a ${policy.risk}-risk operation. ${policy.impactDescription}. ` +
      (policy.requiresConfirmation
        ? 'Please confirm by setting `confirm: true`.'
        : 'Please review carefully before proceeding.')
    );
  }

  return null;
}
