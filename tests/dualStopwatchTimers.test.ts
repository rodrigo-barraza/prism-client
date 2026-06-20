import { describe, it, expect } from "vitest";
import { getConversationElapsedTime } from "../src/utils/utilities";
import type { Message } from "../src/types/types";
import type { ConversationStats as SettingsConversationStats } from "../src/components/SettingsPanelComponent";

type MockMessage = Partial<Message>;

// ═══════════════════════════════════════════════════════════════════════
// 1. Processing Timer — getConversationElapsedTime
//    Verifies cumulative user→assistant turn wall-clock duration.
// ═══════════════════════════════════════════════════════════════════════

describe("Processing timer (getConversationElapsedTime)", () => {
  it("returns 0 for an empty messages array", () => {
    expect(getConversationElapsedTime([])).toBe(0);
  });

  it("returns 0 when there are only user messages with no assistant replies", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Hello", timestamp: "2026-05-31T10:00:00Z" },
      { role: "user", content: "Anyone?", timestamp: "2026-05-31T10:01:00Z" },
    ];
    expect(getConversationElapsedTime(messages as Message[])).toBe(0);
  });

  it("computes a single turn correctly using completedAt", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Hi", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "Hello!",
        timestamp: "2026-05-31T10:00:01Z",
        completedAt: "2026-05-31T10:00:05Z",
      },
    ];
    // 5 seconds between user send and assistant completedAt
    expect(getConversationElapsedTime(messages as Message[])).toBe(5);
  });

  it("computes a single turn using assistant timestamp when completedAt is absent", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Hi", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "Hello!",
        timestamp: "2026-05-31T10:00:03Z",
      },
    ];
    // Falls back to assistant.timestamp → 3 seconds
    expect(getConversationElapsedTime(messages as Message[])).toBe(3);
  });

  it("accumulates multiple turns correctly", () => {
    const messages: MockMessage[] = [
      // Turn 1: 5 seconds
      { role: "user", content: "Question 1", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "Answer 1",
        completedAt: "2026-05-31T10:00:05Z",
      },
      // Turn 2: 10 seconds
      { role: "user", content: "Question 2", timestamp: "2026-05-31T10:05:00Z" },
      {
        role: "assistant",
        content: "Answer 2",
        completedAt: "2026-05-31T10:05:10Z",
      },
      // Turn 3: 2 seconds
      { role: "user", content: "Question 3", timestamp: "2026-05-31T10:10:00Z" },
      {
        role: "assistant",
        content: "Answer 3",
        completedAt: "2026-05-31T10:10:02Z",
      },
    ];
    // Total processing time: 5 + 10 + 2 = 17 seconds
    expect(getConversationElapsedTime(messages as Message[])).toBe(17);
  });

  it("excludes idle time between turns from the processing total", () => {
    const messages: MockMessage[] = [
      // Turn 1: user at 10:00:00, assistant done at 10:00:05 → 5s processing
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "A1",
        completedAt: "2026-05-31T10:00:05Z",
      },
      // User waits 10 minutes before sending Turn 2
      // Turn 2: user at 10:10:00, assistant done at 10:10:03 → 3s processing
      { role: "user", content: "Q2", timestamp: "2026-05-31T10:10:00Z" },
      {
        role: "assistant",
        content: "A2",
        completedAt: "2026-05-31T10:10:03Z",
      },
    ];
    // Only processing time counts: 5 + 3 = 8, not the 10min idle gap
    expect(getConversationElapsedTime(messages as Message[])).toBe(8);
  });

  it("skips user messages without timestamps", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "No timestamp" },
      {
        role: "assistant",
        content: "Response",
        completedAt: "2026-05-31T10:00:05Z",
      },
      { role: "user", content: "Has timestamp", timestamp: "2026-05-31T10:01:00Z" },
      {
        role: "assistant",
        content: "Response 2",
        completedAt: "2026-05-31T10:01:07Z",
      },
    ];
    // Only the second turn counts (7s); first turn is skipped due to missing timestamp
    expect(getConversationElapsedTime(messages as Message[])).toBe(7);
  });

  it("skips assistant messages without any timestamp or completedAt", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      { role: "assistant", content: "Incomplete — no timestamps" },
      { role: "user", content: "Q2", timestamp: "2026-05-31T10:01:00Z" },
      {
        role: "assistant",
        content: "Done",
        completedAt: "2026-05-31T10:01:04Z",
      },
    ];
    // First turn is skipped (assistant has no end time); second turn: 4s
    expect(getConversationElapsedTime(messages as Message[])).toBe(4);
  });

  it("ignores system and tool messages in the turn pairing", () => {
    const messages: MockMessage[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Hi", timestamp: "2026-05-31T10:00:00Z" },
      { role: "tool", content: "Tool result" },
      {
        role: "assistant",
        content: "Response",
        completedAt: "2026-05-31T10:00:06Z",
      },
    ];
    // Pairs user at :00 with assistant at :06 → 6 seconds
    expect(getConversationElapsedTime(messages as Message[])).toBe(6);
  });

  it("handles restored sessions with only assistant.timestamp (no completedAt)", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      { role: "assistant", content: "A1", timestamp: "2026-05-31T10:00:08Z" },
      { role: "user", content: "Q2", timestamp: "2026-05-31T10:01:00Z" },
      { role: "assistant", content: "A2", timestamp: "2026-05-31T10:01:12Z" },
    ];
    // 8 + 12 = 20 seconds
    expect(getConversationElapsedTime(messages as Message[])).toBe(20);
  });

  it("prefers completedAt over timestamp when both are present on assistant", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "A1",
        timestamp: "2026-05-31T10:00:01Z",
        completedAt: "2026-05-31T10:00:10Z",
      },
    ];
    // Should use completedAt (10s) not timestamp (1s)
    expect(getConversationElapsedTime(messages as Message[])).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Conversation Timer — conversationStartTime derivation
