/**
 * What a turn event makes the chat do beyond its state (agentConversationEffects.ts):
 * one pure mapping, the same for every transport.
 */
import { describe, it, expect } from "vitest";
import type { TurnEvent } from "../../types/types";
import { effectsOfEvent, runsWhileHidden } from "../agentConversationEffects";
import { createAgentConversationState, type AgentConversationState } from "../agentConversationReducer";

const event = (fields: Record<string, unknown>) => fields as unknown as TurnEvent;
const EMPTY = createAgentConversationState();
const effects = (fields: Record<string, unknown>, before: AgentConversationState = EMPTY) =>
  effectsOfEvent(event(fields), before, "conv-1");

describe("effectsOfEvent", () => {
  it("caches a tool's emoji and refreshes the panels its tools change", () => {
    expect(
      effects({ type: "tool_execution", tool: { name: "create_task", args: {} }, status: "done", toolEmoji: "🗂️" }),
    ).toEqual([
      { kind: "tool-emoji", toolName: "create_task", emoji: "🗂️" },
      { kind: "refresh-panel", panel: "tasks" },
    ]);
    expect(effects({ type: "tool_execution", tool: { name: "query_datastore" }, status: "streaming" })).toEqual([
      { kind: "refresh-panel", panel: "datastore" },
    ]);
    // The call itself changes nothing yet.
    expect(effects({ type: "tool_execution", tool: { name: "create_task" }, status: "calling" })).toEqual([]);
  });

  it("counts a scheduled cron job once it is created", () => {
    expect(effects({ type: "tool_execution", tool: { name: "create_cron_job" }, status: "done" })).toEqual([
      { kind: "cron-job-scheduled" },
    ]);
    expect(effects({ type: "tool_execution", tool: { name: "create_cron_job" }, status: "streaming" })).toEqual([]);
  });

  it("shows the memories panel after save_memory", () => {
    expect(effects({ type: "tool_execution", tool: { name: "save_memory" }, status: "done" })).toEqual([
      { kind: "memory-saved" },
    ]);
  });

  it("refreshes the workspace for the path a filesystem tool touched", () => {
    expect(effects({ type: "tool_execution", tool: { name: "write_file", args: { path: "/a.ts" } }, status: "done" })).toEqual([
      { kind: "workspace-file-touched", toolName: "write_file", path: "/a.ts" },
    ]);
    expect(effects({ type: "tool_execution", tool: { name: "move_file", args: { source: "/b.ts" } }, status: "done" })).toEqual([
      { kind: "workspace-file-touched", toolName: "move_file", path: "/b.ts" },
    ]);
    expect(effects({ type: "toolCall", name: "execute_command", args: {}, status: "done" })).toEqual([
      { kind: "workspace-file-touched", toolName: "execute_command", path: null },
    ]);
  });

  it("maps the statuses that act on the chat", () => {
    expect(effects({ type: "status", message: "hook_system_message", text: "Goal completed", hookName: "goal", hookEvent: "Stop" })).toEqual([
      { kind: "toast", message: "Goal completed", level: "info" },
    ]);
    expect(effects({ type: "status", message: "tool_set_changed", enabledCount: 3, dynamicTools: ["generate_csv"] })).toEqual([
      { kind: "enable-tools", toolNames: ["generate_csv"] },
    ]);
    expect(effects({ type: "status", message: "tool_set_changed", enabledCount: 3, dynamicTools: [] })).toEqual([]);
    expect(effects({ type: "status", message: "tasks_updated" })).toEqual([{ kind: "tasks-updated" }]);
    expect(effects({ type: "status", message: "sub_agents_updated" })).toEqual([{ kind: "sub-agents-updated" }]);
    expect(effects({ type: "status", message: "memories_updated" })).toEqual([{ kind: "memories-updated" }]);
    expect(effects({ type: "status", message: "iteration_progress", iteration: 1, maxIterations: 5 })).toEqual([]);
    expect(effects({ type: "status", message: "Loading model…", phase: "loading" })).toEqual([]);
  });

  it("lists a spawned sub-agent in the sidebar", () => {
    expect(
      effects({
        type: "sub_agent_status",
        subAgentId: "sa-1",
        message: "spawned",
        description: "Audit auth",
        conversationId: "conv-sub-1",
        parentConversationId: "conv-1",
        agentIndex: 0,
        model: "claude-test",
        provider: "anthropic",
      }),
    ).toEqual([
      {
        kind: "sub-agent-spawned",
        conversationId: "conv-sub-1",
        parentConversationId: "conv-1",
        description: "Audit auth",
        agentIndex: 0,
        model: "claude-test",
        provider: "anthropic",
      },
    ]);
    expect(effects({ type: "sub_agent_status", subAgentId: "sa-1", message: "spawned" })).toEqual([]);
  });

  it("settles a finished sub-agent's conversation, found on the event or from its spawn", () => {
    expect(effects({ type: "sub_agent_status", subAgentId: "sa-1", message: "complete", conversationId: "conv-sub-1" })).toEqual([
      { kind: "sub-agent-settled", conversationId: "conv-sub-1" },
    ]);
    const spawned = { ...EMPTY, subAgentToolActivity: { "sa-2": { conversationId: "conv-sub-2" } } };
    expect(effects({ type: "sub_agent_status", subAgentId: "sa-2", message: "failed" }, spawned)).toEqual([
      { kind: "sub-agent-settled", conversationId: "conv-sub-2" },
    ]);
    expect(effects({ type: "sub_agent_status", subAgentId: "sa-3", message: "failed" })).toEqual([]);
  });

  it("patches the stream's conversation in the list", () => {
    expect(effects({ type: "conversation_state_update", pendingBackgroundTasks: 2, isActive: true })).toEqual([
      { kind: "conversation-state", conversationId: "conv-1", pendingBackgroundTasks: 2, isActive: true },
    ]);
  });

  it("hands goals, permission modes and non-blocking questions to their hooks", () => {
    const goal = event({ type: "goal_update", change: "cleared" });
    expect(effectsOfEvent(goal, EMPTY, "conv-1")).toEqual([{ kind: "goal", event: goal }]);
    const mode = event({ type: "permission_mode", conversationId: "conv-1", mode: "plan", source: "user" });
    expect(effectsOfEvent(mode, EMPTY, "conv-1")).toEqual([{ kind: "permission-mode", event: mode }]);
    const question = event({ type: "user_question", questions: [], blocking: false });
    expect(effectsOfEvent(question, EMPTY, "conv-1")).toEqual([{ kind: "non-blocking-question", event: question }]);
    expect(effects({ type: "user_question", questions: [], blocking: true })).toEqual([]);
  });

  it("has no effects for pure content", () => {
    for (const type of ["chunk", "thinking", "done", "error", "turn_input", "approval_required", "usage_update"]) {
      expect(effects({ type })).toEqual([]);
    }
  });
});

describe("runsWhileHidden", () => {
  it("keeps only the conversation list current for a stream not on screen", () => {
    expect(runsWhileHidden({ kind: "conversation-state", conversationId: "c", pendingBackgroundTasks: 0 })).toBe(true);
    expect(runsWhileHidden({ kind: "toast", message: "m", level: "info" })).toBe(false);
    expect(runsWhileHidden({ kind: "memory-saved" })).toBe(false);
  });
});
