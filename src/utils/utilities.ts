// ============================================================
// Prism Client — Utilities
// ============================================================
// Prism-specific helpers. Shared workspace functions should be
// imported directly from @rodrigo-barraza/utilities-library at
// each call site — never re-exported through this file.
// ============================================================

import type {
  Message,
  TokenUsage,
  PrismConfig,
  ModelOption,
} from "../types/types";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";

// -- Prism-specific utilities ---------------------------------

export interface LmStudioLoadBody {
  model: string;
  context_length?: number;
  flash_attention?: boolean;
  offload_kv_cache_to_gpu?: boolean;
  eval_batch_size?: number;
}

/**
 * Build the JSON body for LM Studio load requests.
 * Maps camelCase options to the snake_case API contract.
 * Used by PrismService.loadLmStudioModel, loadLmStudioModelStream,
 * and IrisService.loadLmStudioModel.
 */
export function buildLmStudioLoadBody(
  model: string,
  options: {
    contextLength?: number;
    flashAttention?: boolean;
    offloadKvCache?: boolean;
    evalBatchSize?: number;
  } = {},
): LmStudioLoadBody {
  const body: LmStudioLoadBody = { model };
  if (options.contextLength != null)
    body.context_length = options.contextLength;
  if (options.flashAttention != null)
    body.flash_attention = options.flashAttention;
  if (options.offloadKvCache != null)
    body.offload_kv_cache_to_gpu = options.offloadKvCache;
  if (options.evalBatchSize != null)
    body.eval_batch_size = options.evalBatchSize;
  return body;
}

/**
 * Get the total input token count from a usage object.
 * Providers like Anthropic and Google split prompt tokens into
 * new + cache_read + cache_write. This aggregates all three.
 */
export function getTotalInputTokens(
  usage: TokenUsage | null | undefined,
): number {
  if (!usage) return 0;
  return (
    (usage.inputTokens || 0) +
    (usage.cacheReadInputTokens || 0) +
    (usage.cacheCreationInputTokens || 0)
  );
}

/**
 * Build ISO date range params from a { from, to } object.
 * Returns an object with optional `from` and `to` keys.
 */
export function buildDateRangeParams(
  dateRange: { from?: string; to?: string } | null | undefined,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (dateRange?.from) {
    // ISO datetime (sub-day presets) passes through; day-only gets local midnight
    params.from = dateRange.from.includes("T")
      ? dateRange.from
      : new Date(dateRange.from + "T00:00:00").toISOString();
  }
  if (dateRange?.to) {
    params.to = dateRange.to.includes("T")
      ? dateRange.to
      : new Date(dateRange.to + "T23:59:59").toISOString();
  }
  return params;
}

/**
 * Copy text to clipboard with error handling.
 * Uses the modern Clipboard API with a legacy execCommand fallback
 * for insecure contexts (plain HTTP on non-localhost origins).
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyViaLegacyExecCommand(text);
    }
  }
  return copyViaLegacyExecCommand(text);
}

function copyViaLegacyExecCommand(text: string): boolean {
  const textAreaElement = document.createElement("textarea");
  textAreaElement.value = text;
  textAreaElement.setAttribute("readonly", "");
  textAreaElement.style.position = "fixed";
  textAreaElement.style.left = "-9999px";
  textAreaElement.style.opacity = "0";
  document.body.appendChild(textAreaElement);

  textAreaElement.select();
  textAreaElement.setSelectionRange(0, text.length);

  let isSuccessful = false;
  try {
    isSuccessful = document.execCommand("copy");
  } catch {
    isSuccessful = false;
  }

  document.body.removeChild(textAreaElement);
  return isSuccessful;
}

/**
 * Constructs the settings defaults from the server-provided parameter descriptors.
 * Used at conversation initialization to ensure the client uses authoritative defaults.
 */
export function buildSettingsDefaults(
  parameterDescriptors: Array<{ key: string; defaultValue: unknown }> | null | undefined,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (!parameterDescriptors) return defaults;
  for (const descriptor of parameterDescriptors) {
    defaults[descriptor.key] = descriptor.defaultValue;
  }
  return defaults;
}


