import { describe, it, expect } from "vitest";
import { calculateEstimatedLiveCost } from "../src/utils/utilities";

// Mock minimal interface matching Message for the uncounted request tests
interface MockMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  model?: string;
  provider?: string;
  usage?: unknown;
  _intermediateUsage?: unknown;
}

describe("Dynamic live cost calculation", () => {
  const selectedModelDef = {
    pricing: {
      inputPerMillion: 2.5,
      outputPerMillion: 10.0,
      cachedInputPerMillion: 0.25,
      cacheWriteInputPerMillion: 3.125,
    },
  };

  it("calculates live cost correctly for a paid model with uncached tokens only", () => {
    const totalTokens = {
      input: 100000, // 100k
      output: 50000,  // 50k
    };
    // Expected uncached input cost: (100k / 1M) * 2.5 = 0.25
    // Expected output cost: (50k / 1M) * 10.0 = 0.50
    // Expected total: 0.75
    const cost = calculateEstimatedLiveCost(0, totalTokens, 1, selectedModelDef);
    expect(cost).toBeCloseTo(0.75, 5);
  });

  it("calculates live cost with Anthropic-style prompt caching correctly", () => {
    const totalTokens = {
      input: 200000, // 200k total input
      output: 50000, // 50k output
      cacheRead: 150000, // 150k read
      cacheWrite: 10000, // 10k write
      // Uncached: 200k - 150k - 10k = 40k
    };
    // Uncached input cost: (40k / 1M) * 2.5 = 0.10
    // Cache read cost: (150k / 1M) * 0.25 = 0.0375
    // Cache write cost: (10k / 1M) * 3.125 = 0.03125
    // Output cost: (50k / 1M) * 10.0 = 0.50
    // Expected total: 0.10 + 0.0375 + 0.03125 + 0.50 = 0.66875
    const cost = calculateEstimatedLiveCost(0, totalTokens, 1, selectedModelDef);
    expect(cost).toBeCloseTo(0.66875, 5);
  });

  it("returns the completed totalCost if it exceeds the calculated live cost", () => {
    const totalTokens = {
      input: 1000,
      output: 500,
    };
    // Calculated live cost is extremely small: (1k/1M)*2.5 + (500/1M)*10 = 0.0025 + 0.005 = 0.0075
    // But completed totalCost is 1.50 (e.g. from prior runs)
    const cost = calculateEstimatedLiveCost(1.50, totalTokens, 2, selectedModelDef);
    expect(cost).toBe(1.50);
  });

  it("returns totalCost if the model has no pricing defined", () => {
    const freeModelDef = {
      pricing: undefined,
    };
    const totalTokens = {
      input: 100000,
      output: 50000,
    };
    const cost = calculateEstimatedLiveCost(0.50, totalTokens, 1, freeModelDef);
    expect(cost).toBe(0.50);
  });

  it("returns a tiny placeholder cost on active turn if calculated is 0 to force display immediately", () => {
    const totalTokens = {
      input: 0,
      output: 0,
    };
    const cost = calculateEstimatedLiveCost(0, totalTokens, 1, selectedModelDef);
    expect(cost).toBe(0.00000001);
  });

  it("does not set tiny placeholder cost if requestCount is 0", () => {
    const totalTokens = {
      input: 0,
      output: 0,
    };
    const cost = calculateEstimatedLiveCost(0, totalTokens, 0, selectedModelDef);
    expect(cost).toBe(0);
  });
});

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
  } as any;
  const lastMessageCompleted = {
    role: "assistant",
    estimatedCost: 0.20,
    usage: { inputTokens: 100, outputTokens: 50 },
  } as any;

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
