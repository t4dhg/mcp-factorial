import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_ONLY_TOOLS } from '../../auth/attribution.js';

/**
 * Structural guard over who a write is attributed to.
 *
 * The attribution notice works because of three facts about the source, none
 * of which the type system holds in place: every tool is registered after the
 * wrapper is installed, every write to Factorial leaves through the one HTTP
 * client that reports it, and the list of tools excused from carrying the rule
 * names exactly the tools that cannot write.
 */

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiDir = path.join(srcDir, 'api');
const toolsDir = path.join(srcDir, 'tools');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

const WRITE_HELPERS = ['postOne', 'putOne', 'patchOne', 'deleteOne', 'postAction'];

/** Exported API functions whose body sends a write through the HTTP client */
function writeApiFunctions(): string[] {
  const found: string[] = [];
  for (const file of readdirSync(apiDir).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(path.join(apiDir, file), 'utf8');
    const pattern = /export async function (\w+)\(/g;
    let match = pattern.exec(source);
    while (match !== null) {
      const next = /\nexport /g;
      next.lastIndex = match.index + 1;
      const following = next.exec(source);
      const body = source.slice(match.index, following ? following.index : source.length);
      if (
        WRITE_HELPERS.some(helper => body.includes(`${helper}(`) || body.includes(`${helper}<`))
      ) {
        found.push(match[1]);
      }
      match = pattern.exec(source);
    }
  }
  return found;
}

/** Each registered tool name with whether its file calls a write API function */
function toolsByWriting(): Array<{ tool: string; writes: boolean }> {
  const writers = writeApiFunctions();
  return readdirSync(toolsDir)
    .filter(f => f.endsWith('.ts'))
    .flatMap(file => {
      const source = readFileSync(path.join(toolsDir, file), 'utf8');
      const writes = writers.some(fn => new RegExp(`\\b${fn}\\s*\\(`).test(source));
      return [...source.matchAll(/registerTool\(\s*'(factorial_\w+)'/g)].map(m => ({
        tool: m[1],
        writes,
      }));
    });
}

describe('attribution coverage', () => {
  it('derives a plausible set of write functions from the API layer', () => {
    const writers = writeApiFunctions();
    for (const expected of ['approveLeave', 'rejectLeave', 'createShift', 'deleteTeam']) {
      expect(writers).toContain(expected);
    }
    expect(writers.length).toBeGreaterThanOrEqual(40);
    expect(writers).not.toContain('listLeaves');
  });

  it('finds every registered tool', () => {
    expect(toolsByWriting().length).toBe(14);
  });

  it('excuses from the attribution rule exactly the tools that cannot write', () => {
    const cannotWrite = toolsByWriting()
      .filter(entry => !entry.writes)
      .map(entry => entry.tool)
      .sort();
    expect(cannotWrite).toEqual([...READ_ONLY_TOOLS].sort());
  });

  it('installs the wrapper before any tool is registered', () => {
    const source = readFileSync(path.join(toolsDir, 'index.ts'), 'utf8');
    const install = source.indexOf('installAttribution(server)');
    const firstDirect = source.indexOf('server.registerTool(');
    const firstDomain = source.search(/\bregister\w+Tool\(server\)/);
    expect(install).toBeGreaterThan(-1);
    expect(firstDirect).toBeGreaterThan(-1);
    expect(firstDomain).toBeGreaterThan(-1);
    expect(install).toBeLessThan(Math.min(firstDirect, firstDomain));
  });

  it('sends requests to Factorial from a known set of files only', () => {
    const callers = sourceFiles(srcDir)
      .filter(file => /(^|[^.\w])fetch\(/.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(srcDir, file).split(path.sep).join('/'))
      .sort();
    // http-client.ts carries every resource request and reports company-key
    // writes. The others: OAuth token endpoints, the identity check at login,
    // and the document download, which is a read made with a bearer token.
    expect(callers).toEqual([
      'api/documents.ts',
      'auth/login.ts',
      'auth/user-token.ts',
      'http-client.ts',
      'oauth.ts',
    ]);
  });

  it('reports a company-key write in exactly one place', () => {
    const callers = sourceFiles(srcDir)
      .filter(file => readFileSync(file, 'utf8').includes('noteCompanyKeyWrite()'))
      .map(file => path.relative(srcDir, file).split(path.sep).join('/'))
      .sort();
    expect(callers).toEqual(['auth/attribution.ts', 'http-client.ts']);
  });
});
