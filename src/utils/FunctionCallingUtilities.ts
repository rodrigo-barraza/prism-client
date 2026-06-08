/**
 * Shared utilities for function calling (FC) message expansion.
 *
 * ChatSessionComponent needs to expand assistant messages
 * with toolCalls into the [assistant(tool_calls), tool(result), ...] format
 * expected by the OpenAI Chat Completions spec. This module centralises that
 * logic to avoid duplication.
 */

import type { ToolSchema } from "../types/types";

/**
 * Sanitize a tool name for LLM function calling APIs.
 * Google's function calling API requires names to be alphanumeric + _ . : -
 * starting with a letter or underscore, max 128 chars.
 */
export function sanitizeToolName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_.:/-]/g, "_")
    .replace(/^[^a-zA-Z_]/, "_$&")
    .slice(0, 128);
}

/**
 * Build a filtered array of enabled tool schemas from built-in tools.
 * Used by ChatSessionComponent.
 */
export function buildToolSchemas(
  builtInTools: ToolSchema[],
  disabledTools: Set<string>,
): ToolSchema[] {
  return builtInTools.filter((tool) => !disabledTools.has(tool.name));
}
