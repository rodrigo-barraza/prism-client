"use client";

/**
 * The agent chat: a conversation with an agent (or with a model directly),
 * its history, and the panels around it. `/chat` renders it for the user,
 * `/admin/chat` read-only over every user's conversations.
 *
 * This component wires the chat's parts together:
 *
 * - state: the conversation on screen (useAgentConversation — one reducer
 *   for every turn event), the session (useChatSession), the list
 *   (useConversationList), model settings, tools, resources, side panels;
 * - behaviour: sending and the turn's stream (useChatTurns), opening
 *   conversations (useConversationSwitching), keeping them current
 *   (useLiveConversationSync), the admin viewer (useAgentChatAdmin);
 * - the view: ChatHeader, ChatTranscript (windowed rows), the approval and
 *   question cards, ChatStatusBar, the goal and plan panels, Composer, and
 *   the two side-panel groups.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  layoutHeaderStyles,
  EmptyStateComponent,
  ToastComponent,
  useToast,
} from "@rodrigo-barraza/components-library";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import HistoryPanel from "./HistoryPanelComponent";
import FileViewerPanelComponent from "./FileViewerPanelComponent";
import ForkLineageComponent from "./ForkLineageComponent";
import LiveConnectionIndicatorComponent from "./LiveConnectionIndicatorComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import AgentPickerComponent from "./AgentPickerComponent";
import BadgeComponent from "./BadgeComponent";
import ChatBackgroundComponent from "./ChatBackgroundComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";
import PixelTransitionComponent from "./PixelTransitionComponent";
import ChatConversationGraphComponent from "./ChatConversationGraphComponent";
import type { ChatViewMode } from "./ChatViewModeControlComponent";
import ChatHeaderComponent from "./ChatHeaderComponent";
import ChatTranscriptComponent, { type ChatTranscriptHandle } from "./ChatTranscriptComponent";
import ApprovalsAndQuestionsComponent, { PinnedQuestionsComponent } from "./ApprovalsAndQuestionsComponent";
import ChatStatusBarComponent from "./ChatStatusBarComponent";
import GoalAndPlanPanelsComponent, { ReadOnlyGoalAndBudgetComponent } from "./GoalAndPlanPanelsComponent";
import ComposerComponent, { type ComposerHandle } from "./ComposerComponent";
import AdminConversationViewComponent from "./AdminConversationViewComponent";
import ChatSidebarTopComponent from "./ChatSidebarTopComponent";
import ChatSidebarBottomComponent from "./ChatSidebarBottomComponent";
import type { MessageListNavigationState, MessageListProps } from "./MessageListComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import chatStyles from "./ChatAreaComponent.module.css";
import PrismService from "../services/PrismService";
import useAgentConversation from "../hooks/useAgentConversation";
import useChatSession from "../hooks/useChatSession";
import useChatModelSettings from "../hooks/useChatModelSettings";
import useAgentToolset from "../hooks/useAgentToolset";
import useAgentResources from "../hooks/useAgentResources";
import useChatSidebar from "../hooks/useChatSidebar";
import useChatAgentControls from "../hooks/useChatAgentControls";
import useFileViewerTabs from "../hooks/useFileViewerTabs";
import useConversationList, { useConversationDeletion, useLiveListedConversation } from "../hooks/useConversationList";
import useAgentChatAdmin, { useAdminAgentPersonas, type UnifiedEntry } from "../hooks/useAgentChatAdmin";
import useSystemPromptPreview from "../hooks/useSystemPromptPreview";
import useDisplayConversationStats from "../hooks/useDisplayConversationStats";
import useWorkspacePathIndex from "../hooks/useWorkspacePathIndex";
import useAttachmentPolicy from "../hooks/useAttachmentPolicy";
import usePixelTransition from "../hooks/usePixelTransition";
import useChatTurns from "../hooks/useChatTurns";
import useConversationSwitching from "../hooks/useConversationSwitching";
import useLiveConversationSync from "../hooks/useLiveConversationSync";
import { useNextTurnQueue, useNextTurnQueueDrain, type QueuedTurn } from "../hooks/useNextTurnQueue";
import useMessageActions from "../hooks/useMessageActions";
import useConversationBranching from "../hooks/useConversationBranching";
import useNonBlockingQuestions from "../hooks/useNonBlockingQuestions";
import useConversationGoal from "../hooks/useConversationGoal";
import useBudgetPause from "../hooks/useBudgetPause";
import usePermissionMode from "../hooks/usePermissionMode";
import useQuestionAnswerSender from "../hooks/useQuestionAnswerSender";
import useFavoriteKeys from "../hooks/useFavoriteKeys";
import useConversationGraphData from "../hooks/useConversationGraphData";
import { useChatBackgroundSetting } from "../hooks/useChatBackgroundSetting";
import type { StatusBarPhase } from "./StatusBarComponent";
import { turnActivityOf, type SubAgentActivityEntry } from "../utils/agentConversationReducer";
import { deriveChatStatusBar } from "../utils/chatStatusBar";
import { applyPhaseTokensToRoot } from "../utils/statusBarPhaseTokens";
import { isChatDebugProbeInstalled, publishChatDebugState } from "../utils/chatDebugProbe";
import type { ChatUrlChange } from "../utils/chatUrlChange";
import {
  AGENT_IDS,
  LOCAL_STORAGE_KEY_ADMIN_CHAT_FILTERS,
  LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE,
  LOCAL_STORAGE_KEY_CHAT_FILTERS,
  LOCAL_STORAGE_KEY_DATE_RANGE,
} from "../constants";
import type { AgentConversation, AgentPersona, Conversation } from "../types/types";

export type { ChatUrlChange } from "../utils/chatUrlChange";

interface EmptyStateConfig {
  title: string;
  subtitle: string;
  placeholder: string;
}

const DEFAULT_EMPTY_STATE: EmptyStateConfig = {
  title: "Agent",
  subtitle: "AI-powered agent with tool access.",
  placeholder: "Send a message...",
};

/** Agentless empty state — raw chat via /chat endpoint, no agentic loop. */
const NONE_EMPTY_STATE: EmptyStateConfig = {
  title: "Agentless Chat",
  subtitle:
    "You're chatting directly with the AI model — no automated tools or workflows are running behind the scenes. Think of it as a simple, open conversation where you ask questions and get answers.",
  placeholder: "Send a message...",
};

