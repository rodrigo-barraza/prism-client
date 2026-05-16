"use client";

import { Zap, Trash2 } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";


import { formatLatency } from "../utils/utilities";
import styles from "./WorkerNotificationComponent.module.css";
import { IconButtonComponent, DateTimeBadgeComponent } from "@rodrigo-barraza/components-library";

/**
 * WorkerNotificationComponent — renders a task-notification card
 * for worker agent results in the message list. The `result` body
 * is rendered through `MarkdownContent` to support full markdown
 * formatting (code blocks, lists, links, etc.).
 */
export default function WorkerNotificationComponent({
  // @ts-ignore
  // @ts-ignore
  taskNotif: any,
  // @ts-ignore
  // @ts-ignore
  timestamp: any,
  // @ts-ignore
  // @ts-ignore
  readOnly: any,
  // @ts-ignore
  // @ts-ignore
  onDelete: any,
}) {
  const statusIcon =
    // @ts-ignore
    taskNotif.status === "completed"
      ? "✓"
      // @ts-ignore
      : taskNotif.status === "failed"
        ? "✗"
        : "■";

  const statusColor =
    // @ts-ignore
    taskNotif.status === "completed"
      ? "var(--color-success, #22c55e)"
      // @ts-ignore
      : taskNotif.status === "failed"
        ? "var(--color-danger, #ef4444)"
        : "var(--text-muted)";

  // @ts-ignore
  const durationSec = taskNotif.durationMs
    // @ts-ignore
    ? formatLatency(Number(taskNotif.durationMs) / 1000)
    : null;

  return (
    <div className={styles.root}>
      <div className={styles.avatar} style={{ color: statusColor }}>
        <Zap size={16} />
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.roleLabel} style={{ color: statusColor }}>
            <span className={styles.statusIcon}>{statusIcon}</span>
            Worker
            // @ts-ignore
            {/* @ts-ignore */}
            {timestamp && <DateTimeBadgeComponent date={timestamp} mini />}
          </div>
          // @ts-ignore
          {/* @ts-ignore */}
          {!readOnly && onDelete && (
            <div className={styles.actions}>
              <IconButtonComponent
                icon={<Trash2 size={14} />}
                // @ts-ignore
                onClick={onDelete}
                tooltip="Delete notification"
                variant="destructive"
                className={styles.actionBtn}
              />
            </div>
          )}
        </div>

        {/* Summary line with duration + tool count badges */}
        <div className={styles.summary}>
          {/* @ts-ignore */}
          {taskNotif.summary}
          {durationSec && (
            <span className={styles.meta}>({durationSec})</span>
          )}
          {/* @ts-ignore */}
          {taskNotif.toolUses && (
            // @ts-ignore
            <span className={styles.meta}>{taskNotif.toolUses} tools</span>
          )}
        </div>

        {/* Result body — rendered as full markdown */}
        {/* @ts-ignore */}
        {taskNotif.result && (
          // @ts-ignore
          <MarkdownContent
            // @ts-ignore
            content={taskNotif.result}
            className={styles.resultBody}
          />
        )}
      </div>
    </div>
  );
}
