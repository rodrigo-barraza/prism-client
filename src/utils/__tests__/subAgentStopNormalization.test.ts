/**
 * Sub-Agent Stop Status Normalization Tests
 *
 * Validates the frontend's sub-agent status normalization and cleanup
 * logic that prevents stale "Generating…" badges from persisting after
 * a conversation is stopped.
 *
 * Two areas under test:
 *   1. `normalizeSubAgentStatusToPhase` — maps backend status strings
 *      to the frontend phase vocabulary used by StatusBarComponent.
 *   2. The `handleStop` sub-agent cleanup pattern — forces all active
 *      sub-agents to a terminal phase so StatusBar stops animating
 *      even when SSE "complete" events never arrive.
 *
 * Regression: The backend previously left `subAgentStatus: "running"`
 * in MongoDB when a conversation was stopped. On reload, the frontend
 * mapped "running" → "generating" and rendered infinite progress bars.
 */
import { describe, it, expect } from "vitest";

// ── Inline the normalisation function (it's module-private in the component) ──
// We replicate the exact logic from ChatConversationComponent.tsx L380-L393
// to verify its mapping contract without needing to mount a React component.

function normalizeSubAgentStatusToPhase(backendStatus: string): string {
  switch (backendStatus) {
    case "completed":
    case "complete":
    case "stopped":
      return "complete";
    case "running":
      return "generating";
    case "failed":
      return "failed";
    default:
      return backendStatus;
  }
}

// ── Inline the handleStop cleanup logic (extracted from ChatConversationComponent.tsx L1216-L1231) ──
// Simulates the exact reducer that forces sub-agents to terminal phases on stop.

interface SubAgentActivityEntry {
  toolCount: number;
  currentTool: string | null;
  iteration: number;
  toolNames?: Record<string, number>;
  description?: string;
  phase?: string;
  conversationId?: string;
}

function applyHandleStopSubAgentCleanup(
  previousSubAgentToolActivity: Record<string, SubAgentActivityEntry>,
): Record<string, SubAgentActivityEntry> {
  const terminalPhases = new Set(["complete", "completed", "failed", "stopped"]);
  const hasActive = Object.values(previousSubAgentToolActivity).some(
    (subAgent) => !subAgent.phase || !terminalPhases.has(subAgent.phase),
  );
  if (!hasActive) return previousSubAgentToolActivity;
  const next: Record<string, SubAgentActivityEntry> = {};
  for (const [id, subAgent] of Object.entries(previousSubAgentToolActivity)) {
    next[id] =
      !subAgent.phase || !terminalPhases.has(subAgent.phase)
        ? { ...subAgent, phase: "complete", currentTool: null }
        : subAgent;
  }
  return next;
}

// ── Tests ──────────────────────────────────────────────────────

describe("normalizeSubAgentStatusToPhase", () => {
  it('maps "running" to "generating" (active state for StatusBar)', () => {
    expect(normalizeSubAgentStatusToPhase("running")).toBe("generating");
  });

  it('maps "stopped" to "complete" (terminal — no longer generating)', () => {
    expect(normalizeSubAgentStatusToPhase("stopped")).toBe("complete");
  });

  it('maps "completed" to "complete"', () => {
    expect(normalizeSubAgentStatusToPhase("completed")).toBe("complete");
  });

  it('maps "complete" to "complete"', () => {
    expect(normalizeSubAgentStatusToPhase("complete")).toBe("complete");
  });

  it('maps "failed" to "failed"', () => {
    expect(normalizeSubAgentStatusToPhase("failed")).toBe("failed");
  });

  it("passes through unknown statuses unchanged", () => {
    expect(normalizeSubAgentStatusToPhase("idle")).toBe("idle");
    expect(normalizeSubAgentStatusToPhase("unknown")).toBe("unknown");
    expect(normalizeSubAgentStatusToPhase("pending")).toBe("pending");
  });

  it('critical regression: "stopped" must NOT map to "generating"', () => {
    // This is THE regression that caused the infinite "Generating…" badges.
    // If a stopped sub-agent maps to "generating", the StatusBar animates forever.
    const result = normalizeSubAgentStatusToPhase("stopped");
    expect(result).not.toBe("generating");
    expect(result).toBe("complete");
  });
});

