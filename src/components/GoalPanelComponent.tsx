"use client";

import { useState } from "react";
import {
  Target,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  Check,
  X,
  CalendarClock,
  Loader,
} from "lucide-react";
import type { ConversationGoal } from "../types/types";
import styles from "./GoalPanelComponent.module.css";

interface GoalPanelComponentProps {
  goal: ConversationGoal | null | undefined;
  onPause?: () => void;
  onResume?: () => void;
  onClear?: () => void;
  isBusy?: boolean;
  error?: string | null;
  /** Viewer-only surface (admin): no Pause / Resume / Clear. */
  readOnly?: boolean;
}

const STATUS_LABEL: Record<ConversationGoal["status"], string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  blocked: "Blocked",
};

function formatDollars(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function formatDeadline(iso: string): { label: string; overdue: boolean } {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return { label: iso, overdue: false };
  const date = new Date(time);
  const label = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { label, overdue: time < Date.now() };
}

/**
 * Compact panel for the conversation's long-running goal: objective,
 * status pill, progress bar + summary, budget / turns / deadline, the
 * current obstacle when blocked, and Pause / Resume / Clear. Renders
 * nothing when there is no goal.
 */
export default function GoalPanelComponent({
  goal,
  onPause,
  onResume,
  onClear,
  isBusy = false,
  error = null,
  readOnly = false,
}: GoalPanelComponentProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (!goal) return null;

  const percent =
    typeof goal.progress?.percent === "number" && Number.isFinite(goal.progress.percent)
      ? Math.max(0, Math.min(100, goal.progress.percent))
      : null;
  const maxCost = goal.budget?.maxCostDollars;
  const maxTurns = goal.budget?.maxTurns;
  const deadline = goal.budget?.deadline ? formatDeadline(goal.budget.deadline) : null;
  const costOver = typeof maxCost === "number" && goal.spentDollars > maxCost;
  const turnsOver = typeof maxTurns === "number" && goal.turnsUsed > maxTurns;
  const isBlocked = goal.status === "blocked" || !!goal.blockedOn;
  const canToggle = goal.status === "active" || goal.status === "paused";

  return (
    <section
      className={`goal-panel-component ${styles["panel"]} ${styles[`status-${goal.status}`] || ""}`}
      aria-label="Conversation goal"
      data-status={goal.status}
    >
      <div className={styles["header"]}>
        <Target size={14} className={styles["icon"]} />
        <span className={styles["label"]}>Goal</span>
        <span className={`${styles["status-pill"]} ${styles[`pill-${goal.status}`] || ""}`}>
          {STATUS_LABEL[goal.status] ?? goal.status}
        </span>
        {isBusy && <Loader size={12} className={styles["spinner"]} aria-label="Working" />}
        {!readOnly && (
        <div className={styles["actions"]}>
          {canToggle && (
            <button
              type="button"
              className={styles["action-button"]}
              onClick={goal.status === "paused" ? onResume : onPause}
              disabled={isBusy}
              aria-label={goal.status === "paused" ? "Resume goal" : "Pause goal"}
            >
              {goal.status === "paused" ? <Play size={12} /> : <Pause size={12} />}
              {goal.status === "paused" ? "Resume" : "Pause"}
            </button>
          )}
          {!confirmingClear ? (
            <button
              type="button"
              className={`${styles["action-button"]} ${styles["action-danger"]}`}
              onClick={() => setConfirmingClear(true)}
              disabled={isBusy}
              aria-label="Clear goal"
            >
              <Trash2 size={12} />
              Clear
            </button>
          ) : (
            <span className={styles["confirm-row"]} role="group" aria-label="Confirm clear goal">
              <span className={styles["confirm-text"]}>Clear this goal?</span>
              <button
                type="button"
                className={`${styles["action-button"]} ${styles["action-danger"]}`}
                onClick={() => {
                  setConfirmingClear(false);
                  onClear?.();
                }}
                disabled={isBusy}
                aria-label="Confirm clear goal"
              >
                <Check size={12} />
                Confirm
              </button>
              <button
                type="button"
                className={styles["action-button"]}
                onClick={() => setConfirmingClear(false)}
                aria-label="Cancel clear goal"
              >
                <X size={12} />
                Cancel
              </button>
            </span>
          )}
        </div>
        )}
      </div>

      <div className={styles["objective"]} title={goal.completionCriteria || undefined}>
        {goal.objective}
      </div>
      {goal.completionCriteria && (
        <div className={styles["criteria"]}>Done when: {goal.completionCriteria}</div>
      )}

      <div className={styles["progress-row"]}>
        <div
          className={`${styles["progress-track"]} ${percent === null ? styles["progress-indeterminate"] : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-label="Goal progress"
        >
          <div
            className={styles["progress-fill"]}
            style={{ width: percent === null ? "100%" : `${percent}%` }}
          />
        </div>
        {percent !== null && <span className={styles["progress-percent"]}>{Math.round(percent)}%</span>}
      </div>
      {goal.progress?.summary && (
        <div className={styles["progress-summary"]}>{goal.progress.summary}</div>
      )}

      {isBlocked && goal.blockedOn && (
        <div className={styles["blocked"]} role="alert">
          <AlertTriangle size={13} />
          <span>
            <strong>Blocked on:</strong> {goal.blockedOn}
          </span>
        </div>
      )}

      <div className={styles["meta-row"]}>
        <span
          className={`${styles["meta"]} ${costOver ? styles["meta-over"] : ""}`}
          title="Spent / budget"
        >
          {formatDollars(goal.spentDollars)}
          {typeof maxCost === "number" ? ` / ${formatDollars(maxCost)}` : ""}
        </span>
        <span
          className={`${styles["meta"]} ${turnsOver ? styles["meta-over"] : ""}`}
          title="Turns used / max"
        >
          {goal.turnsUsed}
          {typeof maxTurns === "number" ? ` / ${maxTurns}` : ""} turn
          {goal.turnsUsed === 1 && typeof maxTurns !== "number" ? "" : "s"}
        </span>
        {deadline && (
          <span
            className={`${styles["meta"]} ${deadline.overdue ? styles["meta-over"] : ""}`}
            title={goal.budget?.deadline}
          >
            <CalendarClock size={11} />
            {deadline.overdue ? "Overdue · " : "Due "}
            {deadline.label}
          </span>
        )}
      </div>

      {error && <div className={styles["error"]}>{error}</div>}
    </section>
  );
}
