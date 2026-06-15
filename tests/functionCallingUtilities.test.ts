import { describe, it, expect } from "vitest";
import {
  sanitizeToolName,
  buildToolSchemas,
} from "../src/utils/FunctionCallingUtilities";
import type { ToolSchema } from "../src/types/types";

// ═══════════════════════════════════════════════════════════════
// sanitizeToolName
// ═══════════════════════════════════════════════════════════════

describe("sanitizeToolName", () => {
  it("should pass through a valid alphanumeric name unchanged", () => {
    expect(sanitizeToolName("search_web")).toBe("search_web");
  });

  it("should pass through names with dots, colons, hyphens, and slashes unchanged", () => {
    expect(sanitizeToolName("tools:v2/read.file-json")).toBe("tools:v2/read.file-json");
  });

  it("should replace special characters with underscores", () => {
    expect(sanitizeToolName("my tool (v2)")).toBe("my_tool__v2_");
  });

  it("should prefix names starting with a digit", () => {
    const sanitized = sanitizeToolName("3d_render");
    expect(sanitized).toMatch(/^[a-zA-Z_]/);
  });

  it("should truncate names longer than 128 characters", () => {
    const longName = "a".repeat(200);
    const sanitized = sanitizeToolName(longName);
    expect(sanitized.length).toBe(128);
  });

  it("should handle empty string without throwing", () => {
    expect(() => sanitizeToolName("")).not.toThrow();
  });

  it("should handle a name that is exactly 128 characters", () => {
    const exactName = "a".repeat(128);
    expect(sanitizeToolName(exactName)).toBe(exactName);
  });
});

// ═══════════════════════════════════════════════════════════════
// buildToolSchemas
// ═══════════════════════════════════════════════════════════════

describe("buildToolSchemas", () => {
  const mockTools: ToolSchema[] = [
    { name: "search_web", description: "Search the web" },
    { name: "read_file", description: "Read a file", system: true },
    { name: "write_file", description: "Write a file", system: true },
    { name: "get_weather", description: "Get weather data" },
  ];

  it("should return all tools when no tools are disabled", () => {
    const result = buildToolSchemas(mockTools, new Set());
    expect(result).toHaveLength(4);
  });

  it("should exclude disabled tools from the result", () => {
    const disabledTools = new Set(["search_web", "get_weather"]);
    const result = buildToolSchemas(mockTools, disabledTools);
    expect(result).toHaveLength(2);
    expect(result.map((tool) => tool.name)).toEqual(["read_file", "write_file"]);
  });

  it("should return empty array when all tools are disabled", () => {
    const allDisabled = new Set(mockTools.map((tool) => tool.name));
    const result = buildToolSchemas(mockTools, allDisabled);
    expect(result).toHaveLength(0);
  });

  it("should return empty array when builtInTools is empty", () => {
    const result = buildToolSchemas([], new Set(["search_web"]));
    expect(result).toHaveLength(0);
  });

  it("should ignore disabled tool names that do not exist in builtInTools", () => {
    const disabledTools = new Set(["nonexistent_tool"]);
    const result = buildToolSchemas(mockTools, disabledTools);
    expect(result).toHaveLength(4);
  });
});
