/**
 * Pure state updater functions for tool call → messages integration.
 *
 * Extracted from ChatConversationComponent to enable isolated unit testing.
 * These functions compute the next `messages` array given the current
 * messages and an incoming tool execution / tool call event.
 *
 * All three public updaters delegate to a single `mergeToolEvent` helper so
 * the streaming/calling upsert and done/error matching rules live in exactly
 * one place.
 */

import type { ToolCallEvent, ContentSegment } from "../types/types";
import { MESSAGE_ROLES, EXECUTION_STATUS } from "../constants";

// --- Shared message shape (subset of ClientMessage) -------------
export interface ToolMessageSlice {
  role: string;
  content?: string;
  toolCalls?: ToolCallEvent[];
  contentSegments?: ContentSegment[];
  textFragments?: string[];
  thinkingFragments?: string[];
}

// --- Input for tool execution events (from SSE data.tool) --------
export interface ToolExecutionInput {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: string; // "streaming" | "calling" | "done" | "error"
  durationMs?: number;
  timestamp?: number;
}

// --- Snapshot helpers passed from the streaming closure ----------
export interface SegmentSnapshot {
  contentSegments: ContentSegment[];
  textFragments: string[];
  thinkingFragments: string[];
}

/** Statuses in which a tool call is still in flight and may receive a result. */
const IN_FLIGHT_STATUSES = new Set<string>([
  EXECUTION_STATUS.STREAMING,
  EXECUTION_STATUS.CALLING,
]);

const hasArgs = (args?: Record<string, unknown>): args is Record<string, unknown> =>
  !!args && Object.keys(args).length > 0;

/**
 * Merge a tool event into a tool-call list. Pure.
 *
 * streaming/calling → upsert by id, with change-detection so repeated
 * identical deltas return the SAME array reference (callers can use this
 * to skip state updates).
 *
 * done/error → update the entry matched by id; when the event carries no
 * id, fall back to the first in-flight entry (streaming OR calling) with
 * the same name — a tool may complete straight from `streaming`.
 */
function mergeToolEvent(
  currentToolCalls: ToolCallEvent[],
  resolvedId: string,
  toolInput: ToolExecutionInput,
): ToolCallEvent[] {
  if (IN_FLIGHT_STATUSES.has(toolInput.status)) {
    const existingTool = currentToolCalls.find((toolCall) => toolCall.id === resolvedId);
    if (existingTool) {
      const hasArgsChange = hasArgs(toolInput.args) &&
                            JSON.stringify(existingTool.args || {}) !== JSON.stringify(toolInput.args);
      const hasStatusChange = existingTool.status !== toolInput.status;
      if (!hasArgsChange && !hasStatusChange) return currentToolCalls;
      return currentToolCalls.map((toolCall) =>
        toolCall.id === resolvedId
          ? {
              ...toolCall,
              status: toolInput.status,
              ...(hasArgs(toolInput.args) ? { args: toolInput.args } : {}),
            }
          : toolCall,
      );
    }
    return [
      ...currentToolCalls,
      {
        id: resolvedId,
        name: toolInput.name || "unknown",
        args: toolInput.args || {},
        status: toolInput.status,
        timestamp: toolInput.timestamp || Date.now(),
      },
    ];
  }

  // done / error — update the matching entry. Match at most one entry when
  // falling back to name matching, so parallel same-name calls don't all
  // get stamped with one result.
  let nameFallbackUsed = false;
  return currentToolCalls.map((toolCall) => {
    const matchesById = !!toolInput.id && toolCall.id === toolInput.id;
    const matchesByName =
      !toolInput.id &&
      !nameFallbackUsed &&
      toolCall.name === (toolInput.name || "unknown") &&
      IN_FLIGHT_STATUSES.has(toolCall.status || "");
    if (!matchesById && !matchesByName) return toolCall;
    if (matchesByName) nameFallbackUsed = true;
    return {
      ...toolCall,
      status: toolInput.status,
      result: toolInput.result,
      ...(hasArgs(toolInput.args) ? { args: toolInput.args } : { args: toolCall.args || {} }),
      durationMs:
        toolInput.durationMs ||
        (toolCall.timestamp ? Date.now() - toolCall.timestamp : undefined),
    };
  });
}

/**
 * Attach an updated tool-call list to the trailing assistant message,
 * creating a placeholder assistant message when tool events arrive before
 * any text chunks. Pure.
 */
function attachToolCallsToMessages(
  messages: ToolMessageSlice[],
  updatedToolCalls: ToolCallEvent[],
  snapshot: SegmentSnapshot,
): ToolMessageSlice[] {
  const array = [...messages];
  const last = array[array.length - 1];

  if (last?.role === "assistant") {
    array[array.length - 1] = {
      ...last,
      toolCalls: updatedToolCalls,
      contentSegments: snapshot.contentSegments,
      textFragments: snapshot.textFragments,
      thinkingFragments: snapshot.thinkingFragments,
    };
  } else {
    // Tool events can arrive before any text chunks — create placeholder
    array.push({
      role: MESSAGE_ROLES.ASSISTANT,
      content: "",
      toolCalls: updatedToolCalls,
      contentSegments: snapshot.contentSegments,
      textFragments: snapshot.textFragments,
      thinkingFragments: snapshot.thinkingFragments,
    });
  }

  return array;
}

/**
 * Compute the next messages array after a tool execution event.
 *
 * This is a **pure function**: it does not mutate inputs and returns
 * a new array.  It mirrors the inline logic that was previously nested
 * inside `setToolActivity → setMessages` in ChatConversationComponent.
 */
export function applyToolExecutionToMessages(
  messages: ToolMessageSlice[],
  resolvedId: string,
  toolInput: ToolExecutionInput,
  snapshot: SegmentSnapshot,
): ToolMessageSlice[] {
  const last = messages[messages.length - 1];
  const currentToolCalls: ToolCallEvent[] =
    last?.role === "assistant" ? last.toolCalls || [] : [];
  const updatedToolCalls = mergeToolEvent(currentToolCalls, resolvedId, toolInput);
  return attachToolCallsToMessages(messages, updatedToolCalls, snapshot);
}

/**
 * Compute the next toolActivity array after a tool execution event.
 *
 * Pure function — returns the updated activity list.
 * Returns `null` when the event is a duplicate (no update needed).
 */
export function applyToolExecutionToActivity(
  previousToolActivity: ToolCallEvent[],
  resolvedId: string,
  toolInput: ToolExecutionInput,
): ToolCallEvent[] | null {
  const updated = mergeToolEvent(previousToolActivity, resolvedId, toolInput);
  return updated === previousToolActivity ? null : updated;
}

/**
 * Compute the next messages array after a native MCP tool call event.
 *
 * Similar to `applyToolExecutionToMessages` but uses the ToolCallEvent
 * shape directly (onToolCall path — LM Studio MCP).
 */
export function applyToolCallToMessages(
  messages: ToolMessageSlice[],
  resolvedId: string,
  toolData: ToolCallEvent,
  snapshot: SegmentSnapshot,
): ToolMessageSlice[] {
  return applyToolExecutionToMessages(
    messages,
    resolvedId,
    {
      id: toolData.id,
      name: toolData.name,
      args: toolData.args,
      result: toolData.result,
      status: toolData.status || "",
      durationMs: toolData.durationMs,
    },
    snapshot,
  );
}
