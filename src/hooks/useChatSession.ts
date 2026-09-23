"use client";

/**
 * The agent chat's session: which conversation is on screen, how the
 * current turn is driven, and the refs the transports and the change
 * stream coordinate through. The transcript itself is useAgentConversation's.
 *
 * Refs mirror the ids so long-lived callbacks (a stream, the change-stream
 * subscription) read the CURRENT conversation without re-subscribing.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
import { PRISM_WEBSOCKET_URL } from "@/config";
import type { LiveSocketState } from "../services/liveViewerSocket";
import type { ConversationStats, ForkLineage } from "../types/types";
import type { AgentConversationState } from "../utils/agentConversationReducer";

/**
 * A conversation the user switched away from while its turn was streaming:
 * its conversation state (the SSE keeps it current in the background) and
 * the settings it ran with, restored when they switch back.
 */
export interface ConversationSnapshot {
  conversation: AgentConversationState;
  title: string;
  settings: Record<string, unknown>;
  backendConversationStats: ConversationStats | null;
  isBackendStatsStale?: boolean;
  workspaceRoot: string | null;
  disabledTools: string[];
}

export function defaultConversationTitle(isNoAgent: boolean): string {
  return isNoAgent ? "Agentless Chat" : "Agent";
}

export default function useChatSession(isNoAgent: boolean) {
  const [conversationId, setConversationId] = useState(() => generateUUID());
  const [traceId, setTraceId] = useState<string | null>(() => generateUUID());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState(() => defaultConversationTitle(isNoAgent));
  /** Where this conversation was forked from — shown in the header. */
  const [forkedFrom, setForkedFrom] = useState<ForkLineage | null>(null);
  const [isUserExplicitlyStopped, setIsUserExplicitlyStopped] = useState(false);
  // Date.now() when the user sent the turn in progress.
  const [currentTurnStart, setCurrentTurnStart] = useState<number | null>(null);
  const [backendConversationStats, setBackendConversationStats] = useState<ConversationStats | null>(null);
  const [isBackendStatsStale, setIsBackendStatsStale] = useState(false);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);
  // The live event socket (viewer stream or the sender's recovery) — badge
  // and missing-URL banner.
  const [liveConnectionState, setLiveConnectionState] = useState<LiveSocketState>(
    PRISM_WEBSOCKET_URL ? "closed" : "unconfigured",
  );
  // When a loaded conversation references a workspace that isn't currently connected,
  // store the path so the UI can show "workspace not available" instead of looping errors.
  const [unavailableWorkspace, setUnavailableWorkspace] = useState<string | null>(null);

  const conversationIdRef = useRef<string>(conversationId);
  const activeIdRef = useRef<string | null>(activeId);
  const titleRef = useRef<string>(title);
  useLayoutEffect(() => {
    conversationIdRef.current = conversationId;
    activeIdRef.current = activeId;
    titleRef.current = title;
  });

  // Closes the stream of the turn this chat is sending (Stop).
  const abortRef = useRef<(() => void) | null>(null);
  // The conversation whose running generation THIS client initiated via
  // handleSend (its SSE stream is attached and driving `messages`). Tracked
  // by id — a global boolean went stale on conversation switches (it stayed
  // raised after switching away, wrongly blocking the viewer live-stream for
  // every other conversation, and forever if the turn finished off-screen).
  const clientDrivenConversationIdRef = useRef<string | null>(null);
  const isWebSocketStreamingRef = useRef<boolean>(false);
  // True only once the live WebSocket stream has actually delivered content
  // for the viewed conversation. DB-snapshot refreshes are suppressed only
  // then — a silent subscription (e.g. service without direct-viewer
  // broadcast support) must NOT block boundary refreshes.
  const webSocketHasStreamedContentRef = useRef<boolean>(false);
  // Conversation whose partially-streamed content is still sitting in
  // `messages` after a viewer subscription tear-down (effect churn mid-turn).
  // The next subscription for the SAME conversation seeds its accumulators
  // from the trailing bubble to continue it seamlessly; a subscription for
  // any other conversation must NOT seed — the trailing assistant bubble it
  // sees is a COMPLETED reply from the snapshot, and appending the new
  // turn's chunks to it corrupts that bubble.
  const interruptedStreamConversationIdRef = useRef<string | null>(null);
  // Snapshot cache: stores UI state for conversations that are generating in the background
  // so the user can switch back without waiting for backend persistence.
  const backgroundConversationsRef = useRef<Map<string, ConversationSnapshot>>(new Map());

  return {
    conversationId,
    setConversationId,
    traceId,
    setTraceId,
    activeId,
    setActiveId,
    title,
    setTitle,
    forkedFrom,
    setForkedFrom,
    isUserExplicitlyStopped,
    setIsUserExplicitlyStopped,
    currentTurnStart,
    setCurrentTurnStart,
    backendConversationStats,
    setBackendConversationStats,
    isBackendStatsStale,
    setIsBackendStatsStale,
    requestsRefreshKey,
    setRequestsRefreshKey,
    liveConnectionState,
    setLiveConnectionState,
    unavailableWorkspace,
    setUnavailableWorkspace,
    conversationIdRef,
    activeIdRef,
    titleRef,
    abortRef,
    clientDrivenConversationIdRef,
    isWebSocketStreamingRef,
    webSocketHasStreamedContentRef,
    interruptedStreamConversationIdRef,
    backgroundConversationsRef,
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;
