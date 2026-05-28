"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import {
  X,
  Brain,
  Parentheses,
  Globe,
  Terminal,
  Monitor,
  FileSearch,
  Link,
  ImagePlus,
  ArrowRight,
  Info,
  Cpu,
  DollarSign,
  Trophy,
  Layers,
  Zap,
  Shield,
  Box,
  Hash,
  Bot,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  TrendingUp,
} from "lucide-react";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import StorageService from "../services/StorageService";
import { SK_MODEL_MEMORY_AGENT, LOCAL_PROVIDERS } from "../constants";
import BadgeComponent from "./BadgeComponent";
import {
  MODALITY_ICONS,
  MODALITY_COLORS,
  TOOL_COLORS,
} from "./WorkflowNodeConstantsComponent";
import {
  formatContextTokens,
  formatFileSize,
  formatNumber,
  formatTokenCount,
} from "../utils/utilities";
import styles from "./ModelDetailPanelComponent.module.css";

const TOOL_ICONS = {
  Thinking: Brain,
  "Tool Calling": Parentheses,
  "Web Search": Globe,
  "Google Search": Globe,
  "Code Execution": Terminal,
  "Computer Use": Monitor,
  "File Search": FileSearch,
  "URL Context": Link,
  "Image Generation": ImagePlus,
};

const ARENA_LABELS = {
  text: "Text",
  code: "Code",
  vision: "Vision",
  document: "Document",
  image: "Image",
  imageEdit: "Image Edit",
  search: "Search",
};

const PRICING_LABELS = {
  inputPerMillion: "Input / 1M tokens",
  cachedInputPerMillion: "Cached Input / 1M",
  cacheWriteInputPerMillion: "Cache Write / 1M",
  outputPerMillion: "Output / 1M tokens",
  audioInputPerMillion: "Audio Input / 1M",
  audioOutputPerMillion: "Audio Output / 1M",
  imageInputPerMillion: "Image Input / 1M",
  imageOutputPerMillion: "Image Output / 1M",
  cachedImageInputPerMillion: "Cached Image / 1M",
  inputOver272kPerMillion: "Input >272K / 1M",
  outputOver272kPerMillion: "Output >272K / 1M",
  webSearchPer1kCalls: "Web Search / 1K calls",
  perMinute: "Per minute",
  perCharacter: "Per character",
};

/**
 * ModelDetailPanelComponent — a slide-in right panel showing comprehensive
 * model card information when a model row is clicked in the ModelsTable.
 */
