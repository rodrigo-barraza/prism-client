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

describe("shouldOpenSubAgentLiveStream — read-only viewer (/admin/chat)", () => {
  // The admin viewer never drives generation itself, and the service mirrors
  // main-conversation events to direct WebSocket subscribers
  // (SseUtilities.withDirectViewerBroadcast) — so a read-only viewer streams
  // ANY conversation, not only sub-agents.
  it("opens the stream for a running MAIN conversation", () => {
    expect(
      shouldOpenSubAgentLiveStream({
        ...BASE,
        isSubAgentConversation: false,
        isReadOnlyViewer: true,
      }),
    ).toBe(true);
  });

  it("still opens for a running sub-agent conversation", () => {
    expect(
      shouldOpenSubAgentLiveStream({ ...BASE, isReadOnlyViewer: true }),
    ).toBe(true);
  });

  it("stays subscribed even for an idle conversation (never miss a turn start)", () => {
    // Regression: gating the admin subscription on the persisted running
    // flag raced the turn's first events — the user_message mirror and the
    // opening chunks were broadcast before the change-stream refresh could
    // flip the flag, so the user's prompt only appeared when the agent
    // replied and the reply arrived as one un-streamed block.
    expect(
      shouldOpenSubAgentLiveStream({
        ...BASE,
        isSubAgentConversation: false,
        isReadOnlyViewer: true,
        isConversationRunning: false,
      }),
    ).toBe(true);
  });

  it("never opens without a viewed conversation", () => {
    expect(
      shouldOpenSubAgentLiveStream({
        ...BASE,
        activeConversationId: null,
        isReadOnlyViewer: true,
      }),
    ).toBe(false);
  });
});
