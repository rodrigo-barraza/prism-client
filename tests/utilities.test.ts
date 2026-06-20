import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../src/utils/errorMessage.js";
import {
  buildDateRangeParams,
  getUniqueModels,
  getUniqueProviders,
  getConversationCost,
  getTotalInputTokens,
  buildLmStudioLoadBody,
  getUsedTools,
  toolCountsToUsedTools,
  mergeUsedToolsWithSubAgents,
  CAPABILITY_TOOL_NAMES,
  getModalities,
} from "../src/utils/utilities.js";
import type { Message, TokenUsage } from "../src/types/types.js";

// ═════════════════════════════════════════════════════════════════
// getErrorMessage
// ═════════════════════════════════════════════════════════════════

describe("getErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(getErrorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("converts non-Error values to strings", () => {
    expect(getErrorMessage("raw string")).toBe("raw string");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("handles Error subclasses", () => {
    expect(getErrorMessage(new TypeError("type error"))).toBe("type error");
    expect(getErrorMessage(new RangeError("range error"))).toBe("range error");
  });
});

// ═════════════════════════════════════════════════════════════════
// getTotalInputTokens
// ═════════════════════════════════════════════════════════════════

describe("getTotalInputTokens", () => {
  it("returns 0 for null/undefined usage", () => {
    expect(getTotalInputTokens(null)).toBe(0);
    expect(getTotalInputTokens(undefined)).toBe(0);
  });

  it("sums inputTokens only when no cache fields", () => {
    expect(getTotalInputTokens({ inputTokens: 100 } as TokenUsage)).toBe(100);
  });

  it("aggregates all input token sources", () => {
    const usage = {
      inputTokens: 100,
      cacheReadInputTokens: 50,
      cacheCreationInputTokens: 25,
    } as TokenUsage;
    expect(getTotalInputTokens(usage)).toBe(175);
  });

  it("handles missing fields gracefully", () => {
    const usage = { inputTokens: 100, cacheReadInputTokens: 0 } as TokenUsage;
    expect(getTotalInputTokens(usage)).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════
// buildDateRangeParams
// ═════════════════════════════════════════════════════════════════

describe("buildDateRangeParams", () => {
  it("returns empty object for null/undefined", () => {
    expect(buildDateRangeParams(null)).toEqual({});
    expect(buildDateRangeParams(undefined)).toEqual({});
  });

  it("returns empty object for empty date range", () => {
    expect(buildDateRangeParams({ from: "", to: "" })).toEqual({});
  });

  it("converts day-only from date to ISO midnight", () => {
    const result = buildDateRangeParams({ from: "2024-01-15" });
    expect(result.from).toContain("2024-01-15");
    expect(result.from).toContain("T");
    expect(result.to).toBeUndefined();
  });

  it("converts day-only to date to end-of-day ISO", () => {
    const result = buildDateRangeParams({ to: "2024-01-15" });
    expect(result.to).toBeDefined();
    expect(result.to).toContain("T");
    expect(result.to!.endsWith("Z")).toBe(true);
    // The local 23:59:59 gets converted to UTC, so just verify it parses correctly
    const parsed = new Date(result.to!);
    expect(parsed.getTime()).toBeGreaterThan(new Date("2024-01-15T00:00:00").getTime());
    expect(result.from).toBeUndefined();
  });

  it("passes through ISO datetime values unchanged", () => {
    const isoDate = "2024-01-15T10:30:00.000Z";
    const result = buildDateRangeParams({ from: isoDate, to: isoDate });
    expect(result.from).toBe(isoDate);
    expect(result.to).toBe(isoDate);
  });
});

// ═════════════════════════════════════════════════════════════════
// buildLmStudioLoadBody
// ═════════════════════════════════════════════════════════════════

describe("buildLmStudioLoadBody", () => {
  it("returns minimal body with just model name", () => {
    const body = buildLmStudioLoadBody("llama-3.2");
    expect(body).toEqual({ model: "llama-3.2" });
  });

  it("maps camelCase options to snake_case", () => {
    const body = buildLmStudioLoadBody("llama-3.2", {
      contextLength: 4096,
      flashAttention: true,
      offloadKvCache: false,
      evalBatchSize: 512,
    });
    expect(body).toEqual({
      model: "llama-3.2",
      context_length: 4096,
      flash_attention: true,
      offload_kv_cache_to_gpu: false,
      eval_batch_size: 512,
    });
  });

  it("omits undefined options", () => {
    const body = buildLmStudioLoadBody("llama-3.2", { contextLength: 2048 });
    expect(body).toEqual({ model: "llama-3.2", context_length: 2048 });
    expect(body).not.toHaveProperty("flash_attention");
  });
});

// ═════════════════════════════════════════════════════════════════
// getUniqueModels & getUniqueProviders
// ═════════════════════════════════════════════════════════════════

describe("getUniqueModels", () => {
  it("returns empty array for no messages", () => {
    expect(getUniqueModels([])).toEqual([]);
  });

  it("extracts unique model names from assistant messages", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi", model: "gpt-4o" },
      { role: "user", content: "again" },
      { role: "assistant", content: "yes", model: "gpt-4o" },
      { role: "assistant", content: "also", model: "claude-3.5-sonnet" },
    ] as Message[];
    expect(getUniqueModels(messages)).toEqual(["gpt-4o", "claude-3.5-sonnet"]);
  });

  it("ignores user messages with model field", () => {
    const messages = [
      { role: "user", content: "hello", model: "user-model" },
    ] as Message[];
    expect(getUniqueModels(messages)).toEqual([]);
  });
});

describe("getUniqueProviders", () => {
  it("returns empty array for no messages", () => {
    expect(getUniqueProviders([])).toEqual([]);
  });

  it("extracts unique providers from assistant messages", () => {
    const messages = [
      { role: "assistant", content: "hi", provider: "openai" },
      { role: "assistant", content: "hey", provider: "anthropic" },
      { role: "assistant", content: "yo", provider: "openai" },
    ] as Message[];
    expect(getUniqueProviders(messages)).toEqual(["openai", "anthropic"]);
  });
});

// ═════════════════════════════════════════════════════════════════
// getConversationCost
// ═════════════════════════════════════════════════════════════════

describe("getConversationCost", () => {
  it("returns 0 for empty messages", () => {
    expect(getConversationCost([])).toBe(0);
  });

  it("sums estimatedCost across all messages", () => {
    const messages = [
      { role: "user", content: "hello", estimatedCost: 0.001 },
      { role: "assistant", content: "hi", estimatedCost: 0.005 },
      { role: "assistant", content: "ok", estimatedCost: 0.003 },
    ] as Message[];
    expect(getConversationCost(messages)).toBeCloseTo(0.009);
  });

  it("handles messages without estimatedCost", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi", estimatedCost: 0.01 },
    ] as Message[];
    expect(getConversationCost(messages)).toBeCloseTo(0.01);
  });
});

