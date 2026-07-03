import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../src/utils/errorMessage.js";
import {
  buildDateRangeParams,
  getTotalInputTokens,
  buildLmStudioLoadBody,
  toolCountsToUsedTools,
  mergeUsedToolsWithSubAgents,
  CAPABILITY_TOOL_NAMES,
  CAPABILITIES,
} from "../src/utils/utilities.js";
import type { TokenUsage } from "../src/types/types.js";

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
// mergeUsedToolsWithSubAgents
// ═════════════════════════════════════════════════════════════════

describe("mergeUsedToolsWithSubAgents", () => {
  it("preserves capabilities from client tools", () => {
    const clientTools = [
      { name: CAPABILITIES.THINKING, count: 3 },
      { name: "read_file", count: 2 },
    ];
    const result = mergeUsedToolsWithSubAgents(clientTools, null, null);
    expect(result[0]).toEqual({ name: CAPABILITIES.THINKING, count: 3 });
    expect(result[1]).toEqual({ name: "read_file", count: 2 });
  });

  it("uses backend tool counts over client when available", () => {
    const clientTools = [{ name: "read_file", count: 2 }];
    const backendCounts = { read_file: 10, grep_search: 5 };
    const result = mergeUsedToolsWithSubAgents(clientTools, backendCounts, null);
    const readFile = result.find((entry) => entry.name === "read_file");
    expect(readFile?.count).toBe(10);
  });

  it("merges sub-agent tool activity with max strategy", () => {
    const clientTools = [{ name: CAPABILITIES.THINKING, count: 1 }];
    const backendCounts = { read_file: 3 };
    const subAgentActivity = {
      subAgent1: { toolNames: { read_file: 5 } },
    } as any;
    const result = mergeUsedToolsWithSubAgents(clientTools, backendCounts, subAgentActivity);
    const readFile = result.find((entry) => entry.name === "read_file");
    expect(readFile?.count).toBe(5);
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


