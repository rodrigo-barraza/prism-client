"use client";

import { useEffect, useState } from "react";
import { Loader, Radio, SquareTerminal } from "lucide-react";
import {
  backgroundTaskOutcomeTone,
  backgroundTaskStatusLabel,
  formatTaskElapsed,
  isBackgroundTaskRunning,
  visibleBackgroundTasks,
} from "../utils/backgroundTasks";
import styles from "./BackgroundTasksStripComponent.module.css";
import type { BackgroundTask } from "../types/types";

/** The elapsed times tick, and an ended task leaves, on this clock. */
const TICK_MILLISECONDS = 1_000;

interface BackgroundTasksStripProps {
  tasks: readonly BackgroundTask[];
  onStop: (_taskId: string) => void;
  /** Stop asked for, the task still running: "Stopping…". */
  stopRequestedTaskIds?: ReadonlySet<string>;
  stopErrors?: Readonly<Record<string, string>>;
}

function TaskRow({
  task,
  now,
  isStopRequested,
  stopError,
  onStop,
}: {
  task: BackgroundTask;
  now: number;
  isStopRequested: boolean;
  stopError: string | undefined;
  onStop: (_taskId: string) => void;
}) {
  const isRunning = isBackgroundTaskRunning(task);
  const Icon = task.taskType === "monitor" ? Radio : SquareTerminal;
  const what = task.description || task.command || task.wsUrl || task.taskId;
  const startedAt = task.startedAt ? Date.parse(task.startedAt) : NaN;
  const endedAt = task.endedAt ? Date.parse(task.endedAt) : NaN;
  const elapsed = Number.isNaN(startedAt)
    ? null
    : formatTaskElapsed((isRunning || Number.isNaN(endedAt) ? now : endedAt) - startedAt);
  return (
    <li
      className={`${styles["task"]} ${isRunning ? "" : styles["task-ended"]}`}
      data-task-id={task.taskId}
      aria-label={`${task.taskType} ${task.taskId}: ${what}`}
    >
      <Icon size={13} className={styles["task-icon"]} aria-hidden="true" />
      <span className={styles["task-description"]} title={task.command || task.wsUrl || undefined}>
        {what}
      </span>
      <span className={styles["task-type"]}>{task.taskType}</span>
      {task.taskType === "monitor" && (
        <span className={styles["task-meta"]}>
          {task.eventCount} event{task.eventCount === 1 ? "" : "s"}
        </span>
      )}
      {elapsed && <span className={styles["task-meta"]}>{elapsed}</span>}
      {isRunning ? (
        <button
          type="button"
          className={styles["stop-button"]}
          onClick={() => onStop(task.taskId)}
          disabled={isStopRequested}
          aria-label={`Stop ${task.taskId}`}
          title={`Stop ${task.taskId}`}
        >
          {isStopRequested ? (
            <>
              <Loader size={11} className={styles["spinner"]} aria-hidden="true" /> Stopping…
            </>
          ) : (
            "Stop"
          )}
        </button>
      ) : (
        <span className={`${styles["task-status"]} ${styles[`status-${backgroundTaskOutcomeTone(task)}`]}`}>
          {backgroundTaskStatusLabel(task)}
        </span>
      )}
      {stopError && (
        <span className={styles["stop-error"]} role="alert">
          {stopError}
        </span>
      )}
    </li>
  );
}

/**
 * The conversation's background shells and monitors, above the composer:
 * each running one with its description, type, events and age, and Stop;
 * one that just ended shows how for a moment, then leaves.
 */
export default function BackgroundTasksStripComponent({
  tasks,
  onStop,
  stopRequestedTaskIds,
  stopErrors,
}: BackgroundTasksStripProps) {
  const [now, setNow] = useState(() => Date.now());
  const visibleTasks = visibleBackgroundTasks(tasks, now);
  const isTicking = visibleTasks.length > 0;
  useEffect(() => {
    if (!isTicking) return;
    const tickTimer = setInterval(() => setNow(Date.now()), TICK_MILLISECONDS);
    return () => clearInterval(tickTimer);
  }, [isTicking]);

  if (visibleTasks.length === 0) return null;
  const runningCount = visibleTasks.filter(isBackgroundTaskRunning).length;
  return (
    <section className={`background-tasks-strip-component ${styles["strip"]}`} aria-label="Background tasks">
      <div className={styles["heading"]}>
        Background tasks
        {runningCount > 0 && <span className={styles["count"]}>{runningCount} running</span>}
      </div>
      <ul className={styles["tasks"]}>
        {visibleTasks.map((task) => (
          <TaskRow
            key={task.taskId}
            task={task}
            now={now}
            isStopRequested={!!stopRequestedTaskIds?.has(task.taskId)}
            stopError={stopErrors?.[task.taskId]}
            onStop={onStop}
          />
        ))}
      </ul>
    </section>
  );
}
