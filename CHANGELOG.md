# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [8.2.0] - 2026-09-05

### Security

- **Confirmation gate for `delete_application`**: `factorial_ats({ action: 'delete_application' })` checked for confirmation against a policy that did not exist, so the lookup fell through to the permissive default and the documented `confirm` parameter had no effect. The delete went through unconditionally. A `delete_application` policy is now defined and the gate works as advertised.
- **Confirmation gate for `delete_task`, `delete_time` and `delete_session`**: these three delete operations accepted a `confirm` parameter but never checked it. They are now gated like the other destructive operations.
- **Path traversal in document downloads**: `downloadDocument()` joined the Factorial-supplied document name straight onto the caller's `output_dir`. A document named with `..` segments could write outside that directory. Names are now reduced to a single path segment and the resolved path is verified to stay inside `output_dir`.

The three issues above were reported by Syed Anas Mohiuddin. Fixing them surfaced three more, found in the course of the fix:

- **Confirmation warnings read "null"**: `getWarningMessage()` returned `null` for medium-risk operations, but the confirmation gate interpolates the result into the message it shows. `delete_shift`, `cancel_leave` and `reject_leave` were prompting with the literal text "null" in place of the impact description. It now returns a message for any operation requiring confirmation, whatever its risk level.
- **Gating an operation with no policy is now a compile error**: `checkConfirmation()` took a plain `string`, so a name absent from `OPERATION_POLICIES` fell silently through to the permissive default. That is the root cause of the `delete_application` bug. It now takes an `OperationName` union derived from the policy table, so the same mistake fails the build.
- **Removed a duplicate confirmation gate**: `wrapHighRiskToolHandler()` in `tool-utils.ts` held a second, unused copy of the same policy lookup, carrying the same two defects. Every tool handler now reaches the gate through `checkConfirmation`. Note that `confirmation.ts` still holds a third, token-based mechanism that nothing imports; it has not been removed here.

A second review of that work found two more ungated deletes and a data-loss bug:

- **Confirmation gate for `remove_worker` and `unenroll`**: `factorial_projects({ action: 'remove_worker' })` and `factorial_training({ action: 'unenroll' })` both issue an irreversible DELETE and neither checked the `confirm` parameter their tool schema declares. Both are now gated. These were missed on the first pass because they were judged to be association removals in the style of `remove_team_member`, which is deliberately ungated; that comparison was wrong, since `remove_team_member` has no API implementation at all while both of these delete a real record.
- **Downloads no longer overwrite**: `downloadDocument()` wrote with an unconditional `fs.writeFile`. A tenant-controlled document name matching a file already in `output_dir` replaced it, and two documents sharing a name silently collapsed into one. Files are now written with the `wx` flag and fall back to `name (1).ext`, so nothing is replaced and no document is lost.
- **Partial payslip downloads no longer report as complete**: `downloadEmployeePayslips()` caught per-document failures into `debug()`, which is silent unless `DEBUG` is set, and returned only the successes. A hostile or over-long document name could therefore drop a payslip with no visible error. It now returns failures alongside the downloads, the tool reports them, and a download where every document failed throws.
- **Hostile filenames no longer crash a download**: names containing control characters or exceeding the filesystem's per-component limit reached `fs.writeFile` and threw. They are now stripped and shortened, keeping the extension.

### Tests

- A structural test asserts that every tool action reaching a destructive API call is gated. What counts as destructive is derived from the API layer, by finding the functions that issue a `deleteOne()`, rather than from a list of action names; a name-based predicate would only ever rediscover the names already thought of, which is how the first version of this test passed while `remove_worker` and `unenroll` were ungated. Deliberate exceptions go in an exemption registry that requires a written reason.
- A test compares the README's list of operations requiring confirmation against the gates present in the handler sources, so the two cannot drift apart.
- Every fix in this release was mutation-tested: the corresponding production code was reverted and the test confirmed to fail.

### Documentation

- **Audit logging**: the README described the audit trail as being "for compliance". The log is in-process, in-memory, capped at 1000 entries, and not retrievable through any tool, so the README now says exactly that and points to FactorialHR's own activity log as the system of record. Also reported by Syed Anas Mohiuddin.
- **High-risk operations**: the README listed 5 of the 14 operations that require `confirm: true`. The list is now complete.
- **Added `SECURITY.md`** with a private reporting route, scope, and response expectations.

