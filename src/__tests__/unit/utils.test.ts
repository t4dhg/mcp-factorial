import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  validateId,
  validatePositiveNumber,
  validateNonEmptyString,
  resolveSafeOutputPath,
  writeWithoutOverwriting,
} from '../../utils.js';

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

  describe('resolveSafeOutputPath', () => {
    const outputDir = '/tmp/downloads';

    it('joins a plain filename onto the output directory', () => {
      expect(resolveSafeOutputPath(outputDir, 'payslip.pdf', 'fallback.pdf')).toBe(
        path.resolve(outputDir, 'payslip.pdf')
      );
    });

    it('strips traversal segments from tenant-controlled names', () => {
      expect(resolveSafeOutputPath(outputDir, '../../../.ssh/authorized_keys', 'fallback')).toBe(
        path.resolve(outputDir, 'authorized_keys')
      );
    });

    it('strips a leading absolute path', () => {
      expect(resolveSafeOutputPath(outputDir, '/etc/passwd', 'fallback')).toBe(
        path.resolve(outputDir, 'passwd')
      );
    });

    it('treats a backslash as a separator on every platform', () => {
      expect(resolveSafeOutputPath(outputDir, '..\\..\\evil.exe', 'fallback')).toBe(
        path.resolve(outputDir, 'evil.exe')
      );
    });

    it('keeps names that merely start with dots', () => {
      expect(resolveSafeOutputPath(outputDir, '..archive.pdf', 'fallback')).toBe(
        path.resolve(outputDir, '..archive.pdf')
      );
      expect(resolveSafeOutputPath(outputDir, '.hidden.pdf', 'fallback')).toBe(
        path.resolve(outputDir, '.hidden.pdf')
      );
    });

    it('falls back when the name sanitizes to nothing usable', () => {
      for (const name of ['..', '.', '', '   ', 'a/b/..']) {
        expect(resolveSafeOutputPath(outputDir, name, 'document-7.pdf')).toBe(
          path.resolve(outputDir, 'document-7.pdf')
        );
      }
    });

    it('drops control characters that the filesystem would reject', () => {
      const withNul = `safe${String.fromCharCode(0)}.pdf`;
      expect(resolveSafeOutputPath(outputDir, withNul, 'fallback')).toBe(
        path.resolve(outputDir, 'safe.pdf')
      );

      const withNewline = 'line\nbreak.pdf';
      expect(resolveSafeOutputPath(outputDir, withNewline, 'fallback')).toBe(
        path.resolve(outputDir, 'linebreak.pdf')
      );
    });

    it('caps names that exceed the filesystem component limit, keeping the extension', () => {
      const long = `${'a'.repeat(5000)}.pdf`;
      const result = path.basename(resolveSafeOutputPath(outputDir, long, 'fallback'));

      expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(200);
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('caps multi-byte names by bytes, not characters', () => {
      const long = `${'\u00e9'.repeat(500)}.pdf`;
      const result = path.basename(resolveSafeOutputPath(outputDir, long, 'fallback'));

      expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(200);
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('throws if the fallback name would itself escape the directory', () => {
      expect(() => resolveSafeOutputPath(outputDir, '..', '../escape')).toThrow(
        /outside the output directory/
      );
    });
  });

  describe('writeWithoutOverwriting', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'mcp-factorial-test-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('writes to the preferred path when nothing is there', async () => {
      const target = path.join(dir, 'payslip.pdf');
      const written = await writeWithoutOverwriting(target, Buffer.from('first'));

      expect(written).toBe(target);
      expect(readFileSync(target, 'utf8')).toBe('first');
    });

    it('never overwrites an existing file', async () => {
      const target = path.join(dir, '.env');
      writeFileSync(target, 'SECRET=keep-me');

      const written = await writeWithoutOverwriting(target, Buffer.from('tenant content'));

      expect(written).not.toBe(target);
      expect(readFileSync(target, 'utf8')).toBe('SECRET=keep-me');
      expect(readFileSync(written, 'utf8')).toBe('tenant content');
    });

    it('keeps both documents when two share a name', async () => {
      const target = path.join(dir, 'payslip.pdf');

      const first = await writeWithoutOverwriting(target, Buffer.from('january'));
      const second = await writeWithoutOverwriting(target, Buffer.from('february'));
      const third = await writeWithoutOverwriting(target, Buffer.from('march'));

      expect([first, second, third].map(p => path.basename(p))).toEqual([
        'payslip.pdf',
        'payslip (1).pdf',
        'payslip (2).pdf',
      ]);
      expect(readFileSync(first, 'utf8')).toBe('january');
      expect(readFileSync(second, 'utf8')).toBe('february');
      expect(readFileSync(third, 'utf8')).toBe('march');
    });

    it('handles names with no extension', async () => {
      const target = path.join(dir, 'README');
      await writeWithoutOverwriting(target, Buffer.from('one'));
      const second = await writeWithoutOverwriting(target, Buffer.from('two'));

      expect(path.basename(second)).toBe('README (1)');
    });
  });
});
