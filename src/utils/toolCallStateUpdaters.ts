/**
 * Pure state updater functions for tool call → messages integration.
 *
 * Extracted from ChatConversationComponent to enable isolated unit testing.
 * These functions compute the next `messages` array given the current
 * messages and an incoming tool execution / tool call event.
 */

import type { ToolCallEvent, ContentSegment } from "../types/types";

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
  status: string; // "calling" | "done" | "error"
  durationMs?: number;
}

// --- Snapshot helpers passed from the streaming closure ----------
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
 * inside `setToolActivity → setMessages` in ChatConversationComponent.
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

  if (toolInput.status === "streaming" || toolInput.status === "calling") {
    const existingIndex = currentToolCalls.findIndex((toolCall) => toolCall.id === resolvedId);
    if (existingIndex >= 0) {
      const existingTool = currentToolCalls[existingIndex];
      const hasArgsChange = toolInput.args && Object.keys(toolInput.args).length > 0 &&
                            JSON.stringify(existingTool.args || {}) !== JSON.stringify(toolInput.args);
      const hasStatusChange = existingTool.status !== toolInput.status;

      if (hasArgsChange || hasStatusChange) {
        updatedToolCalls = currentToolCalls.map((toolCall) =>
          toolCall.id === resolvedId
            ? {
                ...toolCall,
                status: toolInput.status,
                ...(toolInput.args && Object.keys(toolInput.args).length > 0
                  ? { args: toolInput.args }
                  : {}),
              }
            : toolCall,
        );
      } else {
        updatedToolCalls = currentToolCalls;
      }
    } else {
      updatedToolCalls = [
        ...currentToolCalls,
        {
          id: resolvedId,
          name: toolInput.name || "unknown",
          args: toolInput.args || {},
          status: toolInput.status,
          timestamp: Date.now(),
        },
      ];
    }
  } else {
    // done / error — update the matching entry
    updatedToolCalls = currentToolCalls.map((toolCall) => {
      if (
        (toolInput.id && toolCall.id === toolInput.id) ||
        (!toolInput.id &&
          toolCall.name === (toolInput.name || "unknown") &&
          toolCall.status === "calling")
      ) {
        return {
          ...toolCall,
          status: toolInput.status,
          result: toolInput.result,
          args: toolInput.args || {},
          durationMs: toolInput.durationMs || (toolCall.timestamp ? Date.now() - toolCall.timestamp : undefined),
        };
      }
      return toolCall;
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
  if (toolInput.status === "streaming" || toolInput.status === "calling") {
    const existingIndex = prev.findIndex((activity) => activity.id === resolvedId);
    if (existingIndex >= 0) {
      const existingTool = prev[existingIndex];
      const hasArgsChange = toolInput.args && Object.keys(toolInput.args).length > 0 &&
                            JSON.stringify(existingTool.args || {}) !== JSON.stringify(toolInput.args);
      const hasStatusChange = existingTool.status !== toolInput.status;

      if (hasArgsChange || hasStatusChange) {
        return prev.map((activity) =>
          activity.id === resolvedId
            ? {
                ...activity,
                status: toolInput.status,
                ...(toolInput.args && Object.keys(toolInput.args).length > 0
                  ? { args: toolInput.args }
                  : {}),
              }
            : activity,
        );
      }
      return null; // Signal: no change
    }
    return [
      ...prev,
      {
        id: resolvedId,
        name: toolInput.name || "unknown",
        args: toolInput.args || {},
        status: toolInput.status,
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

  if (toolData.status === "streaming" || toolData.status === "calling") {
    const existingIndex = currentToolCalls.findIndex((toolCall) => toolCall.id === resolvedId);
    if (existingIndex >= 0) {
      const existingTool = currentToolCalls[existingIndex];
      const hasArgsChange = toolData.args && Object.keys(toolData.args).length > 0 &&
                            JSON.stringify(existingTool.args || {}) !== JSON.stringify(toolData.args);
      const hasStatusChange = existingTool.status !== toolData.status;

      if (hasArgsChange || hasStatusChange) {
        updatedToolCalls = currentToolCalls.map((toolCall) =>
          toolCall.id === resolvedId
            ? {
                ...toolCall,
                status: toolData.status,
                ...(toolData.args && Object.keys(toolData.args).length > 0
                  ? { args: toolData.args }
                  : {}),
              }
            : toolCall,
        );
      } else {
        updatedToolCalls = currentToolCalls;
      }
    } else {
      updatedToolCalls = [
        ...currentToolCalls,
        {
          id: resolvedId,
          name: toolData.name,
          args: toolData.args,
          status: toolData.status,
          timestamp: Date.now(),
        },
      ];
    }
  } else {
    updatedToolCalls = currentToolCalls.map((toolCall) => {
      if (
        (toolData.id && toolCall.id === toolData.id) ||
        (!toolData.id && toolCall.name === toolData.name && toolCall.status === "calling")
      ) {
        return {
          ...toolCall,
          status: toolData.status,
          result: toolData.result,
          ...(toolData.args && Object.keys(toolData.args).length > 0
            ? { args: toolData.args }
            : {}),
          durationMs: toolData.durationMs || (toolCall.timestamp ? Date.now() - toolCall.timestamp : undefined),
        };
      }
      return toolCall;
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
