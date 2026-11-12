import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isCliCommand, runCli } from '../../../cli.js';

describe('command line', () => {
  let dir: string;
  const saved = { ...process.env };
  let out: string[];
  const io = {
    print: (line: string) => out.push(line),
    openBrowser: () => undefined,
    readLine: async () => '',
  };

  beforeEach(() => {
    out = [];
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-cli-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    process.env.FACTORIAL_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it('recognises its commands and nothing else', () => {
    for (const command of ['login', 'logout', 'whoami', 'help', '--help']) {
      expect(isCliCommand(command), command).toBe(true);
    }
    // No argument, or anything else, starts the MCP server as before.
    for (const other of [undefined, '', '--stdio', 'serve', 'LOGIN']) {
      expect(isCliCommand(other), String(other)).toBe(false);
    }
  });

  it('prints who writes are recorded under for whoami', async () => {
    expect(await runCli(['whoami'], io)).toBe(0);
    expect(out.join('\n')).toContain('Not logged in');
  });

  it('lists the commands for help', async () => {
    expect(await runCli(['help'], io)).toBe(0);
    const text = out.join('\n');
    for (const command of ['login', 'logout', 'whoami']) expect(text).toContain(command);
  });

  it('reports a failed login as an error and a non-zero exit, without a stack', async () => {
    delete process.env.FACTORIAL_OAUTH_CLIENT_ID;
    expect(await runCli(['login'], io)).toBe(1);
    expect(out.join('\n')).toContain('FACTORIAL_OAUTH_CLIENT_ID is not set');
    expect(out.join('\n')).not.toContain('    at ');
  });

  it('logs out', async () => {
    expect(await runCli(['logout'], io)).toBe(0);
    expect(out.join('\n')).toContain('No login to remove');
  });
});
