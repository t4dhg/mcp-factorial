# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [9.0.0] - 2026-09-06

### Changed

- **Default Factorial API version is now `2026-07-01`** (was `2025-10-01`). Factorial supports each quarterly version for one year and then serves requests to it with the oldest schema, so `2025-10-01` stops being honoured around October 2026. `FACTORIAL_API_VERSION` still overrides the default. The changelogs of the three skipped versions (2026-01-01, 2026-04-01, 2026-07-01) were read and everything that touches an endpoint this server uses is reflected below. `2026-10-01` is still in beta and was deliberately not chosen.
- **BREAKING: every Factorial identifier is now a string.** From `2026-07-01` the API serialises every `id` and `*_id` field as a string, in responses, request parameters and webhook payloads, because identifiers have outgrown the range a JSON number can carry (`"id": "42"` instead of `"id": 42`; records created after a tenant is moved to a new cluster get values like `36893488147419100`). Every response schema now types identifiers with the new `resourceId` helper in `schemas/shared.ts`, so the exported TypeScript types (`Employee['id']`, `Contract['employee_id']`, `Team['employee_ids']` and so on) change from `number` to `string`. Client-side filters that compare a record against a caller-supplied numeric ID (`listContracts`, `getLatestContract`, `listEmployeesByJobRole`, `listEmployeesByJobLevel`, `listEmployees({ location_id })`, `getEmployee` and `getDocument` fallbacks, the work-areas location filter, the org-chart prompt) now compare through `String()`; without that they silently returned nothing on the new version. Tool inputs still accept numeric IDs, so an identifier above 2^53 cannot yet be passed through a tool; that is left for a later change.
- **Identifiers in request bodies are sent as strings.** The same migration types every identifier in request payloads as a string (`employee_id`, `leave_type_id`, `team_ids`, `lead_ids`, `location_id`, `project_id` and so on; the official `@factorialco/api-client` 2.x generated types agree). Tool inputs keep accepting numbers; `factorialRequest` now converts numbers under `id`, `ids`, `*_id` and `*_ids` keys (nested objects and arrays included) to strings before serialising the body. This follows the documented contract but could not be exercised against the live tenant, since verification was strictly read-only.
- **Employee**: added `communications_email` and `unconfirmed_communications_email` (2026-07-01) and `default_work_area_id` (2026-04-01).
- **Contract**: added `job_catalog_tree_node_uuid` (2026-01-01), `de_base_salary_type_id` (2026-04-01), `version_data` (2026-07-01), plus `company_id`, `country`, `starts_on`, `working_week_days`, `working_time_percentage_in_cents`, `bank_holiday_treatment`, `has_payroll` and `has_trial_period`, all of which the live endpoint returns. Removed `contract_type`, which it never returned. `job_title` and `job_catalog_level_id` were dropped from the contract DTO in 2026-04-01; the live endpoint still returns both keys, always `null`, so they stay in the schema as nullable.
- **Leave**: added `days_taken` (2026-01-01). Identifier types aside, nothing else in `LeaveSchema` or `ShiftSchema` was touched; see "Known gaps" below.
- **Leave type**: added `eau_eligible` (2026-07-01) together with the fields the live endpoint has returned all along (`identifier`, `translated_name`, `active`, `approval_required`, `accrues`, `attachment`, `allow_endless`, `restricted`, `visibility`, `workable`, `payable`, `editable`, `is_attachment_mandatory`, `half_days_units_enabled`, `details_required`, `allowance_ids`, `max_days_in_cents`, `min_days_in_cents`). Removed `code`, `created_at` and `updated_at`, which it never returned.
- **Time record**: added `observations` (2026-07-01), `clock_in`, `clock_out` and `imputed_minutes`; removed `minutes`, `description`, `created_at` and `updated_at` (not in the `2026-07-01` reference).
- **Training**: added `author_employee_id` (2026-07-01), `is_mandatory` and `total_duration` (2026-01-01) and the remaining reference fields; removed `category_id` (the reference has `category_ids`). Cost totals are typed as strings, which is how the API serialises them.
- **Job posting**: added `category` (2026-07-01) and the remaining reference fields (`contract_type`, `workplace_type`, `remote`, `schedule_type`, `legal_entity_id`, salary fields, requirement flags, `url`). `status` now enumerates `draft`, `published`, `unlisted`, `archived`, `cancelled` and `deleted`; removed `department`, `employment_type`, `remote_status`, `closed_at` and `updated_at`, which are not in the reference.
- **Application**: added `cv` (2026-07-01). Foreign keys are named as the API names them: `ats_job_posting_id`, `ats_candidate_id` and `ats_application_phase_id` replace `job_posting_id`, `candidate_id` and `hiring_stage_id`; `status`, `rating`, `notes`, `applied_at`, `rejected_at`, `hired_at` and `updated_at` are gone and `qualified`, `phone`, `cover_letter`, `medium`, `rating_average`, `employee_id`, `ats_conversation_id`, `ats_rejection_reason_id` and `source_id` are in. The `list_applications` summary reports the new key names.

