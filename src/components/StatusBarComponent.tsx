"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./StatusBarComponent.module.css";

// -- Shared phase vocabulary ------------------------------------------
const PHASE_LABELS = {
  starting: "Starting...",
  loading: "Loading...",
  prefilling: "Prefilling...",
  generating: "Generating...",
  thinking: "Thinking...",
  executing: "Executing...",
  delegating: "Awaiting Sub-Agents...",
  awaiting: "Awaiting For User Input...",
};

const PHASE_ICONS = {
  starting: "⚡",
  loading: "📦",
  prefilling: "📥",
  generating: "✨",
  thinking: "🧠",
  executing: "🔧",
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
  prefilling: [
    "oklch(0.795 0.164 90)",    // yellow-500
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.783 0.178 71)",    // amber-400
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.795 0.164 90)",    // yellow-500
    "oklch(0.852 0.176 95)",    // yellow-400
    "oklch(0.783 0.178 71)",    // amber-400
  ],
  executing: [
    "oklch(0.705 0.191 41)",    // orange-500
    "oklch(0.783 0.178 71)",    // amber-400
    "oklch(0.646 0.222 22)",    // red-500
    "oklch(0.783 0.178 71)",    // amber-400
    "oklch(0.705 0.191 41)",    // orange-500
    "oklch(0.783 0.178 71)",    // amber-400
    "oklch(0.646 0.222 22)",    // red-500
  ],
};

// -- Asymptotic synthetic progress ------------------------------------
// Exponential approach curve: progress = 1 - e^(-t/τ)
// Fast initial growth that exponentially slows near 100%.
// Reaches ~63% at τ (15s), ~86% at 2τ (30s), ~95% at 3τ (45s).
const ASYMPTOTIC_TIME_CONSTANT_MS = 15_000;
const SYNTHETIC_TICK_MS = 150;
const MAX_SYNTHETIC_PROGRESS = 0.99;

/**
 * Unified animated status bar shared by the main orchestrator and sub-agents.
 *
 * Single progress bar that fills left-to-right using an asymptotic exponential
 * approach curve — fast at first, exponentially slower near 100%. When the
 * backend provides real progress values, those take precedence. Otherwise
 * a synthetic curve provides visual feedback.
 *
 * ### Orchestrator usage (ChatSessionComponent)
 * ```jsx
 * <StatusBarComponent
 *   active={isGenerating}
 *   phase={effectivePhase}
 *   label={statusText}
 *   progress={0.45}
 * />
 * ```
 *
 * ### Sub-agent usage (ToolResultRenderers → SpawnAgentRenderer)
 * ```jsx
 * <StatusBarComponent
 *   active={isToolActive || hasPhase}
 *   phase={phase}
 *   label={label}
 *   icon={icon}
 *   iteration={iteration}
 *   maxIterations={maxIterations}
 *   idleIcon={<Users size={10} />}
 *   idleLabel="3 tools used"
 * />
 * ```
 */
export type StatusBarPhase = "starting" | "loading" | "prefilling" | "generating" | "thinking" | "executing" | "delegating" | "awaiting";

interface StatusBarProps {
  active?: boolean;
  variant?: "orchestrator" | "subAgent";
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
  const isSubAgent = variant === "subAgent";
  const [syntheticProgress, setSyntheticProgress] = useState(0);
  const syntheticStartRef = useRef<number | null>(null);

  // Asymptotic synthetic progress: runs whenever active, producing a
  // monotonically increasing baseline via 1 - e^(-t/τ). Fast initial
  // movement that exponentially decelerates as it approaches 100%.
  useEffect(() => {
    if (!active) {
      setSyntheticProgress(0);
      syntheticStartRef.current = null;
      return;
    }

    if (!syntheticStartRef.current) {
      syntheticStartRef.current = performance.now();
    }

    const intervalId = setInterval(() => {
      const elapsed = performance.now() - (syntheticStartRef.current ?? 0);
      const progressValue = Math.min(
        MAX_SYNTHETIC_PROGRESS,
        1 - Math.exp(-elapsed / ASYMPTOTIC_TIME_CONSTANT_MS),
      );
      setSyntheticProgress(progressValue);
    }, SYNTHETIC_TICK_MS);

    return () => clearInterval(intervalId);
  }, [active]);

  // Unified progress: the greater of real backend progress and the
  // synthetic asymptotic floor. Ensures the bar never moves backward
  // across phase transitions.
  const realBackendProgress = progress != null && progress > 0 ? progress : 0;
  const effectiveProgress = active
    ? Math.max(syntheticProgress, realBackendProgress)
    : 0;
  const progressPercentage = Math.round(effectiveProgress * 100);

  // Strip trailing " 45%" / " done" from label since progress is shown separately
  const rawLabel =
    label || (PHASE_LABELS as Record<string, string>)[phase ?? ""] || "Starting...";
  const resolvedLabel = rawLabel
    .replace(/[\u2026.]+\s*\d+%$/, "\u2026")
    .replace(/[\u2026.]+\s*done$/i, "\u2026");
  const resolvedIcon =
    icon !== undefined
      ? icon
      : (PHASE_ICONS as Record<string, string>)[phase ?? ""] || null;

  const isAwaitingPhase = phase === "awaiting";
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

  return (
    <div
      className={`status-bar-component ${styles['status-bar']}${isSubAgent ? ` ${styles['status-bar-sub-agent']}` : ""}${active ? ` ${styles['status-bar-active']}` : ""}${isAwaitingPhase ? ` ${styles['status-bar-awaiting']}` : ""}${isDelegatingPhase ? ` ${styles['status-bar-delegating']}` : ""}`}
      style={gradientCustomProperties}
    >
      {/* Unified asymptotic progress fill — single bar, left to right */}
      <div
        className={styles['status-bar-fill']}
        style={{ transform: `scaleX(${effectiveProgress})` }}
      />
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
              <span className={styles['status-bar-progress']}>
                {progressPercentage}%
              </span>
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
