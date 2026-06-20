/**
 * Shared utilities for function calling (FC) message expansion.
 *
 * ChatConversationComponent needs to expand assistant messages
 * with toolCalls into the [assistant(tool_calls), tool(result), ...] format
 * expected by the OpenAI Chat Completions spec. This module centralises that
 * logic to avoid duplication.
 */

import type { ToolSchema } from "../types/types";

/**
 * Build a filtered array of enabled tool schemas from built-in tools.
 * Used by ChatConversationComponent.
 */
export function buildToolSchemas(
  builtInTools: ToolSchema[],
  disabledTools: Set<string>,
): ToolSchema[] {
  return builtInTools.filter((tool) => !disabledTools.has(tool.name));
}
