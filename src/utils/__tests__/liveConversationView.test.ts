/**
 * Live conversation viewing (viewed sub-agents + /admin/chat) — regression
 * tests for the arbitration between the live WebSocket stream and
 * whole-document snapshot refreshes.
 */
import { describe, it, expect } from "vitest";
import {
  shouldApplySnapshotRefresh,
  seedStreamAccumulators,
  extractPersistedContextBudget,
} from "../liveConversationView";
import type { ContextBudget } from "../../types/types";

describe("shouldApplySnapshotRefresh", () => {
  it("applies refreshes when no live stream is open", () => {
    expect(
      shouldApplySnapshotRefresh({
        isStreamOpen: false,
        hasStreamedContent: false,
      }),
    ).toBe(true);
  });

  it("applies refreshes while the stream is open but SILENT", () => {
    // Regression: /admin/chat went completely stale until a page reload —
    // the subscription opened against a service without direct-viewer
    // broadcast support, delivered nothing, and still suppressed every
    // change-stream boundary refresh. An open-but-silent stream must never
    // block snapshot refreshes.
    expect(
      shouldApplySnapshotRefresh({
        isStreamOpen: true,
        hasStreamedContent: false,
      }),
    ).toBe(true);
  });

  it("suppresses refreshes only while the stream is actively delivering", () => {
    expect(
      shouldApplySnapshotRefresh({
        isStreamOpen: true,
        hasStreamedContent: true,
      }),
    ).toBe(false);
  });

  it("applies refreshes again once the stream has closed", () => {
    expect(
      shouldApplySnapshotRefresh({
        isStreamOpen: false,
        hasStreamedContent: true,
      }),
    ).toBe(true);
  });
});

describe("seedStreamAccumulators", () => {
  it("seeds from a trailing in-flight assistant bubble", () => {
    expect(
      seedStreamAccumulators([
        { role: "user", content: "do the thing" },
        { role: "assistant", content: "Working on", thinking: "hmm" },
      ]),
    ).toEqual({ streamedText: "Working on", streamedThinking: "hmm" });
  });

  it("starts empty when the trailing message is a user prompt (new turn)", () => {
    // Regression: seeding from the PREVIOUS completed assistant reply made
    // the new turn's chunks render as previous-reply + new-text in one
    // corrupted bubble.
    expect(
      seedStreamAccumulators([
        { role: "assistant", content: "Previous completed reply" },
        { role: "user", content: "next question" },
      ]),
    ).toEqual({ streamedText: "", streamedThinking: "" });
  });

  it("starts empty when the trailing message is a tool result", () => {
    expect(
      seedStreamAccumulators([
        { role: "assistant", content: "calling tool" },
        { role: "tool", content: "tool output" },
      ]),
    ).toEqual({ streamedText: "", streamedThinking: "" });
  });

  it("starts empty for an empty conversation", () => {
    expect(seedStreamAccumulators([])).toEqual({
      streamedText: "",
      streamedThinking: "",
    });
  });

  it("tolerates non-string content on the trailing assistant message", () => {
    expect(
      seedStreamAccumulators([
        { role: "assistant", content: [{ type: "image" }] },
      ]),
    ).toEqual({ streamedText: "", streamedThinking: "" });
  });
});

describe("extractPersistedContextBudget", () => {
  const budget = {
    contextWindow: 128_000,
    messageTokens: 12_000,
    systemPromptTokens: 10_500,
    toolSchemaTokens: 10_900,
    totalInputTokens: 23_500,
    availableOutputTokens: 104_500,
    isClamped: false,
    toolCount: 43,
    source: "persisted",
  } as unknown as ContextBudget;

  it("returns the persisted budget from a conversation document", () => {
    expect(extractPersistedContextBudget({ id: "conv-1", contextBudget: budget })).toBe(
      budget,
    );
  });

  it("returns null when the document has no budget (indicator hidden)", () => {
    expect(extractPersistedContextBudget({ id: "conv-1" })).toBeNull();
    expect(extractPersistedContextBudget({ id: "conv-1", contextBudget: null })).toBeNull();
    expect(extractPersistedContextBudget(null)).toBeNull();
    expect(extractPersistedContextBudget(undefined)).toBeNull();
  });
});
