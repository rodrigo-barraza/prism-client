/**
 * The conversation stats the Settings panel shows (tokens, cost, requests,
 * models, tools, live tok/s and TTFT), from the backend's aggregate and the
 * live turn.
 *
 * Pure. Token counts never go down within one load: `tokenMark` is the most
 * a committed render showed, and the result says what this one shows
 * (`displayedTokens`) so the chat can raise the mark after commit.
 */

import type { ConversationStats as DisplayConversationStats } from "../components/SettingsPanelComponent";
import type { ConversationStats } from "../types/types";
import type { ClientMessage, SubAgentActivityEntry } from "./agentConversationReducer";
import {
  buildUnifiedToolCounts,
  CAPABILITY_TOOL_NAMES,
  toolCountsToUsedTools,
  type StreamingMetrics,
} from "./utilities";

/** Tokens a conversation's badges have shown: they never go back down within one load. */
export interface TokenMark {
  input: number;
  output: number;
  total: number;
}

export const ZERO_TOKEN_MARK: TokenMark = { input: 0, output: 0, total: 0 };

/** `mark` raised to `displayed`, or `mark` itself when nothing went up. */
export function raiseTokenMark(mark: TokenMark, displayed: TokenMark): TokenMark {
  if (displayed.input <= mark.input && displayed.output <= mark.output && displayed.total <= mark.total) {
    return mark;
  }
  return {
    input: Math.max(mark.input, displayed.input),
    output: Math.max(mark.output, displayed.output),
    total: Math.max(mark.total, displayed.total),
  };
}

/** What useConversationStats worked out from the messages and the backend's aggregate. */
export interface ClientConversationStats extends StreamingMetrics {
  uniqueModels: string[];
  uniqueProviders: string[];
  totalCost: number;
  totalTokens: { input: number; output: number; total: number };
  requestCount: number;
  usedTools: Array<{ name: string; count: number }>;
  modalities: Record<string, number>;
  /** Completed turns' elapsed time. */
  elapsedTime: number;
}

export interface DisplayConversationStatsInputs {
  messages: readonly ClientMessage[];
  backendConversationStats: ConversationStats | null;
  isBackendStatsStale: boolean;
  clientStats: ClientConversationStats;
  subAgentToolActivity: Record<string, SubAgentActivityEntry>;
  currentTurnStart: number | null;
  subAgentCount: number;
  maxSubAgentDepth: number;
  tokenMark: TokenMark;
}

export interface DisplayConversationStatsResult {
  stats: DisplayConversationStats | null;
  /** The tokens this result shows; raise the mark to them once it is on screen. */
  displayedTokens: TokenMark | null;
}

function mapSubStats(sub: ConversationStats | undefined): DisplayConversationStats | undefined {
  if (!sub) return undefined;
  return {
    messageCount: sub.requestCount || 0,
    deletedCount: 0,
    requestCount: sub.requestCount || 0,
    uniqueModels: sub.models || [],
    uniqueProviders: sub.providers || [],
    totalTokens: {
      input: sub.totalInputTokens || 0,
      output: sub.totalOutputTokens || 0,
      total: sub.totalTokens || 0,
      cacheRead: sub.totalCacheReadInputTokens || 0,
      cacheWrite: sub.totalCacheCreationInputTokens || 0,
      reasoning: sub.totalReasoningOutputTokens || 0,
    },
    totalCost: sub.totalCost || 0,
    originalTotalCost: 0,
    usedTools: toolCountsToUsedTools(sub.toolCounts),
    modalities: {},
    completedElapsedTime: sub.totalElapsedTime || 0,
    avgTokensPerSec: sub.avgTokensPerSec || undefined,
    avgTimeToGeneration: sub.avgTimeToGeneration || undefined,
  };
}

function asFlags(modalities: Record<string, unknown>): Record<string, boolean> {
  const mapped: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(modalities)) {
    mapped[key] = !!value;
  }
  return mapped;
}

