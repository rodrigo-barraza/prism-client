"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "./StatusBarComponent.module.css";
import { PHASE_TOKENS } from "../utils/statusBarPhaseTokens";
import type { StatusBarPhase } from "../utils/statusBarPhaseTokens";

// Asymptotic curve: progress = 1 - e^(-t/τ)
// ~63% at 15s, ~86% at 30s, ~95% at 45s
const ASYMPTOTIC_TIME_CONSTANT_MS = 15_000;
const SYNTHETIC_TICK_MS = 150;
const MAX_SYNTHETIC = 0.99;
const PHASE_COMPLETION_FLASH_DURATION_MS = 280;

/* Module-level progress registry: each sub-agent StatusBarComponent writes its
   computed displayPercentage here (keyed by conversationId via `registryKey`).
   The sidebar HistoryItemComponent reads from this same Map so both views share
   a single source of truth — no independent asymptotic timers. */
export const subAgentProgressRegistry = new Map<string, number>();

interface StatusBarProps {
  active?: boolean;
  variant?: "orchestrator" | "subAgent";
  phase?: StatusBarPhase;
  label?: string;
  icon?: React.ReactNode;
  progress?: number | null;
  tokensPerSecond?: number | null;
  iteration?: number;
  maxIterations?: number;
  idleIcon?: React.ReactNode;
  idleLabel?: string;
  /** Unique key to write displayPercentage to the shared registry.
   *  Typically the sub-agent's conversationId. */
  registryKey?: string;
  /** Optional time offset (ms) to backdate the asymptotic timer start.
   *  Used when recovering a conversation that's been generating for
   *  some time, so the progress bar resumes at the correct position
   *  instead of restarting from 0%. */
  initialElapsedMilliseconds?: number | null;
}

