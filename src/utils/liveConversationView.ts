/**
 * Helpers for viewing a conversation that another session is generating
 * (viewed sub-agents, the /admin/chat read-only viewer).
 *
 * Two update channels feed the viewed conversation:
 *   1. The live WebSocket stream (per-token chunk/thinking/tool events,
 *      broadcast by the service to direct viewers).
 *   2. Whole-document snapshot refreshes (change-stream triggered refetches).
 *
 * These helpers arbitrate between them and set up the stream's local state.
 */
import type { ContextBudget } from "../types/types";

/**
 * Whether a whole-document snapshot refresh may overwrite the viewed
 * `messages` state.
 *
 * Regression guarded: suppressing refreshes whenever the WebSocket was merely
 * OPEN meant a silent subscription (service without direct-viewer broadcast,
 * dropped events) blocked every boundary update — the viewer went completely
 * stale until a manual page reload. Only an actively-delivering stream may
 * claim ownership of `messages`.
 */
export function shouldApplySnapshotRefresh({
  isStreamOpen,
  hasStreamedContent,
}: {
  /** A live WebSocket subscription for the viewed conversation is open */
  isStreamOpen: boolean;
  /** That subscription has actually delivered chunk/thinking/tool events */
  hasStreamedContent: boolean;
}): boolean {
  return !(isStreamOpen && hasStreamedContent);
}

/**
 * Refresh the viewed conversation from its stored snapshot unless a live
 * stream owns the messages — asked before the fetch AND again when it
 * resolves. The change event that triggers a refresh is often the turn
 * starting, so a stream can take over while the fetch is in flight; the
 * older snapshot would then overwrite what the stream already rendered and
 * leave its chunks patching the wrong bubble.
 */
export async function refreshUnlessStreamOwned<T>({
  isStreamOwned,
  fetchSnapshot,
  applySnapshot,
}: {
  isStreamOwned: () => boolean;
  fetchSnapshot: () => Promise<T>;
  applySnapshot: (_snapshot: T) => void;
}): Promise<"applied" | "skipped" | "superseded"> {
  if (isStreamOwned()) return "skipped";
  const snapshot = await fetchSnapshot();
  if (isStreamOwned()) return "superseded";
  applySnapshot(snapshot);
  return "applied";
}

/**
 * Seed the stream's text/thinking accumulators when the subscription opens.
 *
 * Seed ONLY from a TRAILING assistant message (joining a generation already
 * mid-stream, where the trailing bubble is the in-flight one). Seeding from
 * an earlier assistant message — e.g. when the trailing message is the
 * user's new prompt — would prepend the previous completed reply to the new
 * turn's chunks and corrupt that bubble.
 */
export function seedStreamAccumulators(
  messages: Array<{ role?: string; content?: unknown; thinking?: unknown }>,
): { streamedText: string; streamedThinking: string } {
  const trailingMessage = messages[messages.length - 1];
  if (trailingMessage?.role !== "assistant") {
    return { streamedText: "", streamedThinking: "" };
  }
  return {
    streamedText:
      typeof trailingMessage.content === "string" ? trailingMessage.content : "",
    streamedThinking:
      typeof trailingMessage.thinking === "string"
        ? trailingMessage.thinking
        : "",
  };
}

/**
 * Read the persisted context budget off a conversation document, or null
 * when absent — single accessor so every hydration site (normal load,
 * admin select, admin refresh) agrees on the field.
 */
export function extractPersistedContextBudget(
  conversationDocument: unknown,
): ContextBudget | null {
  const budget = (conversationDocument as Record<string, unknown> | null)
    ?.contextBudget as ContextBudget | null | undefined;
  return budget ?? null;
}
