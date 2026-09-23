"use client";

/**
 * The turns this chat sends: the composer's send (a new turn, a queued
 * one, or an update steering the running turn), Stop, and the turn's stream.
 *
 * - `runConversationEffect` runs one side effect of a turn event
 *   (utils/agentConversationEffects), from any transport.
 * - `routeTurnEvent` sends an event to the chat, or into the background
 *   snapshot of a conversation the user switched away from mid-turn.
 * - `driveTurnStream` follows the SSE of a sent turn.
 * - `handleSend` sends; after `done` it lands the stored turn once — the
 *   service persists a turn before it emits `done`, so nothing polls.
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import SoundService from "../services/SoundService";
import { followTurn, openTurnStream, StreamClosedError, type AgentStream } from "../services/agentStream";
import { cacheToolEmoji } from "../components/WorkflowNodeConstantsComponent";
import type { ChatTranscriptHandle } from "../components/ChatTranscriptComponent";
import type { ComposerHandle } from "../components/ComposerComponent";
import type { PendingFileAttachment } from "../components/MessageListComponent";
import {
  createAgentConversationState,
  eventClockNow,
  reduceEvent,
  type ClientMessage,
} from "../utils/agentConversationReducer";
import { effectsOfEvent, runsWhileHidden, type AgentConversationEffect } from "../utils/agentConversationEffects";
import { buildTurnPayload } from "../utils/agentTurnPayload";
import { applyServerSubAgentStatuses } from "../utils/subAgentActivity";
import { resolveDisplayMessages } from "../utils/messageHelpers";
import { documentHasSentTurn } from "../utils/liveConversationView";
import { appendMcpResourceContext } from "../utils/mcpComposer";
import { getErrorMessage } from "../utils/errorMessage";
import {
  attachTurnInputServerId,
  buildOptimisticTurnInputMessage,
  decideComposerAction,
  insertTurnInputMessage,
  removeTurnInputMessage,
  resolveTurnInputOutcome,
  type TurnInputOutcome,
} from "../utils/turnInputRouting";
import {
  EVENT_NAME_CRON_JOB_SCHEDULED,
  LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT,
  MESSAGE_ROLES,
} from "../constants";
import type { ReportUrlChange } from "../utils/chatUrlChange";
import { StreamError, type AgentConversation, type FileAttachment, type Rule, type TurnEvent } from "../types/types";
import type { AgentConversation as AgentConversationHook } from "./useAgentConversation";
import type { ChatSession } from "./useChatSession";
import type { ConversationList } from "./useConversationList";
import type { ChatModelSettings } from "./useChatModelSettings";
import type { AgentToolset } from "./useAgentToolset";
import type { ChatAgentControls } from "./useChatAgentControls";
import type { ChatSidebar } from "./useChatSidebar";
import type { FileViewerTabs } from "./useFileViewerTabs";
import type { ConversationGoalApi } from "./useConversationGoal";
import type { BudgetPauseApi } from "./useBudgetPause";
import type { NonBlockingQuestionsApi } from "./useNonBlockingQuestions";
import type { QueuedTurnPayload } from "./useNextTurnQueue";
import type { PermissionModeApi } from "./usePermissionMode";

// -- Attachment guardrails ---------------------------------------
// Aggregate cap on inline message content (text + base64 image data
// URLs) — several borderline-sized images can jointly exceed the
// service's 50MB JSON limit even though each passed the per-image gate.
export const MAX_INLINE_PAYLOAD_BYTES = 45 * 1024 * 1024;

export function formatByteLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/** The state a stream's effects are read against when it has no conversation on screen or in the background. */
const EMPTY_CONVERSATION_STATE = createAgentConversationState();

/** What a send carries when it is not the composer's draft (a queued turn, an edit, a rerun). */
export interface TurnPayloadOverride {
  text: string;
  images: string[];
  files?: PendingFileAttachment[];
  /** Already in MinIO — an edited or rerun message's own attachments. */
  uploadedFiles?: FileAttachment[];
}

export interface SendOptions {
  isQueueing?: boolean;
  /** Steer the running turn (`/agent/input`) instead of queueing. */
  isTurnInput?: boolean;
  overridePayload?: TurnPayloadOverride | null;
}

interface UseChatTurnsOptions {
  isAdmin: boolean;
  isNoAgent: boolean;
  agentId: string;
  agentProject: string | undefined;
  conversation: AgentConversationHook;
  session: ChatSession;
  list: ConversationList;
  model: ChatModelSettings;
  toolset: AgentToolset;
  controls: ChatAgentControls;
  sidebar: ChatSidebar;
  fileViewer: FileViewerTabs;
  rules: Rule[];
  permissionMode: string;
  applyPermissionModeEvent: PermissionModeApi["applyEvent"];
  goal: Pick<ConversationGoalApi, "applyEvent">;
  budgetPause: Pick<BudgetPauseApi, "applyStatus" | "clear">;
  nonBlockingQuestions: Pick<NonBlockingQuestionsApi, "open">;
  enqueueNextTurn: (_payload: QueuedTurnPayload) => void;
  composerRef: React.RefObject<ComposerHandle | null>;
  transcriptRef: React.RefObject<ChatTranscriptHandle | null>;
  /** Client stream, the backend's running flag or background tasks — Send is Stop. */
  isConversationRunning: boolean;
  addToast: (_message: React.ReactNode, _type?: string, _duration?: number) => number;
  reportUrlChange: ReportUrlChange;
}

