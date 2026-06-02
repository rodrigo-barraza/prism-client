import { describe, it, expect } from "vitest";
import { SETTINGS_DEFAULTS } from "../src/constants";

describe("resetSessionState model parameter resetting", () => {
  it("should reset all model parameters to their defaults while keeping the current provider and model", () => {
    const currentSettings = {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      temperature: 0.2,
      maxTokens: 1000,
      topP: 0.5,
      thinkingEnabled: true,
      reasoningEffort: "low",
      frequencyPenalty: 1.5,
      presencePenalty: -1.0,
      minP: 0.1,
      repeatPenalty: 1.2,
      seed: 42,
    };

    const mockConfig = {
      textToText: {
        models: {
          anthropic: [
            {
              name: "claude-sonnet-4-5-20250929",
              defaultTemperature: 0.7,
            },
          ],
        },
      },
    };

    const updateSettings = (
      settings: typeof currentSettings,
      isNoAgent: boolean,
    ) => {
      let defaultTemperature = 1.0;
      if (mockConfig && settings.provider && settings.model) {
        const providerModels =
          (mockConfig.textToText?.models as Record<string, any>)?.[settings.provider] || [];
        const modelDefinition = providerModels.find(
          (model: { name: string; defaultTemperature?: number }) => model.name === settings.model,
        );
        if (
          modelDefinition &&
          modelDefinition.defaultTemperature !== undefined
        ) {
          defaultTemperature = modelDefinition.defaultTemperature;
        }
      }

      return {
        ...SETTINGS_DEFAULTS,
        provider: settings.provider,
        model: settings.model,
        temperature: defaultTemperature,
        maxTokens: 64000,
        functionCallingEnabled: !isNoAgent,
        thinkingEnabled: false,
        minP: 0,
        repeatPenalty: 1.0,
        seed: null,
        responseFormat: "",
        serviceTier: !isNoAgent ? "auto" : "",
        parallelToolCalls: true,
        candidateCount: 1,
        responseMimeType: "",
        store: true,
        mediaResolution: "",
        topLogprobs: 0,
        responseLogprobs: false,
        logprobs: 0,
      };
    };

    const updatedAgentSettings = updateSettings(currentSettings, false);

    expect(updatedAgentSettings.provider).toBe("anthropic");
    expect(updatedAgentSettings.model).toBe("claude-sonnet-4-5-20250929");
    expect(updatedAgentSettings.temperature).toBe(0.7);
    expect(updatedAgentSettings.maxTokens).toBe(64000);
    expect(updatedAgentSettings.functionCallingEnabled).toBe(true);
    expect(updatedAgentSettings.thinkingEnabled).toBe(false);
    expect(updatedAgentSettings.minP).toBe(0);
    expect(updatedAgentSettings.repeatPenalty).toBe(1.0);
    expect(updatedAgentSettings.seed).toBeNull();
    expect(updatedAgentSettings.serviceTier).toBe("auto");

    const updatedChatSettings = updateSettings(currentSettings, true);

    expect(updatedChatSettings.provider).toBe("anthropic");
    expect(updatedChatSettings.model).toBe("claude-sonnet-4-5-20250929");
    expect(updatedChatSettings.temperature).toBe(0.7);
    expect(updatedChatSettings.maxTokens).toBe(64000);
    expect(updatedChatSettings.functionCallingEnabled).toBe(false);
    expect(updatedChatSettings.thinkingEnabled).toBe(false);
    expect(updatedChatSettings.minP).toBe(0);
    expect(updatedChatSettings.repeatPenalty).toBe(1.0);
    expect(updatedChatSettings.seed).toBeNull();
    expect(updatedChatSettings.serviceTier).toBe("");
  });
});
