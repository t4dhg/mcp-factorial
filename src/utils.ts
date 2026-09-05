/**
 * Shared utilities for MCP FactorialHR
 *
 * Provides common validation and helper functions used across the codebase.
 */

import * as path from 'node:path';

/**
 * Validate that a value is a positive integer ID
 *
 * @param id - The value to validate
 * @param resourceType - The type of resource for error messages (e.g., "employee", "team")
 * @returns The validated ID as a number
 * @throws Error if the ID is invalid
 */
export function validateId(id: unknown, resourceType: string): number {
  if (typeof id !== 'number' || !id || id <= 0 || !Number.isInteger(id)) {
    throw new Error(`Invalid ${resourceType} ID. Please provide a positive integer.`);
  }
  return id;
}

/**
 * Validate that a value is a positive number
 *
 * @param value - The value to validate
 * @param fieldName - The field name for error messages
 * @returns The validated number
 * @throws Error if the value is invalid
 */
export function validatePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || value <= 0) {
    throw new Error(`Invalid ${fieldName}. Please provide a positive number.`);
  }
  return value;
}

/**
 * Validate that a value is a non-empty string
 *
 * @param value - The value to validate
 * @param fieldName - The field name for error messages
 * @returns The validated string
 * @throws Error if the value is invalid
 */
export function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}. Please provide a non-empty string.`);
  }
  return value.trim();
}

/**
 * Shorten a filename to a byte budget, keeping its extension
 *
 * Counts bytes rather than characters, since the filesystem limit is in bytes
 * and a name can be entirely multi-byte.
 */
function truncateFilename(name: string, maxBytes: number): string {
  if (Buffer.byteLength(name, 'utf8') <= maxBytes) return name;

  const extension = path.extname(name).slice(0, maxBytes);
  const budget = maxBytes - Buffer.byteLength(extension, 'utf8');

  let stem = name.slice(0, name.length - extension.length);
  while (Buffer.byteLength(stem, 'utf8') > budget) {
    stem = stem.slice(0, -1);
  }

  return `${stem}${extension}`;
}

/**
 * Build a safe output path for a file downloaded from the Factorial API
 *
 * Document names come from Factorial metadata and can be set by anyone with
 * document-upload rights in the tenant, so they are untrusted input. Only the
 * final path segment is kept, and the resolved path is checked to make sure it
 * stays inside the output directory.
 *
 * Both `/` and `\` are treated as separators on every platform. A backslash is
 * a legal character in a POSIX filename, so a document genuinely named
 * `report\final.pdf` is saved as `final.pdf` on Linux and macOS. That is a
 * deliberate trade: downloaded files get carried onto other systems, and losing
 * part of a rare filename is cheaper than honouring a separator somewhere else.
 *
 * @param outputDir - Directory the file must be written into
 * @param filename - Untrusted filename taken from API metadata
 * @param fallbackName - Name to use when the filename sanitizes to nothing usable
 * @returns An absolute path inside outputDir
 * @throws Error if the resolved path would escape outputDir
 */
export function resolveSafeOutputPath(
  outputDir: string,
  filename: string,
  fallbackName: string
): string {
  const lastSegment = filename.split(/[/\\]/).pop() ?? '';

  // Drop control characters, which the filesystem rejects outright (a NUL makes
  // fs.writeFile throw), and cap the length, since most filesystems limit a
  // single path component to 255 bytes and reject anything longer.
  const printable = [...lastSegment]
    .filter(character => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('');

  const cleaned = truncateFilename(printable.trim(), 200);
  const safeName = cleaned === '' || cleaned === '.' || cleaned === '..' ? fallbackName : cleaned;

  const baseDir = path.resolve(outputDir);
  const outputPath = path.resolve(baseDir, safeName);
  const relative = path.relative(baseDir, outputPath);

  // Compare whole path segments: a file legitimately named "..archive.pdf"
  // starts with ".." without escaping anything.
  const escapesOutputDir =
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);

  if (escapesOutputDir) {
    throw new Error(`Refusing to write a document outside the output directory: ${filename}`);
  }

  return outputPath;
}

/**
 * Write a file, picking a free name rather than replacing an existing one
 *
 * Downloaded filenames come from tenant-controlled metadata, so a download can
 * otherwise land on an existing file the caller cares about, and two documents
 * sharing a name would silently collapse into one. The `wx` flag fails if the
 * path already exists, so the loop settles on the first free "name (n).ext".
 *
 * @param preferredPath - Where the file should go if nothing is there
 * @param buffer - File contents
 * @returns The path actually written
 * @throws Error if no free name is found, or on any non-EEXIST write failure
 */
export async function writeWithoutOverwriting(
  preferredPath: string,
  buffer: Buffer
): Promise<string> {
  const fs = await import('fs/promises');

  const directory = path.dirname(preferredPath);
  const extension = path.extname(preferredPath);
  const stem = path.basename(preferredPath, extension);

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate =
      attempt === 0 ? preferredPath : path.join(directory, `${stem} (${attempt})${extension}`);

    try {
      await fs.writeFile(candidate, buffer, { flag: 'wx' });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  throw new Error(
    `Could not find a free filename for ${preferredPath} after 100 attempts. ` +
      'Choose a different output_dir or clear the existing files.'
  );
}
