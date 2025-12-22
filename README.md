# MCP FactorialHR

> **Secure, privacy-focused access to FactorialHR data for AI assistants**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)

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

## Available Tools

| Tool | Description |
|------|-------------|
| `list_employees` | Get all employees with optional team/location filters |
| `get_employee` | Get employee details (name, role, contact, team assignments) |
| `search_employees` | Search employees by name or email |
| `list_teams` | View organizational team structure |
| `get_team` | Get team details and member list |
| `list_locations` | Get company office locations |
| `get_location` | Get location details (address, contact info) |
| `get_employee_contracts` | View job titles and employment dates |

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

- *"Who's on the Engineering team?"*
- *"Find the email for John Smith"*
- *"What offices do we have?"*
- *"Show me the org structure"*

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
- Find employees by skill or department

### For HR
- Power AI-assisted employee directory searches
- Streamline onboarding information lookups
- Support with organizational queries

### For Developers
- Build AI workflows that need employee context
- Create custom Claude integrations
- Automate org-chart-aware processes

## Development

```bash
# Clone the repository
git clone https://github.com/t4dhg/mcp-factorial.git
cd mcp-factorial

# Install dependencies
npm install

# Build
npm run build

# Run locally
FACTORIAL_API_KEY=your-key npm start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector
```

## Configuration Options

| Environment Variable | Description | Required |
|---------------------|-------------|----------|
| `FACTORIAL_API_KEY` | Your FactorialHR API key | Yes |
| `DEBUG` | Enable debug logging (`true`/`false`) | No |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [t4dhg](https://github.com/t4dhg)

---

*Built with the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic*
