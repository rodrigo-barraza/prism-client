import { useState, useEffect, useReducer, useMemo } from "react";
import type {
  ConversationTokenStats,
  SubAgentProgress,
  GenProgress,
} from "../utils/utilities";

/**
 * Staleness threshold: if the most recent backend-emitted
 * generation_progress event arrived more than this many
 * milliseconds ago, the request has likely completed.
 */
const PROGRESS_STALE_MS = 3000;

/**
 * Staleness threshold for frontend chunk-counting fallback
 * (used by non-agentic conversations that lack backend progress events).
 */
const CHUNK_STALE_MS = 2000;

// --- Types --------------------------------------------------

interface TokensPerSecondState {
  current: number | null;
  lastComputed: number | null;
}

interface TokensPerSecondAction {
  computed: number | null;
  active: boolean;
}

export interface TokenRateResult {
  nowMilliseconds: number;
  perfNow: number;
  isStreaming: boolean;
  needsTicker: boolean;
  turnActive: boolean;
  totalElapsedTime: number;
  liveTokensPerSecond: number | null;
  computedTokensPerSecond: number | null;
  hasActiveSubAgents: boolean;
}

/**
 * Extended conversation stats that may include client-side turn tracking.
 * The base ConversationTokenStats from utilities covers server-derived fields,
 * but the hook may also receive currentTurnStart and completedElapsedTime
 * from the component layer.
 */
interface ExtendedConversationStats extends Partial<ConversationTokenStats> {
  currentTurnStart?: string | number | null;
  completedElapsedTime?: number;
}

/**
 * Last-value-hold reducer for tok/s display.
 *
 * While generating, shows the current live rate. When generation
 * pauses (tool execution, processing), holds the most recent
 * burst's final rate so the badge doesn't flicker to zero during
 * tool calls. Clears when the turn fully ends.
 */
function tokensPerSecondReducer(
  previousState: TokensPerSecondState,
  { computed, active }: TokensPerSecondAction,
): TokensPerSecondState {
  // Turn ended → clear everything
  if (!active) {
    return { current: null, lastComputed: null };
  }
  // Actively generating → show live rate, track for hold
  if (computed !== null) {
    return { current: computed, lastComputed: computed };
  }
  // Paused mid-turn: hold the last burst's rate
  if (previousState.lastComputed !== null) {
    return { current: previousState.lastComputed, lastComputed: null };
  }
  // Already paused, no new burst to record — keep showing held value
  return previousState;
}

const TOK_PER_SECOND_INITIAL: TokensPerSecondState = {
  current: null,
  lastComputed: null,
};

/**
 * Sum per-sub-agent tok/s from subAgentGenerationProgress.
 *
 * Each sub-agent's `tokPerSec` is computed independently by CoordinatorService's
 * `buildProgress()` using burst-scoped chunk counters — these values are
 * accurate per-sub-agent rates.
 *
 * The aggregate shown in the SettingsPanel should be the **additive sum**
 * of all concurrent sub-agents (e.g. 3 × 40 = 120 tok/s), not the average.
 */
function sumSubAgentThroughput(
  subAgentGenerationProgress: Record<string, SubAgentProgress> | null,
): { sum: number; count: number } {
  let sum = 0;
  let count = 0;
  if (!subAgentGenerationProgress) return { sum: 0, count: 0 };
  for (const subAgentProgress of Object.values(subAgentGenerationProgress)) {
    if (subAgentProgress.tokPerSec != null && subAgentProgress.tokPerSec > 0) {
      sum += subAgentProgress.tokPerSec;
      count++;
    }
  }
  return { sum, count };
}

/**
 * useTokenRate — live token throughput and elapsed-time computation
 * derived from a conversationStats object.
 *
 * Three data sources (in priority order):
 *
 *   1. **Sub-agent aggregation** (coordinator conversations): Sum of per-sub-agent
 *      `tokPerSec` values from `subAgentGenerationProgress`. These are
 *      computed by CoordinatorService's `buildProgress()` using accurate
 *      burst-scoped chunk counters. Plus the orchestrator's own rate if
 *      it's also generating.
 *
 *   2. **Backend-sourced** (`liveGenProgress`): tok/s from Prism's
 *      ConversationGenerationTracker. Used for solo agentic conversations without
 *      sub-agents (orchestrator-only), where the tracker has accurate data.
 *
 *   3. **Frontend chunk-counting** (fallback): For non-agentic
 *      conversations (regular conversations) that don't emit
 *      generation_progress events. Computes rates from SSE chunk
 *      inter-arrival timing.
 */
