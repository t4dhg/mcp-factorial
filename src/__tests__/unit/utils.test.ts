import { describe, it, expect } from 'vitest';
import { validateId, validatePositiveNumber, validateNonEmptyString } from '../../utils.js';

describe('Utils', () => {
  describe('validateId', () => {
    it('should accept valid positive integers', () => {
      expect(validateId(1, 'employee')).toBe(1);
      expect(validateId(42, 'team')).toBe(42);
      expect(validateId(999999, 'location')).toBe(999999);
    });

    it('should reject zero', () => {
      expect(() => validateId(0, 'employee')).toThrow(
        'Invalid employee ID. Please provide a positive integer.'
      );
    });

    it('should reject negative numbers', () => {
      expect(() => validateId(-1, 'employee')).toThrow(
        'Invalid employee ID. Please provide a positive integer.'
      );
      expect(() => validateId(-100, 'team')).toThrow(
        'Invalid team ID. Please provide a positive integer.'
      );
    });

    it('should reject non-integers', () => {
      expect(() => validateId(1.5, 'employee')).toThrow(
        'Invalid employee ID. Please provide a positive integer.'
      );
      expect(() => validateId(3.14, 'location')).toThrow(
        'Invalid location ID. Please provide a positive integer.'
      );
    });

    it('should reject non-numbers', () => {
      expect(() => validateId('1', 'employee')).toThrow(
        'Invalid employee ID. Please provide a positive integer.'
      );
      expect(() => validateId(null, 'team')).toThrow(
        'Invalid team ID. Please provide a positive integer.'
      );
      expect(() => validateId(undefined, 'location')).toThrow(
        'Invalid location ID. Please provide a positive integer.'
      );
      expect(() => validateId({}, 'project')).toThrow(
        'Invalid project ID. Please provide a positive integer.'
      );
      expect(() => validateId([], 'training')).toThrow(
        'Invalid training ID. Please provide a positive integer.'
      );
    });

    it('should reject NaN', () => {
      expect(() => validateId(NaN, 'employee')).toThrow(
        'Invalid employee ID. Please provide a positive integer.'
      );
    });

    it('should include resource type in error message', () => {
      expect(() => validateId(-1, 'custom_resource')).toThrow(
        'Invalid custom_resource ID. Please provide a positive integer.'
      );
    });
  });

  describe('validatePositiveNumber', () => {
    it('should accept positive integers', () => {
      expect(validatePositiveNumber(1, 'amount')).toBe(1);
      expect(validatePositiveNumber(100, 'hours')).toBe(100);
    });

    it('should accept positive decimals', () => {
      expect(validatePositiveNumber(1.5, 'amount')).toBe(1.5);
      expect(validatePositiveNumber(0.01, 'rate')).toBe(0.01);
      expect(validatePositiveNumber(3.14159, 'value')).toBe(3.14159);
    });

    it('should reject zero', () => {
      expect(() => validatePositiveNumber(0, 'amount')).toThrow(
        'Invalid amount. Please provide a positive number.'
      );
    });

    it('should reject negative numbers', () => {
      expect(() => validatePositiveNumber(-1, 'amount')).toThrow(
        'Invalid amount. Please provide a positive number.'
      );
      expect(() => validatePositiveNumber(-0.5, 'rate')).toThrow(
        'Invalid rate. Please provide a positive number.'
      );
    });

    it('should reject non-numbers', () => {
      expect(() => validatePositiveNumber('10', 'amount')).toThrow(
        'Invalid amount. Please provide a positive number.'
      );
      expect(() => validatePositiveNumber(null, 'hours')).toThrow(
        'Invalid hours. Please provide a positive number.'
      );
      expect(() => validatePositiveNumber(undefined, 'rate')).toThrow(
        'Invalid rate. Please provide a positive number.'
      );
    });

    it('should include field name in error message', () => {
      expect(() => validatePositiveNumber(-1, 'custom_field')).toThrow(
        'Invalid custom_field. Please provide a positive number.'
      );
    });
  });

  describe('validateNonEmptyString', () => {
    it('should accept non-empty strings', () => {
      expect(validateNonEmptyString('hello', 'name')).toBe('hello');
      expect(validateNonEmptyString('test value', 'description')).toBe('test value');
    });

    it('should trim whitespace and return trimmed value', () => {
      expect(validateNonEmptyString('  hello  ', 'name')).toBe('hello');
      expect(validateNonEmptyString('\tvalue\n', 'field')).toBe('value');
    });

    it('should reject empty strings', () => {
      expect(() => validateNonEmptyString('', 'name')).toThrow(
        'Invalid name. Please provide a non-empty string.'
      );
    });

    it('should reject whitespace-only strings', () => {
      expect(() => validateNonEmptyString('   ', 'name')).toThrow(
        'Invalid name. Please provide a non-empty string.'
      );
      expect(() => validateNonEmptyString('\t\n', 'description')).toThrow(
        'Invalid description. Please provide a non-empty string.'
      );
    });

    it('should reject non-strings', () => {
      expect(() => validateNonEmptyString(123, 'name')).toThrow(
        'Invalid name. Please provide a non-empty string.'
      );
      expect(() => validateNonEmptyString(null, 'field')).toThrow(
        'Invalid field. Please provide a non-empty string.'
      );
      expect(() => validateNonEmptyString(undefined, 'value')).toThrow(
        'Invalid value. Please provide a non-empty string.'
      );
      expect(() => validateNonEmptyString({}, 'data')).toThrow(
        'Invalid data. Please provide a non-empty string.'
      );
    });

    it('should include field name in error message', () => {
      expect(() => validateNonEmptyString('', 'custom_field')).toThrow(
        'Invalid custom_field. Please provide a non-empty string.'
      );
    });
  });
});
