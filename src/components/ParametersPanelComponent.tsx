"use client";

import { Settings2 } from "lucide-react";
import {
  InputComponent,
  SelectComponent,
  SliderComponent,
} from "@rodrigo-barraza/components-library";
import type { PrismSettings, PrismConfig, ModelOption } from "../types/types";
import styles from "./SettingsPanelComponent.module.css";

export interface ParametersPanelProps {
  settings: PrismSettings;
  onChange?: (changes: Partial<PrismSettings>) => void;
  config: PrismConfig | null;
  readOnly?: boolean;
}

interface ExtendedModelOption extends ModelOption {
  _isImageGen?: boolean;
  _isTranscription?: boolean;
  _isTTS?: boolean;
}

export default function ParametersPanelComponent({
  settings,
  onChange,
  config,
  readOnly = false,
}: ParametersPanelProps) {
  const textModelsMap = config?.textToText?.models || {};
  const imageModelsMap = config?.textToImage?.models || {};
  const audioToTextModelsMap = config?.audioToText?.models || {};
  const ttsModelsMap = config?.textToSpeech?.models || {};

  // Build merged models map
  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);
  const modelsMap: Record<string, ExtendedModelOption[]> = {};
  for (const p of allProviderKeys) {
    const textModels = (textModelsMap[p] || []) as ExtendedModelOption[];
    const imgModels = ((imageModelsMap[p] || []) as ExtendedModelOption[]).map(
      (m) => ({
        ...m,
        _isImageGen: true,
      }),
    );
    const sttModels = (
      (audioToTextModelsMap[p] || []) as ExtendedModelOption[]
    ).map((m) => ({
      ...m,
      _isTranscription: true,
    }));
    const ttsModels = ((ttsModelsMap[p] || []) as ExtendedModelOption[]).map(
      (m) => ({
        ...m,
        _isTTS: true,
      }),
    );

    const seen = new Set<string>();
    const merged: ExtendedModelOption[] = [];
    for (const m of [...textModels, ...imgModels, ...sttModels, ...ttsModels]) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        merged.push(m);
      }
    }
    modelsMap[p] = merged;
  }

  const currentProviderModels = modelsMap[settings.provider || ""] || [];
  const selectedModelDef = currentProviderModels.find(
    (m) => m.name === settings.model,
  );
  const isReasoning =
    selectedModelDef?.thinking ||
    (settings.model || "").includes("o1") ||
    (settings.model || "").includes("o3");
  const isTranscription = selectedModelDef?._isTranscription === true;
  const isTTS = selectedModelDef?._isTTS === true;
  const isSpecialModel = isTranscription || isTTS;

  const handleTempChange = (value: number) => {
    onChange?.({ temperature: value });
  };
  const handleMaxTokensChange = (value: number) => {
    onChange?.({ maxTokens: value });
  };
  const handleTopPChange = (value: number) => {
    onChange?.({ topP: value });
  };
  const handleTopKChange = (value: number) => {
    onChange?.({ topK: value });
  };
  const handleFreqPenaltyChange = (value: number) => {
    onChange?.({ frequencyPenalty: value });
  };
  const handlePresPenaltyChange = (value: number) => {
    onChange?.({ presencePenalty: value });
  };
  const handleMinPChange = (value: number) => {
    onChange?.({ minP: value });
  };
  const handleRepeatPenaltyChange = (value: number) => {
    onChange?.({ repeatPenalty: value });
  };
  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    onChange?.({ seed: inputValue === "" ? undefined : inputValue });
  };
  const handleStopSeqChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange?.({ stopSequences: e.target.value });
  const handleReasoningEffortChange = (value: string) => {
    onChange?.({ reasoningEffort: value });
  };
  const handleThinkingLevelChange = (value: string) => {
    onChange?.({ thinkingLevel: value });
  };
  const handleThinkingBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange?.({ thinkingBudget: e.target.value });
  const handleVerbosityChange = (value: string) => {
    onChange?.({ verbosity: value });
  };
  const handleReasoningSummaryChange = (value: string) => {
    onChange?.({ reasoningSummary: value });
  };
  const handleResponseFormatChange = (value: string) => {
    onChange?.({ responseFormat: value });
  };
  const handleServiceTierChange = (value: string) => {
    onChange?.({ serviceTier: value });
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
      </div>

      {(() => {
        const thinkingLocked =
          isReasoning &&
          settings.thinkingEnabled &&
          (settings.provider || "") === "anthropic";
        const maxTemp = (settings.provider || "") === "anthropic" ? 1 : 2;
        return (
          <div className={styles.formGroup}>
            <label>
              Temperature (
              {thinkingLocked ? "1 — Locked" : (settings.temperature ?? 1)})
            </label>
            {!readOnly && (
              <SliderComponent
                min={0}
                max={maxTemp}
                step={0.1}
                value={thinkingLocked ? 1 : (settings.temperature ?? 1)}
                onChange={handleTempChange}
                disabled={thinkingLocked}
              />
            )}
          </div>
        );
      })()}

      {(() => {
        const maxOutput = selectedModelDef?.maxOutputTokens || 128000;
        // Round step to nearest power based on range — keep slider snappy
        const step = maxOutput > 32000 ? 1024 : 256;
        return (
          <div className={styles.formGroup}>
            <label>Max Tokens ({settings.maxTokens ?? 2048})</label>
            {!readOnly && (
              <SliderComponent
                min={256}
                max={maxOutput}
                step={step}
                value={Math.min(settings.maxTokens ?? 2048, maxOutput)}
                onChange={handleMaxTokensChange}
              />
            )}
          </div>
        );
      })()}

      {(isReasoning && selectedModelDef?.responsesAPI) ||
      (readOnly && settings.reasoningEffort) ? (
        <>
          <div className={styles.formGroup}>
            <label>Reasoning Effort</label>
            {readOnly ? (
              <div className={styles.readOnlyValue}>
                {settings.reasoningEffort || "high"}
              </div>
            ) : (
              <SelectComponent
                value={settings.reasoningEffort || "high"}
                options={[
                  { value: "none", label: "None" },
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "xhigh", label: "Extra High" },
                ]}
                onChange={handleReasoningEffortChange}
              />
            )}
          </div>

          {(selectedModelDef?.reasoningSummary ||
            (readOnly && settings.reasoningSummary)) && (
            <div className={styles.formGroup}>
              <label>Reasoning Summary</label>
              {readOnly ? (
                <div className={styles.readOnlyValue}>
                  {settings.reasoningSummary || "auto"}
                </div>
              ) : (
                <SelectComponent
                  value={settings.reasoningSummary || "auto"}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "concise", label: "Concise" },
                    { value: "detailed", label: "Detailed" },
                  ]}
                  onChange={handleReasoningSummaryChange}
                />
              )}
            </div>
          )}
        </>
      ) : null}

      {/* Thinking sub-settings — shown when Thinking is toggled on */}
      {isReasoning &&
        !selectedModelDef?.responsesAPI &&
        (settings.thinkingEnabled ||
          ((settings.provider || "") === "lm-studio" &&
            settings.thinkingEnabled !== false)) && (
          <>
            {[
              "openai",
              "lm-studio",
              "vllm",
              "anthropic",
              "ollama",
              "llama-cpp",
            ].includes(settings.provider || "") && (
              <div className={styles.formGroup}>
                <label>Reasoning Effort</label>
                <SelectComponent
                  value={settings.reasoningEffort || "high"}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  onChange={handleReasoningEffortChange}
                />
              </div>
            )}

            {selectedModelDef?.thinkingLevels && (
              <div className={styles.formGroup}>
                <label>Thinking Level</label>
                <SelectComponent
                  value={settings.thinkingLevel || "high"}
                  options={selectedModelDef.thinkingLevels.map(
                    (level: string) => ({
                      value: level,
                      label: level.charAt(0).toUpperCase() + level.slice(1),
                    }),
                  )}
                  onChange={handleThinkingLevelChange}
                />
              </div>
            )}

            {["anthropic", "google"].includes(settings.provider || "") && (
              <div className={styles.formGroup}>
                <label>Thinking Budget (Tokens)</label>
                <InputComponent
                  type="number"
                  placeholder="e.g. 1024"
                  value={settings.thinkingBudget || ""}
                  onChange={handleThinkingBudgetChange}
                />
              </div>
            )}
          </>
        )}

      {/* Standard Generation Parameters (Non-reasoning or supported reasoning overrides) */}
      {(!isReasoning ||
        ["anthropic", "google", "lm-studio", "vllm", "llama-cpp"].includes(
          settings.provider || "",
        )) && (
        <>
          <div className={styles.sectionSeparator} />

          {/* Verbosity (Google-specific override) */}
          {(settings.provider || "") === "google" &&
            selectedModelDef?.verbosity && (
              <div className={styles.formGroup}>
                <label>Verbosity</label>
                <SelectComponent
                  value={settings.verbosity || ""}
                  options={[
                    { value: "", label: "Default" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  onChange={handleVerbosityChange}
                />
              </div>
            )}

          {!isReasoning && !readOnly && (
            <>
              <div className={styles.formGroup}>
                <label>Top P ({settings.topP ?? 1})</label>
                <SliderComponent
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.topP ?? 1}
                  onChange={handleTopPChange}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Stop Sequences (comma separated)</label>
                <InputComponent
                  type="text"
                  placeholder="\n, Human:"
                  value={settings.stopSequences || ""}
                  onChange={handleStopSeqChange}
                />
              </div>

              {[
                "anthropic",
                "google",
                "llama-cpp",
                "lm-studio",
                "vllm",
              ].includes(settings.provider || "") && (
                <div className={styles.formGroup}>
                  <label>Top K ({settings.topK ?? 40})</label>
                  <SliderComponent
                    min={0}
                    max={100}
                    step={1}
                    value={settings.topK ?? 40}
                    onChange={handleTopKChange}
                  />
                </div>
              )}

              {["llama-cpp", "lm-studio", "vllm"].includes(
                settings.provider || "",
              ) && (
                <div className={styles.formGroup}>
                  <label>Min P ({settings.minP ?? 0})</label>
                  <SliderComponent
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.minP ?? 0}
                    onChange={handleMinPChange}
                  />
                </div>
              )}

              {["llama-cpp", "lm-studio", "vllm"].includes(
                settings.provider || "",
              ) && (
                <div className={styles.formGroup}>
                  <label>Repeat Penalty ({settings.repeatPenalty ?? 1})</label>
                  <SliderComponent
                    min={1}
                    max={2}
                    step={0.05}
                    value={settings.repeatPenalty ?? 1}
                    onChange={handleRepeatPenaltyChange}
                  />
                </div>
              )}

              {["openai", "google", "llama-cpp", "lm-studio", "vllm"].includes(
                settings.provider || "",
              ) && (
                <div className={styles.formGroup}>
                  <label>Seed</label>
                  <InputComponent
                    type="number"
                    placeholder="Random"
                    value={settings.seed ?? ""}
                    onChange={handleSeedChange}
                  />
                </div>
              )}

              {["openai", "lm-studio", "vllm", "google", "llama-cpp"].includes(
                settings.provider || "",
              ) && (
                <>
                  <div className={styles.formGroup}>
                    <label>
                      Frequency Penalty ({settings.frequencyPenalty ?? 0})
                    </label>
                    <SliderComponent
                      min={-2}
                      max={2}
                      step={0.1}
                      value={settings.frequencyPenalty ?? 0}
                      onChange={handleFreqPenaltyChange}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>
                      Presence Penalty ({settings.presencePenalty ?? 0})
                    </label>
                    <SliderComponent
                      min={-2}
                      max={2}
                      step={0.1}
                      value={settings.presencePenalty ?? 0}
                      onChange={handlePresPenaltyChange}
                    />
                  </div>
                </>
              )}

              {/* Response Format — JSON mode for OpenAI + Google */}
              {selectedModelDef?.jsonMode && (
                <div className={styles.formGroup}>
                  <label>Response Format</label>
                  <SelectComponent
                    value={settings.responseFormat || ""}
                    options={[
                      { value: "", label: "Default (Text)" },
                      { value: "json_object", label: "JSON Object" },
                    ]}
                    onChange={handleResponseFormatChange}
                  />
                </div>
              )}

              {/* Service Tier — request priority routing */}
              {["openai", "anthropic"].includes(settings.provider || "") && (
                <div className={styles.formGroup}>
                  <label>Service Tier</label>
                  <SelectComponent
                    value={settings.serviceTier || ""}
                    options={[
                      { value: "", label: "Default" },
                      { value: "auto", label: "Auto" },
                      ...((settings.provider || "") === "openai"
                        ? [
                            { value: "default", label: "Standard" },
                            { value: "priority", label: "Priority" },
                          ]
                        : [{ value: "standard_only", label: "Standard Only" }]),
                    ]}
                    onChange={handleServiceTierChange}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
