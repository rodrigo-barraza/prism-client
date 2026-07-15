import { describe, it, expect, beforeEach } from "vitest";

import { buildResetConversationSettings } from "../conversationReset";
import { LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE } from "../../constants";
import type { PrismConfig, PrismSettings } from "../../types/types";

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
    defaults: {},
  },
  parameterDescriptors: [
    { key: "temperature", defaultValue: 1.0 },
    { key: "topP", defaultValue: 1 },
    { key: "thinkingEnabled", defaultValue: false },
    { key: "reasoningEffort", defaultValue: "high" },
  ],
} as unknown as PrismConfig;

const currentSettings: PrismSettings = {
  provider: "anthropic",
  model: "claude-sonnet-4-5-20250929",
  temperature: 0.2,
  maxTokens: 1000,
  topP: 0.5,
  reasoningEffort: "low",
  frequencyPenalty: 1.5,
  presencePenalty: -1.0,
  minP: 0.1,
  repeatPenalty: 1.2,
  seed: 42,
  agents: { subAgentProvider: "google", workspaceEnabled: false },
};

describe("buildResetConversationSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resets model parameters to defaults while keeping provider and model (agent mode)", () => {
    const settings = buildResetConversationSettings(
      mockConfig,
      currentSettings,
      false,
    );

    expect(settings.provider).toBe("anthropic");
    expect(settings.model).toBe("claude-sonnet-4-5-20250929");
    // temperature comes from the model's own defaultTemperature, not the
    // descriptor default and not the previous conversation's value
    expect(settings.temperature).toBe(0.7);
    expect(settings.maxTokens).toBe(64000);
    expect(settings.functionCallingEnabled).toBe(true);
    expect(settings.minP).toBe(0);
    expect(settings.repeatPenalty).toBe(1.0);
    expect(settings.seed).toBeNull();
    expect(settings.serviceTier).toBe("auto");
    // descriptor defaults flow through for parameters without overrides
    expect(settings.topP).toBe(1);
    expect(settings.reasoningEffort).toBe("high");
  });

  it("disables function calling and service tier in agentless mode", () => {
    const settings = buildResetConversationSettings(
      mockConfig,
      currentSettings,
      true,
    );

    expect(settings.functionCallingEnabled).toBe(false);
    expect(settings.serviceTier).toBe("");
  });

  it("forces thinkingEnabled to true even when the descriptor default is false", () => {
    const settings = buildResetConversationSettings(
      mockConfig,
      currentSettings,
      false,
    );
    expect(settings.thinkingEnabled).toBe(true);
  });

  it("falls back to temperature 1.0 when the model has no defaultTemperature", () => {
    const settings = buildResetConversationSettings(
      mockConfig,
      { provider: "anthropic", model: "unknown-model" },
      false,
    );
    expect(settings.temperature).toBe(1.0);
  });

  it("falls back to temperature 1.0 when config is unavailable", () => {
    const settings = buildResetConversationSettings(
      null,
      currentSettings,
      false,
    );
    expect(settings.temperature).toBe(1.0);
  });

  it("restores the persisted workspace toggle preference from localStorage", () => {
    localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE, "false");
    const disabled = buildResetConversationSettings(
      mockConfig,
      currentSettings,
      false,
    );
    expect(disabled.agents?.workspaceEnabled).toBe(false);

    localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE, "true");
    const enabled = buildResetConversationSettings(
      mockConfig,
      currentSettings,
      false,
    );
    expect(enabled.agents?.workspaceEnabled).toBe(true);
  });

  it("defaults workspace to enabled when no preference is persisted, preserving other agent settings", () => {
    const settings = buildResetConversationSettings(
      mockConfig,
      currentSettings,
      false,
    );
    expect(settings.agents?.workspaceEnabled).toBe(true);
    // Non-workspace agent settings carry over from the current conversation
    expect(settings.agents?.subAgentProvider).toBe("google");
  });
});
