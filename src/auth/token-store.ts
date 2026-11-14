/**
 * Where a user login is kept between runs.
 *
 * One JSON file in the user's config directory, outside any repository and
 * readable by its owner only. It holds bearer credentials, so nothing here
 * ever puts its contents into an error message or a log line.
 *
 * Reads are synchronous and re-read the file whenever it changed on disk:
 * several server processes can share one login, and a refresh by any of them
 * rotates the refresh token for all of them.
 */

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as z from 'zod';
import { ConfigurationError } from '../errors.js';

const StoredLoginSchema = z.object({
  version: z.literal(1),
  /** The OAuth application the tokens were issued to */
  client_id: z.string().min(1),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  /** When the access token stops working, in milliseconds since the epoch */
  expires_at: z.number(),
  scope: z.string().nullable(),
  /** The employee who logged in; every write made with the token is theirs */
  employee_id: z.string().min(1),
  employee_name: z.string().nullable(),
  email: z.string().nullable(),
  obtained_at: z.string(),
});

export type StoredLogin = z.infer<typeof StoredLoginSchema>;

const APP_DIR = 'mcp-factorial';
const FILE_NAME = 'login.json';

/** FACTORIAL_TOKEN_FILE, or login.json in the user's config directory */
export function tokenFilePath(): string {
  const explicit = process.env.FACTORIAL_TOKEN_FILE?.trim();
  if (explicit) return explicit;
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(xdg, APP_DIR, FILE_NAME);
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, APP_DIR, FILE_NAME);
  }
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(home, '.config', APP_DIR, FILE_NAME);
}

// A rename replaces the inode, so a rewrite is seen even when size and time agree.
let memo:
  { path: string; ino: number; mtimeMs: number; size: number; login: StoredLogin } | undefined;

/**
 * The stored login, or undefined when nobody has logged in.
 *
 * @throws ConfigurationError when the file is readable by other users or is
 *   not a login this version wrote
 */
export function readStoredLogin(): StoredLogin | undefined {
  const path = tokenFilePath();
  let stats;
  try {
    stats = statSync(path);
  } catch {
    memo = undefined;
    return undefined;
  }
  if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
    throw new ConfigurationError(
      `The login file ${path} can be read by other users of this machine. ` +
        `Run: chmod 600 "${path}" and try again, or run the login command again.`
    );
  }
  if (
    memo &&
    memo.path === path &&
    memo.ino === stats.ino &&
    memo.mtimeMs === stats.mtimeMs &&
    memo.size === stats.size
  ) {
    return memo.login;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    parsed = undefined;
  }
  const result = StoredLoginSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigurationError(
      `The login file ${path} is not a valid login. Run the login command to login again.`
    );
  }
  memo = {
    path,
    ino: stats.ino,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    login: result.data,
  };
  return result.data;
}

/** Write the login atomically, readable by its owner only */
export function writeStoredLogin(login: StoredLogin): void {
  const path = tokenFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const contents = JSON.stringify(StoredLoginSchema.parse(login), null, 2);
  // An unguessable name, created exclusively: a file or symlink planted at the
  // temporary path is never written through.
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  memo = undefined;
}

/** Remove the login; false when there was none */
export function deleteStoredLogin(): boolean {
  const path = tokenFilePath();
  memo = undefined;
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}
