# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-12-22

### Added
- Developer tooling: ESLint, Prettier, Vitest
- CI/CD pipeline with GitHub Actions
- Contributing guidelines with AI-first development philosophy
- Comprehensive test suite with 85%+ coverage target
- Pre-commit hooks for code quality
- Configuration management system
- HTTP client with exponential backoff retry logic
- Runtime validation with Zod schemas
- In-memory caching layer with TTL
- Pagination support for all list operations
- Error handling improvements with structured error types
- Time off/leave management tools (5 new tools)
- Attendance and shifts tools (2 new tools)
- Documents tools - read-only access (4 new tools)
- Job catalog tools (3 new tools)
- MCP Resources: org chart, employee directory, time off policies, team detail, location directory (5 resources)
- MCP Prompts: onboarding, org analysis, time off reports (3 prompts)
- .env.example file for easier setup
- CHANGELOG.md for version tracking
- LICENSE file (MIT)
- CODE_OF_CONDUCT.md
- GitHub issue and PR templates
- VS Code debug configurations

### Changed
- Updated .gitignore to exclude .claude/ files and additional patterns
- Refactored API client to use new http-client with retry logic
- All list operations now return pagination metadata
- Updated README with comprehensive documentation
- Bumped version to 2.0.0 (major feature release)

### Fixed
- Client-side filtering performance improved with caching
- Better error messages with user-friendly guidance
- Rate limiting handling with retry logic

## [1.1.0] - 2024-12-22

### Added
- More employee fields in responses

### Fixed
- Bug fixes and API endpoint compatibility

## [1.0.0] - 2024-12-22

### Added
- Initial release
- Employee tools: list, get, search
- Team tools: list, get
- Location tools: list, get
- Contract tools: get employee contracts
- Flexible .env file loading
- Privacy-focused design (no payroll data)
- Read-only access to FactorialHR API
- MCP server implementation
- TypeScript support with strict mode
- Comprehensive README with setup instructions

[2.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/t4dhg/mcp-factorial/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/t4dhg/mcp-factorial/releases/tag/v1.0.0
