#!/usr/bin/env node

/**
 * MCP Server for FactorialHR - Hierarchical Tool Discovery
 *
 * v8.0.0 introduces hierarchical tool discovery to reduce context usage.
 * Instead of 117 individual tools, we now have 14 category-based tools.
 *
 * This file re-exports from the modular src/tools/ directory.
 * All tools, resources, and prompts are now organized by domain.
 */

export * from './tools/index.js';
