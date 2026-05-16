import { useReducer, useMemo } from "react";

/**
 * TTFT reducer — running-average pattern for Time-To-First-Token.
 *
 * Each agentic loop iteration and each worker emits a `generation_started`
 * event with a server-computed TTFT sample. This reducer tracks the number
 * of samples seen so far and computes a running average. When a new sample
 * arrives (samples.length > prev.seenCount), it folds the new value in.
 * When the turn ends (active=false), it resets.
 *
 * For the client-side fallback (LM Studio native path), it live-counts
 * during the "processing" phase and latches on phase transition.
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function ttftReducer(prev: any, { phase: any, startTime: any, perfNow: any, active: any, samples: any }) {
  // Turn ended → clear
  // @ts-ignore
  if (!active) {
    if (prev.value === null && !prev.live && prev.seenCount === 0) return prev;
    return { value: null, live: false, prevPhase: null, seenCount: 0 };
  }

  // New server-computed TTFT sample(s) arrived — fold into running average
  // @ts-ignore
  // @ts-ignore
  if (samples && samples.length > prev.seenCount) {
    // @ts-ignore
    const newSamples = samples.slice(prev.seenCount);
    // Compute new running average incorporating all new samples
    const prevTotal = (prev.value || 0) * prev.seenCount;
    const newTotal = newSamples.reduce((a: any, b: any) => a + b, 0);
    // @ts-ignore
    const avg = (prevTotal + newTotal) / samples.length;
    // @ts-ignore
    // @ts-ignore
    return { value: avg, live: false, prevPhase: phase, seenCount: samples.length };
  }

  // Active processing → live counting (client-side fallback for LM Studio native)
  // @ts-ignore
  // @ts-ignore
  if (phase === "processing" && startTime) {
    return {
      // @ts-ignore
      // @ts-ignore
      value: (perfNow - startTime) / 1000,
      live: true,
      prevPhase: "processing",
      seenCount: prev.seenCount,
    };
  }

  // Phase just transitioned away from processing → latch final value
  // @ts-ignore
  if (prev.prevPhase === "processing" && phase !== "processing" && prev.live) {
    return {
      value: prev.value,
      live: false,
      // @ts-ignore
      prevPhase: phase,
      seenCount: prev.seenCount,
    };
  }

  // Still latched mid-turn — preserve
  if (prev.value !== null && !prev.live) {
    // @ts-ignore
    // @ts-ignore
    if (prev.prevPhase !== phase) return { ...prev, prevPhase: phase };
    return prev;
  }

  // No data yet
  // @ts-ignore
  if (prev.prevPhase !== phase) {
    // @ts-ignore
    return { ...prev, prevPhase: phase };
  }
  return prev;
}

const TTFT_INITIAL = { value: null, live: false, prevPhase: null, seenCount: 0 };

/**
 * useTtft — Time To First Token tracking with burst averaging.
 *
 * Accumulates TTFT samples from:
 * - Coordinator per-iteration `generation_started` events
 * - Worker `generation_started` events (forwarded via worker_status)
 *
 * Displays a running average across all samples, same pattern as tok/s
 * burst averaging. Falls back to client-side phase tracking for LM Studio
 * native path which provides real processing progress events.
 *
 * After the turn completes, the consumer falls back to the static
 * `avgTimeToGeneration` from backend session stats.
 *
 * @param {object|null} sessionStats — the sessionStats prop
 * @param {number} perfNow — current performance.now() snapshot (from useTokenRate ticker)
 * @param {boolean} needsTicker — whether a turn is active (from useTokenRate)
 * @returns {{ liveTtft: number|null, isLiveTtft: boolean }}
 */
export default function useTtft(sessionStats: any, perfNow: any, needsTicker: any) {
  const phase = sessionStats?.liveProcessingPhase || null;
  const startTime = sessionStats?.liveProcessingStartTime || null;
  const samples = sessionStats?.liveTtftSamples || null;

  const [state, dispatch] = useReducer(ttftReducer, TTFT_INITIAL);

  // Dispatch on every tick to keep in sync (same pattern as tok/s reducer)
  useMemo<any>(() => {
    dispatch({ phase, startTime, perfNow, active: needsTicker, samples });
  }, [phase, startTime, perfNow, needsTicker, samples]);

  return {
    liveTtft: state.value,
    isLiveTtft: state.live,
  };
}
