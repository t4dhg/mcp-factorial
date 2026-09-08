#!/usr/bin/env node
// Deterministic pre-commit leak scanner.
//
// Scans ONLY the staged diff (never the whole working tree) for three
// distinct problems:
//
//   1. Secret-shaped values added on a line (an API key, token or password
//      literal).
//   2. Process artefacts being staged by path (planning documents, working
//      files for coding assistants and editors, and their configuration).
//   3. References to those artefacts inside otherwise-legitimate staged
//      content, even a code comment or a line of documentation, flagged as
//      more serious when the file ships inside the published npm package.
//
// It also warns, without blocking, when a staged fixture file does not
// contain any of this project's anonymisation markers.
//
// This file intentionally avoids naming any specific assistant, editor or
// vendor product: it lives in a public repository, and the whole point of
// the scan is to keep vendor- and tool-specific process detail out of that
// repository. The DETECTION PATTERNS section below is the one deliberate
// exception: it has to name literal filenames (CLAUDE.md, AGENTS.md, and so
// on) so that the pattern actually matches them, but keep it there, in one
// place, so it reads as a pattern table and not as commentary.
//
// Usage: node scripts/preflight-scan.mjs
// Override (deliberate, documented): PREFLIGHT_SKIP=1 git commit ...
// (--no-verify also bypasses this check, and every other pre-commit check.)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// This scanner's own path, relative to the repository root, exactly as it
// appears in `git diff --cached --name-only`. It is excluded from every
// check below: the scanner necessarily contains every pattern it looks for,
// so without this exclusion it would flag itself on every commit that
// touches it.
export const SELF_PATH = 'scripts/preflight-scan.mjs';

// ---------------------------------------------------------------------------
// DETECTION PATTERNS
// ---------------------------------------------------------------------------
// One place for every literal filename, directory and prefix this scanner
// matches against. Read it as a pattern table, not as commentary on any
// particular tool.

/** Filenames that are always assistant/editor configuration, wherever they sit. */
const ASSISTANT_CONFIG_FILENAMES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules'];

/** Directory prefixes that hold assistant/editor configuration or state. */
const ASSISTANT_CONFIG_DIR_PREFIXES = ['.claude/', '.cursor/', '.github/copilot-'];

/** Basename prefix for the family of dotfiles one assistant/editor integration uses. */
const ASSISTANT_CONFIG_BASENAME_PREFIXES = ['.aider'];

/** Directory names used for a coding assistant's own scratch working files. */
const ASSISTANT_WORKSPACE_DIR_NAMES = ['scratchpad'];

/**
 * Keywords that make a path under docs/ look like a planning or process
 * artefact rather than published documentation. "adr" (architecture decision
 * records) is deliberately not in this list: those are meant to be
 * committed, and are the shape of docs/ content this scan should allow.
 */
const PLANNING_KEYWORDS = ['plan', 'spec', 'design', 'rfc'];

/**
 * Values that show up in this project's fixtures when data has been
 * anonymised. Any one of these present in a fixture's staged content is
 * enough to consider it anonymised; none of them present is a (non-blocking)
 * reason to double check.
 */
const ANONYMIZATION_MARKERS = [
  'example',
  'placeholder',
  'dummy',
  'sample',
  'acme',
  'jane doe',
  'john smith',
  'test company',
];

/**
 * Placeholder detection is deliberately anchored, not a substring test. A
 * value is a placeholder only when it is clearly a template, never merely
 * because it *contains* a template-ish word: "your-api-key" is a
 * placeholder, "your9fK3mN7pQ2xR8vT1wZ5yB6cD4eF0gH2j2K5L8M1N4" is a real
 * secret that happens to start the same way, and only the anchored check
 * tells them apart.
 */

/** Exact (whole-value, case-insensitive) placeholder words. */
const PLACEHOLDER_EXACT_WORDS = [
  'changeme',
  'placeholder',
  'redacted',
  'example',
  'dummy',
  'sample',
  'secret',
  'token',
];

/** Prefix words that only count as a placeholder when followed by a separator or end-of-value. */
const PLACEHOLDER_PREFIX_WORDS = [
  'your',
  'my',
  'example',
  'sample',
  'dummy',
  'placeholder',
  'test',
];

