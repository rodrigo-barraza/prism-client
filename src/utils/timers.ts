import type { Message } from "../types/types";

/**
 * getConversationElapsedTime
 * 
 * Computes the total wall-clock time spent processing assistant turns.
 * Only counts the time from a user message being sent to the assistant's
 * turn completion. Excludes idle time while waiting for the user.
 */
export function getConversationElapsedTime(messages: Message[]): number {
  if (!messages || messages.length === 0) return 0;
  let totalSeconds = 0;
  let lastUserTimestamp: number | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      if (message.timestamp) {
        lastUserTimestamp = new Date(message.timestamp).getTime();
      }
    } else if (message.role === "assistant" && lastUserTimestamp !== null) {
      const assistantEnd = message.completedAt
        ? new Date(message.completedAt).getTime()
        : message.timestamp
        ? new Date(message.timestamp).getTime()
        : null;

      if (assistantEnd) {
        const turnSeconds = (assistantEnd - lastUserTimestamp) / 1000;
        if (turnSeconds > 0) {
          totalSeconds += turnSeconds;
        }
        lastUserTimestamp = null;
      }
    }
  }
  return totalSeconds;
}

/**
 * deriveConversationStartTime
 * 
 * Anchors the conversation wall-clock start to the first message's timestamp.
 */
export function deriveConversationStartTime(messages: Message[]): string | number | null {
  return messages.length > 0 ? (messages[0]?.timestamp ?? null) : null;
}
