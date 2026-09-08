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

// Every fixture below that is secret- or reference-shaped is assembled from
// two or more string pieces joined with `+`, never written as one
// contiguous literal. That is deliberate, not decoration: this test file is
// NOT exempt from the scanner (only scripts/preflight-scan.mjs itself is),
// so when this file is staged for a real commit, the scanner reads its own
// raw source like any other file. A contiguous secret-shaped token or a
// contiguous mention of an assistant config filename in the source would be
// a true finding and block the commit; splitting it across a `+` means the
// finding only exists once the pieces are joined at test-run time, which is
// exactly what the detection functions receive as their input.

describe('preflight-scan: secrets', () => {
  it('catches a real-looking GitHub personal access token', () => {
    const line = 'const token = ' + ('ghp_' + 'realTokenShapedValueHere1234');
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /GitHub personal access token/.test(f.reason))).toBe(true);
  });

  it('catches a real-looking Anthropic API key', () => {
    const line = 'ANTHROPIC_API_KEY=' + ('sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz0123456789');
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /Anthropic API key/.test(f.reason))).toBe(true);
  });

  it('catches a Stripe-style sk_live_ key', () => {
    const line = 'STRIPE_KEY=' + ('sk_live_' + 'A1b2C3d4E5f6G7h8I9j0K1l2');
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /Stripe API key/.test(f.reason))).toBe(true);
  });

  it('catches a Stripe-style sk_test_ key', () => {
    const line = 'STRIPE_KEY=' + ('sk_test_' + 'A1b2C3d4E5f6G7h8I9j0K1l2');
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /Stripe API key/.test(f.reason))).toBe(true);
  });

  it('does not confuse a Stripe underscore key with the generic hyphenated sk- pattern', () => {
    // The generic "sk-" pattern requires a hyphen right after "sk-", so it
    // must not also fire a second time on the underscore-shaped key above.
    const line = 'sk_live_' + 'A1b2C3d4E5f6G7h8I9j0K1l2';
    const findings = scanLineForSecrets(line);
    expect(findings.filter(f => /Stripe API key/.test(f.reason))).toHaveLength(1);
    expect(findings.some(f => /generic sk-prefixed/.test(f.reason))).toBe(false);
  });

  it('catches a bare Authorization: Bearer credential with no telltale variable name', () => {
    const line = 'Authorization: Bearer ' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4';
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /bearer credential/.test(f.reason))).toBe(true);
  });

  it('catches a bare JWT-shaped token with no telltale variable name', () => {
    const line =
      'ey' +
      'JhbGciOiJIUzI1NiJ9' +
      '.' +
      ('ey' + 'JzdWIiOiIxMjM0NTY3ODkwIn0') +
      '.' +
      'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /JWT-shaped token/.test(f.reason))).toBe(true);
  });

  it('catches a PEM private key block', () => {
    const line = '-----BEGIN RSA' + ' ' + 'PRIVATE KEY-----';
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /PEM private key/.test(f.reason))).toBe(true);
  });

  it('catches an opaque literal assigned to a *_TOKEN-shaped name', () => {
    const line = 'SLACK_BOT_TOKEN=' + 'a1B2c3D4e5F6g7H8i9J0k1L2';
    const findings = scanLineForSecrets(line);
    expect(findings.some(f => /assigned to a name matching/.test(f.reason))).toBe(true);
  });

  it('catches the reviewer-confirmed bypass: a placeholder-word PREFIX no longer waves through a real secret', () => {
    // The bypass: a STRIPE_API_KEY value that starts with "your" but is not
    // a template, it is a real-looking key that happens to start the same
    // way a placeholder would. The old substring-based placeholder check
    // waved this through with zero findings; the anchored check must not.
    const line = 'STRIPE_API_KEY=' + 'your9fK3mN7pQ2xR8vT1wZ5yB6cD4eF0gH2j2K5L8M1N4';
    const findings = scanLineForSecrets(line);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some(f => /assigned to a name matching/.test(f.reason))).toBe(true);
  });

  it('does NOT catch the documented pat_xxxxxxxx_xxxxxxxx placeholder', () => {
    const line = 'Example: HOLDED_API_KEY=' + 'pat_xxxxxxxx_xxxxxxxx';
    expect(scanLineForSecrets(line)).toHaveLength(0);
  });

  it('does not flag a line with no secret-shaped value', () => {
    expect(scanLineForSecrets('export function getConfig() {')).toHaveLength(0);
  });
});

