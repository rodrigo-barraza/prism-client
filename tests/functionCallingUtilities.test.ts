import { describe, it, expect } from "vitest";
import {
  buildToolSchemas,
} from "../src/utils/FunctionCallingUtilities";
import type { ToolSchema } from "../src/types/types";


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