// ═════════════════════════════════════════════════════════════════
// getUsedTools
// ═════════════════════════════════════════════════════════════════

describe("getUsedTools", () => {
  it("returns empty array for no messages", () => {
    expect(getUsedTools([])).toEqual([]);
  });

  it("counts thinking messages", () => {
    const messages = [
      { role: "assistant", content: "hi", thinking: "let me think..." },
    ] as Message[];
    const result = getUsedTools(messages);
    expect(result.find((entry) => entry.name === "Thinking")?.count).toBe(1);
  });

  it("counts tool calls by name", () => {
    const messages = [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { name: "read_file" },
          { name: "grep_search" },
          { name: "read_file" },
        ],
      },
    ] as Message[];
    const result = getUsedTools(messages);
    expect(result.find((entry) => entry.name === "read_file")?.count).toBe(2);
    expect(result.find((entry) => entry.name === "grep_search")?.count).toBe(1);
    expect(result.find((entry) => entry.name === "Tool Calling")?.count).toBe(1);
  });
});

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
      { name: "Thinking", count: 3 },
      { name: "read_file", count: 2 },
    ];
    const result = mergeUsedToolsWithSubAgents(clientTools, null, null);
    expect(result[0]).toEqual({ name: "Thinking", count: 3 });
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
    const clientTools = [{ name: "Thinking", count: 1 }];
    const backendCounts = { read_file: 3 };
    const subAgentActivity = {
      subAgent1: { toolNames: { read_file: 5 } },
    };
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
    expect(CAPABILITY_TOOL_NAMES.has("Thinking")).toBe(true);
    expect(CAPABILITY_TOOL_NAMES.has("Tool Calling")).toBe(true);
    expect(CAPABILITY_TOOL_NAMES.has("Web Search")).toBe(true);
  });

  it("does not contain function-level tool names", () => {
    expect(CAPABILITY_TOOL_NAMES.has("read_file")).toBe(false);
    expect(CAPABILITY_TOOL_NAMES.has("grep_search")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// getModalities
// ═════════════════════════════════════════════════════════════════

describe("getModalities", () => {
  it("returns all-false for empty messages", () => {
    const result = getModalities([]);
    expect(result.textIn).toBe(false);
    expect(result.textOut).toBe(false);
    expect(result.imageIn).toBe(false);
    expect(result.audioIn).toBe(false);
  });

  it("detects text input and output", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.textIn).toBe(true);
    expect(result.textOut).toBe(true);
  });

  it("detects image input on user messages", () => {
    const messages = [
      { role: "user", content: "what is this?", images: ["data:image/png;base64,abc"] },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.imageIn).toBe(true);
  });

  it("detects audio modality", () => {
    const messages = [
      { role: "user", content: "hello", audio: "base64data" },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.audioIn).toBe(true);
  });

  it("detects thinking modality", () => {
    const messages = [
      { role: "assistant", content: "response", thinking: "let me reason..." },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.thinking).toBe(true);
  });

  it("detects web search from tool calls", () => {
    const messages = [
      { role: "assistant", content: "", toolCalls: [{ name: "search_web" }] },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.webSearch).toBe(true);
  });

  it("detects function calling from non-capability tool calls", () => {
    const messages = [
      { role: "assistant", content: "", toolCalls: [{ name: "read_file" }] },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.functionCalling).toBe(true);
  });

  it("detects document input", () => {
    const messages = [
      { role: "user", content: "parse this", documents: [{ name: "report.pdf" }] },
    ] as Message[];
    const result = getModalities(messages);
    expect(result.docIn).toBe(true);
  });
});