export default function useTokenRate(
  conversationStats: ExtendedConversationStats | null,
): TokenRateResult {
  // Stores current wall-clock and performance timestamps so render
  // stays pure (no Date.now() calls in the render body).
  const [nowMilliseconds, setNowMilliseconds] = useState(() => Date.now());
  const [perfNow, setPerfNow] = useState(() => performance.now());

  const isStreaming = !!conversationStats?.liveStreamingStartTime;
  const turnActive = !!conversationStats?.currentTurnStart;
  const needsTicker = turnActive || isStreaming;

  useEffect(() => {
    if (!needsTicker) return;
    // Immediate tick via microtask to avoid synchronous setState in effect body
    const immediate = setTimeout(() => {
      setNowMilliseconds(Date.now());
      setPerfNow(performance.now());
    }, 0);
    // 500ms interval for smoother tok/s updates during streaming
    const id = setInterval(() => {
      setNowMilliseconds(Date.now());
      setPerfNow(performance.now());
    }, 500);
    return () => {
      clearTimeout(immediate);
      clearInterval(id);
    };
  }, [needsTicker]);

  // -- Elapsed time ----------------------------------------------
  const completedTime = conversationStats?.completedElapsedTime || 0;
  const turnStartVal = conversationStats?.currentTurnStart
    ? typeof conversationStats.currentTurnStart === "number"
      ? conversationStats.currentTurnStart
      : new Date(conversationStats.currentTurnStart).getTime()
    : null;
  const liveExtra = turnStartVal
    ? Math.max(0, (nowMilliseconds - turnStartVal) / 1000)
    : 0;
  const totalElapsedTime = completedTime + liveExtra;

  // -- Live tok/s computation ------------------------------------
  let computedTokensPerSecond: number | null = null;
  let hasActiveSubAgents = false;

  // Priority 1: Sum per-sub-agent tok/s from subAgentGenerationProgress.
  // These come from CoordinatorService's buildProgress() which uses
  // burst-scoped chunk counters — accurate and independent per sub-agent.
  const { sum: subAgentSum, count: activeSubAgentCount } = sumSubAgentThroughput(
    conversationStats?.subAgentGenerationProgress ?? null,
  );

  if (activeSubAgentCount > 0) {
    hasActiveSubAgents = true;
    let totalRate = subAgentSum;

    // Add orchestrator's own rate if it's also generating
    // (the orchestrator streams chunks independently via its own SSE path)
    const coordActive =
      isStreaming &&
      conversationStats?.liveStreamingLastChunkTime &&
      perfNow - conversationStats.liveStreamingLastChunkTime < CHUNK_STALE_MS;
    if (coordActive) {
      const burstElapsed = (conversationStats.liveStreamingBurstElapsed || 0) / 1000;
      const burstTokens = conversationStats.liveStreamingBurstTokens || 0;
      if (burstElapsed > 0 && burstTokens > 0) {
        totalRate += burstTokens / burstElapsed;
      }
    }

    computedTokensPerSecond = totalRate;
  } else {
    // Priority 2: Backend-sourced generation_progress from
    // ConversationGenerationTracker (for solo orchestrator conversations).
    const genProgress = conversationStats?.liveGenProgress as GenProgress | null;
    const genProgressFresh =
      genProgress &&
      genProgress.timestamp &&
      perfNow - genProgress.timestamp < PROGRESS_STALE_MS;

    if (genProgressFresh && genProgress.tokPerSec != null) {
      computedTokensPerSecond = genProgress.tokPerSec;
      hasActiveSubAgents = (genProgress.activeRequests || 0) > 1;
    } else {
      // Priority 3: Frontend chunk-counting fallback for non-agentic
      // conversations (Direct Chat) that don't go through the agentic loop.
      const coordActive =
        isStreaming &&
        conversationStats?.liveStreamingLastChunkTime &&
        perfNow - conversationStats.liveStreamingLastChunkTime < CHUNK_STALE_MS;
      if (coordActive) {
        const burstElapsed =
          (conversationStats.liveStreamingBurstElapsed || 0) / 1000;
        const burstTokens = conversationStats.liveStreamingBurstTokens || 0;
        if (burstElapsed > 0 && burstTokens > 0) {
          computedTokensPerSecond = burstTokens / burstElapsed;
        }
      }
    }
  }

  // -- Last-value-hold reducer ------------------------------------
  const [tokensPerSecondState, dispatchTokensPerSecond] = useReducer(
    tokensPerSecondReducer,
    TOK_PER_SECOND_INITIAL,
  );
  const liveTokensPerSecond = tokensPerSecondState.current;

  // Dispatch every tick to keep the reducer in sync
  useMemo(() => {
    dispatchTokensPerSecond({ computed: computedTokensPerSecond, active: needsTicker });
  }, [computedTokensPerSecond, needsTicker]);

  return {
    nowMilliseconds,
    perfNow,
    isStreaming,
    needsTicker,
    turnActive,
    totalElapsedTime,
    liveTokensPerSecond,
    computedTokensPerSecond,
    hasActiveSubAgents,
  };
}
