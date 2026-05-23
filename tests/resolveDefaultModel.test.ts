import { describe, it, expect } from "vitest";
import { resolveDefaultModel } from "../src/utils/utilities";

describe("resolveDefaultModel utility", () => {
  it("defaults ALWAYS to Gemini 3.5 Flash if Google provider is available", () => {
    const config = {
      textToText: {
        models: {
          openai: [
            { name: "gpt-5.4", tools: ["Tool Calling"] },
            { name: "gpt-5.4-mini", tools: ["Tool Calling"] },
          ],
          anthropic: [
            { name: "claude-sonnet-4-5-20250929", tools: ["Tool Calling"] },
            { name: "claude-haiku-4-5-20251001", tools: ["Tool Calling"] },
          ],
          google: [
            { name: "gemini-3-pro-preview", tools: ["Tool Calling"] },
            { name: "gemini-3.5-flash", tools: ["Tool Calling"], defaultTemperature: 1.0 },
          ],
        },
      },
    };

    const resolved = resolveDefaultModel(config, false);
    expect(resolved.provider).toBe("google");
    expect(resolved.model).toBe("gemini-3.5-flash");
  });

  it("defaults to latest Haiku if Google is not available, but Anthropic is available", () => {
    const config = {
      textToText: {
        models: {
          openai: [
            { name: "gpt-5.4", tools: ["Tool Calling"] },
            { name: "gpt-5.4-mini", tools: ["Tool Calling"] },
          ],
          anthropic: [
            { name: "claude-sonnet-4-5-20250929", tools: ["Tool Calling"] },
            { name: "claude-haiku-4-5-20251001", tools: ["Tool Calling"], defaultTemperature: 1.0 },
          ],
        },
      },
    };

    const resolved = resolveDefaultModel(config, false);
    expect(resolved.provider).toBe("anthropic");
    expect(resolved.model).toBe("claude-haiku-4-5-20251001");
  });

  it("defaults to latest OpenAI mini/small model if neither Google nor Anthropic is available", () => {
    const config = {
      textToText: {
        models: {
          openai: [
            { name: "gpt-5.4", tools: ["Tool Calling"] },
            { name: "gpt-5.4-mini", tools: ["Tool Calling"], defaultTemperature: 1.0 },
          ],
        },
      },
    };

    const resolved = resolveDefaultModel(config, false);
    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("gpt-5.4-mini");
  });

  it("filters models by tool calling capability when fcOnly is true", () => {
    const config = {
      textToText: {
        models: {
          google: [
            { name: "gemini-3.5-flash", tools: [] }, // No tool calling
            { name: "gemini-3-pro-preview", tools: ["Tool Calling"], defaultTemperature: 0.7 },
          ],
        },
      },
    };

    // With fcOnly = true, it should bypass gemini-3.5-flash and pick gemini-3-pro-preview
    const resolved = resolveDefaultModel(config, true);
    expect(resolved.provider).toBe("google");
    expect(resolved.model).toBe("gemini-3-pro-preview");
  });

  it("falls back to the first available provider if none of the prioritized models match", () => {
    const config = {
      textToText: {
        models: {
          openai: [
            { name: "gpt-5.2", tools: [] },
          ],
        },
      },
    };

    const resolved = resolveDefaultModel(config, false);
    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("gpt-5.2");
  });
});
