# MCP FactorialHR

A Model Context Protocol (MCP) server for [FactorialHR](https://factorialhr.com/) that provides access to employee and organizational data from within Claude Code, Claude Desktop, and other MCP-compatible clients.

## Features

- **Employee Management**: List, search, and get detailed employee information
- **Team Organization**: View teams and their members
- **Location Data**: Access company location information
- **Contract Information**: Get employee contract details

## Available Tools

| Tool | Description |
|------|-------------|
| `list_employees` | Get all employees, optionally filtered by team or location |
| `get_employee` | Get detailed information about a specific employee |
| `search_employees` | Search employees by name or email |
| `list_teams` | Get all teams in the organization |
| `get_team` | Get detailed information about a specific team |
| `list_locations` | Get all company locations |
| `get_location` | Get detailed information about a specific location |
| `get_employee_contracts` | Get contract versions for an employee |

## Installation

### For Claude Code

Add to your `.mcp.json` file:

```json
{
  "mcpServers": {
    "factorial": {
      "command": "npx",
      "args": ["-y", "github:t4dhg/mcp-factorial"],
      "env": {
        "FACTORIAL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### For Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "factorial": {
      "command": "npx",
      "args": ["-y", "github:t4dhg/mcp-factorial"],
      "env": {
        "FACTORIAL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Getting an API Key

1. Log in to FactorialHR as an administrator
2. Go to Settings > Integrations > API
3. Generate a new API key
4. Copy the key and add it to your MCP configuration

> **Security Note**: API keys have full access to your FactorialHR data and never expire. Store them securely and never commit them to version control.

## Usage Examples

Once configured, you can ask Claude:

- "List all employees in the company"
- "Search for employees named John"
- "Show me the teams in the organization"
- "Get the details for employee ID 123"
- "What locations does the company have?"

## Development

```bash
# Clone the repository
git clone https://github.com/t4dhg/mcp-factorial.git
cd mcp-factorial

# Install dependencies
npm install

# Build
npm run build

# Run locally (for testing)
FACTORIAL_API_KEY=your-key-here npm start
```

## License

MIT