/** The phases a sub-agent's history entry can colour its progress bar with. */
const SUB_AGENT_LIVE_PHASES = new Set<string>([
  "starting", "loading", "prefilling", "generating",
  "thinking", "executing", "synthesizing", "delegating", "awaiting",
]);

function initialViewMode(initialViewModeKey: string | null): ChatViewMode {
  if (initialViewModeKey === "nodes") return "nodes";
  if (initialViewModeKey === "raw") return "raw";
  if (initialViewModeKey === "clean") return "clean";
  if (initialViewModeKey === "terminal") return "terminal";
  // Minimal, friendly Chat view is the default.
  return "chat";
}

function isSubAgentWorking(subAgent: SubAgentActivityEntry): boolean {
  return !!subAgent.currentTool || subAgent.phase === "generating" || subAgent.phase === "thinking";
}

export interface AgentChatComponentProps {
  agentId?: string;
  agents?: Array<
    AgentPersona | (Partial<AgentPersona> & { id: string; name: string })
  >;
  initialFcEnabled?: boolean;
  initialThinkingEnabled?: boolean;
  initialModel?: string | null;
  initialConversationId?: string | null;
  initialTabKey?: string | null;
  initialTabBottomKey?: string | null;
  initialViewMode?: string | null;
  isAdmin?: boolean;
  initialId?: string | null;
  /** Mirror a change in the page's URL (see ChatUrlChange). */
  onUrlChange?: (_change: ChatUrlChange) => void;
}

