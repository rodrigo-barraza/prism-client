/**
 * Agent-conversation state derivation — regression tests.
 *
 * The ladder mirrors the server copy in
 * prism-service/src/services/conversation/utils.ts (deriveAgentConversationState);
 * keep the two in sync.
 *
 * New behavior under test (M4): snapshot consumers (admin table) pass the
 * server-computed `state` through and it wins; live consumers
 * (HistoryItemComponent) omit it and the fields-based ladder still applies.
 */
import { describe, it, expect } from "vitest";
import { deriveAgentConversationState } from "../agentConversationStates.js";

describe("deriveAgentConversationState — server-computed state pass-through", () => {
  it("returns the pre-computed state verbatim when provided", () => {
    expect(
      deriveAgentConversationState({
        state: "completed-with-errors",
        // Contradictory fields — the snapshot state must still win
        isGenerating: true,
        isActive: true,
      }),
    ).toBe("completed-with-errors");
  });

  it("falls back to field derivation when state is absent", () => {
    expect(
      deriveAgentConversationState({ isGenerating: true, hasSubAgents: true }),
    ).toBe("orchestrating");
  });
});

describe("deriveAgentConversationState — field ladder (live path)", () => {
  it("returns 'generating' when isGenerating without sub-agents", () => {
    expect(deriveAgentConversationState({ isGenerating: true })).toBe(
      "generating",
    );
  });

  it("prioritizes isGenerating over isActive === false (stale-flag window)", () => {
    expect(
      deriveAgentConversationState({ isGenerating: true, isActive: false }),
    ).toBe("generating");
  });

  it("returns 'completed' / 'completed-with-errors' when session ended", () => {
    expect(deriveAgentConversationState({ isActive: false })).toBe("completed");
    expect(
      deriveAgentConversationState({ isActive: false, requestErrorCount: 3 }),
    ).toBe("completed-with-errors");
  });

  it("maps pending tasks to 'sub-agents-running' / 'background-tasks'", () => {
    expect(
      deriveAgentConversationState({
        isActive: true,
        pendingBackgroundTasks: 2,
        hasSubAgents: true,
      }),
    ).toBe("sub-agents-running");
    expect(
      deriveAgentConversationState({
        isActive: true,
        pendingBackgroundTasks: 2,
      }),
    ).toBe("background-tasks");
  });

  it("defaults to 'active' when nothing else applies", () => {
    expect(deriveAgentConversationState({})).toBe("active");
    expect(
      deriveAgentConversationState({ isActive: true, requestErrorCount: 5 }),
    ).toBe("active");
  });
});
