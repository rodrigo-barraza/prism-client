/**
 * Live-stream gate for viewed sub-agent conversations — regression tests.
 *
 * Regression: switching to an actively-running sub-agent conversation showed
 * no streamed content — everything appeared at once when the sub-agent
 * finished. The WebSocket subscription existed but its gate never opened,
 * because isConversationRunning reduces to the persisted isActive flag and
 * the backend never set isActive:true on sub-agent conversation documents.
 * The backend now raises/lowers isActive across the whole sub-agent lifecycle
 * (SubAgentPersistenceService register/markSubAgentActive/markSubAgentTerminal);
 * this suite locks the client half of that contract.
 */
import { describe, it, expect } from "vitest";
import { shouldOpenSubAgentLiveStream } from "../subAgentLiveStreamGate";

const BASE = {
  activeConversationId: "sub-conv-1",
  isSubAgentConversation: true,
  isClientDrivenGeneration: false,
  isConversationRunning: true,
};

describe("shouldOpenSubAgentLiveStream", () => {
  it("opens the stream for a viewed, running sub-agent conversation", () => {
    expect(shouldOpenSubAgentLiveStream(BASE)).toBe(true);
  });

  it("stays closed without an active conversation id", () => {
    expect(
      shouldOpenSubAgentLiveStream({ ...BASE, activeConversationId: null }),
    ).toBe(false);
    expect(
      shouldOpenSubAgentLiveStream({ ...BASE, activeConversationId: undefined }),
    ).toBe(false);
  });

  it("stays closed for non-sub-agent conversations (parent streams via SSE)", () => {
    expect(
      shouldOpenSubAgentLiveStream({ ...BASE, isSubAgentConversation: false }),
    ).toBe(false);
  });

  it("stays closed when this client drives the generation (SSE already attached)", () => {
    expect(
      shouldOpenSubAgentLiveStream({ ...BASE, isClientDrivenGeneration: true }),
    ).toBe(false);
  });

  it("stays closed for a finished sub-agent (isConversationRunning false)", () => {
    // This is the original bug's observable state: with the backend never
    // persisting isActive:true, isConversationRunning was ALWAYS false for a
    // viewed sub-agent and the stream never opened. It must still be false
    // for genuinely finished sub-agents.
    expect(
      shouldOpenSubAgentLiveStream({ ...BASE, isConversationRunning: false }),
    ).toBe(false);
  });
});