export default function AgentChatComponent({
  agentId: propAgentId = AGENT_IDS.CODING,
  agents: propAgents = [],
  initialFcEnabled = false,
  initialThinkingEnabled = false,
  initialModel = null,
  initialConversationId = null,
  initialTabKey = null,
  initialTabBottomKey = null,
  initialViewMode: initialViewModeKey = null,
  isAdmin = false,
  initialId = null,
  onUrlChange,
}: AgentChatComponentProps) {
  const onUrlChangeRef = useRef(onUrlChange);
  useLayoutEffect(() => {
    onUrlChangeRef.current = onUrlChange;
  });
  const reportUrlChange = useCallback(
    (change: ChatUrlChange) => onUrlChangeRef.current?.(change),
    [],
  );

  // -- The agent ------------------------------------------------
  const agentId = propAgentId;
  const isNoAgent = isAdmin ? false : agentId === AGENT_IDS.NONE;
  const { currentWorkspace, setCurrentWorkspace, workspaces, workspacesLoaded } = useWorkspace();
  // Ambient 3D backdrop for the empty state ("clouds" by default); an
  // agent's own backgroundImage takes precedence over the scene.
  const [chatBackground] = useChatBackgroundSetting();

  // -- The conversation on screen: its transcript, cards, live activity and
  // the turn in progress — one reducer that every turn event goes through,
  // whichever transport carried it (useAgentConversation).
  const agentConversation = useAgentConversation();
  const {
    messages,
    isGenerating,
    toolActivity,
    streamingOutputs,
    subAgentToolActivity,
    pendingApprovals,
    pendingUserQuestion,
    planProposal,
    agenticProgress,
    statusBarInitialElapsedMilliseconds,
    contextBudget,
  } = agentConversation.state;
  const session = useChatSession(isNoAgent);
  const { conversationId, activeId, title, forkedFrom, isUserExplicitlyStopped, liveConnectionState } = session;
  const nextTurnQueue = useNextTurnQueue(conversationId);
  // Checklist, brief, sources and code runs a turn streams outside its messages.
  const turnActivity = turnActivityOf(agentConversation.state, conversationId);
  const conversationFavorites = useFavoriteKeys("conversation");
  // Single source of truth for the conversation graph. Called
  // unconditionally so the SSE subscription stays alive across tab
  // switches, keeping both the sidebar and main-content graph instances in sync.
  const conversationGraphState = useConversationGraphData(activeId, isGenerating);

  // Single source of truth for the chat-area view mode. `showRaw` and the
  // Nodes checks below are derived from this so no impossible state combos
  // exist (previously two independent booleans: chatAreaTab + showRaw).
  const [viewMode, setViewMode] = useState<ChatViewMode>(() => initialViewMode(initialViewModeKey));
  const showRaw = viewMode === "raw";
  const isTerminalView = viewMode === "terminal";
  // The URL follows the view mode once the user changes it.
  const reportedViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (reportedViewModeRef.current === viewMode) return;
    reportedViewModeRef.current = viewMode;
    reportUrlChange({ kind: "viewMode", viewMode });
  }, [viewMode, reportUrlChange]);

  // -- Notifications & Toasts ------------------------------------
  const { toasts, addToast: originalAddToast, removeToast } = useToast();
  const addToast = originalAddToast as (
    _message: React.ReactNode,
    _type?: "success" | "warning" | "error" | "info" | string,
    _duration?: number,
  ) => number;

  // -- Settings, tools, side panels ----------------------------------
  const fileViewer = useFileViewerTabs();
  const model = useChatModelSettings({ agentId, isNoAgent, initialModel, initialFcEnabled, initialThinkingEnabled });
  const { config, filteredConfig, settings } = model;
  const adminAgents = useAdminAgentPersonas(isAdmin);
  // In admin mode, use the admin-derived agents; otherwise use prop agents
  const agents = isAdmin ? adminAgents : propAgents;
  const activeAgentData = agents.find((agent) => agent.id === agentId);
  const isCoreToolsLocked = !isNoAgent && (activeAgentData?.coreToolsLocked ?? true);
  // Direct Chat omits project so it uses the default x-project header — this
  // routes persistence to the conversations collection.
  // Agent modes use the persona's project so persistence goes to agent_conversations.
  const agentProject = isNoAgent
    ? undefined
    : activeAgentData?.project ||
      (agentId.toUpperCase() === AGENT_IDS.CODING ? "coding" : "prism-chat");
  const agentBackgroundImage = activeAgentData?.backgroundImage || "";
  const emptyState: EmptyStateConfig = isNoAgent
    ? NONE_EMPTY_STATE
    : activeAgentData?.name
      ? {
          title: activeAgentData.name,
          subtitle: activeAgentData.description || DEFAULT_EMPTY_STATE.subtitle,
          placeholder: `Talk to ${activeAgentData.name}...`,
        }
      : DEFAULT_EMPTY_STATE;
  const toolset = useAgentToolset({
    isAdmin,
    isNoAgent,
    agentId,
    isCoreToolsLocked,
    config,
    settings,
    setSettings: model.setSettings,
    currentWorkspace,
    workspaces,
    workspacesLoaded,
    unavailableWorkspace: session.unavailableWorkspace,
    hasMessages: messages.length > 0,
  });
  const sidebar = useChatSidebar({
    initialTabKey,
    initialTabBottomKey,
    reportUrlChange,
    isAdmin,
    agentId,
    agentProject,
    conversationId,
    isWorkspaceTabVisible: toolset.isWorkspaceTabVisible,
    hasOrchestratorTools: toolset.hasOrchestratorTools,
    isToolsetKnown: toolset.hasLoadedBuiltInTools && workspacesLoaded,
    hasLoadedModelSettings: toolset.hasLoadedModelSettings,
    hasAnyMemoryModelSet: toolset.hasAnyMemoryModelSet,
    setSubAgentToolActivity: agentConversation.setSubAgentToolActivity,
  });
  const controls = useChatAgentControls();
  const resources = useAgentResources({ isAdmin, agentId, agentProject });

  // The BLOCKING question (pendingUserQuestion) is conversation state above.
  // NON-blocking questions (agent keeps working), the conversation goal, the
  // permission mode and a turn paused at its cost cap live in their own hooks.
  const nonBlockingQuestions = useNonBlockingQuestions(conversationId);
  const conversationGoal = useConversationGoal(conversationId, agentProject);
  const permissionMode = usePermissionMode(conversationId);
  const budgetPause = useBudgetPause(conversationId);

  const list = useConversationList({
    isAdmin,
    isNoAgent,
    agentId,
    agentProject,
    activeId,
    conversationIdRef: session.conversationIdRef,
    getConversationState: agentConversation.getState,
  });
  const { conversations } = list;
  // Unified "is the conversation still doing work" flag — used for the
  // stop/send button toggle and the input-box generating class.
  // True when the client is streaming (isGenerating), OR the backend
  // reports the session as active (isActive), OR background tasks remain.
  // Immediately false when the user explicitly pressed stop, bypassing
  // stale backend state that hasn't refreshed yet.
  const isConversationRunning =
    !isUserExplicitlyStopped &&
    (isGenerating || list.isActiveConversationExplicitlyActive || list.pendingBackgroundTaskCount > 0);

  const admin = useAgentChatAdmin({
    isAdmin,
    agents: adminAgents,
    initialId,
    conversation: agentConversation,
    session,
    list,
    setSettings: model.setSettings,
    setSkills: resources.setSkills,
    setRules: resources.setRules,
    setBuiltInTools: toolset.setBuiltInTools,
    sidebar,
  });

  const previewSystemPrompt = useSystemPromptPreview({
    showRaw,
    isNoAgent,
    agentId,
    messageCount: messages.length,
    disabledTools: toolset.disabledTools,
    lockedOffTools: toolset.lockedOffTools,
    settings,
    setContextBudget: agentConversation.setContextBudget,
  });

  const displayStats = useDisplayConversationStats({
    messages,
    backendConversationStats: session.backendConversationStats,
    isBackendStatsStale: session.isBackendStatsStale,
    subAgentToolActivity,
    currentTurnStart: session.currentTurnStart,
    subAgentCount: sidebar.subAgentsCount,
    maxSubAgentDepth: sidebar.maxSubAgentDepth,
    isShown: sidebar.leftTab === "settings",
  });
  // -- Live-patch sidebar conversation metadata ------------------
  useLiveListedConversation({
    list,
    activeId,
    title,
    messages,
    isNoAgent,
    backendConversationStats: session.backendConversationStats,
    isBackendStatsStale: session.isBackendStatsStale,
    clientStats: displayStats.clientStats,
  });

  const workspacePaths = useWorkspacePathIndex(currentWorkspace?.path, sidebar.workspaceTreeRefreshKey);
  const attachmentPolicy = useAttachmentPolicy({
    config: filteredConfig,
    provider: settings.provider,
    model: settings.model,
    builtInTools: toolset.builtInTools,
    disabledTools: toolset.disabledTools,
  });
  const pixelTransition = usePixelTransition();
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<ChatTranscriptHandle>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [lightboxSourceUrl, setLightboxSourceUrl] = useState<string | null>(null);
  const [navigationState, setNavigationState] = useState<MessageListNavigationState>({
    canNavigateUp: false,
    canNavigateDown: false,
  });

  // -- Turns: sending, Stop, the stream -----------------------------------
  const turns = useChatTurns({
    isAdmin,
    isNoAgent,
    agentId,
    agentProject,
    conversation: agentConversation,
    session,
    list,
    model,
    toolset,
    controls,
    sidebar,
    fileViewer,
    rules: resources.rules,
    permissionMode: permissionMode.mode,
    applyPermissionModeEvent: permissionMode.applyEvent,
    goal: conversationGoal,
    budgetPause,
    nonBlockingQuestions,
    enqueueNextTurn: nextTurnQueue.enqueue,
    composerRef,
    transcriptRef,
    isConversationRunning,
    addToast,
    reportUrlChange,
  });
  const { handleSend, handleStop } = turns;

  // -- Opening conversations ------------------------------------
  const switching = useConversationSwitching({
    isAdmin,
    isNoAgent,
    agentProject,
    initialConversationId,
    conversation: agentConversation,
    session,
    list,
    model,
    toolset,
    controls,
    workspaces,
    currentWorkspacePath: currentWorkspace?.path,
    setCurrentWorkspace,
    goal: conversationGoal,
    budgetPause,
    nonBlockingQuestions,
    pixelTransition,
    transcriptRef,
    composerRef,
    resetTokenMark: displayStats.resetTokenMark,
    reportUrlChange,
  });
  const { handleSelectConversation, handleNewChat, refreshActiveConversation } = switching;

  // Auto-send queued message when generation completes
  const sendQueuedTurn = useCallback(
    (turn: QueuedTurn) => handleSend(null, { overridePayload: turn }),
    [handleSend],
  );
  useNextTurnQueueDrain(nextTurnQueue, { isGenerating, send: sendQueuedTurn });

  // -- Memoize filtered messages for MessageList to prevent ref churn --
  const filteredMessages = useMemo(
    () => messages.filter((message) =>
      message.role === "user" ||
      message.role === "assistant" ||
      (showRaw && message.role === "system"),
    ),
    [messages, showRaw],
  );

  // Rewind to here / Fork from here / Edit as a branch.
  const conversationBranching = useConversationBranching({
    listMessages: filteredMessages,
    conversationId: activeId,
    project: agentProject || undefined,
    isGenerating,
    onRewound: () => refreshActiveConversation(session.conversationIdRef.current),
    openConversation: async (fork) => {
      await list.loadConversationsRef.current?.();
      await handleSelectConversation({ id: fork.id, title: fork.title } as AgentConversation);
    },
    send: ({ text, images, uploadedFiles }) => {
      void handleSend(null, { overridePayload: { text, images, uploadedFiles } });
    },
    onNotice: (message) => addToast(message, "success"),
    onError: (message) => addToast(message, "error"),
  });

  const messageActions = useMessageActions({
    messages,
    listMessages: filteredMessages,
    commitMessages: agentConversation.setMessages,
    isGenerating,
    conversationId: activeId,
    project: agentProject || undefined,
    resend: ({ text, images, uploadedFiles }) => {
      void handleSend(null, { overridePayload: { text, images, uploadedFiles } });
    },
    forkEdit: conversationBranching.forkForEdit,
    onError: (message) => addToast(message, "error"),
  });

  /**
   * Answer an agent question through `/agent/answer`. A 404 means the turn
   * already ended (non-blocking cards can outlive it) — the answer then
   * goes out as a normal new message so nothing the user typed is lost.
   */
  const sendQuestionAnswerOrMessage = useQuestionAnswerSender({
    getConversationId: () => session.conversationIdRef.current,
    sendAsMessage: (text) => handleSend(null, { overridePayload: { text, images: [] } }),
    notify: addToast,
  });

  const handleDeleteConversation = useConversationDeletion({
    list,
    activeId,
    isNoAgent,
    agentProject,
    addToast,
    removeToast,
    onActiveDeleted: handleNewChat,
    onActiveRestored: handleSelectConversation,
  });

  useLiveConversationSync({
    isAdmin,
    isNoAgent,
    agentProject,
    conversation: agentConversation,
    session,
    list,
    sidebar,
    turns,
    switching,
    admin,
    isConversationRunning,
    addToast,
  });

  // -- Derived view state ----------------------------------------
  // Count concurrent API calls: main generation + active sub-agents
  const activeApiCount = useMemo(
    () => (isGenerating ? 1 : 0) + Object.values(subAgentToolActivity).filter(isSubAgentWorking).length,
    [isGenerating, subAgentToolActivity],
  );
  /* Maps each sub-agent's conversationId → live StatusBarPhase so the sidebar
     HistoryItemComponent progress bars use the correct gradient palette that
     matches the conversation-view StatusBarComponent. */
  const subAgentLivePhases = useMemo(() => {
    const phaseMap = new Map<string, StatusBarPhase>();
    for (const subAgentEntry of Object.values(subAgentToolActivity)) {
      if (subAgentEntry.conversationId && subAgentEntry.phase && SUB_AGENT_LIVE_PHASES.has(subAgentEntry.phase)) {
        phaseMap.set(subAgentEntry.conversationId as string, subAgentEntry.phase as StatusBarPhase);
      }
    }
    return phaseMap;
  }, [subAgentToolActivity]);
  const knownParentConversationIds = useMemo(
    () => new Set<string>(activeId && sidebar.subAgentsCount > 0 ? [activeId] : []),
    [activeId, sidebar.subAgentsCount],
  );

  // -- Session binding: lock model/agent when a conversation is active --
  // Once a conversation has messages, the user should not switch model or agent
  // mid-conversation — the conversation data owns those values.
  const isSessionLocked = Boolean(activeId && messages.length > 0);
  // Unified source of truth: resolved agent and metadata for BOTH views.
  // Admin derives from the selected conversation's entry;
  // non-admin derives from the URL agent param and active conversation.
  const resolvedConversationAgent = isAdmin ? admin.activeAgentData : activeAgentData || null;
  const resolvedConversationMetadata = useMemo(() => {
    if (!activeId) return { project: null, username: null, agentName: null };
    const selectedConversation = conversations.find((entry) => entry.id === activeId) as
      | (UnifiedEntry & { username?: string })
      | undefined;
    return {
      project: selectedConversation?.project || agentProject || null,
      username: selectedConversation?.username || null,
      agentName: resolvedConversationAgent?.name || resolvedConversationAgent?.id || null,
    };
  }, [activeId, conversations, agentProject, resolvedConversationAgent]);

  const placeholderText = isNoAgent
    ? `Message ${settings.model || "model"}`
    : `Message ${activeAgentData?.name || "agent"}`;
  // Empty conversation → show the ambient scene (unless the agent brings
  // its own background image, the user turned scenes off, or the flat
  // Terminal view is active).
  const showsChatBackgroundScene =
    messages.length === 0 && !agentBackgroundImage && chatBackground !== "none" && !isTerminalView;
  const openMentionedFile = useCallback(
    (relativePath: string) => {
      const workspacePath = currentWorkspace?.path;
      fileViewer.openFile(workspacePath ? `${workspacePath.replace(/\/$/, "")}/${relativePath}` : relativePath);
    },
    [currentWorkspace?.path, fileViewer],
  );

  // -- Status bar (rainbow canvas above the composer) ----------------
  const { clientStats } = displayStats;
  const statusBar = useMemo(
    () =>
      deriveChatStatusBar({
        messages,
        isGenerating,
        isUserExplicitlyStopped,
        toolActivity,
        subAgentToolActivity,
        agenticProgress,
        planProposal,
        pendingApprovals,
        pendingUserQuestion,
        budgetPause: budgetPause.pause,
        pendingBackgroundTaskCount: list.pendingBackgroundTaskCount,
        isConversationExplicitlyActive: list.isActiveConversationExplicitlyActive,
        isConversationExplicitlyInactive: list.isActiveConversationExplicitlyInactive,
        liveStreamingLastChunkTime: clientStats.liveStreamingLastChunkTime,
        liveStreamingBurstTokens: clientStats.liveStreamingBurstTokens,
        liveStreamingBurstElapsed: clientStats.liveStreamingBurstElapsed,
        liveGenProgress: clientStats.liveGenProgress,
        // eslint-disable-next-line react-hooks/purity -- chunks count as flowing for a moment after the last one: time-based by design
        now: performance.now(),
      }),
    [
      messages,
      isGenerating,
      isUserExplicitlyStopped,
      toolActivity,
      subAgentToolActivity,
      agenticProgress,
      planProposal,
      pendingApprovals,
      pendingUserQuestion,
      budgetPause.pause,
      list.pendingBackgroundTaskCount,
      list.isActiveConversationExplicitlyActive,
      list.isActiveConversationExplicitlyInactive,
      clientStats.liveStreamingLastChunkTime,
      clientStats.liveStreamingBurstTokens,
      clientStats.liveStreamingBurstElapsed,
      clientStats.liveGenProgress,
    ],
  );
  // The sidebar generating-dot and the HistoryItem inline progress bar take
  // the live phase's colours from :root, written after commit.
  useEffect(() => {
    if (isAdmin) return;
    applyPhaseTokensToRoot(statusBar.phase);
  }, [isAdmin, statusBar.phase]);

  // Test-only: the characterization suite snapshots this after every commit
  // (utils/chatDebugProbe). No listener outside tests.
  useEffect(() => {
    if (!isChatDebugProbeInstalled()) return;
    publishChatDebugState({
      conversationId,
      activeId,
      title,
      isGenerating,
      isConversationRunning,
      liveConnectionState,
      messages,
      toolActivity,
      subAgentToolActivity,
      streamingOutputs,
      pendingApprovals,
      pendingUserQuestion,
      nonBlockingQuestions: nonBlockingQuestions.cards,
      planProposal,
      agenticProgress,
      contextBudget,
      goal: conversationGoal.goal,
      turnActivity,
      queuedTurns: nextTurnQueue.items,
      conversations,
      generatingConversationIds: list.generatingConversationIds,
      toasts,
    });
  });

  const transcriptListProps: MessageListProps = {
    messages: filteredMessages,
    showRaw,
    minimal: viewMode === "chat" || isTerminalView,
    systemPrompt: showRaw ? (previewSystemPrompt || settings.systemPrompt) : undefined,
    onSystemPromptEdit: isNoAgent
      ? (editedPromptValue: string) => {
          model.setSettings((previousSettings) => ({
            ...previousSettings,
            systemPrompt: editedPromptValue,
          }));
          if (activeId) {
            PrismService.patchConversation(
              activeId,
              { systemPrompt: editedPromptValue },
              agentProject || undefined,
            ).catch((error: unknown) => {
              console.error("Failed to patch conversation system prompt:", error);
            });
          }
        }
      : undefined,
    isGenerating,
    streamingOutputs,
    subAgentToolActivity,
    activeAgent: resolvedConversationAgent,
    knownPaths: workspacePaths.knownPaths,
    onMentionFileOpen: openMentionedFile,
    onOpenFileInViewer: fileViewer.openFile,
    planProposal,
    onPlanApprove: () => {
      agentConversation.setPlanProposal((previousPlan) => (previousPlan ? { ...previousPlan, status: "approved" } : null));
      PrismService.sendApprovalResponse(conversationId, true).catch(console.error);
    },
    onPlanReject: () => {
      agentConversation.setPlanProposal((previousPlan) => (previousPlan ? { ...previousPlan, status: "rejected" } : null));
      PrismService.sendApprovalResponse(conversationId, false).catch(console.error);
    },
    toolDisplayMetadataMap: toolset.toolDisplayMetadataMap,
    listKey: conversationId,
    ...messageActions.listProps,
    ...conversationBranching.listProps,
  };

  // -- Center: chat area ---------------------------------------
  // `chat-terminal-mode` is a global (non-module) class so the terminal
  // skin in each child component's CSS module can scope under it via
  // :global(.chat-terminal-mode).
  const chatContent = (
    <div className={`${chatStyles['container']}${isTerminalView ? " chat-terminal-mode" : ""}`}>
      {/* -- Chat header bar (always visible "New Conversation") -- */}
      <ChatHeaderComponent
        title={title}
        viewMode={viewMode}
        onViewModeChange={(mode: ChatViewMode) => {
          setViewMode(mode);
          if (isAdmin) {
            const searchParameters = new URLSearchParams(window.location.search);
            if (mode === "chat") {
              searchParameters.delete("view");
            } else {
              searchParameters.set("view", mode);
            }
            const queryString = searchParameters.toString();
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${queryString ? `?${queryString}` : ""}`,
            );
          }
        }}
        showConversationControls={!isAdmin}
        canNavigateUp={navigationState.canNavigateUp}
        canNavigateDown={navigationState.canNavigateDown}
        onNavigateUp={() => transcriptRef.current?.previousMessage()}
        onNavigateDown={() => transcriptRef.current?.nextMessage()}
        isNewConversationDisabled={switching.isBlankConversation}
        onNewConversation={handleNewChat}
      />
      {/* Fork lineage — a bar under the header; the header row has no room */}
      <ForkLineageComponent
        lineage={forkedFrom}
        onOpenSource={(sourceId) =>
          void handleSelectConversation({ id: sourceId } as AgentConversation)
        }
      />
      {/* Nodes tab — inline conversation graph */}
      {viewMode === "nodes" && (
        <ChatConversationGraphComponent
          conversationId={activeId}
          toolActivity={toolActivity}
          isGenerating={isGenerating}
          graphState={conversationGraphState}
        />
      )}
      {viewMode !== "nodes" && !isAdmin && (
        <PixelTransitionComponent
          phase={pixelTransition.phase}
          duration={pixelTransition.duration}
          maxBlockSize={72}
          onComplete={() => {
            if (pixelTransition.phase === "in") {
              pixelTransition.setPhase(null);
            }
          }}
          targetRef={transcriptScrollRef}
        />
      )}
      {/* Messages (hidden when Nodes tab is active) */}
      {isAdmin && viewMode !== "nodes" ? (
        <AdminConversationViewComponent
          bodyRef={admin.viewerBodyRef}
          conversationId={activeId}
          isLoading={admin.isLoadingDetail}
          messages={filteredMessages}
          showRaw={showRaw}
          minimal={viewMode === "chat" || isTerminalView}
          isGenerating={isGenerating}
          activeAgent={resolvedConversationAgent}
          systemPrompt={
            showRaw
              ? settings.systemPrompt ||
                admin.conversationSystemPrompt ||
                messages.find((message) => message.role === "system" && !message.deleted)?.content
              : undefined
          }
          toolDisplayMetadataMap={toolset.toolDisplayMetadataMap}
        />
      ) : (
        <ChatTranscriptComponent
          scrollElementRef={transcriptScrollRef}
          handleRef={transcriptRef}
          isHidden={viewMode === "nodes"}
          isTerminalView={isTerminalView}
          backgroundImage={agentBackgroundImage}
          scene={showsChatBackgroundScene ? <ChatBackgroundComponent background={chatBackground} /> : null}
          emptyState={
            messages.length === 0 && activeAgentData ? (
              <EmptyStateComponent
                className={showsChatBackgroundScene ? chatStyles['empty-state-over-scene'] : ""}
                icon={<BadgeComponent type="agent" agent={activeAgentData} size={80} iconSize={40} animation />}
                title={emptyState.title}
                subtitle={emptyState.subtitle}
              >
                <BadgeComponent
                  type="tools"
                  count={toolset.selectableConfigurableTools.length + toolset.selectableCoreToolsCount}
                />
              </EmptyStateComponent>
            ) : null
          }
          listProps={transcriptListProps}
          followTriggers={[messages, toolActivity, planProposal, pendingApprovals]}
          onNavigationStateChange={setNavigationState}
        >
          {messageActions.confirmDialog}
          {conversationBranching.dialog}
          {!isAdmin && (
            <ApprovalsAndQuestionsComponent
              conversationId={conversationId}
              approvals={pendingApprovals}
              setApprovals={agentConversation.setPendingApprovals}
              workspaceRoot={currentWorkspace?.path ?? null}
              question={pendingUserQuestion}
              onQuestionAnswered={() => agentConversation.setPendingUserQuestion(null)}
              sendAnswer={sendQuestionAnswerOrMessage}
              budgetPause={budgetPause}
              goal={conversationGoal.goal}
              onGoalChange={conversationGoal.hydrate}
              onStop={handleStop}
              onNotify={addToast}
            />
          )}
        </ChatTranscriptComponent>
      )}

      <LiveConnectionIndicatorComponent state={liveConnectionState} />

      {!isAdmin && (
        <ChatStatusBarComponent
          statusBar={statusBar}
          iteration={agenticProgress?.iteration || 0}
          maxIterations={Number.isFinite(controls.maxIterations) ? controls.maxIterations : undefined}
          initialElapsedMilliseconds={statusBarInitialElapsedMilliseconds}
        />
      )}

      {isAdmin && <ReadOnlyGoalAndBudgetComponent goal={conversationGoal.goal} contextBudget={contextBudget} />}

      {!isAdmin && (
        <div
          className={`${chatStyles['input-wrapper']} ${!settings.provider || !settings.model || list.isActiveConversationSubAgent ? chatStyles['input-wrapper-disabled'] : ""}`}
        >
          <PinnedQuestionsComponent questions={nonBlockingQuestions} sendAnswer={sendQuestionAnswerOrMessage} />
          <GoalAndPlanPanelsComponent
            goal={conversationGoal}
            turnActivity={turnActivity}
            models={config?.textToText?.models}
            canCreateGoal={!!conversationId && !isNoAgent}
          />
          <ComposerComponent
            handleRef={composerRef}
            placeholder={placeholderText}
            isConversationRunning={isConversationRunning}
            rules={resources.rules}
            workspacePaths={workspacePaths}
            attachmentPolicy={attachmentPolicy}
            permissionMode={isNoAgent ? null : permissionMode}
            contextBudget={contextBudget}
            queue={nextTurnQueue}
            onSend={(options) => void handleSend(null, options)}
            onPreviewImage={setLightboxSourceUrl}
            onNotify={addToast}
          />
        </div>
      )}
      {!isAdmin && lightboxSourceUrl && (
        <ImagePreviewComponent
          src={lightboxSourceUrl}
          onClose={() => setLightboxSourceUrl(null)}
          onUseAnnotated={(dataUrl: string) => {
            composerRef.current?.addImage(dataUrl);
            setLightboxSourceUrl(null);
          }}
        />
      )}
    </div>
  );

  // -- Layout ---------------------------------------------------
  return (
    <>
      <ThreePanelLayout
        className="chat-conversation-component"
        navSidebar={
          isAdmin ? null : (
            <NavigationSidebarComponent
              mode="user"
              isGenerating={isGenerating}
              activeApiCount={activeApiCount}
            />
          )
        }
        leftPanel={
          <ChatSidebarTopComponent
            sidebar={sidebar}
            isAdmin={isAdmin}
            isNoAgent={isNoAgent}
            canSpawnSubAgents={activeAgentData?.canSpawnSubAgents || false}
            model={model}
            controls={controls}
            isWorkspaceTabVisible={toolset.isWorkspaceTabVisible}
            hasOrchestratorTools={toolset.hasOrchestratorTools}
            workspaceCount={workspaces.length}
            currentWorkspacePath={currentWorkspace?.path}
            unavailableWorkspace={session.unavailableWorkspace}
            hasMessages={messages.length > 0}
            conversationStats={displayStats.stats}
            conversationMetadata={resolvedConversationMetadata}
            requestCount={session.backendConversationStats?.requestCount || 0}
            conversationId={conversationId}
            requestsRefreshKey={session.requestsRefreshKey}
            activeId={activeId}
            toolActivity={toolActivity}
            isGenerating={isGenerating}
            conversationGraphState={conversationGraphState}
            subAgentToolActivity={subAgentToolActivity}
            onMentionFile={(filePath) => composerRef.current?.insertMention(filePath)}
            onOpenFile={fileViewer.openFile}
          />
        }
        leftPanelBottom={
          <ChatSidebarBottomComponent
            sidebar={sidebar}
            toolset={toolset}
            resources={resources}
            isAdmin={isAdmin}
            isNoAgent={isNoAgent}
            agentId={agentId}
            agentProject={agentProject}
            conversationId={conversationId}
            isFunctionCallingDisabled={!settings.functionCallingEnabled}
            isSessionLocked={isSessionLocked}
          />
        }
        leftTitle={undefined}
        fileViewerPanel={
          !isAdmin &&
          !isNoAgent &&
          currentWorkspace &&
          toolset.hasFileOperations && (
            <FileViewerPanelComponent
              openFiles={fileViewer.openFiles}
              activeFileId={fileViewer.activeFileId}
              onSelectFile={fileViewer.setActiveFileId}
              onCloseFile={fileViewer.closeFile}
              onFileNotFound={fileViewer.dropMissingFile}
              isOpen={fileViewer.openFiles.length > 0}
              width={fileViewer.width}
              onWidthChange={fileViewer.changeWidth}
              refreshKey={fileViewer.refreshKey}
              onMentionLines={(filePath: string, startLine: number, endLine: number) =>
                composerRef.current?.insertMention(filePath, { start: startLine, end: endLine })
              }
            />
          )
        }
        rightPanel={
          isAdmin ? (
            <HistoryPanel
              conversations={admin.entries as (AgentConversation | Conversation)[]}
              activeId={activeId}
              onSelect={(entry: AgentConversation | Conversation) => {
                const unifiedEntry = entry as UnifiedEntry;
                admin.selectEntry(unifiedEntry.id || "", unifiedEntry._source || "conversation");
              }}
              readOnly
              showProject
              showUsername
              newIds={admin.newIds}
              disableNew
              newLabel="New Conversation"
              emptyText="No conversations found"
              searchText="Search conversations..."
              countLabel="conversations"
              generatingConversationIds={list.generatingConversationIds}
              hasMore={admin.entriesHasMore}
              loadingMore={admin.entriesLoading}
              onLoadMore={admin.loadMoreEntries}
              filterStorageKey={LOCAL_STORAGE_KEY_ADMIN_CHAT_FILTERS}
              dateStorageKey={LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE}
              dateRange={admin.dateRange}
              onDateChange={admin.setDateRange}
              initialProviders={admin.providerFilter ? [admin.providerFilter] : undefined}
              initialSearch={admin.traceFilter || undefined}
              knownParentConversationIds={knownParentConversationIds}
              subAgentLivePhases={subAgentLivePhases}
            />
          ) : (
            <HistoryPanel
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
              onDelete={handleDeleteConversation}
              disableNew={switching.isBlankConversation}
              newLabel="New Conversation"
              emptyText="No recent conversations"
              searchText="Search conversations..."
              countLabel="conversations"
              generatingConversationIds={list.generatingConversationIds}
              knownParentConversationIds={knownParentConversationIds}
              hasMore={list.conversationsHasMore}
              loadingMore={list.conversationsLoading}
              onLoadMore={list.loadMoreConversations}
              filterStorageKey={LOCAL_STORAGE_KEY_CHAT_FILTERS}
              dateStorageKey={LOCAL_STORAGE_KEY_DATE_RANGE}
              subAgentLivePhases={subAgentLivePhases}
              favorites={conversationFavorites.keys}
              onToggleFavorite={conversationFavorites.toggle}
            />
          )
        }
        rightTitle={
          isAdmin
            ? `${admin.entries.length}${admin.entriesHasMore ? "+" : ""} Conversations`
            : `${conversations.length}${list.conversationsHasMore ? "+" : ""} Conversations`
        }
        conversationType="agent"
        headerCenter={
          <div className={layoutHeaderStyles["header-center-group"]}>
            {isAdmin ? (
              admin.agents.length > 1 && (
                <AgentPickerComponent
                  agents={admin.agents as AgentPersona[]}
                  activeAgentId={admin.activeAgentId}
                  onSelect={admin.selectAgent}
                />
              )
            ) : (
              agents.length > 1 && (
                <AgentPickerComponent
                  agents={agents}
                  activeAgentId={agentId}
                  onSelect={(id: string) => reportUrlChange({ kind: "agent", agentId: id })}
                  disabled={isGenerating}
                />
              )
            )}
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={{ provider: settings.provider, model: settings.model }}
              disabled={isAdmin || isGenerating}
              onSelectModel={isAdmin ? undefined : (provider: string, modelName: string) => {
                model.selectModel(provider, modelName, { id: activeId, project: agentProject });
                reportUrlChange({ kind: "model", provider, model: modelName });
              }}
              favorites={model.favoriteKeys}
              onToggleFavorite={model.toggleFavoriteModel}
            />
          </div>
        }
        headerMeta={null}
        headerControls={null}
      >
        {chatContent}
      </ThreePanelLayout>
      <ToastComponent toasts={toasts} onRemove={removeToast} />
    </>
  );
}
