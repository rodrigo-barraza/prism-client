import { describe, it, expect } from "vitest";
import { deriveChatStatusBar, type ChatStatusBarInputs } from "../chatStatusBar";
import { AWAITING_USER_LABEL } from "../awaitingUserStatus";
import type { ClientMessage } from "../agentConversationReducer";

function inputs(overrides: Partial<ChatStatusBarInputs> = {}): ChatStatusBarInputs {
  return {
    messages: [],
    isGenerating: false,
    isUserExplicitlyStopped: false,
    toolActivity: [],
    subAgentToolActivity: {},
    agenticProgress: null,
    planProposal: null,
    pendingApprovals: [],
    pendingUserQuestion: null,
    budgetPause: null,
    pendingBackgroundTaskCount: 0,
    isConversationExplicitlyActive: false,
    isConversationExplicitlyInactive: false,
    liveStreamingLastChunkTime: null,
    liveStreamingBurstTokens: 0,
    liveStreamingBurstElapsed: 0,
    liveGenProgress: null,
    now: 10_000,
    ...overrides,
  };
}

const streamingReply = (overrides: Partial<ClientMessage> = {}): ClientMessage => ({
  role: "assistant",
  content: "Port 3",
  contentSegments: [{ type: "text", fragmentIndex: 0 }],
  ...overrides,
});

describe("deriveChatStatusBar", () => {
  it("is down with nothing running", () => {
    expect(deriveChatStatusBar(inputs())).toEqual({
      isActive: false,
      phase: null,
      label: undefined,
      progress: null,
      tokensPerSecond: null,
    });
  });

  it("says Generating while text chunks flow, with the burst's tokens per second", () => {
    const bar = deriveChatStatusBar(
      inputs({
        isGenerating: true,
        messages: [streamingReply()],
        liveStreamingLastChunkTime: 9_500,
        liveStreamingBurstTokens: 20,
        liveStreamingBurstElapsed: 500,
      }),
    );
    expect(bar).toMatchObject({ isActive: true, phase: "generating", label: "Generating..." });
    expect(bar.tokensPerSecond).toBe(40);
  });

  it("names the running tool", () => {
    const bar = deriveChatStatusBar(
      inputs({
        isGenerating: true,
        messages: [streamingReply({ content: "" })],
        toolActivity: [{ id: "t1", name: "read_file", args: {}, status: "calling" }],
      }),
    );
    expect(bar.phase).toBe("executing");
    expect(bar.label).toMatch(/^Running tool /);
  });

  it("waits for the user on a pending card, whatever streams", () => {
    const bar = deriveChatStatusBar(
      inputs({ isGenerating: true, pendingApprovals: [{ status: "pending" }] }),
    );
    expect(bar).toMatchObject({ isActive: true, phase: "awaiting", label: AWAITING_USER_LABEL });
  });

  it("stays up, delegating, while background tasks outlive the stream", () => {
    const bar = deriveChatStatusBar(inputs({ pendingBackgroundTaskCount: 2 }));
    expect(bar).toMatchObject({ isActive: true, phase: "delegating", label: "Awaiting Background Tasks…" });
  });

  it("counts the sub-agents in a phase", () => {
    const bar = deriveChatStatusBar(
      inputs({
        isGenerating: true,
        subAgentToolActivity: { a: { phase: "generating" }, b: { phase: "thinking" } },
      }),
    );
    expect(bar).toMatchObject({ phase: "generating", label: "1/2 sub-agents generating…" });
  });

  it("goes down at once when the user stopped the turn", () => {
    const bar = deriveChatStatusBar(
      inputs({ isGenerating: true, isUserExplicitlyStopped: true, pendingBackgroundTaskCount: 1 }),
    );
    expect(bar).toMatchObject({ isActive: false, phase: null });
  });
});
