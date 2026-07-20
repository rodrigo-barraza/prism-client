/**
 * Live-stream gate for viewed conversations — regression tests.
 *
 * Regression history:
 *  - Switching to an actively-running sub-agent conversation showed no
 *    streamed content — the gate never opened because the backend never
 *    persisted isActive:true on sub-agent documents. Fixed service-side
 *    (SubAgentPersistenceService lifecycle); this suite locks the client
 *    half of that contract.
 *  - The same staleness applied to MAIN conversations viewed by anyone who
 *    wasn't driving them (second device, another user's turn, lupos,
 *    scheduled runs): the gate only ever opened for sub-agents, so viewers
 *    saw nothing until the turn finalized. The gate now opens for ANY
 *    running conversation this client is not itself driving.
 */
import { describe, it, expect } from "vitest";
import { shouldOpenViewerLiveStream } from "../viewerLiveStreamGate";

const BASE = {
  activeConversationId: "conv-1",
  isClientDrivenGeneration: false,
  isConversationRunning: true,
};

describe("shouldOpenViewerLiveStream", () => {
  it("opens the stream for any viewed, running conversation", () => {
    expect(shouldOpenViewerLiveStream(BASE)).toBe(true);
  });

  it("stays closed without an active conversation id", () => {
    expect(
      shouldOpenViewerLiveStream({ ...BASE, activeConversationId: null }),
    ).toBe(false);
    expect(
      shouldOpenViewerLiveStream({ ...BASE, activeConversationId: undefined }),
    ).toBe(false);
  });

  it("stays closed when this client drives the generation (SSE already attached)", () => {
    expect(
      shouldOpenViewerLiveStream({ ...BASE, isClientDrivenGeneration: true }),
    ).toBe(false);
  });

  it("stays closed for a finished conversation (isConversationRunning false)", () => {
    expect(
      shouldOpenViewerLiveStream({ ...BASE, isConversationRunning: false }),
    ).toBe(false);
  });
});

describe("shouldOpenViewerLiveStream — read-only viewer (/admin/chat)", () => {
  it("opens the stream for a running conversation", () => {
    expect(
      shouldOpenViewerLiveStream({ ...BASE, isReadOnlyViewer: true }),
    ).toBe(true);
  });

  it("stays subscribed even for an idle conversation (never miss a turn start)", () => {
    // Regression: gating the admin subscription on the persisted running
    // flag raced the turn's first events — the user_message mirror and the
    // opening chunks were broadcast before the change-stream refresh could
    // flip the flag, so the user's prompt only appeared when the agent
    // replied and the reply arrived as one un-streamed block.
    expect(
      shouldOpenViewerLiveStream({
        ...BASE,
        isReadOnlyViewer: true,
        isConversationRunning: false,
      }),
    ).toBe(true);
  });

  it("never opens without a viewed conversation", () => {
    expect(
      shouldOpenViewerLiveStream({
        ...BASE,
        activeConversationId: null,
        isReadOnlyViewer: true,
      }),
    ).toBe(false);
  });
});
