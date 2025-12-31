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

- **Comprehensive Coverage**: 85+ tools spanning employees, teams, time off, attendance, projects, training, recruiting (ATS), and payroll
- **Full CRUD Operations**: Create, read, update, and delete across all major entities
- **Safety Guardrails**: High-risk operations require explicit confirmation
- **Audit Logging**: All write operations are logged for compliance
- **Enterprise Ready**: Built for companies who need AI integration with proper controls

## Features

### 85+ Tools

| Category        | Tools | Operations                                                              |
| --------------- | ----- | ----------------------------------------------------------------------- |
| **Employees**   | 6     | List, get, search, create, update, terminate                            |
| **Teams**       | 5     | List, get, create, update, delete                                       |
| **Locations**   | 5     | List, get, create, update, delete                                       |
| **Time Off**    | 10    | List leaves/types/allowances, create, update, cancel, approve, reject   |
| **Attendance**  | 5     | List shifts, create, update, delete                                     |
| **Projects**    | 17    | Full CRUD for projects, tasks, workers, time records                    |
| **Training**    | 14    | Full CRUD for trainings, sessions, enrollments                          |
| **Work Areas**  | 6     | List, get, create, update, archive, unarchive                           |
| **ATS**         | 16    | Job postings, candidates, applications, hiring stages, advance workflow |
| **Payroll**     | 6     | List/get supplements, tax identifiers, family situations (read-only)    |
| **Documents**   | 5     | List/get/search folders and documents (read-only)                       |
| **Job Catalog** | 3     | List/get job roles and levels (read-only)                               |
| **Contracts**   | 4     | Get contracts, employee with contract, by job role/level (read-only)    |

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

| Environment Variable    | Description              | Default      |
| ----------------------- | ------------------------ | ------------ |
| `FACTORIAL_API_KEY`     | Your FactorialHR API key | Required     |
| `FACTORIAL_API_VERSION` | API version              | `2025-10-01` |
| `FACTORIAL_TIMEOUT_MS`  | Request timeout (ms)     | `30000`      |
| `FACTORIAL_MAX_RETRIES` | Max retry attempts       | `3`          |
| `DEBUG`                 | Enable debug logging     | `false`      |

## Safety & Security

### High-Risk Operations

The following operations are marked as high-risk and should be used with care:

- `terminate_employee` - Terminates an employee (sets termination date)
- `delete_team` - Permanently deletes a team
- `delete_location` - Permanently deletes a location
- `delete_project` - Permanently deletes a project
- `delete_candidate` - Permanently deletes a candidate

### Read-Only Categories

Some categories are intentionally read-only for security:

- **Payroll**: Supplements, tax identifiers, family situations
- **Documents**: Folder and document metadata only
- **Contracts**: Historical contract data

### Response Optimization for Employee Collections

Employee collection tools (`get_employee_documents`, `get_employee_contracts`) return **summary format** by default to prevent token overflow:

**Documents** (`get_employee_documents`):

- Returns: `id`, `name`, `folder_id`, `employee_id`, `author_id`, `mime_type`, `size_bytes` (7 fields)
- Default limit: 20 documents per page
- For full details: Use `get_document(id)` to retrieve complete document metadata including `file_url`, timestamps, etc.

**Contracts** (`get_employee_contracts`):

- Returns: `id`, `employee_id`, `job_title`, `effective_on` (4 fields)
- Default limit: 20 contracts per page
- For full details: Timestamps (`created_at`, `updated_at`) excluded from summary

Both tools accept `page` and `limit` parameters (max: 100) for pagination control.

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

| Endpoint                       | Quirk                                                | Workaround                                     |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------- |
| `GET /employees/{id}`          | May return 404 for valid employees                   | Server falls back to listing all and filtering |
| `GET /documents/{id}`          | May return 404 for valid documents                   | Server falls back to listing all and filtering |
| `GET /contracts?employee_id=X` | Filtering unreliable                                 | Server fetches all and filters client-side     |
| Empty results                  | Returns `{"errors": null}` instead of `{"data": []}` | Server handles both formats                    |

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
