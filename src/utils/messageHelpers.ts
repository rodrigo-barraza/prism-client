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

const SYSTEM_CONTEXT_PREFIXES = ["[System Context]", "[System Context - Local Time:"];

function hasSystemContextPrefix(text: string): boolean {
  return SYSTEM_CONTEXT_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/** Strip a server-injected `[System Context]` header from a user message. */
export function cleanMessageContent(content: string | undefined | null): string {
  if (!content) return "";
  if (content.startsWith("[System Context]")) {
    const splitIndex = content.indexOf("\n\n[User Message]\n");
    if (splitIndex !== -1) {
      return content.substring(splitIndex + "\n\n[User Message]\n".length);
    }
    const altSplit = content.indexOf("[User Message]\n");
    if (altSplit !== -1) {
      return content.substring(altSplit + "[User Message]\n".length);
    }
  } else if (content.startsWith("[System Context - Local Time:")) {
    const index = content.indexOf("]\n\n");
    if (index !== -1) {
      return content.slice(index + 3);
    }
  }
  return content;
}

/**
 * The clean (as typed) and raw (with injected context) text of a user
 * message, from whichever of `content` / `rawContent` carries each.
 */
export function getCleanAndRaw(content: string, rawContent?: string) {
  let cleanedContentValue = content || "";
  let rawContentValue = rawContent || content || "";

  const contentIsDirty = hasSystemContextPrefix(cleanedContentValue);
  const rawIsDirty = hasSystemContextPrefix(rawContentValue);

  if (contentIsDirty && !rawIsDirty) {
    cleanedContentValue = rawContentValue;
    rawContentValue = content;
  } else if (!contentIsDirty && rawIsDirty) {
    cleanedContentValue = content;
  } else if (contentIsDirty && rawIsDirty) {
    // Both are dirty, clean one for cleanedContentValue
    cleanedContentValue = cleanMessageContent(content);
  } else {
    // Neither is dirty
    cleanedContentValue = content;
    rawContentValue = rawContent || content;
  }

  return { clean: cleanedContentValue, raw: rawContentValue };
}

/** The text a user message was typed as — what a rerun sends again. */
export function userMessageResendText(message: Message): string {
  const { rawContent } = message;
  if (rawContent && !hasSystemContextPrefix(rawContent)) return rawContent;
  return getCleanAndRaw(message.content || "", rawContent).clean;
}
