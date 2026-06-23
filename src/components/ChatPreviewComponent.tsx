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
        // New format: injected context lives in its own system message
        (message.role === "system" &&
          (message as unknown as Record<string, unknown>)._isInjectedContext === true) ||
        // Legacy format: context was embedded in user message content/rawContent
        (message.role === "user" &&
          (message.content?.startsWith("[System Context]") ||
            message.rawContent?.startsWith("[System Context]") ||
            message.content?.startsWith("[System Context - Local Time:") ||
            message.rawContent?.startsWith("[System Context - Local Time:"))),
    );
  }, [messages]);

  // -- MessageList mode --
  if (messages) {
    const showHeader = hasSystemContextMessage && !mini;

    return (
      <div className={styles['chat-preview-container']}>
        {showHeader && (
          <div className={styles['chat-preview-header']}>
            <span className={styles['chat-preview-header-title']}>Chat Preview</span>
            <div className={styles['debug-toggle-container']}>
              <ButtonComponent
                variant={!showRaw ? "tonal" : "text"}
                size="small"
                onClick={() => setShowRaw(false)}
                className={styles['debug-toggle-button']}
              >
                Clean
              </ButtonComponent>
              <ButtonComponent
                variant={showRaw ? "tonal" : "text"}
                size="small"
                onClick={() => setShowRaw(true)}
                className={styles['debug-toggle-button']}
              >
                Raw
              </ButtonComponent>
            </div>
          </div>
        )}
        <div
          className={`${styles['chat-preview']} ${mini ? styles['mini'] : ""}${className ? ` ${className}` : ""}`}
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
      className={`chat-preview-component ${styles['prompt-preview']} ${mini ? styles['mini'] : ""}${className ? ` ${className}` : ""}`}
    >
      {hasSystem && (
        <div className={`${styles['prompt-block']} ${styles['prompt-block-system']}`}>
          <span className={`${styles['prompt-label']} ${styles['prompt-label-system']}`}>
            System Prompt
          </span>
          <span className={styles['prompt-content']}>{systemPrompt}</span>
        </div>
      )}
      {hasUser && (
        <div className={`${styles['prompt-block']} ${styles['prompt-block-user']}`}>
          <span className={`${styles['prompt-label']} ${styles['prompt-label-user']}`}>
            User Prompt
          </span>
          <span className={styles['prompt-content']}>{userPrompt}</span>
        </div>
      )}
    </div>
  );
}