### Release pipeline

- **Publishing to npm has been failing silently since January.** The `NPM_TOKEN` used by the publish workflow was a granular token that expired 30 days after it was issued, and the registry reports that as `E404 Not Found` on the upload rather than an auth error, so it did not read as a credential problem. Every release from 7.2.0 onward was tagged and never published: **7.2.0, 7.3.0, 8.0.0, 8.1.0 and 8.1.1 do not exist on npm.** Anyone installing from npm has been on 7.1.0 since December.
- **Switched to npm trusted publishing.** The workflow now authenticates with an OIDC token minted by GitHub Actions and matched against a trusted publisher registered for this package, so there is no long-lived credential left to expire. This required Node 24 on the publish job, because trusted publishing needs npm 11.5.1 or later and Node 20 and 22 both ship npm 10.x. Node 24 has been added to the CI test matrix so the release runtime is covered by tests.
- **Document downloads**: the README now describes how untrusted document names are handled, including that downloads never overwrite.
- **`llms.txt`** carried the same overstated safety and audit claims as the README and has been corrected to match.
- **`requiresPreview`** in `OperationPolicy` is documented as not currently consumed by any code path.

## [8.1.1] - 2026-01-23

### Fixed

- **Document downloads**: Fixed `downloadEmployeePayslips` to pass document metadata directly instead of re-fetching, avoiding "Document not found" errors caused by Factorial API's unreliable individual document endpoint
- **downloadDocument function**: Now accepts either document ID or Document object, allowing callers to skip redundant metadata fetches
- **Fallback filenames**: Documents without names now get a proper fallback filename with `.pdf` extension when mime type is PDF

### Improved

- **Error messages**:
  - `getDocument()` now provides helpful guidance when document lookup fails due to API limitations
  - `getDocumentDownloadUrls()` now clearly explains that OAuth2 is required (Factorial API limitation) and provides setup instructions
- **README documentation**:
  - Updated OAuth2 setup instructions with correct Factorial URLs and scopes
  - Clarified that OAuth2 is **required** for document downloads (not optional)
  - Added troubleshooting section for "Document with ID X not found" errors
  - Added troubleshooting section for download authentication
  - Updated Endpoint Quirks table with document-specific limitations

## [8.1.0] - 2026-01-23

### Changed

#### Modular Architecture Refactoring

Refactored the codebase into domain-based modules for better maintainability and faster development:

**New Module Structure:**

```
src/
├── schemas/          # Zod schemas by domain (11 files)
│   ├── employees.ts  # Employee, Team, Location, Contract
│   ├── time-off.ts   # Leave, LeaveType, Allowance, Shift
│   ├── projects.ts   # Project, Task, Worker, TimeRecord
│   └── ...
├── api/              # API functions by domain (15 files)
│   ├── employees.ts  # listEmployees, getEmployee, etc.
│   ├── time-off.ts   # listLeaves, createLeave, etc.
│   ├── projects.ts   # listProjects, createProject, etc.
│   └── ...
└── tools/            # MCP tool registrations by domain (15 files)
    ├── employees.ts  # factorial_employees tool
    ├── time-off.ts   # factorial_time_off tool
    ├── projects.ts   # factorial_projects tool
    └── ...
```

**Benefits:**

- **Faster context loading**: Read only the files relevant to your task
- **Easier navigation**: Find code by domain (employees, projects, training, etc.)
- **Smaller files**: Largest file is ~320 lines (down from 2,073 lines)
- **Backward compatible**: Original imports still work via re-exports

**For Contributors:**

- Add new schemas to `src/schemas/{domain}.ts`
- Add new API functions to `src/api/{domain}.ts`
- Add new tool actions to `src/tools/{domain}.ts`
- Run `npm test` to verify all 463 tests still pass

## [8.0.0] - 2026-01-23

### Changed - BREAKING CHANGES

#### Hierarchical Tool Discovery (88% Context Reduction)

**BREAKING**: The MCP server now uses hierarchical tool discovery instead of individual tools.

- **Before**: 117 individual tools (e.g., `list_employees`, `get_employee`, `create_employee`, etc.)
- **After**: 14 category-based tools with an `action` parameter (e.g., `factorial_employees` with `action: "list"`)

This change reduces context token usage by approximately 88% while maintaining full functionality.

