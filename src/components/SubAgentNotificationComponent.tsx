"use client";

import { Zap, Trash2 } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";

import { formatDuration } from "@rodrigo-barraza/utilities-library";
import styles from "./SubAgentNotificationComponent.module.css";
import {
  IconButtonComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";
import { EXECUTION_STATUS } from "../constants";

/**
 * SubAgentNotificationComponent — renders a task-notification card
 * for sub-agent results in the message list. The `result` body
 * is rendered through `MarkdownContent` to support full markdown
 * formatting (code blocks, lists, links, etc.).
 */
export interface TaskNotification {
  status?: (typeof EXECUTION_STATUS)[keyof typeof EXECUTION_STATUS] | string | null;
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
    taskNotif.status === EXECUTION_STATUS.COMPLETED
      ? "✓"
      : taskNotif.status === EXECUTION_STATUS.FAILED
        ? "✗"
        : "■";

  const statusColor =
    taskNotif.status === EXECUTION_STATUS.COMPLETED
      ? "var(--color-success, oklch(0.7 0.17 145))"
      : taskNotif.status === EXECUTION_STATUS.FAILED
        ? "var(--color-danger, oklch(0.585 0.22 25))"
        : "var(--text-muted)";

  const formattedDuration = taskNotif.durationMs
    ? formatDuration(Number(taskNotif.durationMs))
    : null;

  return (
    <div className={`sub-agent-notification-component ${styles['root']}`}>
      <div className={styles['avatar']} style={{ color: statusColor }}>
        <Zap size={16} />
      </div>
      <div className={styles['content']}>
        <div className={styles['header']}>
          <div className={styles['role-label']}>
            <span className={styles['status-icon']}>{statusIcon}</span>
            Tool: Create Subagents
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
          {formattedDuration && <span className={styles['meta']}>({formattedDuration})</span>}
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

        {/* Metadata badges — matches system message pattern */}
        {taskNotif.result && (
          <div className={styles['meta-badges']}>
            <BadgeComponent
              type="words"
              count={
                taskNotif.result
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean).length
              }
            />
            <BadgeComponent
              type="tokens"
              value={Math.ceil(taskNotif.result.length / 4)}
              label="estimated"
            />
            {formattedDuration && (
              <BadgeComponent variant="info">
                ⏱ {formattedDuration}
              </BadgeComponent>
            )}
            {taskNotif.toolUses && (
              <BadgeComponent variant="info">
                🔧 {taskNotif.toolUses} tools
              </BadgeComponent>
            )}
            {timestamp && (
              <BadgeComponent type="dateTime" date={timestamp} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
