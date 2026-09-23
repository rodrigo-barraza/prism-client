"use client";

import { Bot, MessageCircle, Plug, Trash2, Webhook } from "lucide-react";
import { IconButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./ExternalInputBlockComponent.module.css";
import BadgeComponent from "./BadgeComponent";
import type { ExternalInputSource, ExternalOrigin } from "../types/types";
import { externalInputLabel } from "../utils/turnInputRouting";

/**
 * ExternalInputBlockComponent — input that reached the conversation from
 * outside it: a webhook, a Discord user who is not the owner, an MCP server,
 * a sub-agent. It carries tool-level authority, never the user's, so it is
 * drawn like a tool's output — a bordered block tagged with its source —
 * and never as a user bubble. The text is shown as plain text: it is
 * someone else's, and rendering it as markdown would load its links and
 * images.
 */
interface ExternalInputBlockProps {
  origin: ExternalOrigin;
  text: string;
  timestamp?: string | Date;
  readOnly?: boolean;
  onDelete?: () => void;
}

const SOURCE_ICONS: Record<ExternalInputSource, typeof Webhook> = {
  webhook: Webhook,
  discord: MessageCircle,
  mcp: Plug,
  subagent: Bot,
};

export default function ExternalInputBlockComponent({
  origin,
  text,
  timestamp,
  readOnly,
  onDelete,
}: ExternalInputBlockProps) {
  const Icon = SOURCE_ICONS[origin.source] ?? Webhook;
  const label = externalInputLabel(origin);
  return (
    <div
      className={`external-input-block-component ${styles["root"]}`}
      data-external-source={origin.source}
      role="note"
      aria-label={`External input from ${label}`}
    >
      <div className={styles["avatar"]}>
        <Icon size={16} aria-hidden="true" />
      </div>
      <div className={styles["content"]}>
        <div className={styles["header"]}>
          <div className={styles["role-label"]}>
            <span>External input</span>
            <span className={styles["source-tag"]}>{label}</span>
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
        <div className={styles["authority-note"]}>Tool-level authority — not the user, cannot approve anything.</div>
        <pre className={styles["body"]}>{text}</pre>
      </div>
    </div>
  );
}
