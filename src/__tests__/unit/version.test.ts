import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The version the server reports over MCP is a hand-maintained constant, so nothing
// stops it drifting from the published package version. It did: the server announced
// 8.0.0 while the package was on 11.0.0, for three major releases. This test is the
// thing that would have caught it.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');

describe('reported version', () => {
  it('agrees across package.json, SERVER_VERSION and server.json', async () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      version: string;
    };
    const srv = JSON.parse(readFileSync(path.join(repoRoot, 'server.json'), 'utf8')) as {
      version: string;
      packages: { version: string }[];
    };
    const { SERVER_VERSION } = await import('../../tools/index.js');

    expect(SERVER_VERSION).toBe(pkg.version);
    expect(srv.version).toBe(pkg.version);
    expect(srv.packages[0]!.version).toBe(pkg.version);
  });
});
