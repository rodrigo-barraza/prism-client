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
import { SK_MODEL_MEMORY_AGENT, LOCAL_PROVIDERS, type ProviderType } from "../constants";
import BadgeComponent from "./BadgeComponent";
import {
  MODALITY_ICONS,
  MODALITY_COLORS,
  TOOL_COLORS,
} from "./WorkflowNodeConstantsComponent";
import { formatContextTokens, formatFileSize, formatNumber, formatTokenCount } from "@rodrigo-barraza/utilities-library";
import type { RawModel } from "./ModelsTableComponent";
import styles from "./ModelDetailPanelComponent.module.css";

interface ModelDetailData extends RawModel {
  description?: string;
  maxOutputTokens?: number;
  streaming?: boolean;
  thinking?: boolean;
  vision?: boolean;
  webSearch?: boolean;
  codeExecution?: boolean;
  webFetch?: boolean;
  urlContext?: boolean;
  jsonMode?: boolean;
  liveAPI?: boolean;
  responsesAPI?: boolean;
  imageAPI?: boolean;
  verbosity?: boolean;
  reasoningSummary?: boolean;
  thinkingLevels?: string[];
  mediaLimits?: Record<string, MediaLimit>;
  assistantImages?: boolean;
  supportsSystemPrompt?: boolean;
  defaultTemperature?: number;
  totalTokens?: number;
  firstUsed?: string;
  lastUsed?: string;
  successCount?: number;
  errorCount?: number;
  [key: string]: unknown;
}

interface ModelDetailPanelProps {
  model: ModelDetailData | null;
  onClose: () => void;
}

