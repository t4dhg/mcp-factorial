# Contributing to MCP FactorialHR

We welcome contributions! This project embraces AI-assisted development—we expect and encourage contributors to use AI tools like Claude, GitHub Copilot, or ChatGPT to help write code, tests, and documentation.

## 🤖 AI-Assisted Contributions

### Using AI Tools

- **Encouraged**: Using AI to write code, tests, docs, or understand the codebase
- **Required**: Review AI-generated code before submitting
- **Best Practice**: Test AI-generated code thoroughly
- **Transparency**: No need to disclose AI usage in PRs (we assume it!)

### Tips for AI-Assisted Development

1. Provide AI with context from this file and README.md
2. Ask AI to follow existing code patterns in `src/`
3. Have AI write tests alongside new features
4. Use AI to explain unfamiliar FactorialHR API concepts
5. Let AI help you understand TypeScript types and MCP protocol details

## Development Setup

### Prerequisites

- Node.js 18+ (we recommend using nvm: `nvm use`)
- npm or pnpm
- A FactorialHR account with API access

### Initial Setup

```bash
git clone https://github.com/t4dhg/mcp-factorial.git
cd mcp-factorial
npm install
cp .env.example .env
# Add your FACTORIAL_API_KEY to .env
```

### Development Workflow

```bash
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm run test         # Run tests
npm run test:watch   # Test watch mode
npm run lint         # Check code quality
npm run format       # Format code
```

## Making Changes

### Before You Start

1. Check existing issues and PRs
2. For major changes, open an issue first to discuss
3. Fork the repository
4. Create a feature branch: `git checkout -b feature/your-feature`

### Coding Standards

- **TypeScript**: Strict mode, explicit types preferred
- **Formatting**: Prettier (runs on commit)
- **Linting**: ESLint (runs on commit)
- **Tests**: Required for new features and bug fixes

### Commit Messages

Follow conventional commits:

- `feat: Add time off balance endpoint`
- `fix: Handle null birthday_on fields`
- `docs: Update API key setup instructions`
- `test: Add coverage for team filtering`
- `chore: Update dependencies`

### Testing Requirements

- **Unit tests**: For API client functions (`src/api.ts`)
- **Integration tests**: For MCP tool handlers
- **Coverage**: Aim for >80% on new code
- **Fixtures**: Use mock data in `src/__tests__/fixtures/`

Example test structure:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { listEmployees } from '../api.js';

describe('listEmployees', () => {
  it('should fetch all employees', async () => {
    // Your test here
  });
});
```

### Pull Request Process

1. Update documentation (README, CHANGELOG)
2. Add tests for new functionality
3. Ensure all tests pass: `npm run test`
4. Ensure linting passes: `npm run lint`
5. Update CHANGELOG.md under "Unreleased"
6. Submit PR with clear description

## Project Structure

```
mcp-factorial/
├── src/
│   ├── index.ts              # MCP server & tool registration
│   ├── api.ts                # FactorialHR API client
│   ├── types.ts              # TypeScript interfaces
│   ├── config.ts             # Configuration management
│   ├── http-client.ts        # HTTP with retry logic
│   ├── cache.ts              # Caching layer
│   ├── schemas.ts            # Zod validation
│   ├── errors.ts             # Error types
│   ├── pagination.ts         # Pagination utilities
│   ├── resources/            # MCP resources
│   └── __tests__/            # Test files
├── dist/                     # Compiled output
└── README.md
```

## Code Review

- PRs require at least one approval
- CI must pass (tests, linting, build)
- Be responsive to feedback
- Small, focused PRs are preferred

## Security & Privacy

This project is security-focused:

- **No sensitive data in tests**: Use mock data only
- **API keys**: Never commit .env files
- **Privacy**: Do not add payroll/compensation endpoints
- **Destructive operations are gated**: every action that deletes a record, or terminates an employee, requires `confirm: true`. Adding one means adding both a `checkConfirmation` call and an `OPERATION_POLICIES` entry; a structural test fails the build if either is missing.

## Releasing

Releases are **staged by CI and promoted by a human**. Pushing a tag does not put anything in front of users.

1. Update the version in `package.json` and give the `CHANGELOG.md` heading a version and date.
2. Commit, then tag and push:

   ```bash
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

3. The `Publish to npm` workflow runs tests, builds, and then runs `npm stage publish`. It authenticates over OIDC as a trusted publisher, so there is no npm token anywhere in the repository or its secrets. The tarball is uploaded but **is not installable yet**.

4. Inspect what CI produced, then promote it. This step needs npm 11.19.0 or later locally (`npm install -g npm@latest`):

   ```bash
   npm stage list @t4dhg/mcp-factorial   # find the stage id
   npm stage view <stage-id>             # inspect the metadata
   npm stage download <stage-id>         # optional: fetch the exact tarball
   npm stage approve <stage-id>          # publish it, proving 2FA here
   ```

   `npm stage reject <stage-id>` discards it instead.

   Check the `shasum` reported by `npm stage view` against the one in the workflow log. Matching means the artifact being approved is the one that workflow built.

   **Run `approve` from a real terminal.** It needs a TTY to open the browser authentication flow, and fails with `EOTP` from a non-interactive shell such as an editor's task runner. With an authenticator app you can pass the code instead and it will work anywhere:

   ```bash
   npm stage approve <stage-id> --otp=123456
   ```

   A failed approve is harmless: the release stays staged and can be approved again.

5. Confirm it landed:

   ```bash
   npm view @t4dhg/mcp-factorial version
   ```

Two-factor authentication is proved at the approve step, not in CI. That is the point of the arrangement: the workflow can build and stage a release, but it cannot ship one, so a compromised workflow cannot reach users without a maintainer approving the exact artifact.

If a tag was pushed and the version turns out to be wrong, delete the tag before re-tagging, so the repository does not accumulate tags with no published release behind them:

```bash
git tag -d vX.Y.Z && git push origin --delete vX.Y.Z
```

## Getting Help

- **Issues**: GitHub Issues for bugs and feature requests
- **Discussions**: GitHub Discussions for questions
- **AI**: Ask Claude or your AI assistant about this project!

## Architecture Guidelines

### When Adding New Tools

1. Add TypeScript interface to `src/types.ts`
2. Add API function to `src/api.ts`
3. Add Zod schema to `src/schemas.ts`
4. Register tool in `src/index.ts`
5. Add tests in `src/__tests__/`
6. Update README.md

### Error Handling

Always use try-catch blocks in tool handlers:

```typescript
async ({ id }) => {
  try {
    const data = await getData(id);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
};
```

### Pagination Best Practices

All list operations should support pagination:

```typescript
export async function listItems(options?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Item>> {
  return factorialRequest<Item>('/items', {
    page: options?.page || 1,
    limit: Math.min(options?.limit || 100, 100),
  });
}
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! Your AI-assisted improvements make this project better for everyone. 🚀
