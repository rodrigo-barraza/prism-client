/**
 * Pure conversation edits behind the chat's message actions
 * (useMessageActions): what an edit, rerun, delete or restore does to the
 * message array before it is persisted with PATCH /conversations/:id.
 */
import type { ContentSegment, Message } from "../types/types";

/** Visible messages after `index` — what an edit or rerun of it discards. */
export function countLaterMessages(messages: Message[], index: number): number {
  return messages.slice(index + 1).filter((message) => message.role !== "system").length;
}

/** The per-turn context note the server persists just before a turn's user message. */
const TURN_CONTEXT_TAG = "<system-context>";

/**
 * Where the turn a user message opens begins: its `<system-context>` note,
 * persisted right before it, goes with it when the turn is discarded.
 */
export function turnStartIndex(messages: Message[], userIndex: number): number {
  let start = userIndex;
  while (
    start > 0 &&
    messages[start - 1].role === "system" &&
    String(messages[start - 1].content ?? "").trimStart().startsWith(TURN_CONTEXT_TAG)
  ) {
    start -= 1;
  }
  return start;
}

/** Soft delete: the server keeps the message but leaves it out of the model's context. */
export function softDeleteMessage<T extends Message>(messages: T[], index: number): T[] {
  return messages.map((message, messageIndex) =>
    messageIndex === index ? { ...message, deleted: true } : message,
  );
}

export function restoreMessage<T extends Message>(messages: T[], index: number): T[] {
  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message;
    const { deleted: _deleted, ...restored } = message;
    return restored as T;
  });
}

/**
 * Replace an assistant reply's text. Its text fragments collapse into one
 * trailing text segment so the interleaved view shows the edited text;
 * thinking, tool and media segments keep their order.
 */
export function applyAssistantEdit<T extends Message>(message: T, content: string): T {
  const segments = message.contentSegments;
  if (!segments || segments.length === 0) return { ...message, content };
  const nonTextSegments = segments.filter((segment) => segment.type !== "text");
  const textSegment: ContentSegment = { type: "text", fragmentIndex: 0 };
  return {
    ...message,
    content,
    textFragments: [content],
    contentSegments: [...nonTextSegments, textSegment],
  };
}

/**
 * Live-streaming bookkeeping the client hangs on messages (the `Message`
 * "client-side" block and AgentChatComponent's ClientMessage). Other
 * `_`-prefixed fields — `_notificationSource`, `_turnInput`, … — are the
 * server's own and must survive a PATCH.
 */
const CLIENT_ONLY_MESSAGE_FIELDS = new Set([
  "_intermediateUsage",
  "_intermediateEstimatedCost",
  "_liveGenProgress",
  "_liveModelNames",
  "_liveModalities",
  "_liveStreaming",
  "_streamingStartTime",
  "_streamingLastChunkTime",
  "_streamingBurstTokens",
  "_streamingBurstElapsed",
  "_streamingOutputCharacters",
  "_processingStartTime",
  "_statusProgress",
  "_ttftSamples",
  "_subAgentGenerationProgress",
  "_subAgentTokens",
  "_backgroundUsage",
  "_fromSnapshot",
  "_snapshot",
]);

/**
 * The array to PATCH: drops client-only error bubbles and the client's
 * live-streaming bookkeeping.
 */
export function toPersistableMessages(messages: Message[]): Message[] {
  return messages
    .filter((message) => !(message as { isError?: boolean }).isError)
    .map((message) => {
      const persistable: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(message)) {
        if (!CLIENT_ONLY_MESSAGE_FIELDS.has(key)) persistable[key] = value;
      }
      return persistable as unknown as Message;
    });
}
