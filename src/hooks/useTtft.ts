import { useReducer, useMemo } from "react";
import type { ConversationTokenStats } from "../utils/utilities";

// --- Types --------------------------------------------------

interface TimeToFirstTokenState {
  value: number | null;
  live: boolean;
  previousPhase: string | null;
  seenCount: number;
}

interface TimeToFirstTokenAction {
  phase: string | null;
  startTime: number | null;
  perfNow: number;
  active: boolean;
  samples: number[] | null;
}

/**
 * TTFT reducer — running-average pattern for Time-To-First-Token.
 *
 * Each agentic loop iteration and each sub-agent emits a `generation_started`
 * event with a server-computed TTFT sample. This reducer tracks the number
 * of samples seen so far and computes a running average. When a new sample
 * arrives (samples.length > prev.seenCount), it folds the new value in.
 * When the turn ends (active=false), it resets.
 *
 * For the client-side fallback (LM Studio native path), it live-counts
 * during the "prefilling" phase and latches on phase transition.
 */
function timeToFirstTokenReducer(
  previousState: TimeToFirstTokenState,
  { phase, startTime, perfNow, active, samples }: TimeToFirstTokenAction,
): TimeToFirstTokenState {
  // Turn ended → clear
  if (!active) {
    if (previousState.value === null && !previousState.live && previousState.seenCount === 0) return previousState;
    return { value: null, live: false, previousPhase: null, seenCount: 0 };
  }

  // New server-computed TTFT sample(s) arrived — fold into running average
  if (samples && samples.length > previousState.seenCount) {
    const newSamples = samples.slice(previousState.seenCount);
    // Compute new running average incorporating all new samples
    const previousTotal = (previousState.value || 0) * previousState.seenCount;
    const newTotal = newSamples.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    const average = (previousTotal + newTotal) / samples.length;
    return {
      value: average,
      live: false,
      previousPhase: phase,
      seenCount: samples.length,
    };
  }

  // Active prefilling → live counting (client-side fallback for LM Studio native)
  if (phase === "prefilling" && startTime) {
    return {
      value: (perfNow - startTime) / 1000,
      live: true,
      previousPhase: "prefilling",
      seenCount: previousState.seenCount,
    };
  }

  // Phase just transitioned away from prefilling → latch final value
  if (previousState.previousPhase === "prefilling" && phase !== "prefilling" && previousState.live) {
    return {
      value: previousState.value,
      live: false,
      previousPhase: phase,
      seenCount: previousState.seenCount,
    };
  }

  // Still latched mid-turn — preserve
  if (previousState.value !== null && !previousState.live) {
    if (previousState.previousPhase !== phase) return { ...previousState, previousPhase: phase };
    return previousState;
  }

  // No data yet
  if (previousState.previousPhase !== phase) {
    return { ...previousState, previousPhase: phase };
  }
  return previousState;
}

const TIME_TO_FIRST_TOKEN_INITIAL: TimeToFirstTokenState = {
  value: null,
  live: false,
  previousPhase: null,
  seenCount: 0,
};

/**
 * useTtft — Time To First Token tracking with burst averaging.
 *
 * Accumulates TTFT samples from:
 * - Coordinator per-iteration `generation_started` events
 * - Sub-agent `generation_started` events (forwarded via sub_agent_status)
 *
 * Displays a running average across all samples, same pattern as tok/s
 * burst averaging. Falls back to client-side phase tracking for LM Studio
 * native path which provides real processing progress events.
 *
 * After the turn completes, the consumer falls back to the static
 * `avgTimeToGeneration` from backend conversation stats.
 */
export default function useTimeToFirstToken(
  conversationStats: Partial<ConversationTokenStats> | null,
  perfNow: number,
  needsTicker: boolean,
): { liveTimeToFirstToken: number | null; isLiveTimeToFirstToken: boolean } {
  const phase = conversationStats?.liveProcessingPhase || null;
  const startTime = conversationStats?.liveProcessingStartTime || null;
  const samples = conversationStats?.liveTtftSamples || null;

  const [state, dispatch] = useReducer(timeToFirstTokenReducer, TIME_TO_FIRST_TOKEN_INITIAL);

  // Dispatch on every tick to keep in sync (same pattern as tok/s reducer)
  useMemo(() => {
    dispatch({ phase, startTime, perfNow, active: needsTicker, samples });
  }, [phase, startTime, perfNow, needsTicker, samples]);

  return {
    liveTimeToFirstToken: state.value,
    isLiveTimeToFirstToken: state.live,
  };
}
