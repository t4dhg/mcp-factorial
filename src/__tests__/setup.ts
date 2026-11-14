/**
 * Runs before every test file.
 *
 * The server reads a stored login from the user's config directory. Tests must
 * never see a real one, so the token file is pointed at a path inside a
 * directory that does not exist. A test that wants a login points
 * FACTORIAL_TOKEN_FILE at its own temporary file.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.FACTORIAL_TOKEN_FILE = join(tmpdir(), 'mcp-factorial-tests-no-login', 'login.json');
delete process.env.FACTORIAL_AUTH_MODE;
delete process.env.FACTORIAL_ALLOW_COMPANY_KEY_APPROVALS;
