import type { Message } from "../types/types";

/**
 * Resolves display-ready messages from a conversation API response.
 *
 * All conversation-serving endpoints attach backend-serialized
 * `displayMessages` at serve time (tool results pre-merged, empty stubs
 * filtered — see prepareDisplayMessages in prism-service); the former
 * client-side normalization copy was deleted (business-logic audit M2).
 *
 * The fallback below only fires if a response unexpectedly lacks the field:
 * degrade to raw messages minus tool-role stubs so the chat stays readable
 * instead of blanking.
 */
export function resolveDisplayMessages(
  entry: { displayMessages?: Message[]; messages?: Message[] },
): Message[] {
  if (entry.displayMessages && entry.displayMessages.length > 0) {
    return entry.displayMessages;
  }
  const fallbackMessages = (entry.messages ?? []).filter(
    (message) => message.role !== "tool",
  );
  if (fallbackMessages.length > 0) {
    console.debug(
      "[resolveDisplayMessages] backend displayMessages missing — rendering raw messages without tool-result merging",
    );
  }
  return fallbackMessages;
}
