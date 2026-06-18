"use client";

import { Zap, Trash2 } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";

import { formatLatency } from "@rodrigo-barraza/utilities-library";
import styles from "./SubAgentNotificationComponent.module.css";
import {
  IconButtonComponent,
  BadgeComponent,
} from "@rodrigo-barraza/components-library";

/**
 * SubAgentNotificationComponent — renders a task-notification card
 * for sub-agent results in the message list. The `result` body
 * is rendered through `MarkdownContent` to support full markdown
 * formatting (code blocks, lists, links, etc.).
 */
export interface TaskNotification {
  status?: "completed" | "failed" | "running" | string | null;
  durationMs?: number | string | null;
  summary?: string | null;
  toolUses?: number | string | null;
  result?: string | null;
}

interface SubAgentNotificationProps {
  taskNotif: TaskNotification;
  timestamp?: string | Date;
  readOnly?: boolean;
  onDelete?: () => void;
}

export default function SubAgentNotificationComponent({
  taskNotif,
  timestamp,
  readOnly,
  onDelete,
}: SubAgentNotificationProps) {
  const statusIcon =
    taskNotif.status === "completed"
      ? "✓"
      : taskNotif.status === "failed"
        ? "✗"
        : "■";

  const statusColor =
    taskNotif.status === "completed"
      ? "var(--color-success, #22c55e)"
      : taskNotif.status === "failed"
        ? "var(--color-danger, #ef4444)"
        : "var(--text-muted)";

  const durationSec = taskNotif.durationMs
    ? formatLatency(Number(taskNotif.durationMs) / 1000)
    : null;

  return (
    <div className={`sub-agent-notification-component ${styles['root']}`}>
      <div className={styles['avatar']} style={{ color: statusColor }}>
        <Zap size={16} />
      </div>
      <div className={styles['content']}>
        <div className={styles['header']}>
          <div className={styles['role-label']} style={{ color: statusColor }}>
            <span className={styles['status-icon']}>{statusIcon}</span>
            Sub-Agent
            {timestamp && <BadgeComponent type="dateTime" date={timestamp} />}
          </div>
          {!readOnly && onDelete && (
            <div className={styles['actions']}>
              <IconButtonComponent
                icon={<Trash2 size={14} />}
                onClick={onDelete}
                tooltip="Delete notification"
                variant="destructive"
                className={styles['action-button']}
              />
            </div>
          )}
        </div>

        {/* Summary line with duration + tool count badges */}
        <div className={styles['summary']}>
          {taskNotif.summary}
          {durationSec && <span className={styles['meta']}>({durationSec})</span>}
          {taskNotif.toolUses && (
            <span className={styles['meta']}>{taskNotif.toolUses} tools</span>
          )}
        </div>

        {/* Result body — rendered as full markdown */}
        {taskNotif.result && (
          <MarkdownContent
            content={taskNotif.result}
            className={styles['result-body']}
          />
        )}
      </div>
    </div>
  );
}
