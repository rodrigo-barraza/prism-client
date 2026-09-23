"use client";

/**
 * The agent chat's model and generation settings: Prism's model catalog,
 * the settings a turn is sent with, the favorite models, and llama.cpp's
 * runtime props. The model comes from the URL (`?model=`) first, then the
 * agent's remembered model, then the catalog's default.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PrismService from "../services/PrismService";
import { registerModelLabels } from "../components/BadgeComponent";
import useModelMemory from "./useModelMemory";
import { canDisableThinking } from "@/utils/modelCapabilities";
import { buildSettingsDefaults, resolveDefaultModel } from "../utils/utilities";
import {
  AGENT_IDS,
  LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE,
  STORAGE_KEY_MODEL_MEMORY_AGENT,
  STORAGE_KEY_MODEL_MEMORY_AGENT_PREFIX,
} from "../constants";
import type { LlamaCppServerProps, ModelOption, PrismConfig, PrismSettings } from "../types/types";

export type ChatSettings = PrismSettings & {
  maxTokens: number;
  functionCallingEnabled: boolean;
  thinkingEnabled: boolean;
  codeExecutionEnabled?: boolean;
  urlContextEnabled?: boolean;
};

interface UseChatModelSettingsOptions {
  agentId: string;
  isNoAgent: boolean;
  /** `provider:model` from the URL. */
  initialModel: string | null;
  initialFcEnabled: boolean;
  initialThinkingEnabled: boolean;
}

