"use client";

/**
 * Keeping the conversation on screen current while something other than
 * this chat's own send changes it:
 *
 * - the viewer socket, for a conversation running elsewhere (a sub-agent,
 *   another tab or device, a scheduled run) — its events go through the same
 *   reducer as the SSE this chat drives, only the turn's lifecycle is its own;
 * - the change stream (document writes, "needs you" counts), a visible tab
 *   coming back, and the polls for work that outlives a stream (background
 *   tasks, sub-agents, a viewed sub-agent's live status).
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import PrismService from "../services/PrismService";
import IrisService, { type IrisCollectionChangeEvent } from "../services/IrisService";
import { watchConversation } from "../services/agentStream";
import { shouldOpenViewerLiveStream } from "../utils/viewerLiveStreamGate";
import { applyServerSubAgentStatuses } from "../utils/subAgentActivity";
import { ATTENTION_CHANGE_COLLECTION, applyAttentionChange, countNeedsYou } from "../utils/conversationAttention";
import { useNeedsYouTabTitle } from "./useNeedsYouTabTitle";
import type { ClientMessage } from "../utils/agentConversationReducer";
import type { LiveConversationStatus, TurnEvent } from "../types/types";
import type { AgentConversation as AgentConversationHook } from "./useAgentConversation";
import type { ChatSession } from "./useChatSession";
import type { ConversationList } from "./useConversationList";
import type { ChatSidebar } from "./useChatSidebar";
import type { ChatTurns } from "./useChatTurns";
import type { ConversationSwitching } from "./useConversationSwitching";
import type { AgentChatAdmin } from "./useAgentChatAdmin";

/** Events that write the transcript: a viewer stream that delivers one owns `messages` until done. */
const STREAM_CONTENT_EVENT_TYPES: ReadonlySet<TurnEvent["type"]> = new Set([
  "user_message",
  "turn_input",
  "chunk",
  "thinking",
  "tool_execution",
  "toolCall",
  "image",
  "audio",
  "task_notification",
]);

interface UseLiveConversationSyncOptions {
  isAdmin: boolean;
  isNoAgent: boolean;
  agentProject: string | undefined;
  conversation: AgentConversationHook;
  session: ChatSession;
  list: ConversationList;
  sidebar: ChatSidebar;
  turns: ChatTurns;
  switching: ConversationSwitching;
  admin: AgentChatAdmin;
  /** The conversation is still doing work (see the chat's isConversationRunning). */
  isConversationRunning: boolean;
  addToast: (_message: React.ReactNode, _type?: string, _duration?: number) => number;
}

