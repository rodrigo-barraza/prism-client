"use client";

/**
 * Which conversation the chat shows, and loading it: a `?conversation=`
 * link, a pick in the history panel (from the server, or from the in-memory
 * snapshot of one still generating in the background), a refresh from the
 * change stream, and a new conversation.
 *
 * `applyConversationData` puts a stored conversation on screen: its
 * transcript, the cards it still waits on, the live status of a turn in
 * progress, and the settings, tools and workspace it ran with.
 */

import { useCallback, useEffect, useRef } from "react";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import type { WorkspaceItem } from "../services/WorkspaceService";
import type { ChatTranscriptHandle } from "../components/ChatTranscriptComponent";
import type { ComposerHandle } from "../components/ComposerComponent";
import { resolveDisplayMessages } from "../utils/messageHelpers";
import {
  extractPersistedContextBudget,
  refreshUnlessStreamOwned,
  shouldApplySnapshotRefresh,
} from "../utils/liveConversationView";
import { pendingDecisionCards, type ServedPendingDecisions } from "../utils/pendingDecisionCards";
import { approvalsFromPendingSnapshot } from "../utils/approvalCards";
import { buildResetConversationSettings } from "../utils/conversationReset";
import { getErrorMessage } from "../utils/errorMessage";
import type { ReportUrlChange } from "../utils/chatUrlChange";
import type { ClientMessage, SubAgentActivityEntry } from "../utils/agentConversationReducer";
import type {
  AgentConversation,
  Conversation,
  PrismSettings,
  UserQuestionItem,
} from "../types/types";
import type { AgentConversation as AgentConversationHook } from "./useAgentConversation";
import { defaultConversationTitle, type ChatSession, type ConversationSnapshot } from "./useChatSession";
import type { ConversationList } from "./useConversationList";
import type { ChatModelSettings, ChatSettings } from "./useChatModelSettings";
import type { AgentToolset } from "./useAgentToolset";
import { isRestorableRecursionDepth, type ChatAgentControls } from "./useChatAgentControls";
import type { ConversationGoalApi } from "./useConversationGoal";
import type { BudgetPauseApi } from "./useBudgetPause";
import type { NonBlockingQuestionsApi } from "./useNonBlockingQuestions";
import type { PixelTransition } from "./usePixelTransition";

/** A conversation document as it is loaded, or the stand-in built from a background snapshot. */
export type LoadedConversation = (AgentConversation | Conversation) & {
  workspaceRoot?: string;
  _fromSnapshot?: boolean;
  _snapshot?: ConversationSnapshot;
  isGenerating?: boolean;
  pendingApproval?: {
    isPending?: boolean;
    type?: string;
    batchId?: string;
    toolCalls?: Parameters<typeof approvalsFromPendingSnapshot>[0];
    tools?: string[];
  };
  pendingQuestion?: {
    isPending?: boolean;
    questionId?: string;
    question?: string;
    questions?: UserQuestionItem[];
    choices?: string[];
  };
};

interface SubStatus {
  phase?: string;
  label?: string | null;
  startedAt?: string;
  conversationId?: string;
}

interface LiveStatus {
  phase?: string;
  label?: string | null;
  iteration?: number;
  maxIterations?: number;
  startedAt?: string;
  phaseStartedAt?: string;
  tokensPerSecond?: number | null;
  outputTokens?: number;
  inputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  subAgents?: Record<string, SubStatus>;
}

type GenerationSettings = Record<string, string | number | boolean | undefined>;

/**
 * The settings a conversation opened from a link runs with: its last reply's
 * generation settings, its system prompt, and what its stored settings say.
 */