**New Tool Structure:**

| Tool | Description | Actions |
|------|-------------|---------|
| `factorial_discover` | Discover available categories and actions | - |
| `factorial_employees` | Employee management | list, get, search, create, update, terminate |
| `factorial_teams` | Team management | list, get, create, update, delete |
| `factorial_locations` | Location management | list, get, create, update, delete |
| `factorial_contracts` | Contract and salary data | list, get_with_employee, by_job_role, by_job_level |
| `factorial_time_off` | Leave management | list_leaves, get_leave, list_types, get_type, list_allowances, create, update, cancel, approve, reject |
| `factorial_attendance` | Shift management | list, get, create, update, delete |
| `factorial_documents` | Document management | list_folders, get_folder, list, get, get_by_employee, search, download_payslips, download |
| `factorial_job_catalog` | Job roles and levels | list_roles, get_role, list_levels |
| `factorial_projects` | Project management | 16 actions for projects, tasks, workers, time records |
| `factorial_training` | Training management | 12 actions for trainings, sessions, enrollments |
| `factorial_work_areas` | Work area management | list, get, create, update, archive, unarchive |
| `factorial_ats` | Applicant tracking | 17 actions for postings, candidates, applications, stages |
| `factorial_payroll` | Payroll data (read-only) | list_supplements, get_supplement, list_tax_ids, get_tax_id, list_family, get_family |

**Migration Guide:**

```typescript
// Before (v7.x)
mcp.call('list_employees', { page: 1, limit: 50 })
mcp.call('get_employee', { id: 123 })
mcp.call('create_leave', { employee_id: 123, ... })

// After (v8.0.0)
mcp.call('factorial_employees', { action: 'list', page: 1, limit: 50 })
mcp.call('factorial_employees', { action: 'get', id: 123 })
mcp.call('factorial_time_off', { action: 'create', employee_id: 123, ... })
```

**Why This Change:**

MCP servers load all tool definitions into context upfront. With 117 individual tools, this was consuming significant context tokens (~7,500+) before any actual work began. The hierarchical approach:

1. Reduces initial context load from ~7,500 tokens to ~900 tokens
2. Maintains full functionality (all 117 operations still available)
3. Groups related operations logically by category
4. Provides discovery mechanism via `factorial_discover`

## [7.3.0] - 2026-01-23

### Added

#### OAuth2 Authentication Support

Full OAuth2 support for document download operations:

- **Token Management**: Automatic access token refresh using refresh tokens
- **Token Caching**: In-memory caching with automatic refresh 5 minutes before expiry
- **Error Handling**: Clear error messages for expired tokens, invalid credentials, and missing configuration

New environment variables for OAuth2:
- `FACTORIAL_OAUTH_CLIENT_ID` - OAuth2 application client ID
- `FACTORIAL_OAUTH_CLIENT_SECRET` - OAuth2 application client secret
- `FACTORIAL_OAUTH_REFRESH_TOKEN` - Refresh token for obtaining access tokens

#### New Module: `src/oauth.ts`

OAuth2 token management module with:
- `isOAuth2Configured()` - Check if OAuth2 credentials are set
- `getOAuth2AccessToken()` - Get valid access token (refreshes automatically)
- `getOAuth2Status()` - Get OAuth2 configuration and token status for debugging
- `clearOAuth2Cache()` - Clear cached tokens (useful for testing)

### Changed

- **Document download tools now work** when OAuth2 is configured
- Updated `getDocumentDownloadUrls()` to use OAuth2 Bearer token authentication
- Improved error messages when OAuth2 is not configured
- Added comprehensive OAuth2 setup guide to README
- Updated Configuration Options table with OAuth2 environment variables
- Updated `.env.example` with OAuth2 configuration examples
- Added OAuth2 test suite with 14 new tests (total: 463 tests)

## [7.2.0] - 2026-01-23

### Added

#### Document Download Tools (Requires OAuth2)

Two new tools for downloading documents directly from FactorialHR:

- **`download_payslip_pdf`**: Download all payslip PDFs for an employee
- **`download_employee_document`**: Download any employee document by ID

**Note**: These tools require OAuth2 authentication. API key auth cannot access the `download-urls/bulk-create` endpoint.

### Changed

- Updated tool count from 85+ to 87+ to reflect new document download tools

## [7.1.0] - 2025-12-26

### Added

