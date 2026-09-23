/**
 * What a turn event makes the chat DO beyond its conversation state: refresh
 * a panel, show a toast, add a sub-agent to the sidebar, hand an event to
 * the goal, permission-mode or question hooks. The reducer
 * (agentConversationReducer.ts) stays pure; this maps an event to a list of
 * effect descriptions — also pure — and `useAgentConversation` hands each
 * one to the chat to run. Both transports produce the same effects.
 */

import { STATUS_MESSAGES, TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type {
  GoalUpdateEvent,
  PermissionModeEvent,
  TurnEvent,
  UserQuestionEvent,
} from "../types/types";
import { isKnownStatusEvent } from "../types/protocol/events";
import type { AgentConversationState } from "./agentConversationReducer";
import type { ToolExecutionInput } from "./toolCallStateUpdaters";

/** Filesystem-mutating tools: their results refresh the workspace tree and open file tabs. */
export const WORKSPACE_FS_TOOLS: ReadonlySet<string> = new Set([
  TOOL_NAMES.WRITE_FILE,
  TOOL_NAMES.REPLACE_IN_FILE,
  TOOL_NAMES.PATCH_FILE,
  TOOL_NAMES.MOVE_FILE,
  TOOL_NAMES.DELETE_FILE,
  TOOL_NAMES.EXECUTE_COMMAND,
  TOOL_NAMES.EDIT_NOTEBOOK,
]);

export type AgentConversationEffect =
  | { kind: "tool-emoji"; toolName: string; emoji: string }
  | { kind: "refresh-panel"; panel: "tasks" | "datastore" }
  /** The agent created a cron job: bump the scheduled-tasks badge. */
  | { kind: "cron-job-scheduled" }
  /** `save_memory` ran: show and refresh the memories panel. */
  | { kind: "memory-saved" }
  /** A filesystem tool ran on `path`: refresh the tree and any open tab of it. */
  | { kind: "workspace-file-touched"; toolName: string; path: string | null }
  | { kind: "toast"; message: string; level: "info" }
  /** The agent enabled tools mid-turn (`tool_set_changed`). */
  | { kind: "enable-tools"; toolNames: string[] }
  | { kind: "tasks-updated" }
  | { kind: "sub-agents-updated" }
  | { kind: "memories-updated" }
  /** A sub-agent started: list its conversation in the sidebar right away. */
  | {
      kind: "sub-agent-spawned";
      conversationId: string;
      parentConversationId: string | null;
      description: string;
      agentIndex: number | null;
      model?: string;
      provider?: string;
    }
  /** A sub-agent finished or failed: its sidebar entry stops generating. */
  | { kind: "sub-agent-settled"; conversationId: string }
  /** `conversation_state_update`: the conversation's running flags in the list. */
  | {
      kind: "conversation-state";
      conversationId: string;
      pendingBackgroundTasks: number;
      isActive?: boolean;
    }
  | { kind: "goal"; event: GoalUpdateEvent }
  | { kind: "permission-mode"; event: PermissionModeEvent }
  | { kind: "non-blocking-question"; event: UserQuestionEvent };

/** Effects that still run while the stream's conversation is not the one on screen. */
export function runsWhileHidden(effect: AgentConversationEffect): boolean {
  return effect.kind === "conversation-state";
}

function toolEffects(toolInput: ToolExecutionInput, toolEmoji: string | undefined): AgentConversationEffect[] {
  const effects: AgentConversationEffect[] = [];
  const name = toolInput.name || "";
  if (toolEmoji && toolInput.name) effects.push({ kind: "tool-emoji", toolName: toolInput.name, emoji: toolEmoji });
  // Everything but the call itself: streaming deltas and results alike.
  const hasRun = toolInput.status !== "calling";
  if (hasRun && name.includes("_task")) effects.push({ kind: "refresh-panel", panel: "tasks" });
  if (hasRun && name.includes("_datastore")) effects.push({ kind: "refresh-panel", panel: "datastore" });
  if (toolInput.status === "done" && name === TOOL_NAMES.CREATE_CRON_JOB) {
    effects.push({ kind: "cron-job-scheduled" });
  }
  if (hasRun && name === TOOL_NAMES.SAVE_MEMORY) effects.push({ kind: "memory-saved" });
  if (hasRun && WORKSPACE_FS_TOOLS.has(name)) {
    effects.push({
      kind: "workspace-file-touched",
      toolName: name,
      path: (toolInput.args?.path as string) || (toolInput.args?.source as string) || null,
    });
  }
  return effects;
}

/**
 * The effects of `event`, received on the stream of `conversationId`.
 * `before` is the conversation state the event applies to.
 */
export function effectsOfEvent(
  event: TurnEvent,
  before: AgentConversationState,
  conversationId: string,
): AgentConversationEffect[] {
  switch (event.type) {
    case "tool_execution":
      if (!event.tool) return [];
      return toolEffects(
        { name: event.tool.name, args: event.tool.args, status: event.status as string },
        event.toolEmoji as string | undefined,
      );
    case "toolCall":
      return toolEffects({ name: event.name ?? "", args: event.args, status: (event.status as string) || "" }, undefined);
    case "status": {
      if (!isKnownStatusEvent(event)) return [];
      switch (event.message) {
        // A configured hook's `systemMessage` — for the user, never the model.
        case "hook_system_message":
          return typeof event.text === "string" ? [{ kind: "toast", message: event.text, level: "info" }] : [];
        case STATUS_MESSAGES.TOOL_SET_CHANGED: {
          const toolNames = event.dynamicTools;
          return Array.isArray(toolNames) && toolNames.length > 0 ? [{ kind: "enable-tools", toolNames }] : [];
        }
        case STATUS_MESSAGES.TASKS_UPDATED:
          return [{ kind: "tasks-updated" }];
        case STATUS_MESSAGES.SUB_AGENTS_UPDATED:
          return [{ kind: "sub-agents-updated" }];
        case STATUS_MESSAGES.MEMORIES_UPDATED:
          return [{ kind: "memories-updated" }];
        default:
          return [];
      }
    }
    case "sub_agent_status": {
      const subAgentId = event.subAgentId;
      if (!subAgentId) return [];
      const fields = event as typeof event & Record<string, unknown>;
      if (event.message === STATUS_MESSAGES.SPAWNED) {
        const spawnedConversationId = fields.conversationId as string | undefined;
        if (!spawnedConversationId) return [];
        return [
          {
            kind: "sub-agent-spawned",
            conversationId: spawnedConversationId,
            parentConversationId: (fields.parentConversationId as string | undefined) || null,
            description: event.description || "Sub-agent",
            agentIndex: typeof fields.agentIndex === "number" ? fields.agentIndex : null,
            ...(fields.model ? { model: fields.model as string } : {}),
            ...(fields.provider ? { provider: fields.provider as string } : {}),
          },
        ];
      }
      if (event.message === STATUS_MESSAGES.COMPLETE || event.message === STATUS_MESSAGES.FAILED) {
        // The service puts the conversation on terminal events; the
        // activity map knows it only if this client saw the spawn.
        const settledConversationId =
          (fields.conversationId as string | undefined) ||
          (before.subAgentToolActivity[subAgentId]?.conversationId as string | undefined);
        return settledConversationId ? [{ kind: "sub-agent-settled", conversationId: settledConversationId }] : [];
      }
      return [];
    }
    case "conversation_state_update":
      return [
        {
          kind: "conversation-state",
          conversationId,
          pendingBackgroundTasks: (event.pendingBackgroundTasks as number) ?? 0,
          ...(event.isActive !== undefined ? { isActive: event.isActive as boolean } : {}),
        },
      ];
    case "goal_update":
      return [{ kind: "goal", event }];
    case "permission_mode":
      return [{ kind: "permission-mode", event }];
    case "user_question":
      return event.blocking === false ? [{ kind: "non-blocking-question", event }] : [];
    default:
      return [];
  }
}
