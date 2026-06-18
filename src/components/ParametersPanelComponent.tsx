"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings2, RotateCcw, HardDrive } from "lucide-react";
import {
  InputComponent,
  SelectComponent,
  SliderComponent,
} from "@rodrigo-barraza/components-library";
import PrismService from "../services/PrismService";
import type { PrismSettings, PrismConfig, ModelOption, ParameterDescriptor } from "../types/types";
import styles from "./SettingsPanelComponent.module.css";

interface LoadedModelConfig {
  contextLength: number | null;
  evalBatchSize: number | null;
  flashAttention: boolean | null;
  kvCacheOffloaded: boolean | null;
  gpuLayers: number | null;
  instanceId: string | null;
  sizeVram?: number | null;
  expiresAt?: string | null;
}

/**
 * Format bytes to human readable format.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const kilobyte = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(kilobyte));
  return `${parseFloat((bytes / Math.pow(kilobyte, index)).toFixed(2))} ${sizes[index]}`;
}

export interface ParametersPanelProps {
  settings: PrismSettings;
  onChange?: (changes: Partial<PrismSettings>) => void;
  config: PrismConfig | null;
  readOnly?: boolean;
  isAgentMode?: boolean;
}

interface ExtendedModelOption extends ModelOption {
  _isImageGen?: boolean;
  _isTranscription?: boolean;
  _isTTS?: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  output: "Output",
  sampling: "Sampling",
  reasoning: "Reasoning",
  penalties: "Penalties",
  advanced: "Advanced",
};

const GROUP_ORDER = ["output", "reasoning", "sampling", "penalties", "advanced"];

export default function ParametersPanelComponent({
  settings,
  onChange,
  config,
  readOnly = false,
  isAgentMode = false,
}: ParametersPanelProps) {
  const textModelsMap = config?.textToText?.models || {};
  const imageModelsMap = config?.textToImage?.models || {};
  const audioToTextModelsMap = config?.audioToText?.models || {};
  const ttsModelsMap = config?.textToSpeech?.models || {};

  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);
  const modelsMap: Record<string, ExtendedModelOption[]> = {};
  for (const providerKey of allProviderKeys) {
    const textModels = (textModelsMap[providerKey] || []) as ExtendedModelOption[];
    const imageGenerationModels = ((imageModelsMap[providerKey] || []) as ExtendedModelOption[]).map(
      (model) => ({ ...model, _isImageGen: true }),
    );
    const speechToTextModels = (
      (audioToTextModelsMap[providerKey] || []) as ExtendedModelOption[]
    ).map((model) => ({ ...model, _isTranscription: true }));
    const textToSpeechModels = ((ttsModelsMap[providerKey] || []) as ExtendedModelOption[]).map(
      (model) => ({ ...model, _isTTS: true }),
    );

    const seenModelNames = new Set<string>();
    const mergedModels: ExtendedModelOption[] = [];
    for (const model of [...textModels, ...imageGenerationModels, ...speechToTextModels, ...textToSpeechModels]) {
      if (!seenModelNames.has(model.name)) {
        seenModelNames.add(model.name);
        mergedModels.push(model);
      }
    }
    modelsMap[providerKey] = mergedModels;
  }

  const currentProviderModels = modelsMap[settings.provider || ""] || [];
  const selectedModelDefinition = currentProviderModels.find(
    (model) => model.name === settings.model,
  );
  const isReasoningModel =
    selectedModelDefinition?.thinking ||
    (settings.model || "").includes("o1") ||
    (settings.model || "").includes("o3");
  const isTranscriptionModel = selectedModelDefinition?._isTranscription === true;
  const isTextToSpeechModel = selectedModelDefinition?._isTTS === true;
  const isSpecialModel = isTranscriptionModel || isTextToSpeechModel;

  const descriptors = config?.parameterDescriptors || [];
  const currentProvider = settings.provider || "";

  // Resolve per-provider overrides for any descriptor
  const getProviderOverride = (descriptor: ParameterDescriptor) => {
    return descriptor.providerOverrides?.[currentProvider];
  };

  const handleParameterChange = (key: string, value: unknown) => {
    onChange?.({ [key]: value } as Partial<PrismSettings>);
  };

  const resolveDefaultValue = (descriptor: ParameterDescriptor): number | string | boolean => {
    return isAgentMode ? descriptor.agentDefault : descriptor.defaultValue;
  };

  const resolveCurrentValue = (descriptor: ParameterDescriptor): unknown => {
    const settingsValue = (settings as Record<string, unknown>)[descriptor.key];
    if (settingsValue !== undefined && settingsValue !== null) {
      return settingsValue;
    }
    return resolveDefaultValue(descriptor);
  };

  // Filter descriptors to only those applicable to current provider/model
  const filterDescriptors = (allDescriptors: ParameterDescriptor[]): ParameterDescriptor[] => {
    return allDescriptors.filter((descriptor) => {
      // Provider check
      if (!descriptor.providers.includes(currentProvider)) return false;

      // Requires thinking model but current model doesn't support thinking
      if (descriptor.requiresThinking && !isReasoningModel) return false;

      // Requires thinking to be enabled
      if (descriptor.requiresThinking && settings.thinkingEnabled === false) return false;

      // Requires Responses API (OpenAI-specific)
      if (descriptor.requiresResponsesAPI && !selectedModelDefinition?.responsesAPI) return false;

      // Reasoning Summary: only show if model supports it
      if (descriptor.key === "reasoningSummary" && !selectedModelDefinition?.reasoningSummary) return false;

      // Verbosity: only show if model supports it
      if (descriptor.key === "verbosity" && !selectedModelDefinition?.verbosity) return false;

      // Thinking Level: only show if model has thinkingLevels
      if (descriptor.key === "thinkingLevel" && !selectedModelDefinition?.thinkingLevels) return false;

      // Hide sampling/penalty controls when using reasoning models (they're locked/ignored)
      if (descriptor.hideWhenReasoning && isReasoningModel) return false;

      // Response format: only show if model supports JSON mode
      if (descriptor.key === "responseFormat" && !selectedModelDefinition?.jsonMode) return false;

      return true;
    });
  };

  const filteredDescriptors = filterDescriptors(descriptors);

  // Group descriptors by category
  const groupedDescriptors: Record<string, ParameterDescriptor[]> = {};
  for (const descriptor of filteredDescriptors) {
    if (!groupedDescriptors[descriptor.group]) {
      groupedDescriptors[descriptor.group] = [];
    }
    groupedDescriptors[descriptor.group].push(descriptor);
  }

  const handleResetGroup = (group: string) => {
    const groupDescriptors = groupedDescriptors[group];
    if (!groupDescriptors) return;
    const resetChanges: Record<string, unknown> = {};
    for (const descriptor of groupDescriptors) {
      resetChanges[descriptor.key] = resolveDefaultValue(descriptor);
    }
    onChange?.(resetChanges as Partial<PrismSettings>);
  };

  const renderControl = (descriptor: ParameterDescriptor) => {
    const currentValue = resolveCurrentValue(descriptor);
    const providerOverride = getProviderOverride(descriptor);

    // Check if this parameter is locked by provider override or model constraint
    const isProviderLocked = providerOverride?.locked === true;
    const isAnthropicThinkingLocked =
      descriptor.key === "temperature" &&
      isReasoningModel &&
      settings.thinkingEnabled &&
      currentProvider === "anthropic";
    const isLocked = isProviderLocked || isAnthropicThinkingLocked;
    const lockedReason = isProviderLocked
      ? providerOverride?.lockedReason || "Locked by provider"
      : isAnthropicThinkingLocked
        ? "Locked by Thinking (= 1)"
        : undefined;

    // Apply provider-specific max/min overrides
    const effectiveMax = providerOverride?.max ?? descriptor.max;
    const effectiveMin = providerOverride?.min ?? descriptor.min;

    // Special handling for maxTokens — use model's actual max
    const effectiveMaxTokens =
      descriptor.key === "maxTokens"
        ? selectedModelDefinition?.maxOutputTokens || 128000
        : effectiveMax;

    // Dynamic step for maxTokens based on range
    const effectiveStep =
      descriptor.key === "maxTokens"
        ? (effectiveMaxTokens ?? 128000) > 32000
          ? 1024
          : 256
        : descriptor.step;

    // Thinking level: use model's available levels instead of static options
    const effectiveOptions =
      descriptor.key === "thinkingLevel" && selectedModelDefinition?.thinkingLevels
        ? selectedModelDefinition.thinkingLevels.map((level: string) => ({
            value: level,
            label: level.charAt(0).toUpperCase() + level.slice(1),
          }))
        : descriptor.key === "reasoningEffort" && selectedModelDefinition?.thinkingLevels
          ? descriptor.options?.filter((option) =>
              option.value === "none" || selectedModelDefinition.thinkingLevels?.includes(option.value)
            )
          : descriptor.options;

    // Service tier: provider-specific options
    const effectiveServiceTierOptions =
      descriptor.key === "serviceTier"
        ? descriptor.options
        : effectiveOptions;

    switch (descriptor.controlType) {
      case "slider": {
        const sliderMax =
          descriptor.key === "maxTokens" ? effectiveMaxTokens : effectiveMax;
        const numericValue = typeof currentValue === "number" ? currentValue : Number(currentValue) || 0;
        const clampedValue = Math.min(numericValue, sliderMax ?? numericValue);

        return (
          <div className={styles['form-group']} key={descriptor.key}>
            <label>
              {descriptor.label} ({clampedValue})
              {isLocked && (
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginInlineStart: 4 }}>
                  — {lockedReason}
                </span>
              )}
            </label>
            {!readOnly && (
              <SliderComponent
                min={effectiveMin ?? 0}
                max={sliderMax ?? 1}
                step={effectiveStep ?? 0.1}
                value={isLocked ? (isAnthropicThinkingLocked ? 1 : clampedValue) : clampedValue}
                onChange={(value: number) => handleParameterChange(descriptor.key, value)}
                disabled={isLocked}
              />
            )}
          </div>
        );
      }

      case "select": {
        const selectOptions =
          descriptor.key === "serviceTier"
            ? effectiveServiceTierOptions
            : effectiveOptions;

        return (
          <div className={styles['form-group']} key={descriptor.key}>
            <label>
              {descriptor.label}
              {isLocked && (
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginInlineStart: 4 }}>
                  — {lockedReason}
                </span>
              )}
            </label>
            {readOnly ? (
              <div className={styles['read-only-value']}>
                {String(currentValue) ||
                  selectOptions?.find((option) => option.value === currentValue)?.label ||
                  "Default"}
              </div>
            ) : (
              <SelectComponent
                value={String(currentValue || "")}
                options={selectOptions || []}
                onChange={(value: string) => handleParameterChange(descriptor.key, value)}
                disabled={isLocked}
              />
            )}
          </div>
        );
      }

      case "input": {
        const inputType = descriptor.dataType === "number" ? "number" : "text";
        const placeholder =
          descriptor.key === "stopSequences"
            ? "\\n, Human:"
            : descriptor.key === "seed"
              ? "Random"
              : descriptor.key === "thinkingBudget"
                ? "e.g. 1024"
                : "";

        return (
          <div className={styles['form-group']} key={descriptor.key}>
            <label>{descriptor.label}</label>
            {!readOnly && (
              <InputComponent
                type={inputType}
                placeholder={placeholder}
                value={String(currentValue ?? "")}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const inputValue = event.target.value;
                  if (descriptor.dataType === "number") {
                    handleParameterChange(
                      descriptor.key,
                      inputValue === "" ? undefined : inputValue,
                    );
                  } else {
                    handleParameterChange(descriptor.key, inputValue);
                  }
                }}
                disabled={isLocked}
              />
            )}
          </div>
        );
      }

      case "toggle": {
        const isChecked = currentValue === true || currentValue === "true";
        return (
          <div className={styles['form-group']} key={descriptor.key}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: readOnly || isLocked ? "default" : "pointer" }}
            >
              {!readOnly && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => handleParameterChange(descriptor.key, event.target.checked)}
                  disabled={isLocked}
                  style={{ accentColor: "var(--accent-primary)", cursor: isLocked ? "default" : "pointer" }}
                />
              )}
              {descriptor.label}
              {isLocked && (
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  — {lockedReason}
                </span>
              )}
            </label>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const isLmStudioProvider = currentProvider.startsWith("lm-studio");
  const isOllamaProvider = currentProvider.startsWith("ollama");

  // -- Loaded model runtime config (LM Studio / Ollama) --------------
  const [loadedConfig, setLoadedConfig] = useState<LoadedModelConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const fetchLoadedConfig = useCallback(async () => {
    if ((!isLmStudioProvider && !isOllamaProvider) || !settings.model) {
      setLoadedConfig(null);
      return;
    }
    setIsLoadingConfig(true);
    try {
      const response = isLmStudioProvider
        ? await PrismService.getLmStudioModels(currentProvider)
        : await PrismService.getOllamaModels(currentProvider);
      const rawModels =
        (response as unknown as { data?: Array<Record<string, unknown>> }).data ||
        (response as unknown as { models?: Array<Record<string, unknown>> }).models ||
        [];
      const matchedModel = rawModels.find(
        (modelItem: Record<string, unknown>) =>
          modelItem.key === settings.model ||
          modelItem.id === settings.model ||
          modelItem.name === settings.model,
      );
      const loadedInstances = (matchedModel?.loaded_instances as Array<Record<string, unknown>>) || [];
      if (loadedInstances.length > 0) {
        const instanceConfig = loadedInstances[0].config as Record<string, unknown> | undefined;
        setLoadedConfig({
          contextLength: (instanceConfig?.context_length as number) ?? null,
          evalBatchSize: (instanceConfig?.eval_batch_size as number) ?? null,
          flashAttention: (instanceConfig?.flash_attention as boolean) ?? null,
          kvCacheOffloaded: (instanceConfig?.offload_kv_cache_to_gpu as boolean) ?? null,
          gpuLayers: (instanceConfig?.gpu_layers as number) ?? null,
          instanceId: (loadedInstances[0].id as string) ?? null,
          sizeVram: (instanceConfig?.size_vram as number) ?? null,
          expiresAt: (instanceConfig?.expires_at as string) ?? null,
        });
      } else {
        setLoadedConfig(null);
      }
    } catch {
      setLoadedConfig(null);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isLmStudioProvider, isOllamaProvider, settings.model, currentProvider]);

  useEffect(() => {
    fetchLoadedConfig();
  }, [fetchLoadedConfig]);

  if (isSpecialModel) {
    return (
      <div className={styles['container']}>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          No configurable parameters for this model type.
        </p>
      </div>
    );
  }

  return (
    <div className={`parameters-panel-component ${styles['container']}`}>
      {/* Loaded Model Configuration (LM Studio / Ollama) */}
      {(isLmStudioProvider || isOllamaProvider) && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBlockEnd: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-tertiary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <HardDrive size={10} />
              Loaded Config
            </span>
          </div>
          {isLoadingConfig ? (
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
              Loading…
            </p>
          ) : loadedConfig ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {loadedConfig.contextLength !== null && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>Context Length</span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{ fontSize: 11 }}
                  >
                    {loadedConfig.contextLength.toLocaleString()}
                  </span>
                </div>
              )}
              {isLmStudioProvider && loadedConfig.evalBatchSize !== null && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>Eval Batch Size</span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{ fontSize: 11 }}
                  >
                    {loadedConfig.evalBatchSize.toLocaleString()}
                  </span>
                </div>
              )}
              {isLmStudioProvider && loadedConfig.flashAttention !== null && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>Flash Attention</span>
                  <span
                    className={`${styles['modality-status']} ${loadedConfig.flashAttention ? styles['modality-active'] : ''}`}
                    style={{ fontSize: 11 }}
                  >
                    {loadedConfig.flashAttention ? "Enabled" : "Disabled"}
                  </span>
                </div>
              )}
              {isLmStudioProvider && loadedConfig.kvCacheOffloaded !== null && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>GPU KV Cache Offload</span>
                  <span
                    className={`${styles['modality-status']} ${loadedConfig.kvCacheOffloaded ? styles['modality-active'] : ''}`}
                    style={{ fontSize: 11 }}
                  >
                    {loadedConfig.kvCacheOffloaded ? "Enabled" : "Disabled"}
                  </span>
                </div>
              )}
              {isLmStudioProvider && loadedConfig.gpuLayers !== null && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>GPU Layers</span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{ fontSize: 11 }}
                  >
                    {loadedConfig.gpuLayers === -1 ? "All" : loadedConfig.gpuLayers}
                  </span>
                </div>
              )}
              {isOllamaProvider && loadedConfig.sizeVram !== null && loadedConfig.sizeVram !== undefined && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>VRAM Usage</span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{ fontSize: 11 }}
                  >
                    {formatBytes(loadedConfig.sizeVram)}
                  </span>
                </div>
              )}
              {isOllamaProvider && loadedConfig.expiresAt && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-name']} style={{ fontSize: 11 }}>Expires At</span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{ fontSize: 11 }}
                  >
                    {new Date(loadedConfig.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0, opacity: 0.7 }}>
              No model loaded
            </p>
          )}
        </>
      )}

      {GROUP_ORDER.map((group) => {
        const groupDescriptors = groupedDescriptors[group];
        if (!groupDescriptors || groupDescriptors.length === 0) return null;

        return (
          <div key={group}>
            {group !== "output" && <hr style={{ border: 'none', borderTop: '1px solid var(--calculated-border-subtle)', margin: '8px 0' }} />}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBlockEnd: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-tertiary)",
                }}
              >
                {GROUP_LABELS[group] || group}
              </span>
              {!readOnly && (
                <button
                  onClick={() => handleResetGroup(group)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    padding: 2,
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.6,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(event) => {
                    (event.currentTarget as HTMLElement).style.opacity = "1";
                  }}
                  onMouseLeave={(event) => {
                    (event.currentTarget as HTMLElement).style.opacity = "0.6";
                  }}
                  title={`Reset ${GROUP_LABELS[group] || group} to defaults`}
                >
                  <RotateCcw size={10} />
                </button>
              )}
            </div>
            {groupDescriptors.map(renderControl)}
          </div>
        );
      })}
    </div>
  );
}
