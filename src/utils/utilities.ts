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
    // ISO datetime (sub-day presets) passes through; day-only gets midnight
    params.from = dateRange.from.includes("T")
      ? dateRange.from
      : new Date(dateRange.from).toISOString();
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
 * Get unique model names from assistant messages.
 * Shared between ChatConversationComponent and admin/conversations.
 */
export function getUniqueModels(messages: Message[]): string[] {
  return [
    ...new Set(
      messages
        .filter((message) => message.role === "assistant" && message.model)
        .map((message) => message.model!),
    ),
  ];
}

/**
 * Get unique provider keys from assistant messages.
 * Shared between useConversationStats and SettingsPanel.
 */
export function getUniqueProviders(messages: Message[]): string[] {
  return [
    ...new Set(
      messages
        .filter((message) => message.role === "assistant" && message.provider)
        .map((message) => message.provider!),
    ),
  ];
}

/**
 * Sum estimatedCost across all messages.
 */
export function getConversationCost(messages: Message[]): number {
  return messages.reduce(
    (sum, message) => {
      // Finalized cost from the done event (authoritative)
      if (message.estimatedCost) return sum + message.estimatedCost;
      // Backend-computed intermediate cost from usage_update events (live streaming)
      if (message._intermediateEstimatedCost) return sum + message._intermediateEstimatedCost;
      return sum;
    },
    0,
  );
}

/**
 * Aggregate input/output tokens and request count from assistant messages.
 * Returns { totalTokens: { input, output, total }, requestCount }.
 */
export interface SubAgentProgress {
  tokPerSec?: number;
  outputTokens?: number;
  totalOutputTokens?: number;
  status?: string;
}

export interface GenProgress {
  tokPerSec?: number;
  tokensPerSecond?: number;
  timestamp?: number;
  activeRequests?: number;
  outputTokens?: number;
}

export interface ConversationTokenStats {
  totalTokens: { input: number; output: number; total: number };
  requestCount: number;
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

export function getConversationTokenStats(messages: Message[]): ConversationTokenStats {
  let input = 0;
  let output = 0;
  let requests = 0;
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
    // Finalized messages have usage from the provider
    if (message.usage) {
      requests += message.usage.requests || 1;
      input += getTotalInputTokens(message.usage);
      output += message.usage.outputTokens || 0;
    }
    // Retroactive TTFT from completed messages
    if (message.timeToGeneration != null) {
      lastTimeToGeneration = message.timeToGeneration;
    }
    // Intermediate authoritative usage from backend usage_update events.
    // Priority: usage (done) > _intermediateUsage (per-iteration) > _liveGenProgress (tracker)
    //
    // _liveGenProgress.outputTokens may exceed _intermediateUsage when
    // a new iteration completes — use whichever is higher so the token
    // count never stalls between iterations.
    if (!message.usage && message._intermediateUsage) {
      const intermediateOutput = message._intermediateUsage.outputTokens || 0;
      // Use tracker's real token count if it exceeds intermediate (new iteration completed)
      const trackerOutput = message._liveGenProgress?.outputTokens || 0;
      const effectiveOutput = Math.max(intermediateOutput, trackerOutput);

      requests += message._intermediateUsage.requests || 1;
      input += getTotalInputTokens(message._intermediateUsage);
      output += effectiveOutput;
      // Still expose streaming metadata for tok/s computation
      liveStreamingTokens = effectiveOutput;
      liveStreamingStartTime = message._streamingStartTime || null;
      liveStreamingLastChunkTime = message._streamingLastChunkTime || null;
      liveStreamingBurstTokens = message._streamingBurstTokens || 0;
      liveStreamingBurstElapsed = message._streamingBurstElapsed || 0;
    }
    // In-flight streaming messages: use tracker's real token count
    // (fed exclusively by provider-reported usage, never per-chunk estimates)
    else if (
      !message.usage &&
      message._liveGenProgress &&
      (message._liveGenProgress.outputTokens ?? 0) > 0
    ) {
      output += message._liveGenProgress.outputTokens ?? 0;
      liveStreamingTokens = message._liveGenProgress.outputTokens ?? 0;
      liveStreamingStartTime = message._streamingStartTime || null;
      liveStreamingLastChunkTime = message._streamingLastChunkTime || null;
      liveStreamingBurstTokens = message._streamingBurstTokens || 0;
      liveStreamingBurstElapsed = message._streamingBurstElapsed || 0;
    }
    // In-flight streaming with no token data yet (first iteration
    // before provider-reported usage arrives). Expose streaming
    // timing metadata so the chunk-counting fallback in useTokenRate
    // (Priority 3) can compute live tok/s from burst counters.
    else if (
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
      // Sum live sub-agent output tokens so the token badge increments
      // in real-time during sub-agent generation (before completion).
      // Use cumulative totalOutputTokens (not burst-scoped outputTokens)
      // so the count doesn't reset when sub-agents transition between phases.
      for (const wp of Object.values(
        message._subAgentGenerationProgress,
      ) as SubAgentProgress[]) {
        const count = wp.totalOutputTokens || wp.outputTokens || 0;
        if (count > 0) {
          output += count;
        }
      }
    }
    // Backend-computed tok/s from ConversationGenerationTracker
    if (message._liveGenProgress) {
      liveGenProgress = message._liveGenProgress;
    }
    // Accumulated sub-agent tokens (from sub_agent_status complete events)
    // These arrive independently of the coordinator's own usage.
    // Only add completed sub-agent tokens that aren't already counted
    // from _subAgentGenerationProgress (which is removed on completion).
    if (message._subAgentTokens) {
      input += message._subAgentTokens.input || 0;
      output += message._subAgentTokens.output || 0;
      requests += message._subAgentTokens.requests || 0;
    }
  }
  return {
    totalTokens: { input, output, total: input + output },
    requestCount: requests,
    // Live streaming metadata for real-time tok/s computation
    liveStreamingTokens,
    liveStreamingStartTime,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    liveOutputCharacters,
    subAgentGenerationProgress,
    // TTFT tracking
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  };
}