export default function useChatModelSettings({
  agentId,
  isNoAgent,
  initialModel,
  initialFcEnabled,
  initialThinkingEnabled,
}: UseChatModelSettingsOptions) {
  const [config, setConfig] = useState<PrismConfig | null>(null);
  // Track whether the URL model param has been applied — prevents re-apply on re-render
  const urlModelAppliedRef = useRef<boolean>(false);
  const previousModelRef = useRef<string | null>(null);
  const modelMemoryKey =
    agentId === AGENT_IDS.CODING
      ? STORAGE_KEY_MODEL_MEMORY_AGENT
      : STORAGE_KEY_MODEL_MEMORY_AGENT_PREFIX + agentId;
  // -- Model memory (persist last-used model per agent) ----------
  const { saveModel, restoreModel } = useModelMemory(modelMemoryKey);

  const [settings, setSettings] = useState<ChatSettings>(() => {
    const persistedWorkspaceToggle =
      typeof window !== "undefined"
        ? localStorage.getItem(LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE)
        : null;
    const workspaceEnabledPreference =
      persistedWorkspaceToggle !== null
        ? persistedWorkspaceToggle !== "false"
        : true;

    return {
      maxTokens: 64000,
      functionCallingEnabled: initialFcEnabled ? true : !isNoAgent,
      thinkingEnabled: initialThinkingEnabled
        ? true
        : (buildSettingsDefaults(config?.parameterDescriptors).thinkingEnabled as boolean) || false,
      agents: {
        workspaceEnabled: workspaceEnabledPreference,
      },
    };
  });

  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  // -- llama.cpp server runtime props (fetched when provider is llama-cpp) --
  const [llamaCppServerProps, setLlamaCppServerProps] =
    useState<LlamaCppServerProps | null>(null);

  // -- Filtered config: only tool-calling models for agents; all text models for Direct Chat ------------
  const filteredConfig = useMemo(() => {
    if (!config) return null;

    // Direct Chat: show ALL text models — no FC restriction
    if (isNoAgent) {
      return {
        ...config,
        textToImage: { models: {} },
        textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
        audioToText: { models: {} },
        embedding: { models: {} },
      } as PrismConfig;
    }

    const textModelsMap = config.textToText?.models || {};
    const filteredTextModels: Record<string, ModelOption[]> = {};

    for (const [provider, models] of Object.entries(
      textModelsMap as Record<string, ModelOption[]>,
    )) {
      const fcModels = models.filter((model: ModelOption) =>
        model.tools?.includes("Tool Calling"),
      );
      if (fcModels.length > 0) filteredTextModels[provider] = fcModels;
    }

    const filteredProviderList = (config.providerList || []).filter(
      (provider) => filteredTextModels[provider],
    );

    return {
      ...config,
      providerList: filteredProviderList,
      textToText: {
        ...config.textToText,
        models: filteredTextModels,
      },
      textToImage: { models: {} },
      textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
      audioToText: { models: {} },
      embedding: { models: {} },
    } as PrismConfig;
  }, [config, isNoAgent]);

  // Load favorite models
  useEffect(() => {
    PrismService.getFavorites("model")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((file) => file.key)),
      )
      .catch(() => {});
  }, []);

  // Fetch Prism config and restore remembered model (or auto-select first FC-capable)
  // URL ?model= param takes highest priority over localStorage memory.
  useEffect(() => {
    /** Try to apply the URL model param against the given config. */
    const tryApplyUrlModel = (config: PrismConfig) => {
      if (!initialModel || urlModelAppliedRef.current) return false;
      const [urlProvider, ...rest] = initialModel.split(":");
      const urlModelName = rest.join(":"); // handles model names with colons
      if (!urlProvider || !urlModelName) return false;
      const providerModels = config.textToText?.models?.[urlProvider] || [];
      const modelDef = providerModels.find((model) => model.name === urlModelName);
      if (!modelDef) return false; // model not (yet) in config — may arrive with local merge
      // FC gate for agent mode
      if (!isNoAgent && !modelDef.tools?.includes("Tool Calling")) return false;
      setSettings((state) => ({
        ...state,
        provider: urlProvider,
        model: urlModelName,
        temperature: modelDef.defaultTemperature ?? 1.0,
      }));
      urlModelAppliedRef.current = true;
      return true;
    };

    const fcFallback = (config: PrismConfig) => {
      const { provider, model, temperature } = resolveDefaultModel(
        config,
        !isNoAgent,
      );
      if (provider && model) {
        setSettings((state) => ({
          ...state,
          provider,
          model,
          temperature,
        }));
      }
    };

    PrismService.getConfigWithLocalModels({
      onConfig: (config: PrismConfig) => {
        setConfig(config);

        // Populate the dynamic model label map from all modality catalogs
        const labelMap: Record<string, string> = {};
        for (const modality of [config.textToText, config.textToSpeech, config.textToImage, config.imageToText, config.embedding, config.audioToText]) {
          if (!modality?.models) continue;
          for (const providerModels of Object.values(modality.models)) {
            for (const model of providerModels) {
              if (model.name && model.label) {
                labelMap[model.name] = model.label;
              }
            }
          }
        }
        registerModelLabels(labelMap);
        // URL model param takes priority over localStorage memory
        if (!tryApplyUrlModel(config)) {
          restoreModel(config, setSettings, {
            fcOnly: !isNoAgent,
            fallback: fcFallback,
          });
        }
      },
      onLocalMerge: (merged: PrismConfig) => {
        setConfig(merged);
        // Retry URL model param in case the model is a local model
        if (!tryApplyUrlModel(merged)) {
          restoreModel(merged, setSettings, {
            fcOnly: !isNoAgent,
            fallback: fcFallback,
          });
        }
      },
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronise settings when provider/model changes to ensure thinking is properly defaulted/forced
  useEffect(() => {
    if (!config || !settings.provider || !settings.model) return;
    const providerModels = config.textToText?.models?.[settings.provider] || [];
    const modelDef = providerModels.find((model) => model.name === settings.model);
    if (!modelDef) return;

    const modelChanged = previousModelRef.current !== settings.model;
    previousModelRef.current = settings.model;

    // Always-on thinking is a model capability, fully derivable from the
    // catalog — but NOT from thinkingLevels alone. Gemini 3.7 Flash has no
    // "minimal" rung yet switches thinking off via thinkingBudget: 0, so the
    // old "can't drop to minimal ⇒ always on" reading would pin thinking on
    // for the default model. The server states it outright where the level
    // list is ambiguous; canDisableThinking() applies the fallback.
    const canDisable = canDisableThinking(modelDef);
    const isThinkingAlwaysOn = !canDisable && modelDef.thinking;

    // Anthropic adaptive thinking models (Fable 5, Mythos 5, Opus 4.7+) have
    // thinking as an inherent capability — default it on when switching to them.
    const isAdaptiveThinking =
      modelDef.adaptiveThinking === true && modelDef.thinking;

    if (isThinkingAlwaysOn && !settings.thinkingEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setSettings((previousSettings) => ({
        ...previousSettings,
        thinkingEnabled: true,
      }));
    } else if (isAdaptiveThinking && modelChanged && !settings.thinkingEnabled) {
      setSettings((previousSettings) => ({
        ...previousSettings,
        thinkingEnabled: true,
      }));
    }
  }, [config, settings.provider, settings.model, settings.thinkingEnabled]);

  // Fetch llama.cpp server runtime properties when provider is llama-cpp
  useEffect(() => {
    const providerKey = settings.provider || "";
    const isLlamaCpp = providerKey === "llama-cpp" || providerKey.startsWith("llama-cpp-");
    if (!isLlamaCpp) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLlamaCppServerProps(null);
      return;
    }
    let cancelled = false;
    PrismService.getLlamaCppServerProps(providerKey).then((serverProperties) => {
      if (!cancelled) setLlamaCppServerProps(serverProperties);
    });
    return () => { cancelled = true; };
  }, [settings.provider, settings.model]);

  /**
   * Pick a model in the header: it becomes the conversation's (patched onto
   * the saved conversation, when there is one) and the agent's remembered model.
   */
  const selectModel = useCallback(
    (provider: string, modelName: string, conversation: { id: string | null; project: string | undefined }) => {
      const modelDef = (
        filteredConfig?.textToText?.models?.[provider] || []
      ).find((model: ModelOption) => model.name === modelName);
      const temp = modelDef?.defaultTemperature ?? 1.0;
      setSettings((state) => ({
        ...state,
        provider,
        model: modelName,
        temperature: temp,
      }));
      if (conversation.id) {
        PrismService.patchConversation(
          conversation.id,
          {
            settings: {
              ...settings,
              provider,
              model: modelName,
              temperature: temp,
            },
          },
          conversation.project || undefined,
        ).catch((err) => {
          console.error(
            "Failed to patch conversation settings:",
            err,
          );
        });
      }
      saveModel(provider, modelName);
    },
    [filteredConfig, settings, saveModel],
  );

  const toggleFavoriteModel = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((previousFavoriteKeys) =>
          previousFavoriteKeys.filter((k) => k !== key),
        );
        PrismService.removeFavorite("model", key).catch(() => {});
      } else {
        setFavoriteKeys((previousFavoriteKeys) => [
          ...previousFavoriteKeys,
          key,
        ]);
        const [provider, ...rest] = key.split(":");
        PrismService.addFavorite("model", key, {
          provider,
          name: rest.join(":"),
        }).catch(() => {});
      }
    },
    [favoriteKeys],
  );

  return {
    config,
    filteredConfig,
    settings,
    setSettings,
    favoriteKeys,
    toggleFavoriteModel,
    selectModel,
    llamaCppServerProps,
  };
}

export type ChatModelSettings = ReturnType<typeof useChatModelSettings>;
