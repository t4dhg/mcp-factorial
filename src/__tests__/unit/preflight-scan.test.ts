import { describe, it, expect } from 'vitest';
import {
  SELF_PATH,
  isPlaceholderValue,
  scanLineForSecrets,
  isAssistantConfigPath,
  isPlanningDocPath,
  isAssistantWorkspacePath,
  classifyStagedPath,
  scanLineForReferences,
  isFixturePath,
  hasAnonymizationMarker,
  isShippingPath,
  parseUnifiedDiff,
  runScan,
  hasBlockingFindings,
  formatReport,
} from '../../../scripts/preflight-scan.mjs';

describe('preflight-scan: secrets', () => {
  it('catches a real-looking GitHub personal access token', () => {
    const line = `const token = "ghp_${'A1b2C3d4E5f6G7h8I9j0'}";`;
    const findings = scanLineForSecrets(line);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].reason).toMatch(/GitHub personal access token/);
  });

  it('catches a real-looking Anthropic API key', () => {
    // Built from two pieces at runtime (rather than one contiguous literal)
    // so this fixture is not itself a secret-shaped value when this test
    // file's own source is scanned.
    const line = `ANTHROPIC_API_KEY=sk-ant-${'api03-abcdefghijklmnopqrstuvwxyz0123456789'}`;
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /Anthropic API key/.test(f.reason))).toBe(true);
  });

  it('catches a PEM private key block', () => {
    const line = `-----BEGIN RSA${' '}PRIVATE KEY-----`;
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /PEM private key/.test(f.reason))).toBe(true);
  });

  it('catches an opaque literal assigned to a *_TOKEN-shaped name', () => {
    const line = `SLACK_BOT_TOKEN=${'a1B2c3D4e5F6g7H8i9J0k1L2'}`;
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /assigned to a name matching/.test(f.reason))).toBe(true);
  });

  it('does NOT catch the documented pat_xxxxxxxx_xxxxxxxx placeholder', () => {
    const line = 'Example: HOLDED_API_KEY=pat_xxxxxxxx_xxxxxxxx';
    expect(scanLineForSecrets(line)).toHaveLength(0);
  });

  it('does not catch other documented placeholder shapes', () => {
    expect(isPlaceholderValue('xxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isPlaceholderValue('<your-api-key-here>')).toBe(true);
    expect(isPlaceholderValue('changeme')).toBe(true);
    expect(isPlaceholderValue('sk-ant-example-redacted-key')).toBe(true);
  });

  it('does not flag a line with no secret-shaped value', () => {
    expect(scanLineForSecrets('export function getConfig() {')).toHaveLength(0);
  });
});

describe('preflight-scan: process artefact paths', () => {
  it('catches a planning path being staged', () => {
    const result = classifyStagedPath('docs/plans/2024-implementation-plan.md');
    expect(result).not.toBeNull();
    expect(result?.reason).toMatch(/planning or process artefact/);
  });

  it('allows an ADR path under docs/', () => {
    expect(isPlanningDocPath('docs/adr/0001-use-postgres.md')).toBe(false);
    expect(classifyStagedPath('docs/adr/0001-use-postgres.md')).toBeNull();
  });

  it('allows ordinary published documentation under docs/', () => {
    expect(classifyStagedPath('docs/getting-started.md')).toBeNull();
  });

  it('catches an assistant config path', () => {
    expect(isAssistantConfigPath('CLAUDE.md')).toBe(true);
    expect(classifyStagedPath('CLAUDE.md')?.reason).toMatch(/\.git\/info\/exclude/);
    expect(isAssistantConfigPath('.claude/settings.json')).toBe(true);
    expect(isAssistantConfigPath('.cursor/rules.json')).toBe(true);
    expect(isAssistantConfigPath('.aiderignore')).toBe(true);
    expect(isAssistantConfigPath('.github/copilot-instructions.md')).toBe(true);
    expect(isAssistantConfigPath('AGENTS.md')).toBe(true);
  });

  it('catches a path through an assistant scratch workspace directory', () => {
    expect(isAssistantWorkspacePath('scratchpad/notes.md')).toBe(true);
    expect(classifyStagedPath('scratchpad/notes.md')?.reason).toMatch(/scratch files/);
  });

  it('leaves an unrelated path unclassified', () => {
    expect(classifyStagedPath('src/index.ts')).toBeNull();
  });

  it('never classifies its own path', () => {
    expect(SELF_PATH).toBe('scripts/preflight-scan.mjs');
  });
});

