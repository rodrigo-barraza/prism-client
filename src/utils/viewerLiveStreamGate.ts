/**
 * Gate predicate for the "live WebSocket stream for viewed conversations"
 * effect in AgentChatComponent.
 *
 * Contract with prism-service: while ANY conversation generates, its
 * document is persisted with isActive:true (ConversationService.
 * setGenerating for main conversations, SubAgentPersistenceService for
 * sub-agents) and flipped back on every terminal transition (finalize,
 * markSubAgentTerminal, plus the stale-flag sweeps on startup and in
 * BackgroundHousekeepingService). The client's isConversationRunning flag
 * reduces to that persisted isActive for a merely-viewed (not client-
 * driven) conversation, so this predicate is what decides whether opening
 * or switching into a running conversation attaches the WebSocket
 * subscription that streams its events live. The service replays the
 * active turn's buffered events on subscribe (LiveTurnBuffer), so a
 * mid-turn join renders everything generated so far, not just the tail.
 *
 * ANY running conversation a client is not itself driving streams — main
 * conversations (another device, another user, lupos, scheduled runs) and
 * sub-agent conversations alike.
 */
export function shouldOpenViewerLiveStream({
  activeConversationId,
  isClientDrivenGeneration,
  isConversationRunning,
  isReadOnlyViewer = false,
}: {
  /** The conversation currently open in the UI, if any */
  activeConversationId: string | null | undefined;
  /**
   * True when THIS client initiated the viewed conversation's running
   * generation (its SSE stream is already attached and driving state) —
   * a second live channel would double-apply every event.
   */
  isClientDrivenGeneration: boolean;
  /** True when the backend reports the conversation as still doing work */
  isConversationRunning: boolean;
  /**
   * True for pure viewers that never drive generation themselves (the
   * /admin/chat viewer). The subscription stays open for the WHOLE viewing
   * session: waiting for the persisted running flag would race the
   * turn-start events (the user_message mirror and the first chunks land
   * before the change-stream refresh can flip the flag).
   */
  isReadOnlyViewer?: boolean;
}): boolean {
  if (!activeConversationId) return false;
  if (isClientDrivenGeneration) return false;
  if (isReadOnlyViewer) return true;
  return isConversationRunning;
}