export default function ModelDetailPanelComponent({ model, onClose }: any) {
  const router = useRouter();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Normalize model fields
  const modelDetail = useMemo(() => {
    if (!model) return null;
    const name = model.display_name || model.label || model.key || model.name;
    const provider = model.provider || "lm-studio";
    const quantization =
      (typeof model.quantization === "object"
        ? model.quantization?.name
        : model.quantization) || null;

    return {
      name,
      key: model.key || model.name,
      provider,
      providerLabel: resolveProviderLabel(provider),
      modelType: model.modelType || null,
      year: model.year || null,
      contextLength: model.contextLength || model.max_context_length || null,
      maxOutputTokens: model.maxOutputTokens || null,
      inputTypes: model.inputTypes || [],
      outputTypes: model.outputTypes || [],
      tools: model.tools || [],
      pricing: model.pricing || null,
      arena: model.arena || null,
      size:
        model.size ||
        (model.size_bytes ? formatFileSize(model.size_bytes) : null),
      params: model.params || model.params_string || null,
      quantization,
      bitsPerWeight:
        model.bitsPerWeight ?? model.quantization?.bits_per_weight ?? null,
      architecture: model.architecture || null,
      publisher: model.publisher || null,
      isLoaded: model.loaded || model.loaded_instances?.length > 0 || false,
      streaming: model.streaming ?? null,
      thinking: model.thinking ?? null,
      vision: model.vision ?? null,
      webSearch: model.webSearch ?? null,
      codeExecution: model.codeExecution ?? null,
      webFetch: model.webFetch ?? null,
      urlContext: model.urlContext ?? null,
      jsonMode: model.jsonMode ?? null,
      liveAPI: model.liveAPI ?? null,
      responsesAPI: model.responsesAPI ?? null,
      imageAPI: model.imageAPI ?? null,
      verbosity: model.verbosity ?? null,
      reasoningSummary: model.reasoningSummary ?? null,
      thinkingLevels: model.thinkingLevels || null,
      mediaLimits: model.mediaLimits || null,
      assistantImages: model.assistantImages,
      supportsSystemPrompt: model.supportsSystemPrompt,
      defaultTemperature: model.defaultTemperature,
      // Usage stats
      usageCount: model.usageCount || 0,
      totalInputTokens: model.totalInputTokens || 0,
      totalOutputTokens: model.totalOutputTokens || 0,
      totalTokens: model.totalTokens || 0,
      totalCost: model.totalCost || 0,
      avgLatency: model.avgLatency || 0,
      avgTokensPerSec: model.avgTokensPerSec || 0,
      firstUsed: model.firstUsed || null,
      lastUsed: model.lastUsed || null,
      successCount: model.successCount || 0,
      errorCount: model.errorCount || 0,
    };
  }, [model]);

  if (!modelDetail) return null;

  // Determine the biggest context for the bar (1M is the max reference)
  const MAX_CONTEXT_REF = 1_048_576;
  const contextPct = modelDetail.contextLength
    ? Math.min((modelDetail.contextLength / MAX_CONTEXT_REF) * 100, 100)
    : 0;

  // Collect pricing entries
  const pricingEntries = modelDetail.pricing
    ? Object.entries(modelDetail.pricing).filter(
        ([, value]: any) => value != null && value > 0,
      )
    : [];

  // Collect arena entries
  const arenaEntries = modelDetail.arena
    ? Object.entries(modelDetail.arena).filter(
        ([, value]: any) => value != null && value > 0,
      )
    : [];

  // Capability flags
  const capabilities = [];
  if (modelDetail.streaming) capabilities.push("Streaming");
  if (modelDetail.jsonMode) capabilities.push("JSON Mode");
  if (modelDetail.liveAPI) capabilities.push("Live API");
  if (modelDetail.responsesAPI) capabilities.push("Responses API");
  if (modelDetail.imageAPI) capabilities.push("Image API");
  if (modelDetail.verbosity) capabilities.push("Verbosity Control");
  if (modelDetail.reasoningSummary) capabilities.push("Reasoning Summary");
  if (modelDetail.webFetch) capabilities.push("Web Fetch");
  if (modelDetail.urlContext) capabilities.push("URL Context");
  if (modelDetail.codeExecution) capabilities.push("Code Execution");
  if (modelDetail.supportsSystemPrompt !== false)
    capabilities.push("System Prompt");
  if (modelDetail.assistantImages === false)
    capabilities.push("No Assistant Images");

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        {/* -- Header ---------------------------------------- */}
        <div className={styles.header}>
          <ProviderLogo provider={modelDetail.provider} size={28} />
          <div className={styles.headerInfo}>
            <div className={styles.headerName}>{modelDetail.name}</div>
            <div className={styles.headerProvider}>
              {modelDetail.providerLabel}
              {modelDetail.year && <span>· {modelDetail.year}</span>}
              {modelDetail.modelType && (
                <BadgeComponent
                  type="model-type"
                  modelType={modelDetail.modelType}
                />
              )}
            </div>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* -- Body ------------------------------------------ */}
        <div className={styles.body}>
          {/* -- Use Model Actions --------------------------- */}
          <div className={styles.useModelActions}>
            <ButtonComponent
              variant="primary"
              icon={Bot}
              fullWidth
              onClick={() => {
                StorageService.set(SK_MODEL_MEMORY_AGENT, {
                  provider: modelDetail.provider,
                  model: modelDetail.key,
                  isLocal: LOCAL_PROVIDERS.has(modelDetail.provider),
                });
                router.push("/chat");
              }}
            >
              Use in Agents
            </ButtonComponent>
          </div>

          {/* -- Identity ----------------------------------- */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Info size={12} />
              Identity
            </div>
            <div className={styles.kvGrid}>
              <span className={styles.kvLabel}>API Name</span>
              <span className={styles.kvValueMono}>{modelDetail.key}</span>

              <span className={styles.kvLabel}>Provider</span>
              <span className={styles.kvValue}>
                <BadgeComponent
                  type="providers"
                  providers={[modelDetail.provider]}
                />
              </span>

              {modelDetail.year && (
                <>
                  <span className={styles.kvLabel}>Release Year</span>
                  <span className={styles.kvValue}>{modelDetail.year}</span>
                </>
              )}

              {modelDetail.publisher && (
                <>
                  <span className={styles.kvLabel}>Publisher</span>
                  <span className={styles.kvValue}>
                    {modelDetail.publisher}
                  </span>
                </>
              )}

              {modelDetail.architecture && (
                <>
                  <span className={styles.kvLabel}>Architecture</span>
                  <span className={styles.kvValue}>
                    {modelDetail.architecture}
                  </span>
                </>
              )}

              {modelDetail.provider === "lm-studio" && (
                <>
                  <span className={styles.kvLabel}>Status</span>
                  <span className={styles.kvValue}>
                    <span
                      className={`${styles.statusBadge} ${modelDetail.isLoaded ? styles.loaded : styles.available}`}
                    >
                      {modelDetail.isLoaded ? "● Loaded" : "○ Available"}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className={styles.divider} />

          {/* -- Context & Tokens --------------------------- */}
          {(modelDetail.contextLength ||
            modelDetail.maxOutputTokens ||
            modelDetail.params ||
            modelDetail.size) && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Cpu size={12} />
                  Specifications
                </div>
                <div className={styles.kvGrid}>
                  {modelDetail.contextLength && (
                    <>
                      <span className={styles.kvLabel}>Context Window</span>
                      <span className={styles.kvValue}>
                        <div className={styles.contextBar}>
                          <div className={styles.contextBarTrack}>
                            <div
                              className={styles.contextBarFill}
                              style={{ width: `${contextPct}%` }}
                            />
                          </div>
                          <span className={styles.contextBarLabel}>
                            {formatContextTokens(modelDetail.contextLength)}
                          </span>
                        </div>
                      </span>
                    </>
                  )}

                  {modelDetail.maxOutputTokens && (
                    <>
                      <span className={styles.kvLabel}>Max Output</span>
                      <span className={styles.kvValueMono}>
                        {formatContextTokens(modelDetail.maxOutputTokens)}
                      </span>
                    </>
                  )}

                  {modelDetail.params && (
                    <>
                      <span className={styles.kvLabel}>Parameters</span>
                      <span className={styles.kvValue}>
                        {modelDetail.params}
                      </span>
                    </>
                  )}

                  {modelDetail.size && (
                    <>
                      <span className={styles.kvLabel}>Size on Disk</span>
                      <span className={styles.kvValue}>{modelDetail.size}</span>
                    </>
                  )}

                  {modelDetail.quantization && (
                    <>
                      <span className={styles.kvLabel}>Quantization</span>
                      <span className={styles.kvValueMono}>
                        {modelDetail.quantization}
                      </span>
                    </>
                  )}

                  {modelDetail.bitsPerWeight != null && (
                    <>
                      <span className={styles.kvLabel}>Bits per Weight</span>
                      <span className={styles.kvValueMono}>
                        {modelDetail.bitsPerWeight}
                      </span>
                    </>
                  )}

                  {modelDetail.defaultTemperature != null && (
                    <>
                      <span className={styles.kvLabel}>Default Temp</span>
                      <span className={styles.kvValueMono}>
                        {modelDetail.defaultTemperature}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Modalities --------------------------------- */}
          {(modelDetail.inputTypes.length > 0 ||
            modelDetail.outputTypes.length > 0) && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Layers size={12} />
                  Modalities
                </div>
                <div className={styles.modalitiesRow}>
                  {modelDetail.inputTypes.map((t: string) => {
                    const meta = (MODALITY_ICONS as any)[t];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`in-${t}`}
                        className={styles.modalityChip}
                        style={{ color: (MODALITY_COLORS as any)[t] }}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    );
                  })}
                  {modelDetail.inputTypes.length > 0 &&
                    modelDetail.outputTypes.length > 0 && (
                      <ArrowRight size={14} className={styles.modalityArrow} />
                    )}
                  {modelDetail.outputTypes.map((t: string) => {
                    const meta = (MODALITY_ICONS as any)[t];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`out-${t}`}
                        className={styles.modalityChip}
                        style={{ color: (MODALITY_COLORS as any)[t] }}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Media Limits ------------------------------- */}
          {modelDetail.mediaLimits &&
            Object.keys(modelDetail.mediaLimits).length > 0 && (
              <>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    <Box size={12} />
                    Media Limits
                  </div>
                  <div className={styles.mediaLimitsGrid}>
                    {Object.entries(modelDetail.mediaLimits).map(
                      ([type, limits]: any) => (
                        <div key={type} className={styles.mediaLimitCard}>
                          <span className={styles.mediaLimitType}>{type}</span>
                          {limits.maxCount && (
                            <span className={styles.mediaLimitValue}>
                              {formatNumber(limits.maxCount)} files
                            </span>
                          )}
                          {limits.maxSizeMB && (
                            <span className={styles.mediaLimitValue}>
                              {limits.maxSizeMB} MB max
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <div className={styles.divider} />
              </>
            )}

          {/* -- Tools -------------------------------------- */}
          {modelDetail.tools.length > 0 && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Zap size={12} />
                  Tools & Capabilities
                </div>
                <div className={styles.toolsGrid}>
                  {modelDetail.tools.map((tool: string) => {
                    const Icon = (TOOL_ICONS as any)[tool];
                    const color = (TOOL_COLORS as any)[tool];
                    return (
                      <span
                        key={tool}
                        className={styles.toolChip}
                        style={
                          color
                            ? ({ color, borderColor: `${color}33` } as any)
                            : undefined
                        }
                      >
                        {Icon && <Icon size={12} />}
                        {tool}
                      </span>
                    );
                  })}
                </div>

                {/* Thinking levels */}
                {modelDetail.thinkingLevels &&
                  modelDetail.thinkingLevels.length > 0 && (
                    <div className={styles.kvGrid} style={{ marginTop: 10 }}>
                      <span className={styles.kvLabel}>Thinking Levels</span>
                      <span className={styles.kvValue}>
                        {modelDetail.thinkingLevels.join(", ")}
                      </span>
                    </div>
                  )}
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- API Capabilities ---------------------------- */}
          {capabilities.length > 0 && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Shield size={12} />
                  API Features
                </div>
                <div className={styles.toolsGrid}>
                  {capabilities.map((cap) => (
                    <span key={cap} className={styles.toolChip}>
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Pricing ------------------------------------ */}
          {pricingEntries.length > 0 && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <DollarSign size={12} />
                  Pricing
                </div>
                <div className={styles.pricingGrid}>
                  {pricingEntries.map(([key, value]: any) => (
                    <div key={key} className={styles.pricingRow}>
                      <span className={styles.pricingLabel}>
                        {(PRICING_LABELS as any)[key] || key}
                      </span>
                      <span className={styles.pricingValue}>
                        $
                        {typeof value === "number"
                          ? value.toFixed(value < 0.01 ? 4 : 2)
                          : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Arena Scores ------------------------------- */}
          {arenaEntries.length > 0 && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Trophy size={12} />
                  LMArena ELO Scores
                </div>
                <div className={styles.arenaGrid}>
                  {arenaEntries.map(([key, value]: any) => (
                    <div key={key} className={styles.arenaCard}>
                      <span className={styles.arenaScore}>{value as any}</span>
                      <span className={styles.arenaLabel}>
                        {(ARENA_LABELS as any)[key] || key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Lifetime Stats ------------------------------ */}
          {modelDetail.usageCount > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <Activity size={12} />
                Lifetime Statistics
              </div>

              {/* -- Stat Cards Grid ------------------- */}
              <div className={styles.statsCardsGrid}>
                <div className={styles.statsCard}>
                  <Hash size={14} className={styles.statsCardIcon} />
                  <span className={styles.statsCardValue}>
                    {formatNumber(modelDetail.usageCount)}
                  </span>
                  <span className={styles.statsCardLabel}>Total Requests</span>
                </div>

                {modelDetail.totalTokens > 0 && (
                  <div className={styles.statsCard}>
                    <Layers size={14} className={styles.statsCardIcon} />
                    <span className={styles.statsCardValue}>
                      {formatTokenCount(modelDetail.totalTokens)}
                    </span>
                    <span className={styles.statsCardLabel}>Total Tokens</span>
                  </div>
                )}

                {modelDetail.totalCost > 0 && (
                  <div
                    className={`${styles.statsCard} ${styles.statsCardCost}`}
                  >
                    <DollarSign size={14} className={styles.statsCardIcon} />
                    <span className={styles.statsCardValue}>
                      $
                      {modelDetail.totalCost < 0.01
                        ? modelDetail.totalCost.toFixed(4)
                        : modelDetail.totalCost.toFixed(2)}
                    </span>
                    <span className={styles.statsCardLabel}>Total Cost</span>
                  </div>
                )}

                {modelDetail.avgTokensPerSec > 0 && (
                  <div className={styles.statsCard}>
                    <TrendingUp size={14} className={styles.statsCardIcon} />
                    <span className={styles.statsCardValue}>
                      {modelDetail.avgTokensPerSec.toFixed(1)}
                    </span>
                    <span className={styles.statsCardLabel}>Avg tok/s</span>
                  </div>
                )}
              </div>

              {/* -- Success / Error Rate Bar ---------- */}
              {(modelDetail.successCount > 0 || modelDetail.errorCount > 0) && (
                <div className={styles.successRateRow}>
                  <div className={styles.successRateBar}>
                    <div
                      className={styles.successRateFill}
                      style={{
                        width: `${(modelDetail.successCount / modelDetail.usageCount) * 100}%`,
                      }}
                    />
                  </div>
                  <div className={styles.successRateLabels}>
                    <span className={styles.successLabel}>
                      <CheckCircle size={10} />
                      {formatNumber(modelDetail.successCount)}
                    </span>
                    {modelDetail.errorCount > 0 && (
                      <span className={styles.errorLabel}>
                        <XCircle size={10} />
                        {formatNumber(modelDetail.errorCount)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* -- Detail Rows ----------------------- */}
              <div className={styles.kvGrid} style={{ marginTop: 12 }}>
                {modelDetail.totalInputTokens > 0 && (
                  <>
                    <span className={styles.kvLabel}>Input Tokens</span>
                    <span className={styles.kvValueMono}>
                      {formatTokenCount(modelDetail.totalInputTokens)}
                    </span>
                  </>
                )}

                {modelDetail.totalOutputTokens > 0 && (
                  <>
                    <span className={styles.kvLabel}>Output Tokens</span>
                    <span className={styles.kvValueMono}>
                      {formatTokenCount(modelDetail.totalOutputTokens)}
                    </span>
                  </>
                )}

                {modelDetail.avgLatency > 0 && (
                  <>
                    <span className={styles.kvLabel}>Avg Latency</span>
                    <span className={styles.kvValueMono}>
                      {modelDetail.avgLatency >= 1000
                        ? `${(modelDetail.avgLatency / 1000).toFixed(1)}s`
                        : `${Math.round(modelDetail.avgLatency)}ms`}
                    </span>
                  </>
                )}

                {modelDetail.firstUsed && (
                  <>
                    <span className={styles.kvLabel}>
                      <Calendar
                        size={10}
                        style={{ marginRight: 4, opacity: 0.5 }}
                      />
                      First Used
                    </span>
                    <span className={styles.kvValueMono}>
                      {new Date(modelDetail.firstUsed).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </span>
                  </>
                )}

                {modelDetail.lastUsed && (
                  <>
                    <span className={styles.kvLabel}>
                      <Clock
                        size={10}
                        style={{ marginRight: 4, opacity: 0.5 }}
                      />
                      Last Used
                    </span>
                    <span className={styles.kvValueMono}>
                      {new Date(modelDetail.lastUsed).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
