"use client";

import { Settings2, RotateCcw } from "lucide-react";
import {
  InputComponent,
  SelectComponent,
  SliderComponent,
} from "@rodrigo-barraza/components-library";
import type { PrismSettings, PrismConfig, ModelOption, ParameterDescriptor } from "../types/types";
import styles from "./SettingsPanelComponent.module.css";

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

  // Anthropic thinking models lock temperature to 1
  const isAnthropicThinkingLocked =
    isReasoningModel &&
    settings.thinkingEnabled &&
    currentProvider === "anthropic";

  // Anthropic max temperature cap
  const anthropicMaxTemperature = currentProvider === "anthropic" ? 1 : 2;

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

    // Special handling for temperature when Anthropic thinking is locked
    if (descriptor.key === "temperature" && isAnthropicThinkingLocked) {
      return (
        <div className={styles.formGroup} key={descriptor.key}>
          <label>{descriptor.label} (1 — Locked by Thinking)</label>
          {!readOnly && (
            <SliderComponent
              min={descriptor.min ?? 0}
              max={anthropicMaxTemperature}
              step={descriptor.step ?? 0.1}
              value={1}
              onChange={() => {}}
              disabled={true}
            />
          )}
        </div>
      );
    }

    // Special handling for temperature max on Anthropic
    const effectiveMax =
      descriptor.key === "temperature" ? anthropicMaxTemperature : descriptor.max;

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
        : descriptor.options;

    // Service tier: OpenAI and Anthropic have different options
    const effectiveServiceTierOptions =
      descriptor.key === "serviceTier"
        ? [
            { value: "", label: "Default" },
            { value: "auto", label: "Auto" },
            ...(currentProvider === "openai"
              ? [
                  { value: "default", label: "Standard" },
                  { value: "priority", label: "Priority" },
                ]
              : currentProvider === "anthropic"
                ? [{ value: "standard_only", label: "Standard Only" }]
                : []),
          ]
        : effectiveOptions;

    switch (descriptor.controlType) {
      case "slider": {
        const sliderMax =
          descriptor.key === "maxTokens" ? effectiveMaxTokens : effectiveMax;
        const numericValue = typeof currentValue === "number" ? currentValue : Number(currentValue) || 0;
        const clampedValue = Math.min(numericValue, sliderMax ?? numericValue);

        return (
          <div className={styles.formGroup} key={descriptor.key}>
            <label>
              {descriptor.label} ({clampedValue})
            </label>
            {!readOnly && (
              <SliderComponent
                min={descriptor.min ?? 0}
                max={sliderMax ?? 1}
                step={effectiveStep ?? 0.1}
                value={clampedValue}
                onChange={(value: number) => handleParameterChange(descriptor.key, value)}
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
          <div className={styles.formGroup} key={descriptor.key}>
            <label>{descriptor.label}</label>
            {readOnly ? (
              <div className={styles.readOnlyValue}>
                {String(currentValue) ||
                  selectOptions?.find((option) => option.value === currentValue)?.label ||
                  "Default"}
              </div>
            ) : (
              <SelectComponent
                value={String(currentValue || "")}
                options={selectOptions || []}
                onChange={(value: string) => handleParameterChange(descriptor.key, value)}
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
          <div className={styles.formGroup} key={descriptor.key}>
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
              />
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  if (isSpecialModel || settings.provider === "ollama") {
    return (
      <div className={styles.container}>
        <div className={styles.sectionTitle}>
          <Settings2 size={16} /> Parameters
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          No configurable parameters for this model type.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.sectionTitle}>
        <Settings2 size={16} /> Parameters
        {isAgentMode && (
          <span
            style={{
              fontSize: 10,
              color: "var(--accent-primary)",
              marginInlineStart: 8,
              opacity: 0.8,
              fontWeight: 500,
            }}
          >
            Agent Defaults
          </span>
        )}
      </div>

      {GROUP_ORDER.map((group) => {
        const groupDescriptors = groupedDescriptors[group];
        if (!groupDescriptors || groupDescriptors.length === 0) return null;

        return (
          <div key={group}>
            {group !== "output" && <div className={styles.sectionSeparator} />}
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