/**
 * Aggregate input/output tokens and request count from assistant messages.
 * Returns { totalTokens: { input, output, total }, requestCount }.
 */
export interface SubAgentProgress {
  tokensPerSecond?: number;
  outputTokens?: number;
  totalOutputTokens?: number;
  status?: string;
}

export interface GenProgress {
  tokensPerSecond?: number;
  timestamp?: number;
  activeRequests?: number;
  outputTokens?: number;
}

export interface StreamingMetrics {
  liveStreamingTokens: number;
  liveStreamingStartTime: number | null;
  liveStreamingLastChunkTime: number | null;
  liveStreamingBurstTokens: number;
  liveStreamingBurstElapsed: number;
  liveOutputCharacters: number;
  subAgentGenerationProgress: Record<string, SubAgentProgress> | null;
  lastTimeToGeneration: number | null;
  liveProcessingStartTime: number | null;
  liveProcessingPhase: string | null;
  liveTtftSamples: number[] | null;
  liveGenProgress: GenProgress | null;
}

export interface ConversationTokenMetrics extends StreamingMetrics {
  totalTokens?: { input: number; output: number; total: number };
  requestCount?: number;
}

/**
 * Extract live streaming metadata and ephemeral generation metrics from messages.
 * Unlike token aggregation (which is now authoritative from the server),
 * these fields are inherently real-time client state derived from SSE events.
 */
export function extractLiveStreamingMetrics(messages: Message[]): StreamingMetrics {
  let liveStreamingTokens = 0;
  let liveStreamingStartTime = null;
  let liveStreamingLastChunkTime = null;
  let liveStreamingBurstTokens = 0;
  let liveStreamingBurstElapsed = 0;
  let subAgentGenerationProgress = null;
  let lastTimeToGeneration = null; // retroactive TTFT from completed messages (seconds)
  let liveProcessingStartTime = null; // performance.now() when processing phase started
  let liveProcessingPhase = null; // current phase of in-flight message (processing/loading/generating)
  let liveTtftSamples = null; // server-computed TTFT samples (seconds[]) from generation_started events
  let liveOutputCharacters = 0; // real character count from streaming chunks
  let liveGenProgress = null; // backend-computed tok/s from ConversationGenerationTracker

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    // Retroactive TTFT from completed messages
    if (message.timeToGeneration != null) {
      lastTimeToGeneration = message.timeToGeneration;
    }

    // Still expose streaming metadata for tok/s computation
    if (!message.usage && message._intermediateUsage) {
      const intermediateOutput = message._intermediateUsage.outputTokens || 0;
      const trackerOutput = message._liveGenProgress?.outputTokens || 0;
      const effectiveOutput = Math.max(intermediateOutput, trackerOutput);

      liveStreamingTokens = effectiveOutput;
      liveStreamingStartTime = message._streamingStartTime || null;
      liveStreamingLastChunkTime = message._streamingLastChunkTime || null;
      liveStreamingBurstTokens = message._streamingBurstTokens || 0;
      liveStreamingBurstElapsed = message._streamingBurstElapsed || 0;
    } else if (
      !message.usage &&
      message._liveGenProgress &&
      (message._liveGenProgress.outputTokens ?? 0) > 0
    ) {
      liveStreamingTokens = message._liveGenProgress.outputTokens ?? 0;
      liveStreamingStartTime = message._streamingStartTime || null;
      liveStreamingLastChunkTime = message._streamingLastChunkTime || null;
      liveStreamingBurstTokens = message._streamingBurstTokens || 0;
      liveStreamingBurstElapsed = message._streamingBurstElapsed || 0;
    } else if (
      !message.usage &&
      !message._intermediateUsage &&
      message._streamingStartTime &&
      message._streamingLastChunkTime
    ) {
      liveStreamingStartTime = message._streamingStartTime;
      liveStreamingLastChunkTime = message._streamingLastChunkTime;
      liveStreamingBurstTokens = message._streamingBurstTokens || 0;
      liveStreamingBurstElapsed = message._streamingBurstElapsed || 0;
    }

    // Track live output characters (real data, always increasing during streaming)
    if ((message._streamingOutputCharacters ?? 0) > 0) {
      liveOutputCharacters = message._streamingOutputCharacters!;
    }
    // Track live processing phase and start time for TTFT estimation
    if (message._processingStartTime) {
      liveProcessingStartTime = message._processingStartTime;
    }
    if (message.statusPhase) {
      liveProcessingPhase = message.statusPhase;
    }
    // Server-computed TTFT samples from generation_started events (per-iteration, per-sub-agent)
    if (message._ttftSamples?.length) {
      liveTtftSamples = message._ttftSamples;
    }
    // Sub-agent live generation progress (keyed by subAgentId)
    if (message._subAgentGenerationProgress) {
      subAgentGenerationProgress = message._subAgentGenerationProgress;
      for (const workerProgress of Object.values(
        subAgentGenerationProgress as Record<string, SubAgentProgress>,
      )) {
        const count = workerProgress.totalOutputTokens || workerProgress.outputTokens || 0;
        if (count > 0) {
          liveStreamingTokens += count;
        }
      }
    }
    // Backend-computed tok/s from ConversationGenerationTracker
    if (message._liveGenProgress) {
      liveGenProgress = message._liveGenProgress;
    }
  }

  return {
    liveStreamingTokens,
    liveStreamingStartTime,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    liveOutputCharacters,
    subAgentGenerationProgress,
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  };
}