describe('preflight-scan: references inside staged content', () => {
  it('catches a mention of a planning path inside a line of text', () => {
    const findings = scanLineForReferences(
      'See docs/plans/2024-implementation-plan.md for background.'
    );
    expect(findings.some(f => /planning artefact path/.test(f.reason))).toBe(true);
  });

  it('catches a mention of an assistant config filename even inside a comment', () => {
    const findings = scanLineForReferences('// keep this consistent with CLAUDE.md');
    expect(findings.some(f => /assistant\/editor tooling path/.test(f.reason))).toBe(true);
  });

  it('does not flag ordinary content', () => {
    expect(scanLineForReferences('This library speaks the Holded v2 API.')).toHaveLength(0);
  });
});

describe('preflight-scan: fixtures', () => {
  it('recognises a fixtures path', () => {
    expect(isFixturePath('src/__tests__/fixtures/contacts.json')).toBe(true);
    expect(isFixturePath('src/index.ts')).toBe(false);
  });

  it('finds the anonymisation marker used by this project', () => {
    expect(hasAnonymizationMarker('"name": "Example Company 1 SL"')).toBe(true);
    expect(hasAnonymizationMarker('"email": "jane.doe@example.com"')).toBe(true);
    expect(hasAnonymizationMarker('"iban": "ES0000000000000000000000"')).toBe(false);
  });
});

describe('preflight-scan: shipping set', () => {
  const filesList = ['dist/', 'README.md', 'llms.txt'];

  it('treats package.json, README and LICENSE as always shipping', () => {
    expect(isShippingPath('package.json', filesList)).toBe(true);
    expect(isShippingPath('README.md', filesList)).toBe(true);
    expect(isShippingPath('LICENSE', filesList)).toBe(true);
  });

  it('treats entries from the files array as shipping', () => {
    expect(isShippingPath('dist/index.js', filesList)).toBe(true);
    expect(isShippingPath('llms.txt', filesList)).toBe(true);
  });

  it('does not treat everything else as shipping', () => {
    expect(isShippingPath('src/index.ts', filesList)).toBe(false);
    expect(isShippingPath('CONTRIBUTING.md', filesList)).toBe(false);
  });
});

describe('preflight-scan: diff parsing', () => {
  it('assigns correct new-file line numbers, skipping removed lines', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index 1111111..2222222 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -5,2 +5,3 @@',
      '-const removed = 1;',
      '+const kept = 1;',
      '+const added = 2;',
      '+const alsoAdded = 3;',
    ].join('\n');

    const parsed = parseUnifiedDiff(diff);
    expect(parsed.get('src/foo.ts')).toEqual([
      { line: 5, text: 'const kept = 1;' },
      { line: 6, text: 'const added = 2;' },
      { line: 7, text: 'const alsoAdded = 3;' },
    ]);
  });

  it('handles a brand new file starting at line 1', () => {
    const diff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,2 @@',
      '+line one',
      '+line two',
    ].join('\n');

    expect(parseUnifiedDiff(diff).get('src/new.ts')).toEqual([
      { line: 1, text: 'line one' },
      { line: 2, text: 'line two' },
    ]);
  });
});

