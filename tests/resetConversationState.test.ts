import { describe, it, expect } from "vitest";

const MOCK_SETTINGS_DEFAULTS = {
  provider: "",
  model: "",
  systemPrompt: "",
  temperature: 1.0,
  maxTokens: 2048,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: "",
  thinkingEnabled: true,
  reasoningEffort: "high",
  thinkingLevel: "high",
  thinkingBudget: "",
  webSearchEnabled: false,
};

describe("resetConversationState model parameter resetting", () => {
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

    interface TestModelOption {
      name: string;
      defaultTemperature?: number;
    }

    interface TestConversationSettingsInput {
      provider?: string;
      model?: string;
      agents?: {
        workspaceEnabled?: boolean;
      };
    }

    const updateSettings = (
      settings: TestConversationSettingsInput,
      isNoAgent: boolean,
    ) => {
      let defaultTemperature = 1.0;
      if (mockConfig && settings.provider && settings.model) {
        const providerModels =
          (mockConfig.textToText?.models as Record<string, TestModelOption[]>)?.[settings.provider] || [];
        const modelDefinition = providerModels.find(
          (model: TestModelOption) => model.name === settings.model,
        );
        if (
          modelDefinition &&
          modelDefinition.defaultTemperature !== undefined
        ) {
          defaultTemperature = modelDefinition.defaultTemperature;
        }
      }

      const persistedWorkspaceToggle =
        typeof window !== "undefined"
          ? localStorage.getItem("agent:workspaceTogglePreference")
          : null;
      const workspaceEnabledPreference =
        persistedWorkspaceToggle !== null
          ? persistedWorkspaceToggle !== "false"
          : true;

      return {
        ...MOCK_SETTINGS_DEFAULTS,
        provider: settings.provider,
        model: settings.model,
        agents: {
          ...settings.agents,
          workspaceEnabled: workspaceEnabledPreference,
        },
        temperature: defaultTemperature,
        maxTokens: 64000,
        functionCallingEnabled: !isNoAgent,
        thinkingEnabled: true,
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
    expect(updatedAgentSettings.thinkingEnabled).toBe(true);
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
    expect(updatedChatSettings.thinkingEnabled).toBe(true);
    expect(updatedChatSettings.minP).toBe(0);
    expect(updatedChatSettings.repeatPenalty).toBe(1.0);
    expect(updatedChatSettings.seed).toBeNull();
    expect(updatedChatSettings.serviceTier).toBe("");
  });

  it("should default thinkingEnabled to true for models that support thinking", () => {
    const mockConfig = {
      textToText: {
        models: {
          google: [
            {
              name: "gemini-3.5-flash",
              thinking: true,
            },
          ],
          deepseek: [
            {
              name: "deepseek-reasoner",
              thinkingLevels: ["high", "minimal"],
            },
          ],
          anthropic: [
            {
              name: "claude-3-5-sonnet",
              supportsThinking: true,
            },
          ],
          ollama: [
            {
              name: "custom-thinking-model",
              tools: ["Thinking", "Web Search"],
            },
          ],
          "lm-studio": [
            {
              name: "qwen3-7b-instruct",
            },
            {
              name: "generic-llama-3",
            },
          ],
        },
      },
    };

    const updateSettings = (
      settings: { provider: string; model: string },
    ) => {
      return {
        ...MOCK_SETTINGS_DEFAULTS,
        provider: settings.provider,
        model: settings.model,
        thinkingEnabled: true,
      };
    };

    const googleSettings = updateSettings({ provider: "google", model: "gemini-3.5-flash" });
    expect(googleSettings.thinkingEnabled).toBe(true);

    const deepseekSettings = updateSettings({ provider: "deepseek", model: "deepseek-reasoner" });
    expect(deepseekSettings.thinkingEnabled).toBe(true);

    const anthropicSettings = updateSettings({ provider: "anthropic", model: "claude-3-5-sonnet" });
    expect(anthropicSettings.thinkingEnabled).toBe(true);

    const ollamaSettings = updateSettings({ provider: "ollama", model: "custom-thinking-model" });
    expect(ollamaSettings.thinkingEnabled).toBe(true);

    const lmStudioQwenSettings = updateSettings({ provider: "lm-studio", model: "qwen3-7b-instruct" });
    expect(lmStudioQwenSettings.thinkingEnabled).toBe(true);

    const lmStudioLlamaSettings = updateSettings({ provider: "lm-studio", model: "generic-llama-3" });
    expect(lmStudioLlamaSettings.thinkingEnabled).toBe(true);

    const standardSettings = updateSettings({ provider: "google", model: "gemini-2.0-flash" });
    expect(standardSettings.thinkingEnabled).toBe(true);
  });
});