#### Expanded Contract Schema with Salary and Compensation Data

The `ContractSchema` now includes salary and job catalog fields from the Factorial API:

- `salary_amount`: Salary in cents (e.g., 7000000 = €70,000)
- `salary_frequency`: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly'
- `working_hours` and `working_hours_frequency`
- `job_catalog_role_id` and `job_catalog_level_id`
- `contract_type`, `trial_period_ends_on`, `ends_on`
- `annual_working_time_distribution` (API 2025-07-01)

#### New Tool: get_employee_with_contract

Get an employee with their latest contract data including salary, job title, and job role. Combines employee data with compensation info from their most recent contract in one call.

#### New Tool: list_employees_by_job_role

Find all employees assigned to a specific job role. Uses contract data since job role assignment is stored in contracts (`job_catalog_role_id`), not on the employee object.

#### New Tool: list_employees_by_job_level

Find all employees at a specific job level. Uses contract data since job level is stored in contracts (`job_catalog_level_id`).

#### API Quirks Documentation

Added comprehensive "Factorial API Quirks and Limitations" section to README covering:

- Data location quirks (team membership, job roles, salary stored differently than expected)
- Endpoint quirks (404 fallbacks, empty response handling)
- Field availability notes
- Salary data format explanation
- Best practices for common tasks

### Changed

- Updated tool count from 80+ to 85+ to reflect new contract tools
- Contracts category now shows 4 tools instead of 1

## [7.0.1] - 2025-12-23

### Added

- MCP Registry support: Added `server.json` manifest for listing on the official [MCP Registry](https://registry.modelcontextprotocol.io)
- Smithery support: Added `smithery.yaml` configuration for listing on [Smithery](https://smithery.ai)
- Smithery badge in README for easy discovery and installation
- `mcpName` field in package.json for npm ownership verification

## [7.0.0] - 2025-12-23

### Changed - BREAKING CHANGES

#### EmployeeSchema corrected to match actual Factorial API

The EmployeeSchema has been corrected to match the actual Factorial API response. This is a breaking change as some fields that were previously in the schema (but always null) have been removed:

- **Removed fields** (never existed in API): `team_ids`, `role`, `hired_on`, `start_date`
- **Added 30+ fields** that actually exist: `identifier`, `identifier_type`, `preferred_name`, `access_id`, address fields, banking fields, termination details, emergency contact, and more

**Note**: Team membership is stored on Team objects (`employee_ids` array), not on Employee objects. To get teams for an employee, query teams and filter by `employee_ids`.

#### list_employees output simplified

The `list_employees` tool output no longer includes `role`, `team_ids`, or `hired_on` fields. New fields available: `identifier`, `identifier_type`, `active`, `seniority_date`.

### Added

#### New Tool: search_employee_documents

Search documents by employee name and optional document name pattern:
- `employee_name`: Search for employees by name (partial match)
- `document_query`: Optional filter for document name (e.g., "resume", "certification")

Example: Find an employee's resume or count their certifications.

#### New Prompt: team-document-summary

Summarize documents across a team:
- Shows document counts by folder for each team member
- Identifies gaps in documentation
- Useful for compliance reviews

#### Folder name enrichment

`list_documents` and `get_employee_documents` now include `folder_name` alongside `folder_id` for better context.

### Fixed

- Removed broken `team_id` client-side filtering (team membership is on Team, not Employee)
- Tests updated to match corrected schema

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

[8.1.1]: https://github.com/t4dhg/mcp-factorial/compare/v8.1.0...v8.1.1
[8.1.0]: https://github.com/t4dhg/mcp-factorial/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v7.3.0...v8.0.0
[7.3.0]: https://github.com/t4dhg/mcp-factorial/compare/v7.2.0...v7.3.0
[7.2.0]: https://github.com/t4dhg/mcp-factorial/compare/v7.1.0...v7.2.0
[7.1.0]: https://github.com/t4dhg/mcp-factorial/compare/v7.0.1...v7.1.0
[7.0.1]: https://github.com/t4dhg/mcp-factorial/compare/v7.0.0...v7.0.1
[7.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v4.0.0...v7.0.0
[4.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/t4dhg/mcp-factorial/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/t4dhg/mcp-factorial/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/t4dhg/mcp-factorial/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/t4dhg/mcp-factorial/releases/tag/v1.0.0