export default function StatusBarComponent({
  active = false,
  variant = "orchestrator",
  phase,
  label,
  icon,
  progress,
  tokensPerSecond,
  iteration,
  maxIterations,
  idleIcon,
  idleLabel,
  registryKey,
  initialElapsedMilliseconds,
}: StatusBarProps) {
  const isSubAgent = variant === "subAgent";

  const [displayPercentage, setDisplayPercentage] = useState(0);
  const [isCompletingPhase, setIsCompletingPhase] = useState(false);
  const syntheticStartRef = useRef<number | null>(null);
  const highWaterMarkRef = useRef(0);
  const previousPhaseRef = useRef<StatusBarPhase | undefined>(undefined);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      clearCompletionTimer();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setDisplayPercentage(0);
      setIsCompletingPhase(false);
      syntheticStartRef.current = null;
      highWaterMarkRef.current = 0;
      previousPhaseRef.current = undefined;
      return;
    }

    if (phase !== previousPhaseRef.current) {
      const hadPreviousPhase = previousPhaseRef.current !== undefined;
      previousPhaseRef.current = phase;

      if (hadPreviousPhase) {
        // Flash to 100% to signify the previous phase completed
        clearCompletionTimer();
        setIsCompletingPhase(true);
        setDisplayPercentage(100);

        completionTimerRef.current = setTimeout(() => {
          setIsCompletingPhase(false);
          syntheticStartRef.current = performance.now();
          highWaterMarkRef.current = 0;
          setDisplayPercentage(0);
          completionTimerRef.current = null;
        }, PHASE_COMPLETION_FLASH_DURATION_MS);
        return;
      }

      // Backdate the start time by the initial elapsed offset so the
      // asymptotic curve picks up where the generation actually is,
      // rather than restarting from 0%.
      const elapsedOffset =
        initialElapsedMilliseconds && initialElapsedMilliseconds > 0
          ? initialElapsedMilliseconds
          : 0;
      syntheticStartRef.current = performance.now() - elapsedOffset;
      highWaterMarkRef.current = 0;
      setDisplayPercentage(0);
    }

    if (isCompletingPhase) return;

    const intervalId = setInterval(() => {
      const elapsed = performance.now() - (syntheticStartRef.current ?? performance.now());

      const synthetic = Math.min(
        MAX_SYNTHETIC,
        1 - Math.exp(-elapsed / ASYMPTOTIC_TIME_CONSTANT_MS),
      );

      const real = progress != null && progress > 0 ? progress : 0;

      const candidate = Math.max(synthetic, real, highWaterMarkRef.current);
      highWaterMarkRef.current = candidate;

      setDisplayPercentage(Math.round(candidate * 100));
    }, SYNTHETIC_TICK_MS);

    return () => clearInterval(intervalId);
  }, [active, progress, phase, isCompletingPhase, clearCompletionTimer]);

  useEffect(() => {
    return () => clearCompletionTimer();
  }, [clearCompletionTimer]);

  /* Publish the live progress percentage to :root so that the sidebar
     HistoryItemComponent inline-progress-bar reads the exact same value
     rather than computing its own independent asymptotic curve. */
  useEffect(() => {
    if (active && variant === "orchestrator") {
      document.documentElement.style.setProperty(
        "--live-status-bar-progress",
        `${displayPercentage}%`,
      );
    } else if (variant === "orchestrator") {
      document.documentElement.style.removeProperty("--live-status-bar-progress");
    }
  }, [active, displayPercentage, variant]);

  /* Publish to the module-level progress registry so the sidebar
     HistoryItemComponent can mirror this exact progress value. */
  useEffect(() => {
    if (registryKey) {
      if (active) {
        subAgentProgressRegistry.set(registryKey, displayPercentage);
      } else {
        subAgentProgressRegistry.delete(registryKey);
      }
    }
    return () => {
      if (registryKey) {
        subAgentProgressRegistry.delete(registryKey);
      }
    };
  }, [registryKey, active, displayPercentage]);

  const phaseTokens = phase ? PHASE_TOKENS[phase] : undefined;

  const rawLabel = label || phaseTokens?.label || "Starting...";
  const resolvedLabel = rawLabel
    .replace(/[\u2026.]+\s*\d+%$/, "\u2026")
    .replace(/[\u2026.]+\s*done$/i, "\u2026");
  const resolvedIcon = icon !== undefined ? icon : phaseTokens?.icon ?? null;

  const isAwaitingPhase = phase === "awaiting";
  const isDelegatingPhase = phase === "delegating";

  const gradientStops = phaseTokens?.gradientStops;
  const barFillStyle: React.CSSProperties = gradientStops
    ? {
        "--gradient-stop-1": gradientStops[0],
        "--gradient-stop-2": gradientStops[1],
        "--gradient-stop-3": gradientStops[2],
        "--gradient-stop-4": gradientStops[3],
        "--gradient-stop-5": gradientStops[4],
        "--gradient-stop-6": gradientStops[5],
        "--gradient-stop-7": gradientStops[6],
      } as React.CSSProperties
    : {};

  const overlayStyle: React.CSSProperties = phaseTokens?.overlay
    ? {
        background: phaseTokens.overlay.background,
        "--phase-text": phaseTokens.overlay.text,
        "--phase-pulse": phaseTokens.overlay.pulse,
      } as React.CSSProperties
    : {};

  return (
    <div
      className={`status-bar-component ${styles['status-bar']}${isSubAgent ? ` ${styles['status-bar-sub-agent']}` : ""}${active ? ` ${styles['status-bar-is-active-state']}` : ""}${isAwaitingPhase ? ` ${styles['status-bar-awaiting']}` : ""}${isDelegatingPhase ? ` ${styles['status-bar-delegating']}` : ""}`}
      style={barFillStyle}
    >
      <div
        className={`${styles['status-bar-fill']}${isCompletingPhase ? ` ${styles['status-bar-fill-is-completing-state']}` : ''}`}
        style={{ width: `${displayPercentage}%` }}
      />
      <div
        className={styles['status-bar-overlay']}
        style={overlayStyle}
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
              {tokensPerSecond != null && tokensPerSecond > 0 && (
                <span className={styles['status-bar-speed']}>
                  ⚡ {tokensPerSecond.toFixed(1)} tok/s
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

export type { StatusBarPhase };
export { PHASE_TOKENS };
