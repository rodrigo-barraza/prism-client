/**
 * Gate predicate for the "live WebSocket stream for viewed sub-agent
 * conversations" effect in ChatConversationComponent.
 *
 * Contract with prism-service: while a sub-agent runs, its
 * agent_conversations document is persisted with isActive:true
 * (SubAgentPersistenceService.registerSubAgent) and flipped to
 * isActive:false on every terminal transition
 * (SubAgentPersistenceService.markSubAgentTerminal, plus the stale-flag
 * sweeps on startup and in BackgroundHousekeepingService). The client's
 * isConversationRunning flag reduces to that persisted isActive for a
 * merely-viewed (not client-driven) conversation, so this predicate is
 * what decides whether switching to a running sub-agent opens the
 * WebSocket subscription that streams its tokens live.
 */
export function shouldOpenSubAgentLiveStream({
  activeConversationId,
  isSubAgentConversation,
  isClientDrivenGeneration,
  isConversationRunning,
  isReadOnlyViewer = false,
}: {
  /** The conversation currently open in the UI, if any */
  activeConversationId: string | null | undefined;
  /** True when the viewed conversation has a parentAgentConversationId */
  isSubAgentConversation: boolean;
  /** True when this client initiated the generation (SSE already attached) */
  isClientDrivenGeneration: boolean;
  /** True when the backend reports the conversation as still doing work */
  isConversationRunning: boolean;
  /**
   * True for pure viewers that never drive generation themselves (the
   * /admin/chat viewer). The service mirrors MAIN-conversation events to
   * direct WebSocket subscribers too (SseUtilities withDirectViewerBroadcast),
   * so a read-only viewer streams any running conversation — not only
   * sub-agents.
   */
  isReadOnlyViewer?: boolean;
}): boolean {
  if (!activeConversationId) return false;
  if (!isSubAgentConversation && !isReadOnlyViewer) return false;
  if (isClientDrivenGeneration) return false;
  return isConversationRunning;
}