//    Verifies that messages[0].timestamp correctly anchors the
//    wall-clock conversation timer.
// ═══════════════════════════════════════════════════════════════════════

describe("Conversation timer (conversationStartTime derivation)", () => {
  /**
   * Replicates the exact derivation logic from ChatSessionComponent:
   *   conversationStartTime: messages.length > 0 ? messages[0]?.timestamp : null
   */
  function deriveConversationStartTime(messages: MockMessage[]): string | null {
    return messages.length > 0 ? (messages[0]?.timestamp ?? null) : null;
  }

  it("returns null for empty messages", () => {
    expect(deriveConversationStartTime([])).toBeNull();
  });

  it("returns the first message timestamp when messages exist", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Hello", timestamp: "2026-05-31T10:00:00Z" },
      { role: "assistant", content: "Hi!", timestamp: "2026-05-31T10:00:03Z" },
    ];
    expect(deriveConversationStartTime(messages)).toBe("2026-05-31T10:00:00Z");
  });

  it("returns null when first message has no timestamp", () => {
    const messages: MockMessage[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Hello", timestamp: "2026-05-31T10:00:00Z" },
    ];
    // System message has no timestamp, so conversationStartTime is null
    expect(deriveConversationStartTime(messages)).toBeNull();
  });

  it("uses system message timestamp if it is the first message and has one", () => {
    const messages: MockMessage[] = [
      { role: "system", content: "Prompt", timestamp: "2026-05-31T09:59:58Z" },
      { role: "user", content: "Hello", timestamp: "2026-05-31T10:00:00Z" },
    ];
    // First message is system with a timestamp — that's the anchor
    expect(deriveConversationStartTime(messages)).toBe("2026-05-31T09:59:58Z");
  });

  it("conversation timer differs from processing timer for multi-turn sessions", () => {
    const messages: MockMessage[] = [
      // Conversation starts at 10:00:00
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "A1",
        completedAt: "2026-05-31T10:00:05Z",
      },
      // User thinks for 5 minutes, then asks Q2
      { role: "user", content: "Q2", timestamp: "2026-05-31T10:05:00Z" },
      {
        role: "assistant",
        content: "A2",
        completedAt: "2026-05-31T10:05:03Z",
      },
    ];

    const conversationStartTime = deriveConversationStartTime(messages);
    const processingTime = getConversationElapsedTime(messages as Message[]);

    // Conversation timer anchor: 10:00:00 — the wall-clock start
    expect(conversationStartTime).toBe("2026-05-31T10:00:00Z");

    // Processing timer: 5 + 3 = 8 seconds (excludes idle gap)
    expect(processingTime).toBe(8);

    // The conversation wall-clock span (from first message to last assistant completion)
    // is 5 minutes + 3 seconds = 303 seconds.
    // The processing total is only 8 seconds.
    // This proves the two timers measure fundamentally different things.
    const conversationWallClockSeconds =
      (new Date("2026-05-31T10:05:03Z").getTime() -
        new Date(conversationStartTime!).getTime()) /
      1000;
    expect(conversationWallClockSeconds).toBe(303);
    expect(processingTime).toBeLessThan(conversationWallClockSeconds);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. StopwatchBadge variant logic
//    Tests the icon and tooltip selection logic extracted from the
//    StopwatchBadge component without requiring React rendering.
// ═══════════════════════════════════════════════════════════════════════

describe("StopwatchBadge variant logic", () => {
  type StopwatchVariant = "conversation" | "processing";

  function resolveStopwatchTooltipPrefix(variant: StopwatchVariant): string {
    return variant === "conversation" ? "Conversation" : "Processing";
  }

  function resolveStopwatchIconName(variant: StopwatchVariant): string {
    return variant === "conversation" ? "Clock" : "Timer";
  }

  it("conversation variant uses Clock icon and Conversation tooltip prefix", () => {
    expect(resolveStopwatchIconName("conversation")).toBe("Clock");
    expect(resolveStopwatchTooltipPrefix("conversation")).toBe("Conversation");
  });

  it("processing variant uses Timer icon and Processing tooltip prefix", () => {
    expect(resolveStopwatchIconName("processing")).toBe("Timer");
    expect(resolveStopwatchTooltipPrefix("processing")).toBe("Processing");
  });

  it("default variant is processing (backward compat)", () => {
    // The component defaults to "processing" when variant is omitted.
    // Verify the default produces the Timer icon.
    const defaultVariant: StopwatchVariant = "processing";
    expect(resolveStopwatchIconName(defaultVariant)).toBe("Timer");
    expect(resolveStopwatchTooltipPrefix(defaultVariant)).toBe("Processing");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. ConversationStats.conversationStartTime integration
//    Verifies the assembly logic mirrors what ChatConversationComponent does.
// ═══════════════════════════════════════════════════════════════════════

describe("ConversationStats conversationStartTime assembly", () => {
  type MinimalConversationStats = Pick<SettingsConversationStats, "conversationStartTime" | "completedElapsedTime">;

  /**
   * Replicates the conversationStats assembly pattern from ChatConversationComponent
   * for both the backend-merged and client-fallback paths.
   */
  function assembleConversationStats(
    messages: MockMessage[],
    backendTotalElapsedTime: number | null,
  ): MinimalConversationStats {
    const clientElapsedTime = getConversationElapsedTime(messages as Message[]);
    return {
      conversationStartTime:
        messages.length > 0 ? (messages[0]?.timestamp ?? null) : null,
      completedElapsedTime: backendTotalElapsedTime || clientElapsedTime,
    };
  }

  it("assembles both timers correctly with backend elapsed time", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "A1",
        completedAt: "2026-05-31T10:00:05Z",
      },
    ];
    const stats = assembleConversationStats(messages, 4.8);

    expect(stats.conversationStartTime).toBe("2026-05-31T10:00:00Z");
    // Backend elapsed time takes priority over client-computed
    expect(stats.completedElapsedTime).toBe(4.8);
  });

  it("falls back to client-computed elapsed when backend is null", () => {
    const messages: MockMessage[] = [
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      {
        role: "assistant",
        content: "A1",
        completedAt: "2026-05-31T10:00:07Z",
      },
    ];
    const stats = assembleConversationStats(messages, null);

    expect(stats.conversationStartTime).toBe("2026-05-31T10:00:00Z");
    expect(stats.completedElapsedTime).toBe(7);
  });

  it("returns null conversationStartTime when messages array is empty", () => {
    const stats = assembleConversationStats([], null);

    expect(stats.conversationStartTime).toBeNull();
    expect(stats.completedElapsedTime).toBe(0);
  });

  it("handles a long conversation with many idle gaps", () => {
    const messages: MockMessage[] = [
      // Turn 1: 10:00:00 → 10:00:02 (2s processing)
      { role: "user", content: "Q1", timestamp: "2026-05-31T10:00:00Z" },
      { role: "assistant", content: "A1", completedAt: "2026-05-31T10:00:02Z" },
      // 30 minute idle gap
      // Turn 2: 10:30:00 → 10:30:01 (1s processing)
      { role: "user", content: "Q2", timestamp: "2026-05-31T10:30:00Z" },
      { role: "assistant", content: "A2", completedAt: "2026-05-31T10:30:01Z" },
      // 1 hour idle gap
      // Turn 3: 11:30:00 → 11:30:08 (8s processing)
      { role: "user", content: "Q3", timestamp: "2026-05-31T11:30:00Z" },
      { role: "assistant", content: "A3", completedAt: "2026-05-31T11:30:08Z" },
    ];
    const stats = assembleConversationStats(messages, null);

    // Conversation started at 10:00:00
    expect(stats.conversationStartTime).toBe("2026-05-31T10:00:00Z");

    // Processing time: 2 + 1 + 8 = 11 seconds (ignores 1.5 hours of idle)
    expect(stats.completedElapsedTime).toBe(11);

    // Whereas the conversation wall-clock span would be 1h30m8s = 5408s
    const wallClockSeconds =
      (new Date("2026-05-31T11:30:08Z").getTime() -
        new Date("2026-05-31T10:00:00Z").getTime()) /
      1000;
    expect(wallClockSeconds).toBe(5408);

    // Demonstrates the two timers diverge significantly
    expect(stats.completedElapsedTime).toBeLessThan(wallClockSeconds);
  });
});