### Fixed

The API-first re-verification of every schema against live `2026-07-01` responses (or the `2026-07-01` reference where this tenant has no records) showed that several schemas never matched the API on `2025-10-01` either. They are corrected here rather than carried forward:

- **Document**: the API returns `filename`, `content_type`, `file_size` and `extension`; there are no `name`, `mime_type`, `size_bytes` or `file_url` fields, which is why the documents tool reported every document as `[No name]` with an unknown type and why payslip downloads always fell back to `document-{id}.pdf`. The schema, the download code and the tool summaries now use the real fields (the summary keys `name` and `mime_type` are kept, populated from `filename` and `content_type`). Added `leave_id`, `is_company_document`, `is_management_document`, `is_pending_assignment`, `signature_status`, `signees` and `deleted_at`.
- **Folder**: `parent_id` is `parent_folder_id`; added `active` and `space`; removed `created_at` and `updated_at`, which folders do not have.
- **Team**: added `avatar`; removed `created_at` and `updated_at`, which teams do not have.
- **Location**: added `timezone`, `main`, `latitude`, `longitude`, `radius` and `siret`; removed `created_at` and `updated_at`, which locations do not have.
- **Allowance**: `/timeoff/allowances` returns the allowance definitions of a time-off policy (cycle, accrual, carry-over and rounding rules), not per-employee balances. The schema previously described `employee_id`, `leave_type_id`, `balance_days`, `consumed_days`, `available_days` (as a number) and `valid_from`/`valid_to`, none of which exist. It now describes the real record (`timeoff_policy_id`, `leave_type_ids`, `allowance_type`, `timeoff_cycle`, `frequency`, `carry_over_days`, `rounding` and the rest).
- **Job role**: added `archived`, `legal_entities_ids`, `supervisors_ids` and `competencies_ids`; removed `created_at` and `updated_at`.
- **Job level**: the record is `id`, `role_id`, `name`, `role_name`, `order`, `archived` and `is_default`; `description`, `company_id`, `created_at` and `updated_at` never existed.
- **Hiring stage**: the record is `id`, `name`, `label`, `position` and `company_id`; `ats_application_phase_id`, `created_at` and `updated_at` never existed.
- **Project**: `status` values are `active`, `closed`, `draft` and `processing` (not `inactive`/`archived`); added `legal_entity_id`, `client_id`, `start_date`, `due_date`, `is_billable` and the cost fields; removed `company_id`, `created_at` and `updated_at`.
- **Project task**: a project task links a project to a task in the tasks module. The record is `id`, `project_id`, `subproject_id`, `task_id` and `follow_up`; `name`, `description`, `completed`, `due_on` and `due_status` belong to the task, not to this record.
- **Project worker**: added `assigned` and the minutes and cost fields; removed `created_at` and `updated_at`.
- **Training session**: the record uses `starts_at`, `ends_at`, `due_date`, `duration`, `modality`, `schedule`, `link`, `training_class_id` and related IDs; `start_date`, `end_date`, `max_attendees`, `created_at` and `updated_at` never existed.
- **Training membership**: the record is `id`, `access_id`, `employee_id`, `training_id`, `status`, `training_due_date` and `training_completed_at`; `session_id`, `enrolled_at`, `completed_at`, `created_at` and `updated_at` never existed.
- **Candidate**: `phone` is `phone_number`; added `talent_pool`, `personal_url`, `gender`, `score`, `medium`, `source_id`, `ats_job_posting_ids` and the consent fields; removed `source`, `resume_url` and `linkedin_url`.
- **Payroll supplement**: `amount_cents` is `amount_in_cents`; added `unit`, `currency`, `description`, `contracts_compensation_id`, `contracts_taxonomy_id`, `payroll_policy_period_id`, `legal_entity_id` and the minutes fields; removed `supplement_type_id` and `name`.
- **Tax identifier**: the record is `id`, `employee_id`, `country` (`pt`, `de` or `it`), `tax_id` and `social_security_number`; `identifier_type`, `identifier_value`, `created_at` and `updated_at` never existed.
- **Family situation**: `marital_status` is `civil_status` and `number_of_dependents` is `number_of_dependants`; `effective_on`, `created_at` and `updated_at` never existed.
- **Work area**: the record is `id`, `location_id`, `name` and `archived_at`; `description`, `company_id`, `archived`, `created_at` and `updated_at` never existed. The tool summary derives its `archived` flag from `archived_at`.

