"use client";

import { Radio, SquareTerminal, Trash2 } from "lucide-react";
import { IconButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./TaskNotificationItemComponent.module.css";
import BadgeComponent from "./BadgeComponent";
import {
  backgroundTaskOutcomeTone,
  backgroundTaskStatusLabel,
  isBackgroundTaskStatus,
  type BackgroundTaskOutcomeTone,
} from "../utils/backgroundTasks";
import type { WorkspaceTaskNotification } from "../utils/taskNotifications";

/**
 * TaskNotificationItemComponent — what one of the agent's own background
 * tasks reported: a monitor's events, or how a background command or a
 * monitor ended (utils/taskNotifications). It is the agent's command
 * output, delivered on the task's own schedule, so it is drawn as a
 * compact tool-like item, never as a user bubble. Text is shown as plain
 * text: it is a command's output.
 */
interface TaskNotificationItemProps {
  notifications: WorkspaceTaskNotification[];
  timestamp?: string | Date;
  readOnly?: boolean;
  onDelete?: () => void;
}

/**
 * "completed · exit 0", "socket closed · code 1006", "3 events" — how the
 * task ended (worded as the strip words it), or what arrived.
 */
function outcomeOf(notification: WorkspaceTaskNotification): { text: string; tone: BackgroundTaskOutcomeTone } | null {
  const { status, exitCode, closeCode, events } = notification;
  if (!status) {
    if (events.length === 0 || !notification.taskType) return null;
    return { text: `${events.length} event${events.length === 1 ? "" : "s"}`, tone: "neutral" };
  }
  const closedWith = closeCode !== null ? ` · code ${closeCode}` : "";
  if (!isBackgroundTaskStatus(status)) {
    return { text: `${status}${exitCode !== null ? ` · exit ${exitCode}` : ""}${closedWith}`, tone: "neutral" };
  }
  const parsedExitCode = exitCode !== null && /^-?\d+$/.test(exitCode) ? Number(exitCode) : null;
  const task = { status, exitCode: parsedExitCode };
  return { text: `${backgroundTaskStatusLabel(task)}${closedWith}`, tone: backgroundTaskOutcomeTone(task) };
}

function NotificationBody({ notification }: { notification: WorkspaceTaskNotification }) {
  const outcome = outcomeOf(notification);
  return (
    <div className={styles["notification"]}>
      {(notification.taskType || notification.taskId || outcome) && (
        <div className={styles["meta-line"]}>
          {notification.taskType && <span className={styles["type-tag"]}>{notification.taskType}</span>}
          {notification.taskId && <code className={styles["task-id"]}>{notification.taskId}</code>}
          {outcome && (
            <span className={`${styles["outcome"]} ${styles[`outcome-${outcome.tone}`]}`}>{outcome.text}</span>
          )}
        </div>
      )}
      {notification.description && <div className={styles["description"]}>{notification.description}</div>}
      {notification.summary && <div className={styles["summary"]}>{notification.summary}</div>}
      {notification.events.length > 0 && (
        <pre className={styles["events"]} aria-label="Events">
          {notification.events.join("\n")}
        </pre>
      )}
      {(notification.outputTail || notification.outputFile) && (
        <details className={styles["output"]}>
          <summary>
            Output
            {notification.outputFile && <code className={styles["output-file"]}>{notification.outputFile}</code>}
          </summary>
          {notification.outputTail && <pre className={styles["output-tail"]}>{notification.outputTail}</pre>}
        </details>
      )}
    </div>
  );
}

export default function TaskNotificationItemComponent({
  notifications,
  timestamp,
  readOnly,
  onDelete,
}: TaskNotificationItemProps) {
  const taskIds = notifications.map((notification) => notification.taskId).filter(Boolean);
  const isMonitor = notifications.some((notification) => notification.taskType === "monitor");
  const Icon = isMonitor ? Radio : SquareTerminal;
  const label = taskIds.length > 0 ? `Task notification from ${[...new Set(taskIds)].join(", ")}` : "Task notification";
  return (
    <div className={`task-notification-item-component ${styles["root"]}`} role="note" aria-label={label}>
      <div className={styles["avatar"]}>
        <Icon size={14} aria-hidden="true" />
      </div>
      <div className={styles["content"]}>
        <div className={styles["header"]}>
          <div
            className={styles["role-label"]}
            title="The agent's own background task reporting — not a message from the user"
          >
            <span>Task notification</span>
            {timestamp && <BadgeComponent type="dateTime" date={timestamp} />}
          </div>
          {!readOnly && onDelete && (
            <div className={styles["actions"]}>
              <IconButtonComponent
                icon={<Trash2 size={14} />}
                onClick={onDelete}
                tooltip="Delete"
                variant="destructive"
                className={styles["action-button"]}
              />
            </div>
          )}
        </div>
        {notifications.map((notification, index) => (
          <NotificationBody key={`${notification.taskId ?? "task"}-${index}`} notification={notification} />
        ))}
      </div>
    </div>
  );
}
