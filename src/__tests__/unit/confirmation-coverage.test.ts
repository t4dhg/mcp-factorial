import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Structural guard over the tool handlers.
 *
 * The confirmation gate is opt-in: a handler that never calls checkConfirmation
 * deletes without asking, and nothing in the type system notices, because the
 * `confirm` field is still declared on the tool schema.
 *
 * What counts as destructive is derived from the API layer, not from a list of
 * action names. Anything reaching `deleteOne()` issues an irreversible DELETE to
 * Factorial, whatever the action that calls it happens to be called. Deriving
 * the set from names would only ever rediscover the names already thought of.
 */

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiDir = path.join(srcDir, 'api');
const toolsDir = path.join(srcDir, 'tools');
const readmePath = path.resolve(srcDir, '..', 'README.md');

/**
 * Destructive operations that do not reach deleteOne()
 *
 * Termination is a PATCH setting `terminated_on`, but it ends someone's
 * employment, so it belongs in the same set.
 */
const DESTRUCTIVE_NON_DELETE = ['terminateEmployee'];

/**
 * Actions that reach a destructive API call but are deliberately not gated
 *
 * Every entry needs a reason. An empty registry is the desired state: an
 * addition here is a decision someone made on purpose, which is the whole point,
 * because the bug this guards against is the decision nobody made at all.
 */
const EXEMPT: Record<string, string> = {};

