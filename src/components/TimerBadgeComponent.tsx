"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, XCircle, Play } from "lucide-react";
import { DateTimeBadgeComponent } from "@rodrigo-barraza/components-library";
import styles from "./TimerBadgeComponent.module.css";

interface TimerBadgeComponentProps {
  timerId: string;
  firesAt: string;
  prompt: string;
  mode: "one_shot" | "recurring";
  status: "active" | "fired" | "cancelled" | "expired";
  onCancel?: (timerId: string) => void;
  readOnly?: boolean;
}

/**
 * Format remaining seconds into a clean MM:SS countdown display.
 */
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function TimerBadgeComponent({
  timerId,
  firesAt,
  prompt,
  mode,
  status,
  onCancel,
  readOnly = false,
}: TimerBadgeComponentProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isFiredLocal, setIsFiredLocal] = useState<boolean>(false);

  const calculateRemaining = useCallback(() => {
    const targetTimestamp = new Date(firesAt).getTime();
    const currentTimestamp = Date.now();
    const differenceSeconds = Math.max(0, Math.ceil((targetTimestamp - currentTimestamp) / 1000));
    setRemainingSeconds(differenceSeconds);

    if (differenceSeconds <= 0 && status === "active") {
      setIsFiredLocal(true);
    }
  }, [firesAt, status]);

  // Handle countdown interval
  useEffect(() => {
    calculateRemaining();
    if (status !== "active") return;

    const intervalId = setInterval(calculateRemaining, 1000);
    return () => clearInterval(intervalId);
  }, [firesAt, status, calculateRemaining]);

  // Determine badge styling based on state
  const isTimerCancelled = status === "cancelled";
  const isTimerFired = status === "fired" || isFiredLocal || status === "expired";
  const isTimerActive = status === "active" && !isTimerFired && !isTimerCancelled;

  let stateLabel = "";
  let badgeClass = styles.timerBadgeStateActive;
  let statusIcon = <Clock size={14} className={styles.timerBadgeSpinnerIcon} />;

  if (isTimerCancelled) {
    stateLabel = "Cancelled";
    badgeClass = styles.timerBadgeStateCancelled;
    statusIcon = <XCircle size={14} />;
  } else if (isTimerFired) {
    stateLabel = mode === "recurring" ? "Recurring Cron Run" : "Reminder Fired";
    badgeClass = styles.timerBadgeStateFired;
    statusIcon = <Play size={14} className={styles.timerBadgeLivePulseIcon} />;
  } else {
    stateLabel = formatCountdown(remainingSeconds);
  }

  const handleCancelClick = useCallback(() => {
    if (onCancel) {
      onCancel(timerId);
    }
  }, [onCancel, timerId]);

  return (
    <div className={`${styles.timerBadgeRoot} ${badgeClass}`} aria-live="polite">
      <div className={styles.timerBadgeAvatarSection}>
        {statusIcon}
      </div>
      <div className={styles.timerBadgeContentSection}>
        <div className={styles.timerBadgeHeaderSection}>
          <div className={styles.timerBadgeRoleLabel}>
            <span className={styles.timerBadgeStatusLabel}>{stateLabel}</span>
            <span className={styles.timerBadgeTypeIndicator}>
              {mode === "recurring" ? "Recurring Reminder" : "One-Shot Timer"}
            </span>
            <DateTimeBadgeComponent date={firesAt} />
          </div>
          {isTimerActive && !readOnly && onCancel && (
            <button
              onClick={handleCancelClick}
              className={styles.timerBadgeCancelButton}
              title="Cancel reminder"
              aria-label="Cancel scheduled reminder"
            >
              Cancel
            </button>
          )}
        </div>
        <div className={styles.timerBadgePromptText}>
          {prompt}
        </div>
      </div>
    </div>
  );
}
