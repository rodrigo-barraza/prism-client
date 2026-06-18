"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "./StatusBarComponent.module.css";

// -- Shared phase vocabulary ------------------------------------------
const PHASE_LABELS = {
  starting: "Starting...",
  loading: "Loading...",
  processing: "Processing...",
  generating: "Generating...",
  thinking: "Thinking...",
  delegating: "Awaiting Workers...",
  awaiting: "Awaiting For User Input...",
};

const PHASE_ICONS = {
  starting: "⚡",
  loading: "📦",
  processing: "🛠️",
  generating: "✨",
  thinking: "🧠",
  delegating: "👥",
  awaiting: "⏸️",
};

// -- Per-phase gradient stops (oklch) ---------------------------------
// Each phase defines 7 gradient stops that produce a smooth, flowing
// color shimmer via CSS translate animation. Phases without an entry
// use the neutral default stops from the stylesheet.
const PHASE_GRADIENT_STOPS: Record<string, string[]> = {
  generating: [
    "oklch(0.588 0.158 262)",   // blue-500
    "oklch(0.546 0.198 275)",   // indigo-500
    "oklch(0.541 0.214 292)",   // violet-500
    "oklch(0.553 0.223 303)",   // purple-500
    "oklch(0.714 0.168 300)",   // purple-400
    "oklch(0.541 0.214 292)",   // violet-500
    "oklch(0.546 0.198 275)",   // indigo-500
  ],
  thinking: [
    "oklch(0.723 0.191 145)",   // green-500
    "oklch(0.793 0.172 153)",   // green-400
    "oklch(0.841 0.202 117)",   // lime-400
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.795 0.164 90)",    // yellow-500
    "oklch(0.841 0.202 117)",   // lime-400
    "oklch(0.793 0.172 153)",   // green-400
  ],
  delegating: [
    "oklch(0.588 0.158 262)",   // blue-500
    "oklch(0.681 0.126 254)",   // blue-400
    "oklch(0.790 0.090 252)",   // blue-300
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.795 0.164 90)",    // yellow-500
    "oklch(0.790 0.090 252)",   // blue-300
    "oklch(0.681 0.126 254)",   // blue-400
  ],
  loading: [
    "oklch(0.546 0.198 275)",   // indigo-500
    "oklch(0.588 0.158 262)",   // blue-500
    "oklch(0.681 0.126 254)",   // blue-400
    "oklch(0.588 0.158 262)",   // blue-500
    "oklch(0.546 0.198 275)",   // indigo-500
    "oklch(0.588 0.158 262)",   // blue-500
    "oklch(0.681 0.126 254)",   // blue-400
  ],
  processing: [
    "oklch(0.795 0.164 90)",    // yellow-500
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.783 0.178 71)",    // amber-400
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.795 0.164 90)",    // yellow-500
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.783 0.178 71)",    // amber-400
  ],
};

// -- Synthetic asymptotic progress ------------------------------------
// When the backend doesn't emit real progress events (e.g. OpenAI-compat
// path used by agentic mode), we generate a client-side asymptotic curve
// that approaches 95% over ~20s. This gives the user visual feedback
// that something is happening during prompt prefill.
const SYNTHETIC_EXPECTED_MS = 20_000;
const SYNTHETIC_TICK_MS = 200;

// -- Exponential decay bar --------------------------------------------
// The gradient bar decays from 100% → 0% on each phase change using an
// exponential curve: progress = e^(-k * t). The half-life controls how
// fast the initial drop is; the tail becomes asymptotically slow.
const DECAY_HALF_LIFE_MS = 3_000;
const DECAY_RATE = Math.LN2 / DECAY_HALF_LIFE_MS;

/**
 * Unified animated status bar shared by the main orchestrator and worker agents.
 *
 * ### Orchestrator usage (ChatSessionComponent)
 * ```jsx
 * <StatusBarComponent
 *   active={isGenerating}
 *   phase={effectivePhase}    // "starting" | "loading" | "processing" | "generating" | "thinking"
 *   label={statusText}        // optional override — falls back to PHASE_LABELS[phase]
 *   progress={0.45}           // optional 0-1 progress (LM Studio prompt processing / model loading)
 * />
 * ```
 *
 * ### Worker usage (ToolResultRenderers → SpawnAgentRenderer)
 * ```jsx
 * <StatusBarComponent
 *   active={isToolActive || hasPhase}
 *   phase={phase}
 *   label={label}
 *   icon={icon}               // override emoji icon or pass null for default phase icon
 *   iteration={iteration}
 *   maxIterations={maxIterations}
 *   idleIcon={<Users size={10} />}
 *   idleLabel="3 tools used"
 * />
 * ```
 */
