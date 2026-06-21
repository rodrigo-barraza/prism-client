import { describe, it, expect } from "vitest";
import { resolveDefaultModel } from "../src/utils/utilities";
import type { PrismConfig } from "../src/types/types";

describe("resolveDefaultModel utility", () => {
  it("resolves to server recommended default when model is available", () => {
    const mockConfig: Partial<PrismConfig> = {
      textToText: {
        recommendedDefault: {
          provider: "google",
          model: "gemini-3.5-flash",
          temperature: 1.0,
        },
      },
    } as unknown as PrismConfig;

    const resolvedDefaultModel = resolveDefaultModel(mockConfig, false);
    expect(resolvedDefaultModel.provider).toBe("google");
    expect(resolvedDefaultModel.model).toBe("gemini-3.5-flash");
    expect(resolvedDefaultModel.temperature).toBe(1.0);
  });

  it("resolves to server recommended agentic default when fcOnly is true and model is available", () => {
    const mockConfig: Partial<PrismConfig> = {
      textToText: {
        recommendedAgenticDefault: {
          provider: "openai",
          model: "gpt-5.4-mini",
          temperature: 0.7,
        },
      },
    } as unknown as PrismConfig;

    const resolvedDefaultModel = resolveDefaultModel(mockConfig, true);
    expect(resolvedDefaultModel.provider).toBe("openai");
    expect(resolvedDefaultModel.model).toBe("gpt-5.4-mini");
    expect(resolvedDefaultModel.temperature).toBe(0.7);
  });

  it("trusts server recommendation even if model is not in the local models list (server handles merging)", () => {
    const mockConfig: Partial<PrismConfig> = {
      textToText: {
        recommendedDefault: {
          provider: "google",
          model: "gemini-3.5-flash",
          temperature: 1.0,
        },
      },
    } as unknown as PrismConfig;

    const resolvedDefaultModel = resolveDefaultModel(mockConfig, false);
    expect(resolvedDefaultModel.provider).toBe("google");
    expect(resolvedDefaultModel.model).toBe("gemini-3.5-flash");
    expect(resolvedDefaultModel.temperature).toBe(1.0);
  });

  it("returns empty default if config is missing or undefined", () => {
    const resolvedDefaultModel = resolveDefaultModel(undefined, false);
    expect(resolvedDefaultModel.provider).toBe("");
    expect(resolvedDefaultModel.model).toBe("");
    expect(resolvedDefaultModel.temperature).toBe(1.0);
  });
});
