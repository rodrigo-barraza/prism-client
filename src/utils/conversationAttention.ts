/**
 * "Needs you" — what a conversation is waiting on from its user.
 *
 * prism-service serves `pendingApprovalCount`, `pendingQuestionCount` and
 * `awaitingSince` on every conversation it lists (ConversationAttentionRegistry)
 * and publishes each change on the collection-change stream as a synthetic
 * `conversation_attention` event carrying the new counts, so the sidebar
 * patches itself without refetching the list.
 */

/** `collection` of the synthetic change-stream event (mirrors prism-service). */
export const ATTENTION_CHANGE_COLLECTION = "conversation_attention";

export interface ConversationAttention {
  pendingApprovalCount?: number;
  pendingQuestionCount?: number;
  /** ISO time the oldest pending item started waiting; null when nothing waits. */
  awaitingSince?: string | null;
}

export interface AttentionChangeEvent {
  collection?: string;
  id?: string | null;
  attention?: ConversationAttention;
}

/** True when the conversation is waiting on an approval or an answer. */
export function needsYou(item: ConversationAttention | null | undefined): boolean {
  return (
    (item?.pendingApprovalCount ?? 0) > 0 || (item?.pendingQuestionCount ?? 0) > 0
  );
}

/** How many of the conversations are waiting on their user. */
export function countNeedsYou(items: ReadonlyArray<ConversationAttention>): number {
  let count = 0;
  for (const item of items) if (needsYou(item)) count++;
  return count;
}

/**
 * Apply a `conversation_attention` change to a conversation list. Returns
 * the SAME array when the event is not an attention change or names no
 * listed conversation, so a state setter can bail out without a re-render.
 */
export function applyAttentionChange<
  TConversation extends ConversationAttention & { id?: string; _id?: unknown },
>(conversations: TConversation[], event: AttentionChangeEvent): TConversation[] {
  if (event.collection !== ATTENTION_CHANGE_COLLECTION || !event.id || !event.attention) {
    return conversations;
  }
  const index = conversations.findIndex(
    (conversation) => (conversation.id || String(conversation._id)) === event.id,
  );
  if (index === -1) return conversations;
  const { pendingApprovalCount = 0, pendingQuestionCount = 0, awaitingSince = null } =
    event.attention;
  const next = [...conversations];
  next[index] = {
    ...conversations[index],
    pendingApprovalCount,
    pendingQuestionCount,
    awaitingSince,
  };
  return next;
}

/** "now", "4m", "2h", "3d" — how long something has been waiting. */
export function formatAwaitingAge(
  awaitingSince: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!awaitingSince) return null;
  const since = Date.parse(awaitingSince);
  if (Number.isNaN(since)) return null;
  const minutes = Math.floor(Math.max(0, now - since) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** "2 approvals · 1 question" — for a badge's accessible label. */
export function describeAttention(item: ConversationAttention): string {
  const parts: string[] = [];
  const approvals = item.pendingApprovalCount ?? 0;
  const questions = item.pendingQuestionCount ?? 0;
  if (approvals > 0) parts.push(`${approvals} ${approvals === 1 ? "approval" : "approvals"}`);
  if (questions > 0) parts.push(`${questions} ${questions === 1 ? "question" : "questions"}`);
  return parts.join(" · ");
}

/** "(3) Prism" — the tab title with the waiting count; the base title alone at 0. */
export function titleWithNeedsYouCount(baseTitle: string, count: number): string {
  const stripped = baseTitle.replace(/^\(\d+\)\s+/, "");
  return count > 0 ? `(${count}) ${stripped}` : stripped;
}