export type StatusBarPhase = "starting" | "loading" | "processing" | "generating" | "thinking" | "delegating" | "awaiting";

interface StatusBarProps {
  active?: boolean;
  variant?: "orchestrator" | "worker";
  phase?: StatusBarPhase;
  label?: string;
  icon?: React.ReactNode;
  progress?: number | null;
  tokPerSec?: number | null;
  iteration?: number;
  maxIterations?: number;
  idleIcon?: React.ReactNode;
  idleLabel?: string;
}

export default function StatusBarComponent({
  active = false,
  variant = "orchestrator",
  phase,
  label,
  icon,
  progress,
  tokPerSec,
  iteration,
  maxIterations,
  idleIcon,
  idleLabel,
}: StatusBarProps) {
  const isWorker = variant === "worker";
  const [syntheticProgress, setSyntheticProgress] = useState(0);
  const syntheticStartRef = useRef<number | null>(null);

  // -- Exponential decay bar state ------------------------------------
  const decayBarRef = useRef<HTMLDivElement | null>(null);
  const previousPhaseRef = useRef<string | null | undefined>(null);
  const decayStartRef = useRef<number | null>(null);
  const decayAnimationFrameRef = useRef<number | null>(null);

  const runDecayLoop = useCallback(() => {
    const startTimestamp = decayStartRef.current;
    const barElement = decayBarRef.current;
    if (startTimestamp === null || !barElement) return;

    const elapsed = performance.now() - startTimestamp;
    const decayValue = Math.exp(-DECAY_RATE * elapsed);

    barElement.style.transform = `scaleX(${decayValue})`;

    if (decayValue > 0.001) {
      decayAnimationFrameRef.current = requestAnimationFrame(runDecayLoop);
    } else {
      barElement.style.transform = "scaleX(0)";
    }
  }, []);

  // Reset decay on phase change
  useEffect(() => {
    if (!active) {
      // Inactive: cancel animation, reset
      if (decayAnimationFrameRef.current !== null) {
        cancelAnimationFrame(decayAnimationFrameRef.current);
        decayAnimationFrameRef.current = null;
      }
      decayStartRef.current = null;
      previousPhaseRef.current = null;
      if (decayBarRef.current) {
        decayBarRef.current.style.transform = "scaleX(0)";
      }
      return;
    }

    if (phase !== previousPhaseRef.current) {
      previousPhaseRef.current = phase;

      // Cancel any running decay
      if (decayAnimationFrameRef.current !== null) {
        cancelAnimationFrame(decayAnimationFrameRef.current);
      }

      // Reset to full and start new decay
      decayStartRef.current = performance.now();
      if (decayBarRef.current) {
        decayBarRef.current.style.transform = "scaleX(1)";
      }
      decayAnimationFrameRef.current = requestAnimationFrame(runDecayLoop);
    }

    return () => {
      if (decayAnimationFrameRef.current !== null) {
        cancelAnimationFrame(decayAnimationFrameRef.current);
        decayAnimationFrameRef.current = null;
      }
    };
  }, [active, phase, runDecayLoop]);

  const isProgressPhase = phase === "processing" || phase === "loading";
  const backendStuck = isProgressPhase && progress != null && progress === 0;

  useEffect(() => {
    if (!active || !backendStuck) {
      setSyntheticProgress(0);
      syntheticStartRef.current = null;
      return;
    }

    // Start synthetic timer
    if (!syntheticStartRef.current) {
      syntheticStartRef.current = performance.now();
    }

    const id = setInterval(() => {
      const elapsed = performance.now() - (syntheticStartRef.current ?? 0);
      // Asymptotic: approaches 0.95 over SYNTHETIC_EXPECTED_MS
      const percentage = Math.min(
        0.95,
        elapsed / (elapsed + SYNTHETIC_EXPECTED_MS),
      );
      setSyntheticProgress(percentage);
    }, SYNTHETIC_TICK_MS);

    return () => clearInterval(id);
  }, [active, backendStuck]);

  // Use real backend progress when available, synthetic when stuck at 0
  const effectiveProgress =
    isProgressPhase && progress != null
      ? progress > 0
        ? progress
        : syntheticProgress
      : null;

  // Strip trailing " 45%" / " done" from label when structured progress is shown via chip
  const rawLabel =
    label || (PHASE_LABELS as Record<string, string>)[phase ?? ""] || "Starting...";
  const hasEffectiveProgress =
    effectiveProgress != null && effectiveProgress >= 0;
  const resolvedLabel = hasEffectiveProgress
    ? rawLabel
        .replace(/[\u2026.]+\s*\d+%$/, "\u2026")
        .replace(/[\u2026.]+\s*done$/i, "\u2026")
    : rawLabel;
  const resolvedIcon =
    icon !== undefined
      ? icon
      : (PHASE_ICONS as Record<string, string>)[phase ?? ""] || null;

  // Awaiting phase: greyscale + frozen (no animation)
  const isAwaitingPhase = phase === "awaiting";
  // Delegating phase: orchestrator waiting on workers — animated color but subdued glow
  const isDelegatingPhase = phase === "delegating";

  // Resolve per-phase gradient CSS custom properties
  const gradientStops = phase ? PHASE_GRADIENT_STOPS[phase] : undefined;
  const gradientCustomProperties: React.CSSProperties | undefined = gradientStops
    ? {
        "--gradient-stop-1": gradientStops[0],
        "--gradient-stop-2": gradientStops[1],
        "--gradient-stop-3": gradientStops[2],
        "--gradient-stop-4": gradientStops[3],
        "--gradient-stop-5": gradientStops[4],
        "--gradient-stop-6": gradientStops[5],
        "--gradient-stop-7": gradientStops[6],
      } as React.CSSProperties
    : undefined;

  // Progress percentage
  const progressPercentage = hasEffectiveProgress
    ? Math.round(effectiveProgress * 100)
    : null;

  return (
    <div
      className={`status-bar-component ${styles['status-bar']}${isWorker ? ` ${styles['status-bar-worker']}` : ""}${active ? ` ${styles['status-bar-active']}` : ""}${isAwaitingPhase ? ` ${styles['status-bar-awaiting']}` : ""}${isDelegatingPhase ? ` ${styles['status-bar-delegating']}` : ""}`}
      style={gradientCustomProperties}
    >
      {/* Exponential decay gradient bar — resets to 100% on each phase change */}
      <div
        ref={decayBarRef}
        className={styles['status-bar-decay-fill']}
        style={{ transform: active ? undefined : "scaleX(0)" }}
      />
      {/* Progress fill bar — slides right as prompt processing advances */}
      {active && hasEffectiveProgress && (
        <div
          className={styles['status-bar-progress-fill']}
          style={{ width: `${progressPercentage}%` }}
        />
      )}
      <div
        className={`${styles['status-bar-overlay']}${phase ? ` ${styles[`phase-is-${phase}-state`] || ""}` : ""}`}
      >
        {active ? (
          <>
            {resolvedIcon && (
              <span className={styles['status-bar-emoji']}>{resolvedIcon}</span>
            )}
            <span className={styles['status-bar-message']}>
              {resolvedLabel}
              {hasEffectiveProgress && (
                <span className={styles['status-bar-progress']}>
                  {progressPercentage}%
                </span>
              )}
              {tokPerSec != null && tokPerSec > 0 && (
                <span className={styles['status-bar-speed']}>
                  ⚡ {tokPerSec.toFixed(1)} tok/s
                </span>
              )}
              {(iteration ?? 0) > 0 && (
                <span className={styles['status-bar-iter']}>
                  Iteration {iteration}
                  {maxIterations ? `/${maxIterations}` : ""}
                </span>
              )}
            </span>
            {!isAwaitingPhase && !isDelegatingPhase && (
              <span className={styles['status-bar-pulse']} />
            )}
          </>
        ) : (
          <>
            {idleIcon && (
              <span className={styles['status-bar-icon']}>{idleIcon}</span>
            )}
            {idleLabel && (
              <span className={styles['status-bar-message']}>
                {idleLabel}
                {(iteration ?? 0) > 0 && (
                  <span className={styles['status-bar-iter']}>
                    Iteration {iteration}
                    {maxIterations ? `/${maxIterations}` : ""}
                  </span>
                )}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Re-export phase maps for consumers that need custom logic
export { PHASE_LABELS, PHASE_ICONS };