export default function useChatTurns({
  isAdmin,
  isNoAgent,
  agentId,
  agentProject,
  conversation,
  session,
  list,
  model,
  toolset,
  controls,
  sidebar,
  fileViewer,
  rules,
  permissionMode,
  applyPermissionModeEvent,
  goal,
  budgetPause,
  nonBlockingQuestions,
  enqueueNextTurn,
  composerRef,
  transcriptRef,
  isConversationRunning,
  addToast,
  reportUrlChange,
}: UseChatTurnsOptions) {
  const {
    dispatch: dispatchConversation,
    getState: getConversationState,
    ingest: ingestConversationEvent,
    setMessages,
    setIsGenerating,
    setSubAgentToolActivity,
  } = conversation;
  const {
    conversationId,
    traceId,
    conversationIdRef,
    titleRef,
    abortRef,
    clientDrivenConversationIdRef,
    backgroundConversationsRef,
    setTitle,
    setActiveId,
    setIsUserExplicitlyStopped,
    setCurrentTurnStart,
    setIsBackendStatsStale,
    setBackendConversationStats,
    setRequestsRefreshKey,
    setLiveConnectionState,
  } = session;
  const { setConversations, setGeneratingConversationIds, loadConversations, loadConversationsRef } = list;
  const { settings, setSettings } = model;
  const { disabledTools, lockedOffTools, enableSpecificTools, hasAnyMemoryModelSet } = toolset;
  const {
    markTabNew,
    switchTabTemporarily,
    setLeftTabBottom,
    setTotalMemoriesCount,
    refreshMemories,
    refreshTasks,
    refreshDatastore,
    refreshWorkspaceTree,
  } = sidebar;
  const { onFileTouched } = fileViewer;
  const { applyEvent: applyGoalEvent } = goal;
  const { applyStatus: applyBudgetStatus, clear: clearBudgetPause } = budgetPause;
  const { open: openNonBlockingQuestion } = nonBlockingQuestions;

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsUserExplicitlyStopped(true);
    // The conversation side: not generating, no plan card, the in-flight
    // bubble stops its live metrics (TTFT badge, tok/s), and every sub-agent
    // bar stops — their terminal events will not arrive on an aborted stream.
    dispatchConversation({ type: "turn/stopped", clock: eventClockNow() });
    clearBudgetPause();

    // Explicitly stop the backend agentic session — decoupled from
    // SSE connection lifecycle so mobile browser disconnections don't
    // abort background processing. Only this explicit call does.
    if (!isNoAgent) {
      PrismService.stopGeneration(conversationIdRef.current).catch(() => {});
    }

    // Immediately stop the elapsed-time ticker (StopwatchBadgeComponent)
    // so the badge freezes on abort instead of continuing until the
    // finally block in handleSend runs.
    setCurrentTurnStart(null);

    // Explicitly abort any running sub-agents for this conversation — belt-and-suspenders
    // alongside the backend SSE disconnect handler
    // Direct Chat (NONE) has no sub-agents — skip.
    if (!isNoAgent) {
      PrismService.stopCoordinatorSubAgents(conversationIdRef.current).catch(
        () => {},
      );
    }

    // Reload the conversation list so isActive / pendingBackgroundTasks
    // refresh and isConversationRunning flips to false once the backend
    // processes the stop request. Use setTimeout to give the backend a
    // brief window to persist the stopped state before we re-fetch.
    setTimeout(() => {
      loadConversationsRef.current?.();
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
  }, [isNoAgent, dispatchConversation, clearBudgetPause]);

  // -- Fetch backend-aggregate conversation stats ----------------
  const fetchConversationStats = useCallback(
    (targetConversationId: string) => {
      if (!targetConversationId) return;
      // Direct Chat: re-fetch the conversation to get the enriched totalCost
      // from the requests collection (background ops like memory extraction,
      // embedding log costs there but don't update the conversation doc).
      if (isNoAgent) {
        setRequestsRefreshKey((previousKey) => previousKey + 1);
        const refetchDirectCost = () =>
          PrismService.getConversation(targetConversationId)
            .then((fetched) => {
              if (fetched?.totalCost != null) {
                setConversations((previousConversations) => {
                  const index = previousConversations.findIndex(
                    (entry) => entry.id === targetConversationId,
                  );
                  if (index === -1) return previousConversations;
                  const existing = previousConversations[index] as unknown as Record<
                    string,
                    unknown
                  >;
                  if (
                    existing.totalCost === fetched.totalCost
                  ) {
                    return previousConversations;
                  }
                  const updated = [
                    ...previousConversations,
                  ] as unknown as Record<string, unknown>[];
                  updated[index] = {
                    ...existing,
                    totalCost: fetched.totalCost,
                  };
                  return updated as unknown as typeof previousConversations;
                });
              }
            })
            .catch(() => {});
        const phaseOneTimeoutId = setTimeout(refetchDirectCost, 2000);
        const phaseTwoTimeoutId = setTimeout(refetchDirectCost, 8000);
        return () => {
          clearTimeout(phaseOneTimeoutId);
          clearTimeout(phaseTwoTimeoutId);
        };
      }
      // Two-phase fetch: first at 2s catches iteration requests,
      // second at 8s catches background requests (memory extraction,
      // embedding) that take longer to flush to the DB.
      const refetch = () =>
        PrismService.getAgentConversation(targetConversationId, agentProject!)
          .then((fetchedConversation) => {
            if (fetchedConversation?.stats) {
              setBackendConversationStats(fetchedConversation.stats);
              setIsBackendStatsStale(false);
              setRequestsRefreshKey((k) => k + 1);
              // Clear incremental background usage from the message —
              // the backend aggregate now includes those requests.
              setMessages((previousMessages) => {
                const last = previousMessages[previousMessages.length - 1];
                if (last?.role === "assistant" && last._backgroundUsage) {
                  const updated = [...previousMessages];
                  updated[updated.length - 1] = {
                    ...last,
                    _backgroundUsage: undefined,
                  };
                  return updated;
                }
                return previousMessages;
              });
            }
          })
          .catch(() => {}); // silently ignore if no requests yet
      const phaseOneTimeoutId = setTimeout(refetch, 2000);
      const phaseTwoTimeoutId = setTimeout(refetch, 8000);
      return () => {
        clearTimeout(phaseOneTimeoutId);
        clearTimeout(phaseTwoTimeoutId);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable setters
    [agentProject, isNoAgent, setMessages],
  );

  // -- Turn streams -----------------------------------------------
  /** Run one side effect of a turn event (utils/agentConversationEffects), from any transport. */
  const runConversationEffect = useCallback(
    (effect: AgentConversationEffect) => {
      const refreshMemoriesCount = () =>
        PrismService.getAgentMemories(agentProject, 1, agentId)
          .then((result) => setTotalMemoriesCount(result.total || 0))
          .catch(() => {
            /* Non-critical background count refresh */
          });
      switch (effect.kind) {
        case "tool-emoji":
          cacheToolEmoji(effect.toolName, effect.emoji);
          break;
        case "refresh-panel":
          if (effect.panel === "tasks") refreshTasks();
          else refreshDatastore();
          break;
        case "cron-job-scheduled": {
          const currentNotificationCount = parseInt(
            localStorage.getItem(LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT) || "0",
            10,
          );
          localStorage.setItem(
            LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT,
            String(currentNotificationCount + 1),
          );
          window.dispatchEvent(new CustomEvent(EVENT_NAME_CRON_JOB_SCHEDULED));
          break;
        }
        case "memory-saved":
          if (hasAnyMemoryModelSet) setLeftTabBottom("memories");
          refreshMemories();
          refreshMemoriesCount();
          break;
        case "workspace-file-touched":
          refreshWorkspaceTree();
          // Live-update the file viewer: tabs whose file was touched.
          onFileTouched(effect.toolName, effect.path);
          break;
        case "toast":
          addToast(effect.message, effect.level);
          break;
        case "enable-tools":
          enableSpecificTools(effect.toolNames);
          break;
        case "tasks-updated":
          // Ephemeral tab switch — show tasks panel then revert after 5s
          switchTabTemporarily("tasks");
          refreshTasks();
          markTabNew("tasks");
          break;
        case "sub-agents-updated":
          // Refresh sub-agents data without switching the active tab
          refreshTasks();
          markTabNew("subAgents");
          break;
        case "memories-updated":
          if (hasAnyMemoryModelSet) {
            // Ephemeral tab switch — show memories panel then revert after 5s
            switchTabTemporarily("memories");
            markTabNew("memories");
          }
          refreshMemories();
          // Re-fetch the count for the tab badge (the panel may not be mounted yet)
          refreshMemoriesCount();
          break;
        case "sub-agent-spawned": {
          // List the sub-agent's conversation right away rather than after
          // the post-completion list reload, with the generating dot.
          const spawnTimestamp = new Date().toISOString();
          setConversations((previousConversations) => {
            // A continuation spawn is already listed
            if (
              previousConversations.some(
                (existing) => (existing.id || String(existing._id)) === effect.conversationId,
              )
            ) {
              return previousConversations;
            }
            return [
              {
                _id: effect.conversationId,
                id: effect.conversationId,
                project: agentProject || "",
                title: effect.description,
                messages: [],
                updatedAt: spawnTimestamp,
                createdAt: spawnTimestamp,
                parentConversationId: effect.parentConversationId,
                isGenerating: true,
                agentIndex: effect.agentIndex,
                ...(effect.model ? { modelNames: [effect.model] } : {}),
                ...(effect.provider ? { providers: [effect.provider] } : {}),
              } as AgentConversation,
              ...previousConversations,
            ];
          });
          setGeneratingConversationIds((previousGeneratingConversationIds) =>
            new Set(previousGeneratingConversationIds).add(effect.conversationId),
          );
          break;
        }
        case "sub-agent-settled":
          // Stop the sidebar dot and resolve the entry to completed now,
          // without waiting for a list reload.
          setGeneratingConversationIds((previousGeneratingConversationIds) => {
            if (!previousGeneratingConversationIds.has(effect.conversationId)) {
              return previousGeneratingConversationIds;
            }
            const next = new Set(previousGeneratingConversationIds);
            next.delete(effect.conversationId);
            return next;
          });
          setConversations((previousConversations) =>
            previousConversations.map((entry) =>
              (entry.id || String(entry._id)) === effect.conversationId
                ? ({ ...entry, isActive: false, isGenerating: false, pendingBackgroundTasks: 0 } as typeof entry)
                : entry,
            ),
          );
          break;
        case "conversation-state":
          // The status bar reads the listed conversation's counter and flag.
          setConversations((previousConversations) =>
            previousConversations.map((entry) =>
              entry.id === effect.conversationId
                ? ({
                    ...entry,
                    pendingBackgroundTasks: effect.pendingBackgroundTasks,
                    ...(effect.isActive !== undefined ? { isActive: effect.isActive } : {}),
                  } as typeof entry)
                : entry,
            ),
          );
          break;
        case "budget-status":
          applyBudgetStatus(effect.event);
          break;
        case "goal":
          applyGoalEvent(effect.event);
          break;
        case "permission-mode":
          applyPermissionModeEvent(effect.event);
          break;
        case "non-blocking-question":
          // A read-only viewer answers nothing.
          if (!isAdmin) openNonBlockingQuestion(effect.event);
          break;
        default:
          effect satisfies never;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable setters and callbacks
    [
      agentProject,
      agentId,
      hasAnyMemoryModelSet,
      addToast,
      enableSpecificTools,
      switchTabTemporarily,
      markTabNew,
      applyGoalEvent,
      applyPermissionModeEvent,
      applyBudgetStatus,
      openNonBlockingQuestion,
      isAdmin,
    ],
  );
  // Streams read the runner through a ref: a stream captures its callbacks
  // once, and what the runner closes over changes mid-turn.
  const runConversationEffectRef = useRef(runConversationEffect);
  useLayoutEffect(() => {
    runConversationEffectRef.current = runConversationEffect;
  }, [runConversationEffect]);

  /**
   * Route one event of `streamConversationId`'s stream: into the chat while
   * that conversation is on screen; into its background snapshot when the
   * user switched away mid-turn, so switching back shows all of it.
   */
  const routeTurnEvent = useCallback(
    (event: TurnEvent, streamConversationId: string) => {
      if (conversationIdRef.current === streamConversationId) {
        for (const effect of ingestConversationEvent(event, streamConversationId)) {
          runConversationEffectRef.current(effect);
        }
        return;
      }
      const snapshot = backgroundConversationsRef.current.get(streamConversationId);
      const before = snapshot?.conversation ?? EMPTY_CONVERSATION_STATE;
      if (snapshot) {
        backgroundConversationsRef.current.set(streamConversationId, {
          ...snapshot,
          conversation: reduceEvent(snapshot.conversation, event, streamConversationId),
        });
      }
      for (const effect of effectsOfEvent(event, before, streamConversationId)) {
        if (runsWhileHidden(effect)) runConversationEffectRef.current(effect);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
    [ingestConversationEvent],
  );

  /** The bookkeeping of a turn this chat sent, once its `done` arrives. */
  const finishSentTurn = useCallback(
    (streamConversationId: string) => {
      if (conversationIdRef.current === streamConversationId) {
        setCurrentTurnStart(null);
        fetchConversationStats(streamConversationId);
        // `done` definitively means the service finished: settle the listed
        // conversation now rather than after the list reload's round trip.
        setConversations((previousConversations) =>
          previousConversations.map((entry) =>
            entry.id === streamConversationId
              ? ({ ...entry, pendingBackgroundTasks: 0, isActive: false } as typeof entry)
              : entry,
          ),
        );
      }
      // The conversation summarizer runs after the stream closes — poll
      // every 2s for up to 20s until new memories show up.
      (async () => {
        const baselineCount = await PrismService.getAgentMemories(agentProject, 1, agentId)
          .then((result) => result.total || 0)
          .catch(() => 0);
        let pollAttempts = 0;
        const pollInterval = setInterval(async () => {
          pollAttempts++;
          try {
            const { total } = await PrismService.getAgentMemories(agentProject, 1, agentId);
            if (total > baselineCount) {
              clearInterval(pollInterval);
              refreshMemories();
            }
          } catch {
            /* Non-critical background poll */
          }
          if (pollAttempts >= 10) clearInterval(pollInterval);
        }, 2000);
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
    [agentProject, agentId, fetchConversationStats],
  );

  /**
   * Drive the SSE of a turn this chat sent. Resolves "done" at the turn's
   * `done` — the stream keeps delivering what follows it (goal updates, hook
   * messages) — and "stopped" when the user's Stop closed it. Rejects with
   * the turn's `error` event (a StreamError) or the transport's failure.
   */
  const driveTurnStream = useCallback(
    (stream: AgentStream, streamConversationId: string) =>
      new Promise<"done" | "stopped">((resolve, reject) => {
        let isSettled = false;
        const settle = (outcome: () => void) => {
          if (isSettled) return;
          isSettled = true;
          outcome();
        };
        void (async () => {
          try {
            for await (const item of stream) {
              if (item.kind !== "event") continue;
              const event = item.event;
              try {
                routeTurnEvent(event, streamConversationId);
              } catch (handlingError: unknown) {
                // One bad event must not end the turn for everything after it.
                console.warn(`[driveTurnStream] could not apply "${event.type}":`, handlingError);
              }
              if (event.type === "done") {
                finishSentTurn(streamConversationId);
                settle(() => resolve("done"));
              } else if (event.type === "error") {
                settle(() => reject(new StreamError(event)));
              }
            }
            settle(() => resolve("stopped"));
          } catch (streamError: unknown) {
            console.error(`[driveTurnStream] stream error:`, streamError);
            settle(() => reject(streamError));
          }
        })();
      }),
    [routeTurnEvent, finishSentTurn],
  );

  // -- Orchestration loop ---------------------------------------
  const runOrchestrationLoop = useCallback(
    async (
      conversationMessages: ClientMessage[],
      activeRuleNames: string[] = [],
    ): Promise<"done" | "stopped"> => {
      // The conversation this generation belongs to: if the user switches
      // away, its events keep that conversation's snapshot current instead.
      const generationConversationId = conversationIdRef.current;
      const { path, payload } = buildTurnPayload({
        isNoAgent,
        settings,
        messages: conversationMessages,
        disabledTools: [...disabledTools, ...lockedOffTools.keys()],
        conversationId,
        traceId,
        agentId,
        agentProject,
        activeRuleNames,
        permissionMode,
        planFirst: controls.planFirst,
        maxIterations: controls.maxIterations,
        maxSubAgentIterations: controls.maxSubAgentIterations,
        maxRecursionDepth: controls.maxRecursionDepth,
      });
      // Direct Chat → /chat; Agents → /agent (the agentic loop).
      const stream = openTurnStream(path, payload);
      abortRef.current = () => stream.close();
      return driveTurnStream(stream, generationConversationId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
    [
      settings,
      conversationId,
      traceId,
      disabledTools,
      lockedOffTools,
      permissionMode,
      controls.planFirst,
      controls.maxIterations,
      controls.maxSubAgentIterations,
      controls.maxRecursionDepth,
      agentId,
      isNoAgent,
      agentProject,
      driveTurnStream,
    ],
  );

  /**
   * "Update current task": steer the RUNNING turn through `/agent/input`.
   * Optimistic user bubble (Sending…) → server `inputId` (Pending) → the
   * `turn_input` event marks it Applied at step N. A 409 (no running turn)
   * turns it into the queued-next-turn bubble; a 400 puts the text back.
   */
  const sendTurnInputUpdate = useCallback(
    async (text: string, images: string[]) => {
      const targetConversationId = conversationIdRef.current;
      const tempId = `turn-input-${generateUUID()}`;
      composerRef.current?.clear();
      transcriptRef.current?.stickToBottom();
      setMessages((previousMessages) =>
        insertTurnInputMessage(
          previousMessages,
          buildOptimisticTurnInputMessage({ tempId, text, images }) as ClientMessage,
          "before-trailing-assistant",
        ),
      );

      let outcome: TurnInputOutcome;
      try {
        outcome = resolveTurnInputOutcome(
          await PrismService.sendTurnInput(targetConversationId, text, images),
        );
      } catch (sendError: unknown) {
        outcome = {
          action: "reject",
          toast: `Could not send the update — ${getErrorMessage(sendError)}`,
        };
      }
      // Switched conversations while the request was in flight — the
      // bubble is gone with the old messages; nothing to settle.
      if (conversationIdRef.current !== targetConversationId) return;

      if (outcome.action === "pending") {
        const serverInputId = outcome.inputId;
        setMessages((previousMessages) =>
          attachTurnInputServerId(previousMessages, tempId, serverInputId),
        );
        return;
      }
      setMessages((previousMessages) => removeTurnInputMessage(previousMessages, tempId));
      if (outcome.action === "queue") {
        enqueueNextTurn({ text, images, files: [] });
        addToast(outcome.toast, "info");
        return;
      }
      composerRef.current?.restore({ text, images, files: [] });
      addToast(outcome.toast, "warning");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
    [addToast, enqueueNextTurn, setMessages],
  );

  const handleSend = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement> | null,
      fetchOptions: SendOptions = {},
    ) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();

      const { isQueueing = false, isTurnInput = false, overridePayload = null } = fetchOptions;

      if (isConversationRunning && !isQueueing && !isTurnInput && !overridePayload) {
        handleStop();
        return;
      }

      const draft = overridePayload ? null : composerRef.current?.readDraft() ?? null;
      const text = overridePayload ? overridePayload.text : (draft?.text ?? "");
      const currentImages = overridePayload ? overridePayload.images : (draft?.images ?? []);
      const currentFiles = overridePayload ? [...(overridePayload.files ?? [])] : (draft?.files ?? []);
      // `/rule` badges in the composer, read before the send clears it.
      const inlineActiveRuleNames = draft?.ruleNames ?? new Set<string>();

      const alreadyUploadedFiles = overridePayload?.uploadedFiles ?? [];
      if (
        !text &&
        currentImages.length === 0 &&
        currentFiles.length === 0 &&
        alreadyUploadedFiles.length === 0
      ) {
        return;
      }

      // Aggregate inline-payload guard: images ride the /agent body as
      // base64 data URLs, so several borderline-sized images can jointly
      // exceed the service's 50MB JSON limit even though each passed the
      // per-image intake gate. Reject up-front with everything intact
      // instead of letting the body parser 413 with an opaque error.
      const inlineBytes =
        text.length +
        currentImages.reduce((sum, dataUrl) => sum + dataUrl.length, 0);
      if (inlineBytes > MAX_INLINE_PAYLOAD_BYTES) {
        if (overridePayload) {
          // The queued payload already cleared the input when it was
          // queued — put it back so nothing is lost.
          composerRef.current?.restore({ text, images: currentImages, files: currentFiles });
        }
        addToast(
          `Message is too large to send (${formatByteLimit(inlineBytes)} inline) — the limit is ${formatByteLimit(MAX_INLINE_PAYLOAD_BYTES)}. Remove or shrink some images.`,
          "warning",
        );
        return;
      }

      if (isTurnInput) {
        // Files ride MinIO + the next /agent body, never the mailbox.
        const turnInputAction = decideComposerAction({
          isConversationRunning: true,
          mode: "update",
          hasFiles: currentFiles.length > 0,
        });
        if (turnInputAction === "update") {
          await sendTurnInputUpdate(text, currentImages);
          return;
        }
        addToast("Files can't be sent mid-turn — queued for next turn", "info");
        enqueueNextTurn({ text, images: currentImages, files: currentFiles });
        composerRef.current?.clear();
        return;
      }

      if (isQueueing) {
        enqueueNextTurn({ text, images: currentImages, files: currentFiles });
        composerRef.current?.clear();
        return;
      }

      // Upload non-image files to MinIO BEFORE any destructive state
      // changes (clearing the input, optimistic conversation entries) so
      // a failed upload aborts the send with everything still intact —
      // the user keeps their text + attachments and can simply retry.
      let uploadedFileUrls: FileAttachment[] = [...alreadyUploadedFiles];
      if (currentFiles.length > 0) {
        try {
          uploadedFileUrls = [...alreadyUploadedFiles, ...await Promise.all(
            currentFiles.map(async (pendingFile) => {
              const result = await PrismService.uploadFile(pendingFile.dataUrl);
              return {
                url: result.url,
                name: pendingFile.name,
                mimeType: pendingFile.mimeType,
                modality: pendingFile.modality,
                ...(pendingFile.sizeBytes != null
                  ? { sizeBytes: pendingFile.sizeBytes }
                  : {}),
              };
            }),
          )];
        } catch (uploadError) {
          console.error("[handleSend] File upload to MinIO failed:", uploadError);
          if (overridePayload) {
            // The queued payload already cleared the input when it was
            // queued — put it back so nothing is lost.
            composerRef.current?.restore({ text, images: currentImages, files: currentFiles });
          }
          addToast(
            `File upload failed — message not sent. ${getErrorMessage(uploadError)}`,
            "error",
          );
          return;
        }
      }

      if (!overridePayload) {
        composerRef.current?.clear();
      }

      setIsUserExplicitlyStopped(false);
      setIsGenerating(true);
      SoundService.playGenerationStart();
      // Re-engage sticky scroll when the user sends a message
      transcriptRef.current?.stickToBottom();
      // Track this conversation as generating (for history indicator even after switching away)
      const genId = conversationIdRef.current;
      clientDrivenConversationIdRef.current = genId;
      console.debug(
        `[handleSend] starting generation, conversationId=${genId}, currentMessages=${getConversationState().messages.length}`,
      );
      setGeneratingConversationIds((previousGeneratingConversationIds) =>
        new Set(previousGeneratingConversationIds).add(genId),
      );
      // The budget card is its hook's, not the conversation reducer's.
      clearBudgetPause();

      const currentMessages = getConversationState().messages;
      // Optimistic display title only — the persisted title is derived
      // server-side (ChatRoutes) and arrives via the change stream.
      let resolvedTitle = titleRef.current;
      if (currentMessages.length === 0) {
        const titleText =
          text || "New conversation";
        resolvedTitle =
          titleText.length > 60 ? titleText.slice(0, 57) + "..." : titleText;
        setTitle(resolvedTitle);
        // Optimistic: add the conversation to the history list immediately
        const now = new Date().toISOString();
        setActiveId(conversationId);
        reportUrlChange({ kind: "conversation", conversationId });
        // An edit of the first message empties an already-listed
        // conversation — replace its entry rather than adding a second.
        setConversations((previousConversations) => [
          {
            id: conversationId,
            title: resolvedTitle,
            updatedAt: now,
            createdAt: now,
          } as AgentConversation,
          ...previousConversations.filter((entry) => entry.id !== conversationId),
        ]);
      }

      // Optimistically mark the active conversation entry as isActive: true
      // so the status bar doesn't flicker while waiting for the backend's
      // markGenerating(true) to propagate via change stream / list refresh.
      setConversations((previousConversations) =>
        previousConversations.map((entry) =>
          entry.id === genId ? { ...entry, isActive: true } as typeof entry : entry,
        ),
      );

      setCurrentTurnStart(Date.now());
      setIsBackendStatsStale(true);
      // Active rules: extracted from inline badges in the contentEditable
      // DOM. Agent mode sends only the NAMES — SystemPromptAssembler
      // resolves the content server-side into an <active-rules> section.
      // Direct chat (/chat) has no server-side prompt assembly, so the
      // legacy inline wrapping remains for that path only.
      let finalMessageContent = text;
      const turnActiveRuleNames: string[] = [];
      if (inlineActiveRuleNames.size > 0) {
        const enabledRules = rules.filter(
          (rule) => rule.enabled && inlineActiveRuleNames.has(rule.name),
        );
        if (enabledRules.length > 0) {
          if (isNoAgent) {
            const rulesBlock = enabledRules
              .map((rule) => `## /${rule.name}\n${rule.content}`)
              .join("\n\n");
            finalMessageContent = `[Active Rules]\n${rulesBlock}\n\n[User Message]\n${text}`;
          } else {
            turnActiveRuleNames.push(...enabledRules.map((rule) => rule.name));
          }
        }
      }

      // Attach the content of any MCP resources the message @-mentions.
      finalMessageContent = await appendMcpResourceContext(
        finalMessageContent,
        text,
        async (server, uri) => {
          const read = await PrismService.readMCPResource(server, uri);
          return read.content ?? read.contents?.map((entry) => entry.text ?? "").join("\n") ?? null;
        },
      );

      const userMessage = {
        role: MESSAGE_ROLES.USER,
        content: finalMessageContent,
        rawContent: text,
        timestamp: new Date().toISOString(),
        ...(currentImages.length > 0 ? { images: currentImages } : {}),
        ...(uploadedFileUrls.length > 0 ? { files: uploadedFileUrls } : {}),
      };
      const updatedMessages = [...currentMessages, userMessage];
      // The turn starts with a placeholder assistant bubble, so the aiNode
      // (with its blinking cursor) appears at once; the stream fills it.
      dispatchConversation({
        type: "turn/started",
        messages: [
          ...updatedMessages,
          {
            role: MESSAGE_ROLES.ASSISTANT,
            content: "",
            timestamp: new Date().toISOString(),
            provider: settings.provider,
            model: settings.model,
          },
        ],
        conversationId: genId,
        sentWith: { provider: settings.provider, model: settings.model },
      });

      let wasStopped = false;
      try {
        console.debug(
          `[handleSend] starting runOrchestrationLoop, updatedMessages=${updatedMessages.length}`,
        );
        const outcome = await runOrchestrationLoop(updatedMessages, turnActiveRuleNames);
        // The user's Stop closed the stream; handleStop settled the turn.
        wasStopped = outcome === "stopped";
        if (wasStopped) return;
        // Messages are already updated by the streaming callbacks — just reload history
        loadConversations();

        // Land the stored turn: its server ids (Rewind / Fork), the prompt
        // as the model saw it (Raw view), the system prompt. The service
        // persists the turn before it emits `done` (prism-service
        // Finalizer), so the first fetch has it and nothing polls. A
        // document without the turn means persisting failed: what
        // streamed stays on screen.
        try {
          const full = isNoAgent
            ? await PrismService.getConversation(genId)
            : await PrismService.getAgentConversation(genId, agentProject!);
          if (full?.displayMessages && conversationIdRef.current === genId) {
            const displayMessages = resolveDisplayMessages(full);
            if (documentHasSentTurn(displayMessages, getConversationState().messages)) {
              setMessages(displayMessages);
              if (full.systemPrompt != null) {
                setSettings((previousSettings) => ({
                  ...previousSettings,
                  systemPrompt: full.systemPrompt,
                }));
              }
            } else {
              console.warn(
                `[handleSend] The stored conversation lacks the turn that just streamed — keeping the streamed messages`,
              );
            }
          }
        } catch (error) {
          console.error("Failed to refresh conversation messages after done:", error);
        }
      } catch (error: unknown) {
        console.error(`[handleSend] orchestration error:`, error);

        // The turn's own `error` event: the reducer already showed it.
        if (error instanceof StreamError) return;

        // Detect network/fetch errors caused by mobile screen lock, tab
        // suspension, or TCP connection drops. These are NOT real failures —
        // the backend agentic loop continues processing in the background.
        // Instead of showing "⚠️ Error", follow the rest of the turn over
        // the live socket (polling when none is configured).
        const errorMessage = getErrorMessage(error);
        const isNetworkDisconnection =
          error instanceof StreamClosedError ||
          error instanceof TypeError ||
          errorMessage.includes("fetch") ||
          errorMessage.includes("network") ||
          errorMessage.includes("aborted") ||
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("ERR_NETWORK");

        if (isNetworkDisconnection && !isNoAgent && genId) {
          console.info(
            `[handleSend] Network disconnection detected — entering recovery for ${genId}`,
          );
          await recoverDroppedTurn(genId);
        } else {
          dispatchConversation({ type: "turn/failed", message: errorMessage });
        }
      } finally {
        console.debug(
          `[handleSend finally] genId=${genId}, currentConversationId=${conversationIdRef.current}, match=${conversationIdRef.current === genId}`,
        );
        // Remove this conversation from the generating set
        setGeneratingConversationIds((previousGeneratingConversationIds) => {
          const next = new Set(previousGeneratingConversationIds);
          next.delete(genId);
          return next;
        });
        // Clean up the background snapshot — conversation is now persisted to backend
        backgroundConversationsRef.current.delete(genId);
        // This client no longer drives the conversation — release it even
        // when the user switched away (a display-gated release left the
        // flag stuck and blocked viewer live-streams on every conversation).
        if (clientDrivenConversationIdRef.current === genId) {
          clientDrivenConversationIdRef.current = null;
        }
        // Only update local UI state if this conversation is still displayed
        if (conversationIdRef.current === genId) {
          setIsGenerating(false);
          if (!wasStopped) SoundService.playGenerationEnd();
          abortRef.current = null;
          setCurrentTurnStart(null);

          // The stream is over, but sub-agents it dispatched may still be
          // running — dispatch does not end the parent's turn. Settle every
          // entry from the server: running ones stay running (the
          // background poll keeps them current), finished ones resolve, and
          // an entry the server no longer lists is completed — its terminal
          // event was missed and would keep the status bar stuck.
          PrismService.getCoordinatorSubAgents(genId)
            .then((result) => {
              if (conversationIdRef.current !== genId) return;
              setSubAgentToolActivity((previousSubAgentToolActivity) =>
                applyServerSubAgentStatuses(previousSubAgentToolActivity, result.subAgents || [], {
                  completeUnlisted: true,
                }),
              );
            })
            .catch(() => {
              if (conversationIdRef.current !== genId) return;
              setSubAgentToolActivity((previousSubAgentToolActivity) =>
                applyServerSubAgentStatuses(previousSubAgentToolActivity, [], {
                  completeUnlisted: true,
                }),
              );
            });

          setMessages((previousMessages) => {
            const last = previousMessages[previousMessages.length - 1];
            console.debug(
              `[handleSend finally setMessages] previousMessages=${previousMessages.length}, last.role=${last?.role}, last.completedAt=${last?.completedAt}`,
            );
            if (last?.role === "assistant" && !last.completedAt) {
              const updated = [...previousMessages];
              updated[updated.length - 1] = {
                ...last,
                completedAt: new Date().toISOString(),
              };
              return updated;
            }
            return previousMessages;
          });
        } else {
          console.debug(
            `[handleSend finally] conversation switched away, skipping UI updates`,
          );
          // Conversation was switched away — just clear the abort ref
          abortRef.current = null;
        }
        // Reload conversations list regardless (title/metadata may have changed)
        loadConversations();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send callback reads latest conversation state at call time; identity kept stable by design
    [
      handleStop,
      isConversationRunning,
      isNoAgent,
      runOrchestrationLoop,
      loadConversations,
      addToast,
      sendTurnInputUpdate,
      enqueueNextTurn,
      dispatchConversation,
      routeTurnEvent,
    ],
  );

  /**
   * The sent turn's SSE dropped (screen lock, tab suspension, a TCP drop) —
   * the service keeps running it. Follow the rest over the live socket
   * (polling the document when no socket is configured), then land the
   * stored conversation.
   */
  async function recoverDroppedTurn(genId: string): Promise<void> {
    // Remove the in-flight error-like assistant message if present
    setMessages((previousMessages) => {
      const lastMessage = previousMessages[previousMessages.length - 1];
      if (lastMessage?.role === "assistant" && !lastMessage.content && !lastMessage.completedAt) {
        return previousMessages.slice(0, -1);
      }
      return previousMessages;
    });

    const RECOVERY_POLL_INTERVAL_MILLISECONDS = 3_000;
    const RECOVERY_MAX_DURATION_MILLISECONDS = 5 * 60 * 1_000;
    const recoveryStartTimestamp = Date.now();

    /** Show the persisted conversation; true once the turn has landed. */
    const refreshRecoveredConversation = async (): Promise<boolean> => {
      const recoveredConversation = await PrismService.getAgentConversation(
        genId,
        agentProject!,
      );
      if (!recoveredConversation?.displayMessages || conversationIdRef.current !== genId) {
        return false;
      }
      const displayMessages = resolveDisplayMessages(recoveredConversation);
      setMessages(displayMessages);
      // displayMessages pre-filters tool-role messages and empty stubs,
      // so the final assistant message is the last entry once the turn
      // has landed.
      const lastRecoveredMessage = displayMessages[displayMessages.length - 1];
      return lastRecoveredMessage?.role === "assistant" && !!lastRecoveredMessage.content;
    };

    // Without a WebSocket URL: poll the document until the agent finishes.
    const recoveryPoll = async () => {
      while (
        Date.now() - recoveryStartTimestamp < RECOVERY_MAX_DURATION_MILLISECONDS &&
        conversationIdRef.current === genId
      ) {
        try {
          if (await refreshRecoveredConversation()) {
            console.info(
              `[handleSend] Recovery polling: generation completed for ${genId}`,
            );
            return;
          }
        } catch {
          // Non-critical — keep polling
        }
        await new Promise((resolve) =>
          setTimeout(resolve, RECOVERY_POLL_INTERVAL_MILLISECONDS),
        );
      }
    };

    // Follow the rest of the turn over the live socket. It resubscribes
    // from this conversation's event cursor — the SSE's own mark — so
    // what the SSE missed goes through the same reducer and continues
    // the turn's bubble with nothing repeated; the document refresh
    // then lands the canonical messages.
    const recovery = followTurn(genId, {
      isTurnRunning: async () =>
        Boolean((await PrismService.getAgentConversation(genId, agentProject!))?.isActive),
      timeoutMilliseconds: RECOVERY_MAX_DURATION_MILLISECONDS,
    });
    for await (const item of recovery) {
      if (item.kind === "connection") setLiveConnectionState(item.state);
      else if (item.kind === "event") routeTurnEvent(item.event, genId);
    }
    const liveRecoveryOutcome = await recovery.outcome;
    console.info(
      `[handleSend] Live recovery for ${genId} finished: ${liveRecoveryOutcome}`,
    );
    if (liveRecoveryOutcome === "unconfigured") {
      await recoveryPoll();
    } else {
      try {
        await refreshRecoveredConversation();
      } catch {
        // Non-critical — the change stream catches up
      }
    }
  }

  /** Enter in the composer while the conversation runs: steer it, or queue for after. */
  const sendWhileRunning = useCallback(
    (action: "update" | "queue") =>
      handleSend(null, action === "update" ? { isTurnInput: true } : { isQueueing: true }),
    [handleSend],
  );

  return {
    handleSend,
    handleStop,
    sendWhileRunning,
    routeTurnEvent,
    runConversationEffectRef,
  };
}

export type ChatTurns = ReturnType<typeof useChatTurns>;