/** Separators that may follow a placeholder prefix word. */
const PLACEHOLDER_PREFIX_SEPARATORS = ['-', '_', '.', ':'];

const SECRET_PATTERNS = [
  { name: 'Holded-style personal access token', regex: /pat_[A-Za-z0-9_-]{12,}/g },
  { name: 'Anthropic API key', regex: /sk-ant-[A-Za-z0-9_-]{10,}/g },
  { name: 'generic sk-prefixed API key', regex: /sk-(?!ant-)[A-Za-z0-9_-]{20,}/g },
  { name: 'Stripe API key', regex: /sk_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: 'GitHub personal access token (classic)', regex: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'GitHub OAuth access token', regex: /gho_[A-Za-z0-9]{20,}/g },
  { name: 'GitHub fine-grained personal access token', regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'AWS access key ID', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: 'Google OAuth client secret', regex: /GOCSPX-[A-Za-z0-9_-]{10,}/g },
  { name: 'Slack token', regex: /xox[bapsr]-[A-Za-z0-9-]{10,}/g },
  { name: 'Atlassian API token', regex: /ATATT[A-Za-z0-9_=-]{10,}/g },
  { name: 'PEM private key block', regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
  {
    name: 'bearer credential',
    regex: /Authorization:\s*Bearer\s+([A-Za-z0-9_-]{20,})/gi,
    valueGroup: 1,
  },
  { name: 'JWT-shaped token', regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
];

/** An opaque literal assigned to a name that reads as a secret. */
const SECRET_ASSIGNMENT_PATTERN =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*(?:_TOKEN|_SECRET|_API_KEY|_PASSWORD)\s*[:=]\s*['"]?([^\s'"]{16,})['"]?/g;

/** Assistant/editor tooling names, for matching a mention inside staged content. */
const ASSISTANT_TOOLING_REFERENCE_PATTERN = new RegExp(
  '(' +
    [
      ...ASSISTANT_CONFIG_FILENAMES,
      ...ASSISTANT_CONFIG_DIR_PREFIXES,
      ...ASSISTANT_CONFIG_BASENAME_PREFIXES,
    ]
      .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')',
  'i'
);

/** A path-shaped token starting with docs/, for finding a mention inside staged content. */
const DOCS_PATH_TOKEN_PATTERN = /docs\/[^\s'"()<>]+/gi;

// ---------------------------------------------------------------------------
// Pure detection logic (unit-testable, no git access)
// ---------------------------------------------------------------------------

/** True when a value is a single character class repeated, e.g. "xxxx", "....", "0000". */
function isRepeatedSingleCharacter(value) {
  return value.length > 1 && [...value].every(ch => ch === value[0]);
}

/**
 * True when a matched secret-shaped value is an obvious, documented
 * placeholder. Anchored: a value must clearly BE a template, not merely
 * contain a template-ish word somewhere inside it.
 */
export function isPlaceholderValue(value) {
  if (!value) return true;

  const lower = value.toLowerCase();

  if (lower.includes('xxxx')) return true;
  if (value.includes('<') || value.includes('>')) return true;
  if (isRepeatedSingleCharacter(value)) return true;
  if (PLACEHOLDER_EXACT_WORDS.includes(lower)) return true;

  for (const prefix of PLACEHOLDER_PREFIX_WORDS) {
    if (lower.startsWith(prefix)) {
      const nextChar = lower.charAt(prefix.length);
      if (nextChar === '' || PLACEHOLDER_PREFIX_SEPARATORS.includes(nextChar)) return true;
    }
  }

  return false;
}

/** Scan one line of staged content for secret-shaped values. Returns a list of findings. */
export function scanLineForSecrets(line) {
  const findings = [];

  for (const { name, regex, valueGroup = 0 } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(line))) {
      if (!isPlaceholderValue(match[valueGroup])) {
        findings.push({ reason: `possible ${name}` });
      }
      if (match[0].length === 0) regex.lastIndex++;
    }
  }

  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  let assignmentMatch;
  while ((assignmentMatch = SECRET_ASSIGNMENT_PATTERN.exec(line))) {
    if (!isPlaceholderValue(assignmentMatch[1])) {
      findings.push({
        reason:
          'opaque literal assigned to a name matching *_TOKEN, *_SECRET, *_API_KEY or *_PASSWORD',
      });
    }
  }

  return findings;
}

/** True when `filePath` is a coding assistant's or editor's own config path. */
export function isAssistantConfigPath(filePath) {
  const base = path.posix.basename(filePath);
  if (ASSISTANT_CONFIG_FILENAMES.includes(base)) return true;
  if (ASSISTANT_CONFIG_BASENAME_PREFIXES.some(prefix => base.startsWith(prefix))) return true;
  for (const prefix of ASSISTANT_CONFIG_DIR_PREFIXES) {
    if (
      filePath === prefix.slice(0, -1) ||
      filePath.startsWith(prefix) ||
      filePath.includes('/' + prefix)
    ) {
      return true;
    }
  }
  return false;
}

/** Strip a single trailing ".ext" from a path segment, if it has one. */
function stripExtension(segment) {
  const dotIndex = segment.lastIndexOf('.');
  return dotIndex > 0 ? segment.slice(0, dotIndex) : segment;
}

/**
 * True when `filePath` sits under docs/ and one of its segments IS a
 * planning keyword (or its simple plural), not merely contains one as a
 * substring. This is what lets "docs/designs/x.md" be caught while
 * "docs/design-system.md" (a real, ordinary documentation page) is not.
 */
export function isPlanningDocPath(filePath) {
  const segments = filePath.split('/');
  const docsIndex = segments.indexOf('docs');
  if (docsIndex === -1) return false;
  const rest = segments.slice(docsIndex + 1);
  if (rest.length === 0) return false;
  return rest.some(segment => {
    const bare = stripExtension(segment).toLowerCase();
    return PLANNING_KEYWORDS.some(keyword => bare === keyword || bare === keyword + 's');
  });
}

/** True when `filePath` runs through a coding assistant's scratch working directory. */
export function isAssistantWorkspacePath(filePath) {
  const segments = filePath.split('/');
  return ASSISTANT_WORKSPACE_DIR_NAMES.some(dirName => segments.includes(dirName));
}

/**
 * Classify one staged file path as a process artefact, or return null.
 * Independent of file content: this only looks at the path.
 */
export function classifyStagedPath(filePath) {
  if (isAssistantConfigPath(filePath)) {
    return {
      reason:
        'assistant/editor configuration path; belongs in .git/info/exclude (per-clone, never published), not the tracked ignore file',
    };
  }
  if (isPlanningDocPath(filePath)) {
    return {
      reason:
        'path under docs/ reads as a planning or process artefact; keep planning material outside the repository',
    };
  }
  if (isAssistantWorkspacePath(filePath)) {
    return {
      reason:
        'path runs through an assistant working directory; these are per-clone scratch files and belong in .git/info/exclude, not in a commit',
    };
  }
  return null;
}

/** Scan one line of staged content for a reference to a process artefact. */
export function scanLineForReferences(line) {
  const findings = [];

  const toolingMatch = line.match(ASSISTANT_TOOLING_REFERENCE_PATTERN);
  if (toolingMatch) {
    findings.push({ reason: `mentions an assistant/editor tooling path ("${toolingMatch[0]}")` });
  }

  DOCS_PATH_TOKEN_PATTERN.lastIndex = 0;
  let docsTokenMatch;
  while ((docsTokenMatch = DOCS_PATH_TOKEN_PATTERN.exec(line))) {
    if (isPlanningDocPath(docsTokenMatch[0])) {
      findings.push({
        reason: `mentions what looks like a planning artefact path ("${docsTokenMatch[0]}")`,
      });
      break; // one mention is enough context; avoid duplicate reports for the same path in one line
    }
  }

  return findings;
}

/** True when `filePath` sits under a fixtures directory. */
export function isFixturePath(filePath) {
  return filePath.startsWith('fixtures/') || filePath.includes('/fixtures/');
}

/** True when `text` contains one of this project's anonymisation markers. */
export function hasAnonymizationMarker(text) {
  const lower = text.toLowerCase();
  return ANONYMIZATION_MARKERS.some(marker => lower.includes(marker));
}

/** Paths npm always excludes from a published tarball, regardless of "files". */
const NPM_ALWAYS_EXCLUDED_PREFIXES = ['node_modules/', '.git/'];

/**
 * True when `filePath` is part of what actually ships inside the npm
 * tarball: package.json's own "files" array, plus the always-included
 * package.json, README* and LICENSE*.
 *
 * `filesList` of `null`/`undefined` means the package has no (valid)
 * "files" field at all. Real npm semantics for that case are the opposite
 * of an empty array: with no "files" field, npm packs nearly everything,
 * excluding only a fixed set of paths (node_modules/, .git/) it always
 * excludes. An explicit empty array, by contrast, is a "files" field that
 * lists nothing extra, so nothing beyond the always-included files ships.
 */
export function isShippingPath(filePath, filesList = null) {
  if (/^package\.json$/i.test(filePath)) return true;
  if (/^README(\..+)?$/i.test(filePath)) return true;
  if (/^LICENSE(\..+)?$/i.test(filePath)) return true;

  if (filesList == null) {
    return !NPM_ALWAYS_EXCLUDED_PREFIXES.some(prefix => filePath.startsWith(prefix));
  }

  for (const entry of filesList) {
    if (entry.endsWith('/')) {
      if (filePath === entry.slice(0, -1) || filePath.startsWith(entry)) return true;
    } else if (filePath === entry || filePath.startsWith(entry + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Parse `git diff --cached -U0` output into a Map of
 * filePath -> [{ line, text }] for every added line.
 */
export function parseUnifiedDiff(diffText) {
  const result = new Map();
  const lines = diffText.split('\n');
  let currentPath = null;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      currentPath = null;
      newLineNum = 0;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const match = line.match(/^\+\+\+ b\/(.*)$/);
      currentPath = match ? match[1] : null;
      if (currentPath && !result.has(currentPath)) result.set(currentPath, []);
      continue;
    }
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) newLineNum = parseInt(match[1], 10);
      continue;
    }
    if (currentPath === null) continue;
    if (line.startsWith('+')) {
      result.get(currentPath).push({ line: newLineNum, text: line.slice(1) });
      newLineNum++;
    } else if (line.startsWith('-')) {
      // Removed line: does not exist in the new file, so the new-line
      // counter does not advance.
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file": not a content line.
    } else if (line.length > 0) {
      // Unexpected context line (should not occur with -U0). Advance to
      // stay in sync rather than mis-attribute later lines.
      newLineNum++;
    }
  }

  return result;
}

/**
 * Run every check against a pre-parsed view of the staged change set. Pure:
 * takes no git access, so it is the seam unit tests call directly.
 *
 * @param {object} input
 * @param {string[]} input.stagedPaths - staged file paths (name-only, ACM).
 * @param {Map<string, {line:number, text:string}[]>} input.addedLines - from parseUnifiedDiff.
 * @param {string[]|null} [input.filesList] - package.json "files" array, or
 *   null/omitted for "no files field" (see isShippingPath).
 */
export function runScan({ stagedPaths, addedLines, filesList = [] }) {
  const findings = {
    secrets: [],
    artifactPaths: [],
    artifactReferences: [],
    fixtureWarnings: [],
  };

  for (const filePath of stagedPaths) {
    if (filePath === SELF_PATH) continue;
    const classification = classifyStagedPath(filePath);
    if (classification) {
      findings.artifactPaths.push({ path: filePath, reason: classification.reason });
    }
  }

  for (const [filePath, addedFileLines] of addedLines.entries()) {
    if (filePath === SELF_PATH) continue;

    const shipping = isShippingPath(filePath, filesList);
    const trackFixture = isFixturePath(filePath);
    let fixtureHasContent = false;
    let fixtureHasMarker = false;

    for (const { line, text } of addedFileLines) {
      for (const secretFinding of scanLineForSecrets(text)) {
        findings.secrets.push({ path: filePath, line, reason: secretFinding.reason });
      }

      for (const referenceFinding of scanLineForReferences(text)) {
        findings.artifactReferences.push({
          path: filePath,
          line,
          reason: referenceFinding.reason,
          shipping,
        });
      }

      if (trackFixture) {
        fixtureHasContent = true;
        if (hasAnonymizationMarker(text)) fixtureHasMarker = true;
      }
    }

    if (trackFixture && fixtureHasContent && !fixtureHasMarker) {
      findings.fixtureWarnings.push({
        path: filePath,
        reason:
          'no anonymisation marker found in the staged content; verify it does not carry real tenant data',
      });
    }
  }

  return findings;
}

/** True when `findings` should fail the commit. */
export function hasBlockingFindings(findings) {
  return (
    findings.secrets.length > 0 ||
    findings.artifactPaths.length > 0 ||
    findings.artifactReferences.length > 0
  );
}

const OVERRIDE_NOTICE =
  'To override deliberately: PREFLIGHT_SKIP=1 git commit ...\n' +
  '(--no-verify also bypasses this check, along with every other pre-commit check.)';

/** Render a findings object as a human-readable report. */
export function formatReport(findings) {
  const sections = [];

  if (findings.secrets.length > 0) {
    sections.push(
      'Secret-shaped values staged:\n' +
        findings.secrets.map(f => `  ${f.path}:${f.line} - ${f.reason}`).join('\n')
    );
  }

  if (findings.artifactPaths.length > 0) {
    sections.push(
      'Process artefacts staged:\n' +
        findings.artifactPaths.map(f => `  ${f.path} - ${f.reason}`).join('\n')
    );
  }

  if (findings.artifactReferences.length > 0) {
    sections.push(
      'References to process artefacts in staged content:\n' +
        findings.artifactReferences
          .map(
            f =>
              `  ${f.path}:${f.line}${f.shipping ? ' [ships inside the npm package]' : ''} - ${f.reason}`
          )
          .join('\n')
    );
  }

  if (findings.fixtureWarnings.length > 0) {
    sections.push(
      'Warnings, not blocking:\n' +
        findings.fixtureWarnings.map(f => `  ${f.path} - ${f.reason}`).join('\n')
    );
  }

  if (sections.length === 0) {
    return 'preflight-scan: clean, nothing to report.';
  }

  // Only point at the override when something would actually block the
  // commit: a report that is only a non-blocking fixture warning should
  // not tell someone how to skip a check that was never going to fail.
  if (hasBlockingFindings(findings)) {
    sections.push(OVERRIDE_NOTICE);
  }
  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Git-reading part (kept separate so the logic above stays unit-testable
// without shelling out to git)
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

export function getRepoRoot() {
  return git(['rev-parse', '--show-toplevel']).trim();
}

export function getStagedPaths() {
  const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACM']);
  return output.split('\n').filter(Boolean);
}

export function getStagedDiff() {
  return git(['diff', '--cached', '-U0', '--diff-filter=ACM']);
}

/** Returns package.json's "files" array, or null when absent/invalid (see isShippingPath). */
export function readPackageFilesList(repoRoot) {
  try {
    const pkgRaw = readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    return Array.isArray(pkg.files) ? pkg.files : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export function main() {
  if (process.env.PREFLIGHT_SKIP === '1') {
    console.log('preflight-scan: skipped via PREFLIGHT_SKIP=1');
    return 0;
  }

  const repoRoot = getRepoRoot();
  const stagedPaths = getStagedPaths();
  const diffText = getStagedDiff();
  const addedLines = parseUnifiedDiff(diffText);
  const filesList = readPackageFilesList(repoRoot);

  const findings = runScan({ stagedPaths, addedLines, filesList });
  const report = formatReport(findings);

  if (hasBlockingFindings(findings)) {
    console.error(report);
    return 1;
  }

  if (findings.fixtureWarnings.length > 0) {
    console.log(report);
  }
  console.log(`preflight-scan: clean (${stagedPaths.length} staged file(s) checked)`);
  return 0;
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exit(main());
}
