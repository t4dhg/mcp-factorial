import { describe, it, expect } from 'vitest';
import { OperationRisk, OPERATION_POLICIES } from '../../write-safety.js';

describe('Write Safety Module', () => {
  describe('OperationRisk enum', () => {
    it('should have all risk levels', () => {
      expect(OperationRisk.LOW).toBe('low');
      expect(OperationRisk.MEDIUM).toBe('medium');
      expect(OperationRisk.HIGH).toBe('high');
      expect(OperationRisk.CRITICAL).toBe('critical');
    });
  });

  describe('OPERATION_POLICIES', () => {
    it('should have policies for high-risk operations', () => {
      expect(OPERATION_POLICIES.terminate_employee).toBeDefined();
      expect(OPERATION_POLICIES.terminate_employee.risk).toBe(OperationRisk.HIGH);
      expect(OPERATION_POLICIES.terminate_employee.requiresConfirmation).toBe(true);
      expect(OPERATION_POLICIES.terminate_employee.requiresPreview).toBe(true);
    });

    it('should have policies for delete operations', () => {
      expect(OPERATION_POLICIES.delete_team).toBeDefined();
      expect(OPERATION_POLICIES.delete_team.risk).toBe(OperationRisk.HIGH);
      expect(OPERATION_POLICIES.delete_team.requiresConfirmation).toBe(true);

      expect(OPERATION_POLICIES.delete_location).toBeDefined();
      expect(OPERATION_POLICIES.delete_project).toBeDefined();
      expect(OPERATION_POLICIES.delete_candidate).toBeDefined();
    });

    it('should have policies for medium-risk operations', () => {
      expect(OPERATION_POLICIES.create_employee).toBeDefined();
      expect(OPERATION_POLICIES.create_employee.risk).toBe(OperationRisk.MEDIUM);
      expect(OPERATION_POLICIES.create_employee.requiresConfirmation).toBe(false);

      expect(OPERATION_POLICIES.create_team).toBeDefined();
      expect(OPERATION_POLICIES.create_team.risk).toBe(OperationRisk.MEDIUM);
    });

    it('should have policies for low-risk operations', () => {
      expect(OPERATION_POLICIES.update_employee).toBeDefined();
      expect(OPERATION_POLICIES.update_employee.risk).toBe(OperationRisk.LOW);
      expect(OPERATION_POLICIES.update_employee.requiresConfirmation).toBe(false);

      expect(OPERATION_POLICIES.update_team).toBeDefined();
      expect(OPERATION_POLICIES.update_team.risk).toBe(OperationRisk.LOW);
    });

    it('should include impactDescription for each policy', () => {
      const policy = OPERATION_POLICIES.terminate_employee;
      expect(policy.impactDescription).toBeDefined();
      expect(typeof policy.impactDescription).toBe('string');
      expect(policy.impactDescription!.length).toBeGreaterThan(0);
    });

    it('should have policies for core write operations', () => {
      // Employee operations
      expect(OPERATION_POLICIES.create_employee).toBeDefined();
      expect(OPERATION_POLICIES.update_employee).toBeDefined();

      // Team operations
      expect(OPERATION_POLICIES.create_team).toBeDefined();
      expect(OPERATION_POLICIES.update_team).toBeDefined();
      expect(OPERATION_POLICIES.delete_team).toBeDefined();

      // Location operations
      expect(OPERATION_POLICIES.create_location).toBeDefined();
      expect(OPERATION_POLICIES.update_location).toBeDefined();
      expect(OPERATION_POLICIES.delete_location).toBeDefined();

      // Leave operations
      expect(OPERATION_POLICIES.create_leave).toBeDefined();
      expect(OPERATION_POLICIES.update_leave).toBeDefined();
      expect(OPERATION_POLICIES.cancel_leave).toBeDefined();
      expect(OPERATION_POLICIES.approve_leave).toBeDefined();
      expect(OPERATION_POLICIES.reject_leave).toBeDefined();

      // Shift operations
      expect(OPERATION_POLICIES.create_shift).toBeDefined();
      expect(OPERATION_POLICIES.update_shift).toBeDefined();
      expect(OPERATION_POLICIES.delete_shift).toBeDefined();

      // Project operations
      expect(OPERATION_POLICIES.create_project).toBeDefined();
      expect(OPERATION_POLICIES.update_project).toBeDefined();
      expect(OPERATION_POLICIES.delete_project).toBeDefined();

      // Job posting operations
      expect(OPERATION_POLICIES.create_job_posting).toBeDefined();
      expect(OPERATION_POLICIES.delete_job_posting).toBeDefined();

      // Candidate operations
      expect(OPERATION_POLICIES.delete_candidate).toBeDefined();

      // Training operations
      expect(OPERATION_POLICIES.delete_training).toBeDefined();

      // Document operations
      expect(OPERATION_POLICIES.update_document).toBeDefined();
      expect(OPERATION_POLICIES.delete_document).toBeDefined();
    });

    it('should have consistent policy structure', () => {
      for (const [key, policy] of Object.entries(OPERATION_POLICIES)) {
        expect(policy.risk).toBeDefined();
        expect([
          OperationRisk.LOW,
          OperationRisk.MEDIUM,
          OperationRisk.HIGH,
          OperationRisk.CRITICAL,
        ]).toContain(policy.risk);

        expect(typeof policy.requiresConfirmation).toBe('boolean');
        expect(typeof policy.requiresPreview).toBe('boolean');

        // impactDescription is optional but if present should be a string
        if (policy.impactDescription !== undefined) {
          expect(typeof policy.impactDescription).toBe('string');
        }
      }
    });

    it('should require confirmation for all HIGH and CRITICAL risk operations', () => {
      for (const [key, policy] of Object.entries(OPERATION_POLICIES)) {
        if (policy.risk === OperationRisk.HIGH || policy.risk === OperationRisk.CRITICAL) {
          expect(policy.requiresConfirmation).toBe(true);
        }
      }
    });

    it('should require preview for operations that need confirmation', () => {
      for (const [key, policy] of Object.entries(OPERATION_POLICIES)) {
        if (policy.requiresConfirmation) {
          expect(policy.requiresPreview).toBe(true);
        }
      }
    });

    it('should have at least 20 operation policies defined', () => {
      const policyCount = Object.keys(OPERATION_POLICIES).length;
      expect(policyCount).toBeGreaterThanOrEqual(20);
    });

    it('should have proper naming convention for operations', () => {
      for (const key of Object.keys(OPERATION_POLICIES)) {
        // Operation names should be verb_entity format
        expect(key).toMatch(
          /^(create|update|delete|cancel|approve|reject|assign|archive|enroll|advance|terminate|add|remove|upload)_[a-z_]+$/
        );
      }
    });

    it('should mark delete and terminate operations as high risk', () => {
      for (const [key, policy] of Object.entries(OPERATION_POLICIES)) {
        // Most delete operations and terminate are high risk (delete_shift is medium)
        if ((key.startsWith('delete_') && key !== 'delete_shift') || key === 'terminate_employee') {
          expect(policy.risk).toBe(OperationRisk.HIGH);
          expect(policy.requiresConfirmation).toBe(true);
        }
      }
    });
  });
});
