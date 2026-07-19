import { describe, it, expect } from "vitest";

import type { Message } from "../../types/types";
import { isMessageUncounted, resolveConversationCost } from "../utilities";

type MockMessage = Partial<Message>;



describe("Reactive Stats Badges helper logic", () => {
  it("detects an active uncounted request correctly", () => {
    // Scenario 1: Last message is an assistant message that is actively streaming (no usage/intermediate usage)
    const activeUncountedLastMessage: MockMessage = {
      role: "assistant",
      model: "gpt-5.4-mini",
    };
    const hasActiveUncountedRequest1 = isMessageUncounted(activeUncountedLastMessage);
    expect(hasActiveUncountedRequest1).toBe(true);

    // Scenario 2: Last message is assistant but has _intermediateUsage
    const intermediateLastMessage: MockMessage = {
      role: "assistant",
      _intermediateUsage: { inputTokens: 100, outputTokens: 50 },
    };
    const hasActiveUncountedRequest2 = isMessageUncounted(intermediateLastMessage);
    expect(hasActiveUncountedRequest2).toBe(false);

    // Scenario 3: Last message is assistant and is fully done (has usage)
    const completedLastMessage: MockMessage = {
      role: "assistant",
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    const hasActiveUncountedRequest3 = isMessageUncounted(completedLastMessage);
    expect(hasActiveUncountedRequest3).toBe(false);
  });

  it("correctly includes active uncounted model in uniqueModels", () => {
    const backendModels = ["gpt-5.4"];
    const activeModel = "claude-sonnet-4-6";

    // Replicates our set merging logic
    const uniqueModels = [
      ...new Set([
        ...backendModels,
        ...(activeModel ? [activeModel] : []),
      ]),
    ];

    expect(uniqueModels).toEqual(["gpt-5.4", "claude-sonnet-4-6"]);
  });
});

describe("Session cost consistency between sidebar and settings panel", () => {
  const bgUsage = { cost: 0.05 };
  const lastMessageActive = {
    role: "assistant",
    _intermediateEstimatedCost: 0.15,
  } as unknown as Message;
  const lastMessageCompleted = {
    role: "assistant",
    estimatedCost: 0.20,
    usage: { inputTokens: 100, outputTokens: 50 },
  } as unknown as Message;

  it("ensures cost matches exactly in both places during active generation", () => {
    const isBackendStatsStale = true;
    const backendSessionStats = { totalCost: 0.50 };

    // Sidebar cost (resolvedCost)
    const resolvedCost = resolveConversationCost(
      backendSessionStats,
      bgUsage,
      lastMessageActive,
      isBackendStatsStale,
    );

    // Settings panel stats.totalCost
    const statsTotalCost = resolveConversationCost(
      backendSessionStats,
      bgUsage,
      lastMessageActive,
      isBackendStatsStale,
    );

    expect(resolvedCost).toBe(0.50 + 0.05 + 0.15);
    expect(statsTotalCost).toBe(0.50 + 0.05 + 0.15);
    expect(resolvedCost).toBe(statsTotalCost);
  });

  it("ensures cost matches exactly in both places during post-turn gap (message completed, stats stale)", () => {
    const isBackendStatsStale = true;
    const backendSessionStats = { totalCost: 0.50 };

    const resolvedCost = resolveConversationCost(
      backendSessionStats,
      bgUsage,
      lastMessageCompleted,
      isBackendStatsStale,
    );

    const statsTotalCost = resolveConversationCost(
      backendSessionStats,
      bgUsage,
      lastMessageCompleted,
      isBackendStatsStale,
    );

    expect(resolvedCost).toBe(0.50 + 0.05 + 0.20);
    expect(statsTotalCost).toBe(0.50 + 0.05 + 0.20);
    expect(resolvedCost).toBe(statsTotalCost);
  });

  it("ensures cost matches exactly in both places after backend stats refresh (stats fresh)", () => {
    const isBackendStatsStale = false;
    const backendSessionStats = { totalCost: 0.75 }; // now includes the turn's cost and background cost

    const resolvedCost = resolveConversationCost(
      backendSessionStats,
      bgUsage,
      lastMessageCompleted,
      isBackendStatsStale,
    );

    const statsTotalCost = resolveConversationCost(
      backendSessionStats,
      bgUsage,
      lastMessageCompleted,
      isBackendStatsStale,
    );

    expect(resolvedCost).toBe(0.75 + 0.05); // activeMessageCost is 0
    expect(statsTotalCost).toBe(0.75 + 0.05);
    expect(resolvedCost).toBe(statsTotalCost);
  });
});

describe("Live streaming cost (generation_progress estimatedCost)", () => {
  const bgUsage = { cost: 0.05 };

  it("includes the live tracker estimate while the turn streams (no usage yet)", () => {
    const streamingMessage = {
      role: "assistant",
      _liveGenProgress: { estimatedCost: 0.12 },
    } as unknown as Message;

    const resolvedCost = resolveConversationCost(
      { totalCost: 0.5 },
      bgUsage,
      streamingMessage,
      true,
    );

    expect(resolvedCost).toBeCloseTo(0.5 + 0.05 + 0.12, 8);
  });

  it("takes the max of live estimate and per-iteration usage_update cost", () => {
    const streamingMessage = {
      role: "assistant",
      _intermediateEstimatedCost: 0.10,
      // Tracker estimate is higher — it also covers sub-agents and the
      // in-flight iteration, so it wins.
      _liveGenProgress: { estimatedCost: 0.18 },
    } as unknown as Message;

    const resolvedCost = resolveConversationCost(
      { totalCost: 0.5 },
      bgUsage,
      streamingMessage,
      true,
    );

    expect(resolvedCost).toBeCloseTo(0.5 + 0.05 + 0.18, 8);
  });

  it("ignores the live estimate once backend stats are fresh", () => {
    const completedMessage = {
      role: "assistant",
      estimatedCost: 0.2,
      _liveGenProgress: { estimatedCost: 0.18 },
    } as unknown as Message;

    const resolvedCost = resolveConversationCost(
      { totalCost: 0.75 },
      bgUsage,
      completedMessage,
      false,
    );

    expect(resolvedCost).toBeCloseTo(0.75 + 0.05, 8);
  });
});