export default function useLiveConversationSync({
  isAdmin,
  isNoAgent,
  agentProject,
  conversation,
  session,
  list,
  sidebar,
  turns,
  switching,
  admin,
  isConversationRunning,
  addToast,
}: UseLiveConversationSyncOptions) {
  const {
    state: { isGenerating },
    dispatch: dispatchConversation,
    ingest: ingestConversationEvent,
    setMessages,
    setIsGenerating,
    setSubAgentToolActivity,
    setAgenticProgress,
    setStatusBarInitialElapsedMilliseconds,
  } = conversation;
  const {
    activeId,
    conversationIdRef,
    clientDrivenConversationIdRef,
    isWebSocketStreamingRef,
    webSocketHasStreamedContentRef,
    interruptedStreamConversationIdRef,
    setLiveConnectionState,
  } = session;
  const {
    conversations,
    setConversations,
    loadConversations,
    generatingConversationIds,
    pendingBackgroundTaskCount,
    isActiveConversationSubAgent,
  } = list;
  const { setSubAgentCounts } = sidebar;
  const { runConversationEffectRef } = turns;
  const { applyConversationData, refreshActiveConversation } = switching;

  // "(N) Prism" while N of the user's conversations wait on them.
  useNeedsYouTabTitle(countNeedsYou(conversations), !isAdmin);

  // Poll for pendingBackgroundTasks resolution when the SSE stream has closed
  // but the conversation still has outstanding background tasks. The backend
  // emits a WebSocket event when tasks complete, but the client has no
  // persistent WebSocket listener — so we poll until the counter resolves.
  useEffect(() => {
    if (!activeId || isGenerating || pendingBackgroundTaskCount <= 0) return;

    const backgroundTaskPollInterval = setInterval(async () => {
      try {
        // Status-only fetch — polling the full conversation document shipped
        // the entire displayMessages payload every 3s for a two-field check.
        const freshStatus = await PrismService.getConversationStatus(activeId);
        const freshPendingCount = freshStatus?.pendingBackgroundTasks ?? 0;
        const freshIsActive = freshStatus?.isActive;
        setConversations((previousConversations) =>
          previousConversations.map((entry) => {
            if (entry.id !== activeId) return entry;
            return {
              ...entry,
              pendingBackgroundTasks: freshPendingCount,
              ...(freshIsActive !== undefined ? { isActive: freshIsActive } : {}),
            } as typeof entry;
          }),
        );
        if (freshPendingCount <= 0) {
          clearInterval(backgroundTaskPollInterval);
        }
      } catch {
        // Non-critical polling — silently ignore network failures
      }
    }, 3000);

    return () => clearInterval(backgroundTaskPollInterval);
  }, [activeId, isGenerating, pendingBackgroundTaskCount, setConversations]);

  // Poll sub-agent status when the parent SSE stream has closed (non-blocking
  // dispatch) but sub-agents are still running in the background. The SSE
  // stream is the primary delivery channel for live sub-agent events, but it
  // closes when the parent generation ends. Without this poll, the StatusBar
  // inside the tool call block would remain stuck on the hydrated state.
  // Keyed on THIS client's stream, not isGenerating: the viewer WebSocket
  // that opens for the still-active conversation raises isGenerating too,
  // and does not carry sub-agent events.
  const isDrivingActiveStream = !!activeId && generatingConversationIds.has(activeId);
  useEffect(() => {
    if (!activeId || isDrivingActiveStream || pendingBackgroundTaskCount <= 0) return;

    const subAgentStatusPollInterval = setInterval(async () => {
      try {
        const result = await PrismService.getCoordinatorSubAgents(activeId);
        const subAgentsList = result.subAgents || [];
        setSubAgentCounts(subAgentsList);
        // Always update from the backend during background polling —
        // this client's SSE stream is closed, so no live data conflicts.
        setSubAgentToolActivity((previousSubAgentToolActivity) =>
          applyServerSubAgentStatuses(previousSubAgentToolActivity, subAgentsList),
        );
      } catch {
        // Non-critical polling — silently ignore network failures
      }
    }, 3000);

    return () => clearInterval(subAgentStatusPollInterval);
  }, [activeId, isDrivingActiveStream, pendingBackgroundTaskCount, setSubAgentToolActivity, setSubAgentCounts]);

  useEffect(() => {
    if (isAdmin) return;
    let listRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedListRefresh = () => {
      if (listRefreshTimer) clearTimeout(listRefreshTimer);
      listRefreshTimer = setTimeout(() => {
        loadConversations();
      }, 500);
    };

    const onCollectionChange = (event: IrisCollectionChangeEvent) => {
      // "Needs you" counts changed (in-memory on the server, so no
      // document changed): patch the listed conversation in place.
      if (event.collection === ATTENTION_CHANGE_COLLECTION) {
        setConversations((previousConversations) =>
          applyAttentionChange(previousConversations, event),
        );
        return;
      }

      // Handle requests collection events — when a request is
      // inserted/updated for the currently viewed conversation, trigger
      // a full refresh to pick up new messages. This provides immediate
      // message updates at agentic loop iteration boundaries for
      // sub-agent conversations being viewed directly.
      if (event.collection === "requests") {
        if (
          event.conversationId &&
          event.conversationId === conversationIdRef.current
        ) {
          refreshActiveConversation(event.conversationId);
        }
        return;
      }

      if (
        event.collection !== "agent_conversations" &&
        event.collection !== "model_conversations"
      ) {
        return;
      }

      // Active conversation update → refresh its messages in-place
      if (event.id && event.id === conversationIdRef.current) {
        refreshActiveConversation(event.id);
      }

      // New or externally modified conversation → refresh the sidebar list.
      // Inserts always warrant a list refresh; updates for non-active
      // conversations (e.g., title changes from background summarization)
      // also need to propagate to the sidebar.
      if (
        event.operationType === "insert" ||
        (event.id && event.id !== conversationIdRef.current)
      ) {
        debouncedListRefresh();
      }
    };

    const sseSubscription = IrisService.subscribeCollectionChanges({
      onChange: onCollectionChange,
    });

    return () => {
      sseSubscription.close();
      if (listRefreshTimer) clearTimeout(listRefreshTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- admin snapshot read once per conversation change by design
  }, [refreshActiveConversation, loadConversations]);

  // ── Live-status poll for viewed sub-agent conversations ──────────
  // When the user is directly viewing a sub-agent conversation that is
  // still actively running, poll the lightweight in-memory live-status
  // endpoint (no DB query) to keep the StatusBar phase, iteration, and
  // elapsed time indicators updated in real-time. The poll stops when
  // the conversation is no longer active.
  //
  // This is complementary to the change-stream refresh path (which
  // handles full message list updates at iteration boundaries). Between
  // iteration boundaries, the live-status poll ensures the user sees
  // phase transitions (thinking → generating → tool_execution) live.
  useEffect(() => {
    if (!activeId) return;
    if (!isActiveConversationSubAgent) return;
    // Only poll when the conversation is running but NOT driven by a
    // local SSE stream (which would already be updating state directly),
    // and NOT already being streamed via WebSocket.
    if (
      clientDrivenConversationIdRef.current === activeId ||
      isWebSocketStreamingRef.current
    ) {
      return;
    }
    if (!isConversationRunning) return;

    const SUB_AGENT_LIVE_STATUS_POLL_INTERVAL_MILLISECONDS = 2000;

    const subAgentLiveStatusPollInterval = setInterval(async () => {
      try {
        const liveStatus: LiveConversationStatus | null =
          await PrismService.getConversationLiveStatus(activeId);

        if (!liveStatus) {
          // Conversation is no longer actively generating — do a final
          // full refresh to pick up completed messages, then stop.
          clearInterval(subAgentLiveStatusPollInterval);
          try {
            const finalConversation = isNoAgent
              ? await PrismService.getConversation(activeId)
              : await PrismService.getAgentConversation(activeId, agentProject!);
            if (finalConversation && finalConversation.id === conversationIdRef.current) {
              applyConversationData(finalConversation);
            }
          } catch {
            // Non-critical — the change stream will catch up
          }
          return;
        }

        // Guard: user navigated away while the poll was in flight
        if (activeId !== conversationIdRef.current) return;

        // Update iteration progress
        if (typeof liveStatus.iteration === "number") {
          setAgenticProgress({
            iteration: liveStatus.iteration,
            maxIterations: liveStatus.maxIterations || 0,
          });
        }

        // Update StatusBar elapsed time from the phase start timestamp
        const phaseStartedAt = liveStatus.phaseStartedAt || liveStatus.startedAt;
        if (phaseStartedAt) {
          const elapsedMilliseconds = Date.now() - new Date(phaseStartedAt).getTime();
          setStatusBarInitialElapsedMilliseconds(
            elapsedMilliseconds > 0 ? elapsedMilliseconds : null,
          );
        }

        // Patch the statusPhase on the last assistant message so the
        // StatusBar phase indicator reflects the live backend state.
        if (liveStatus.phase) {
          setMessages((previousMessages) => {
            if (previousMessages.length === 0) return previousMessages;
            const lastMessage = previousMessages[previousMessages.length - 1];
            if (lastMessage?.role !== "assistant") return previousMessages;
            if ((lastMessage as ClientMessage).statusPhase === liveStatus.phase) {
              return previousMessages;
            }
            const updatedMessages = [...previousMessages];
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMessage,
              statusPhase: liveStatus.phase,
            } as ClientMessage;
            return updatedMessages;
          });
        }

        // Hydrate sub-agent activity if this sub-agent itself spawned
        // sub-sub-agents (recursive orchestration)
        if (liveStatus.subAgents && Object.keys(liveStatus.subAgents).length > 0) {
          setSubAgentToolActivity((previousActivity) => {
            const nextActivity = { ...previousActivity };
            let hasChanges = false;
            for (const [subAgentId, subStatus] of Object.entries(liveStatus.subAgents)) {
              const existing = nextActivity[subAgentId];
              if (existing?.phase === subStatus.phase) continue;
              hasChanges = true;
              let initialElapsedMilliseconds = null;
              if (subStatus.startedAt) {
                const elapsed = Date.now() - new Date(subStatus.startedAt).getTime();
                initialElapsedMilliseconds = elapsed > 0 ? elapsed : null;
              }
              nextActivity[subAgentId] = {
                ...existing,
                phase: subStatus.phase,
                status: subStatus.label || undefined,
                conversationId: subStatus.conversationId || undefined,
                initialElapsedMilliseconds,
              };
            }
            return hasChanges ? nextActivity : previousActivity;
          });
        }
      } catch {
        // Non-critical polling — silently ignore network failures
      }
    }, SUB_AGENT_LIVE_STATUS_POLL_INTERVAL_MILLISECONDS);

    return () => clearInterval(subAgentLiveStatusPollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
  }, [
    activeId,
    isActiveConversationSubAgent,
    isConversationRunning,
    isNoAgent,
    agentProject,
    applyConversationData,
    setMessages,
    setSubAgentToolActivity,
    setAgenticProgress,
    setStatusBarInitialElapsedMilliseconds,
  ]);

  // ── Live WebSocket stream for viewed conversations ────────────────
  // When the user opens or switches into ANY conversation that is running
  // and not driven by this client — a sub-agent, another device, another
  // user's turn, a lupos/scheduled generation — open a WebSocket
  // subscription to receive the raw SSE events (user_message, chunk,
  // thinking, tool_execution, tool_output, status, done) its generation
  // emits. The service replays the active turn's buffered events on
  // subscribe (LiveTurnBuffer), so a mid-turn join renders everything
  // generated so far, then streams live from there.
  //
  // The backend mirrors main-conversation events to direct subscribers via
  // withDirectViewerBroadcast and sub-agent events via
  // SubAgentTelemetryEmitter, both keyed by the conversation's own id in
  // WebSocketConnectionRegistry.
  // Admin's subscription is always-on for the viewed conversation, so its
  // gate must not depend on the (change-stream-lagged) running flag — a
  // constant here keeps the effect from tearing the socket down mid-turn
  // every time the persisted flag flips.
  const liveStreamConversationRunning = isAdmin ? false : isConversationRunning;

  // Ref mirrors so the subscription effect below does NOT depend on these
  // identities. applyConversationData / adminRefreshSelectedEntry are
  // recreated whenever their own inputs shift (workspaces, tool-toggle
  // callbacks), which happens repeatedly DURING a viewed generation — with
  // them in the dep array the WebSocket was torn down and reopened every
  // couple of seconds, dying before the turn's chunks could arrive, so
  // viewers only ever saw the finalize snapshot. Synced after each commit.
  const applyConversationDataRef = useRef(applyConversationData);
  const addToastRef = useRef(addToast);
  const adminRefreshSelectedEntryRef = useRef(admin.refreshSelectedEntry);
  const agentProjectRef = useRef(agentProject);
  useLayoutEffect(() => {
    applyConversationDataRef.current = applyConversationData;
    addToastRef.current = addToast;
    adminRefreshSelectedEntryRef.current = admin.refreshSelectedEntry;
    agentProjectRef.current = agentProject;
  });
  const adminSelectedSourceRef = admin.selectedSourceRef;

  useEffect(() => {
    if (!activeId) return;
    if (
      !shouldOpenViewerLiveStream({
        activeConversationId: activeId,
        isClientDrivenGeneration:
          clientDrivenConversationIdRef.current === activeId,
        isConversationRunning: liveStreamConversationRunning,
        // The admin viewer never drives generation — it live-streams ANY
        // conversation (the service mirrors main-conversation events to
        // direct WebSocket subscribers too), and stays subscribed while
        // viewing so turn-start events are never missed.
        isReadOnlyViewer: isAdmin,
      })
    ) {
      return;
    }

    // Coordination with other effects and the change-stream guard
    isWebSocketStreamingRef.current = true;
    webSocketHasStreamedContentRef.current = false;

    // The stream continues the trailing bubble ONLY when this subscription
    // resumes one the previous subscription for the SAME conversation left
    // mid-turn (effect churn): that bubble holds its partial text. On a
    // fresh join the trailing assistant bubble is a COMPLETED reply from
    // the snapshot, and the stream opens its own. The service replays the
    // active turn's buffered events on subscribe, so a fresh mid-turn join
    // still renders everything generated so far.
    const isContinuationOfInterruptedStream =
      interruptedStreamConversationIdRef.current === activeId;
    interruptedStreamConversationIdRef.current = null;
    dispatchConversation({ type: "stream/attached", continuation: isContinuationOfInterruptedStream });
    let isSubscriptionActive = true;

    // Non-admin (viewed conversation): the gate guarantees a generation is
    // running, so show the active state immediately. Admin: the always-on
    // subscription is mostly idle — the flag raises lazily when events
    // actually arrive (markStreamDelivering) and clears on done.
    if (!isAdmin) setIsGenerating(true);

    // Content just arrived — this stream owns `messages` until done.
    // Re-raised per event so ownership recovers on every subsequent turn
    // of an always-on admin subscription.
    const markStreamDelivering = () => {
      isWebSocketStreamingRef.current = true;
      webSocketHasStreamedContentRef.current = true;
      setIsGenerating(true);
    };

    // Capture for the cleanup's final canonical refresh (admin viewer)
    const streamedConversationId = activeId;
    const streamedAdminSource = adminSelectedSourceRef.current;

    // The viewed turn ended: land on the stored document, which carries
    // everything the stream did not (usage, cost, the canonical order).
    const endViewedTurn = () => {
      setIsGenerating(false);
      isWebSocketStreamingRef.current = false;
      // Release `messages` ownership so snapshot refreshes flow again
      // between turns of an always-on (admin) subscription.
      webSocketHasStreamedContentRef.current = false;
      // The refreshed trailing bubble is not stream-written — the next
      // turn's chunks must open a fresh bubble.
      dispatchConversation({ type: "stream/released" });

      // The admin viewer reads cross-user documents through the admin
      // fetchers — the username-scoped PrismService endpoints would miss
      // another user's conversation entirely.
      if (isAdmin) {
        adminRefreshSelectedEntryRef.current(activeId, adminSelectedSourceRef.current);
        return;
      }
      (async () => {
        try {
          const finalConversation = isNoAgent
            ? await PrismService.getConversation(activeId)
            : await PrismService.getAgentConversation(activeId, agentProjectRef.current!);
          if (finalConversation && finalConversation.id === conversationIdRef.current) {
            applyConversationDataRef.current(finalConversation);
          }
        } catch {
          // Non-critical — the change stream will catch up
        }
      })();
    };

    // The viewer's events go through the same reducer as the SSE this chat
    // drives (useAgentConversation) — only the turn's lifecycle is its own.
    const stream = watchConversation(activeId);
    void (async () => {
      for await (const item of stream) {
        if (!isSubscriptionActive) break;
        if (item.kind === "connection") {
          setLiveConnectionState(item.state);
        } else if (item.kind === "subscribed") {
          const { droppedCount } = item.info;
          if (item.info.truncated) {
            addToastRef.current(
              `Earlier output truncated — ${droppedCount} event${droppedCount === 1 ? "" : "s"} could not be replayed`,
              "info",
            );
          }
        } else if (item.kind === "turn-lost") {
          // The service restarted while the socket was down: the turn is gone.
          endViewedTurn();
        } else {
          const event = item.event;
          if (STREAM_CONTENT_EVENT_TYPES.has(event.type)) markStreamDelivering();
          try {
            for (const effect of ingestConversationEvent(event, activeId)) {
              runConversationEffectRef.current(effect);
            }
          } catch (handlingError: unknown) {
            console.warn(`[viewer stream] could not apply "${event.type}":`, handlingError);
          }
          if (event.type === "done") {
            endViewedTurn();
          } else if (event.type === "error") {
            // Fall back to change-stream updates
            setIsGenerating(false);
            isWebSocketStreamingRef.current = false;
          }
        }
      }
    })();

    return () => {
      isSubscriptionActive = false;
      stream.close();
      setLiveConnectionState((state) => (state === "unconfigured" ? state : "closed"));
      const hadStreamedContent = webSocketHasStreamedContentRef.current;
      isWebSocketStreamingRef.current = false;
      webSocketHasStreamedContentRef.current = false;
      setIsGenerating(false);
      // Torn down mid-turn with partial streamed content in `messages`?
      // Remember the conversation so an immediate re-subscription for it
      // (effect churn) continues the bubble.
      interruptedStreamConversationIdRef.current = hadStreamedContent
        ? streamedConversationId
        : null;
      // Admin viewer: always land on the canonical DB state once the live
      // stream closes (gate closed / selection changed). Without this, a
      // subscription that streamed partial content — or suppressed a
      // boundary refresh — would leave the viewer stale until manual reload.
      if (isAdmin && hadStreamedContent) {
        adminRefreshSelectedEntryRef.current(streamedConversationId, streamedAdminSource);
      }
    };
    // applyConversationData / adminRefreshSelectedEntry / agentProject are
    // read through ref mirrors above — including them here churned the
    // subscription mid-turn (see comment on the refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
  }, [
    activeId,
    liveStreamConversationRunning,
    isNoAgent,
    isAdmin,
    dispatchConversation,
    ingestConversationEvent,
    setIsGenerating,
  ]);

  // -- Visibility Recovery (Mobile Screen Lock) -------------------
  // When the user returns to the tab after the browser suspended it
  // (mobile screen lock, tab backgrounding), immediately re-fetch the
  // active conversation from the database. The backend continues
  // processing agentic loops after SSE disconnect, so the DB will
  // have the latest state including any completed assistant messages.
  useEffect(() => {
    const handleVisibilityRecovery = () => {
      if (document.visibilityState !== "visible") return;

      const activeConversationId = conversationIdRef.current;
      if (!activeConversationId) return;

      // Only run recovery for agentic conversations
      if (isNoAgent) return;

      console.debug(
        `[visibilityRecovery] Tab became visible — refreshing conversation ${activeConversationId}`,
      );

      refreshActiveConversation(activeConversationId);
    };

    document.addEventListener("visibilitychange", handleVisibilityRecovery);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityRecovery);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
  }, [refreshActiveConversation, isNoAgent]);
}
