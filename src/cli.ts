/**
 * The commands the package's executable answers besides serving MCP.
 *
 * With no argument the executable is the MCP server on stdio. `login`,
 * `logout` and `whoami` manage the user login the server writes with; they are
 * run by a person in a terminal.
 */

import { createInterface } from 'node:readline/promises';
import { describeLogin, openInBrowser, runLogin, runLogout, type LoginIo } from './auth/login.js';

const COMMANDS = ['login', 'logout', 'whoami', 'help', '--help', '-h'];

/** True when the first argument is a command rather than a request to serve */
export function isCliCommand(argument: string | undefined): boolean {
  return argument !== undefined && COMMANDS.includes(argument);
}

const HELP = [
  'Usage: mcp-factorial [command]',
  '',
  'With no command, runs the MCP server on stdio.',
  '',
  'Commands:',
  '  login    Log in to Factorial in your browser, so that writes made through the',
  '           server are recorded under your own user. Needs FACTORIAL_OAUTH_CLIENT_ID.',
  '  logout   Revoke the login and remove it from this machine.',
  '  whoami   Show who writes are recorded under. Shows no credential.',
  '  help     Show this text.',
].join('\n');

const terminalIo: LoginIo = {
  print: line => {
    process.stdout.write(`${line}\n`);
  },
  openBrowser: openInBrowser,
  readLine: async prompt => {
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await reader.question(prompt);
    } finally {
      reader.close();
    }
  },
};

/** Run one command; the return value is the process exit code */
export async function runCli(args: string[], io: LoginIo = terminalIo): Promise<number> {
  try {
    switch (args[0]) {
      case 'login':
        await runLogin(io);
        return 0;
      case 'logout':
        await runLogout(io);
        return 0;
      case 'whoami':
        io.print(describeLogin());
        return 0;
      default:
        io.print(HELP);
        return 0;
    }
  } catch (error) {
    io.print(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
