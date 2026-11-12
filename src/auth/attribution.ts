/**
 * Telling the caller who Factorial records a write under.
 *
 * With a user login a write is the user's. With only a company API key it is
 * the company's: Factorial shows it under the key's account, and nothing in
 * the response says so. A person who asked for "my" approval to be recorded
 * would never find out it was not, so every preview and every result of a
 * company-key write says it, in one place, here.
 *
 * The count of writes is kept per tool call in an AsyncLocalStorage, so the
 * HTTP client can report a write without knowing which tool it is serving.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { LOGIN_COMMAND, LoginRequiredError, writeActor } from './mode.js';

interface CallScope {
  companyWrites: number;
}

const callScope = new AsyncLocalStorage<CallScope>();

/** Called by the HTTP client after a write made with the company API key succeeded */
export function noteCompanyKeyWrite(): void {
  const scope = callScope.getStore();
  if (scope) scope.companyWrites += 1;
}

const HOW_TO_FIX =
  `To have writes recorded under your own user, log in once with \`${LOGIN_COMMAND}\` ` +
  'in a terminal.';

/** The sentence every write-capable tool description carries */
export const ATTRIBUTION_RULE =
  'Attribution: a write is recorded in Factorial under the credential that made it. With a ' +
  "user login that is you. With only a company API key it is the key's account, not under " +
  'you, and the confirmation step and the result of every such write say so; tell the user ' +
  'before relying on it.';

/** Tools with no write action; every other tool gets ATTRIBUTION_RULE */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'factorial_discover',
  'factorial_contracts',
  'factorial_documents',
  'factorial_job_catalog',
  'factorial_payroll',
]);

/**
 * What a confirmation step says about attribution: empty when the write will
 * be the logged-in user's.
 */
export function attributionPreviewNote(): string {
  let actor;
  try {
    actor = writeActor();
  } catch (error) {
    if (error instanceof LoginRequiredError) return `Attribution: ${error.message}`;
    throw error;
  }
  if (actor.kind === 'user') return '';
  return (
    'Attribution: this server is using a company API key, so Factorial will record this ' +
    `action under the company API key's account, not under you. ${HOW_TO_FIX}`
  );
}

function resultNotice(count: number): string {
  const what = count === 1 ? 'this action' : `these ${count} actions`;
  return (
    `Attribution: Factorial recorded ${what} under the company API key's account, not ` +
    `under you, because this server is using a company API key. ${HOW_TO_FIX}`
  );
}

interface ToolResultLike {
  content?: Array<{ type: string; text?: string }>;
  [key: string]: unknown;
}

type AnyHandler = (...handlerArgs: unknown[]) => unknown;

function withAttribution(handler: AnyHandler): AnyHandler {
  return (...handlerArgs: unknown[]) => {
    const scope: CallScope = { companyWrites: 0 };
    return callScope.run(scope, async () => {
      const result = (await handler(...handlerArgs)) as ToolResultLike;
      if (scope.companyWrites === 0 || !result || !Array.isArray(result.content)) return result;
      return {
        ...result,
        content: [...result.content, { type: 'text', text: resultNotice(scope.companyWrites) }],
      };
    });
  };
}

interface ToolRegistrar {
  // The SDK's own signature is generic per tool; this module only forwards it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool: (...registration: any[]) => any;
}

/**
 * Make every tool registered on `server` from now on carry the attribution
 * rule in its description and the attribution notice in its results. Call it
 * before the first registerTool.
 */
export function installAttribution(server: ToolRegistrar): void {
  const register = server.registerTool.bind(server) as (...registration: unknown[]) => unknown;
  server.registerTool = (name: string, config: { description?: string }, handler: AnyHandler) => {
    const described = READ_ONLY_TOOLS.has(name)
      ? config
      : { ...config, description: `${config.description ?? ''} ${ATTRIBUTION_RULE}`.trim() };
    return register(name, described, withAttribution(handler));
  };
}
