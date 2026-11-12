import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStoredLogin, type StoredLogin } from '../../../auth/token-store.js';
import {
  ATTRIBUTION_RULE,
  READ_ONLY_TOOLS,
  attributionPreviewNote,
  installAttribution,
  noteCompanyKeyWrite,
} from '../../../auth/attribution.js';

const login: StoredLogin = {
  version: 1,
  client_id: 'client-1',
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 4_000_000_000_000,
  scope: null,
  employee_id: '2',
  employee_name: 'Test Person',
  email: null,
  obtained_at: '2026-01-01T00:00:00.000Z',
};

type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type Handler = (args: unknown, extra?: unknown) => Promise<Result> | Result;

/** A stand-in for the MCP server that records what was registered */
function fakeServer() {
  const tools = new Map<string, { config: { description?: string }; handler: Handler }>();
  return {
    tools,
    registerTool(name: string, config: { description?: string }, handler: Handler) {
      tools.set(name, { config, handler });
      return { name };
    },
  };
}

const text = (result: Result) => result.content.map(c => c.text).join('\n');

describe('attribution of writes', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-factorial-attr-'));
    process.env.FACTORIAL_TOKEN_FILE = join(dir, 'login.json');
    process.env.FACTORIAL_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  describe('result notice', () => {
    it('says a company-key write is recorded under the key, not the user', async () => {
      const server = fakeServer();
      installAttribution(server);
      server.registerTool('factorial_teams', { description: 'Teams.' }, async () => {
        await Promise.resolve();
        noteCompanyKeyWrite();
        return { content: [{ type: 'text', text: 'Team created' }] };
      });

      const result = await server.tools.get('factorial_teams')!.handler({});
      expect(result.content[0].text).toBe('Team created');
      expect(text(result)).toContain(
        "Factorial recorded this action under the company API key's account, not under you"
      );
      expect(text(result)).toContain('npx -y @t4dhg/mcp-factorial login');
    });

    it('counts several writes in one call', async () => {
      const server = fakeServer();
      installAttribution(server);
      server.registerTool('factorial_attendance', {}, async () => {
        noteCompanyKeyWrite();
        noteCompanyKeyWrite();
        noteCompanyKeyWrite();
        return { content: [{ type: 'text', text: 'Logged 3 shifts' }] };
      });
      const result = await server.tools.get('factorial_attendance')!.handler({});
      expect(text(result)).toContain(
        "Factorial recorded these 3 actions under the company API key's account, not under you"
      );
    });

    it('adds nothing to a call that wrote nothing', async () => {
      const server = fakeServer();
      installAttribution(server);
      server.registerTool('factorial_teams', {}, async () => ({
        content: [{ type: 'text', text: 'Found 2 teams' }],
      }));
      const result = await server.tools.get('factorial_teams')!.handler({});
      expect(result.content).toEqual([{ type: 'text', text: 'Found 2 teams' }]);
    });

    it('keeps the notice on a call that failed after writing', async () => {
      const server = fakeServer();
      installAttribution(server);
      server.registerTool('factorial_attendance', {}, async () => {
        noteCompanyKeyWrite();
        return { content: [{ type: 'text', text: 'Error: second shift failed' }], isError: true };
      });
      const result = await server.tools.get('factorial_attendance')!.handler({});
      expect(result.isError).toBe(true);
      expect(text(result)).toContain("under the company API key's account");
    });

    it('does not leak one call’s writes into a concurrent call', async () => {
      const server = fakeServer();
      installAttribution(server);
      let release!: () => void;
      const held = new Promise<void>(resolve => (release = resolve));
      server.registerTool('writer', {}, async () => {
        await held;
        noteCompanyKeyWrite();
        return { content: [{ type: 'text', text: 'wrote' }] };
      });
      server.registerTool('reader', {}, async () => {
        release();
        await Promise.resolve();
        return { content: [{ type: 'text', text: 'read' }] };
      });
      const [wrote, read] = await Promise.all([
        server.tools.get('writer')!.handler({}),
        server.tools.get('reader')!.handler({}),
      ]);
      expect(text(wrote)).toContain("under the company API key's account");
      expect(read.content).toEqual([{ type: 'text', text: 'read' }]);
    });

    it('passes the second handler argument through', async () => {
      const server = fakeServer();
      installAttribution(server);
      let seen: unknown;
      server.registerTool('factorial_teams', {}, async (_args, extra) => {
        seen = extra;
        return { content: [{ type: 'text', text: 'ok' }] };
      });
      await server.tools.get('factorial_teams')!.handler({}, { requestId: 7 });
      expect(seen).toEqual({ requestId: 7 });
    });
  });

  describe('tool descriptions', () => {
    it('states the rule on every tool that can write', () => {
      const server = fakeServer();
      installAttribution(server);
      server.registerTool('factorial_teams', { description: 'Manage teams.' }, async () => ({
        content: [],
      }));
      const description = server.tools.get('factorial_teams')!.config.description!;
      expect(description.startsWith('Manage teams. ')).toBe(true);
      expect(description).toContain(ATTRIBUTION_RULE);
      expect(ATTRIBUTION_RULE).toContain('company API key');
      expect(ATTRIBUTION_RULE).toContain('not under you');
    });

    it('leaves the read-only tools alone, and only those', () => {
      const server = fakeServer();
      installAttribution(server);
      for (const name of READ_ONLY_TOOLS) {
        server.registerTool(name, { description: 'Reads.' }, async () => ({ content: [] }));
        expect(server.tools.get(name)!.config.description).toBe('Reads.');
      }
      expect([...READ_ONLY_TOOLS].sort()).toEqual([
        'factorial_contracts',
        'factorial_discover',
        'factorial_documents',
        'factorial_job_catalog',
        'factorial_payroll',
      ]);
    });
  });

  describe('preview note', () => {
    it('warns before a company-key write', () => {
      const note = attributionPreviewNote();
      expect(note).toContain(
        "Factorial will record this action under the company API key's account, not under you"
      );
      expect(note).toContain('npx -y @t4dhg/mcp-factorial login');
    });

    it('is empty when the write will be made as the logged-in user', () => {
      writeStoredLogin(login);
      expect(attributionPreviewNote()).toBe('');
    });

    it('says nothing can be written in oauth mode without a login', () => {
      process.env.FACTORIAL_AUTH_MODE = 'oauth';
      const note = attributionPreviewNote();
      expect(note).toContain('nobody has logged in');
      expect(note).not.toContain('will record this action under the company');
    });
  });
});
