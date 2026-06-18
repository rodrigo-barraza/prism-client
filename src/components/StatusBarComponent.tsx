"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./StatusBarComponent.module.css";

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

const PHASE_GRADIENT_STOPS: Record<string, string[]> = {
  generating: [
    "oklch(0.588 0.158 262)",
    "oklch(0.546 0.198 275)",
    "oklch(0.541 0.214 292)",
    "oklch(0.553 0.223 303)",
    "oklch(0.714 0.168 300)",
    "oklch(0.541 0.214 292)",
    "oklch(0.546 0.198 275)",
  ],
  thinking: [
    "oklch(0.723 0.191 145)",
    "oklch(0.793 0.172 153)",
    "oklch(0.841 0.202 117)",
    "oklch(0.852 0.176 95)",
    "oklch(0.795 0.164 90)",
    "oklch(0.841 0.202 117)",
    "oklch(0.793 0.172 153)",
  ],
  delegating: [
    "oklch(0.588 0.158 262)",
    "oklch(0.681 0.126 254)",
    "oklch(0.790 0.090 252)",
    "oklch(0.852 0.176 95)",
    "oklch(0.795 0.164 90)",
    "oklch(0.790 0.090 252)",
    "oklch(0.681 0.126 254)",
  ],
  loading: [
    "oklch(0.546 0.198 275)",
    "oklch(0.588 0.158 262)",
    "oklch(0.681 0.126 254)",
    "oklch(0.588 0.158 262)",
    "oklch(0.546 0.198 275)",
    "oklch(0.588 0.158 262)",
    "oklch(0.681 0.126 254)",
  ],
  prefilling: [
    "oklch(0.795 0.164 90)",
    "oklch(0.852 0.176 95)",
    "oklch(0.783 0.178 71)",
    "oklch(0.852 0.176 95)",
    "oklch(0.795 0.164 90)",
    "oklch(0.852 0.176 95)",
    "oklch(0.783 0.178 71)",
  ],
  executing: [
    "oklch(0.705 0.191 41)",
    "oklch(0.783 0.178 71)",
    "oklch(0.646 0.222 22)",
    "oklch(0.783 0.178 71)",
    "oklch(0.705 0.191 41)",
    "oklch(0.783 0.178 71)",
    "oklch(0.646 0.222 22)",
  ],
};

// Asymptotic curve: progress = 1 - e^(-t/τ)
// ~63% at 15s, ~86% at 30s, ~95% at 45s
const ASYMPTOTIC_TIME_CONSTANT_MS = 15_000;
const SYNTHETIC_TICK_MS = 150;
const MAX_SYNTHETIC = 0.99;

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

  // The one number that matters: 0 → 99, left to right.
  const [displayPercentage, setDisplayPercentage] = useState(0);
  const syntheticStartRef = useRef<number | null>(null);
  const highWaterMarkRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setDisplayPercentage(0);
      syntheticStartRef.current = null;
      highWaterMarkRef.current = 0;
      return;
    }

    if (!syntheticStartRef.current) {
      syntheticStartRef.current = performance.now();
    }

    const intervalId = setInterval(() => {
      const elapsed = performance.now() - (syntheticStartRef.current ?? 0);

      // Synthetic asymptotic: fast at first, exponentially slower
      const synthetic = Math.min(
        MAX_SYNTHETIC,
        1 - Math.exp(-elapsed / ASYMPTOTIC_TIME_CONSTANT_MS),
      );

      // Real backend progress if available
      const real = progress != null && progress > 0 ? progress : 0;

      // Take the highest of synthetic, real, and previous peak
      const candidate = Math.max(synthetic, real, highWaterMarkRef.current);
      highWaterMarkRef.current = candidate;

      setDisplayPercentage(Math.round(candidate * 100));
    }, SYNTHETIC_TICK_MS);

    return () => clearInterval(intervalId);
  }, [active, progress]);

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
      <div
        className={styles['status-bar-fill']}
        style={{ width: `${displayPercentage}%` }}
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
                {displayPercentage}%
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

export { PHASE_LABELS, PHASE_ICONS };
