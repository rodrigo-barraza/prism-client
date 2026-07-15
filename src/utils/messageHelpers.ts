import type { Message } from "../types/types";

/**
 * Resolves display-ready messages from a conversation API response.
 *
 * All conversation-serving endpoints attach backend-serialized
 * `displayMessages` at serve time (tool results pre-merged, empty stubs
 * filtered — see prepareDisplayMessages in prism-service), so we read the
 * field directly.
 */
export function resolveDisplayMessages(
  entry: { displayMessages?: Message[]; messages?: Message[] },
): Message[] {
  return entry.displayMessages ?? [];
}
