"use client";

import {
  Type,
  Image as ImageIcon,
  Volume2,
  Video,
  FileText,
  Brain,
  DollarSign,
  Server,
  HardDrive,
  Settings,
  Eye,
  Ear,
  Hash,
  Thermometer,
  Layers,
  MessageSquare,
} from "lucide-react";
import styles from "./SettingsPanelComponent.module.css";
import BadgeComponent from "./BadgeComponent";
import { MODALITY_COLORS } from "./WorkflowNodeConstantsComponent";
import type { PrismConfig, PrismSettings } from "../types/types";

import type { LlamaCppServerProps } from "../types/types";

export interface ModelInfoPanelProps {
  config: PrismConfig | null;
  settings: PrismSettings;
  readOnly?: boolean;
  llamaCppServerProps?: LlamaCppServerProps | null;
}

/**
 * ModelInfoPanel — Displays model metadata: type badge,
 * token limits, pricing, and arena scores.
 *
 * Extracted from SettingsPanel to live in its own "Info" tab.
 */
import type { ModelOption, VoiceOption, ArenaScores } from "../types/types";

export default function ModelInfoPanel({
  config,
  settings,
  llamaCppServerProps,
}: ModelInfoPanelProps) {
  const textModelsMap = config?.textToText?.models || {};
  const audioToTextModelsMap = config?.audioToText?.models || {};
  const ttsModelsMap = config?.textToSpeech?.models || {};
  const imageModelsMap = config?.textToImage?.models || {};

  // Build a merged models map identical to SettingsPanel
  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);

  const modelsMap: Record<string, ModelOption[]> = {};
  for (const provider of allProviderKeys) {
    const textModels = textModelsMap[provider] || [];
    const imgModels = (imageModelsMap[provider] || []).map((model) => ({
      ...model,
      label: `${model.label || model.name} (Image)`,
      _isImageGen: true,
    }));
    const sttModels = (audioToTextModelsMap[provider] || []).map((model) => ({
      ...model,
      label: `${model.label || model.name} (Transcribe)`,
      _isTranscription: true,
    }));
    // Note: ttsModelsMap has VoiceOption[] or ModelOption[], we map it to ModelOption compatible shape
    const ttsModels = (ttsModelsMap[provider] || []).map(
      (model: VoiceOption | ModelOption) => ({
        ...model,
        label: `${model.name} (TTS)`,
        name: "id" in model ? model.id : model.name,
        _isTTS: true,
      }),
    ) as unknown as ModelOption[];

    const seen = new Set<string>();
    const merged: ModelOption[] = [];
    for (const model of [...textModels, ...imgModels, ...sttModels, ...ttsModels]) {
      if (!seen.has(model.name)) {
        seen.add(model.name);
        merged.push(model);
      }
    }
    modelsMap[provider] = merged;
  }

  const currentProviderModels = modelsMap[settings.provider || ""] || [];
  const selectedModelDef = currentProviderModels.find(
    (model) => model.name === settings.model,
  );

  if (!selectedModelDef) {
    return (
      <div className={styles['container']}>
        <div className={styles['section']}>
          <div className={styles['section-header']}>Model Info</div>
          <div className={styles['modality-layout-row']}>
            <span className={styles['modality-name']} style={{ opacity: 0.5 }}>
              Select a model to view details
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`model-info-panel-component ${styles['container']}`}>
      {/* Model Type Badge */}
      {selectedModelDef.modelType && (
        <BadgeComponent
          type="model-type"
          modelType={selectedModelDef.modelType}
        />
      )}

      {/* Model Description */}
      {selectedModelDef.description && (
        <div className={styles['section']} style={{ paddingBottom: 8 }}>
          <div className={styles['section-header']}>Description</div>
          <div className={styles['modality-layout-row']}>
            <span className={styles['modality-name']} style={{ opacity: 0.8, lineHeight: 1.5, fontSize: "0.75rem" }}>
              {selectedModelDef.description}
            </span>
          </div>
        </div>
      )}

      {/* Modalities */}
      {(() => {
        const allTypes = ["text", "image", "audio", "video", "pdf"];
        const inputs = selectedModelDef.inputTypes || [];
        const outputs = selectedModelDef.outputTypes || [];
        const iconMap: Record<string, React.ReactNode> = {
          text: <Type size={12} />,
          image: <ImageIcon size={12} />,
          audio: <Volume2 size={12} />,
          video: <Video size={12} />,
          pdf: <FileText size={12} />,
        };
        const mods = allTypes
          .map((tool) => {
            const isIn = inputs.includes(tool);
            const isOut = outputs.includes(tool);
            let status = null;
            if (isIn && isOut) status = "Input & Output";
            else if (isIn) status = "Input only";
            else if (isOut) status = "Output only";
            return { type: tool, status, supported: isIn || isOut };
          })
          .filter((model) => model.supported);
        if (mods.length === 0) return null;
        return (
          <div className={styles['section']}>
            <div className={styles['section-header']}>Modalities</div>
            {mods.map((model) => (
              <div key={model.type} className={styles['modality-layout-row']}>
                <span
                  className={styles['modality-icon']}
                  style={{
                    color:
                      MODALITY_COLORS[model.type as keyof typeof MODALITY_COLORS],
                  }}
                >
                  {iconMap[model.type]}
                </span>
                <span className={styles['modality-name']}>{model.type}</span>
                <span
                  className={`${styles['modality-status']} ${styles['modality-active']}`}
                >
                  {model.status}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Token Limits */}
      {(selectedModelDef.contextLength || selectedModelDef.maxOutputTokens) && (
        <div className={styles['section']}>
          <div className={styles['section-header']}>Token Limits</div>
          {selectedModelDef.contextLength && (
            <div className={styles['modality-layout-row']}>
              <span className={styles['modality-name']}>Context Window</span>
              <span
                className={`${styles['modality-status']} ${styles['modality-active']}`}
              >
                {selectedModelDef.contextLength.toLocaleString()} tokens
              </span>
            </div>
          )}
          {selectedModelDef.maxOutputTokens && (
            <div className={styles['modality-layout-row']}>
              <span className={styles['modality-name']}>Max Output</span>
              <span
                className={`${styles['modality-status']} ${styles['modality-active']}`}
              >
                {selectedModelDef.maxOutputTokens.toLocaleString()} tokens
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pricing */}
      {(() => {
        const PRICING_LABELS: Record<string, { label: string; unit: string }> =
          {
            inputPerMillion: { label: "Input", unit: "/ 1M tokens" },
            cachedInputPerMillion: {
              label: "Cached Input",
              unit: "/ 1M tokens",
            },
            outputPerMillion: { label: "Output", unit: "/ 1M tokens" },
            inputOver272kPerMillion: {
              label: "Input >272K",
              unit: "/ 1M tokens",
            },
            outputOver272kPerMillion: {
              label: "Output >272K",
              unit: "/ 1M tokens",
            },
            audioInputPerMillion: { label: "Audio Input", unit: "/ 1M tokens" },
            audioOutputPerMillion: {
              label: "Audio Output",
              unit: "/ 1M tokens",
            },
            imageInputPerMillion: { label: "Image Input", unit: "/ 1M tokens" },
            cachedImageInputPerMillion: {
              label: "Cached Img Input",
              unit: "/ 1M tokens",
            },
            imageOutputPerMillion: {
              label: "Image Output",
              unit: "/ 1M tokens",
            },
            perCharacter: { label: "Per Character", unit: "" },
            perMinute: { label: "Per Minute", unit: "" },
            webSearchPer1kCalls: { label: "Web Search", unit: "/ 1K calls" },
          };
        if (!selectedModelDef.pricing) return null;
        const entries = Object.entries(selectedModelDef.pricing)
          .filter(([key]) => PRICING_LABELS[key])
          .map(([key, value]) => ({
            ...PRICING_LABELS[key],
            value,
          }));
        return entries.length > 0 ? (
          <div className={styles['section']}>
            <div className={styles['section-header']}>Pricing</div>
            {entries.map((e) => (
              <div key={e.label} className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <DollarSign size={12} />
                </span>
                <span className={styles['modality-name']}>{e.label}</span>
                <span
                  className={`${styles['modality-status']} ${styles['pricing-value']}`}
                >
                  ${e.value} {e.unit}
                </span>
              </div>
            ))}
          </div>
        ) : null;
      })()}

      {/* Arena Scores */}
      {(() => {
        const arena = selectedModelDef.arena;
        if (!arena) return null;
        const arenaLabels: Record<string, string> = {
          text: "Text",
          code: "Code",
          vision: "Vision",
          document: "Document",
          textToImage: "Text to Image",
          imageEdit: "Image Edit",
          search: "Search",
        };
        const entries = Object.entries(arena).filter(([, value]) => value != null) as [
          keyof ArenaScores,
          number,
        ][];
        if (entries.length === 0) return null;
        return (
          <div className={styles['section']}>
            <div className={styles['section-header']}>Arena Scores</div>
            {entries.map(([key, value]) => (
              <div key={key} className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Brain size={12} />
                </span>
                <span className={styles['modality-name']}>
                  {arenaLabels[key] || key}
                </span>
                <span
                  className={`${styles['modality-status']} ${styles['arena-value']}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── llama.cpp Server Runtime Info ───────────────────────── */}
      {llamaCppServerProps && (
        <>
          {/* Server Health & Slots */}
          {llamaCppServerProps.health && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>Server Status</div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Server size={12} />
                </span>
                <span className={styles['modality-name']}>Health</span>
                <span
                  className={`${styles['modality-status']} ${styles['modality-active']}`}
                  style={{
                    color: llamaCppServerProps.health.status === "ok"
                      ? undefined
                      : "var(--color-error)",
                  }}
                >
                  {llamaCppServerProps.health.status}
                </span>
              </div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Layers size={12} />
                </span>
                <span className={styles['modality-name']}>Slots</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.health.slotsIdle ?? 0} idle
                  {(llamaCppServerProps.health.slotsProcessing ?? 0) > 0 && (
                    <> / {llamaCppServerProps.health.slotsProcessing} active</>
                  )}
                </span>
              </div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Hash size={12} />
                </span>
                <span className={styles['modality-name']}>Total Slots</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.totalSlots}
                </span>
              </div>
            </div>
          )}

          {/* Context & KV Cache Configuration */}
          {llamaCppServerProps.defaultGenerationSettings && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>Loaded Context</div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Settings size={12} />
                </span>
                <span className={styles['modality-name']}>Context Length</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.defaultGenerationSettings.contextLength.toLocaleString()} tokens
                </span>
              </div>
              {llamaCppServerProps.defaultGenerationSettings.cacheTypeK && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-icon']}>
                    <HardDrive size={12} />
                  </span>
                  <span className={styles['modality-name']}>KV Cache K</span>
                  <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                    {llamaCppServerProps.defaultGenerationSettings.cacheTypeK}
                  </span>
                </div>
              )}
              {llamaCppServerProps.defaultGenerationSettings.cacheTypeV && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-icon']}>
                    <HardDrive size={12} />
                  </span>
                  <span className={styles['modality-name']}>KV Cache V</span>
                  <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                    {llamaCppServerProps.defaultGenerationSettings.cacheTypeV}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Generation Defaults */}
          {llamaCppServerProps.defaultGenerationSettings && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>Generation Defaults</div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Thermometer size={12} />
                </span>
                <span className={styles['modality-name']}>Temperature</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.defaultGenerationSettings.temperature}
                </span>
              </div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Settings size={12} />
                </span>
                <span className={styles['modality-name']}>Top K</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.defaultGenerationSettings.topK}
                </span>
              </div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Settings size={12} />
                </span>
                <span className={styles['modality-name']}>Top P</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.defaultGenerationSettings.topP}
                </span>
              </div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Settings size={12} />
                </span>
                <span className={styles['modality-name']}>Min P</span>
                <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                  {llamaCppServerProps.defaultGenerationSettings.minP}
                </span>
              </div>
              {llamaCppServerProps.defaultGenerationSettings.repeatPenalty !== 1.0 && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-icon']}>
                    <Settings size={12} />
                  </span>
                  <span className={styles['modality-name']}>Repeat Penalty</span>
                  <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                    {llamaCppServerProps.defaultGenerationSettings.repeatPenalty}
                  </span>
                </div>
              )}
              {llamaCppServerProps.defaultGenerationSettings.seed !== -1 &&
                llamaCppServerProps.defaultGenerationSettings.seed !== 4294967295 && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-icon']}>
                    <Hash size={12} />
                  </span>
                  <span className={styles['modality-name']}>Seed</span>
                  <span className={`${styles['modality-status']} ${styles['modality-active']}`}>
                    {llamaCppServerProps.defaultGenerationSettings.seed}
                  </span>
                </div>
              )}
              {llamaCppServerProps.defaultGenerationSettings.samplers.length > 0 && (
                <div className={styles['modality-layout-row']}>
                  <span className={styles['modality-icon']}>
                    <Layers size={12} />
                  </span>
                  <span className={styles['modality-name']}>Samplers</span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{ fontSize: "0.5rem", lineHeight: 1.4 }}
                  >
                    {llamaCppServerProps.defaultGenerationSettings.samplers.join(" → ")}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Model File Path */}
          {llamaCppServerProps.modelPath && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>Model Path</div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <HardDrive size={12} />
                </span>
                <span
                  className={styles['modality-name']}
                  style={{
                    fontSize: "0.625rem",
                    textTransform: "none",
                    wordBreak: "break-all",
                    lineHeight: 1.4,
                    opacity: 0.8,
                  }}
                  title={llamaCppServerProps.modelPath}
                >
                  {llamaCppServerProps.modelPath}
                </span>
              </div>
            </div>
          )}

          {/* Chat Template */}
          {llamaCppServerProps.chatTemplate && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>Chat Template</div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <MessageSquare size={12} />
                </span>
                <span
                  className={styles['modality-name']}
                  style={{
                    fontSize: "0.625rem",
                    textTransform: "none",
                    lineHeight: 1.4,
                    opacity: 0.8,
                    maxHeight: 80,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                  title={llamaCppServerProps.chatTemplate}
                >
                  {llamaCppServerProps.chatTemplate.length > 200
                    ? `${llamaCppServerProps.chatTemplate.slice(0, 200)}…`
                    : llamaCppServerProps.chatTemplate}
                </span>
              </div>
            </div>
          )}

          {/* Server Modalities */}
          {llamaCppServerProps.modalities && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>Detected Modalities</div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Eye size={12} />
                </span>
                <span className={styles['modality-name']}>Vision</span>
                <span
                  className={`${styles['modality-status']} ${styles['modality-active']}`}
                  style={{
                    color: llamaCppServerProps.modalities.vision
                      ? "var(--color-success)"
                      : "var(--text-secondary)",
                    opacity: llamaCppServerProps.modalities.vision ? 1 : 0.5,
                  }}
                >
                  {llamaCppServerProps.modalities.vision ? "Supported" : "Not available"}
                </span>
              </div>
              <div className={styles['modality-layout-row']}>
                <span className={styles['modality-icon']}>
                  <Ear size={12} />
                </span>
                <span className={styles['modality-name']}>Audio</span>
                <span
                  className={`${styles['modality-status']} ${styles['modality-active']}`}
                  style={{
                    color: llamaCppServerProps.modalities.audio
                      ? "var(--color-success)"
                      : "var(--text-secondary)",
                    opacity: llamaCppServerProps.modalities.audio ? 1 : 0.5,
                  }}
                >
                  {llamaCppServerProps.modalities.audio ? "Supported" : "Not available"}
                </span>
              </div>
            </div>
          )}

          {/* Per-Slot Details */}
          {llamaCppServerProps.slots.length > 0 && (
            <div className={styles['section']}>
              <div className={styles['section-header']}>
                Slot Details ({llamaCppServerProps.slots.length})
              </div>
              {llamaCppServerProps.slots.map((slot) => (
                <div key={slot.id} className={styles['modality-layout-row']}>
                  <span className={styles['modality-icon']}>
                    <Layers size={12} />
                  </span>
                  <span className={styles['modality-name']} style={{ textTransform: "none" }}>
                    Slot {slot.id}
                  </span>
                  <span
                    className={`${styles['modality-status']} ${styles['modality-active']}`}
                    style={{
                      color: slot.isProcessing
                        ? "var(--color-warning)"
                        : "var(--color-success)",
                    }}
                  >
                    {slot.state}
                    {slot.tokensUsed > 0 && (
                      <> · {slot.tokensUsed.toLocaleString()}/{slot.contextLength.toLocaleString()}</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
