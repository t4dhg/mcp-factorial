# MCP FactorialHR

> **Secure, privacy-focused access to FactorialHR data for AI assistants**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/@t4dhg/mcp-factorial.svg)](https://www.npmjs.com/package/@t4dhg/mcp-factorial)

A Model Context Protocol (MCP) server that provides AI assistants like Claude with secure, read-only access to your FactorialHR employee and organizational data. Built with privacy and security as core principles.

## Why This MCP Server?

- **Privacy-First Design**: Deliberately excludes payroll, compensation, and sensitive financial data. Your salary information stays private.
- **Read-Only Access**: No write operations - Claude can view but never modify your HR data.
- **Organizational Focus**: Optimized for team structure, employee directories, and location lookups - the data you actually need for AI-assisted workflows.
- **Enterprise Ready**: Built for companies who need AI integration without compromising data security.

## Security by Design

This MCP server intentionally **does NOT expose**:

- Payroll and salary information
- Bank account details
- Tax documents
- Compensation packages
- Benefits enrollment data
- Personal identification numbers

We believe AI assistants should help with organizational tasks without having access to your most sensitive HR data.

## Features

### 22 Tools

| Category        | Tool                     | Description                                                      |
| --------------- | ------------------------ | ---------------------------------------------------------------- |
| **Employees**   | `list_employees`         | Get employees with optional team/location filters and pagination |
|                 | `get_employee`           | Get detailed information about a specific employee               |
|                 | `search_employees`       | Search employees by name or email                                |
| **Teams**       | `list_teams`             | View organizational team structure                               |
|                 | `get_team`               | Get team details and member list                                 |
| **Locations**   | `list_locations`         | Get company office locations                                     |
|                 | `get_location`           | Get location details (address, contact info)                     |
| **Contracts**   | `get_employee_contracts` | View job titles and contract effective dates                     |
| **Time Off**    | `list_leaves`            | List time off requests with filters                              |
|                 | `get_leave`              | Get leave request details                                        |
|                 | `list_leave_types`       | Get all leave types (vacation, sick, etc.)                       |
|                 | `get_leave_type`         | Get leave type details                                           |
|                 | `list_allowances`        | Get time off balances                                            |
| **Attendance**  | `list_shifts`            | List employee shifts                                             |
|                 | `get_shift`              | Get shift details                                                |
| **Documents**   | `list_folders`           | List document folders                                            |
|                 | `get_folder`             | Get folder details                                               |
|                 | `list_documents`         | List documents                                                   |
|                 | `get_document`           | Get document metadata                                            |
| **Job Catalog** | `list_job_roles`         | List job roles                                                   |
|                 | `get_job_role`           | Get job role details                                             |
|                 | `list_job_levels`        | List job levels                                                  |

### 5 MCP Resources

| Resource URI                      | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `factorial://org-chart`           | Complete organizational hierarchy (Markdown)       |
| `factorial://employees/directory` | Employee directory by team (Markdown)              |
| `factorial://locations/directory` | Location directory with employee counts (Markdown) |
| `factorial://timeoff/policies`    | All leave types and policies (JSON)                |
| `factorial://teams/{team_id}`     | Team details with member list (JSON, templated)    |

### 3 MCP Prompts

| Prompt                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `onboard-employee`      | Generate personalized onboarding checklists                       |
| `analyze-org-structure` | Analyze org structure (reporting lines, team sizes, distribution) |
| `timeoff-report`        | Generate time off reports by team or date range                   |

### Architecture Features

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
- _"Find the email for John Smith"_
- _"What offices do we have?"_
- _"Show me the org structure"_
- _"How much PTO does employee 42 have left?"_
- _"Generate an onboarding checklist for the new hire"_

## Getting an API Key

1. Log in to [FactorialHR](https://app.factorialhr.com) as an administrator
2. Navigate to **Settings → Integrations → API**
3. Generate a new API key
4. Add it to your `.env` file

> **Important**: API keys have full access to FactorialHR and never expire. Store them securely and rotate them periodically.

## Use Cases

### For Managers

- Quickly look up team member contact information
- Understand org chart and reporting structures
- Monitor time off schedules for coverage planning

### For HR

- Power AI-assisted employee directory searches
- Streamline onboarding information lookups
- Generate time off reports and analyze patterns

### For Developers

- Build AI workflows that need employee context
- Create custom Claude integrations
- Automate org-chart-aware processes

## Configuration Options

| Environment Variable    | Description              | Default      |
| ----------------------- | ------------------------ | ------------ |
| `FACTORIAL_API_KEY`     | Your FactorialHR API key | Required     |
| `FACTORIAL_API_VERSION` | API version              | `2025-10-01` |
| `FACTORIAL_TIMEOUT`     | Request timeout (ms)     | `30000`      |
| `FACTORIAL_MAX_RETRIES` | Max retry attempts       | `3`          |
| `DEBUG`                 | Enable debug logging     | `false`      |

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
A: No. This MCP server deliberately excludes all payroll, compensation, and financial data.

**Q: Can Claude modify data in Factorial?**
A: No. This is a read-only integration. No write operations are supported.

**Q: How is data cached?**
A: Data is cached in-memory with TTLs: employees (5 min), teams (10 min), locations (15 min), contracts (3 min).

**Q: What FactorialHR API version is used?**
A: Version `2025-10-01` by default. Override with `FACTORIAL_API_VERSION` environment variable.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © [Taig Mac Carthy](https://taigmaccarthy.com/)

---

_Built with the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic_
