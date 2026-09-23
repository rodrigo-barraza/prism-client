"use client";

/**
 * The pixelation veil over the transcript while a conversation loads: "out"
 * pixelates it away when the switch starts, "in" reveals the new one once
 * its data arrived. The "out" duration adapts to how long loads have been
 * taking (an EMA kept in localStorage); the reveal is a fixed second.
 */

import { useCallback, useMemo, useState } from "react";

export const PIXEL_IN_DURATION = 1000;
const PIXEL_DEFAULT_OUT = 3000;
const PIXEL_LS_KEY = "pixel-transition:load-ema";

export type PixelTransitionPhase = "out" | "in" | null;

export default function usePixelTransition() {
  const [phase, setPhase] = useState<PixelTransitionPhase>(null);

  const outDuration = useMemo(() => {
    if (typeof window === "undefined") return PIXEL_DEFAULT_OUT;
    const stored = localStorage.getItem(PIXEL_LS_KEY);
    return stored
      ? Math.round(Math.max(800, Math.min(Number(stored), 8000)))
      : PIXEL_DEFAULT_OUT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]); // intentional: re-read localStorage when a new transition starts

  /** Record a completed conversation load and update the EMA in localStorage. */
  const recordLoadTime = useCallback((elapsed: number) => {
    const stored = localStorage.getItem(PIXEL_LS_KEY);
    const alpha = 0.3; // EMA smoothing — higher = more reactive to recent loads
    const previousLoadDuration = stored ? Number(stored) : PIXEL_DEFAULT_OUT;
    const next = alpha * elapsed + (1 - alpha) * previousLoadDuration;
    localStorage.setItem(PIXEL_LS_KEY, String(Math.round(next)));
  }, []);

  return {
    phase,
    setPhase,
    duration: phase === "in" ? PIXEL_IN_DURATION : outDuration,
    recordLoadTime,
  };
}

export type PixelTransition = ReturnType<typeof usePixelTransition>;
