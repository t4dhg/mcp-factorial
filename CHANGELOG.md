# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2025-12-23

### Changed - BREAKING CHANGES

#### Response optimization for employee collection tools

**get_employee_documents**:
- **Breaking**: Now returns summary format (7 fields) instead of full document objects (13 fields)
- **Breaking**: Default `limit` reduced from 100 to 20 documents per page
- Summary format aligns with `list_documents` tool for consistency
- Returns: `id`, `name`, `folder_id`, `employee_id`, `author_id`, `mime_type`, `size_bytes`
- Excluded fields available via `get_document(id)`: `company_id`, `public`, `space`, `file_url`, `created_at`, `updated_at`
- Reduces typical response size by ~90% (from 73KB to 4.9KB for 20 documents)
- Fixes token overflow issue where responses exceeded LLM context limits

**get_employee_contracts**:
- **Breaking**: Now returns summary format (4 fields) instead of full contract objects (6 fields)
- **Breaking**: Added pagination support with default `limit` of 20 contracts per page
- Returns: `id`, `employee_id`, `job_title`, `effective_on`
- Excluded fields: `created_at`, `updated_at`
- Aligns with employee documents pattern for consistency across employee collection tools

**Migration Guide**:
- If you need full document details, call `get_document(id)` for specific documents
- If you need more than 20 items, set `limit` parameter explicitly:
  - `get_employee_documents({ employee_id: 123, limit: 50 })`
  - `get_employee_contracts({ employee_id: 123, limit: 50 })`
- Summary format includes all essential metadata for browsing/filtering
- Both tools now accept `page` and `limit` parameters for pagination control

## [3.1.0] - 2025-12-23

### Added

#### Codecov Integration
- Bundle Analysis via `@codecov/vite-plugin` to track bundle size over time
- Test Analytics with JUnit XML reporting to monitor test performance and identify flaky tests
- Enhanced CI workflow to upload both coverage and test results to Codecov

#### README Enhancements
- CI status badge showing build health
- Codecov coverage badge
- Bundle analysis badge
- TypeScript 5.x badge
- npm downloads badge

### Changed
- Updated from deprecated `codecov/test-results-action@v1` to `codecov-action@v5` with `report_type: test_results`
- Reorganized README badges for better visual flow

### Infrastructure
- Added `.gitignore` entry for `test-results/` directory
- Updated CLAUDE.md with comprehensive Codecov integration documentation
- Configured Vitest to output JUnit XML for test analytics

## [3.0.0] - 2025-12-22

### Added

#### Write Operations
- Employee write operations: create_employee, update_employee, terminate_employee
- Team write operations: create_team, update_team, delete_team
- Location write operations: create_location, update_location, delete_location
- Leave write operations: create_leave, update_leave, cancel_leave, approve_leave, reject_leave
- Shift write operations: create_shift, update_shift, delete_shift

#### New Categories - Projects (17 tools)
- list_projects, get_project, create_project, update_project, delete_project
- list_project_tasks, create_project_task, update_project_task, delete_project_task
- list_project_workers, assign_project_worker, remove_project_worker
- list_time_records, create_time_record, update_time_record, delete_time_record

#### New Categories - Training (14 tools)
- list_trainings, get_training, create_training, update_training, delete_training
- list_training_sessions, create_training_session, update_training_session, delete_training_session
- list_training_enrollments, get_training_enrollment, enroll_in_training, unenroll_from_training

#### New Categories - Work Areas (6 tools)
- list_work_areas, get_work_area, create_work_area, update_work_area
- archive_work_area, unarchive_work_area

#### New Categories - ATS/Recruiting (16 tools)
- list_job_postings, get_job_posting, create_job_posting, update_job_posting, delete_job_posting
- list_candidates, get_candidate, create_candidate, update_candidate, delete_candidate
- list_applications, get_application, create_application, update_application, delete_application
- advance_application, list_hiring_stages

#### New Categories - Payroll (6 tools, read-only)
- list_payroll_supplements, get_payroll_supplement
- list_tax_identifiers, get_tax_identifier
- list_family_situations, get_family_situation

#### Infrastructure
- Audit logging module for all write operations
- Write safety module with risk classification
- Confirmation token management for high-risk operations
- HTTP client extended with POST/PUT/PATCH/DELETE methods
- Idempotency key support for safe write retries
- New error types: ConflictError, UnprocessableEntityError, OperationCancelledError

#### Visibility
- llms.txt for LLM discoverability
- Enhanced package.json keywords for npm searchability
- Comprehensive README update with all 80+ tools

### Changed
- Bumped version to 3.0.0 (major feature release)
- Updated project philosophy from read-only to full CRUD with safety guardrails
- Payroll data now accessible (read-only) instead of being excluded
- Server version updated to 3.0.0 in MCP metadata

### Security
- High-risk operations clearly marked in descriptions
- Audit logging for compliance
- Payroll operations remain read-only

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

[3.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/t4dhg/mcp-factorial/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/t4dhg/mcp-factorial/releases/tag/v1.0.0