describe('preflight-scan: placeholder detection is anchored, not a substring test', () => {
  it('treats a placeholder PREFIX followed by a separator as a placeholder', () => {
    expect(isPlaceholderValue('your-api-key')).toBe(true);
    expect(isPlaceholderValue('your_api_key')).toBe(true);
    expect(isPlaceholderValue('my.token.value')).toBe(true);
    expect(isPlaceholderValue('test:credential')).toBe(true);
    expect(isPlaceholderValue('example')).toBe(true); // prefix word alone, ends there
  });

  it('does NOT treat a placeholder prefix glued to real-looking characters as a placeholder', () => {
    // This is the crux of the fix: "your" followed directly by opaque
    // characters (no separator) is a real secret, not a template.
    expect(isPlaceholderValue('your9fK3mN7pQ2xR8vT1wZ5yB6cD4eF0gH2j2K5L8M1N4')).toBe(false);
    expect(isPlaceholderValue('mySecretValue1234567890')).toBe(false);
    expect(isPlaceholderValue('testAB12cd34EF56gh78IJ90')).toBe(false);
  });

  it('still recognises xxxx, angle brackets and repeated characters as placeholders', () => {
    expect(isPlaceholderValue('pat_xxxxxxxx_xxxxxxxx')).toBe(true);
    expect(isPlaceholderValue('xxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isPlaceholderValue('<your-api-key-here>')).toBe(true);
    expect(isPlaceholderValue('....................')).toBe(true);
    expect(isPlaceholderValue('00000000000000000000')).toBe(true);
  });

  it('recognises the short list of exact placeholder words', () => {
    expect(isPlaceholderValue('changeme')).toBe(true);
    expect(isPlaceholderValue('CHANGEME')).toBe(true);
    expect(isPlaceholderValue('redacted')).toBe(true);
    expect(isPlaceholderValue('secret')).toBe(true);
    expect(isPlaceholderValue('token')).toBe(true);
  });

  it('does not treat an ordinary opaque value as a placeholder', () => {
    expect(isPlaceholderValue('A1b2C3d4E5f6G7h8I9j0K1l2M3n4')).toBe(false);
  });
});

describe('preflight-scan: process artefact paths', () => {
  it('catches a planning path being staged', () => {
    const planningPath = 'docs/' + 'plans/2024-implementation-plan.md';
    const result = classifyStagedPath(planningPath);
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

  it('catches a plural planning-keyword directory as a full path segment', () => {
    const designsPath = 'docs/' + 'designs/foo.md';
    expect(isPlanningDocPath(designsPath)).toBe(true);
    expect(classifyStagedPath(designsPath)).not.toBeNull();
  });

  it('does not treat a compound name that merely contains a planning keyword as one', () => {
    // "design-system" is a real, ordinary documentation page: the keyword
    // must match a whole path segment, not a substring inside a longer one.
    expect(isPlanningDocPath('docs/design-system.md')).toBe(false);
    expect(classifyStagedPath('docs/design-system.md')).toBeNull();
  });

  it('catches an assistant config path', () => {
    // Each directory prefix below is itself a complete match for the
    // reference pattern, with nothing required after it, so the split has
    // to land INSIDE the prefix itself, not merely before the filename
    // that follows it (splitting only there would still leave the prefix
    // contiguous and self-trigger the scanner on this very file).
    const claudeMd = 'CLAUDE' + '.md';
    const agentsMd = 'AGENTS' + '.md';
    const dotClaudeSettings = '.cla' + 'ude/' + 'settings.json';
    const dotCursorRules = '.cur' + 'sor/' + 'rules.json';
    const aiderIgnore = '.aid' + 'er' + 'ignore';
    const copilotInstructions = '.github/cop' + 'ilot-' + 'instructions.md';

    expect(isAssistantConfigPath(claudeMd)).toBe(true);
    expect(classifyStagedPath(claudeMd)?.reason).toMatch(/\.git\/info\/exclude/);
    expect(isAssistantConfigPath(dotClaudeSettings)).toBe(true);
    expect(isAssistantConfigPath(dotCursorRules)).toBe(true);
    expect(isAssistantConfigPath(aiderIgnore)).toBe(true);
    expect(isAssistantConfigPath(copilotInstructions)).toBe(true);
    expect(isAssistantConfigPath(agentsMd)).toBe(true);
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
    const line = 'See ' + ('docs/' + 'plans/2024-implementation-plan.md') + ' for background.';
    const findings = scanLineForReferences(line);
    expect(findings.some(f => /planning artefact path/.test(f.reason))).toBe(true);
  });

  it('does not flag a mention of an ordinary docs/ page that merely contains a keyword substring', () => {
    const line = 'See docs/design-system.md for the component tokens.';
    expect(scanLineForReferences(line)).toHaveLength(0);
  });

  it('catches a mention of an assistant config filename even inside a comment', () => {
    const line = '// keep this consistent with ' + ('CLAUDE' + '.md');
    const findings = scanLineForReferences(line);
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

  it('does not treat everything else as shipping when "files" is declared', () => {
    expect(isShippingPath('src/index.ts', filesList)).toBe(false);
    expect(isShippingPath('CONTRIBUTING.md', filesList)).toBe(false);
  });

  it('treats nearly everything as shipping when "files" is absent, excluding only what npm always excludes', () => {
    expect(isShippingPath('src/index.ts', null)).toBe(true);
    expect(isShippingPath('src/index.ts', undefined)).toBe(true);
    expect(isShippingPath('CONTRIBUTING.md')).toBe(true);
    expect(isShippingPath('node_modules/foo/index.js', null)).toBe(false);
    expect(isShippingPath('.git/config', null)).toBe(false);
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
    const planningMention =
      'See ' + ('docs/' + 'plans/2024-implementation-plan.md') + ' for the full rationale.';
    const diff = [
      'diff --git a/README.md b/README.md',
      'index 1111111..2222222 100644',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -10,0 +11,1 @@',
      '+' + planningMention,
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
    const planningMention =
      'See ' + ('docs/' + 'plans/2024-implementation-plan.md') + ' for the full rationale.';
    const diff = [
      'diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md',
      'index 1111111..2222222 100644',
      '--- a/CONTRIBUTING.md',
      '+++ b/CONTRIBUTING.md',
      '@@ -1,0 +2,1 @@',
      '+' + planningMention,
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
    // A report that is only a non-blocking warning must not tell someone
    // how to override a commit that was never going to be rejected.
    const report = formatReport(findings);
    expect(report).toMatch(/Warnings, not blocking/);
    expect(report).not.toMatch(/PREFLIGHT_SKIP/);
    expect(report).not.toMatch(/--no-verify/);
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

  it('is blocking when a planning path itself is staged, and the report explains both overrides', () => {
    const planningPath = 'docs/' + 'plans/2024-implementation-plan.md';
    const findings = runScan({
      stagedPaths: [planningPath],
      addedLines: new Map(),
      filesList: [],
    });
    expect(hasBlockingFindings(findings)).toBe(true);
    expect(formatReport(findings)).toMatch(/PREFLIGHT_SKIP=1/);
    expect(formatReport(findings)).toMatch(/--no-verify/);
  });

  it('never flags the scanner file itself, even for staged-path and content checks', () => {
    const selfReferentialLine =
      '// references ' +
      ('CLAUDE' + '.md') +
      ' and ' +
      ('docs/' + 'plans/example.md') +
      ' and ' +
      ('ghp_' + 'realTokenShapedValueHere1234');
    const diff = [
      'diff --git a/scripts/preflight-scan.mjs b/scripts/preflight-scan.mjs',
      'index 1111111..2222222 100644',
      '--- a/scripts/preflight-scan.mjs',
      '+++ b/scripts/preflight-scan.mjs',
      '@@ -1,0 +2,1 @@',
      '+' + selfReferentialLine,
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
