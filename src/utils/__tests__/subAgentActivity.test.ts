import { describe, it, expect } from "vitest";
import { applyServerSubAgentStatuses } from "../subAgentActivity";
import type { CoordinatorSubAgent } from "../../types/types";

function serverAgent(agentId: string, status: string, extra: Partial<CoordinatorSubAgent> = {}): CoordinatorSubAgent {
  return {
    id: agentId,
    agentId,
    agentConversationId: "parent-conv",
    subAgentConversationId: `conversation-of-${agentId}`,
    status,
    description: `Agent ${agentId}`,
    ...extra,
  };
}

describe("applyServerSubAgentStatuses", () => {
  it("keeps a sub-agent the server still runs as running when the parent's stream has ended", () => {
    const next = applyServerSubAgentStatuses(
      { "agent-1": { phase: "generating", currentTool: "read_file", toolCount: 2 } },
      [serverAgent("agent-1", "running", { toolCallCount: 3 })],
      { completeUnlisted: true },
    );
    expect(next["agent-1"]).toMatchObject({ phase: "generating", currentTool: "read_file", toolCount: 3 });
  });

  it("resolves finished and stopped agents, clearing their current tool", () => {
    const next = applyServerSubAgentStatuses(
      {
        "agent-1": { phase: "generating", currentTool: "read_file" },
        "agent-2": { phase: "generating", currentTool: "search_web" },
      },
      [serverAgent("agent-1", "complete"), serverAgent("agent-2", "stopped")],
    );
    expect(next["agent-1"]).toMatchObject({ phase: "complete", currentTool: null });
    expect(next["agent-2"]).toMatchObject({ phase: "complete", currentTool: null });
  });

  it("points an entry at the sub-agent's own conversation, not its agent id", () => {
    const next = applyServerSubAgentStatuses({}, [serverAgent("agent-1", "running")]);
    expect(next["agent-1"].conversationId).toBe("conversation-of-agent-1");
  });

  it("completes a running entry the server no longer lists only when asked to", () => {
    const previous = { "agent-gone": { phase: "generating", currentTool: "read_file" } };
    expect(applyServerSubAgentStatuses(previous, [])["agent-gone"].phase).toBe("generating");
    expect(applyServerSubAgentStatuses(previous, [], { completeUnlisted: true })["agent-gone"]).toMatchObject({
      phase: "complete",
      currentTool: null,
    });
  });

  it("leaves terminal entries alone", () => {
    const previous = { "agent-1": { phase: "failed", currentTool: null } };
    expect(applyServerSubAgentStatuses(previous, [], { completeUnlisted: true })["agent-1"].phase).toBe("failed");
  });
});