/**
 * Count tool invocations across all messages.
 * Returns [{ name, count }] sorted by count.
 */
export function getUsedTools(
  messages: Message[],
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    if (message.thinking)
      counts.set("Thinking", (counts.get("Thinking") || 0) + 1);
    if (message.toolCalls && message.toolCalls.length > 0) {
      counts.set("Tool Calling", (counts.get("Tool Calling") || 0) + 1);
      for (const toolCall of message.toolCalls) {
        if (toolCall.name)
          counts.set(toolCall.name, (counts.get(toolCall.name) || 0) + 1);
      }
    }
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

/**
 * Tool names that represent provider capabilities rather than
 * function-level tool calls. Used to separate capability badges
 * (Thinking, Tool Calling, Web Search, etc.) from individual
 * tool-call badges (read_file, search_file_contents, etc.) in the stats UI.
 */
export const CAPABILITY_TOOL_NAMES = new Set([
  "Thinking",
  "Tool Calling",
  "Web Search",
  "Google Search",
  "Code Execution",
  "Computer Use",
  "File Search",
  "URL Context",
  "Image Generation",
]);

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
 * Merge multiple tool-count sources into a single usedTools array
 * for display in the stats badges. Handles three layers:
 *
 * 1. **clientTools** — from getUsedTools(messages), includes both
 *    capability-level entries (Thinking, Tool Calling) and
 *    coordinator function-level entries (read_file, etc.)
 * 2. **backendToolCounts** — optional { name: count } map from
 *    backend conversation stats (authoritative post-completion)
 * 3. **subAgentToolActivity** — optional { [subAgentId]: { toolNames: { name: count } } }
 *    from live SSE events (real-time during generation)
 *
 * When both backend and live sub-agent counts exist for the same tool,
 * the higher count wins (prevents badges from appearing to decrease
 * as backend catches up).
 */
export function mergeUsedToolsWithSubAgents(
  clientTools: Array<{ name: string; count: number }>,
  backendToolCounts: Record<string, number> | null | undefined,
  subAgentToolActivity:
    | Record<string, { toolNames?: Record<string, number> }>
    | null
    | undefined,
): Array<{ name: string; count: number }> {
  // Separate capabilities from function-level tool calls
  const capabilities = clientTools.filter((clientTool) =>
    CAPABILITY_TOOL_NAMES.has(clientTool.name),
  );

  // Start with authoritative source (backend if available, else client function-level)
  const merged = new Map<string, number>();
  if (backendToolCounts) {
    for (const toolEntry of toolCountsToUsedTools(backendToolCounts)) {
      merged.set(toolEntry.name, toolEntry.count);
    }
  } else {
    for (const tool of clientTools) {
      if (CAPABILITY_TOOL_NAMES.has(tool.name)) continue;
      merged.set(tool.name, (merged.get(tool.name) || 0) + tool.count);
    }
  }

  // Overlay live sub-agent tool counts (real-time during generation)
  if (subAgentToolActivity) {
    for (const subAgent of Object.values(subAgentToolActivity)) {
      if (!subAgent.toolNames) continue;
      for (const [name, count] of Object.entries(subAgent.toolNames)) {
        if (CAPABILITY_TOOL_NAMES.has(name)) continue;
        merged.set(name, Math.max(merged.get(name) || 0, count));
      }
    }
  }

  const mergedTools = [...merged.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((agent, current) => current.count - agent.count);

  return [...capabilities, ...mergedTools];
}

/**
 * Derive modality flags from a conversation's messages array.
 * Returns an object with boolean flags for each modality
 * (textIn, textOut, imageIn, imageOut, audioIn, audioOut,
 * videoIn, docIn, webSearch, codeExecution, functionCalling, thinking).
 */
export function getModalities(messages: Message[]) {
  const modalities = {
    textIn: false,
    textOut: false,
    imageIn: false,
    imageOut: false,
    audioIn: false,
    audioOut: false,
    videoIn: false,
    docIn: false,
    webSearch: false,
    codeExecution: false,
    functionCalling: false,
    thinking: false,
  };

  const WEB_SEARCH_NAMES: Set<string> = new Set([TOOL_NAMES.SEARCH_WEB, TOOL_NAMES.SEARCH_WEB_PREVIEW]);
  const CODE_EXEC_NAMES: Set<string> = new Set([TOOL_NAMES.CODE_EXECUTION]);

  for (const message of messages || []) {
    const isUser = message.role === "user";
    const isAssistant = message.role === "assistant";
    if (message.content && (isUser || isAssistant)) {
      if (isUser && !message.liveTranscription) modalities.textIn = true;
      if (isAssistant) modalities.textOut = true;
    }
    // Tool calls are structured text output
    if (isAssistant && message.toolCalls && message.toolCalls.length > 0) {
      modalities.textOut = true;
    }
    if (message.audio) {
      if (isUser) modalities.audioIn = true;
      if (isAssistant) modalities.audioOut = true;
    }
    if (message.images && message.images.length > 0) {
      for (const imageReference of message.images) {
        if (typeof imageReference !== "string") continue;
        const isDoc =
          imageReference.startsWith("data:application/") ||
          imageReference.startsWith("data:text/") ||
          imageReference.endsWith(".pdf") ||
          imageReference.endsWith(".txt");
        const isVideo =
          imageReference.startsWith("data:video/") ||
          [".mp4", ".mov", ".avi", ".webm"].some((ext) =>
            imageReference.endsWith(ext),
          );
        if (isDoc) {
          modalities.docIn = true;
        } else if (isVideo) {
          if (isUser) modalities.videoIn = true;
        } else {
          // Actual image ref
          if (isUser) modalities.imageIn = true;
          if (isAssistant) modalities.imageOut = true;
        }
      }
    }
    // Standalone image field (not from images array)
    if (message.image && !message.images?.length) {
      if (isUser) modalities.imageIn = true;
      if (isAssistant) modalities.imageOut = true;
    }
    if (message.documents && message.documents.length > 0) {
      modalities.docIn = true;
    }

    // Classify tool calls by type
    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const toolCall of message.toolCalls) {
        const name = (toolCall.name || "").toLowerCase();
        if (WEB_SEARCH_NAMES.has(name)) {
          modalities.webSearch = true;
        } else if (CODE_EXEC_NAMES.has(name)) {
          modalities.codeExecution = true;
        } else {
          modalities.functionCalling = true;
        }
      }
    }

    // Detect inline web search results (from streaming)
    if (
      isAssistant &&
      typeof message.content === "string" &&
      message.content.includes("> **Sources:**")
    ) {
      modalities.webSearch = true;
    }

    // Detect inline code execution blocks (from streaming)
    if (
      isAssistant &&
      typeof message.content === "string" &&
      message.content.includes("```exec-")
    ) {
      modalities.codeExecution = true;
    }

    // Tool result messages → function calling
    if (message.role === "tool") {
      modalities.functionCalling = true;
    }

    // Detect thinking / reasoning
    if (isAssistant && message.thinking) {
      modalities.thinking = true;
    }
  }
  return modalities;
}

