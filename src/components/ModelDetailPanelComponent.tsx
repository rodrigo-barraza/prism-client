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
import StorageService from "../services/StorageService.js";
import {
  SK_MODEL_MEMORY_AGENT,
  LOCAL_PROVIDERS,
} from "../constants.js";
import ProvidersBadgeComponent from "./ProvidersBadgeComponent";
import ModelTypeBadgeComponent from "./ModelTypeBadgeComponent";
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
 *
 * @param {Object}   props
 * @param {Object}   props.model    — Raw model object from the table
 * @param {Function} props.onClose  — Called when the panel should close
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function ModelDetailPanelComponent({ model: any, onClose: any }) {
  const router = useRouter();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: any) => {
      // @ts-ignore
      if (e.key === "Escape") onClose();
    },
    // @ts-ignore
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Normalize model fields
  const m = useMemo<any>(() => {
    // @ts-ignore
    if (!model) return null;
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    const name = model.display_name || model.label || model.key || model.name;
    // @ts-ignore
    const provider = model.provider || "lm-studio";
    const quantization =
      // @ts-ignore
      (typeof model.quantization === "object"
        // @ts-ignore
        ? model.quantization?.name
        // @ts-ignore
        : model.quantization) || null;

    return {
      name,
      // @ts-ignore
      // @ts-ignore
      key: model.key || model.name,
      provider,
      providerLabel: resolveProviderLabel(provider),
      // @ts-ignore
      modelType: model.modelType || null,
      // @ts-ignore
      year: model.year || null,
      // @ts-ignore
      // @ts-ignore
      contextLength: model.contextLength || model.max_context_length || null,
      // @ts-ignore
      maxOutputTokens: model.maxOutputTokens || null,
      // @ts-ignore
      inputTypes: model.inputTypes || [],
      // @ts-ignore
      outputTypes: model.outputTypes || [],
      // @ts-ignore
      tools: model.tools || [],
      // @ts-ignore
      pricing: model.pricing || null,
      // @ts-ignore
      arena: model.arena || null,
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      size: model.size || (model.size_bytes ? formatFileSize(model.size_bytes) : null),
      // @ts-ignore
      // @ts-ignore
      params: model.params || model.params_string || null,
      quantization,
      // @ts-ignore
      // @ts-ignore
      bitsPerWeight: model.bitsPerWeight ?? model.quantization?.bits_per_weight ?? null,
      // @ts-ignore
      architecture: model.architecture || null,
      // @ts-ignore
      publisher: model.publisher || null,
      // @ts-ignore
      // @ts-ignore
      isLoaded: model.loaded || model.loaded_instances?.length > 0 || false,
      // @ts-ignore
      streaming: model.streaming ?? null,
      // @ts-ignore
      thinking: model.thinking ?? null,
      // @ts-ignore
      vision: model.vision ?? null,
      // @ts-ignore
      webSearch: model.webSearch ?? null,
      // @ts-ignore
      codeExecution: model.codeExecution ?? null,
      // @ts-ignore
      webFetch: model.webFetch ?? null,
      // @ts-ignore
      urlContext: model.urlContext ?? null,
      // @ts-ignore
      jsonMode: model.jsonMode ?? null,
      // @ts-ignore
      liveAPI: model.liveAPI ?? null,
      // @ts-ignore
      responsesAPI: model.responsesAPI ?? null,
      // @ts-ignore
      imageAPI: model.imageAPI ?? null,
      // @ts-ignore
      verbosity: model.verbosity ?? null,
      // @ts-ignore
      reasoningSummary: model.reasoningSummary ?? null,
      // @ts-ignore
      thinkingLevels: model.thinkingLevels || null,
      // @ts-ignore
      mediaLimits: model.mediaLimits || null,
      // @ts-ignore
      assistantImages: model.assistantImages,
      // @ts-ignore
      supportsSystemPrompt: model.supportsSystemPrompt,
      // @ts-ignore
      defaultTemperature: model.defaultTemperature,
      // Usage stats
      // @ts-ignore
      usageCount: model.usageCount || 0,
      // @ts-ignore
      totalInputTokens: model.totalInputTokens || 0,
      // @ts-ignore
      totalOutputTokens: model.totalOutputTokens || 0,
      // @ts-ignore
      totalTokens: model.totalTokens || 0,
      // @ts-ignore
      totalCost: model.totalCost || 0,
      // @ts-ignore
      avgLatency: model.avgLatency || 0,
      // @ts-ignore
      avgTokensPerSec: model.avgTokensPerSec || 0,
      // @ts-ignore
      firstUsed: model.firstUsed || null,
      // @ts-ignore
      lastUsed: model.lastUsed || null,
      // @ts-ignore
      successCount: model.successCount || 0,
      // @ts-ignore
      errorCount: model.errorCount || 0,
    };
  // @ts-ignore
  }, [model]);

  if (!m) return null;

  // Determine the biggest context for the bar (1M is the max reference)
  const MAX_CONTEXT_REF = 1_048_576;
  const contextPct = m.contextLength
    ? Math.min((m.contextLength / MAX_CONTEXT_REF) * 100, 100)
    : 0;

  // Collect pricing entries
  const pricingEntries = m.pricing
    ? Object.entries(m.pricing).filter(
        // @ts-ignore
        ([, val]) => val != null && val > 0,
      )
    : [];

  // Collect arena entries
  const arenaEntries = m.arena
    // @ts-ignore
    ? Object.entries(m.arena).filter(([, val]) => val != null && val > 0)
    : [];

  // Capability flags
  const capabilities = [];
  if (m.streaming) capabilities.push("Streaming");
  if (m.jsonMode) capabilities.push("JSON Mode");
  if (m.liveAPI) capabilities.push("Live API");
  if (m.responsesAPI) capabilities.push("Responses API");
  if (m.imageAPI) capabilities.push("Image API");
  if (m.verbosity) capabilities.push("Verbosity Control");
  if (m.reasoningSummary) capabilities.push("Reasoning Summary");
  if (m.webFetch) capabilities.push("Web Fetch");
  if (m.urlContext) capabilities.push("URL Context");
  if (m.codeExecution) capabilities.push("Code Execution");
  if (m.supportsSystemPrompt !== false) capabilities.push("System Prompt");
  if (m.assistantImages === false) capabilities.push("No Assistant Images");

  return (
    <div className={styles.overlay}>
      {/* @ts-ignore */}
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        {/* -- Header ---------------------------------------- */}
        <div className={styles.header}>
          <ProviderLogo provider={m.provider} size={28} />
          <div className={styles.headerInfo}>
            <div className={styles.headerName}>{m.name}</div>
            <div className={styles.headerProvider}>
              {m.providerLabel}
              {m.year && <span>· {m.year}</span>}
              {m.modelType && (
                <ModelTypeBadgeComponent modelType={m.modelType} />
              )}
            </div>
          </div>
          {/* @ts-ignore */}
          <button className={styles.closeBtn} onClick={onClose} title="Close">
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
                  provider: m.provider,
                  model: m.key,
                  isLocal: LOCAL_PROVIDERS.has(m.provider),
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
              <span className={styles.kvValueMono}>{m.key}</span>

              <span className={styles.kvLabel}>Provider</span>
              <span className={styles.kvValue}>
                {/* @ts-ignore */}
                <ProvidersBadgeComponent providers={[m.provider]} />
              </span>

              {m.year && (
                <>
                  <span className={styles.kvLabel}>Release Year</span>
                  <span className={styles.kvValue}>{m.year}</span>
                </>
              )}

              {m.publisher && (
                <>
                  <span className={styles.kvLabel}>Publisher</span>
                  <span className={styles.kvValue}>{m.publisher}</span>
                </>
              )}

              {m.architecture && (
                <>
                  <span className={styles.kvLabel}>Architecture</span>
                  <span className={styles.kvValue}>{m.architecture}</span>
                </>
              )}

              {m.provider === "lm-studio" && (
                <>
                  <span className={styles.kvLabel}>Status</span>
                  <span className={styles.kvValue}>
                    <span
                      className={`${styles.statusBadge} ${m.isLoaded ? styles.loaded : styles.available}`}
                    >
                      {m.isLoaded ? "● Loaded" : "○ Available"}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className={styles.divider} />

          {/* -- Context & Tokens --------------------------- */}
          {(m.contextLength || m.maxOutputTokens || m.params || m.size) && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Cpu size={12} />
                  Specifications
                </div>
                <div className={styles.kvGrid}>
                  {m.contextLength && (
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
                            {formatContextTokens(m.contextLength)}
                          </span>
                        </div>
                      </span>
                    </>
                  )}

                  {m.maxOutputTokens && (
                    <>
                      <span className={styles.kvLabel}>Max Output</span>
                      <span className={styles.kvValueMono}>
                        {formatContextTokens(m.maxOutputTokens)}
                      </span>
                    </>
                  )}

                  {m.params && (
                    <>
                      <span className={styles.kvLabel}>Parameters</span>
                      <span className={styles.kvValue}>{m.params}</span>
                    </>
                  )}

                  {m.size && (
                    <>
                      <span className={styles.kvLabel}>Size on Disk</span>
                      <span className={styles.kvValue}>{m.size}</span>
                    </>
                  )}

                  {m.quantization && (
                    <>
                      <span className={styles.kvLabel}>Quantization</span>
                      <span className={styles.kvValueMono}>{m.quantization}</span>
                    </>
                  )}

                  {m.bitsPerWeight != null && (
                    <>
                      <span className={styles.kvLabel}>Bits per Weight</span>
                      <span className={styles.kvValueMono}>{m.bitsPerWeight}</span>
                    </>
                  )}

                  {m.defaultTemperature != null && (
                    <>
                      <span className={styles.kvLabel}>Default Temp</span>
                      <span className={styles.kvValueMono}>{m.defaultTemperature}</span>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Modalities --------------------------------- */}
          {(m.inputTypes.length > 0 || m.outputTypes.length > 0) && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Layers size={12} />
                  Modalities
                </div>
                <div className={styles.modalitiesRow}>
                  {m.inputTypes.map((t: any) => {
                    // @ts-ignore
                    const meta = MODALITY_ICONS[t];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`in-${t}`}
                        className={styles.modalityChip}
                        // @ts-ignore
                        style={{ color: MODALITY_COLORS[t] }}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    );
                  })}
                  {m.inputTypes.length > 0 && m.outputTypes.length > 0 && (
                    <ArrowRight size={14} className={styles.modalityArrow} />
                  )}
                  {m.outputTypes.map((t: any) => {
                    // @ts-ignore
                    const meta = MODALITY_ICONS[t];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`out-${t}`}
                        className={styles.modalityChip}
                        // @ts-ignore
                        style={{ color: MODALITY_COLORS[t] }}
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
          {m.mediaLimits && Object.keys(m.mediaLimits).length > 0 && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Box size={12} />
                  Media Limits
                </div>
                <div className={styles.mediaLimitsGrid}>
                  {Object.entries(m.mediaLimits).map(([type, limits]) => (
                    <div key={type} className={styles.mediaLimitCard}>
                      <span className={styles.mediaLimitType}>{type}</span>
                      {/* @ts-ignore */}
                      {limits.maxCount && (
                        <span className={styles.mediaLimitValue}>
                          {/* @ts-ignore */}
                          {formatNumber(limits.maxCount)} files
                        </span>
                      )}
                      {/* @ts-ignore */}
                      {limits.maxSizeMB && (
                        <span className={styles.mediaLimitValue}>
                          {/* @ts-ignore */}
                          {limits.maxSizeMB} MB max
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Tools -------------------------------------- */}
          {m.tools.length > 0 && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  <Zap size={12} />
                  Tools & Capabilities
                </div>
                <div className={styles.toolsGrid}>
                  {m.tools.map((tool: any) => {
                    // @ts-ignore
                    const Icon = TOOL_ICONS[tool];
                    // @ts-ignore
                    const color = TOOL_COLORS[tool];
                    return (
                      <span
                        key={tool}
                        className={styles.toolChip}
                        style={color ? { color, borderColor: `${color}33` } : undefined}
                      >
                        {Icon && <Icon size={12} />}
                        {tool}
                      </span>
                    );
                  })}
                </div>

                {/* Thinking levels */}
                {m.thinkingLevels && m.thinkingLevels.length > 0 && (
                  <div className={styles.kvGrid} style={{ marginTop: 10 }}>
                    <span className={styles.kvLabel}>Thinking Levels</span>
                    <span className={styles.kvValue}>
                      {m.thinkingLevels.join(", ")}
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
                  {pricingEntries.map(([key, val]) => (
                    <div key={key} className={styles.pricingRow}>
                      <span className={styles.pricingLabel}>
                        {/* @ts-ignore */}
                        {PRICING_LABELS[key] || key}
                      </span>
                      <span className={styles.pricingValue}>
                        {/* @ts-ignore */}
                        {/* @ts-ignore */}
                        ${typeof val === "number" ? val.toFixed(val < 0.01 ? 4 : 2) : val}
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
                  {arenaEntries.map(([key, val]) => (
                    <div key={key} className={styles.arenaCard}>
                      {/* @ts-ignore */}
                      <span className={styles.arenaScore}>{val}</span>
                      <span className={styles.arenaLabel}>
                        {/* @ts-ignore */}
                        {ARENA_LABELS[key] || key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* -- Lifetime Stats ------------------------------ */}
          {m.usageCount > 0 && (
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
                    {formatNumber(m.usageCount)}
                  </span>
                  <span className={styles.statsCardLabel}>Total Requests</span>
                </div>

                {m.totalTokens > 0 && (
                  <div className={styles.statsCard}>
                    <Layers size={14} className={styles.statsCardIcon} />
                    <span className={styles.statsCardValue}>
                      {formatTokenCount(m.totalTokens)}
                    </span>
                    <span className={styles.statsCardLabel}>Total Tokens</span>
                  </div>
                )}

                {m.totalCost > 0 && (
                  <div className={`${styles.statsCard} ${styles.statsCardCost}`}>
                    <DollarSign size={14} className={styles.statsCardIcon} />
                    <span className={styles.statsCardValue}>
                      ${m.totalCost < 0.01 ? m.totalCost.toFixed(4) : m.totalCost.toFixed(2)}
                    </span>
                    <span className={styles.statsCardLabel}>Total Cost</span>
                  </div>
                )}

                {m.avgTokensPerSec > 0 && (
                  <div className={styles.statsCard}>
                    <TrendingUp size={14} className={styles.statsCardIcon} />
                    <span className={styles.statsCardValue}>
                      {m.avgTokensPerSec.toFixed(1)}
                    </span>
                    <span className={styles.statsCardLabel}>Avg tok/s</span>
                  </div>
                )}
              </div>

              {/* -- Success / Error Rate Bar ---------- */}
              {(m.successCount > 0 || m.errorCount > 0) && (
                <div className={styles.successRateRow}>
                  <div className={styles.successRateBar}>
                    <div
                      className={styles.successRateFill}
                      style={{ width: `${(m.successCount / m.usageCount) * 100}%` }}
                    />
                  </div>
                  <div className={styles.successRateLabels}>
                    <span className={styles.successLabel}>
                      <CheckCircle size={10} />
                      {formatNumber(m.successCount)}
                    </span>
                    {m.errorCount > 0 && (
                      <span className={styles.errorLabel}>
                        <XCircle size={10} />
                        {formatNumber(m.errorCount)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* -- Detail Rows ----------------------- */}
              <div className={styles.kvGrid} style={{ marginTop: 12 }}>
                {m.totalInputTokens > 0 && (
                  <>
                    <span className={styles.kvLabel}>Input Tokens</span>
                    <span className={styles.kvValueMono}>
                      {formatTokenCount(m.totalInputTokens)}
                    </span>
                  </>
                )}

                {m.totalOutputTokens > 0 && (
                  <>
                    <span className={styles.kvLabel}>Output Tokens</span>
                    <span className={styles.kvValueMono}>
                      {formatTokenCount(m.totalOutputTokens)}
                    </span>
                  </>
                )}

                {m.avgLatency > 0 && (
                  <>
                    <span className={styles.kvLabel}>Avg Latency</span>
                    <span className={styles.kvValueMono}>
                      {m.avgLatency >= 1000
                        ? `${(m.avgLatency / 1000).toFixed(1)}s`
                        : `${Math.round(m.avgLatency)}ms`}
                    </span>
                  </>
                )}

                {m.firstUsed && (
                  <>
                    <span className={styles.kvLabel}>
                      <Calendar size={10} style={{ marginRight: 4, opacity: 0.5 }} />
                      First Used
                    </span>
                    <span className={styles.kvValueMono}>
                      {new Date(m.firstUsed).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  </>
                )}

                {m.lastUsed && (
                  <>
                    <span className={styles.kvLabel}>
                      <Clock size={10} style={{ marginRight: 4, opacity: 0.5 }} />
                      Last Used
                    </span>
                    <span className={styles.kvValueMono}>
                      {new Date(m.lastUsed).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
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
