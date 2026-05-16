import MessageList from "./MessageListComponent";
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
export default function ChatPreviewComponent({
  // MessageList mode
  // @ts-ignore
  // @ts-ignore
  messages: any,
  readOnly = true,
  // Prompt block mode (when no messages array)
  // @ts-ignore
  // @ts-ignore
  systemPrompt: any,
  // @ts-ignore
  // @ts-ignore
  userPrompt: any,
  // Compact sidebar variant
  mini = false,
  // Optional max-height override
  // @ts-ignore
  // @ts-ignore
  maxHeight: any,
  // Optional extra className
  // @ts-ignore
  // @ts-ignore
  className: any,
}) {
  // -- MessageList mode --
  // @ts-ignore
  if (messages) {
    return (
      <div
        // @ts-ignore
        // @ts-ignore
        className={`${styles.chatPreview} ${mini ? styles.mini : ""}${className ? ` ${className}` : ""}`}
        // @ts-ignore
        // @ts-ignore
        style={maxHeight ? { maxHeight } : undefined}
      >
        {/* @ts-ignore */}
        <MessageList
          // @ts-ignore
          messages={messages}
          readOnly={readOnly}
          // @ts-ignore
          systemPrompt={systemPrompt}
        />
      </div>
    );
  }

  // -- Prompt block mode --
  // @ts-ignore
  const hasSystem = systemPrompt?.trim();
  // @ts-ignore
  const hasUser = userPrompt?.trim();

  if (!hasSystem && !hasUser) return null;

  return (
    // @ts-ignore
    // @ts-ignore
    <div className={`${styles.promptPreview} ${mini ? styles.mini : ""}${className ? ` ${className}` : ""}`}>
      {hasSystem && (
        <div className={`${styles.promptBlock} ${styles.promptBlockSystem}`}>
          <span className={`${styles.promptLabel} ${styles.promptLabelSystem}`}>
            System Prompt
          </span>
          {/* @ts-ignore */}
          <span className={styles.promptContent}>{systemPrompt}</span>
        </div>
      )}
      {hasUser && (
        <div className={`${styles.promptBlock} ${styles.promptBlockUser}`}>
          <span className={`${styles.promptLabel} ${styles.promptLabelUser}`}>
            User Prompt
          </span>
          {/* @ts-ignore */}
          <span className={styles.promptContent}>{userPrompt}</span>
        </div>
      )}
    </div>
  );
}