function settingsFromLinkedConversation(
  previousSettings: ChatSettings,
  full: LoadedConversation,
  displayMessages: ClientMessage[],
): ChatSettings {
  // displayMessages is the response's only message form (raw `messages`
  // are no longer shipped); assistant entries keep model/provider/
  // generationSettings through display preparation.
  const lastAssistant = [...displayMessages]
    .reverse()
    .find((message) => message.role === "assistant" && message.provider);
  const conversationSettings = full.settings as Record<string, unknown> | undefined;
  const nextSettings = { ...previousSettings };
  if (lastAssistant) {
    const gs = (lastAssistant.generationSettings || {}) as GenerationSettings;
    if (lastAssistant.provider) {
      nextSettings.provider = lastAssistant.provider;
    }
    if (lastAssistant.model) {
      nextSettings.model = lastAssistant.model;
    }
    if (gs.temperature !== undefined) {
      nextSettings.temperature = Number(gs.temperature);
    }
    if (gs.maxTokens !== undefined) {
      nextSettings.maxTokens = Number(gs.maxTokens);
    }
    if (gs.thinkingEnabled !== undefined) {
      nextSettings.thinkingEnabled = Boolean(gs.thinkingEnabled);
    }
    if (gs.reasoningEffort) {
      nextSettings.reasoningEffort = String(gs.reasoningEffort);
    }
    if (gs.thinkingBudget) {
      nextSettings.thinkingBudget = String(gs.thinkingBudget);
    }
  }
  if (full.systemPrompt != null) {
    nextSettings.systemPrompt = full.systemPrompt;
  }
  const urlThinkingEnabled = conversationSettings?.thinkingEnabled;
  if (urlThinkingEnabled !== undefined) {
    nextSettings.thinkingEnabled = Boolean(urlThinkingEnabled);
  }
  const urlThinkingBudget = conversationSettings?.thinkingBudget;
  if (urlThinkingBudget !== undefined) {
    nextSettings.thinkingBudget = String(urlThinkingBudget);
  }
  const urlThinkingLevel = conversationSettings?.thinkingLevel as string | undefined;
  if (urlThinkingLevel) {
    nextSettings.thinkingLevel = urlThinkingLevel;
  }
  const urlReasoningEffort = conversationSettings?.reasoningEffort as string | undefined;
  if (urlReasoningEffort) {
    nextSettings.reasoningEffort = urlReasoningEffort;
  }
  const urlHarness = conversationSettings?.harness as string | undefined;
  const urlTopology = conversationSettings?.topology as string | undefined;
  const urlThoughtStructure = conversationSettings?.thoughtStructure as string | undefined;
  const urlLocale = conversationSettings?.locale as string | undefined;
  if (urlHarness || urlTopology || urlThoughtStructure || urlLocale) {
    nextSettings.agents = {
      ...nextSettings.agents,
      ...(urlHarness && { harness: urlHarness }),
      ...(urlTopology && { topology: urlTopology }),
      ...(urlThoughtStructure && { thoughtStructure: urlThoughtStructure }),
      ...(urlLocale && { locale: urlLocale }),
    };
  }
  return nextSettings;
}

/**
 * The settings a conversation picked from the list runs with: its last
 * reply's generation settings, its system prompt, and its stored settings
 * (provider and model included).
 */
function settingsFromLoadedConversation(
  previousSettings: ChatSettings,
  full: LoadedConversation,
  displayMessages: ClientMessage[],
): ChatSettings {
  const lastAssistant = [...displayMessages]
    .reverse()
    .find((message) => message.role === "assistant" && message.provider);
  const conversationSettings = full.settings as
    | Partial<PrismSettings>
    | undefined;
  const nextSettings = { ...previousSettings };
  if (lastAssistant) {
    const gs = lastAssistant.generationSettings || {};
    if (lastAssistant.provider) {
      nextSettings.provider = lastAssistant.provider;
    }
    if (lastAssistant.model) {
      nextSettings.model = lastAssistant.model;
    }
    if (gs.temperature !== undefined) {
      nextSettings.temperature = gs.temperature;
    }
    if (gs.maxTokens !== undefined) {
      nextSettings.maxTokens = gs.maxTokens;
    }
    if (gs.thinkingEnabled !== undefined) {
      nextSettings.thinkingEnabled = gs.thinkingEnabled;
    }
    if (gs.reasoningEffort) {
      nextSettings.reasoningEffort = gs.reasoningEffort;
    }
    if (gs.thinkingBudget !== undefined) {
      nextSettings.thinkingBudget = String(gs.thinkingBudget);
    }
  }
  if (full.systemPrompt != null) {
    nextSettings.systemPrompt = full.systemPrompt;
  }
  if (conversationSettings?.provider) {
    nextSettings.provider = conversationSettings.provider;
  }
  if (conversationSettings?.model) {
    nextSettings.model = conversationSettings.model;
  }
  if (conversationSettings?.temperature !== undefined) {
    nextSettings.temperature = conversationSettings.temperature;
  }
  const conversationSettingsRecord = conversationSettings as Record<string, unknown> | undefined;
  const conversationThinkingEnabled = conversationSettingsRecord?.thinkingEnabled;
  if (conversationThinkingEnabled !== undefined) {
    nextSettings.thinkingEnabled = Boolean(conversationThinkingEnabled);
  }
  const conversationThinkingBudget = conversationSettingsRecord?.thinkingBudget;
  if (conversationThinkingBudget !== undefined) {
    nextSettings.thinkingBudget = String(conversationThinkingBudget);
  }
  const conversationThinkingLevel = conversationSettingsRecord?.thinkingLevel as string | undefined;
  if (conversationThinkingLevel) {
    nextSettings.thinkingLevel = conversationThinkingLevel;
  }
  const conversationReasoningEffort = conversationSettingsRecord?.reasoningEffort as string | undefined;
  if (conversationReasoningEffort) {
    nextSettings.reasoningEffort = conversationReasoningEffort;
  }
  const conversationHarness = conversationSettingsRecord?.harness as string | undefined;
  const conversationTopology = conversationSettingsRecord?.topology as string | undefined;
  const conversationThoughtStructure = conversationSettingsRecord?.thoughtStructure as string | undefined;
  const conversationLocale = conversationSettingsRecord?.locale as string | undefined;
  if (
    conversationHarness ||
    conversationTopology ||
    conversationThoughtStructure ||
    conversationLocale
  ) {
    nextSettings.agents = {
      ...nextSettings.agents,
      ...(conversationHarness && { harness: conversationHarness }),
      ...(conversationTopology && { topology: conversationTopology }),
      ...(conversationThoughtStructure && { thoughtStructure: conversationThoughtStructure }),
      ...(conversationLocale && { locale: conversationLocale }),
    };
  }
  return nextSettings;
}

