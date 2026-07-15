import { buildSettingsDefaults } from "./utilities";
import { LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE } from "../constants";
import type { PrismConfig, PrismSettings } from "../types/types";

export type ResetConversationSettings = PrismSettings & {
  maxTokens: number;
  functionCallingEnabled: boolean;
  thinkingEnabled: boolean;
  parallelToolCalls: boolean;
  candidateCount: number;
  responseMimeType: string;
  store: boolean;
  mediaResolution: string;
  topLogprobs: number;
  responseLogprobs: boolean;
  logprobs: number;
};

/**
 * Build the settings object for a freshly reset conversation.
 *
 * Keeps the current provider/model selection, restores every model
 * parameter to its authoritative default (server parameter descriptors,
 * then the model's own defaultTemperature), and re-applies the user's
 * persisted workspace-toggle preference rather than carrying over
 * whatever state the previous conversation had.
 */
export function buildResetConversationSettings(
  config: PrismConfig | null | undefined,
  currentSettings: PrismSettings,
  isNoAgent: boolean,
): ResetConversationSettings {
  let defaultTemperature = 1.0;
  if (config && currentSettings.provider && currentSettings.model) {
    const providerModels =
      config.textToText?.models?.[currentSettings.provider] || [];
    const modelDefinition = providerModels.find(
      (model) => model.name === currentSettings.model,
    );
    if (modelDefinition && modelDefinition.defaultTemperature !== undefined) {
      defaultTemperature = modelDefinition.defaultTemperature;
    }
  }

  // Restore the user's persisted workspace toggle preference for new conversations.
  // This reads from localStorage (explicit user action) rather than carrying over
  // whatever state the previous/loaded conversation had.
  const persistedWorkspaceToggle =
    typeof window !== "undefined"
      ? localStorage.getItem(LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE)
      : null;
  const workspaceEnabledPreference =
    persistedWorkspaceToggle !== null
      ? persistedWorkspaceToggle !== "false"
      : true;

  return {
    ...buildSettingsDefaults(config?.parameterDescriptors),
    provider: currentSettings.provider,
    model: currentSettings.model,
    agents: {
      ...currentSettings.agents,
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
}
