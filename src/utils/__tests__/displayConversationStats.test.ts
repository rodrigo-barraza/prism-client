import { describe, it, expect } from "vitest";
import {
  buildDisplayConversationStats,
  raiseTokenMark,
  ZERO_TOKEN_MARK,
  type ClientConversationStats,
  type DisplayConversationStatsInputs,
} from "../displayConversationStats";
import { documentHasSentTurn } from "../liveConversationView";

const clientStats: ClientConversationStats = {
  uniqueModels: ["claude-test"],
  uniqueProviders: ["anthropic"],
  totalCost: 0.01,
  totalTokens: { input: 100, output: 50, total: 150 },
  requestCount: 1,
  usedTools: [],
  modalities: {},
  elapsedTime: 2,
  liveStreamingTokens: 0,
  liveStreamingStartTime: null,
  liveStreamingLastChunkTime: null,
  liveStreamingBurstTokens: 0,
  liveStreamingBurstElapsed: 0,
  liveOutputCharacters: 0,
  subAgentGenerationProgress: null,
  lastTimeToGeneration: null,
  liveProcessingStartTime: null,
  liveProcessingPhase: null,
  liveTtftSamples: null,
  liveGenProgress: null,
};

function inputs(overrides: Partial<DisplayConversationStatsInputs> = {}): DisplayConversationStatsInputs {
  return {
    messages: [
      { role: "user", content: "Hi", timestamp: "2026-09-22T12:00:00.000Z" },
      { role: "assistant", content: "Hello", usage: { inputTokens: 100, outputTokens: 50 } },
    ],
    backendConversationStats: null,
    isBackendStatsStale: false,
    clientStats,
    subAgentToolActivity: {},
    currentTurnStart: null,
    subAgentCount: 0,
    maxSubAgentDepth: 0,
    tokenMark: ZERO_TOKEN_MARK,
    ...overrides,
  };
}

describe("buildDisplayConversationStats", () => {
  it("shows nothing for an empty conversation", () => {
    expect(buildDisplayConversationStats(inputs({ messages: [] }))).toEqual({ stats: null, displayedTokens: null });
  });

  it("prefers the backend's aggregate, and adds the live turn's cost while it is stale", () => {
    const { stats, displayedTokens } = buildDisplayConversationStats(
      inputs({
        backendConversationStats: { totalCost: 1, totalInputTokens: 1_000, totalOutputTokens: 200, totalTokens: 1_200, requestCount: 3 },
        isBackendStatsStale: true,
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "", estimatedCost: 0.5 },
        ],
      }),
    );
    expect(displayedTokens).toEqual({ input: 1_000, output: 200, total: 1_200 });
    // The in-flight request is not counted yet by the backend.
    expect(stats).toMatchObject({ totalCost: 1.5, requestCount: 4, messageCount: 2 });
  });

  it("never shows fewer tokens than a render already showed", () => {
    const mark = raiseTokenMark(ZERO_TOKEN_MARK, { input: 5_000, output: 900, total: 5_900 });
    const { displayedTokens } = buildDisplayConversationStats(inputs({ tokenMark: mark }));
    expect(displayedTokens).toEqual({ input: 5_000, output: 900, total: 5_900 });
    // Nothing went up: the same mark object.
    expect(raiseTokenMark(mark, { input: 1, output: 1, total: 2 })).toBe(mark);
  });
});

describe("documentHasSentTurn", () => {
  const streamed = [
    { role: "user", content: "Earlier" },
    { role: "assistant", content: "Earlier reply" },
    { role: "user", content: "Which port?" },
    { role: "assistant", content: "3000" },
  ];

  it("holds when the stored conversation has the prompt just sent", () => {
    expect(documentHasSentTurn([...streamed], streamed)).toBe(true);
  });

  it("fails when the stored conversation is behind the stream", () => {
    expect(documentHasSentTurn(streamed.slice(0, 2), streamed)).toBe(false);
    const withoutPrompt = [...streamed.slice(0, 2), { role: "user", content: "Something else" }, streamed[3]];
    expect(documentHasSentTurn(withoutPrompt, streamed)).toBe(false);
  });
});