interface UseConversationSwitchingOptions {
  isAdmin: boolean;
  isNoAgent: boolean;
  agentProject: string | undefined;
  /** `?conversation=` — opened once the agent's project is known. */
  initialConversationId: string | null;
  conversation: AgentConversationHook;
  session: ChatSession;
  list: ConversationList;
  model: ChatModelSettings;
  toolset: AgentToolset;
  controls: ChatAgentControls;
  workspaces: WorkspaceItem[];
  currentWorkspacePath: string | undefined;
  setCurrentWorkspace: (_workspace: WorkspaceItem | null) => void;
  goal: Pick<ConversationGoalApi, "hydrate">;
  budgetPause: Pick<BudgetPauseApi, "hydrate" | "clear">;
  nonBlockingQuestions: Pick<NonBlockingQuestionsApi, "clear">;
  pixelTransition: PixelTransition;
  transcriptRef: React.RefObject<ChatTranscriptHandle | null>;
  composerRef: React.RefObject<ComposerHandle | null>;
  /** The token badges start over for the conversation just opened. */
  resetTokenMark: () => void;
  reportUrlChange: ReportUrlChange;
}

export default function useConversationSwitching({
  isAdmin,
  isNoAgent,
  agentProject,
  initialConversationId,
  conversation,
  session,
  list,
  model,
  toolset,
  controls,
  workspaces,
  currentWorkspacePath,
  setCurrentWorkspace,
  goal,
  budgetPause,
  nonBlockingQuestions,
  pixelTransition,
  transcriptRef,
  composerRef,
  resetTokenMark,
  reportUrlChange,
}: UseConversationSwitchingOptions) {
  const {
    state: { isGenerating, messages },
    dispatch: dispatchConversation,
    getState: getConversationState,
    setMessages,
    setIsGenerating,
    setToolActivity,
    setSubAgentToolActivity,
    setPendingApprovals,
    setPendingUserQuestion,
    setPlanProposal,
    setAgenticProgress,
    setStatusBarInitialElapsedMilliseconds,
    setContextBudget,
  } = conversation;
  const {
    activeId,
    title,
    backendConversationStats,
    isBackendStatsStale,
    conversationIdRef,
    clientDrivenConversationIdRef,
    isWebSocketStreamingRef,
    webSocketHasStreamedContentRef,
    backgroundConversationsRef,
    setConversationId,
    setTraceId,
    setActiveId,
    setTitle,
    setForkedFrom,
    setIsUserExplicitlyStopped,
    setBackendConversationStats,
    setIsBackendStatsStale,
    setUnavailableWorkspace,
  } = session;
  const { setConversations, generatingConversationIds } = list;
  const { config, settings, setSettings } = model;
  const { disabledTools, restoreDisabledTools, resetToAllDisabled, enableSpecificTools } = toolset;
  const { setMaxRecursionDepth } = controls;
  const { hydrate: hydrateConversationGoal } = goal;
  const { hydrate: hydrateBudgetPause, clear: clearBudgetPause } = budgetPause;
  const { clear: clearNonBlockingQuestions } = nonBlockingQuestions;
  const { setPhase: setPixelTransition, recordLoadTime: recordPixelLoadTime } = pixelTransition;

  // Track whether the URL conversation param has been consumed
  const urlConversationLoadRef = useRef<{ project: string | undefined; isLoaded: boolean } | null>(null);

  // -- Auto-load conversation from URL ?conversation= param ----------------
  // Fetches the full conversation once and applies it. It is looked up under
  // the agent's project, which is a guess until the page's personas arrive
  // (the Coding persona keeps its conversations in "prism-chat", the guess is
  // "coding"): a miss is tried again when the project resolves. The ref keeps
  // StrictMode re-mounts from loading twice.
  useEffect(() => {
    if (isAdmin || !initialConversationId) return;
    const previousAttempt = urlConversationLoadRef.current;
    if (previousAttempt?.isLoaded || previousAttempt?.project === agentProject) return;
    const attempt = { project: agentProject, isLoaded: false };
    urlConversationLoadRef.current = attempt;

    (async () => {
      try {
        const conversationIdAtLoadStart = conversationIdRef.current;
        const full = isNoAgent
          ? await PrismService.getConversation(initialConversationId)
          : await PrismService.getAgentConversation(initialConversationId, agentProject!);
        if (!full) return;

        // Guard: if the user navigated away (e.g. clicked "New Conversation")
        // while the API call was in flight, conversationIdRef.current will have
        // changed to a new UUID. Applying stale data would restore the old
        // selection highlight in the sidebar.
        if (conversationIdRef.current !== conversationIdAtLoadStart) return;
        attempt.isLoaded = true;

        const displayMessages = resolveDisplayMessages(full);
        console.debug(
          `[URL conversation load] id=${initialConversationId}, displayMessages=${displayMessages.length}`,
        );
        transcriptRef.current?.stickToBottom("instant");
        dispatchConversation({ type: "conversation/loaded" });
        setMessages(displayMessages);
        setConversationId(full.id || generateUUID());
        setTraceId(full.traceId || null);
        setActiveId(full.id || null);
        setTitle(full.title || defaultConversationTitle(isNoAgent));
        setToolActivity([]);
        setSubAgentToolActivity({});
        // A link (a reload, a push notification) opens a turn parked on its
        // user with its cards — the same hydration as a sidebar switch.
        const pendingCards = pendingDecisionCards(full as ServedPendingDecisions, displayMessages);
        setPendingApprovals(pendingCards.approvals);
        setPlanProposal(pendingCards.planProposal);
        setPendingUserQuestion(pendingCards.question);
        hydrateBudgetPause(pendingCards.budget);

        setSettings((previousSettings) => settingsFromLinkedConversation(previousSettings, full, displayMessages));

        // Restore agent toggle state from the conversation's persisted settings
        const persistedRecursionDepth = (full.settings as Record<string, unknown> | undefined)?.maxRecursionDepth;
        if (isRestorableRecursionDepth(persistedRecursionDepth)) {
          setMaxRecursionDepth(persistedRecursionDepth);
        }

        setBackendConversationStats(full.stats || null);
        setIsBackendStatsStale(false);
        resetTokenMark();

        // Hydrate persisted context budget from the conversation document
        setContextBudget(extractPersistedContextBudget(full));
        hydrateConversationGoal(full.goal ?? null);
      } catch (error: unknown) {
        console.error("Failed to preload conversation from URL:", error);
      }
    })();
  }, [agentProject]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Conversation management ----------------------------------
  const resetConversationState = useCallback(() => {
    console.debug(`[resetConversationState] clearing all messages and state`);
    dispatchConversation({ type: "conversation/reset" });
    composerRef.current?.clearImages();
    clearBudgetPause();
    hydrateConversationGoal(null);
    setForkedFrom(null);
    clearNonBlockingQuestions();
    setConversationId(generateUUID());
    // Mint a trace for the new conversation exactly as the initial mount
    // does — a null traceId here left every "New Conversation" turn
    // untraceable, and (before conversationMeta was made unconditional)
    // stripped the last thing that told /chat to persist the user message.
    setTraceId(generateUUID());
    setActiveId(null);
    setTitle(defaultConversationTitle(isNoAgent));
    setBackendConversationStats(null);
    setIsBackendStatsStale(false);
    setUnavailableWorkspace(null);
    resetTokenMark();
    transcriptRef.current?.stickToBottom();
    composerRef.current?.focus();

    // New conversations start with all configurable tools disabled;
    // core tools respect coreToolsLocked (locked on = stay enabled).
    resetToAllDisabled();

    setSettings((currentSettings) =>
      buildResetConversationSettings(config, currentSettings, isNoAgent),
    );

    // Clear conversation from URL
    reportUrlChange({ kind: "conversation", conversationId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
  }, [isNoAgent, config, resetToAllDisabled, hydrateConversationGoal, clearNonBlockingQuestions, dispatchConversation, reportUrlChange, clearBudgetPause, resetTokenMark]);

  /** Keep the conversation generating in the background so switching back resumes it. */
  const snapshotGeneratingConversation = useCallback(() => {
    const currentId = conversationIdRef.current;
    backgroundConversationsRef.current.set(currentId, {
      conversation: getConversationState(),
      title,
      settings: { ...settings },
      backendConversationStats,
      isBackendStatsStale,
      workspaceRoot: currentWorkspacePath || null,
      disabledTools: [...disabledTools],
    });
    setIsGenerating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
  }, [title, getConversationState, settings, backendConversationStats, isBackendStatsStale, currentWorkspacePath, disabledTools, setIsGenerating]);

  const handleNewChat = useCallback(() => {
    // If generating, snapshot the current conversation so user can switch back to it
    if (isGenerating) snapshotGeneratingConversation();
    // New conversation — instant reset, no pixelation transition needed
    resetConversationState();
  }, [isGenerating, snapshotGeneratingConversation, resetConversationState]);

  /** Apply fetched/snapshot conversation data to component state immediately. */
  const applyConversationData = useCallback(
    (full: LoadedConversation) => {
      if (!full) return;

      // Hydrate persisted context budget from the conversation document,
      // or clear if the conversation has no budget data.
      setContextBudget(extractPersistedContextBudget(full));
      // Same for the goal — the document carries it; `goal_update` events
      // keep it current between refreshes.
      hydrateConversationGoal(full.goal ?? null);
      if (!full._fromSnapshot) setForkedFrom(full.forkedFrom ?? null);

      // -- Restore workspace selection from the conversation document --
      // Agent conversations record which workspace they were started with;
      // switch to it so the workspace tree and tool routing match.
      if (full.workspaceRoot) {
        const match = workspaces.find((workspace) => workspace.path === full.workspaceRoot);
        if (match) {
          if (match.path !== currentWorkspacePath) {
            setCurrentWorkspace(match);
          }
          setUnavailableWorkspace(null);
        } else {
          // Workspace not currently connected — surface in the UI
          // instead of silently failing and looping errors.
          setUnavailableWorkspace(full.workspaceRoot ?? null);
        }
      } else {
        setUnavailableWorkspace(null);
      }

      if (full._fromSnapshot && full._snapshot) {
        // Restoring a background generating conversation from snapshot
        const snap = full._snapshot;
        transcriptRef.current?.stickToBottom("instant");
        // Its conversation state as the stream left it — the SSE kept the
        // snapshot current while the user was away.
        dispatchConversation({ type: "conversation/restored", state: snap.conversation });
        setConversationId(full.id || generateUUID());
        setActiveId(full.id || null);
        reportUrlChange({ kind: "conversation", conversationId: full.id ?? null });
        setTitle(snap.title || "");
        setSettings((previousSettings) => ({
          ...previousSettings,
          ...(snap.settings as Partial<typeof previousSettings>),
        }));
        setBackendConversationStats(snap.backendConversationStats || null);
        setIsBackendStatsStale(snap.isBackendStatsStale || false);
        // Restore tool toggle state from snapshot
        if (snap.disabledTools !== undefined) {
          restoreDisabledTools(snap.disabledTools);
        } else {
          resetToAllDisabled();
        }
        // Re-attach: mark as generating so the UI shows the active state
        setIsUserExplicitlyStopped(false);
        setIsGenerating(true);
        // Remove the snapshot — the SSE callbacks will resume updating React state
        // now that conversationIdRef matches again (isStale() → false)
        backgroundConversationsRef.current.delete(full.id || "");
        return;
      }

      // Normal backend-loaded conversation
      const displayMessages = resolveDisplayMessages(full);
      console.debug(
        `[Conversation switch] id=${full.id}, displayMessages=${displayMessages.length}`,
      );
      transcriptRef.current?.stickToBottom("instant");
      // The stored document replaces the transcript: no stream owns it.
      dispatchConversation({ type: "conversation/loaded" });
      setMessages(displayMessages);
      setConversationId(full.id || generateUUID());
      setTraceId(full.traceId || null);
      setActiveId(full.id ?? null);
      // Guard against stale isGenerating flags in the database — if the
      // conversation hasn't been updated in over 5 minutes, the flag is
      // likely a leftover from a crashed generation or server restart.
      const isGeneratingFlagStale = (() => {
        if (!full.isGenerating) return false;
        const updatedAt = full.updatedAt ? new Date(full.updatedAt as string).getTime() : 0;
        const STALE_THRESHOLD_MS = 5 * 60 * 1000;
        return Date.now() - updatedAt > STALE_THRESHOLD_MS;
      })();
      if (isGeneratingFlagStale) {
        console.warn(
          `[Conversation switch] Stale isGenerating flag detected for conversation ${full.id} — clearing locally`,
        );
      }
      setIsUserExplicitlyStopped(false);
      setIsGenerating(!!full.isGenerating && !isGeneratingFlagStale);
      // NOTE: clientDrivenConversationIdRef is deliberately NOT touched
      // here — it is scoped to the conversation whose SSE this client
      // drives, and a passive DB load of some (possibly other)
      // conversation says nothing about that stream.

      // Hydrate StatusBar state from the backend's live status registry
      // so the progress bar, phase, and iteration resume at the correct
      // position after a conversation switch or page refresh.
      const fullRecord = full as unknown as Record<string, unknown>;
      const liveStatus = fullRecord.liveStatus as LiveStatus | undefined;

      if (liveStatus && (full.isGenerating || fullRecord.isActive)) {
        // Restore iteration progress
        if (typeof liveStatus.iteration === "number") {
          setAgenticProgress({
            iteration: liveStatus.iteration,
            maxIterations: liveStatus.maxIterations || 0,
          });
        }

        // Compute how long the current phase has been running so the
        // StatusBar asymptotic timer starts from the correct position.
        const phaseStartedAt = liveStatus.phaseStartedAt || liveStatus.startedAt;
        if (phaseStartedAt) {
          const elapsedMilliseconds = Date.now() - new Date(phaseStartedAt).getTime();
          setStatusBarInitialElapsedMilliseconds(
            elapsedMilliseconds > 0 ? elapsedMilliseconds : null,
          );
        } else {
          setStatusBarInitialElapsedMilliseconds(null);
        }

        // Set the phase on the last assistant message so the StatusBar
        // phase derivation picks up the correct phase immediately.
        if (liveStatus.phase && displayMessages.length > 0) {
          const lastDisplayMessage = displayMessages[displayMessages.length - 1];
          if (lastDisplayMessage?.role === "assistant") {
            displayMessages[displayMessages.length - 1] = {
              ...lastDisplayMessage,
              statusPhase: liveStatus.phase,
              // Rehydrate live token/cost progress from the status registry
              // so the stats badges resume mid-generation after a refresh
              // instead of sitting at zero until the next progress frame.
              ...(liveStatus.totalTokens || liveStatus.estimatedCost
                ? {
                    _liveGenProgress: {
                      tokensPerSecond: liveStatus.tokensPerSecond ?? undefined,
                      outputTokens: liveStatus.outputTokens,
                      inputTokens: liveStatus.inputTokens,
                      totalTokens: liveStatus.totalTokens,
                      estimatedCost: liveStatus.estimatedCost,
                    },
                  }
                : {}),
            } as ClientMessage;
          }
        }
        // Hydrate sub-agent tool activity so their status bars and progress
        // indicators in the chat also resume correctly.
        if (liveStatus.subAgents && Object.keys(liveStatus.subAgents).length > 0) {
          const hydratedSubAgentActivity: Record<string, SubAgentActivityEntry> = {};
          for (const [subAgentId, subStatus] of Object.entries(liveStatus.subAgents)) {
            let initialElapsedMs = null;
            if (subStatus.startedAt) {
              const elapsed = Date.now() - new Date(subStatus.startedAt).getTime();
              initialElapsedMs = elapsed > 0 ? elapsed : null;
            }

            hydratedSubAgentActivity[subAgentId] = {
              phase: subStatus.phase,
              status: subStatus.label || undefined,
              conversationId: subStatus.conversationId || undefined,
              // Passing this through the activity state so the rendering
              // pass can pick it up for the sub-agent's StatusBarComponent.
              initialElapsedMilliseconds: initialElapsedMs,
            };
          }
          setSubAgentToolActivity(hydratedSubAgentActivity);
        }
      } else {
        setAgenticProgress(null);
        setStatusBarInitialElapsedMilliseconds(null);
        setSubAgentToolActivity({});
      }

      // The cards the turn is still waiting on (durable — they survive a
      // server restart), as every load path hydrates them.
      const pendingCards = pendingDecisionCards(full, displayMessages);
      setPendingApprovals(pendingCards.approvals);
      setPlanProposal(pendingCards.planProposal);
      setPendingUserQuestion(pendingCards.question);
      hydrateBudgetPause(pendingCards.budget);

      reportUrlChange({ kind: "conversation", conversationId: full.id ?? null });
      setTitle(full.title || "Agent");
      setToolActivity([]);
      setSubAgentToolActivity({});

      setSettings((previousSettings) => settingsFromLoadedConversation(previousSettings, full, displayMessages));

      // Restore sub-agent recursion depth from conversation's persisted settings
      const conversationSettings = full.settings as Record<string, unknown> | undefined;
      const persistedRecursionDepth = conversationSettings?.maxRecursionDepth;
      if (isRestorableRecursionDepth(persistedRecursionDepth)) {
        setMaxRecursionDepth(persistedRecursionDepth);
      }

      setBackendConversationStats(full.stats || null);
      setIsBackendStatsStale(false);
      resetTokenMark();

      // Restore tool toggle state from the conversation's persisted toolConfig.
      // Conversations without toolConfig default to all tools disabled.
      const conversationToolConfig = conversationSettings?.toolConfig as
        | { disabledTools?: string[]; dynamicEnabledTools?: string[] }
        | undefined;
      if (conversationToolConfig && conversationToolConfig.disabledTools !== undefined) {
        restoreDisabledTools(conversationToolConfig.disabledTools);
      } else {
        resetToAllDisabled();
      }
      // Re-enable tools the agent dynamically activated mid-generation
      // (via enable_tools / discover_and_enable_tools). This mirrors
      // the live SSE TOOL_SET_CHANGED → enableSpecificTools() path.
      if (conversationToolConfig?.dynamicEnabledTools?.length) {
        enableSpecificTools(conversationToolConfig.dynamicEnabledTools);
      }

      // Sync the authoritative isActive and pendingBackgroundTasks from
      // the backend response to the conversations list entry. Without
      // this, the status bar computation reads stale values from the list
      // even though the backend document has already been updated.
      const freshIsActive = fullRecord.isActive as boolean | undefined;
      const freshPendingBackgroundTasks = fullRecord.pendingBackgroundTasks as number | undefined;
      if (freshIsActive !== undefined || freshPendingBackgroundTasks !== undefined) {
        setConversations((previousConversations) =>
          previousConversations.map((entry) => {
            if (entry.id !== full.id) return entry;
            return {
              ...entry,
              ...(freshIsActive !== undefined ? { isActive: freshIsActive } : {}),
              ...(freshPendingBackgroundTasks !== undefined
                ? { pendingBackgroundTasks: freshPendingBackgroundTasks }
                : {}),
            } as typeof entry;
          }),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
    [
      workspaces,
      currentWorkspacePath,
      setCurrentWorkspace,
      restoreDisabledTools,
      resetToAllDisabled,
      enableSpecificTools,
      hydrateConversationGoal,
      hydrateBudgetPause,
      dispatchConversation,
      reportUrlChange,
      setMessages,
      setIsGenerating,
      setToolActivity,
      setSubAgentToolActivity,
      setPendingApprovals,
      setPendingUserQuestion,
      setPlanProposal,
      setAgenticProgress,
      setStatusBarInitialElapsedMilliseconds,
      setContextBudget,
      resetTokenMark,
    ],
  );

  const handleSelectConversation = useCallback(
    async (selected: AgentConversation | Conversation) => {
      // If generating, snapshot the current conversation so user can switch back to it
      if (isGenerating) snapshotGeneratingConversation();
      // Already viewing this conversation — just scroll to bottom instantly
      if (selected.id === activeId) {
        transcriptRef.current?.scrollToBottom("instant");
        return;
      }

      // Start pixel-out animation concurrently — acts as a loading veil
      // for slower connections. Gets interrupted by the "in" reveal once
      // data arrives (no waiting for the out animation to finish).
      setPixelTransition("out");
      const loadStart = performance.now();

      // If the target conversation is still generating in the background,
      // restore from the in-memory snapshot instead of hitting the backend
      // (which would 404 because the conversation has not been persisted yet).
      const snapshot = backgroundConversationsRef.current.get(selected.id!);
      if (snapshot && generatingConversationIds.has(selected.id!)) {
        applyConversationData({
          id: selected.id,
          title: snapshot.title,
          messages: snapshot.conversation.messages,
          stats: snapshot.backendConversationStats ?? undefined,
          workspaceRoot: snapshot.workspaceRoot || undefined,
          _fromSnapshot: true,
          _snapshot: snapshot,
        } as LoadedConversation);
        recordPixelLoadTime(performance.now() - loadStart);
        setPixelTransition("in");
        return;
      }

      const conversationIdAtLoadStart = conversationIdRef.current;
      try {
        const full = isNoAgent
          ? await PrismService.getConversation(selected.id!)
          : await PrismService.getAgentConversation(selected.id!, agentProject!);
        // Guard: if the user navigated away (e.g. clicked "New Conversation")
        // while this API call was in flight, conversationIdRef.current will
        // have changed to a new UUID. Applying stale data here would restore
        // the previously-selected sidebar item's highlight on the new blank slate.
        if (conversationIdRef.current !== conversationIdAtLoadStart) {
          setPixelTransition(null);
          return;
        }
        applyConversationData(full);
        recordPixelLoadTime(performance.now() - loadStart);
        setPixelTransition("in");
      } catch (error: unknown) {
        const errorMessage =
          getErrorMessage(error);
        const is404 =
          errorMessage.includes("404") || errorMessage.includes("not found");
        if (is404) {
          console.warn(
            `Conversation ${selected.id} not yet persisted (still generating?) — skipping switch`,
          );
        } else {
          console.error("Failed to load conversation:", error);
        }
        setPixelTransition(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
    [
      isGenerating,
      snapshotGeneratingConversation,
      activeId,
      agentProject,
      isNoAgent,
      generatingConversationIds,
      applyConversationData,
      recordPixelLoadTime,
    ],
  );

  // -- Real-Time Background Synchronization (Change Streams) -----
  const refreshActiveConversation = useCallback(
    async (targetConversationId: string) => {
      if (!targetConversationId || targetConversationId !== conversationIdRef.current) return;
      // Skip change-stream refresh while a live event stream owns message
      // state. Without this guard, a MongoDB change event (triggered when
      // the backend writes the user message) would overwrite the local
      // optimistic messages with stale/incomplete database data, causing
      // the user's latest message and assistant placeholder to vanish.
      // Two owners are possible:
      //   1. This client's own SSE stream (it initiated the generation).
      //   2. The viewer WebSocket subscription — but ONLY while it has
      //      actually delivered content; a silent subscription must never
      //      block boundary refreshes (see shouldApplySnapshotRefresh).
      // Server-initiated generation with no local stream (timers,
      // scheduled tasks) refreshes normally — the change stream is its
      // only update path.
      if (clientDrivenConversationIdRef.current === targetConversationId) {
        console.debug(
          `[refreshActiveConversation] skipping — conversation ${targetConversationId} is currently generating (client-driven)`,
        );
        return;
      }
      if (
        !shouldApplySnapshotRefresh({
          isStreamOpen: isWebSocketStreamingRef.current,
          hasStreamedContent: webSocketHasStreamedContentRef.current,
        })
      ) {
        console.debug(
          `[refreshActiveConversation] skipping — viewer stream is delivering content for ${targetConversationId}`,
        );
        return;
      }
      try {
        const outcome = await refreshUnlessStreamOwned<AgentConversation | Conversation>({
          isStreamOwned: () =>
            clientDrivenConversationIdRef.current === targetConversationId ||
            !shouldApplySnapshotRefresh({
              isStreamOpen: isWebSocketStreamingRef.current,
              hasStreamedContent: webSocketHasStreamedContentRef.current,
            }),
          fetchSnapshot: () =>
            isNoAgent
              ? PrismService.getConversation(targetConversationId)
              : PrismService.getAgentConversation(targetConversationId, agentProject!),
          applySnapshot: (full) => {
            if (full && full.id === conversationIdRef.current) {
              applyConversationData(full);
            }
          },
        });
        if (outcome === "superseded") {
          console.debug(
            `[refreshActiveConversation] dropped a snapshot that arrived after the live stream took over ${targetConversationId}`,
          );
        }
      } catch (error) {
        console.error(
          "Failed to refresh active conversation via change stream:",
          error,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
    [isNoAgent, agentProject, applyConversationData],
  );

  return {
    applyConversationData,
    handleSelectConversation,
    handleNewChat,
    refreshActiveConversation,
    /** Whether "New Conversation" has anything to leave (an empty, unsaved chat has not). */
    isBlankConversation: messages.length === 0 && !activeId,
  };
}

export type ConversationSwitching = ReturnType<typeof useConversationSwitching>;