interface MediaLimit {
  maxCount?: number;
  maxSizeMB?: number;
}

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
export default function ModelDetailPanelComponent({ model, onClose }: ModelDetailPanelProps) {
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
      description: model.description || null,
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
        model.bitsPerWeight ?? (typeof model.quantization === "object" ? (model.quantization as { bits_per_weight?: number })?.bits_per_weight : null) ?? null,
      architecture: model.architecture || null,
      publisher: model.publisher || null,
      isLoaded: model.loaded || (model.loaded_instances && model.loaded_instances.length > 0) || false,
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
  const contextPercentage = modelDetail.contextLength
    ? Math.min((modelDetail.contextLength / MAX_CONTEXT_REF) * 100, 100)
    : 0;

  // Collect pricing entries
  const pricingEntries = modelDetail.pricing
    ? Object.entries(modelDetail.pricing).filter(
        ([, value]: [string, unknown]) => value != null && (value as number) > 0,
      )
    : [];

  // Collect arena entries
  const arenaEntries = modelDetail.arena
    ? Object.entries(modelDetail.arena).filter(
        ([, value]: [string, unknown]) => value != null && (value as number) > 0,
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
    <div className={`model-detail-panel-component ${styles['overlay']}`}>
      <div className={styles['backdrop']} onClick={onClose} />
      <div className={styles['panel']}>
        {/* -- Header ---------------------------------------- */}
        <div className={styles['header']}>
          <ProviderLogo provider={modelDetail.provider} size={28} />
          <div className={styles['header-info']}>
            <div className={styles['header-name']}>{modelDetail.name}</div>
            <div className={styles['header-provider']}>
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
            className={styles['close-button']}
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* -- Body ------------------------------------------ */}
        <div className={styles['body']}>
          {/* -- Use Model Actions --------------------------- */}
          <div className={styles['use-model-actions']}>
            <ButtonComponent
              variant="primary"
              icon={Bot}
              fullWidth
              onClick={() => {
                StorageService.set(SK_MODEL_MEMORY_AGENT, {
                  provider: modelDetail.provider,
                  model: modelDetail.key,
                  isLocal: LOCAL_PROVIDERS.has(modelDetail.provider as ProviderType),
                });
                router.push("/chat");
              }}
            >
              Use in Chat
            </ButtonComponent>
          </div>

          {/* -- Identity ----------------------------------- */}
          <div className={styles['section']}>
            <div className={styles['section-title']}>
              <Info size={12} />
              Identity
            </div>
            <div className={styles['key-value-grid']}>
              <span className={styles['key-value-label']}>API Name</span>
              <span className={styles['key-value-content-mono']}>{modelDetail.key}</span>

              <span className={styles['key-value-label']}>Provider</span>
              <span className={styles['key-value-content']}>
                <BadgeComponent
                  type="providers"
                  providers={[modelDetail.provider]}
                />
              </span>

              {modelDetail.year && (
                <>
                  <span className={styles['key-value-label']}>Release Year</span>
                  <span className={styles['key-value-content']}>{modelDetail.year}</span>
                </>
              )}

              {modelDetail.publisher && (
                <>
                  <span className={styles['key-value-label']}>Publisher</span>
                  <span className={styles['key-value-content']}>
                    {modelDetail.publisher}
                  </span>
                </>
              )}

              {modelDetail.architecture && (
                <>
                  <span className={styles['key-value-label']}>Architecture</span>
                  <span className={styles['key-value-content']}>
                    {modelDetail.architecture}
                  </span>
                </>
              )}

              {modelDetail.provider === "lm-studio" && (
                <>
                  <span className={styles['key-value-label']}>Status</span>
                  <span className={styles['key-value-content']}>
                    <span
                      className={`${styles['status-badge']} ${modelDetail.isLoaded ? styles['loaded'] : styles['available']}`}
                    >
                      {modelDetail.isLoaded ? "● Loaded" : "○ Available"}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          {modelDetail.description && (
            <>
              <div className={styles['divider']} />
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <Info size={12} />
                  Description
                </div>
                <div className={styles['description-text']}>
                  {modelDetail.description}
                </div>
              </div>
            </>
          )}

          <div className={styles['divider']} />

          {/* -- Context & Tokens --------------------------- */}
          {(modelDetail.contextLength ||
            modelDetail.maxOutputTokens ||
            modelDetail.params ||
            modelDetail.size) && (
            <>
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <Cpu size={12} />
                  Specifications
                </div>
                <div className={styles['key-value-grid']}>
                  {modelDetail.contextLength && (
                    <>
                      <span className={styles['key-value-label']}>Context Window</span>
                      <span className={styles['key-value-content']}>
                        <div className={styles['context-bar']}>
                          <div className={styles['context-bar-track']}>
                            <div
                              className={styles['context-bar-fill']}
                              style={{ width: `${contextPercentage}%` }}
                            />
                          </div>
                          <span className={styles['context-bar-label']}>
                            {formatContextTokens(modelDetail.contextLength)}
                          </span>
                        </div>
                      </span>
                    </>
                  )}

                  {modelDetail.maxOutputTokens && (
                    <>
                      <span className={styles['key-value-label']}>Max Output</span>
                      <span className={styles['key-value-content-mono']}>
                        {formatContextTokens(modelDetail.maxOutputTokens)}
                      </span>
                    </>
                  )}

                  {modelDetail.params && (
                    <>
                      <span className={styles['key-value-label']}>Parameters</span>
                      <span className={styles['key-value-content']}>
                        {modelDetail.params}
                      </span>
                    </>
                  )}

                  {modelDetail.size && (
                    <>
                      <span className={styles['key-value-label']}>Size on Disk</span>
                      <span className={styles['key-value-content']}>{modelDetail.size}</span>
                    </>
                  )}

                  {modelDetail.quantization && (
                    <>
                      <span className={styles['key-value-label']}>Quantization</span>
                      <span className={styles['key-value-content-mono']}>
                        {modelDetail.quantization}
                      </span>
                    </>
                  )}

                  {modelDetail.bitsPerWeight != null && (
                    <>
                      <span className={styles['key-value-label']}>Bits per Weight</span>
                      <span className={styles['key-value-content-mono']}>
                        {modelDetail.bitsPerWeight}
                      </span>
                    </>
                  )}

                  {modelDetail.defaultTemperature != null && (
                    <>
                      <span className={styles['key-value-label']}>Default Temp</span>
                      <span className={styles['key-value-content-mono']}>
                        {modelDetail.defaultTemperature}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className={styles['divider']} />
            </>
          )}

          {/* -- Modalities --------------------------------- */}
          {(modelDetail.inputTypes.length > 0 ||
            modelDetail.outputTypes.length > 0) && (
            <>
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <Layers size={12} />
                  Modalities
                </div>
                <div className={styles['modalities-layout-row']}>
                  {modelDetail.inputTypes.map((inputType: string) => {
                    const meta = (MODALITY_ICONS as Record<string, { icon: React.ElementType; label: string }>)[inputType];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`in-${inputType}`}
                        className={styles['modality-chip']}
                        style={{ color: (MODALITY_COLORS as Record<string, string>)[inputType] }}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    );
                  })}
                  {modelDetail.inputTypes.length > 0 &&
                    modelDetail.outputTypes.length > 0 && (
                      <ArrowRight size={14} className={styles['modality-arrow']} />
                    )}
                  {modelDetail.outputTypes.map((outputType: string) => {
                    const meta = (MODALITY_ICONS as Record<string, { icon: React.ElementType; label: string }>)[outputType];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`out-${outputType}`}
                        className={styles['modality-chip']}
                        style={{ color: (MODALITY_COLORS as Record<string, string>)[outputType] }}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className={styles['divider']} />
            </>
          )}

          {/* -- Media Limits ------------------------------- */}
          {modelDetail.mediaLimits &&
            Object.keys(modelDetail.mediaLimits).length > 0 && (
              <>
                <div className={styles['section']}>
                  <div className={styles['section-title']}>
                    <Box size={12} />
                    Media Limits
                  </div>
                  <div className={styles['media-limits-grid']}>
                    {Object.entries(modelDetail.mediaLimits).map(
                      ([mediaType, limits]: [string, unknown]) => {
                        const mediaLimit = limits as MediaLimit;
                        return (
                        <div key={mediaType} className={styles['media-limit-card']}>
                          <span className={styles['media-limit-type']}>{mediaType}</span>
                          {mediaLimit.maxCount && (
                            <span className={styles['media-limit-value']}>
                              {formatNumber(mediaLimit.maxCount)} files
                            </span>
                          )}
                          {mediaLimit.maxSizeMB && (
                            <span className={styles['media-limit-value']}>
                              {mediaLimit.maxSizeMB} MB max
                            </span>
                          )}
                        </div>
                        );
                      },
                    )}
                  </div>
                </div>
                <div className={styles['divider']} />
              </>
            )}

          {/* -- Tools -------------------------------------- */}
          {modelDetail.tools.length > 0 && (
            <>
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <Zap size={12} />
                  Tools & Capabilities
                </div>
                <div className={styles['tools-grid']}>
                  {modelDetail.tools.map((tool: string) => {
                    const Icon = (TOOL_ICONS as Record<string, React.ElementType>)[tool];
                    const color = (TOOL_COLORS as Record<string, string>)[tool];
                    return (
                      <span
                        key={tool}
                        className={styles['tool-chip']}
                        style={
                          color
                            ? { color, borderColor: `${color}33` }
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
                    <div className={styles['key-value-grid']} style={{ marginTop: 10 }}>
                      <span className={styles['key-value-label']}>Thinking Levels</span>
                      <span className={styles['key-value-content']}>
                        {modelDetail.thinkingLevels.join(", ")}
                      </span>
                    </div>
                  )}
              </div>
              <div className={styles['divider']} />
            </>
          )}

          {/* -- API Capabilities ---------------------------- */}
          {capabilities.length > 0 && (
            <>
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <Shield size={12} />
                  API Features
                </div>
                <div className={styles['tools-grid']}>
                  {capabilities.map((cap) => (
                    <span key={cap} className={styles['tool-chip']}>
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles['divider']} />
            </>
          )}

          {/* -- Pricing ------------------------------------ */}
          {pricingEntries.length > 0 && (
            <>
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <DollarSign size={12} />
                  Pricing
                </div>
                <div className={styles['pricing-grid']}>
                  {pricingEntries.map(([key, value]: [string, unknown]) => (
                    <div key={key} className={styles['pricing-layout-row']}>
                      <span className={styles['pricing-label']}>
                        {(PRICING_LABELS as Record<string, string>)[key] || key}
                      </span>
                      <span className={styles['pricing-value']}>
                        $
                        {typeof value === "number"
                          ? value.toFixed(value < 0.01 ? 4 : 2)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles['divider']} />
            </>
          )}

          {/* -- Arena Scores ------------------------------- */}
          {arenaEntries.length > 0 && (
            <>
              <div className={styles['section']}>
                <div className={styles['section-title']}>
                  <Trophy size={12} />
                  LMArena ELO Scores
                </div>
                <div className={styles['arena-grid']}>
                  {arenaEntries.map(([key, value]: [string, unknown]) => (
                    <div key={key} className={styles['arena-card']}>
                      <span className={styles['arena-score']}>{String(value)}</span>
                      <span className={styles['arena-label']}>
                        {(ARENA_LABELS as Record<string, string>)[key] || key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles['divider']} />
            </>
          )}

          {/* -- Lifetime Stats ------------------------------ */}
          {modelDetail.usageCount > 0 && (
            <div className={styles['section']}>
              <div className={styles['section-title']}>
                <Activity size={12} />
                Lifetime Statistics
              </div>

              {/* -- Stat Cards Grid ------------------- */}
              <div className={styles['stats-cards-grid']}>
                <div className={styles['stats-card']}>
                  <Hash size={14} className={styles['stats-card-icon']} />
                  <span className={styles['stats-card-value']}>
                    {formatNumber(modelDetail.usageCount)}
                  </span>
                  <span className={styles['stats-card-label']}>Total Requests</span>
                </div>

                {modelDetail.totalTokens > 0 && (
                  <div className={styles['stats-card']}>
                    <Layers size={14} className={styles['stats-card-icon']} />
                    <span className={styles['stats-card-value']}>
                      {formatTokenCount(modelDetail.totalTokens)}
                    </span>
                    <span className={styles['stats-card-label']}>Total Tokens</span>
                  </div>
                )}

                {modelDetail.totalCost > 0 && (
                  <div
                    className={`${styles['stats-card']} ${styles['stats-card-cost']}`}
                  >
                    <DollarSign size={14} className={styles['stats-card-icon']} />
                    <span className={styles['stats-card-value']}>
                      $
                      {modelDetail.totalCost < 0.01
                        ? modelDetail.totalCost.toFixed(4)
                        : modelDetail.totalCost.toFixed(2)}
                    </span>
                    <span className={styles['stats-card-label']}>Total Cost</span>
                  </div>
                )}

                {modelDetail.avgTokensPerSec > 0 && (
                  <div className={styles['stats-card']}>
                    <TrendingUp size={14} className={styles['stats-card-icon']} />
                    <span className={styles['stats-card-value']}>
                      {modelDetail.avgTokensPerSec.toFixed(1)}
                    </span>
                    <span className={styles['stats-card-label']}>Avg tok/s</span>
                  </div>
                )}
              </div>

              {/* -- Success / Error Rate Bar ---------- */}
              {(modelDetail.successCount > 0 || modelDetail.errorCount > 0) && (
                <div className={styles['success-rate-layout-row']}>
                  <div className={styles['success-rate-bar']}>
                    <div
                      className={styles['success-rate-fill']}
                      style={{
                        width: `${(modelDetail.successCount / modelDetail.usageCount) * 100}%`,
                      }}
                    />
                  </div>
                  <div className={styles['success-rate-labels']}>
                    <span className={styles['success-label']}>
                      <CheckCircle size={10} />
                      {formatNumber(modelDetail.successCount)}
                    </span>
                    {modelDetail.errorCount > 0 && (
                      <span className={styles['error-label']}>
                        <XCircle size={10} />
                        {formatNumber(modelDetail.errorCount)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* -- Detail Rows ----------------------- */}
              <div className={styles['key-value-grid']} style={{ marginTop: 12 }}>
                {modelDetail.totalInputTokens > 0 && (
                  <>
                    <span className={styles['key-value-label']}>Input Tokens</span>
                    <span className={styles['key-value-content-mono']}>
                      {formatTokenCount(modelDetail.totalInputTokens)}
                    </span>
                  </>
                )}

                {modelDetail.totalOutputTokens > 0 && (
                  <>
                    <span className={styles['key-value-label']}>Output Tokens</span>
                    <span className={styles['key-value-content-mono']}>
                      {formatTokenCount(modelDetail.totalOutputTokens)}
                    </span>
                  </>
                )}

                {modelDetail.avgLatency > 0 && (
                  <>
                    <span className={styles['key-value-label']}>Avg Latency</span>
                    <span className={styles['key-value-content-mono']}>
                      {modelDetail.avgLatency >= 1000
                        ? `${(modelDetail.avgLatency / 1000).toFixed(1)}s`
                        : `${Math.round(modelDetail.avgLatency)}ms`}
                    </span>
                  </>
                )}

                {modelDetail.firstUsed && (
                  <>
                    <span className={styles['key-value-label']}>
                      <Calendar
                        size={10}
                        style={{ marginRight: 4, opacity: 0.5 }}
                      />
                      First Used
                    </span>
                    <span className={styles['key-value-content-mono']}>
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
                    <span className={styles['key-value-label']}>
                      <Clock
                        size={10}
                        style={{ marginRight: 4, opacity: 0.5 }}
                      />
                      Last Used
                    </span>
                    <span className={styles['key-value-content-mono']}>
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