describe("handleStop sub-agent cleanup reducer", () => {
  it("transitions all active sub-agents to 'complete' phase", () => {
    const previous: Record<string, SubAgentActivityEntry> = {
      "agent-1": {
        toolCount: 3,
        currentTool: "search_web",
        iteration: 1,
        phase: "generating",
      },
      "agent-2": {
        toolCount: 5,
        currentTool: "read_file",
        iteration: 2,
        phase: "thinking",
      },
    };

    const result = applyHandleStopSubAgentCleanup(previous);

    expect(result["agent-1"].phase).toBe("complete");
    expect(result["agent-2"].phase).toBe("complete");
  });

  it("clears currentTool on transitioned sub-agents", () => {
    const previous: Record<string, SubAgentActivityEntry> = {
      "agent-1": {
        toolCount: 1,
        currentTool: "write_file",
        iteration: 0,
        phase: "executing",
      },
    };

    const result = applyHandleStopSubAgentCleanup(previous);

    expect(result["agent-1"].currentTool).toBeNull();
  });

  it("preserves already-terminal sub-agents unchanged", () => {
    const completedEntry: SubAgentActivityEntry = {
      toolCount: 10,
      currentTool: null,
      iteration: 3,
      phase: "complete",
      description: "Already done",
    };
    const failedEntry: SubAgentActivityEntry = {
      toolCount: 2,
      currentTool: null,
      iteration: 1,
      phase: "failed",
    };
    const previous: Record<string, SubAgentActivityEntry> = {
      "agent-done": completedEntry,
      "agent-fail": failedEntry,
      "agent-active": {
        toolCount: 0,
        currentTool: "create_file",
        iteration: 0,
        phase: "generating",
      },
    };

    const result = applyHandleStopSubAgentCleanup(previous);

    // Terminal entries should be the SAME object reference (identity check)
    expect(result["agent-done"]).toBe(completedEntry);
    expect(result["agent-fail"]).toBe(failedEntry);
    // Active entry should be transitioned
    expect(result["agent-active"].phase).toBe("complete");
  });

  it("handles sub-agents with no phase (undefined) as active", () => {
    const previous: Record<string, SubAgentActivityEntry> = {
      "agent-no-phase": {
        toolCount: 0,
        currentTool: null,
        iteration: 0,
        phase: undefined,
      },
    };

    const result = applyHandleStopSubAgentCleanup(previous);

    expect(result["agent-no-phase"].phase).toBe("complete");
  });

  it("returns the same object if all sub-agents are already terminal", () => {
    const previous: Record<string, SubAgentActivityEntry> = {
      "agent-a": {
        toolCount: 5,
        currentTool: null,
        iteration: 2,
        phase: "complete",
      },
      "agent-b": {
        toolCount: 3,
        currentTool: null,
        iteration: 1,
        phase: "stopped",
      },
    };

    const result = applyHandleStopSubAgentCleanup(previous);

    // Should return the SAME reference — no unnecessary re-render
    expect(result).toBe(previous);
  });

  it("handles empty sub-agent activity map", () => {
    const previous: Record<string, SubAgentActivityEntry> = {};
    const result = applyHandleStopSubAgentCleanup(previous);
    expect(result).toBe(previous);
  });

  it("preserves toolCount and iteration during transition", () => {
    const previous: Record<string, SubAgentActivityEntry> = {
      "agent-preserve": {
        toolCount: 7,
        currentTool: "run_command",
        iteration: 4,
        toolNames: { search_web: 3, read_file: 4 },
        description: "Research agent",
        phase: "generating",
        conversationId: "conv-123",
      },
    };

    const result = applyHandleStopSubAgentCleanup(previous);

    expect(result["agent-preserve"].toolCount).toBe(7);
    expect(result["agent-preserve"].iteration).toBe(4);
    expect(result["agent-preserve"].description).toBe("Research agent");
    expect(result["agent-preserve"].conversationId).toBe("conv-123");
    expect(result["agent-preserve"].toolNames).toEqual({ search_web: 3, read_file: 4 });
  });
});