/**
 * Compute cumulative wall-clock elapsed time across all user→assistant turns.
 * Each user message with a `timestamp` paired with a subsequent assistant
 * message's `completedAt` (or `timestamp`) constitutes one turn.
 * Works for both live conversations (client-side `completedAt`) and restored
 * conversations from the DB (server-side `timestamp` on assistant messages).
 * Returns total elapsed seconds.
 */
export function getConversationElapsedTime(messages: Message[]): number {
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const userMessage = messages[i];
    if (userMessage.role !== "user" || !userMessage.timestamp) continue;
    // Find the next assistant message that completed
    for (let j = i + 1; j < messages.length; j++) {
      const assistantMessage = messages[j];
      if (assistantMessage.role !== "assistant") continue;
      const endTs = assistantMessage.completedAt || assistantMessage.timestamp;
      if (!endTs) break;
      const start = new Date(userMessage.timestamp).getTime();
      const end = new Date(endTs).getTime();
      if (end > start) total += (end - start) / 1000;
      break;
    }
  }
  return total;
}

/**
 * Resolve the best default model for new conversations.
 *
 * Prefers the server-provided `recommendedDefault` / `recommendedAgenticDefault`
 * from the /config response (authoritative, centralized priority ladder).
 * Falls back to a local priority ladder only when the server field is absent
 * (backward compatibility with older backend versions).
 *
 * Local fallback priority:
 * 1. Gemini 3.5 Flash (google) if available.
 * 2. Latest Haiku (anthropic) if available.
 * 3. Latest Mini/Small GPT (openai) if available.
 * 4. Fall back to the first available model that matches criteria.
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