### Tests

- The fixtures in `src/__tests__/fixtures/` are re-captured from live `2026-07-01` responses, with names, emails, identifiers, addresses, bank details, dates and salaries replaced by placeholders. Field sets and types are the real ones. A schema test parses every fixture record through its schema (Leave and Shift excluded, see below), so a schema that drifts from reality fails the suite, and another asserts that numeric identifiers are rejected.

### Known gaps found during verification and deliberately not fixed here

- **Single-record and write responses are not wrapped in `data`.** On both versions, `GET /{resource}/{id}` and every `POST`/`PUT`/`PATCH` return the record at the top level; only list endpoints wrap it as `{ data: [...], meta: {...} }`. The 2026-07-01 reference says the same. `fetchOne`, `postOne`, `putOne`, `patchOne` and `postAction` all return `response.data`, so they return `undefined`, which is what the "individual endpoint is unreliable" fallbacks in `getEmployee` and `getDocument` have been compensating for, and why write tools print `undefined` as the created record. Unrelated to the version bump and not changed here; it needs its own fix and test update.
- **Leave approve and reject paths.** The API exposes `POST /timeoff/leaves/approve` and `/reject` with the leave `id` in the body; the server posts to `/timeoff/leaves/{id}/approve`, which the reference does not list. Same on both versions.
- **Document downloads are pinned to API `2025-01-01`** (`download-urls/bulk-create` with `document_ids`), a version that is past its one-year support window. The `2026-07-01` reference has `documents/download_urls/bulk_create` taking `ids: string[]`. That pinned request keeps sending numeric identifiers, exactly as before this release, since it predates the string migration and bypasses `factorialRequest`; a test pins the wire format.
- `LeaveSchema` and `ShiftSchema` still describe the pre-2026 shapes. Live leaves have no `status` field but an `approved` boolean that is `null` while pending, `half_day` is `null`, `beggining_of_day` (Factorial's spelling) or `end_of_day`, and `duration_attributes` is `null`; live shifts have `date`, `reference_date`, `minutes`, `observations`, `workable`, `workplace_id`, `location_type` and the geolocation fields instead of `worked_hours`, `break_minutes`, `location` and `notes`. Both are reworked with the attendance feature.
- The 2026-04-01 release notes say `source` (announced as `api_source`) was added to the shift create, clock-in, clock-out and toggle-clock requests and that it is required. This could not be verified without writing to the tenant; the attendance work must check it.
- `ENDPOINTS.trainingMemberships` points at `/trainings/memberships`, which returns 404 on both versions. The endpoint is `/trainings/training_memberships`.
- `listTaxIdentifiers` calls `/payroll_employees/identifiers` without the `country` filter the endpoint requires, so it always returns 400.
- `listAllowances({ employee_id })` sends an `employee_id` filter the endpoint does not have (it takes `ids[]`, `timeoff_policy_id` and `by_overtime`), and the records it returns are policy definitions rather than balances.
- `listEmployeesByJobRole` filters contracts on `job_catalog_role_id`, which the contract endpoint has never returned; it always yields an empty list. Roles are reachable through `job_catalog_tree_node_uuid` and `/job_catalog/tree_nodes`.
- `listApplications` filters with `job_posting_id`; the API parameter is `ats_job_posting_id`. `listPayrollSupplements`, `listTaxIdentifiers` and `listFamilySituations` filter with `employee_id`; the API parameters are `employee_ids[]` (or `employees_ids[]` for identifiers).
- `UpdateProjectInputSchema` and the projects tool accept `status` values `inactive` and `archived`, which the API does not have, and reject `closed`, `draft` and `processing`, which it does.
- Unit tests other than the API, schema and error-handling suites still build inline mock records with numeric identifiers. They pass because the API layer does not validate responses at runtime, but they no longer reflect what the API returns.

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
- **Releases are now staged, not published directly, by CI.** Pushing a tag runs `npm stage publish`, which uploads the tarball without making it installable. A maintainer inspects it and runs `npm stage approve`, which is where two-factor authentication is proved. CI has no permission to publish directly, so a compromised workflow cannot put a version in front of users on its own. See CONTRIBUTING.md for the promotion steps.
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
