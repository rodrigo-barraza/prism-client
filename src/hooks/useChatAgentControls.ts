"use client";

/**
 * The agent chat's run controls (Settings → Strategy): Plan Mode, the tool
 * iteration caps and the sub-agent recursion depth. The caps and the depth
 * persist in localStorage; a loaded conversation restores its own depth.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_RECURSIVE_SPAWNING_DEPTH,
  LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS,
  LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH,
  LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS,
  MAX_TOOL_ITERATIONS,
} from "../constants";

const ITERATION_STEPS = [10, 25, 50, 100, Infinity];
const RECURSION_DEPTH_STEPS = [0, 1, 2, 3, 5, 10];

/** The step after `value` in `steps`, wrapping around. */
function nextStep(steps: readonly number[], value: number): number {
  return steps[(steps.indexOf(value) + 1) % steps.length];
}

/** A depth a conversation may carry in its persisted settings. */
export function isRestorableRecursionDepth(depth: unknown): depth is number {
  return typeof depth === "number" && [0, 1, 2, 3].includes(depth);
}

export default function useChatAgentControls() {
  const [planFirst, setPlanFirst] = useState(false);
  const [maxIterations, setMaxIterations] = useState(MAX_TOOL_ITERATIONS);
  const [maxSubAgentIterations, setMaxSubAgentIterations] = useState(MAX_TOOL_ITERATIONS);
  const [maxRecursionDepth, setMaxRecursionDepth] = useState(DEFAULT_RECURSIVE_SPAWNING_DEPTH);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const parseStored = (key: string) => {
      const stored = localStorage.getItem(key);
      if (stored === "Infinity") return Infinity;
      const parsed = Number(stored);
      return [10, 25, 50, 100].includes(parsed) ? parsed : null;
    };
    const iterations = parseStored(LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (iterations != null) setMaxIterations(iterations);
    const subAgentIterations = parseStored(LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS);
    if (subAgentIterations != null) setMaxSubAgentIterations(subAgentIterations);
    const storedRecursionDepth = localStorage.getItem(LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH);
    if (storedRecursionDepth != null) {
      const parsedDepth = Number(storedRecursionDepth);
      if ([0, 1, 2, 3].includes(parsedDepth)) setMaxRecursionDepth(parsedDepth);
    }
  }, []);

  const togglePlanFirst = useCallback(() => setPlanFirst((value) => !value), []);

  const cycleMaxIterations = useCallback(() => {
    const next = nextStep(ITERATION_STEPS, maxIterations);
    setMaxIterations(next);
    localStorage.setItem(LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS, String(next));
  }, [maxIterations]);

  const cycleMaxSubAgentIterations = useCallback(() => {
    const next = nextStep(ITERATION_STEPS, maxSubAgentIterations);
    setMaxSubAgentIterations(next);
    localStorage.setItem(LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS, String(next));
  }, [maxSubAgentIterations]);

  const cycleMaxRecursionDepth = useCallback(() => {
    const next = nextStep(RECURSION_DEPTH_STEPS, maxRecursionDepth);
    setMaxRecursionDepth(next);
    localStorage.setItem(LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH, String(next));
  }, [maxRecursionDepth]);

  return {
    planFirst,
    togglePlanFirst,
    maxIterations,
    cycleMaxIterations,
    maxSubAgentIterations,
    cycleMaxSubAgentIterations,
    maxRecursionDepth,
    setMaxRecursionDepth,
    cycleMaxRecursionDepth,
  };
}

export type ChatAgentControls = ReturnType<typeof useChatAgentControls>;
