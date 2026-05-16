"use client";

import { Settings2 } from "lucide-react";
import { SelectComponent, SliderComponent } from "@rodrigo-barraza/components-library";
import styles from "./SettingsPanelComponent.module.css";

export default function ParametersPanelComponent({
  // @ts-ignore
  // @ts-ignore
  settings: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  // @ts-ignore
  // @ts-ignore
  config: any,
  readOnly = false,
}) {
  // @ts-ignore
  const textModelsMap = config?.textToText?.models || {};
  // @ts-ignore
  const imageModelsMap = config?.textToImage?.models || {};
  // @ts-ignore
  const audioToTextModelsMap = config?.audioToText?.models || {};
  // @ts-ignore
  const ttsModelsMap = config?.textToSpeech?.models || {};

  // Build merged models map
  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);
  const modelsMap = {};
  for (const p of allProviderKeys) {
    const textModels = textModelsMap[p] || [];
    const imgModels = (imageModelsMap[p] || []).map((m: any) => ({
      ...m,
      _isImageGen: true,
    }));
    const sttModels = (audioToTextModelsMap[p] || []).map((m: any) => ({
      ...m,
      _isTranscription: true,
    }));
    const ttsModels = (ttsModelsMap[p] || []).map((m: any) => ({
      ...m,
      _isTTS: true,
    }));
    const seen = new Set();
    const merged = [];
    for (const m of [...textModels, ...imgModels, ...sttModels, ...ttsModels]) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        merged.push(m);
      }
    }
    // @ts-ignore
    modelsMap[p] = merged;
  }

  // @ts-ignore
  // @ts-ignore
  const currentProviderModels = modelsMap[settings.provider] || [];
  const selectedModelDef = currentProviderModels.find(
    // @ts-ignore
    (m: any) => m.name === settings.model,
  );
  const isReasoning =
    selectedModelDef?.thinking ||
    // @ts-ignore
    (settings.model || "").includes("o1") ||
    // @ts-ignore
    (settings.model || "").includes("o3");
  const isTranscription = selectedModelDef?._isTranscription === true;
  const isTTS = selectedModelDef?._isTTS === true;
  const isSpecialModel = isTranscription || isTTS;

  // @ts-ignore
  const handleTempChange = (val: any) => onChange({ temperature: val });
  // @ts-ignore
  const handleMaxTokensChange = (val: any) => onChange({ maxTokens: val });
  // @ts-ignore
  const handleTopPChange = (val: any) => onChange({ topP: val });
  // @ts-ignore
  const handleTopKChange = (val: any) => onChange({ topK: val });
  // @ts-ignore
  const handleFreqPenaltyChange = (val: any) => onChange({ frequencyPenalty: val });
  // @ts-ignore
  const handlePresPenaltyChange = (val: any) => onChange({ presencePenalty: val });
  // @ts-ignore
  const handleMinPChange = (val: any) => onChange({ minP: val });
  // @ts-ignore
  const handleRepeatPenaltyChange = (val: any) => onChange({ repeatPenalty: val });
  // @ts-ignore
  const handleSeedChange = (e: any) => onChange({ seed: e.target.value });
  const handleStopSeqChange = (e: any) =>
    // @ts-ignore
    onChange({ stopSequences: e.target.value });
  const handleReasoningEffortChange = (val: any) =>
    // @ts-ignore
    onChange({ reasoningEffort: val });
  // @ts-ignore
  const handleThinkingLevelChange = (val: any) => onChange({ thinkingLevel: val });
  const handleThinkingBudgetChange = (e: any) =>
    // @ts-ignore
    onChange({ thinkingBudget: e.target.value });
  // @ts-ignore
  const handleVerbosityChange = (val: any) => onChange({ verbosity: val });
  const handleReasoningSummaryChange = (val: any) =>
    // @ts-ignore
    onChange({ reasoningSummary: val });
  const handleResponseFormatChange = (val: any) =>
    // @ts-ignore
    onChange({ responseFormat: val });
  const handleServiceTierChange = (val: any) =>
    // @ts-ignore
    onChange({ serviceTier: val });

  // @ts-ignore
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
          // @ts-ignore
          settings.thinkingEnabled &&
          // @ts-ignore
          settings.provider === "anthropic";
        // @ts-ignore
        const maxTemp = settings.provider === "anthropic" ? 1 : 2;
        return (
          <div className={styles.formGroup}>
            <label>
              Temperature (
              {/* @ts-ignore */}
              {thinkingLocked ? "1 — Locked" : settings.temperature})
            </label>
            {!readOnly && (
              <SliderComponent
                min={0}
                max={maxTemp}
                step={0.1}
                // @ts-ignore
                value={thinkingLocked ? 1 : settings.temperature}
                onChange={handleTempChange}
                disabled={thinkingLocked}
              />
            )}
          </div>
        );
      })()}

      {(() => {
        const maxOutput = selectedModelDef?.maxOutputTokens || 32000;
        // Round step to nearest power based on range — keep slider snappy
        const step = maxOutput > 32000 ? 1024 : 256;
        return (
          <div className={styles.formGroup}>
            {/* @ts-ignore */}
            <label>Max Tokens ({settings.maxTokens})</label>
            {!readOnly && (
              <SliderComponent
                min={256}
                max={maxOutput}
                step={step}
                // @ts-ignore
                value={Math.min(settings.maxTokens, maxOutput)}
                onChange={handleMaxTokensChange}
              />
            )}
          </div>
        );
      })()}

      {(isReasoning && selectedModelDef?.responsesAPI) ||
      // @ts-ignore
      (readOnly && settings.reasoningEffort) ? (
        <>
          <div className={styles.formGroup}>
            <label>Reasoning Effort</label>
            {readOnly ? (
              <div className={styles.readOnlyValue}>
                {/* @ts-ignore */}
                {settings.reasoningEffort || "high"}
              </div>
            ) : (
              <SelectComponent
                // @ts-ignore
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
            // @ts-ignore
            (readOnly && settings.reasoningSummary)) && (
            <div className={styles.formGroup}>
              <label>Reasoning Summary</label>
              {readOnly ? (
                <div className={styles.readOnlyValue}>
                  {/* @ts-ignore */}
                  {settings.reasoningSummary || "auto"}
                </div>
              ) : (
                <SelectComponent
                  // @ts-ignore
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
        // @ts-ignore
        // @ts-ignore
        // @ts-ignore
        (settings.thinkingEnabled || (settings.provider === "lm-studio" && settings.thinkingEnabled !== false)) && (
          <>
            {["openai", "lm-studio", "vllm", "anthropic", "ollama", "llama-cpp"].includes(
              // @ts-ignore
              settings.provider,
            ) && (
              <div className={styles.formGroup}>
                <label>Reasoning Effort</label>
                <SelectComponent
                  // @ts-ignore
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

            {/* @ts-ignore */}
            {settings.provider === "google" &&
              selectedModelDef?.thinkingLevels && (
                <div className={styles.formGroup}>
                  <label>Thinking Level</label>
                  <SelectComponent
                    // @ts-ignore
                    value={settings.thinkingLevel || "high"}
                    options={selectedModelDef.thinkingLevels.map((level: any) => ({
                      value: level,
                      label: level.charAt(0).toUpperCase() + level.slice(1),
                    }))}
                    onChange={handleThinkingLevelChange}
                  />
                </div>
              )}

            {/* @ts-ignore */}
            {["anthropic", "google"].includes(settings.provider) && (
              <div className={styles.formGroup}>
                <label>Thinking Budget (Tokens)</label>
                <input
                  type="number"
                  placeholder="e.g. 1024"
                  // @ts-ignore
                  value={settings.thinkingBudget || ""}
                  onChange={handleThinkingBudgetChange}
                  className={styles.inputField}
                />
              </div>
            )}
          </>
        )}

      {selectedModelDef?.verbosity && (
        <div className={styles.formGroup}>
          <label>Verbosity</label>
          <SelectComponent
            // @ts-ignore
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
            {/* @ts-ignore */}
            <label>Top P ({settings.topP})</label>
            <SliderComponent
              min={0}
              max={1}
              step={0.05}
              // @ts-ignore
              value={settings.topP}
              onChange={handleTopPChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Stop Sequences (comma separated)</label>
            <input
              type="text"
              placeholder="\n, Human:"
              // @ts-ignore
              value={settings.stopSequences || ""}
              onChange={handleStopSeqChange}
              className={styles.inputField}
            />
          </div>

          {/* @ts-ignore */}
          {["anthropic", "google", "llama-cpp", "lm-studio", "vllm"].includes(settings.provider) && (
            <div className={styles.formGroup}>
              {/* @ts-ignore */}
              <label>Top K ({settings.topK})</label>
              <SliderComponent
                min={0}
                max={100}
                step={1}
                // @ts-ignore
                value={settings.topK}
                onChange={handleTopKChange}
              />
            </div>
          )}

          {/* @ts-ignore */}
          {["llama-cpp", "lm-studio", "vllm"].includes(settings.provider) && (
            <div className={styles.formGroup}>
              {/* @ts-ignore */}
              <label>Min P ({settings.minP ?? 0})</label>
              <SliderComponent
                min={0}
                max={1}
                step={0.01}
                // @ts-ignore
                value={settings.minP ?? 0}
                onChange={handleMinPChange}
              />
            </div>
          )}

          {/* @ts-ignore */}
          {["llama-cpp", "lm-studio", "vllm"].includes(settings.provider) && (
            <div className={styles.formGroup}>
              {/* @ts-ignore */}
              <label>Repeat Penalty ({settings.repeatPenalty ?? 1})</label>
              <SliderComponent
                min={1}
                max={2}
                step={0.05}
                // @ts-ignore
                value={settings.repeatPenalty ?? 1}
                onChange={handleRepeatPenaltyChange}
              />
            </div>
          )}

          {/* @ts-ignore */}
          {["openai", "google", "llama-cpp", "lm-studio", "vllm"].includes(settings.provider) && (
            <div className={styles.formGroup}>
              <label>Seed</label>
              <input
                type="number"
                placeholder="Random"
                // @ts-ignore
                value={settings.seed ?? ""}
                onChange={handleSeedChange}
                className={styles.inputField}
              />
            </div>
          )}

          {["openai", "lm-studio", "vllm", "google", "llama-cpp"].includes(
            // @ts-ignore
            settings.provider,
          ) && (
            <>
              <div className={styles.formGroup}>
                {/* @ts-ignore */}
                <label>Frequency Penalty ({settings.frequencyPenalty})</label>
                <SliderComponent
                  min={-2}
                  max={2}
                  step={0.1}
                  // @ts-ignore
                  value={settings.frequencyPenalty}
                  onChange={handleFreqPenaltyChange}
                />
              </div>

              <div className={styles.formGroup}>
                {/* @ts-ignore */}
                <label>Presence Penalty ({settings.presencePenalty})</label>
                <SliderComponent
                  min={-2}
                  max={2}
                  step={0.1}
                  // @ts-ignore
                  value={settings.presencePenalty}
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
                // @ts-ignore
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
          {/* @ts-ignore */}
          {["openai", "anthropic"].includes(settings.provider) && (
            <div className={styles.formGroup}>
              <label>Service Tier</label>
              <SelectComponent
                // @ts-ignore
                value={settings.serviceTier || ""}
                options={[
                  { value: "", label: "Default" },
                  { value: "auto", label: "Auto" },
                  // @ts-ignore
                  ...(settings.provider === "openai" ? [
                    { value: "default", label: "Standard" },
                    { value: "priority", label: "Priority" },
                  ] : [
                    { value: "standard_only", label: "Standard Only" },
                  ]),
                ]}
                onChange={handleServiceTierChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
