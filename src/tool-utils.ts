/**
 * Tool utilities for MCP FactorialHR
 *
 * Provides helper functions for consistent tool handler implementation.
 */

import { getOperationPolicy, getWarningMessage } from './write-safety.js';

/**
 * Text content item in a tool response
 */
interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Tool response structure matching MCP SDK expectations
 */
interface ToolResult {
  [x: string]: unknown;
  content: TextContent[];
  isError?: boolean;
}

/**
 * Format an error into a consistent tool error response
 */
export function formatToolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Create a successful text response
 */
export function textResponse(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Wrap a tool handler with consistent error handling
 *
 * @param handler - The async handler function
 * @returns A wrapped handler that catches errors and formats them consistently
 */
export function wrapToolHandler<T>(
  handler: (args: T) => Promise<ToolResult>
): (args: T) => Promise<ToolResult> {
  return async (args: T) => {
    try {
      return await handler(args);
    } catch (error) {
      return formatToolError(error);
    }
  };
}

/**
 * Arguments for high-risk operations that require confirmation
 */
export interface ConfirmableArgs {
  confirm?: boolean;
}

/**
 * Wrap a high-risk tool handler with confirmation requirement
 *
 * @param operationName - The operation name (e.g., 'delete_team') for policy lookup
 * @param handler - The async handler function
 * @returns A wrapped handler that requires confirmation for high-risk operations
 */
export function wrapHighRiskToolHandler<T extends ConfirmableArgs>(
  operationName: string,
  handler: (args: T) => Promise<ToolResult>
): (args: T) => Promise<ToolResult> {
  return wrapToolHandler(async (args: T) => {
    const policy = getOperationPolicy(operationName);

    if (policy.requiresConfirmation && !args.confirm) {
      const warning = getWarningMessage(operationName);
      return textResponse(`${warning}\n\nTo proceed, call this tool again with \`confirm: true\`.`);
    }

    return handler(args);
  });
}

/**
 * Format JSON data for display in a tool response
 */
export function formatJson(data: unknown, prefix?: string): string {
  const json = JSON.stringify(data, null, 2);
  return prefix ? `${prefix}\n\n${json}` : json;
}

/**
 * Format a list result with pagination info
 */
export function formatListResult(
  items: unknown[],
  entityName: string,
  paginationInfo: string
): string {
  return `Found ${items.length} ${entityName}${items.length !== 1 ? 's' : ''} (${paginationInfo}):\n\n${JSON.stringify(items, null, 2)}`;
}
