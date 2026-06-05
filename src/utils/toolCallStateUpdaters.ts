/**
 * Pure state updater functions for tool call → messages integration.
 *
 * Extracted from ChatSessionComponent to enable isolated unit testing.
 * These functions compute the next `messages` array given the current
 * messages and an incoming tool execution / tool call event.
 */

import type { ToolCallEvent, ContentSegment } from "../types/types";

// ─── Shared message shape (subset of ClientMessage) ─────────────
export interface ToolMessageSlice {
  role: string;
  content?: string;
  toolCalls?: ToolCallEvent[];
  contentSegments?: ContentSegment[];
  textFragments?: string[];
  thinkingFragments?: string[];
}

// ─── Input for tool execution events (from SSE data.tool) ────────
export interface ToolExecutionInput {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: string; // "calling" | "done" | "error"
  durationMs?: number;
}

// ─── Snapshot helpers passed from the streaming closure ──────────
export interface SegmentSnapshot {
  contentSegments: ContentSegment[];
  textFragments: string[];
  thinkingFragments: string[];
}

/**
 * Compute the next messages array after a tool execution event.
 *
 * This is a **pure function**: it does not mutate inputs and returns
 * a new array.  It mirrors the inline logic that was previously nested
 * inside `setToolActivity → setMessages` in ChatSessionComponent.
 */
export function applyToolExecutionToMessages(
  messages: ToolMessageSlice[],
  resolvedId: string,
  toolInput: ToolExecutionInput,
  snapshot: SegmentSnapshot,
): ToolMessageSlice[] {
  const array = [...messages];
  const last = array[array.length - 1];

  const currentToolCalls: ToolCallEvent[] =
    last?.role === "assistant" ? last.toolCalls || [] : [];

  let updatedToolCalls: ToolCallEvent[];

  if (toolInput.status === "calling") {
    // Deduplicate: if this ID is already in the message, no-op
    if (currentToolCalls.some((tc) => tc.id === resolvedId)) {
      updatedToolCalls = currentToolCalls;
    } else {
      updatedToolCalls = [
        ...currentToolCalls,
        {
          id: resolvedId,
          name: toolInput.name || "unknown",
          args: toolInput.args || {},
          status: "calling",
          timestamp: Date.now(),
        },
      ];
    }
  } else {
    // done / error — update the matching entry
    updatedToolCalls = currentToolCalls.map((tc) => {
      if (
        (toolInput.id && tc.id === toolInput.id) ||
        (!toolInput.id &&
          tc.name === (toolInput.name || "unknown") &&
          tc.status === "calling")
      ) {
        return {
          ...tc,
          status: toolInput.status,
          result: toolInput.result,
          args: toolInput.args || {},
          durationMs: toolInput.durationMs || (tc.timestamp ? Date.now() - tc.timestamp : undefined),
        };
      }
      return tc;
    });
  }

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
      role: "assistant",
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
 * Compute the next toolActivity array after a tool execution event.
 *
 * Pure function — returns the updated activity list.
 * Returns `null` when the event is a duplicate (no update needed).
 */
export function applyToolExecutionToActivity(
  prev: ToolCallEvent[],
  resolvedId: string,
  toolInput: ToolExecutionInput,
): ToolCallEvent[] | null {
  if (toolInput.status === "calling") {
    // Deduplicate
    if (prev.some((a) => a.id === resolvedId)) {
      return null; // Signal: no change
    }
    return [
      ...prev,
      {
        id: resolvedId,
        name: toolInput.name || "unknown",
        args: toolInput.args || {},
        status: "calling",
        timestamp: Date.now(),
      },
    ];
  } else {
    return prev.map((activity) => {
      if (
        (toolInput.id && activity.id === toolInput.id) ||
        (!toolInput.id &&
          activity.name === (toolInput.name || "unknown") &&
          activity.status === "calling")
      ) {
        return {
          ...activity,
          status: toolInput.status,
          result: toolInput.result,
          args: toolInput.args || {},
          durationMs: toolInput.durationMs || (activity.timestamp ? Date.now() - activity.timestamp : undefined),
        };
      }
      return activity;
    });
  }
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
  const array = [...messages];
  const last = array[array.length - 1];

  const currentToolCalls: ToolCallEvent[] =
    last?.role === "assistant" ? last.toolCalls || [] : [];

  let updatedToolCalls: ToolCallEvent[];

  if (toolData.status === "calling") {
    if (currentToolCalls.some((tc) => tc.id === resolvedId)) {
      updatedToolCalls = currentToolCalls;
    } else {
      updatedToolCalls = [
        ...currentToolCalls,
        {
          id: resolvedId,
          name: toolData.name,
          args: toolData.args,
          status: "calling",
          timestamp: Date.now(),
        },
      ];
    }
  } else {
    updatedToolCalls = currentToolCalls.map((tc) => {
      if (
        (toolData.id && tc.id === toolData.id) ||
        (!toolData.id && tc.name === toolData.name && tc.status === "calling")
      ) {
        return {
          ...tc,
          status: toolData.status,
          result: toolData.result,
          ...(toolData.args && Object.keys(toolData.args).length > 0
            ? { args: toolData.args }
            : {}),
          durationMs: toolData.durationMs || (tc.timestamp ? Date.now() - tc.timestamp : undefined),
        };
      }
      return tc;
    });
  }

  if (last?.role === "assistant") {
    array[array.length - 1] = {
      ...last,
      toolCalls: updatedToolCalls,
      contentSegments: snapshot.contentSegments,
      textFragments: snapshot.textFragments,
      thinkingFragments: snapshot.thinkingFragments,
    };
  } else {
    array.push({
      role: "assistant",
      content: "",
      toolCalls: updatedToolCalls,
      contentSegments: snapshot.contentSegments,
      textFragments: snapshot.textFragments,
      thinkingFragments: snapshot.thinkingFragments,
    });
  }

  return array;
}