describe('preflight-scan: end-to-end scan via runScan', () => {
  it('flags a reference to a planning path inside README.md and marks it as shipping', () => {
    const diff = [
      'diff --git a/README.md b/README.md',
      'index 1111111..2222222 100644',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -10,0 +11,1 @@',
      '+See docs/plans/2024-implementation-plan.md for the full rationale.',
    ].join('\n');

    const addedLines = parseUnifiedDiff(diff);
    const findings = runScan({
      stagedPaths: ['README.md'],
      addedLines,
      filesList: ['dist/', 'README.md', 'llms.txt'],
    });

    expect(findings.artifactReferences).toHaveLength(1);
    expect(findings.artifactReferences[0]).toMatchObject({
      path: 'README.md',
      line: 11,
      shipping: true,
    });
    expect(hasBlockingFindings(findings)).toBe(true);
  });

  it('does not mark the same reference as shipping in a non-shipping file', () => {
    const diff = [
      'diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md',
      'index 1111111..2222222 100644',
      '--- a/CONTRIBUTING.md',
      '+++ b/CONTRIBUTING.md',
      '@@ -1,0 +2,1 @@',
      '+See docs/plans/2024-implementation-plan.md for the full rationale.',
    ].join('\n');

    const findings = runScan({
      stagedPaths: ['CONTRIBUTING.md'],
      addedLines: parseUnifiedDiff(diff),
      filesList: ['dist/', 'README.md', 'llms.txt'],
    });

    expect(findings.artifactReferences[0]).toMatchObject({ shipping: false });
  });

  it('warns, but does not block, on a staged fixture with no anonymisation marker', () => {
    const diff = [
      'diff --git a/src/__tests__/fixtures/new-thing.json b/src/__tests__/fixtures/new-thing.json',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/src/__tests__/fixtures/new-thing.json',
      '@@ -0,0 +2,2 @@',
      '+{',
      '+  "id": "abc123"',
    ].join('\n');

    const findings = runScan({
      stagedPaths: ['src/__tests__/fixtures/new-thing.json'],
      addedLines: parseUnifiedDiff(diff),
      filesList: [],
    });

    expect(findings.fixtureWarnings).toHaveLength(1);
    expect(findings.fixtureWarnings[0].path).toBe('src/__tests__/fixtures/new-thing.json');
    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it('does not warn on a staged fixture that carries the anonymisation marker', () => {
    const diff = [
      'diff --git a/src/__tests__/fixtures/new-thing.json b/src/__tests__/fixtures/new-thing.json',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/src/__tests__/fixtures/new-thing.json',
      '@@ -0,0 +2,2 @@',
      '+{',
      '+  "name": "Example Company 1 SL"',
    ].join('\n');

    const findings = runScan({
      stagedPaths: ['src/__tests__/fixtures/new-thing.json'],
      addedLines: parseUnifiedDiff(diff),
      filesList: [],
    });

    expect(findings.fixtureWarnings).toHaveLength(0);
  });

  it('is blocking when a planning path itself is staged', () => {
    const findings = runScan({
      stagedPaths: ['docs/plans/2024-implementation-plan.md'],
      addedLines: new Map(),
      filesList: [],
    });
    expect(hasBlockingFindings(findings)).toBe(true);
    expect(formatReport(findings)).toMatch(/PREFLIGHT_SKIP=1/);
    expect(formatReport(findings)).toMatch(/--no-verify/);
  });

  it('never flags the scanner file itself, even for staged-path and content checks', () => {
    const diff = [
      'diff --git a/scripts/preflight-scan.mjs b/scripts/preflight-scan.mjs',
      'index 1111111..2222222 100644',
      '--- a/scripts/preflight-scan.mjs',
      '+++ b/scripts/preflight-scan.mjs',
      '@@ -1,0 +2,1 @@',
      '+// references CLAUDE.md and docs/plans/example.md and ghp_realTokenShapedValueHere1234',
    ].join('\n');

    const findings = runScan({
      stagedPaths: [SELF_PATH],
      addedLines: parseUnifiedDiff(diff),
      filesList: [],
    });

    expect(findings.secrets).toHaveLength(0);
    expect(findings.artifactPaths).toHaveLength(0);
    expect(findings.artifactReferences).toHaveLength(0);
    expect(findings.fixtureWarnings).toHaveLength(0);
    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it('reports clean when nothing is staged', () => {
    const findings = runScan({ stagedPaths: [], addedLines: new Map(), filesList: [] });
    expect(hasBlockingFindings(findings)).toBe(false);
    expect(formatReport(findings)).toMatch(/clean/);
  });
});