export function buildDisplayConversationStats(
  inputs: DisplayConversationStatsInputs,
): DisplayConversationStatsResult {
  const {
    messages,
    backendConversationStats,
    isBackendStatsStale,
    clientStats,
    subAgentToolActivity,
    currentTurnStart,
    subAgentCount,
    maxSubAgentDepth,
    tokenMark,
  } = inputs;
  if (messages.length === 0) return { stats: null, displayedTokens: null };

  const liveMetrics = {
    liveStreamingTokens: clientStats.liveStreamingTokens,
    liveStreamingStartTime: clientStats.liveStreamingStartTime,
    liveStreamingLastChunkTime: clientStats.liveStreamingLastChunkTime,
    liveStreamingBurstTokens: clientStats.liveStreamingBurstTokens,
    liveStreamingBurstElapsed: clientStats.liveStreamingBurstElapsed,
    subAgentGenerationProgress: clientStats.subAgentGenerationProgress,
    lastTimeToGeneration: clientStats.lastTimeToGeneration,
    liveProcessingStartTime: clientStats.liveProcessingStartTime,
    liveProcessingPhase: clientStats.liveProcessingPhase,
    liveTtftSamples: clientStats.liveTtftSamples,
    liveGenProgress: clientStats.liveGenProgress,
  };
  const lastMessage = messages[messages.length - 1];
  const conversationStartTime = messages[0]?.timestamp;
  const hasActiveUncountedRequest =
    lastMessage?.role === "assistant" && !lastMessage.usage && !lastMessage._intermediateUsage;
  // _liveGenProgress (from generation_progress SSE) carries authoritative,
  // monotonic token counts from ConversationGenerationTracker.
  // _backgroundUsage accumulates tokens from fire-and-forget LLM calls
  // (memory extraction, consolidation) as they complete.
  const liveProgress = lastMessage?.role === "assistant" ? lastMessage._liveGenProgress : null;
  const backgroundUsage = lastMessage?.role === "assistant" ? lastMessage._backgroundUsage : null;
  const backgroundInput = backgroundUsage?.inputTokens || 0;
  const backgroundOutput = backgroundUsage?.outputTokens || 0;

  if (backendConversationStats) {
    // -- Token counts come exclusively from the backend --
    // When done, use backendConversationStats which includes everything.
    // Live cost signals for the in-flight turn, best first:
    // _liveGenProgress.estimatedCost streams continuously from
    // the tracker (covers orchestrator + sub-agents + tool
    // sub-requests, all providers); usage_update and the final
    // message cost arrive at iteration/turn boundaries. Take
    // the max so the badge ticks live and never regresses.
    const activeMessageCost =
      lastMessage?.role === "assistant" && isBackendStatsStale
        ? Math.max(
            lastMessage.estimatedCost || 0,
            lastMessage._liveGenProgress?.estimatedCost || 0,
            lastMessage._intermediateEstimatedCost || 0,
          )
        : 0;
    const liveOutput = (liveProgress?.outputTokens || 0) + backgroundOutput;
    const liveInput = (liveProgress?.inputTokens || 0) + backgroundInput;
    const liveTotal = liveInput + liveOutput;

    // Use the larger of backend stats or live progress to prevent
    // dips during the gap between stream end and backend refresh.
    const displayedTokens = {
      input: Math.max(tokenMark.input, Math.max(backendConversationStats.totalInputTokens || 0, liveInput)),
      output: Math.max(tokenMark.output, Math.max(backendConversationStats.totalOutputTokens || 0, liveOutput)),
      total: Math.max(tokenMark.total, Math.max(backendConversationStats.totalTokens || 0, liveTotal)),
    };
    const activeModel = lastMessage?.role === "assistant" ? lastMessage.model : null;

    const stats = {
      // -- Backend is source of truth (all requests incl. background) --
      messageCount: messages.length,
      deletedCount: 0,
      requestCount:
        (backendConversationStats.requestCount || 0) +
        (backgroundUsage?.requests || 0) +
        (hasActiveUncountedRequest ? 1 : 0),
      uniqueModels: [
        ...new Set([...(backendConversationStats.models || []), ...(activeModel ? [activeModel] : [])]),
      ],
      uniqueProviders: clientStats.uniqueProviders,
      totalTokens: {
        ...displayedTokens,
        cacheRead: backendConversationStats.totalCacheReadInputTokens || 0,
        cacheWrite: backendConversationStats.totalCacheCreationInputTokens || 0,
        reasoning: backendConversationStats.totalReasoningOutputTokens || 0,
      },
      totalCost: (backendConversationStats.totalCost || 0) + (backgroundUsage?.cost || 0) + activeMessageCost,
      originalTotalCost: 0,
      // Backend toolCounts already includes sub-agent tools
      // (aggregated via discoverDescendantConversationIds).
      // Only overlay live SSE deltas for inflight requests.
      usedTools: buildUnifiedToolCounts(
        clientStats.usedTools,
        backendConversationStats.toolCounts,
        subAgentToolActivity,
      ),
      modalities: asFlags(backendConversationStats.modalities || clientStats.modalities || {}),
      completedElapsedTime: backendConversationStats.totalElapsedTime || clientStats.elapsedTime,
      currentTurnStart,
      conversationStartTime,
      ...liveMetrics,
      avgTokensPerSec: backendConversationStats.avgTokensPerSec || null,
      avgTimeToGeneration: backendConversationStats.avgTimeToGeneration || null,
      orchestrator: mapSubStats(backendConversationStats.orchestrator),
      subAgents: mapSubStats(backendConversationStats.subAgents),
      subAgentCount,
      maxSubAgentDepth,
    } as unknown as DisplayConversationStats;
    return { stats, displayedTokens };
  }

  // -- Client-side fallback (live generation, no backend data yet) --
  // When _liveGenProgress exists, use backend-authoritative token
  // counts instead of the client-side computeConversationStats math.
  // Include _backgroundUsage from fire-and-forget LLM calls.
  const fallbackTokens = liveProgress
    ? {
        input: (liveProgress.inputTokens || 0) + backgroundInput,
        output: (liveProgress.outputTokens || 0) + backgroundOutput,
        total: (liveProgress.inputTokens || 0) + (liveProgress.outputTokens || 0) + backgroundInput + backgroundOutput,
      }
    : {
        input: (clientStats.totalTokens.input || 0) + backgroundInput,
        output: (clientStats.totalTokens.output || 0) + backgroundOutput,
        total: (clientStats.totalTokens.total || 0) + backgroundInput + backgroundOutput,
      };
  const displayedTokens = {
    input: Math.max(tokenMark.input, fallbackTokens.input || 0),
    output: Math.max(tokenMark.output, fallbackTokens.output || 0),
    total: Math.max(tokenMark.total, fallbackTokens.total || 0),
  };
  const stats = {
    messageCount: messages.length,
    deletedCount: 0,
    requestCount:
      clientStats.requestCount + (backgroundUsage?.requests || 0) + (hasActiveUncountedRequest ? 1 : 0),
    uniqueModels: clientStats.uniqueModels,
    uniqueProviders: clientStats.uniqueProviders,
    totalTokens: displayedTokens,
    totalCost:
      clientStats.totalCost +
      (backgroundUsage?.cost || 0) +
      // Live in-flight turn cost — the conversation doc's
      // totalCost only updates once the turn persists.
      (lastMessage?.role === "assistant"
        ? Math.max(
            lastMessage.estimatedCost || 0,
            liveProgress?.estimatedCost || 0,
            lastMessage._intermediateEstimatedCost || 0,
          )
        : 0),
    originalTotalCost: 0,
    // No backend stats yet — use client-derived tool counts as fallback
    usedTools: buildUnifiedToolCounts(
      clientStats.usedTools,
      Object.fromEntries(
        clientStats.usedTools
          .filter((entry) => !CAPABILITY_TOOL_NAMES.has(entry.name))
          .map((entry) => [entry.name, entry.count]),
      ),
      subAgentToolActivity,
    ),
    modalities: asFlags(clientStats.modalities || {}),
    completedElapsedTime: clientStats.elapsedTime,
    currentTurnStart,
    conversationStartTime,
    ...liveMetrics,
    subAgentCount,
    maxSubAgentDepth,
  } as unknown as DisplayConversationStats;
  return { stats, displayedTokens };
}
