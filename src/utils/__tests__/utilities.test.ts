import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../errorMessage.js";
import {
  buildDateRangeParams,
  getTotalInputTokens,
  buildLmStudioLoadBody,
  toolCountsToUsedTools,
  buildUnifiedToolCounts,
  CAPABILITY_TOOL_NAMES,
  CAPABILITIES,
  isNameBasedThinkingModel,
} from "../utilities.js";
import type { TokenUsage } from "../../types/types.js";

// ═════════════════════════════════════════════════════════════════
// toolCountsToUsedTools
// ═════════════════════════════════════════════════════════════════

describe("toolCountsToUsedTools", () => {
  it("returns empty array for null/undefined", () => {
    expect(toolCountsToUsedTools(null)).toEqual([]);
    expect(toolCountsToUsedTools(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(toolCountsToUsedTools({})).toEqual([]);
  });

  it("converts map to sorted array", () => {
    const result = toolCountsToUsedTools({ read_file: 5, grep_search: 10 });
    expect(result).toEqual([
      { name: "grep_search", count: 10 },
      { name: "read_file", count: 5 },
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════
// buildUnifiedToolCounts
// ═════════════════════════════════════════════════════════════════

describe("buildUnifiedToolCounts", () => {
  it("preserves capability entries at the front of the result", () => {
    const capabilities = [{ name: CAPABILITIES.THINKING, count: 3 }];
    const authoritativeCounts = { read_file: 2 };
    const result = buildUnifiedToolCounts(capabilities, authoritativeCounts, null);
    expect(result[0]).toEqual({ name: CAPABILITIES.THINKING, count: 3 });
    expect(result[1]).toEqual({ name: "read_file", count: 2 });
  });

  it("uses authoritative tool counts as the base", () => {
    const authoritativeCounts = { read_file: 10, grep_search: 5 };
    const result = buildUnifiedToolCounts([], authoritativeCounts, null);
    const readFile = result.find((entry: { name: string }) => entry.name === "read_file");
    expect(readFile?.count).toBe(10);
  });

  it("overlays live sub-agent tool counts with max strategy", () => {
    const capabilities = [{ name: CAPABILITIES.THINKING, count: 1 }];
    const authoritativeCounts = { read_file: 3 };
    const liveSubAgentActivity = {
      subAgent1: { toolNames: { read_file: 5 } },
    };
    const result = buildUnifiedToolCounts(capabilities, authoritativeCounts, liveSubAgentActivity);
    const readFile = result.find((entry: { name: string }) => entry.name === "read_file");
    expect(readFile?.count).toBe(5);
  });

  it("does not decrease counts when backend catches up to SSE", () => {
    const authoritativeCounts = { read_file: 8 };
    const liveSubAgentActivity = {
      subAgent1: { toolNames: { read_file: 3 } },
    };
    const result = buildUnifiedToolCounts([], authoritativeCounts, liveSubAgentActivity);
    const readFile = result.find((entry: { name: string }) => entry.name === "read_file");
    expect(readFile?.count).toBe(8);
  });

  it("adds new tools from sub-agents not yet in authoritative base", () => {
    const authoritativeCounts = { read_file: 2 };
    const liveSubAgentActivity = {
      subAgent1: { toolNames: { web_search: 4 } },
    };
    const result = buildUnifiedToolCounts([], authoritativeCounts, liveSubAgentActivity);
    const webSearch = result.find((entry: { name: string }) => entry.name === "web_search");
    expect(webSearch?.count).toBe(4);
  });

  it("returns empty tools array when no sources provided", () => {
    const result = buildUnifiedToolCounts([], null, null);
    expect(result).toEqual([]);
  });

  it("excludes capability names from sub-agent overlay", () => {
    const liveSubAgentActivity = {
      subAgent1: { toolNames: { [CAPABILITIES.THINKING]: 10, read_file: 2 } },
    };
    const result = buildUnifiedToolCounts([], null, liveSubAgentActivity);
    const thinkingEntry = result.find((entry: { name: string }) => entry.name === CAPABILITIES.THINKING);
    expect(thinkingEntry).toBeUndefined();
    expect(result).toEqual([{ name: "read_file", count: 2 }]);
  });

  it("sorts merged tools by count descending", () => {
    const authoritativeCounts = { alpha: 1, bravo: 10, charlie: 5 };
    const result = buildUnifiedToolCounts([], authoritativeCounts, null);
    expect(result.map((entry: { name: string }) => entry.name)).toEqual(["bravo", "charlie", "alpha"]);
  });
});

// ═════════════════════════════════════════════════════════════════
// CAPABILITY_TOOL_NAMES
// ═════════════════════════════════════════════════════════════════

describe("CAPABILITY_TOOL_NAMES", () => {
  it("contains expected capability names", () => {
    expect(CAPABILITY_TOOL_NAMES.has(CAPABILITIES.THINKING)).toBe(true);
    expect(CAPABILITY_TOOL_NAMES.has(CAPABILITIES.TOOL_CALLING)).toBe(true);
    expect(CAPABILITY_TOOL_NAMES.has(CAPABILITIES.WEB_SEARCH)).toBe(true);
  });

  it("does not contain function-level tool names", () => {
    expect(CAPABILITY_TOOL_NAMES.has("read_file")).toBe(false);
    expect(CAPABILITY_TOOL_NAMES.has("grep_search")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// getTotalInputTokens — prefers the server-authoritative field (H1)
// ═════════════════════════════════════════════════════════════════

describe("getTotalInputTokens", () => {
  it("returns 0 for null/undefined usage", () => {
    expect(getTotalInputTokens(null)).toBe(0);
    expect(getTotalInputTokens(undefined)).toBe(0);
  });

  it("prefers the server-provided totalInputTokens when present", () => {
    // Even if the split fields would sum to something else, the
    // authoritative server value wins (single source of truth).
    const usage: TokenUsage = {
      inputTokens: 10,
      cacheReadInputTokens: 20,
      cacheCreationInputTokens: 30,
      totalInputTokens: 999,
    };
    expect(getTotalInputTokens(usage)).toBe(999);
  });

  it("falls back to summing the split for historical usage without the field", () => {
    const usage: TokenUsage = {
      inputTokens: 10,
      cacheReadInputTokens: 20,
      cacheCreationInputTokens: 30,
    };
    expect(getTotalInputTokens(usage)).toBe(60);
  });

  it("treats a server totalInputTokens of 0 as authoritative (not a missing value)", () => {
    const usage: TokenUsage = {
      inputTokens: 5,
      totalInputTokens: 0,
    };
    expect(getTotalInputTokens(usage)).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════
// isNameBasedThinkingModel — config-driven LM Studio thinking (M1)
// ═════════════════════════════════════════════════════════════════

describe("isNameBasedThinkingModel", () => {
  it("returns false for empty model name", () => {
    expect(isNameBasedThinkingModel(null)).toBe(false);
    expect(isNameBasedThinkingModel(undefined)).toBe(false);
    expect(isNameBasedThinkingModel("")).toBe(false);
  });

  it("matches server-provided thinking patterns (case-insensitive)", () => {
    const config = { thinkingPatterns: ["deepseek-r1", "qwq"] };
    expect(isNameBasedThinkingModel("DeepSeek-R1-Distill-7B", config)).toBe(true);
    expect(isNameBasedThinkingModel("QwQ-32B", config)).toBe(true);
    expect(isNameBasedThinkingModel("llama-3-8b", config)).toBe(false);
  });

  it("falls back to bundled patterns when config has none", () => {
    // Uses FALLBACK_THINKING_PATTERNS — a non-thinking name still returns false.
    expect(isNameBasedThinkingModel("some-plain-chat-model", null)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// buildLmStudioLoadBody — sends camelCase; backend owns snake_case (M5)
// ═════════════════════════════════════════════════════════════════

describe("buildLmStudioLoadBody", () => {
  it("includes only the model when no options are given", () => {
    expect(buildLmStudioLoadBody("my-model")).toEqual({ model: "my-model" });
  });

  it("carries camelCase option names (no provider snake_case leakage)", () => {
    const body = buildLmStudioLoadBody("m", {
      contextLength: 8192,
      flashAttention: true,
      offloadKvCache: false,
      evalBatchSize: 512,
    });
    expect(body).toEqual({
      model: "m",
      contextLength: 8192,
      flashAttention: true,
      offloadKvCache: false,
      evalBatchSize: 512,
    });
    // The client must not emit LM Studio's snake_case load vocabulary
    expect(body).not.toHaveProperty("context_length");
    expect(body).not.toHaveProperty("offload_kv_cache_to_gpu");
  });

  it("omits options that are null/undefined", () => {
    const body = buildLmStudioLoadBody("m", { contextLength: 4096 });
    expect(body).toEqual({ model: "m", contextLength: 4096 });
  });
});
