# Security Policy

## Supported versions

Security fixes are released for the latest published version of `@t4dhg/mcp-factorial`. Older versions are not patched; please upgrade before reporting.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/t4dhg/mcp-factorial/security/advisories/new). That opens a private thread and lets the fix and the advisory be published together.

If you cannot use GitHub Security Advisories, open a regular issue that says only that you have a security report and asks for a private channel. Do not include details in a public issue.

Useful things to include:

- The affected file and line, and the version or commit you looked at
- What an attacker can do, and what they need in order to do it
- A minimal reproduction, if you have one

What to expect:

- Acknowledgement within a few days
- An assessment of the report, including where we disagree and why
- Coordination with you on disclosure timing, and credit by name in the advisory and changelog unless you prefer otherwise

## Scope

This project is an MCP server that talks to the FactorialHR API on behalf of whoever runs it. The following are in scope:

- Operations that change or delete Factorial data without the confirmation the tool schema advertises
- Anything that causes the server to read or write files outside a path the caller asked for
- Leaking API keys, OAuth tokens, or employee data into logs, error messages, or tool responses
- Flaws in the OAuth2 token handling used for document downloads

Out of scope:

- Vulnerabilities in the FactorialHR API itself. Report those to Factorial.
- The server acting on instructions from whoever controls the MCP client. The client is trusted by design; run this server only with a client and a Factorial API key you control.
- The in-memory audit log not being durable. This is documented behaviour, not a defect. See [Audit Logging](README.md#audit-logging).

## Operational notes

- The API key grants whatever the Factorial API grants it. Scope it to the least you need, keep it in `.env` or your MCP client's `env` block, and never commit it.
- Write operations are real and, for deletes, irreversible. Confirmation gating reduces accidents; it is not an authorization boundary.
