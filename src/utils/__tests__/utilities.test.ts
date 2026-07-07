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
