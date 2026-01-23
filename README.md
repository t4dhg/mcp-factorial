<p align="center">
  <img src="https://raw.githubusercontent.com/t4dhg/mcp-factorial/main/assets/factorial-logo.svg" alt="FactorialHR" height="48">
</p>

# MCP FactorialHR

> **The definitive Model Context Protocol server for [FactorialHR](https://factorialhr.com)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/t4dhg/mcp-factorial/actions/workflows/ci.yml/badge.svg)](https://github.com/t4dhg/mcp-factorial/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/t4dhg/mcp-factorial/branch/main/graph/badge.svg)](https://codecov.io/gh/t4dhg/mcp-factorial)
[![bundle](https://codecov.io/gh/t4dhg/mcp-factorial/graph/bundle/mcp-factorial/badge.svg)](https://codecov.io/gh/t4dhg/mcp-factorial)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/@t4dhg/mcp-factorial.svg)](https://www.npmjs.com/package/@t4dhg/mcp-factorial)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

A comprehensive Model Context Protocol (MCP) server that provides AI assistants like Claude with full access to FactorialHR. Manage employees, teams, time off, projects, training, recruiting, and more - all with built-in safety guardrails.

## Why This MCP Server?

- **Context-Optimized**: 14 hierarchical tools (117 operations) with 88% less context usage than individual tools
- **Full CRUD Operations**: Create, read, update, and delete across all major entities
- **Safety Guardrails**: High-risk operations require explicit confirmation
- **Audit Logging**: All write operations are logged for compliance
- **Enterprise Ready**: Built for companies who need AI integration with proper controls

## Features

### Hierarchical Tool Discovery (v8.0.0+)

The MCP server uses a hierarchical tool structure for optimal context usage. Instead of 117 individual tools, you get 14 category-based tools with an `action` parameter.

| Tool                    | Description                   | Actions                                            |
| ----------------------- | ----------------------------- | -------------------------------------------------- |
| `factorial_discover`    | Discover available categories | -                                                  |
| `factorial_employees`   | Employee management           | list, get, search, create, update, terminate       |
| `factorial_teams`       | Team management               | list, get, create, update, delete                  |
| `factorial_locations`   | Location management           | list, get, create, update, delete                  |
| `factorial_contracts`   | Contract/salary data          | list, get_with_employee, by_job_role, by_job_level |
| `factorial_time_off`    | Leave management              | 10 actions                                         |
| `factorial_attendance`  | Shift management              | list, get, create, update, delete                  |
| `factorial_documents`   | Document management           | 8 actions (downloads require OAuth2 - see below)   |
| `factorial_job_catalog` | Job roles/levels              | list_roles, get_role, list_levels                  |
| `factorial_projects`    | Project management            | 16 actions for projects, tasks, workers, time      |
| `factorial_training`    | Training management           | 12 actions for trainings, sessions, enrollments    |
| `factorial_work_areas`  | Work area management          | list, get, create, update, archive, unarchive      |
| `factorial_ats`         | Applicant tracking            | 17 actions for recruiting                          |
| `factorial_payroll`     | Payroll data (read-only)      | 6 actions                                          |

**Example Usage:**

```typescript
// List all employees
factorial_employees({ action: 'list', page: 1, limit: 50 });

// Get a specific employee
factorial_employees({ action: 'get', id: 123 });

// Search employees
factorial_employees({ action: 'search', query: 'john' });

// Create a leave request
factorial_time_off({
  action: 'create',
  employee_id: 123,
  leave_type_id: 1,
  start_on: '2026-02-01',
  finish_on: '2026-02-05',
});

// Discover available actions for a category
factorial_discover({ category: 'employees' });
```

### 117 Operations Across 14 Categories

| Category        | Operations                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **Employees**   | list, get, search, create, update, terminate                                                           |
| **Teams**       | list, get, create, update, delete                                                                      |
| **Locations**   | list, get, create, update, delete                                                                      |
| **Time Off**    | list_leaves, get_leave, list_types, get_type, list_allowances, create, update, cancel, approve, reject |
| **Attendance**  | list, get, create, update, delete                                                                      |
| **Projects**    | 16 operations for projects, tasks, workers, time records                                               |
| **Training**    | 12 operations for trainings, sessions, enrollments                                                     |
| **Work Areas**  | list, get, create, update, archive, unarchive                                                          |
| **ATS**         | 17 operations for job postings, candidates, applications, hiring stages                                |
| **Payroll**     | list/get supplements, tax identifiers, family situations (read-only)                                   |
| **Documents**   | 8 operations for folders, documents, and downloads (⚠️ downloads require OAuth2)                       |
| **Job Catalog** | list_roles, get_role, list_levels (read-only)                                                          |
| **Contracts**   | list, get_with_employee, by_job_role, by_job_level (read-only)                                         |

### 5 MCP Resources

| Resource URI                      | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `factorial://org-chart`           | Complete organizational hierarchy (Markdown)       |
| `factorial://employees/directory` | Employee directory by team (Markdown)              |
| `factorial://locations/directory` | Location directory with employee counts (Markdown) |
| `factorial://timeoff/policies`    | All leave types and policies (JSON)                |
| `factorial://teams/{team_id}`     | Team details with member list (JSON, templated)    |

### 4 MCP Prompts

| Prompt                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `onboard-employee`      | Generate personalized onboarding checklists                       |
| `analyze-org-structure` | Analyze org structure (reporting lines, team sizes, distribution) |
| `timeoff-report`        | Generate time off reports by team or date range                   |
| `team-document-summary` | Summarize documents across a team (certifications, payslips, etc) |

### Architecture Features

- **Safety Guardrails**: High-risk operations (terminate, delete) marked for confirmation
- **Audit Logging**: All write operations logged with timestamps and context
- **Caching**: In-memory TTL-based caching (configurable by resource type)
- **Pagination**: All list operations support pagination
- **Retry Logic**: Exponential backoff with rate limit handling
- **Validation**: Runtime validation with Zod schemas

## Quick Start

### 1. Add to your MCP configuration

```json
{
  "mcpServers": {
    "factorial": {
      "command": "npx",
      "args": ["-y", "@t4dhg/mcp-factorial"]
    }
  }
}
```

### 2. Set your API key

Create a `.env` file in your project root:

```env
FACTORIAL_API_KEY=your-api-key-here
```

Or pass it directly in the MCP config:

```json
{
  "mcpServers": {
    "factorial": {
      "command": "npx",
      "args": ["-y", "@t4dhg/mcp-factorial"],
      "env": {
        "FACTORIAL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Start using it!

Once configured, ask Claude things like:

- _"Who's on the Engineering team?"_
- _"Create a new employee John Smith"_
- _"Approve the pending time off request for employee 42"_
- _"Create a new project called Q1 Marketing Campaign"_
- _"Enroll Sarah in the Leadership Training program"_
- _"Show me all open job postings"_
- _"What candidates applied for the Senior Developer position?"_

## Getting an API Key

You'll need a FactorialHR API key to use this MCP server. Here's how to get one:

1. Log in to [FactorialHR](https://app.factorialhr.com) as an administrator
2. Go to [**Settings → API keys**](https://app.factorialhr.com/settings/api-keys)
3. Click the **"New API key"** button
4. Give your key a descriptive name (e.g., "Claude Code" or "MCP Server")
5. Click **Create** - your API key will be displayed
6. **Copy the key immediately** - it's only shown once and cannot be retrieved later
7. Add the key to your `.env` file or MCP configuration

> **Important**: API keys have full access to your FactorialHR data and never expire. Store them securely, never commit them to version control, and rotate them periodically.

## OAuth2 Setup (For Document Downloads)

Document download actions (`download_payslips`, `download`) require OAuth2 authentication. API key authentication cannot access the download endpoints.

> **Note**: You need admin access in Factorial to create OAuth applications.

### Step 1: Create an OAuth2 Application

1. Go to: **https://api.factorialhr.com/oauth/applications**
2. Click **"New application"**
3. Fill in:
   - **Redirect URI**: `http://localhost:8080/callback` (or any URL you can access)
   - **Confidentiality**: Yes (server application)
   - **Scopes**: Select the scopes you need:
     - **Required for downloads**: Documents, Employees
     - **Recommended for full MCP functionality**: Contracts, Payroll, Payroll supplements, Time off, Shift management, Trainings, Recruitment, Company locations, Job catalog
4. Save and note your **Client ID** and **Client Secret**

### Step 2: Get Authorization Code

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://api.factorialhr.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/callback&response_type=code
```

- Log in and authorize the app
- You'll be redirected to your callback URL with `?code=AUTHORIZATION_CODE`
- Copy that code from the URL (it expires quickly, so proceed to step 3 immediately)

### Step 3: Exchange Code for Tokens

Run this curl command (replace placeholders):

```bash
curl -X POST 'https://api.factorialhr.com/oauth/token' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET' \
  -d 'code=AUTHORIZATION_CODE' \
  -d 'grant_type=authorization_code' \
  -d 'redirect_uri=http://localhost:8080/callback'
```

You'll get a response with `access_token` and `refresh_token`. Save the **refresh_token**.

### Step 4: Configure MCP Server

Add OAuth2 credentials to your MCP configuration:

```json
{
  "mcpServers": {
    "factorial": {
      "command": "npx",
      "args": ["-y", "@t4dhg/mcp-factorial"],
      "env": {
        "FACTORIAL_API_KEY": "your-api-key",
        "FACTORIAL_OAUTH_CLIENT_ID": "your-client-id",
        "FACTORIAL_OAUTH_CLIENT_SECRET": "your-client-secret",
        "FACTORIAL_OAUTH_REFRESH_TOKEN": "your-refresh-token"
      }
    }
  }
}
```

Or add to your `.env` file:

```env
FACTORIAL_API_KEY=your-api-key
FACTORIAL_OAUTH_CLIENT_ID=your-client-id
FACTORIAL_OAUTH_CLIENT_SECRET=your-client-secret
FACTORIAL_OAUTH_REFRESH_TOKEN=your-refresh-token
```

### Important Notes

- **Refresh tokens expire after 1 week** - you'll need to repeat steps 2-3 if it expires
- The MCP server automatically refreshes access tokens using the refresh token
- If document downloads suddenly stop working, your refresh token has likely expired

## Use Cases

### For Managers

- Create and manage team structures
- Approve or reject time off requests
- Assign employees to projects
- Track project time records
- Monitor training enrollments

### For HR

- Onboard new employees with full data entry
- Manage job postings and recruiting pipeline
- Track candidate applications through hiring stages
- Generate org structure analysis
- Manage training programs and enrollments

### For Developers

- Build AI workflows that need employee context
- Create custom Claude integrations
- Automate HR processes with AI assistance
- Generate reports and analytics

## Configuration Options

| Environment Variable            | Description                          | Default      |
| ------------------------------- | ------------------------------------ | ------------ |
| `FACTORIAL_API_KEY`             | Your FactorialHR API key             | Required     |
| `FACTORIAL_API_VERSION`         | API version                          | `2025-10-01` |
| `FACTORIAL_TIMEOUT_MS`          | Request timeout (ms)                 | `30000`      |
| `FACTORIAL_MAX_RETRIES`         | Max retry attempts                   | `3`          |
| `DEBUG`                         | Enable debug logging                 | `false`      |
| `FACTORIAL_OAUTH_CLIENT_ID`     | OAuth2 client ID (for downloads)     | -            |
| `FACTORIAL_OAUTH_CLIENT_SECRET` | OAuth2 client secret (for downloads) | -            |
| `FACTORIAL_OAUTH_REFRESH_TOKEN` | OAuth2 refresh token (for downloads) | -            |

## Safety & Security

### High-Risk Operations

The following operations are marked as high-risk and require explicit confirmation (`confirm: true`):

- `factorial_employees({ action: 'terminate' })` - Terminates an employee
- `factorial_teams({ action: 'delete' })` - Permanently deletes a team
- `factorial_locations({ action: 'delete' })` - Permanently deletes a location
- `factorial_projects({ action: 'delete' })` - Permanently deletes a project
- `factorial_ats({ action: 'delete_candidate' })` - Permanently deletes a candidate

### Read-Only Categories

Some categories are intentionally read-only for security:

- **Payroll**: Supplements, tax identifiers, family situations
- **Documents**: Folder and document metadata (download tools available for payslips and documents)
- **Contracts**: Historical contract data

### Response Optimization

Document and contract list operations return **summary format** by default to prevent token overflow:

**Documents** (`factorial_documents({ action: 'list' })`):

- Returns: `id`, `name`, `folder_id`, `employee_id`, `mime_type` (5 fields)
- Default limit: 100 documents per page
- For full details: Use `factorial_documents({ action: 'get', id: X })` for complete metadata

**Contracts** (`factorial_contracts({ action: 'list' })`):

- Returns: `id`, `employee_id`, `job_title`, `effective_on` (4 fields)
- Default limit: 100 contracts per page

All list operations accept `page` and `limit` parameters for pagination control.

### Audit Logging

All write operations (create, update, delete, approve, reject) are logged with:

- Timestamp
- Operation type
- Entity type and ID
- Changes made

## Development

```bash
# Clone the repository
git clone https://github.com/t4dhg/mcp-factorial.git
cd mcp-factorial

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format

# Run locally
FACTORIAL_API_KEY=your-key npm start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector
```

### Project Structure

The codebase is organized into domain-based modules for maintainability:

```
src/
├── schemas/           # Zod schemas by domain
│   ├── employees.ts   # Employee, Team, Location, Contract schemas
│   ├── time-off.ts    # Leave, LeaveType, Allowance, Shift schemas
│   ├── projects.ts    # Project, Task, Worker, TimeRecord schemas
│   ├── training.ts    # Training, Session, Membership schemas
│   ├── ats.ts         # JobPosting, Candidate, Application schemas
│   └── ...
├── api/               # API functions by domain
│   ├── employees.ts   # listEmployees, getEmployee, createEmployee, etc.
│   ├── time-off.ts    # listLeaves, createLeave, approveLeave, etc.
│   ├── projects.ts    # listProjects, createProject, etc.
│   └── ...
├── tools/             # MCP tool registrations by domain
│   ├── employees.ts   # factorial_employees tool registration
│   ├── time-off.ts    # factorial_time_off tool registration
│   ├── index.ts       # Server setup, discovery tool, resources, prompts
│   └── ...
├── index.ts           # Entry point (re-exports from tools/)
├── api.ts             # Re-exports from api/
└── schemas.ts         # Re-exports from schemas/
```

**Adding a new feature:**

1. Add schemas to `src/schemas/{domain}.ts`
2. Add API functions to `src/api/{domain}.ts`
3. Add tool actions to `src/tools/{domain}.ts`
4. Update `src/schemas/index.ts`, `src/api/index.ts` exports if needed
5. Run `npm test` to verify

## Troubleshooting

### API Key Not Working

- Ensure the API key has appropriate permissions
- Check if the key has been revoked or expired
- Verify the key is set correctly in environment variables

### Rate Limiting

The server implements exponential backoff for rate limits. If you're hitting limits frequently:

- Reduce request frequency
- Use pagination with smaller page sizes
- Enable caching by avoiding cache-busting parameters

### Missing Data

- **`hired_on` field**: The FactorialHR API may not populate this for all employees
- **Team membership**: Some employees may not be assigned to teams
- **Empty responses**: Check if the resource exists in your Factorial account

### Document Downloads Not Working

Document downloads require OAuth2 authentication (API keys cannot access download endpoints). If you see an error like:

> "Document download requires OAuth2 authentication"

You need to set up OAuth2 credentials. See [OAuth2 Setup](#oauth2-setup-for-document-downloads) above.

**Important**: OAuth2 refresh tokens expire after 1 week. If downloads suddenly stop working, re-authorize and get a new refresh token.

### "Document with ID X not found" Error

The Factorial API's individual document endpoint (`GET /documents/{id}`) has limitations accessing employee-specific documents. This happens because:

1. `list_documents` with `employee_ids` filter correctly returns all employee documents
2. `get_document` by ID cannot access those same documents individually

**Workaround**: Use `download_payslips` action instead of `download` action. The `download_payslips` action uses the document metadata from the list operation directly, bypassing the problematic individual GET endpoint:

```typescript
// This works - uses document list internally
factorial_documents({
  action: 'download_payslips',
  employee_id: 123,
  output_dir: '/path/to/downloads',
});
```

## FAQ

**Q: Does this expose salary/payroll data?**
A: Payroll data (supplements, tax identifiers, family situations) is available read-only. No write operations for payroll are supported.

**Q: Can Claude modify data in Factorial?**
A: Yes! Full CRUD operations are available for employees, teams, locations, time off, projects, training, and recruiting. High-risk operations are clearly marked.

**Q: How is data cached?**
A: Data is cached in-memory with TTLs: employees (5 min), teams (10 min), locations (15 min), contracts (3 min).

**Q: What FactorialHR API version is used?**
A: Version `2025-10-01` by default. Override with `FACTORIAL_API_VERSION` environment variable.

**Q: Are write operations logged?**
A: Yes, all write operations are logged via the audit module for compliance and debugging.

## Factorial API Quirks and Limitations

The FactorialHR API has some design patterns that differ from typical REST APIs. This MCP server handles these automatically, but understanding them helps when debugging or extending:

### Data Location Quirks

| Data                    | Expected Location                  | Actual Location                                          | Impact                                         |
| ----------------------- | ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| **Team membership**     | On Employee object (`team_ids`)    | On Team object (`employee_ids`)                          | Use `list_teams` to find an employee's teams   |
| **Job role assignment** | On Employee object (`job_role_id`) | In Contract object (`job_catalog_role_id`)               | Use `get_employee_with_contract` for role info |
| **Salary information**  | On Employee object                 | In Contract object (`salary_amount`, `salary_frequency`) | Use `get_employee_with_contract` for salary    |
| **Job title**           | On Employee object                 | In Contract object (`job_title`)                         | May be null if not set in Factorial            |

### Endpoint Quirks

| Endpoint                       | Quirk                                               | Workaround                                     |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| `GET /employees/{id}`          | May return 404 for valid employees                  | Server falls back to listing all and filtering |
| `GET /documents/{id}`          | May return 404 for employee-specific documents      | Use `download_payslips` which bypasses this    |
| `GET /contracts?employee_id=X` | Filtering unreliable                                | Server fetches all and filters client-side     |
| Empty results                  | Returns `{"errors": null}` instead of `{"data": []} | Server handles both formats                    |
| Document download URLs         | Requires OAuth2 (API key auth does not work)        | Configure OAuth2 credentials for downloads     |

### Field Availability

Some fields may be null even when you expect data:

- **`job_title`**: Only populated if set in employee's contract
- **`manager_id`**: Only populated if reporting structure is configured
- **`seniority_calculation_date`**: Use this instead of the non-existent `hired_on` field
- **Document metadata** (`name`, `mime_type`, `size_bytes`): May be null for some documents

### Salary Data

Salary information is available in the **Contract** entity, not the Employee entity:

```
salary_amount: number (in cents, e.g., 7000000 = €70,000)
salary_frequency: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly'
```

Use `get_employee_with_contract` to retrieve employee data with their latest salary information.

### Best Practices

1. **To get an employee's job role**: Use `get_employee_with_contract` instead of `get_employee`
2. **To find employees by role**: Use `list_employees_by_job_role` with a job role ID
3. **To find an employee's teams**: Query `list_teams` and check `employee_ids` arrays
4. **For salary data**: Always use contract endpoints, not employee endpoints

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © [Taig Mac Carthy](https://taigmaccarthy.com/)

---

_Built with the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic_
