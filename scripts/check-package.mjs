import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Inspect the actual distribution, including npm's mandatory package.json.
const directory = mkdtempSync(join(tmpdir(), 'mcp-factorial-package-'));
try {
  const [packed] = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--cache',
        join(directory, 'cache'),
        '--pack-destination',
        directory,
      ],
      {
        encoding: 'utf8',
      }
    )
  );
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', join(directory, packed.filename), 'package/package.json'], {
      encoding: 'utf8',
    })
  );
  for (const lifecycle of [
    'preinstall',
    'install',
    'postinstall',
    'preprepare',
    'prepare',
    'postprepare',
  ]) {
    assert.equal(
      manifest.scripts?.[lifecycle],
      undefined,
      `Published lifecycle script: ${lifecycle}`
    );
  }
  const paths = new Set(packed.files.map(file => file.path));
  for (const entry of [
    manifest.main,
    ...Object.values(manifest.bin),
    manifest.exports['.'].types,
  ]) {
    assert(paths.has(entry.replace(/^\.\//, '')), `Missing package entry: ${entry}`);
  }
  for (const path of paths) {
    assert(!path.includes('__tests__/'), `Test material in package: ${path}`);
    assert(!path.endsWith('.tgz'), `Nested package archive: ${path}`);
  }
  console.log(
    `Package verified: ${packed.name}@${packed.version}, ${paths.size} files, no install lifecycle scripts`
  );
  if (process.argv[2]) {
    const destination = resolve(process.argv[2]);
    mkdirSync(destination, { recursive: true });
    copyFileSync(join(directory, packed.filename), join(destination, packed.filename));
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