export function computeConversationTokenMetrics(messages: Message[]): ConversationTokenMetrics {
  return extractLiveStreamingMetrics(messages);
}

/**
 * Count tool invocations across all messages.
 * Returns [{ name, count }] sorted by count.
 */

export const CAPABILITIES = {
  THINKING: "Thinking",
  TOOL_CALLING: "Tool Calling",
  WEB_SEARCH: "Web Search",
  GOOGLE_SEARCH: "Google Search",
  CODE_EXECUTION: "Code Execution",
  COMPUTER_USE: "Computer Use",
  FILE_SEARCH: "File Search",
  URL_CONTEXT: "URL Context",
  IMAGE_GENERATION: "Image Generation",
} as const;

/**
 * Tool names that represent provider capabilities rather than
 * function-level tool calls. Used to separate capability badges
 * (Thinking, Tool Calling, Web Search, etc.) from individual
 * tool-call badges (read_file, search_file_contents, etc.) in the stats UI.
 */
export const CAPABILITY_TOOL_NAMES: Set<string> = new Set(Object.values(CAPABILITIES));

/**
 * Convert a backend toolCounts map ({ name: count }) into the
 * usedTools array format ([{ name, count }]) sorted by count desc.
 */
export function toolCountsToUsedTools(
  toolCounts: Record<string, number> | null | undefined,
): Array<{ name: string; count: number }> {
  if (!toolCounts || Object.keys(toolCounts).length === 0) return [];
  return Object.entries(toolCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((agent, current) => current.count - agent.count);
}

/**
 * Build a unified usedTools array from an authoritative base and an
 * optional live SSE overlay.
 *
 * Architecture note: The backend's `getConversationStats` already
 * aggregates `toolApiNames` across ALL descendant conversation IDs
 * (main agent + sub-agents) via `discoverDescendantConversationIds`.
 * This means `backendToolCounts` is a fully-merged, authoritative
 * count — there is no need for the frontend to re-aggregate sub-agent
 * tool activity on top of it for persisted requests.
 *
 * The live SSE overlay is only needed for inflight requests whose tool
 * calls have not yet been persisted to the requests collection. During
 * active generation, the `Math.max` merge prevents badges from
 * appearing to decrease as the backend catches up.
 *
 * @param clientCapabilities  Capability-level entries (Thinking, Tool Calling, etc.)
 *                             extracted from the client message stream — these are
 *                             UI-only annotations that have no backend equivalent.
 * @param authoritativeToolCounts  Either `backendConversationStats.toolCounts` (preferred)
 *                                  or client-derived function-level tool counts as fallback.
 * @param liveSubAgentToolActivity  Optional live SSE sub-agent tool counts for inflight
 *                                   requests not yet reflected in the authoritative base.
 */
export function buildUnifiedToolCounts(
  clientCapabilities: Array<{ name: string; count: number }>,
  authoritativeToolCounts: Record<string, number> | null | undefined,
  liveSubAgentToolActivity:
    | Record<string, { toolNames?: Record<string, number> }>
    | null
    | undefined,
): Array<{ name: string; count: number }> {
  const capabilities = clientCapabilities.filter((entry) =>
    CAPABILITY_TOOL_NAMES.has(entry.name),
  );

  const merged = new Map<string, number>();

  if (authoritativeToolCounts) {
    for (const [name, count] of Object.entries(authoritativeToolCounts)) {
      merged.set(name, count);
    }
  }

  // Overlay live sub-agent tool counts for inflight requests only.
  // Uses Math.max so badges never decrease while SSE and backend converge.
  if (liveSubAgentToolActivity) {
    for (const subAgent of Object.values(liveSubAgentToolActivity)) {
      if (!subAgent.toolNames) continue;
      for (const [name, count] of Object.entries(subAgent.toolNames)) {
        if (CAPABILITY_TOOL_NAMES.has(name)) continue;
        merged.set(name, Math.max(merged.get(name) || 0, count));
      }
    }
  }

  const mergedTools = [...merged.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((toolA, toolB) => toolB.count - toolA.count);

  return [...capabilities, ...mergedTools];
}


/**
 * Resolve the best default model for new conversations.
 *
 * Prefers the server-provided `recommendedDefault` / `recommendedAgenticDefault`
 * from the /config response (authoritative, centralized priority ladder).
 */
export function resolveDefaultModel(
  config:
    | {
        textToText?: {
          models?: Record<string, ModelOption[]>;
          recommendedDefault?: { provider: string; model: string; temperature: number } | null;
          recommendedAgenticDefault?: { provider: string; model: string; temperature: number } | null;
        };
      }
    | null
    | undefined,
  fcOnly = false,
): { provider: string; model: string; temperature: number } {
  const serverDefault = fcOnly
    ? config?.textToText?.recommendedAgenticDefault
    : config?.textToText?.recommendedDefault;

  if (serverDefault?.provider && serverDefault?.model) {
    return {
      provider: serverDefault.provider,
      model: serverDefault.model,
      temperature: serverDefault.temperature ?? 1.0,
    };
  }

  return { provider: "", model: "", temperature: 1.0 };
}

/**
 * Detects if a message is an assistant message that is actively generating
 * but hasn't yet reported any token usage (even intermediate).
 */
export function isMessageUncounted(
  message: Message | Partial<Message> | null | undefined,
): boolean {
  if (!message || message.role !== "assistant") return false;
  return !message.usage && !message._intermediateUsage;
}

/**
 * Resolve the total conversation cost by aggregating authoritative backend stats,
 * background task usage, and any in-flight active message costs.
 */
export function resolveConversationCost(
  backendStats: { totalCost?: number } | null | undefined,
  backgroundUsage: { cost?: number } | null | undefined,
  activeMessage: Message | Partial<Message> | null | undefined,
  isStale: boolean,
): number {
  const backendCost = backendStats?.totalCost || 0;
  const backgroundCost = backgroundUsage?.cost || 0;

  // activeMessageCost is included only if backend stats are known to be stale
  // (e.g. during or immediately after a turn before the next polling tick)
  const activeMessageCost =
    activeMessage?.role === "assistant" && isStale
      ? activeMessage.estimatedCost ||
        activeMessage._intermediateEstimatedCost ||
        0
      : 0;

  return backendCost + backgroundCost + activeMessageCost;
}
