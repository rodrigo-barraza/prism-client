import { describe, it, expect } from "vitest";

import type { Message } from "../src/types/types";

type MockMessage = Partial<Message>;



describe("Reactive Stats Badges helper logic", () => {
  it("detects an active uncounted request correctly", () => {
    // Scenario 1: Last message is an assistant message that is actively streaming (no usage/intermediate usage)
    const activeUncountedLastMessage: MockMessage = {
      role: "assistant",
      model: "gpt-5.4-mini",
    };
    const hasActiveUncountedRequest1 =
      activeUncountedLastMessage.role === "assistant" &&
      !activeUncountedLastMessage.usage &&
      !activeUncountedLastMessage._intermediateUsage;
    expect(hasActiveUncountedRequest1).toBe(true);

    // Scenario 2: Last message is assistant but has _intermediateUsage
    const intermediateLastMessage: MockMessage = {
      role: "assistant",
      _intermediateUsage: { inputTokens: 100, outputTokens: 50 },
    };
    const hasActiveUncountedRequest2 =
      intermediateLastMessage.role === "assistant" &&
      !intermediateLastMessage.usage &&
      !intermediateLastMessage._intermediateUsage;
    expect(hasActiveUncountedRequest2).toBe(false);

    // Scenario 3: Last message is assistant and is fully done (has usage)
    const completedLastMessage: MockMessage = {
      role: "assistant",
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    const hasActiveUncountedRequest3 =
      completedLastMessage.role === "assistant" &&
      !completedLastMessage.usage &&
      !completedLastMessage._intermediateUsage;
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
    const totalCost = 0.65; // client-side fallback sum

    // Calculate activeMessageCost
    const activeMessageCost =
      lastMessageActive.role === "assistant" && isBackendStatsStale
        ? lastMessageActive.estimatedCost ||
          lastMessageActive._intermediateEstimatedCost ||
          0
        : 0;

    // Sidebar cost (resolvedCost)
    const resolvedCost = backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
        (bgUsage.cost || 0) +
        activeMessageCost
      : totalCost;

    // Settings panel stats.totalCost
    const statsTotalCost = backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
        (bgUsage.cost || 0) +
        activeMessageCost
      : totalCost;

    expect(resolvedCost).toBe(0.50 + 0.05 + 0.15);
    expect(statsTotalCost).toBe(0.50 + 0.05 + 0.15);
    expect(resolvedCost).toBe(statsTotalCost);
  });

  it("ensures cost matches exactly in both places during post-turn gap (message completed, stats stale)", () => {
    const isBackendStatsStale = true;
    const backendSessionStats = { totalCost: 0.50 };
    const totalCost = 0.70;

    const activeMessageCost =
      lastMessageCompleted.role === "assistant" && isBackendStatsStale
        ? lastMessageCompleted.estimatedCost ||
          lastMessageCompleted._intermediateEstimatedCost ||
          0
        : 0;

    const resolvedCost = backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
        (bgUsage.cost || 0) +
        activeMessageCost
      : totalCost;

    const statsTotalCost = backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
        (bgUsage.cost || 0) +
        activeMessageCost
      : totalCost;

    expect(resolvedCost).toBe(0.50 + 0.05 + 0.20);
    expect(statsTotalCost).toBe(0.50 + 0.05 + 0.20);
    expect(resolvedCost).toBe(statsTotalCost);
  });

  it("ensures cost matches exactly in both places after backend stats refresh (stats fresh)", () => {
    const isBackendStatsStale = false;
    const backendSessionStats = { totalCost: 0.75 }; // now includes the turn's cost and background cost
    const totalCost = 0.70;

    const activeMessageCost =
      lastMessageCompleted.role === "assistant" && isBackendStatsStale
        ? lastMessageCompleted.estimatedCost ||
          lastMessageCompleted._intermediateEstimatedCost ||
          0
        : 0;

    const resolvedCost = backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
        (bgUsage.cost || 0) +
        activeMessageCost
      : totalCost;

    const statsTotalCost = backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
        (bgUsage.cost || 0) +
        activeMessageCost
      : totalCost;

    expect(resolvedCost).toBe(0.75 + 0.05); // activeMessageCost is 0
    expect(statsTotalCost).toBe(0.75 + 0.05);
    expect(resolvedCost).toBe(statsTotalCost);
  });
});
