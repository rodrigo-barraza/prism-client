"use client";

import { useState, useMemo } from "react";
import MessageList from "./MessageListComponent";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./ChatPreviewComponent.module.css";

/**
 * ChatPreviewComponent — Reusable container for rendering chat message
 * previews (with MessageList) or static prompt blocks (system + user).
 *
 * Usage A: Chat message preview (wraps MessageList)
 *   <ChatPreviewComponent messages={displayMessages} readOnly />
 *
 * Usage B: Prompt blocks (system prompt + user prompt)
 *   <ChatPreviewComponent systemPrompt="..." userPrompt="..." />
 */
import { Message } from "../types/types";

export interface ChatPreviewProps {
  // MessageList mode
  messages?: Message[];
  readOnly?: boolean;
  // Prompt block mode (when no messages array)
  systemPrompt?: string;
  userPrompt?: string;
  // Compact sidebar variant
  mini?: boolean;
  // Optional max-height override
  maxHeight?: string;
  // Optional extra className
  className?: string;
}

export default function ChatPreviewComponent({
  messages,
  readOnly = true,
  systemPrompt,
  userPrompt,
  mini = false,
  maxHeight,
  className,
}: ChatPreviewProps) {
  const [showRaw, setShowRaw] = useState(false);

  const hasSystemContextMessage = useMemo(() => {
    if (!messages) return false;
    return messages.some(
      (message) =>
        message.role === "user" &&
        (message.content?.startsWith("[System Context]") ||
          message.rawContent?.startsWith("[System Context]") ||
          message.content?.startsWith("[System Context - Local Time:") ||
          message.rawContent?.startsWith("[System Context - Local Time:")),
    );
  }, [messages]);

  // -- MessageList mode --
  if (messages) {
    const showHeader = hasSystemContextMessage && !mini;

    return (
      <div className={styles.chatPreviewContainer}>
        {showHeader && (
          <div className={styles.chatPreviewHeader}>
            <span className={styles.chatPreviewHeaderTitle}>Chat Preview</span>
            <div className={styles.debugToggleContainer}>
              <ButtonComponent
                variant={!showRaw ? "tonal" : "text"}
                size="small"
                onClick={() => setShowRaw(false)}
                className={styles.debugToggleButton}
              >
                Clean
              </ButtonComponent>
              <ButtonComponent
                variant={showRaw ? "tonal" : "text"}
                size="small"
                onClick={() => setShowRaw(true)}
                className={styles.debugToggleButton}
              >
                Raw
              </ButtonComponent>
            </div>
          </div>
        )}
        <div
          className={`${styles.chatPreview} ${mini ? styles.mini : ""}${className ? ` ${className}` : ""}`}
          style={maxHeight ? { maxHeight } : undefined}
        >
          <MessageList
            messages={messages}
            readOnly={readOnly}
            systemPrompt={systemPrompt}
            showRaw={showRaw}
          />
        </div>
      </div>
    );
  }

  // -- Prompt block mode --
  const hasSystem = systemPrompt?.trim();
  const hasUser = userPrompt?.trim();

  if (!hasSystem && !hasUser) return null;

  return (
    <div
      className={`${styles.promptPreview} ${mini ? styles.mini : ""}${className ? ` ${className}` : ""}`}
    >
      {hasSystem && (
        <div className={`${styles.promptBlock} ${styles.promptBlockSystem}`}>
          <span className={`${styles.promptLabel} ${styles.promptLabelSystem}`}>
            System Prompt
          </span>
          <span className={styles.promptContent}>{systemPrompt}</span>
        </div>
      )}
      {hasUser && (
        <div className={`${styles.promptBlock} ${styles.promptBlockUser}`}>
          <span className={`${styles.promptLabel} ${styles.promptLabelUser}`}>
            User Prompt
          </span>
          <span className={styles.promptContent}>{userPrompt}</span>
        </div>
      )}
    </div>
  );
}

