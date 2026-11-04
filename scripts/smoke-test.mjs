import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const directory = mkdtempSync(join(tmpdir(), 'mcp-factorial-smoke-'));
const server = spawn(process.execPath, [resolve(process.argv[2] ?? 'dist/index.js')], {
  cwd: directory,
  // Never load the developer's .env or contact a real Factorial tenant.
  env: {
    PATH: process.env.PATH,
    FACTORIAL_API_KEY: 'test-placeholder',
    FACTORIAL_BASE_URL: 'http://127.0.0.1:1',
    FACTORIAL_MAX_RETRIES: '0',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const exited = new Promise(resolveExit => server.once('exit', resolveExit));
const pending = new Map();
let nextId = 0;
let stderr = '';
server.stderr.on('data', data => {
  stderr = (stderr + data.toString()).slice(-4000);
});
const lines = createInterface({ input: server.stdout });
lines.on('line', line => {
  const response = JSON.parse(line);
  pending.get(response.id)?.(response);
});

function request(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolveResponse, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out: ${stderr}`));
    }, 10000);
    pending.set(id, response => {
      clearTimeout(timeout);
      pending.delete(id);
      resolveResponse(response);
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'package-smoke-test', version: '1.0.0' },
  });
  assert.equal(initialized.result?.serverInfo.name, 'factorial-hr');
  server.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
  );
  const listed = await request('tools/list');
  assert.equal(listed.result?.tools.length, 14);
  const teams = listed.result.tools.find(tool => tool.name === 'factorial_teams');
  assert.equal(teams.inputSchema.properties.employee_ids.maxItems, 1000);
  const rejected = await request('tools/call', {
    name: 'factorial_teams',
    arguments: {
      action: 'create',
      name: 'Validation check',
      employee_ids: Array(1001).fill('invalid'),
    },
  });
  assert(rejected.error || rejected.result?.isError, 'Oversized tool call was accepted');
  assert.match(JSON.stringify(rejected), /1000/);
  assert(JSON.stringify(rejected).length < 3000, 'Validation accumulated an issue per element');
  const discovered = await request('tools/call', {
    name: 'factorial_discover',
    arguments: { category: 'teams' },
  });
  assert.equal(discovered.result?.isError ?? false, false);
  assert.match(discovered.result?.content[0].text ?? '', /Available actions/);
  server.stdin.end();
  server.kill('SIGTERM');
  const shutdownTimeout = setTimeout(() => server.kill('SIGKILL'), 5000);
  const exitCode = await exited;
  clearTimeout(shutdownTimeout);
  assert.equal(exitCode, 0, `Server shutdown failed: ${stderr}`);
  console.log(
    `MCP smoke test passed on ${process.version}: initialize, 14 tools, bounded validation, discovery, shutdown`
  );
} finally {
  server.kill();
  lines.close();
  rmSync(directory, { recursive: true, force: true });
}
