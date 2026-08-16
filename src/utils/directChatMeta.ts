import type { ConversationMeta } from "../types/types";

/**
 * Build the `conversationMeta` for a Direct Chat (agentless, `/chat`) turn.
 *
 * The field looks like optional decoration and is not: on the service side
 * its PRESENCE is the turn-start marker. ChatRoutes appends the turn's user
 * message only when `userMessage && conversationMeta`
 * (Finalizer.assembleMessagesToAppend) — follow-up iterations within one turn
 * reuse the conversationId and omit the meta precisely so the prompt is not
 * stored twice. A turn that ships no meta therefore persists the assistant
 * reply alone, and the user's own prompt disappears from the conversation the
 * moment the UI re-reads it from the database (post-stream refresh,
 * conversation switch, reload).
 *
 * So: always an object, empty when there is nothing to carry. The title is
 * derived server-side — send only meta the server can't derive itself.
 */
export function buildDirectChatConversationMeta(
  systemPrompt?: string | null,
): ConversationMeta {
  return {
    ...(systemPrompt ? { systemPrompt } : {}),
  };
}