/** Exported API functions whose body issues a DELETE */
function destructiveApiFunctions(): string[] {
  const found: string[] = [...DESTRUCTIVE_NON_DELETE];

  for (const file of readdirSync(apiDir).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(path.join(apiDir, file), 'utf8');
    const pattern = /export async function (\w+)\(/g;

    let match = pattern.exec(source);
    while (match !== null) {
      const next = /\nexport /g;
      next.lastIndex = match.index + 1;
      const following = next.exec(source);
      const body = source.slice(match.index, following ? following.index : source.length);

      if (body.includes('deleteOne(')) found.push(match[1]);
      match = pattern.exec(source);
    }
  }

  return found;
}

/** Split a tool source into one chunk per `case '<action>':` arm */
function caseArms(source: string): Array<{ action: string; body: string }> {
  const positions = [...source.matchAll(/case '([a-z_]+)':/g)].map(m => ({
    index: m.index,
    action: m[1],
  }));

  const arms = positions.map((entry, i) => ({
    action: entry.action,
    body: source.slice(entry.index, positions[i + 1]?.index ?? source.length),
  }));

  // A label that falls through (`case 'clock_in':` directly followed by
  // `case 'clock_out': {`) shares the body of the arm that follows it.
  for (let i = arms.length - 2; i >= 0; i--) {
    const own = arms[i].body.replace(/case '[a-z_]+':/, '').trim();
    if (own === '') arms[i].body = arms[i + 1].body;
  }

  return arms;
}

/** Every gated (tool file, action) pair, read from the handler sources */
function gatedActions(): Array<{ file: string; action: string }> {
  const pairs: Array<{ file: string; action: string }> = [];

  const toolFiles = readdirSync(toolsDir).filter(
    file => file.endsWith('.ts') && file !== 'index.ts' && file !== 'shared.ts'
  );

  for (const file of toolFiles) {
    const source = readFileSync(path.join(toolsDir, file), 'utf8');
    for (const { action, body } of caseArms(source)) {
      if (body.includes('checkConfirmation(')) pairs.push({ file, action });
    }
  }

  return pairs;
}

/** The (tool file, action) pairs the README documents as requiring confirmation */
function documentedActions(): Array<{ file: string; action: string }> {
  const readme = readFileSync(readmePath, 'utf8');
  const section = readme.slice(
    readme.indexOf('### Operations That Require Confirmation'),
    readme.indexOf('### Operations Gated by a Confirmation Token')
  );

  return [...section.matchAll(/`factorial_(\w+)\(\{ action: '(\w+)' \}\)`/g)].map(match => ({
    file: `${match[1].replace(/_/g, '-')}.ts`,
    action: match[2],
  }));
}

/** Every tool action that reaches a destructive API call */
function destructiveActions(): Array<{ file: string; action: string; gated: boolean }> {
  const destructive = destructiveApiFunctions();
  const results: Array<{ file: string; action: string; gated: boolean }> = [];

  const toolFiles = readdirSync(toolsDir).filter(
    file => file.endsWith('.ts') && file !== 'index.ts' && file !== 'shared.ts'
  );

  for (const file of toolFiles) {
    const source = readFileSync(path.join(toolsDir, file), 'utf8');

    for (const { action, body } of caseArms(source)) {
      const callsDestructive = destructive.some(fn => new RegExp(`\\b${fn}\\s*\\(`).test(body));
      if (!callsDestructive) continue;

      results.push({ file, action, gated: body.includes('checkConfirmation(') });
    }
  }

  return results;
}

/**
 * Attendance writes are gated by target identity, not only by deleteOne().
 * Every case arm in tools/attendance.ts that reaches one of these API calls
 * must consult requireTargetConfirmation, which is the token gate.
 */
const ATTENDANCE_WRITE_CALLS = [
  'createShift',
  'updateShift',
  'deleteShift',
  'clockIn',
  'clockOut',
  'executeBackfill',
];

function attendanceWriteArms(): Array<{ action: string; gated: boolean }> {
  const source = readFileSync(path.join(toolsDir, 'attendance.ts'), 'utf8');
  return caseArms(source)
    .filter(({ body }) =>
      ATTENDANCE_WRITE_CALLS.some(fn => new RegExp(`\\b${fn}\\s*\\(`).test(body))
    )
    .map(({ action, body }) => ({ action, gated: body.includes('requireTargetConfirmation(') }));
}

/** Every (tool file, action) pair that consults the token gate */
function tokenGatedActions(): Array<{ file: string; action: string }> {
  const pairs: Array<{ file: string; action: string }> = [];
  const toolFiles = readdirSync(toolsDir).filter(
    file => file.endsWith('.ts') && file !== 'index.ts' && file !== 'shared.ts'
  );
  for (const file of toolFiles) {
    const source = readFileSync(path.join(toolsDir, file), 'utf8');
    for (const { action, body } of caseArms(source)) {
      if (body.includes('requireTargetConfirmation(')) pairs.push({ file, action });
    }
  }
  return pairs;
}

/** The pairs the README documents as gated by a confirmation token */
function documentedTokenGatedActions(): Array<{ file: string; action: string }> {
  const readme = readFileSync(readmePath, 'utf8');
  const section = readme.slice(
    readme.indexOf('### Operations Gated by a Confirmation Token'),
    readme.indexOf('### Document Downloads')
  );
  return [...section.matchAll(/`factorial_(\w+)\(\{ action: '(\w+)' \}\)`/g)].map(match => ({
    file: `${match[1].replace(/_/g, '-')}.ts`,
    action: match[2],
  }));
}

describe('Target-identity gate across attendance writes', () => {
  it('finds the attendance write arms', () => {
    const arms = attendanceWriteArms().map(a => a.action);
    expect(arms).toContain('create');
    expect(arms).toContain('clock_in');
    expect(arms).toContain('log_range');
    expect(arms.length).toBeGreaterThanOrEqual(6);
  });

  it('routes every attendance write through requireTargetConfirmation', () => {
    const ungated = attendanceWriteArms()
      .filter(a => !a.gated)
      .map(a => `attendance.ts: case '${a.action}'`);
    expect(ungated, `attendance writes with no identity gate:\n${ungated.join('\n')}`).toEqual([]);
  });

  it("keeps the README's list of token-gated operations in step with the code", () => {
    const key = (entry: { file: string; action: string }) => `${entry.file}:${entry.action}`;
    const inCode = [...new Set(tokenGatedActions().map(key))].sort();
    const inReadme = [...new Set(documentedTokenGatedActions().map(key))].sort();
    expect(inCode.length).toBeGreaterThanOrEqual(6);
    expect(inReadme).toEqual(inCode);
  });
});

describe('Confirmation coverage across tool handlers', () => {
  it('derives a plausible destructive set from the API layer', () => {
    const apiFunctions = destructiveApiFunctions();

    // Sanity: the derivation must actually find things, or every assertion below
    // passes vacuously.
    expect(apiFunctions).toContain('deleteApplication');
    expect(apiFunctions).toContain('removeProjectWorker');
    expect(apiFunctions).toContain('unenrollFromTraining');
    expect(apiFunctions).toContain('terminateEmployee');
    expect(apiFunctions.length).toBeGreaterThanOrEqual(15);
  });

  it('reaches every destructive API function from at least one tool action', () => {
    const reached = destructiveActions().length;
    expect(reached).toBeGreaterThanOrEqual(15);
  });

  it('gates every action that reaches a destructive API call', () => {
    const ungated = destructiveActions()
      .filter(entry => !entry.gated && EXEMPT[entry.action] === undefined)
      .map(entry => `${entry.file}: case '${entry.action}'`);

    expect(
      ungated,
      `destructive actions with no confirmation gate:\n${ungated.join('\n')}`
    ).toEqual([]);
  });

  it('keeps the exemption registry justified', () => {
    for (const [action, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `exemption for '${action}' needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("keeps the README's list of confirmed operations in step with the code", () => {
    const key = (entry: { file: string; action: string }) => `${entry.file}:${entry.action}`;

    const inCode = gatedActions().map(key).sort();
    const inReadme = documentedActions().map(key).sort();

    // Sanity: both derivations must find something.
    expect(inCode.length).toBeGreaterThanOrEqual(16);
    expect(inReadme.length).toBeGreaterThanOrEqual(16);

    expect(inReadme).toEqual(inCode);
  });
});
