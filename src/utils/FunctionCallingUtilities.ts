/**
 * Shared utilities for function calling (FC) message expansion.
 *
 * ChatSessionComponent needs to expand assistant messages
 * with toolCalls into the [assistant(tool_calls), tool(result), ...] format
 * expected by the OpenAI Chat Completions spec. This module centralises that
 * logic to avoid duplication.
 */

import type { ToolSchema, CustomTool } from "../types/types";

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
 * Build a merged array of tool schemas from built-in and custom tools.
 * Used by ChatSessionComponent.
 */
export function buildToolSchemas(
  builtInTools: ToolSchema[],
  disabledTools: Set<string>,
  customTools: CustomTool[],
): ToolSchema[] {
  const builtIn = builtInTools.filter((t) => !disabledTools.has(t.name));
  const custom: ToolSchema[] = customTools
    .filter((t) => t.enabled)
    .map((t) => ({
      name: sanitizeToolName(t.name),
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(
          (t.parameters || []).map((p) => [
            p.name,
            {
              type: p.type || "string",
              description: p.description || "",
              ...(p.enum?.length ? { enum: p.enum } : {}),
            },
          ]),
        ),
        required: (t.parameters || [])
          .filter((p) => p.required)
          .map((p) => p.name),
      },
    }));
  return [...builtIn, ...custom];
}
