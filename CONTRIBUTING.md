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
- **Read-only**: No write operations to Factorial API

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
