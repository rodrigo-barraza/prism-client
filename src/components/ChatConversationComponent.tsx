"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  BotMessageSquare,
  Paperclip,
  X,
  ClipboardList,
  Zap,
  GitBranch,
  Repeat,
  Activity,
  CornerDownLeft,
  Send,
  Square,
  File,
  FolderOpen,
  FolderTree,
  Plus,
  ShieldCheck,
  FileText,
  FileSpreadsheet,
  Volume2,
  Video,
  ChevronUp,
  ChevronDown,
  Loader,
  MessageSquare,
  Network,
} from "lucide-react";
import PrismService from "../services/PrismService";
import IrisService, {
  IrisCollectionChangeEvent,
} from "../services/IrisService";
import ToolsApiService from "../services/ToolsApiService";
import {
  Message,
  PrismConfig,
  AgentConversation,
  Skill,
  Rule,
  ToolCallEvent,
  CustomAgent,
  PrismSettings,
  Conversation,
  AgentPersona,
  ToolSchema,
  SubAgentGenerationProgress,
  BackgroundUsage,
  ConversationStats,
  ModelOption,
  SSEData,
  ContentSegment,
  Favorite,
  Workflow,
  TransformedRequestItem,
  LlamaCppServerProps,
} from "../types/types";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import HistoryPanel from "./HistoryPanelComponent";
import SettingsPanel, {
  ConversationStats as DisplayConversationStats,
} from "./SettingsPanelComponent";
import ModelInfoPanel from "./ModelInfoPanelComponent";
import SkillsPanel from "./SkillsPanelComponent";
import ToolSelectionComponent from "./ToolSelectionComponent";
import RulesPanel from "./RulesPanelComponent";
import MemoriesPanel from "./MemoriesPanelComponent";
import TasksPanel from "./TasksPanelComponent";

import SubAgentsPanel from "./SubAgentsPanelComponent";
import ParametersPanelComponent from "./ParametersPanelComponent";
import RequestsTableComponent from "./RequestsTableComponent";
import WorkspaceTreePanelComponent from "./WorkspaceTreePanelComponent";
import WorkspaceSwitcherButtonComponent from "./WorkspaceSwitcherButtonComponent";
import SidebarTabHeaderComponent from "./SidebarTabHeaderComponent";
import FileViewerPanelComponent from "./FileViewerPanelComponent";
import MessageList, { prepareDisplayMessages } from "./MessageListComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";

import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ApprovalCardComponent from "./ApprovalCardComponent";
import UserQuestionCardComponent from "./UserQuestionCardComponent";

import StatusBarComponent, { type StatusBarPhase, PHASE_GRADIENT_STOPS } from "./StatusBarComponent";
import PixelTransitionComponent from "./PixelTransitionComponent";
import ChatConversationGraphComponent from "./ChatConversationGraphComponent";
import useConversationGraphData from "../hooks/useConversationGraphData";
import ChatViewModeControlComponent from "./ChatViewModeControlComponent";
import type { ChatViewMode } from "./ChatViewModeControlComponent";

import { buildToolSchemas } from "../utils/FunctionCallingUtilities";
import {
  applyToolExecutionToMessages,
  applyToolExecutionToActivity,
  applyToolCallToMessages,
} from "../utils/toolCallStateUpdaters";

import useConversationStats from "../hooks/useConversationStats";
import { generateUUID, renderToolName } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES, SERVER_SENT_EVENT_TYPES, STATUS_MESSAGES, DEFAULT_TOPOLOGY, DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { mergeUsedToolsWithSubAgents, toolCountsToUsedTools, resolveDefaultModel, buildDateRangeParams } from "../utils/utilities";
import {
  PROJECT_AGENT,
  SETTINGS_DEFAULTS,
  SK_MODEL_MEMORY_AGENT,
  SK_MODEL_MEMORY_AGENT_PREFIX,
  MAX_TOOL_ITERATIONS,
  LS_FILE_VIEWER_WIDTH,
  LS_CHAT_FILTERS,
  LS_ADMIN_CHAT_FILTERS,
  AGENT_IDS,
  AGENTLESS_AGENT,
  LS_CRON_JOB_NOTIFICATIONS_COUNT,
  LS_CRITIC_GATE_ENABLED,
  LOCAL_STORAGE_AUTO_APPROVE_ENABLED,
  LS_AGENT_MAX_ITERATIONS,
  LS_AGENT_MAX_SUB_AGENT_ITERATIONS,
  LS_AGENT_MAX_RECURSION_DEPTH,
  EV_SIDEBAR_TAB_CHANGE,
  EV_SIDEBAR_TAB_BOTTOM_CHANGE,
  EV_VIEW_MODE_CHANGE,
  EV_USER_TYPING,
  EV_CONVERSATION_CHANGE,
  EV_AGENT_SWITCH,
  EV_MODEL_CHANGE,
  EV_CRON_JOB_SCHEDULED,
  FALLBACK_THINKING_PATTERNS,
  LS_WORKSPACE_TOGGLE_PREFERENCE,
} from "../constants";
import adminPageStyles from "../app/admin/chat/page.module.css";
import requestsTableStyles from "./RequestsTableComponent.module.css";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import useProjectFilter from "../hooks/useProjectFilter";
import { getErrorMessage } from "../utils/errorMessage";
import { useSearchParams, useRouter } from "next/navigation";
import chatStyles from "./ChatAreaComponent.module.css";
import ChatInputButton from "./ChatInputButtonComponent";
import {
  ButtonComponent,
  EmptyStateComponent,
  IconButtonComponent,
  SelectComponent,
  layoutHeaderStyles,
  TabBarComponent,
  tabBarStyles,
  ToastComponent,
  useToast,
} from "@rodrigo-barraza/components-library";
import { ErrorMessage } from "./StateMessageComponent";
import useToolToggles from "../hooks/useToolToggles";
import useModelMemory from "../hooks/useModelMemory";
import AgentPickerComponent from "./AgentPickerComponent";
import BadgeComponent, { registerModelLabels } from "./BadgeComponent";
import WorkspaceSelectorComponent from "./WorkspaceSelectorComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import WorkspaceService from "../services/WorkspaceService";
import {
  serializeEditable,
  flattenTree,
  detectMentionToken,
  filterMentionResults,
  createMentionBadge as _createMentionBadge,
  createSlashCommandBadge,
  extractSlashCommandNames,
  placeCaretAfter,
  applyMentionToTextNode,
} from "../utils/mentionUtils";
import SoundService from "../services/SoundService";

const DEFAULT_EMPTY_STATE: EmptyStateConfig = {
  title: "Agent",
  subtitle: "AI-powered agent with tool access.",
  placeholder: "Send a message...",
};

// -- Glitch text generator (same as HistoryPanel) ----------------
const SYMBOLS = "!@#$%^&*†‡§¶∆∇≈≠±×÷√∫∑∏⊗⊕⊘⊙◊♠♣♥♦★☆◈⬡⬢⟁⟐⧫⬟";
const ZALGO = [
  "\u0300",
  "\u0301",
  "\u0302",
  "\u0303",
  "\u0304",
  "\u0305",
  "\u0306",
  "\u0307",
  "\u0308",
  "\u0309",
  "\u030A",
  "\u030B",
  "\u030C",
  "\u030D",
  "\u030E",
  "\u030F",
  "\u0310",
  "\u0311",
  "\u0312",
  "\u0313",
  "\u0314",
  "\u0315",
  "\u0316",
  "\u0317",
  "\u0318",
  "\u0319",
  "\u031A",
  "\u031B",
  "\u0320",
  "\u0321",
  "\u0322",
  "\u0323",
  "\u0324",
  "\u0325",
  "\u0326",
  "\u0327",
  "\u0328",
  "\u0329",
  "\u032A",
  "\u032B",
  "\u032C",
  "\u032D",
  "\u0330",
  "\u0331",
  "\u0332",
  "\u0333",
  "\u0334",
  "\u0335",
  "\u0336",
  "\u0340",
  "\u0341",
  "\u0342",
  "\u0343",
  "\u0344",
  "\u0345",
  "\u0346",
  "\u0350",
  "\u0351",
  "\u0352",
  "\u0353",
  "\u0354",
  "\u0355",
  "\u0356",
];
const GLITCH_POOL = SYMBOLS + "ΣΩΨΞΘΔΛΠΦψξθδλπφ¿¡«»░▒▓█▄▀■□▪▫▬▲▼◆●○◎◇";

function glitchText(length = 6) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += GLITCH_POOL[Math.floor(Math.random() * GLITCH_POOL.length)];
    const marks = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < marks; j++) {
      result += ZALGO[Math.floor(Math.random() * ZALGO.length)];
    }
  }
  return result;
}

// Tools that are always on and non-toggleable in the agent view
const AGENT_LOCKED_TOOLS = new Set(["Tool Calling"]);

// Filesystem-mutating tools that should trigger a workspace tree refresh
const WORKSPACE_FS_TOOLS: Set<string> = new Set([
  TOOL_NAMES.WRITE_FILE,
  TOOL_NAMES.REPLACE_IN_FILE,
  TOOL_NAMES.PATCH_FILE,
  TOOL_NAMES.MOVE_FILE,
  TOOL_NAMES.DELETE_FILE,
  TOOL_NAMES.EXECUTE_COMMAND,
  TOOL_NAMES.EDIT_NOTEBOOK,
]);

const BOTTOM_PANEL_TABS = new Set(["tools", "skills", "rules", "memories", "tasks"]);



const ADMIN_POLL_INTERVAL = 5000;

const ADMIN_ALL_AGENT = {
  id: "ALL",
  name: "All",
  description: "View all conversations.",
  project: "",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

const ADMIN_NONE_AGENT = {
  id: AGENTLESS_AGENT.id,
  name: AGENTLESS_AGENT.name,
  description:
    "A straightforward conversation with the AI — no automated workflows, just you and the model.",
  project: "direct",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

type UnifiedEntry = (Conversation | AgentConversation) & {
  _source?: "conversation" | "agent_conversation";
};

interface EmptyStateConfig {
  title: string;
  subtitle: string;
  placeholder: string;
}

/** Agentless empty state — raw chat via /chat endpoint, no agentic loop. */
const NONE_EMPTY_STATE: EmptyStateConfig = {
  title: "Agentless Chat",
  subtitle:
    "You're chatting directly with the AI model — no automated tools or workflows are running behind the scenes. Think of it as a simple, open conversation where you ask questions and get answers.",
  placeholder: "Send a message...",
};

interface QueuedNextTurn {
  text: string;
  images: string[];
}

interface ViewerOpenFile {
  id: string;
  path: string;
}

interface SubAgentActivityEntry {
  phase?: string;
  currentTool?: string | null;
  iteration?: number;
  subAgentId?: string;
  toolName?: string;
  error?: string;
  phaseProgress?: number;
  totalOutputTokens?: number;
  tokPerSec?: number;
  toolCount?: number;
  toolNames?: Record<string, number>;
  toolCalls?: ToolCallEvent[];
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | Record<string, number>
    | ToolCallEvent[];
}

/** Approval request from an agentic tool call. */
interface PendingApproval {
  id: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  tier?: 1 | 2 | 3;
  status: "pending" | "approved" | "rejected";
}

/** Snapshot of UI state stored when a background-generating conversation is paused. */
interface ConversationSnapshot {
  messages: ClientMessage[];
  title: string;
  toolActivity: ToolCallEvent[];
  subAgentToolActivity: Record<string, SubAgentActivityEntry>;
  streamingOutputs: Map<string, string>;
  pendingApprovals: PendingApproval[];
  pendingUserQuestion: {
    questions?: unknown[];
    context?: string;
  } | null;
  planProposal: { plan: string; steps?: string[]; status?: "pending" | "approved" | "rejected" | "executing" } | null;
  agenticProgress: { iteration: number; maxIterations: number } | null;
  settings: Record<string, unknown>;
  backendConversationStats: ConversationStats | null;
  isBackendStatsStale?: boolean;
  workspaceRoot: string | null;
  disabledTools: string[];
}

interface ClientMessage extends Message {
  _liveModelNames?: string[];
  _liveModalities?: Record<string, number>;
  _backgroundUsage?: BackgroundUsage & { requests?: number };
  _streamingOutputCharacters?: number;
  _streamingStartTime?: number;
  _streamingLastChunkTime?: number;
  _streamingBurstTokens?: number;
  _streamingBurstElapsed?: number;
  _processingStartTime?: number;
  _ttftSamples?: number[];
  _statusProgress?: number | Record<string, unknown>;
  _subAgentGenerationProgress?: Record<string, SubAgentGenerationProgress>;
  _subAgentTokens?: {
    input?: number;
    output?: number;
    requests?: number;
  };
  _liveGenProgress?: {
    inputTokens?: number;
    outputTokens?: number;
    tokPerSec?: number;
    totalOutputTokens?: number;
    cost?: number;
    requests?: number;
    activeRequests?: number;
    totalTokens?: number;
    avgTtft?: number;
    timestamp?: number;
  };
  _fromSnapshot?: boolean;
  _snapshot?: Record<string, unknown>;
  statusPhase?: string;
  synthetic?: boolean;
  /** UI-only status marker for in-flight messages (e.g. 'thinking', 'processing') */
  status?: string;
}

export interface ChatConversationComponentProps {
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
}

export default function ChatConversationComponent({
  agentId: propAgentId = AGENT_IDS.CODING,
  agents: propAgents = [],
  initialFcEnabled = false,
  initialThinkingEnabled = false,
  initialModel = null,
  initialConversationId = null,
  initialTabKey = null,
  initialTabBottomKey = null,
  initialViewMode = null,
  isAdmin = false,
  initialId = null,
}: ChatConversationComponentProps) {
  // Track whether the URL model param has been applied — prevents re-apply on re-render
  const urlModelAppliedRef = useRef<boolean>(false);
  // Track whether the URL conversation param has been consumed
  const urlConversationAppliedRef = useRef<boolean>(false);

  // -- Admin mode hooks (called unconditionally per Rules of Hooks) --
  const adminHeaderContext = useAdminHeader();
  const adminProjectFilterHook = useProjectFilter(isAdmin);
  const adminSearchParams = useSearchParams();
  const adminRouter = useRouter();

  // -- Admin mode state --
  const [adminAgents, setAdminAgents] = useState<
    Array<
      Partial<AgentPersona> & {
        id: string;
        name: string;
        description: string;
        project?: string;
        toolCount: number;
        custom: boolean;
        icon: string;
        color: string;
      }
    >
  >([]);
  const [adminEntries, setAdminEntries] = useState<UnifiedEntry[]>([]);
  const [adminEntriesHasMore, setAdminEntriesHasMore] = useState(false);
  const [adminEntriesLoading, setAdminEntriesLoading] = useState(false);
  const adminEntriesPageRef = useRef<number>(1);
  const adminEntriesTotalRef = useRef<number>(0);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSelectedSource, setAdminSelectedSource] = useState<
    "conversation" | "agent_conversation" | null
  >(null);
  const [adminLoadingDetail, setAdminLoadingDetail] = useState(false);
  const [adminNewIds, setAdminNewIds] = useState<Set<string>>(new Set());
  const [adminGeneratingCount, setAdminGeneratingCount] = useState(0);
  const [adminChangeStreamsActive, setAdminChangeStreamsActive] = useState(false);
  const [adminConversationSystemPrompt, setAdminConversationSystemPrompt] = useState<string | null>(null);
  const adminKnownIdsRef = useRef<Set<string> | null>(null);
  const adminLastFingerprintRef = useRef<string>("");
  const adminAutoSelectedRef = useRef<boolean>(!!initialId);
  const adminViewerBodyRef = useRef<HTMLDivElement | null>(null);
  const adminFingerprintRef = useRef<string>("");
  const [adminFingerprint, setAdminFingerprint] = useState("");

  // Derive admin filter values from hooks
  const adminProjectFilter = isAdmin ? adminProjectFilterHook.projectFilter : null;
  const adminProjectOptions = isAdmin ? adminProjectFilterHook.projectOptions : [];
  const adminHandleProjectChange = adminProjectFilterHook.handleProjectChange;
  const adminProviderFilter = isAdmin ? (adminSearchParams.get("provider") || null) : null;
  const adminModelFilter = isAdmin ? (adminSearchParams.get("model") || null) : null;
  const adminAgentParam = isAdmin ? (adminSearchParams.get("agent") || null) : null;
  const adminDateRange = isAdmin ? adminHeaderContext.dateRange : { from: "", to: "" };
  const adminTraceFilter = isAdmin ? adminHeaderContext.traceFilter : null;
  const adminActiveAgentId = adminAgentParam || "ALL";
  const adminIsAllMode = adminActiveAgentId === "ALL";
  const adminIsNoAgent = adminActiveAgentId === AGENT_IDS.NONE;
  const adminIsAgentMode = !adminIsAllMode && !adminIsNoAgent;

  // In admin mode, use the admin-derived agents; otherwise use prop agents
  const agents = isAdmin ? adminAgents : propAgents;

  const agentId = propAgentId;
  const isNoAgent = isAdmin ? false : agentId === AGENT_IDS.NONE;
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
          subtitle:
            activeAgentData.description || DEFAULT_EMPTY_STATE.subtitle,
          placeholder: `Talk to ${activeAgentData.name}...`,
        }
      : DEFAULT_EMPTY_STATE;

  const { currentWorkspace, setCurrentWorkspace, workspaces } = useWorkspace();

  // -- State ----------------------------------------------------
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [queuedNextTurn, setQueuedNextTurn] = useState<QueuedNextTurn | null>(
    null,
  );
  const inputValueRef = useRef<string>("");
  const [hasInput, setHasInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toolActivity, setToolActivity] = useState<ToolCallEvent[]>([]);
  const [streamingOutputs, setStreamingOutputs] = useState<Map<string, string>>(
    new Map(),
  );
  const [conversationId, setConversationId] = useState(() => generateUUID());
  const [traceId, setTraceId] = useState<string | null>(() => generateUUID());
  const [conversations, setConversations] = useState<Array<AgentConversation | Conversation>>(
    [],
  );
  const conversationsCursorRef = useRef<string | null>(null);
  const [conversationsHasMore, setConversationsHasMore] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Single source of truth for the conversation graph.
  // Called unconditionally so the SSE subscription stays alive
  // across tab switches, keeping both the sidebar and main-content
  // graph instances in sync.
  const conversationGraphState = useConversationGraphData(activeId, isGenerating);

  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [title, setTitle] = useState(isNoAgent ? "Agentless Chat" : "Agent");
  const [leftTab, setLeftTab] = useState(() => {
    if (initialTabKey && !BOTTOM_PANEL_TABS.has(initialTabKey)) {
      return initialTabKey;
    }
    return "settings";
  });
  const [chatAreaTab, setChatAreaTab] = useState<"chat" | "nodes">(() => {
    if (initialViewMode === "nodes") return "nodes";
    return "chat";
  });
  const [showRaw, setShowRaw] = useState(() => {
    return initialViewMode === "raw";
  });
  const [builtInTools, setBuiltInTools] = useState<ToolSchema[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [_injectedSkills, setInjectedSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  // Active rules are tracked as inline badges in the contentEditable DOM.
  // At send time we extract names via extractSlashCommandNames().
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashCommandQuery, setSlashCommandQuery] = useState("");
  const [memoriesRefreshKey, setMemoriesRefreshKey] = useState(0);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [workspaceTreeRefreshKey, setWorkspaceTreeRefreshKey] = useState(0);
  // When a loaded conversation references a workspace that isn't currently connected,
  // store the path so the UI can show "workspace not available" instead of looping errors.
  const [unavailableWorkspace, setUnavailableWorkspace] = useState<
    string | null
  >(null);

  const [previewSystemPrompt, setPreviewSystemPrompt] = useState<string | null>(null);

  // -- Notifications & Toasts ------------------------------------
  const { toasts, addToast: originalAddToast, removeToast } = useToast();
  const addToast = originalAddToast as (
    message: React.ReactNode,
    type?: "success" | "warning" | "error" | "info" | string,
    duration?: number,
  ) => number;
  const pendingDeletionsRef = useRef<
    Map<
      string,
      {
        timeoutId: NodeJS.Timeout;
        conversationEntry: AgentConversation | Conversation;
        wasActive: boolean;
      }
    >
  >(new Map());

  // Clean up deletion timeouts on unmount
  useEffect(() => {
    return () => {
      pendingDeletionsRef.current.forEach((pending) => {
        clearTimeout(pending.timeoutId);
      });
    };
  }, []);

  // -- File viewer pane state (VS Code-style read-only viewer) --
  const [viewerOpenFiles, setViewerOpenFiles] = useState<ViewerOpenFile[]>([]);
  const [viewerActiveFileId, setViewerActiveFileId] = useState<string | null>(
    null,
  );
  const [viewerRefreshKey, setViewerRefreshKey] = useState(0);
  const viewerOpenFilesRef = useRef<ViewerOpenFile[]>(viewerOpenFiles);
  viewerOpenFilesRef.current = viewerOpenFiles;
  const [viewerWidth, setViewerWidth] = useState(() => {
    if (typeof window === "undefined") return 500;
    const stored = localStorage.getItem(LS_FILE_VIEWER_WIDTH);
    return stored ? Math.max(300, Math.min(Number(stored), 1200)) : 500;
  });
  const [totalMemoriesCount, setTotalMemoriesCount] = useState(0);
  const [memoriesHeaderActions, setMemoriesHeaderActions] =
    useState<ReactNode>(null);
  const [subAgentsCount, setSubAgentsCount] = useState(0);
  const [maxSubAgentDepth, setMaxSubAgentDepth] = useState(0);
  const [subAgentsHeaderActions, setSubAgentsHeaderActions] =
    useState<ReactNode>(null);
  const [skillsHeaderActions, setSkillsHeaderActions] =
    useState<ReactNode>(null);
  const [rulesHeaderActions, setRulesHeaderActions] = useState<ReactNode>(null);
  const [tasksHeaderActions, setTasksHeaderActions] = useState<ReactNode>(null);
  const [workspaceTreeStats, setWorkspaceTreeStats] = useState<{
    totalEntries: number;
    truncated: boolean;
  } | null>(null);
  const [subAgentToolActivity, setSubAgentToolActivity] = useState<
    Record<string, SubAgentActivityEntry>
  >({});

  // Track which tabs have received new data the user hasn't viewed yet
  const [newDataTabs, setNewDataTabs] = useState(new Set());
  const leftTabRef = useRef<string>(leftTab);
  leftTabRef.current = leftTab;
  const [leftTabBottom, setLeftTabBottom] = useState(() => {
    if (initialTabBottomKey) {
      return initialTabBottomKey;
    }
    if (initialTabKey && BOTTOM_PANEL_TABS.has(initialTabKey)) {
      return initialTabKey;
    }
    return "tools";
  });
  const leftTabBottomRef = useRef<string>(leftTabBottom);
  leftTabBottomRef.current = leftTabBottom;

  useEffect(() => {
    if (leftTab) {
      window.dispatchEvent(
        new CustomEvent(EV_SIDEBAR_TAB_CHANGE, {
          detail: { tab: leftTab },
        }),
      );
    }
  }, [leftTab]);

  useEffect(() => {
    if (leftTabBottom) {
      window.dispatchEvent(
        new CustomEvent(EV_SIDEBAR_TAB_BOTTOM_CHANGE, {
          detail: { tabBottom: leftTabBottom },
        }),
      );
    }
  }, [leftTabBottom]);

  useEffect(() => {
    const currentViewMode = chatAreaTab === "nodes" ? "nodes" : showRaw ? "raw" : "clean";
    window.dispatchEvent(
      new CustomEvent(EV_VIEW_MODE_CHANGE, {
        detail: { viewMode: currentViewMode },
      }),
    );
  }, [chatAreaTab, showRaw]);

  useEffect(() => {
    if (initialTabKey) {
      if (BOTTOM_PANEL_TABS.has(initialTabKey)) {
        if (initialTabKey !== leftTabBottom) setLeftTabBottom(initialTabKey);
      } else {
        if (initialTabKey !== leftTab) setLeftTab(initialTabKey);
      }
    }
  }, [initialTabKey]);

  useEffect(() => {
    if (initialTabBottomKey) {
      if (initialTabBottomKey !== leftTabBottom) setLeftTabBottom(initialTabBottomKey);
    }
  }, [initialTabBottomKey]);

  /** Mark a tab as having new unseen data (only if user isn't already viewing it). */
  const markTabNew = useCallback((tabKey: string) => {
    if (leftTabRef.current === tabKey || leftTabBottomRef.current === tabKey)
      return;
    setNewDataTabs((previousNewDataTabs) => {
      if (previousNewDataTabs.has(tabKey)) return previousNewDataTabs;
      const next = new Set(previousNewDataTabs);
      next.add(tabKey);
      return next;
    });
  }, []);

  // Ephemeral tab switch — temporarily show a tab then revert after a delay.
  // Cancels any pending revert to avoid stacking timeouts.
  const tabRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTabTemporarily = useCallback(
    (targetTab: string, delayMs = 5000) => {
      const isBottomTab = BOTTOM_PANEL_TABS.has(targetTab);
      const currentRef = isBottomTab ? leftTabBottomRef : leftTabRef;
      const updateTabState = isBottomTab ? setLeftTabBottom : setLeftTab;
      const previousTab = currentRef.current;
      if (previousTab === targetTab) return;
      // Cancel any pending revert from a previous ephemeral switch
      if (tabRevertTimerRef.current) clearTimeout(tabRevertTimerRef.current);
      updateTabState(targetTab);
      tabRevertTimerRef.current = setTimeout(() => {
        tabRevertTimerRef.current = null;
        // Only revert if the user hasn't manually navigated away
        if (currentRef.current === targetTab) {
          updateTabState(previousTab);
        }
      }, delayMs);
    },
    [],
  );

  // Count concurrent API calls: main generation + active sub-agents
  const activeApiCount = useMemo(() => {
    const activeSubAgents = Object.values(subAgentToolActivity).filter(
      (subAgent: SubAgentActivityEntry) =>
        subAgent.currentTool || subAgent.phase === "generating" || subAgent.phase === "thinking",
    ).length;
    return (isGenerating ? 1 : 0) + activeSubAgents;
  }, [isGenerating, subAgentToolActivity]);
  const [tasksCount, setTasksCount] = useState(0);
  const [memoryConfigured, setMemoryConfigured] = useState(false);
  const [hasAnyMemoryModelSet, setHasAnyMemoryModelSet] = useState(false);
  const [imageModelConfigured, setImageModelConfigured] = useState(false);
  const [visionModelConfigured, setVisionModelConfigured] = useState(false);
  const [textToSpeechModelConfigured, setTextToSpeechModelConfigured] = useState(false);
  const [speechToTextModelConfigured, setSpeechToTextModelConfigured] = useState(false);
  const [extractionModelConfigured, setExtractionModelConfigured] = useState(false);
  const [consolidationModelConfigured, setConsolidationModelConfigured] = useState(false);
  const [embeddingModelConfigured, setEmbeddingModelConfigured] = useState(false);
  const modelMemoryKey =
    agentId === AGENT_IDS.CODING
      ? SK_MODEL_MEMORY_AGENT
      : SK_MODEL_MEMORY_AGENT_PREFIX + agentId;

  const { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn, resetToAllDisabled, restoreDisabledTools, enableSpecificTools } =
    useToolToggles(builtInTools, isCoreToolsLocked);

  // -- Model memory (persist last-used model per agent) ----------
  const { saveModel, restoreModel } = useModelMemory(modelMemoryKey);
  const [settings, setSettings] = useState<
    PrismSettings & {
      maxTokens: number;
      functionCallingEnabled: boolean;
      thinkingEnabled: boolean;
      codeExecutionEnabled?: boolean;
      urlContextEnabled?: boolean;
    }
  >(() => {
    const persistedWorkspaceToggle =
      typeof window !== "undefined"
        ? localStorage.getItem(LS_WORKSPACE_TOGGLE_PREFERENCE)
        : null;
    const workspaceEnabledPreference =
      persistedWorkspaceToggle !== null
        ? persistedWorkspaceToggle !== "false"
        : true;

    return {
      ...SETTINGS_DEFAULTS,
      maxTokens: 64000,
      functionCallingEnabled: initialFcEnabled ? true : !isNoAgent,
      thinkingEnabled: initialThinkingEnabled
        ? true
        : SETTINGS_DEFAULTS.thinkingEnabled || false,
      agents: {
        workspaceEnabled: workspaceEnabledPreference,
      },
    };
  });

  const placeholderText = isNoAgent
    ? `Message ${settings.model || "model"}`
    : `Message ${activeAgentData?.name || "agent"}`;

  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  // -- llama.cpp server runtime props (fetched when provider is llama-cpp) --
  const [llamaCppServerProps, setLlamaCppServerProps] =
    useState<LlamaCppServerProps | null>(null);

  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<
    { name: string; mimeType: string; dataUrl: string; modality: string }[]
  >([]);
  const [lightboxSourceUrl, setLightboxSourceUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef<number>(0);

  // Phase 1: Agentic controls
  const [autoApprove, setAutoApprove] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LOCAL_STORAGE_AUTO_APPROVE_ENABLED) === "true";
    }
    return false;
  });
  const [maxIterations, setMaxIterations] = useState(MAX_TOOL_ITERATIONS);
  const [maxSubAgentIterations, setMaxSubAgentIterations] =
    useState(MAX_TOOL_ITERATIONS);
  const [maxRecursionDepth, setMaxRecursionDepth] = useState(1);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const parseStored = (key: string) => {
      const stored = localStorage.getItem(key);
      if (stored === "Infinity") return Infinity;
      const parsed = Number(stored);
      return [10, 25, 50, 100].includes(parsed) ? parsed : null;
    };
    const iter = parseStored(LS_AGENT_MAX_ITERATIONS);
    if (iter != null) setMaxIterations(iter);
    const subAgentIter = parseStored(LS_AGENT_MAX_SUB_AGENT_ITERATIONS);
    if (subAgentIter != null) setMaxSubAgentIterations(subAgentIter);
    const storedRecursionDepth = localStorage.getItem(LS_AGENT_MAX_RECURSION_DEPTH);
    if (storedRecursionDepth != null) {
      const parsedDepth = Number(storedRecursionDepth);
      if ([0, 1, 2, 3].includes(parsedDepth)) setMaxRecursionDepth(parsedDepth);
    }
  }, []);
  const [planFirst, setPlanFirst] = useState(false);
  const [criticGateEnabled, setCriticGateEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_CRITIC_GATE_ENABLED) === "true";
    }
    return false;
  });
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [pendingUserQuestion, setPendingUserQuestion] = useState<{
    questions?: unknown[];
    context?: string;
  } | null>(null);
  const [planProposal, setPlanProposal] = useState<{
    plan: string;
    steps?: string[];
    status?: "pending" | "approved" | "rejected" | "executing";
  } | null>(null);
  const [agenticProgress, setAgenticProgress] = useState<{
    iteration: number;
    maxIterations: number;
  } | null>(null); // { iteration, maxIterations }
  const [_contextTruncated, setContextTruncated] = useState<{
    strategy: string;
    estimatedTokens?: number;
  } | null>(null); // { strategy, estimatedTokens }
  const [currentTurnStart, setCurrentTurnStart] = useState<number | null>(null); // Date.now() when user sends
  const [backendConversationStats, setBackendConversationStats] =
    useState<ConversationStats | null>(null);
  const [isBackendStatsStale, setIsBackendStatsStale] = useState(false);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);

  // Frontend-side high-water marks for token display.
  // Ensures the token badges never show a lower number than previously
  // displayed, regardless of which computation path produced the values.
  const tokenHwmRef = useRef<{ input: number; output: number; total: number }>({
    input: 0,
    output: 0,
    total: 0,
  });

  // -- Pixelation transition state ----------------------------
  const [pixelTransition, setPixelTransition] = useState<"out" | "in" | null>(
    null,
  ); // 'out' | 'in' | null

  // -- Adaptive pixel transition timing -----------------------
  // Track conversation load durations via EMA to predict the "out" duration.
  // The "in" (reveal) phase is always a fixed 1000ms.
  const PIXEL_IN_DURATION = 1000;
  const PIXEL_DEFAULT_OUT = 3000;
  const PIXEL_LS_KEY = "pixel-transition:load-ema";
  const pixelOutDuration = useMemo(() => {
    if (typeof window === "undefined") return PIXEL_DEFAULT_OUT;
    const stored = localStorage.getItem(PIXEL_LS_KEY);
    return stored
      ? Math.round(Math.max(800, Math.min(Number(stored), 8000)))
      : PIXEL_DEFAULT_OUT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelTransition]); // intentional: re-read localStorage when a new transition starts

  /** Record a completed conversation load and update the EMA in localStorage. */
  const recordPixelLoadTime = useCallback((elapsed: number) => {
    const stored = localStorage.getItem(PIXEL_LS_KEY);
    const alpha = 0.3; // EMA smoothing — higher = more reactive to recent loads
    const previousLoadDuration = stored ? Number(stored) : PIXEL_DEFAULT_OUT;
    const next = alpha * elapsed + (1 - alpha) * previousLoadDuration;
    localStorage.setItem(PIXEL_LS_KEY, String(Math.round(next)));
  }, []);

  const textareaRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const scrollBehaviorRef = useRef<ScrollBehavior>("smooth"); // "smooth" for streaming, "instant" for history loads
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);

  // -- Message navigation (up/down chevron buttons in header) --
  const [canNavigateUp, setCanNavigateUp] = useState(false);
  const [canNavigateDown, setCanNavigateDown] = useState(false);

  // -- Sticky auto-scroll -------------------------------------
  // Only auto-scroll when the user is near the bottom of the messages container.
  // Re-engaged on send, conversation load, and new chat.
  const isUserNearBottomRef = useRef<boolean>(true);
  const SCROLL_BOTTOM_THRESHOLD = 150;

  const conversationIdRef = useRef<string>(conversationId);
  conversationIdRef.current = conversationId;
  const isGeneratingRef = useRef<boolean>(isGenerating);
  isGeneratingRef.current = isGenerating;
  // Distinguish client-initiated generation (active SSE via handleSend)
  // from server-initiated generation (timer/scheduled task, passive DB load).
  // Change-stream refresh is safe to skip only for client-driven generation.
  const isClientDrivenGenerationRef = useRef<boolean>(false);
  const previousModelRef = useRef<string | null>(null);
  // Track which conversations have active background generation (for history indicator)
  const [generatingConversationIds, setGeneratingConversationIds] = useState(
    () => new Set(),
  );

  const knownParentConversationIds = useMemo(() => {
    const parentIds = new Set<string>();
    if (activeId && subAgentsCount > 0) {
      parentIds.add(activeId);
    }
    return parentIds;
  }, [activeId, subAgentsCount]);
  // Snapshot cache: stores UI state for conversations that are generating in the background
  // so the user can switch back without waiting for backend persistence.
  const backgroundConversationsRef = useRef<Map<string, ConversationSnapshot>>(new Map());

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsGenerating(false);
    setPlanProposal(null);

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

    // Clear live streaming and processing metadata from the in-flight
    // assistant message so the TTFT badge and tok/s indicators stop
    // calculating.  Without this, statusPhase / _processingStartTime /
    // _streamingLastChunkTime remain on the message and the SettingsPanel
    // ticker keeps running after the user hits stop.
    setMessages((previousMessages) => {
      const last = previousMessages[previousMessages.length - 1];
      if (last?.role === "assistant" && !last.completedAt) {
        const updated = [...previousMessages];
        updated[updated.length - 1] = {
          ...last,
          statusPhase: undefined,
          _processingStartTime: undefined,
          _streamingStartTime: undefined,
          _streamingLastChunkTime: undefined,
          completedAt: new Date().toISOString(),
        };
        return updated;
      }
      return previousMessages;
    });

    // Force all active sub-agents to terminal state so their StatusBarComponent
    // bars stop animating — the SSE stream was aborted before "complete" events
    // could arrive, leaving activity entries stuck in active phases.
    setSubAgentToolActivity((previousSubAgentToolActivity) => {
      const hasActive = Object.values(previousSubAgentToolActivity).some(
        (subAgent: SubAgentActivityEntry) =>
          subAgent.phase && subAgent.phase !== "complete" && subAgent.phase !== "failed",
      );
      if (!hasActive) return previousSubAgentToolActivity;
      const next: Record<string, SubAgentActivityEntry> = {};
      for (const [id, subAgent] of Object.entries(previousSubAgentToolActivity)) {
        next[id] =
          subAgent.phase && subAgent.phase !== "complete" && subAgent.phase !== "failed"
            ? { ...subAgent, phase: "complete", currentTool: null }
            : subAgent;
      }
      return next;
    });

    // Explicitly abort any running sub-agents for this conversation — belt-and-suspenders
    // alongside the backend SSE disconnect handler
    // Direct Chat (NONE) has no sub-agents — skip.
    if (!isNoAgent) {
      PrismService.stopCoordinatorSubAgents(conversationIdRef.current).catch(
        () => {},
      );
    }
  }, [isNoAgent]);

  // -- Filtered config: only tool-calling models for agents; all text models for Direct Chat ------------
  const filteredConfig = useMemo(() => {
    if (!config) return null;

    // Direct Chat: show ALL text models — no FC restriction
    if (isNoAgent) {
      return {
        ...config,
        textToImage: { models: {} },
        textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
        audioToText: { models: {} },
        embedding: { models: {} },
      } as PrismConfig;
    }

    const textModelsMap = config.textToText?.models || {};
    const filteredTextModels: Record<string, ModelOption[]> = {};

    for (const [provider, models] of Object.entries(
      textModelsMap as Record<string, ModelOption[]>,
    )) {
      const fcModels = models.filter((model: ModelOption) =>
        model.tools?.includes("Tool Calling"),
      );
      if (fcModels.length > 0) filteredTextModels[provider] = fcModels;
    }

    const filteredProviderList = (config.providerList || []).filter(
      (provider) => filteredTextModels[provider],
    );

    return {
      ...config,
      providerList: filteredProviderList,
      textToText: {
        ...config.textToText,
        models: filteredTextModels,
      },
      textToImage: { models: {} },
      textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
      audioToText: { models: {} },
      embedding: { models: {} },
    } as PrismConfig;
  }, [config, isNoAgent]);

  // -- Model + tool capability detection -------------------------
  const supportedInputModalities = useMemo(() => {
    const modalities = new Set<string>();
    // Model-level image support (vision models)
    if (filteredConfig) {
      const models =
        filteredConfig.textToText?.models?.[settings.provider ?? ""] || [];
      const modelDef = models.find(
        (model: ModelOption) => model.name === settings.model,
      ) as (ModelOption & { inputTypes?: string[] }) | undefined;
      if (modelDef?.inputTypes?.includes("image")) modalities.add("image");
    }
    // Tool-level modality support (from enabled tools)
    for (const tool of builtInTools) {
      if (disabledTools.has(tool.name)) continue;
      for (const modality of tool.inputModalities || []) {
        modalities.add(modality);
      }
    }
    return modalities;
  }, [filteredConfig, settings.provider, settings.model, builtInTools, disabledTools]);

  const supportsImageInput = supportedInputModalities.has("image");
  const supportsAnyFileInput = supportedInputModalities.size > 0;

  const activeUploadTypes = useMemo(() => {
    const modalityToUploadType: Record<string, string> = {
      image: "image",
      audio: "audio",
      video: "video",
      pdf: "pdf",
      document: "document",
    };
    return [...supportedInputModalities]
      .map((modality) => modalityToUploadType[modality])
      .filter(Boolean);
  }, [supportedInputModalities]);

  const acceptFilter = useMemo(() => {
    const filters: string[] = [];
    if (supportedInputModalities.has("image")) filters.push("image/*");
    if (supportedInputModalities.has("audio")) filters.push("audio/*");
    if (supportedInputModalities.has("video")) filters.push("video/*");
    if (supportedInputModalities.has("pdf"))
      filters.push(".pdf,application/pdf");
    if (supportedInputModalities.has("document"))
      filters.push(
        ".docx,.doc,.xlsx,.xls,.csv,.tsv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv",
      );
    return filters.join(",");
  }, [supportedInputModalities]);

  // -- Session binding: lock model/agent when a conversation is active --
  // Once a conversation has messages, the user should not switch model or agent
  // mid-conversation — the conversation data owns those values.
  const isSessionLocked = useMemo(
    () => Boolean(activeId && messages.length > 0),
    [activeId, messages.length],
  );

  // -- Effects --------------------------------------------------

  // Sticky auto-scroll: track whether the user is near the bottom of the
  // scroll container.  When they scroll up, auto-scroll disengages; when
  // they scroll back to the bottom (within SCROLL_BOTTOM_THRESHOLD px), it
  // re-engages.  Uses a passive scroll listener for zero main-thread cost.
  // Helper: query all message nodes inside the scroll container
  const getMessageElements = useCallback((): HTMLElement[] => {
    const container = messagesListRef.current;
    if (!container) return [];
    return Array.from(
      container.querySelectorAll<HTMLElement>('[data-navigation-target]'),
    );
  }, []);

  // Helper: find the index of the message currently at or nearest the viewport top
  const findCurrentVisibleMessageIndex = useCallback((): number => {
    const container = messagesListRef.current;
    if (!container) return -1;
    const messageElements = getMessageElements();
    if (messageElements.length === 0) return -1;

    const containerTop = container.getBoundingClientRect().top;

    // Find the first message whose bottom is below the container top
    // (i.e., at least partially visible or the nearest one below the fold)
    for (let index = 0; index < messageElements.length; index++) {
      const messageRect = messageElements[index].getBoundingClientRect();
      // Message is considered "current" if its top is near (within 8px)
      // or below the container top, or if its bottom extends past it
      if (messageRect.bottom > containerTop + 8) {
        return index;
      }
    }
    // Scrolled past everything — return last
    return messageElements.length - 1;
  }, [getMessageElements]);

  // Update navigation button disabled states
  const updateNavigationState = useCallback(() => {
    const container = messagesListRef.current;
    const messageElements = getMessageElements();
    if (messageElements.length === 0 || !container) {
      setCanNavigateUp(false);
      setCanNavigateDown(false);
      return;
    }
    const currentIndex = findCurrentVisibleMessageIndex();
    const containerTop = container.getBoundingClientRect().top;
    const currentTop = messageElements[currentIndex]?.getBoundingClientRect().top ?? containerTop;
    const isCurrentTopOffscreen = currentTop < containerTop - 8;
    setCanNavigateUp(currentIndex > 0 || isCurrentTopOffscreen);
    setCanNavigateDown(currentIndex < messageElements.length - 1);
  }, [getMessageElements, findCurrentVisibleMessageIndex]);

  // Navigate to the previous message (scroll its top into view)
  // If the current message's top is scrolled above the viewport,
  // snap to it first before jumping to the previous message.
  const handleNavigateUp = useCallback(() => {
    const container = messagesListRef.current;
    if (!container) return;
    const messageElements = getMessageElements();
    const currentIndex = findCurrentVisibleMessageIndex();
    if (currentIndex < 0) return;

    const containerTop = container.getBoundingClientRect().top;
    const currentElement = messageElements[currentIndex];
    const currentTop = currentElement.getBoundingClientRect().top;
    const isCurrentTopOffscreen = currentTop < containerTop - 8;

    const targetElement = isCurrentTopOffscreen
      ? currentElement
      : messageElements[currentIndex - 1];
    if (!targetElement) return;

    const targetTop = targetElement.getBoundingClientRect().top;
    const scrollOffset = targetTop - containerTop + container.scrollTop;

    container.scrollTo({ top: scrollOffset, behavior: 'smooth' });
  }, [getMessageElements, findCurrentVisibleMessageIndex]);

  // Navigate to the next message (scroll its top into view)
  const handleNavigateDown = useCallback(() => {
    const container = messagesListRef.current;
    if (!container) return;
    const messageElements = getMessageElements();
    const currentIndex = findCurrentVisibleMessageIndex();
    if (currentIndex >= messageElements.length - 1) return;

    const targetElement = messageElements[currentIndex + 1];
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = targetElement.getBoundingClientRect().top;
    const scrollOffset = targetTop - containerTop + container.scrollTop;

    container.scrollTo({ top: scrollOffset, behavior: 'smooth' });
  }, [getMessageElements, findCurrentVisibleMessageIndex]);

  useEffect(() => {
    const element = messagesListRef.current;
    if (!element) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      isUserNearBottomRef.current =
        scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD;
      updateNavigationState();
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [updateNavigationState]);

  // Re-evaluate navigation state when messages change
  useEffect(() => {
    updateNavigationState();
  }, [messages, updateNavigationState]);

  useEffect(() => {
    if (!isUserNearBottomRef.current) return;
    endRef.current?.scrollIntoView({
      behavior: scrollBehaviorRef.current,
    });
    // Reset to smooth after each scroll so streaming remains animated
    scrollBehaviorRef.current = "smooth";
  }, [messages, toolActivity, planProposal, pendingApprovals]);

  // Auto-resize is handled inline in handleInputChange (no effect needed)

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Load favorite models
  useEffect(() => {
    PrismService.getFavorites("model")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((file) => file.key)),
      )
      .catch(() => {});
  }, []);

  // Fetch Prism config and restore remembered model (or auto-select first FC-capable)
  // URL ?model= param takes highest priority over localStorage memory.
  useEffect(() => {
    /** Try to apply the URL model param against the given config. */
    const tryApplyUrlModel = (config: PrismConfig) => {
      if (!initialModel || urlModelAppliedRef.current) return false;
      const [urlProvider, ...rest] = initialModel.split(":");
      const urlModelName = rest.join(":"); // handles model names with colons
      if (!urlProvider || !urlModelName) return false;
      const providerModels = config.textToText?.models?.[urlProvider] || [];
      const modelDef = providerModels.find((model) => model.name === urlModelName);
      if (!modelDef) return false; // model not (yet) in config — may arrive with local merge
      // FC gate for agent mode
      if (!isNoAgent && !modelDef.tools?.includes("Tool Calling")) return false;
      setSettings((state) => ({
        ...state,
        provider: urlProvider,
        model: urlModelName,
        temperature: modelDef.defaultTemperature ?? 1.0,
      }));
      urlModelAppliedRef.current = true;
      return true;
    };

    const fcFallback = (config: PrismConfig) => {
      const { provider, model, temperature } = resolveDefaultModel(
        config,
        !isNoAgent,
      );
      if (provider && model) {
        setSettings((state) => ({
          ...state,
          provider,
          model,
          temperature,
        }));
      }
    };

    PrismService.getConfigWithLocalModels({
      onConfig: (config: PrismConfig) => {
        setConfig(config);

        // Populate the dynamic model label map from all modality catalogs
        const labelMap: Record<string, string> = {};
        for (const modality of [config.textToText, config.textToSpeech, config.textToImage, config.imageToText, config.embedding, config.audioToText]) {
          if (!modality?.models) continue;
          for (const providerModels of Object.values(modality.models)) {
            for (const model of providerModels) {
              if (model.name && model.label) {
                labelMap[model.name] = model.label;
              }
            }
          }
        }
        registerModelLabels(labelMap);
        // URL model param takes priority over localStorage memory
        if (!tryApplyUrlModel(config)) {
          restoreModel(config, setSettings, {
            fcOnly: !isNoAgent,
            fallback: fcFallback,
          });
        }
      },
      onLocalMerge: (merged: PrismConfig) => {
        setConfig(merged);
        // Retry URL model param in case the model is a local model
        if (!tryApplyUrlModel(merged)) {
          restoreModel(merged, setSettings, {
            fcOnly: !isNoAgent,
            fallback: fcFallback,
          });
        }
      },
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronise settings when provider/model changes to ensure thinking is properly defaulted/forced
  useEffect(() => {
    if (!config || !settings.provider || !settings.model) return;
    const providerModels = config.textToText?.models?.[settings.provider] || [];
    const modelDef = providerModels.find((model) => model.name === settings.model);
    if (!modelDef) return;

    const modelChanged = previousModelRef.current !== settings.model;
    previousModelRef.current = settings.model;

    // Check if the model is an always-on thinking model (e.g. Gemini 3.5 Flash)
    const canDisable =
      !modelDef.thinkingLevels || modelDef.thinkingLevels.includes("minimal");
    const isGoogleAlwaysOn =
      !canDisable && settings.provider === "google" && modelDef.thinking;

    // Anthropic adaptive thinking models (Fable 5, Mythos 5, Opus 4.7+) have
    // thinking as an inherent capability — default it on when switching to them.
    const isAdaptiveThinking =
      modelDef.adaptiveThinking === true && modelDef.thinking;

    if (isGoogleAlwaysOn && !settings.thinkingEnabled) {
      setSettings((previousSettings) => ({
        ...previousSettings,
        thinkingEnabled: true,
      }));
    } else if (isAdaptiveThinking && modelChanged && !settings.thinkingEnabled) {
      setSettings((previousSettings) => ({
        ...previousSettings,
        thinkingEnabled: true,
      }));
    }
  }, [config, settings.provider, settings.model, settings.thinkingEnabled]);

  // Fetch llama.cpp server runtime properties when provider is llama-cpp
  useEffect(() => {
    const providerKey = settings.provider || "";
    const isLlamaCpp = providerKey === "llama-cpp" || providerKey.startsWith("llama-cpp-");
    if (!isLlamaCpp) {
      setLlamaCppServerProps(null);
      return;
    }
    let cancelled = false;
    PrismService.getLlamaCppServerProps(providerKey).then((serverProperties) => {
      if (!cancelled) setLlamaCppServerProps(serverProperties);
    });
    return () => { cancelled = true; };
  }, [settings.provider, settings.model]);

  // Load conversation history — Direct Chat reads from conversations collection
  const loadConversations = useCallback(async () => {
    try {
      setConversationsLoading(true);
      const result = isNoAgent
        ? await PrismService.getConversations()
        : await PrismService.getAgentConversations(agentProject!, {
            agent: agentId,
          });
      setConversations((previousConversations) => {
        // Preserve client-side live enrichments (_liveModelNames,
        // _liveModalities, providers) that the live-patch effect wrote
        // during active generation. The backend listing response may
        // not yet reflect these fields — without this merge, model
        // badges vanish from history items after a conversation switch
        // triggers a change-stream list refresh.
        const liveEnrichmentsByConversationId = new Map<
          string,
          Record<string, unknown>
        >();
        for (const previousConversation of previousConversations) {
          const enrichedConversation = previousConversation as unknown as Record<string, unknown>;
          if (
            enrichedConversation._liveModelNames ||
            enrichedConversation._liveModalities
          ) {
            liveEnrichmentsByConversationId.set(
              previousConversation.id || String(previousConversation._id),
              {
                _liveModelNames: enrichedConversation._liveModelNames,
                _liveModalities: enrichedConversation._liveModalities,
              },
            );
          }
        }

        // Preserve optimistically injected sub-agent entries that don't
        // exist in MongoDB yet. The hasSubAgents write on the parent
        // triggers a change-stream → loadConversations() runs before
        // the sub-agent's first appendAndFinalize creates its document.
        // Without this, the sub-agent vanishes from the sidebar until
        // its MongoDB document is created and a subsequent reload picks it up.
        //
        // IMPORTANT: Only preserve entries that are genuinely optimistic
        // (recently created, still generating). Old sub-agent entries that
        // fell off the API pagination window must NOT be preserved — doing
        // so causes stale conversations to appear at the top of the list
        // since they get prepended without sorting.
        const apiResponseIds = new Set(
          result.items.map((entry) => entry.id || String(entry._id)),
        );
        const OPTIMISTIC_ENTRY_AGE_THRESHOLD_MS = 60_000;
        const optimisticCutoffTimestamp = Date.now() - OPTIMISTIC_ENTRY_AGE_THRESHOLD_MS;
        const optimisticSubAgentEntries = previousConversations.filter(
          (previousConversation) => {
            const conversationId = previousConversation.id || String(previousConversation._id);
            const hasParent = !!(previousConversation as AgentConversation).parentConversationId;
            if (!hasParent || apiResponseIds.has(conversationId)) return false;
            // Only preserve entries injected very recently (within the last
            // 60 seconds) or still actively generating. Older entries that
            // dropped off the pagination window are stale and must not be
            // re-injected at the top of the list.
            const createdTimestamp = new Date(
              previousConversation.createdAt || previousConversation.updatedAt || 0,
            ).getTime();
            const isRecentlyCreated = createdTimestamp > optimisticCutoffTimestamp;
            const isActivelyGenerating = !!(previousConversation as unknown as Record<string, unknown>).isGenerating;
            return isRecentlyCreated || isActivelyGenerating;
          },
        );

        let mergedConversations: Array<AgentConversation | Conversation>;

        if (liveEnrichmentsByConversationId.size === 0) {
          mergedConversations = result.items;
        } else {
          mergedConversations = result.items.map((entry) => {
            const entryId = entry.id || String(entry._id);
            const enrichment = liveEnrichmentsByConversationId.get(entryId);
            if (!enrichment) return entry;

            const backendEntry = entry as unknown as Record<string, unknown>;
            const backendHasModelNames =
              Array.isArray(backendEntry.modelNames) &&
              (backendEntry.modelNames as string[]).length > 0;

            // If the backend already has authoritative modelNames,
            // the client-side enrichment is no longer needed.
            if (backendHasModelNames) return entry;

            return { ...entry, ...enrichment } as typeof entry;
          });
        }

        if (optimisticSubAgentEntries.length > 0) {
          // Merge and re-sort to maintain correct updatedAt descending order
          const combinedConversations = [...optimisticSubAgentEntries, ...mergedConversations];
          combinedConversations.sort((conversationA, conversationB) => {
            const timestampA = new Date(conversationA.updatedAt || conversationA.createdAt || 0).getTime();
            const timestampB = new Date(conversationB.updatedAt || conversationB.createdAt || 0).getTime();
            return timestampB - timestampA;
          });
          return combinedConversations;
        }
        return mergedConversations;
      });
      conversationsCursorRef.current = result.nextCursor;
      setConversationsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, [agentProject, agentId, isNoAgent]);

  const loadMoreConversations = useCallback(async () => {
    if (!conversationsCursorRef.current || conversationsLoading) return;
    try {
      setConversationsLoading(true);
      const fetchOptions = {
        cursor: conversationsCursorRef.current,
        agent: agentId,
      };
      const result = isNoAgent
        ? await PrismService.getConversations(fetchOptions)
        : await PrismService.getAgentConversations(agentProject!, fetchOptions);
      setConversations((previousConversations) => [
        ...previousConversations,
        ...result.items,
      ]);
      conversationsCursorRef.current = result.nextCursor;
      setConversationsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load more conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, [agentProject, isNoAgent, conversationsLoading]);

  useEffect(() => {
    if (!isAdmin) loadConversations();
  }, [loadConversations, isAdmin]);

  // -- Auto-load conversation from URL ?conversation= param ----------------
  // Runs once on mount. Fetches the full conversation and applies it.
  // Uses a ref guard to prevent double-loading on StrictMode re-mounts.
  useEffect(() => {
    if (isAdmin || !initialConversationId || urlConversationAppliedRef.current) return;
    urlConversationAppliedRef.current = true;

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

        const displayMessages = prepareDisplayMessages(full.messages || []);
        console.debug(
          `[URL conversation load] id=${initialConversationId}, raw=${full.messages?.length || 0} → display=${displayMessages.length}`,
        );
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(displayMessages);
        setConversationId(full.id || generateUUID());
        setTraceId(full.traceId || null);
        setActiveId(full.id || null);
        setTitle(full.title || (isNoAgent ? "Agentless Chat" : "Agent"));
        setToolActivity([]);
        setSubAgentToolActivity({});

        const lastAssistant = [...(full.messages || [])]
          .reverse()
          .find((message) => message.role === "assistant" && message.provider);
        const urlLoadConversationSettings = full.settings as Record<string, unknown> | undefined;
        setSettings((previousSettings) => {
          const nextSettings = { ...previousSettings };
          if (lastAssistant) {
            const gs = (lastAssistant.generationSettings || {}) as Record<
              string,
              string | number | boolean | undefined
            >;
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
          const urlHarness = urlLoadConversationSettings?.harness as string | undefined;
          const urlTopology = urlLoadConversationSettings?.topology as string | undefined;
          const urlThoughtStructure = urlLoadConversationSettings?.thoughtStructure as string | undefined;
          const urlLocale = urlLoadConversationSettings?.locale as string | undefined;
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
        });

        // Restore agent toggle state from the conversation's persisted settings
        const urlLoadConversationSettingsDummy = urlLoadConversationSettings;
        const persistedRecursionDepth = urlLoadConversationSettings?.maxRecursionDepth;
        if (typeof persistedRecursionDepth === "number" && [0, 1, 2, 3].includes(persistedRecursionDepth)) {
          setMaxRecursionDepth(persistedRecursionDepth);
        }

        setBackendConversationStats(full.stats || null);
        setIsBackendStatsStale(false);
        tokenHwmRef.current = { input: 0, output: 0, total: 0 };
      } catch (error: unknown) {
        console.error("Failed to preload conversation from URL:", error);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════
  // ██  ADMIN MODE — Data Loading Effects
  // ═══════════════════════════════════════════════════════════════

  // Fetch agent personas for admin mode
  useEffect(() => {
    if (!isAdmin) return;
    PrismService.getAgentPersonas()
      .then((list: AgentPersona[]) =>
        setAdminAgents([ADMIN_ALL_AGENT, ADMIN_NONE_AGENT, ...list]),
      )
      .catch(console.error);
  }, [isAdmin]);

  // Admin: determine if the selected entry is an agent conversation
  const adminIsSelectedAgentConversation = adminSelectedSource === "agent_conversation";
  const adminTargetAgentId = adminIsSelectedAgentConversation
    ? (conversations.find((entry) => entry.id === activeId) as UnifiedEntry)?.agent
    : (adminIsAgentMode ? adminActiveAgentId : null);
  const adminTargetProject = adminIsSelectedAgentConversation
    ? ((conversations.find((entry) => entry.id === activeId) as UnifiedEntry)?.project || 
       (conversations.find((entry) => entry.id === activeId) as UnifiedEntry)?.agent || 
       PROJECT_AGENT)
    : (adminIsAgentMode ? PROJECT_AGENT : null);

  // Admin: resolve the agent persona data for the selected conversation so
  // MessageList can render the correct agent name and avatar icon.
  const adminActiveAgentData = useMemo(() => {
    if (!isAdmin || !adminTargetAgentId) return null;
    return adminAgents.find((agent) => agent.id === adminTargetAgentId) || null;
  }, [isAdmin, adminTargetAgentId, adminAgents]);

  // Unified source of truth: resolved agent and metadata for BOTH views.
  // Admin derives from the selected conversation's entry;
  // non-admin derives from the URL agent param and active conversation.
  const resolvedConversationAgent = isAdmin ? adminActiveAgentData : activeAgentData || null;
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

  // Admin: extract conversation-time tool snapshot from conversation settings
  const adminConversationToolConfig = useMemo(() => {
    if (!isAdmin || !activeId) return null;
    const selectedEntry = conversations.find((entry) => entry.id === activeId) as UnifiedEntry | undefined;
    if (!selectedEntry) return null;
    const conversationSettings = (selectedEntry as Conversation)?.settings as Record<string, unknown> | undefined;
    return conversationSettings?.toolConfig as
      | { availableTools?: string[]; enabledTools?: string[]; disabledTools?: string[] }
      | undefined
      ?? null;
  }, [isAdmin, activeId, conversations]);

  // Admin: load agent-specific data (tools, skills, memories, rules) for selected conversation
  useEffect(() => {
    if (!isAdmin) return;
    if (!adminTargetAgentId) {
      setSkills([]);
      setBuiltInTools([]);
      setTotalMemoriesCount(0);
      setRules([]);
      return;
    }

    const project = adminTargetProject || PROJECT_AGENT;

    PrismService.getSkills(project)
      .then((loadedSkills: Skill[]) => setSkills(loadedSkills))
      .catch(() => {});

    const conversationAvailableToolNames = adminConversationToolConfig?.availableTools;
    if (conversationAvailableToolNames && conversationAvailableToolNames.length > 0) {
      const availableToolNameSet = new Set(conversationAvailableToolNames);
      PrismService.getBuiltInToolSchemas()
        .then((allSchemas: ToolSchema[]) => {
          const conversationFilteredTools = allSchemas.filter(
            (tool) => availableToolNameSet.has(tool.name),
          );
          setBuiltInTools(conversationFilteredTools);
        })
        .catch(() => {});
    } else {
      PrismService.getBuiltInToolSchemas(adminTargetAgentId)
        .then((tools: ToolSchema[]) => setBuiltInTools(tools))
        .catch(() => {});
    }

    PrismService.getAgentMemories(project, 1, undefined)
      .then((result: { total?: number }) => setTotalMemoriesCount(result.total || 0))
      .catch(() => {});
    PrismService.getRules(adminTargetAgentId)
      .then((rulesList: Rule[]) => setRules(rulesList))
      .catch(() => {});
  }, [isAdmin, adminTargetAgentId, adminTargetProject, adminConversationToolConfig]);

  // Admin: load entries (conversations / agent conversations / both)
  const adminLoadEntries = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const params: Record<string, string | number | boolean> = {
        page: 1,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (adminTraceFilter) {
        params.trace = adminTraceFilter;
      } else {
        Object.assign(params, buildDateRangeParams(adminDateRange));
        if (adminProjectFilter) params.project = adminProjectFilter;
      }
      if (adminProviderFilter) params.provider = adminProviderFilter;
      if (adminModelFilter) params.model = adminModelFilter;

      if (adminIsNoAgent) {
        params.type = "direct";
      } else if (adminIsAgentMode) {
        params.agent = adminActiveAgentId;
      }

      const data = await IrisService.getConversations(params);
      const list = (data.data || []).map(
        (conversation: Conversation & { type?: string }) => ({
          ...conversation,
          _source:
            conversation.type === "agent"
              ? ("agent_conversation" as const)
              : ("conversation" as const),
        }),
      );
      const total = data.total || 0;

      const fingerprint = list
        .map(
          (conversation: UnifiedEntry) =>
            `${conversation.id}:${conversation.messages?.length || (conversation as Conversation).messageCount || 0}`,
        )
        .join("|");

      if (fingerprint !== adminLastFingerprintRef.current) {
        adminLastFingerprintRef.current = fingerprint;
        setAdminEntries(list);
        setAdminFingerprint(fingerprint);
      }

      adminEntriesPageRef.current = 1;
      adminEntriesTotalRef.current = total;
      setAdminEntriesHasMore(list.length < total);

      const currentIds = new Set(list.map((conversation: UnifiedEntry) => conversation.id || ""));
      if (adminKnownIdsRef.current === null) {
        adminKnownIdsRef.current = currentIds;
      } else {
        const freshIds = new Set<string>();
        for (const id of currentIds) {
          if (!adminKnownIdsRef.current.has(id)) freshIds.add(id);
        }
        if (freshIds.size > 0) {
          setAdminNewIds((previousNewIds) => {
            const merged = new Set(previousNewIds);
            for (const id of freshIds) merged.add(id);
            return merged;
          });
          adminKnownIdsRef.current = currentIds;
        }
      }

      // Auto-select first entry on load
      if (list.length > 0 && !adminAutoSelectedRef.current) {
        adminAutoSelectedRef.current = true;
        adminSelectEntry(list[0].id || "", list[0]._source || "conversation");
      }

      setAdminError((previousError) => (previousError !== null ? null : previousError));
    } catch (error) {
      setAdminError(getErrorMessage(error));
    }
  }, [
    isAdmin,
    adminProjectFilter,
    adminProviderFilter,
    adminModelFilter,
    adminDateRange,
    adminTraceFilter,
    adminActiveAgentId,
    adminIsNoAgent,
    adminIsAgentMode,
  ]);

  // Admin: load more entries (pagination)
  const adminLoadMoreEntries = useCallback(async () => {
    if (!isAdmin || adminEntriesLoading || !adminEntriesHasMore) return;
    try {
      setAdminEntriesLoading(true);
      const nextPage = adminEntriesPageRef.current + 1;
      const params: Record<string, string | number | boolean> = {
        page: nextPage,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (adminTraceFilter) {
        params.trace = adminTraceFilter;
      } else {
        Object.assign(params, buildDateRangeParams(adminDateRange));
        if (adminProjectFilter) params.project = adminProjectFilter;
      }
      if (adminProviderFilter) params.provider = adminProviderFilter;
      if (adminModelFilter) params.model = adminModelFilter;

      if (adminIsNoAgent) {
        params.type = "direct";
      } else if (adminIsAgentMode) {
        params.agent = adminActiveAgentId;
      }

      const data = await IrisService.getConversations(params);
      const newItems = (data.data || []).map(
        (conversation: Conversation & { type?: string }) => ({
          ...conversation,
          _source:
            conversation.type === "agent"
              ? ("agent_conversation" as const)
              : ("conversation" as const),
        }),
      );

      adminEntriesPageRef.current = nextPage;
      setAdminEntries((previousEntries) => [...previousEntries, ...newItems]);
      setAdminEntriesHasMore(
        adminEntries.length + newItems.length < adminEntriesTotalRef.current,
      );
    } catch (error) {
      console.error("Failed to load more entries:", error);
    } finally {
      setAdminEntriesLoading(false);
    }
  }, [
    isAdmin,
    adminEntriesLoading,
    adminEntriesHasMore,
    adminTraceFilter,
    adminDateRange,
    adminProjectFilter,
    adminProviderFilter,
    adminModelFilter,
    adminEntries.length,
    adminIsNoAgent,
    adminIsAgentMode,
    adminActiveAgentId,
  ]);

  // Admin: select an entry
  const adminSelectEntry = useCallback(
    async (id: string, source: "conversation" | "agent_conversation" = "conversation") => {
      if (!isAdmin || id === activeId) return;
      setActiveId(id);
      setAdminSelectedSource(source);

      // Update URL for deep-linking
      const params = new URLSearchParams();
      if (adminAgentParam) params.set("agent", adminAgentParam);
      if (adminTraceFilter) params.set("trace", adminTraceFilter);
      if (adminProjectFilter) params.set("project", adminProjectFilter);
      if (adminProviderFilter) params.set("provider", adminProviderFilter);
      if (adminModelFilter) params.set("model", adminModelFilter);

      const queryString = params.toString();
      window.history.replaceState(
        null,
        "",
        `/admin/chat/${id}${queryString ? `?${queryString}` : ""}`,
      );

      setAdminNewIds((previousNewIds) => {
        if (!previousNewIds.has(id)) return previousNewIds;
        const next = new Set(previousNewIds);
        next.delete(id);
        return next;
      });

      setAdminLoadingDetail(true);
      try {
        const detail =
          source === "agent_conversation"
            ? await IrisService.getAgentConversation(id)
            : await IrisService.getConversation(id);
        const fullEntry = detail as UnifiedEntry;
        const displayMessages = prepareDisplayMessages(fullEntry.messages || []);
        setMessages(displayMessages);
        setConversationId(fullEntry.id || generateUUID());
        setTitle(fullEntry.title || "Untitled");
        setBackendConversationStats(fullEntry.stats || null);
        setSettings((previousSettings) => {
          const nextSettings = { ...previousSettings };
          const conversationSettings = (fullEntry as Conversation)?.settings as Partial<PrismSettings> | undefined;
          if (conversationSettings?.provider) nextSettings.provider = conversationSettings.provider;
          if (conversationSettings?.model) nextSettings.model = conversationSettings.model;
          if (fullEntry.systemPrompt != null) nextSettings.systemPrompt = fullEntry.systemPrompt;

          // Fallback: extract from last assistant message
          if (!nextSettings.model && fullEntry.messages?.length) {
            for (let i = fullEntry.messages.length - 1; i >= 0; i--) {
              const message = fullEntry.messages[i];
              if (message.role === "assistant" && message.model) {
                nextSettings.model = message.model;
                nextSettings.provider = message.provider || nextSettings.provider;
                break;
              }
            }
          }

          return nextSettings;
        });

        // Update sidebar conversations with the full entry
        setConversations((previousConversations) => {
          const exists = previousConversations.some((entry) => entry.id === id);
          if (exists) return previousConversations;
          return [fullEntry as AgentConversation | Conversation, ...previousConversations];
        });
      } catch {
        setMessages([]);
      } finally {
        setAdminLoadingDetail(false);
      }
    },
    [isAdmin, activeId, adminAgentParam, adminTraceFilter, adminProjectFilter, adminProviderFilter, adminModelFilter],
  );

  // Admin: refresh selected entry
  const adminRefreshSelectedEntry = useCallback(
    async (id: string, source: "conversation" | "agent_conversation" | null) => {
      if (!isAdmin || !id) return;
      try {
        const full =
          source === "agent_conversation"
            ? ((await IrisService.getAgentConversation(id)) as UnifiedEntry)
            : ((await IrisService.getConversation(id)) as UnifiedEntry);
        const displayMessages = prepareDisplayMessages(full.messages || []);
        setMessages(displayMessages);
        setBackendConversationStats(full.stats || null);
      } catch (error: unknown) {
        console.error("Failed to refresh selected entry:", error);
      }
    },
    [isAdmin],
  );

  // Admin: initial detail load by ID
  useEffect(() => {
    if (!isAdmin || !initialId) return;
    setAdminLoadingDetail(true);
    IrisService.getConversation(initialId)
      .then((conversation: unknown) => {
        const conversationEntry = conversation as UnifiedEntry & { type?: string };
        const source = conversationEntry.type === "agent" ? "agent_conversation" : "conversation";
        setAdminSelectedSource(source);
        setActiveId(conversationEntry.id || initialId);
        setConversationId(conversationEntry.id || generateUUID());
        setTitle(conversationEntry.title || "Untitled");
        const displayMessages = prepareDisplayMessages(conversationEntry.messages || []);
        setMessages(displayMessages);
        setBackendConversationStats(conversationEntry.stats || null);
        setConversations((previousConversations) => [conversationEntry as AgentConversation | Conversation, ...previousConversations]);
      })
      .catch(() => {
        setMessages([]);
      })
      .finally(() => setAdminLoadingDetail(false));
  }, [isAdmin, initialId]);

  // Admin: lazy load system prompt for agent conversations
  useEffect(() => {
    if (!isAdmin) return;
    setAdminConversationSystemPrompt(null);
    if (!activeId || adminSelectedSource !== "agent_conversation") return;

    let cancelled = false;
    IrisService.getRequests({ conversationId: activeId, limit: 1 })
      .then((response) => {
        if (cancelled) return;
        const firstRequest = response.data?.[0] as TransformedRequestItem | undefined;
        const payload = firstRequest?.requestPayload as
          | { messages?: Message[] }
          | undefined;
        const systemMessage = payload?.messages?.find(
          (message: Message) => message.role === "system",
        );
        if (systemMessage?.content) {
          setAdminConversationSystemPrompt(systemMessage.content as string);
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [isAdmin, activeId, adminSelectedSource]);

  // Admin: generating count
  useEffect(() => {
    if (!isAdmin) return;
    IrisService.getConversationStats(adminProjectFilter)
      .then((data) => setAdminGeneratingCount(data.generatingCount || 0))
      .catch(() => {});
  }, [isAdmin, adminProjectFilter]);



  // Admin: backend conversation stats for agent conversations
  useEffect(() => {
    if (!isAdmin) return;
    if (!activeId) {
      setBackendConversationStats(null);
      return;
    }
    if (adminSelectedSource === "agent_conversation") {
      IrisService.getConversationRunStats(activeId)
        .then((stats) => setBackendConversationStats(stats))
        .catch(() => setBackendConversationStats(null));

      ToolsApiService.getAllAgenticTasks({ conversationId: activeId })
        .then((result) => setTasksCount(result.summary?.total || (result.tasks || []).length))
        .catch(() => setTasksCount(0));

      PrismService.getCoordinatorSubAgents(activeId)
        .then((result) => {
          const subAgentsList = result.subAgents || [];
          setSubAgentsCount(subAgentsList.length);
          setMaxSubAgentDepth(
            subAgentsList.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
          );
        })
        .catch(() => {
          setSubAgentsCount(0);
          setMaxSubAgentDepth(0);
        });
    } else {
      setBackendConversationStats(null);
      setTasksCount(0);
      setSubAgentsCount(0);
      setMaxSubAgentDepth(0);
    }
  }, [isAdmin, activeId, adminSelectedSource]);

  // Admin: auto-scroll to bottom
  useEffect(() => {
    if (!isAdmin || adminLoadingDetail || !activeId || !adminViewerBodyRef.current) return;
    const element = adminViewerBodyRef.current;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, [isAdmin, activeId, adminLoadingDetail]);

  // Admin: entry list SSE-driven + polling fallback
  useEffect(() => {
    if (!isAdmin) return;
    adminKnownIdsRef.current = null;
    if (!initialId) adminAutoSelectedRef.current = false;
    adminLastFingerprintRef.current = "";
    setAdminEntries([]);
    setAdminFingerprint("");

    adminLoadEntries();

    let pollInterval: NodeJS.Timeout | null = null;
    const sseSubscription = IrisService.subscribeCollectionChanges({
      onStatus: (data: { changeStreams?: boolean }) => {
        setAdminChangeStreamsActive(!!data.changeStreams);
        if (!data.changeStreams) {
          if (!pollInterval) {
            pollInterval = setInterval(adminLoadEntries, ADMIN_POLL_INTERVAL);
          }
        }
      },
      onChange: (event: { collection?: string; id?: string }) => {
        if (
          event.collection === "model_conversations" ||
          event.collection === "agent_conversations"
        ) {
          adminLoadEntries();
          // Also refresh selected entry if it matches
          if (event.id && event.id === activeId) {
            adminRefreshSelectedEntry(activeId, adminSelectedSource);
          }
        }
      },
    });

    return () => {
      sseSubscription.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isAdmin, adminLoadEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin: fingerprint-based fallback refresh for selected entry
  useEffect(() => {
    if (!isAdmin || adminChangeStreamsActive) return;
    if (!activeId || adminFingerprint === adminFingerprintRef.current) return;
    adminFingerprintRef.current = adminFingerprint;
    adminRefreshSelectedEntry(activeId, adminSelectedSource);
  }, [isAdmin, activeId, adminFingerprint, adminChangeStreamsActive, adminRefreshSelectedEntry, adminSelectedSource]);

  // Admin: agent picker handler
  const adminHandleAgentSelect = useCallback(
    (agentPickedId: string) => {
      if (!isAdmin) return;
      const params = new URLSearchParams(adminSearchParams.toString());
      if (agentPickedId === "ALL") {
        params.delete("agent");
      } else {
        params.set("agent", agentPickedId);
      }
      const queryString = params.toString();
      adminRouter.replace(
        queryString ? `/admin/chat?${queryString}` : "/admin/chat",
        { scroll: false },
      );

      setActiveId(null);
      setMessages([]);
      setAdminSelectedSource(null);
      adminAutoSelectedRef.current = false;
    },
    [isAdmin, adminSearchParams, adminRouter],
  );

  // Admin: header controls
  useEffect(() => {
    if (!isAdmin) return;
    adminHeaderContext.setControls(
      <>
        <SelectComponent
          value={adminProjectFilter || ""}
          options={adminProjectOptions}
          onChange={adminHandleProjectChange}
          placeholder="All Projects"
          disabled={!!adminTraceFilter}
        />
        {adminGeneratingCount > 0 && (
          <span className={`${adminPageStyles['stat-pill']} ${adminPageStyles['stat-pill-generating']}`}>
            <Loader size={10} className={adminPageStyles['spinning']} />
            {adminGeneratingCount} generating
          </span>
        )}
        <ErrorMessage message={adminError} />
      </>,
    );
  }, [
    isAdmin,
    adminProjectFilter,
    adminProjectOptions,
    adminHandleProjectChange,
    adminGeneratingCount,
    adminError,
    adminTraceFilter,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin: title badge and cleanup
  useEffect(() => {
    if (!isAdmin) return;
    adminHeaderContext.setTitleBadge(adminEntries.length);
  }, [isAdmin, adminEntries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin) return;
    return () => {
      adminHeaderContext.setControls(null);
      adminHeaderContext.setTitleBadge(null);
    };
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════
  // ██  END ADMIN MODE Data Loading
  // ═══════════════════════════════════════════════════════════════

  // Load skills
  const loadSkills = useCallback(async () => {
    try {
      const skills = await PrismService.getSkills(agentProject);
      setSkills(skills);
    } catch (error: unknown) {
      console.error("Failed to load skills:", error);
    }
  }, [agentProject]);

  useEffect(() => {
    if (!isAdmin) loadSkills();
  }, [loadSkills, isAdmin]);

  // Load rules (per-agent slash commands)
  const loadRules = useCallback(async () => {
    try {
      const agentRules = await PrismService.getRules(agentId);
      setRules(agentRules);
    } catch (error: unknown) {
      console.error("Failed to load rules:", error);
    }
  }, [agentId]);

  useEffect(() => {
    if (!isAdmin) loadRules();
  }, [loadRules, isAdmin]);



  useEffect(() => {
    if (isAdmin) return;
    async function loadAgenticTools() {
      // Trigger Prism to re-fetch from tools-api (picks up newly added tools)
      try {
        await PrismService.refreshBuiltInToolSchemas();
      } catch {
        // Non-fatal — Prism may still have a stale cache
      }

      let tools = await PrismService.getBuiltInToolSchemas(
        isNoAgent ? undefined : agentId,
      );

      // Agentless mode: strip workspace/file domains — the model has no
      // SystemPromptAssembler context and cannot actually read/write files.
      if (isNoAgent) {
        const agentOnlyDomains = new Set<string>([
          DOMAINS.CORE_WORKSPACE.displayName,
        ]);
        tools = tools.filter(
          (tool) => !agentOnlyDomains.has(tool.domain || ""),
        );
      }

      setBuiltInTools(tools);
    }
    loadAgenticTools().catch(console.error);
  }, [agentId, isNoAgent, isAdmin]);

  // -- Fetch settings to determine which model-dependent tools are configured --
  useEffect(() => {
    PrismService.getSettings()
      .then((state: PrismSettings) => {
        const memorySection = state?.memory;
        const creativeSection = state?.creative;

        const hasExtraction = Boolean(memorySection?.extractionProvider && memorySection?.extractionModel);
        const hasConsolidation = Boolean(memorySection?.consolidationProvider && memorySection?.consolidationModel);
        const hasEmbedding = Boolean(memorySection?.embeddingProvider && memorySection?.embeddingModel);
        const isFullyConfigured = hasExtraction && hasConsolidation && hasEmbedding;

        setMemoryConfigured(isFullyConfigured);
        setExtractionModelConfigured(hasExtraction);
        setConsolidationModelConfigured(hasConsolidation);
        setEmbeddingModelConfigured(hasEmbedding);

        const hasAnyMemorySet = hasExtraction || hasConsolidation || hasEmbedding;
        setHasAnyMemoryModelSet(hasAnyMemorySet);
        if (!hasAnyMemorySet && leftTabBottomRef.current === "memories") {
          setLeftTabBottom("tools");
        }

        setImageModelConfigured(Boolean(creativeSection?.imageProvider && creativeSection?.imageModel));
        setVisionModelConfigured(Boolean(creativeSection?.visionProvider && creativeSection?.visionModel));
        setTextToSpeechModelConfigured(Boolean(creativeSection?.textToSpeechProvider && creativeSection?.textToSpeechModel));
        setSpeechToTextModelConfigured(Boolean(creativeSection?.speechToTextProvider && creativeSection?.speechToTextModel));

        if (state?.agents) {
          setSettings((previousSettings) => ({
            ...previousSettings,
            agents: { ...previousSettings.agents, ...state.agents },
          }));
        }
      })
      .catch(() => {
        setMemoryConfigured(false);
        setHasAnyMemoryModelSet(false);
        setImageModelConfigured(false);
        setVisionModelConfigured(false);
        setTextToSpeechModelConfigured(false);
        setSpeechToTextModelConfigured(false);
        setExtractionModelConfigured(false);
        setConsolidationModelConfigured(false);
        setEmbeddingModelConfigured(false);
      });
  }, []);

  // Tools that are force-disabled because a prerequisite settings model isn't configured.
  // Maps tool name → human-readable reason (shown in tooltip).
  const lockedOffTools = useMemo(() => {
    const lockedToolsMap = new Map<string, string>();
    if (!memoryConfigured) lockedToolsMap.set(TOOL_NAMES.SAVE_MEMORY, "Configure all Memory Models in Settings to unlock");
    if (!extractionModelConfigured) lockedToolsMap.set(TOOL_NAMES.EXTRACT_MEMORIES, "Configure the Extraction Model in Settings → Memory Models to unlock");
    if (!consolidationModelConfigured) lockedToolsMap.set(TOOL_NAMES.CONSOLIDATE_MEMORIES, "Configure the Consolidation Model in Settings → Memory Models to unlock");
    if (!embeddingModelConfigured) lockedToolsMap.set(TOOL_NAMES.SEARCH_MEMORIES, "Configure the Embedding Model in Settings → Memory Models to unlock");
    if (!imageModelConfigured) lockedToolsMap.set(TOOL_NAMES.GENERATE_IMAGE, "Configure the Image Generation Model in Settings → Creative Tools to unlock");
    if (!visionModelConfigured) lockedToolsMap.set(TOOL_NAMES.DESCRIBE_IMAGE, "Configure the Vision Model in Settings → Creative Tools to unlock");
    if (!textToSpeechModelConfigured) lockedToolsMap.set(TOOL_NAMES.SYNTHESIZE_SPEECH, "Configure the Text-to-Speech Model in Settings → Audio to unlock");
    if (!speechToTextModelConfigured) lockedToolsMap.set(TOOL_NAMES.TRANSCRIBE_AUDIO, "Configure the Speech-to-Text Model in Settings → Audio to unlock");

    // When the model has native thinking as a built-in capability, the think tool is redundant
    const activeModelDefinition = (config && settings.provider && settings.model)
      ? config.textToText?.models?.[settings.provider]?.find(
          (model: { name: string }) => model.name === settings.model,
        ) as Record<string, unknown> | undefined
      : undefined;
    const modelNameLower = (settings.model || "").toLowerCase();
    const thinkingPatterns = config?.thinkingPatterns || FALLBACK_THINKING_PATTERNS;
    const isNameBasedThinkingModel = thinkingPatterns.some((pattern) =>
      modelNameLower.includes(pattern),
    );
    const hasNativeThinking = !!(
      activeModelDefinition?.thinking ||
      activeModelDefinition?.supportsThinking ||
      (Array.isArray(activeModelDefinition?.thinkingLevels) && (activeModelDefinition.thinkingLevels as string[]).length > 0) ||
      (Array.isArray(activeModelDefinition?.tools) && (activeModelDefinition.tools as string[]).includes("Thinking")) ||
      (settings.provider === "lm-studio" && isNameBasedThinkingModel)
    );
    if (hasNativeThinking) {
      lockedToolsMap.set(TOOL_NAMES.THINK, "Disabled — this model has built-in thinking/reasoning");
    }

    // Force-disable workspace tools if no workspace is set up or active workspace is down
    const workspaceIsDown = !currentWorkspace || !currentWorkspace.isAgentServed;
    if (workspaceIsDown) {
      const reason = !currentWorkspace
        ? "No workspace set up — configure one in Settings to unlock"
        : "Workspace agent is down — make sure the workspace agent is running and connected";
      for (const tool of builtInTools || []) {
        const isWorkspaceTool =
          tool.domainKey === DOMAINS.CORE_WORKSPACE.key ||
          tool.domain === DOMAINS.CORE_WORKSPACE.displayName ||
          tool.name === TOOL_NAMES.ENTER_WORKTREE ||
          tool.name === TOOL_NAMES.EXIT_WORKTREE;
        if (isWorkspaceTool) {
          lockedToolsMap.set(tool.name, reason);
        }
      }
    }

    // Lock off workspace tools when the workspace capability is explicitly disabled via Strategy toggle
    if (settings.agents?.workspaceEnabled === false) {
      const workspaceDisabledReason = "Workspace capability disabled — enable it in Strategy settings to unlock";
      for (const tool of builtInTools || []) {
        const isWorkspaceTool =
          tool.domainKey === DOMAINS.CORE_WORKSPACE.key ||
          tool.domain === DOMAINS.CORE_WORKSPACE.displayName ||
          tool.name === TOOL_NAMES.ENTER_WORKTREE ||
          tool.name === TOOL_NAMES.EXIT_WORKTREE;
        if (isWorkspaceTool && !lockedToolsMap.has(tool.name)) {
          lockedToolsMap.set(tool.name, workspaceDisabledReason);
        }
      }
    }

    return lockedToolsMap;
  }, [
    memoryConfigured,
    extractionModelConfigured,
    consolidationModelConfigured,
    embeddingModelConfigured,
    imageModelConfigured,
    visionModelConfigured,
    textToSpeechModelConfigured,
    speechToTextModelConfigured,
    config,
    settings.provider,
    settings.model,
    currentWorkspace,
    builtInTools,
    settings.agents?.workspaceEnabled,
  ]);

  useEffect(() => {
    if (!showRaw || messages.length > 0 || isNoAgent) {
      setPreviewSystemPrompt(null);
      return;
    }

    const debounceTimer = setTimeout(() => {
      const allDisabledTools = [...disabledTools, ...lockedOffTools.keys()];
      PrismService.previewSystemPrompt({
        agent: agentId || undefined,
        disabledTools: allDisabledTools,
        workspaceEnabled: settings.agents?.workspaceEnabled !== false,
        systemPrompt: settings.systemPrompt || undefined,
        locale: settings.agents?.locale || undefined,
      })
        .then((result) => {
          setPreviewSystemPrompt(result.prompt);
        })
        .catch((error: unknown) => {
          console.error("[SystemPromptPreview] Failed to fetch preview:", error);
          setPreviewSystemPrompt(null);
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [
    showRaw,
    messages.length,
    isNoAgent,
    agentId,
    disabledTools,
    lockedOffTools,
    settings.agents?.workspaceEnabled,
    settings.agents?.locale,
    settings.systemPrompt,
  ]);

  // -- Eager-fetch tab badge counts (fires on mount / conversation change) --

  useEffect(() => {
    if (isAdmin) return;
    PrismService.getAgentMemories(agentProject, 1, agentId)
      .then((result) => setTotalMemoriesCount(result.total || 0))
      .catch(() => {});
  }, [agentProject, agentId, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    ToolsApiService.getAllAgenticTasks({ conversationId })
      .then((result) => setTasksCount(result.summary?.total || (result.tasks || []).length))
      .catch(() => {});
  }, [conversationId, tasksRefreshKey, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    PrismService.getCoordinatorSubAgents(conversationId)
      .then((result) => {
        const subAgentsList = result.subAgents || [];
        setSubAgentsCount(subAgentsList.length);
        setMaxSubAgentDepth(
          subAgentsList.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
        );
      })
      .catch(() => {});
  }, [conversationId, tasksRefreshKey, isAdmin]);

  // System prompt is fully assembled server-side by SystemPromptAssembler.
  // The client sends a placeholder system message that gets replaced.

  // -- Conversation stats for SettingsPanel ------------------
  const {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens,
    requestCount,
    usedTools,
    modalities,
    elapsedTime: completedElapsedTime,
    liveStreamingTokens,
    liveStreamingStartTime,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    subAgentGenerationProgress,
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  } = useConversationStats(messages);

  // -- Live-patch sidebar conversation metadata ------------------
  // Keep the active conversation's entry in `conversations[]` in sync with the
  // live stats derived from messages so the HistoryPanel badges
  // (model, provider, modalities, cost) update in real-time during
  // generation — no full loadConversations() round-trip needed.
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    setConversations((previousConversations) => {
      const index = previousConversations.findIndex((state) => state.id === activeId);
      if (index === -1) return previousConversations;
      const existing = previousConversations[index] as unknown as Record<
        string,
        unknown
      >;
      const lastMessage = messages[messages.length - 1];
      const bgUsage =
        lastMessage?.role === "assistant"
          ? lastMessage._backgroundUsage
          : null;
      const activeMessageCost =
        lastMessage?.role === "assistant" && isBackendStatsStale
          ? lastMessage.estimatedCost ||
            lastMessage._intermediateEstimatedCost ||
            0
          : 0;
      const resolvedCost = backendConversationStats
        ? (backendConversationStats.totalCost || 0) +
          (bgUsage?.cost || 0) +
          activeMessageCost
        : isNoAgent
          ? Math.max((existing.totalCost as number) || 0, totalCost)
          : totalCost;
      const resolvedModalities: Record<string, number> =
        (backendConversationStats?.modalities ?? modalities) as Record<
          string,
          number
        >;
      const resolvedToolCounts = backendConversationStats?.toolCounts ?? undefined;
      const resolvedProviders =
        uniqueProviders.length > 0 ? uniqueProviders : existing.providers;
      const resolvedModels =
        uniqueModels.length > 0 ? uniqueModels : existing._liveModelNames;
      // Shallow equality check — skip update if nothing visually changed
      const prevMod = existing._liveModalities as
        | Record<string, number>
        | undefined;
      const modSame =
        prevMod &&
        Object.keys(resolvedModalities).every(
          (k) => prevMod[k] === resolvedModalities[k],
        );
      if (
        modSame &&
        existing.totalCost === resolvedCost &&
        existing.title === title &&
        JSON.stringify(existing._liveModelNames) ===
          JSON.stringify(resolvedModels) &&
        JSON.stringify(existing.providers) === JSON.stringify(resolvedProviders)
      ) {
        return previousConversations;
      }
      const updated = [...previousConversations] as unknown as Record<
        string,
        unknown
      >[];
      updated[index] = {
        ...existing,
        title,
        totalCost: resolvedCost,
        modalities: resolvedModalities,
        toolCounts: resolvedToolCounts,
        providers: resolvedProviders as string[],
        _liveModelNames: resolvedModels as string[],
        _liveModalities: resolvedModalities,
        // Preserve the original server-side updatedAt — overwriting it with
        // Date.now() causes the DateTimeBadge to flash "just now" on click.
      };
      return updated as unknown as Array<AgentConversation | Conversation>;
    });
  }, [
    activeId,
    title,
    modalities,
    uniqueModels,
    uniqueProviders,
    totalCost,
    backendConversationStats,
    messages.length,
    isBackendStatsStale,
  ]);

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
            .then((conversation) => {
              if (conversation?.totalCost != null) {
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
                    existing.totalCost === conversation.totalCost
                  ) {
                    return previousConversations;
                  }
                  const updated = [
                    ...previousConversations,
                  ] as unknown as Record<string, unknown>[];
                  updated[index] = {
                    ...existing,
                    totalCost: conversation.totalCost,
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
    [agentProject, isNoAgent],
  );

  // Build final tool schemas
  const allToolSchemas = useMemo(
    () => buildToolSchemas(builtInTools, disabledTools),
    [builtInTools, disabledTools],
  );

  const configurableTools = useMemo(() => {
    return builtInTools.filter((tool) => tool.system !== true);
  }, [builtInTools]);

  const enabledConfigurableCount = useMemo(() => {
    return configurableTools.filter((tool) => !disabledTools.has(tool.name))
      .length;
  }, [configurableTools, disabledTools]);

  const coreToolsCount = useMemo(() => {
    return builtInTools.filter((tool) => tool.system === true).length;
  }, [builtInTools]);

  const enabledCoreToolsCount = useMemo(() => {
    return builtInTools.filter((tool) => tool.system === true && !disabledTools.has(tool.name)).length;
  }, [builtInTools, disabledTools]);

  const selectableConfigurableTools = useMemo(() => {
    return configurableTools.filter((tool) => !lockedOffTools.has(tool.name));
  }, [configurableTools, lockedOffTools]);

  const enabledSelectableConfigurableToolsCount = useMemo(() => {
    return selectableConfigurableTools.filter((tool) => !disabledTools.has(tool.name)).length;
  }, [selectableConfigurableTools, disabledTools]);

  const selectableCoreToolsCount = useMemo(() => {
    return builtInTools.filter((tool) => tool.system === true && !lockedOffTools.has(tool.name)).length;
  }, [builtInTools, lockedOffTools]);

  const enabledSelectableCoreToolsCount = useMemo(() => {
    return builtInTools.filter((tool) => tool.system === true && !lockedOffTools.has(tool.name) && !disabledTools.has(tool.name)).length;
  }, [builtInTools, lockedOffTools, disabledTools]);

  // Derive whether the active agent has Workspace capability (files, git, search, etc.)
  const hasFileOperations = useMemo(
    () => builtInTools.some((tool) => tool.domain === DOMAINS.CORE_WORKSPACE.displayName),
    [builtInTools],
  );

  const hasOrchestratorTools = useMemo(
    () => builtInTools.some(
      (tool) =>
        tool.domain === DOMAINS.CORE_ORCHESTRATOR.displayName &&
        !disabledTools.has(tool.name) &&
        !lockedOffTools.has(tool.name),
    ),
    [builtInTools, disabledTools, lockedOffTools],
  );

  const isWorkspaceTabVisible = useMemo(() => {
    return (
      !isNoAgent &&
      settings.agents?.workspaceEnabled !== false &&
      ((currentWorkspace &&
        hasFileOperations &&
        (currentWorkspace.path !== "/workspace" ||
          currentWorkspace.isAgentServed ||
          workspaces.some((workspace) => workspace.path !== "/workspace"))) ||
        !!unavailableWorkspace)
    );
  }, [isNoAgent, currentWorkspace, hasFileOperations, workspaces, unavailableWorkspace, settings.agents?.workspaceEnabled]);

  useEffect(() => {
    if (leftTab === "workspace" && !isWorkspaceTabVisible) {
      setLeftTab("settings");
    }
  }, [leftTab, isWorkspaceTabVisible]);

  useEffect(() => {
    if (leftTab === "subAgents" && !hasOrchestratorTools) {
      setLeftTab("settings");
    }
  }, [leftTab, hasOrchestratorTools]);

  // -- Memoize filtered messages for MessageList to prevent ref churn --
  const filteredMessages = useMemo(
    () => messages.filter((message) =>
      message.role === "user" ||
      message.role === "assistant" ||
      (showRaw && message.role === "system"),
    ),
    [messages, showRaw],
  );


  // -- Editable serialization -------------------------------------
  // The input is a contentEditable div. Mention badges are non-editable
  // <span data-mention-path="..."> elements. We serialize them back to
  // `@full/path` when sending so the model gets the real file reference.
  // Pure logic lives in mentionUtils.js; here we just wire it up.

  /** Create a styled mention badge span (wraps the pure fn). */
  const createMentionBadge = useCallback(
    (
      path: string,
      name: string,
      type: string | undefined,
      badgeOpts?: Parameters<typeof _createMentionBadge>[3],
    ) => {
      return _createMentionBadge(path, name, type, badgeOpts);
    },
    [],
  );

  // -- Stable input change handler -----------------------------
  const handleInputChange = useCallback(
    (_e: React.FormEvent<HTMLDivElement>) => {
      const element = textareaRef.current;
      if (!element) return;
      const value = serializeEditable(element);
      inputValueRef.current = value;
      window.dispatchEvent(new CustomEvent(EV_USER_TYPING));
      const hasSlashBadges = element.querySelectorAll("[data-slash-command]").length > 0;
      const nowHasInput = value.trim().length > 0 || hasSlashBadges;
      setHasInput((previousHasInput) =>
        previousHasInput !== nowHasInput ? nowHasInput : previousHasInput,
      );
      // -- Mention autocomplete detection --
      detectMentionQueryRef.current?.(element);
      // -- Slash command detection --
      // Only open the picker when the raw text content starts with / and
      // there are no existing badges (otherwise the user is just typing after a badge).
      const trimmedValue = value.trim();
      if (trimmedValue.startsWith("/") && !trimmedValue.includes(" ") && !hasSlashBadges) {
        setSlashCommandOpen(true);
        setSlashCommandQuery(trimmedValue.slice(1).toLowerCase());
      } else {
        setSlashCommandOpen(false);
        setSlashCommandQuery("");
      }
    },
    [],
  );

  // Helper to programmatically set the editable value (quick prompts, queue cancel)
  const setTextareaValue = useCallback((text: string) => {
    inputValueRef.current = text;
    setHasInput(text.trim().length > 0);
    if (textareaRef.current) {
      textareaRef.current.textContent = text;
    }
  }, []);

  /** Strip HTML on paste — contentEditable should only accept plain text. */
  const handleEditablePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      placeCaretAfter(textNode);
      // Sync
      const element = textareaRef.current;
      if (element) {
        inputValueRef.current = serializeEditable(element);
        setHasInput(inputValueRef.current.trim().length > 0);
      }
    },
    [],
  );

  // -- File mention handler (@ in workspace tree) ---------------
  // Inserts a styled badge at the current cursor position.
  const handleMentionFile = useCallback(
    (filePath: string) => {
      const element = textareaRef.current;
      if (!element) return;
      const name = filePath.split("/").pop();
      const isDir = !name?.includes(".");
      const badge = createMentionBadge(
        filePath,
        name ?? "",
        isDir ? "directory" : "file",
      );
      const space = document.createTextNode(" ");
      const selection = window.getSelection();
      const range =
        selection &&
        selection.rangeCount &&
        element.contains(selection.anchorNode)
          ? selection.getRangeAt(0)
          : null;
      if (range) {
        const container = range.startContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          const characterCount = container.textContent
            ? container.textContent[range.startOffset - 1]
            : "";
          if (
            characterCount &&
            characterCount !== " " &&
            characterCount !== "\n"
          ) {
            range.insertNode(document.createTextNode(" "));
            range.collapse(false);
          }
        }
        range.insertNode(space);
        range.insertNode(badge);
      } else {
        if ((element.textContent || "").length > 0)
          element.appendChild(document.createTextNode(" "));
        element.appendChild(badge);
        element.appendChild(space);
      }
      placeCaretAfter(space);
      inputValueRef.current = serializeEditable(element);
      setHasInput(true);
      element.focus();
    },
    [createMentionBadge],
  );

  // -- File-line mention handler (@ gutter in FileViewerPanel) --
  // Inserts a file-line badge (e.g. 📄 file.js:42 or 📄 file.js:10-25)
  const handleMentionLines = useCallback(
    (filePath: string, startLine: number, endLine: number) => {
      const element = textareaRef.current;
      if (!element) return;
      const name = filePath.split("/").pop();
      const badge = createMentionBadge(filePath, name ?? "", "file", {
        lineStart: startLine,
        lineEnd: endLine,
      });
      const space = document.createTextNode(" ");
      const selection = window.getSelection();
      const range =
        selection &&
        selection.rangeCount &&
        element.contains(selection.anchorNode)
          ? selection.getRangeAt(0)
          : null;
      if (range) {
        const container = range.startContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          const characterCount = container.textContent
            ? container.textContent[range.startOffset - 1]
            : "";
          if (
            characterCount &&
            characterCount !== " " &&
            characterCount !== "\n"
          ) {
            range.insertNode(document.createTextNode(" "));
            range.collapse(false);
          }
        }
        range.insertNode(space);
        range.insertNode(badge);
      } else {
        if ((element.textContent || "").length > 0)
          element.appendChild(document.createTextNode(" "));
        element.appendChild(badge);
        element.appendChild(space);
      }
      placeCaretAfter(space);
      inputValueRef.current = serializeEditable(element);
      setHasInput(true);
      element.focus();
    },
    [createMentionBadge],
  );

  // -- Mention Autocomplete ---------------------------------------
  const mentionCacheRef = useRef<ReturnType<typeof flattenTree> | null>(null);
  const mentionLoadingRef = useRef<boolean>(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionAnchorRef = useRef<{ node: Text; offset: number } | null>(null); // { node, offset } of the `@`
  const mentionListRef = useRef<HTMLDivElement | null>(null);
  // Set of known workspace paths — used for mention badge staleness detection
  const [knownPaths, setKnownPaths] = useState<string[] | undefined>(undefined);

  const currentWorkspacePath = currentWorkspace?.path;
  const ensureMentionCache = useCallback(async () => {
    if (mentionCacheRef.current || mentionLoadingRef.current) return;
    if (!currentWorkspacePath) return;
    mentionLoadingRef.current = true;
    try {
      const data = await WorkspaceService.tree(currentWorkspacePath, 5);
      if (data?.tree) {
        const flat = flattenTree(data.tree);
        mentionCacheRef.current = flat;
        setKnownPaths(
          flat
            .map((entry) => entry.path)
            .filter((filePath): filePath is string => typeof filePath === "string"),
        );
      }
    } catch {
      /* autocomplete unavailable */
    }
    mentionLoadingRef.current = false;
  }, [currentWorkspacePath]);

  useEffect(() => {
    mentionCacheRef.current = null;
    setKnownPaths(undefined);
    // Re-fetch immediately so knownPaths is available for badge staleness
    ensureMentionCache();
  }, [workspaceTreeRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eagerly populate knownPaths on mount so message list badges can
  // detect staleness without waiting for the user to type @.
  useEffect(() => {
    ensureMentionCache();
  }, [ensureMentionCache]);

  /** Detect @query from cursor position inside contentEditable. */
  const detectMentionQuery = useCallback(
    (element: HTMLDivElement) => {
      const selection = window.getSelection();
      if (
        !selection ||
        !selection.rangeCount ||
        !element.contains(selection.anchorNode)
      ) {
        setMentionOpen(false);
        return;
      }
      const anchor = selection.anchorNode as Text | null;
      if (
        !anchor ||
        anchor.nodeType !== Node.TEXT_NODE ||
        !anchor.textContent
      ) {
        setMentionOpen(false);
        return;
      }
      const result = detectMentionToken(
        anchor.textContent,
        selection.anchorOffset,
      );
      if (result) {
        mentionAnchorRef.current = {
          node: anchor,
          offset: result.anchorOffset,
        };
        setMentionQuery(result.query);
        setMentionIndex(0);
        setMentionOpen(true);
        ensureMentionCache();
      } else {
        setMentionOpen(false);
      }
    },
    [ensureMentionCache],
  );
  const detectMentionQueryRef = useRef<((el: HTMLDivElement) => void) | null>(
    detectMentionQuery,
  );
  detectMentionQueryRef.current = detectMentionQuery;

  const mentionResults = useMemo(() => {
    if (!mentionOpen || !mentionCacheRef.current) return [];
    return filterMentionResults(mentionCacheRef.current, mentionQuery, 20);
  }, [mentionOpen, mentionQuery]);

  /** Apply mention — replace @query text with a badge span. */
  const applyMention = useCallback(
    (entry: { path?: string; name: string; type?: string }) => {
      const element = textareaRef.current;
      if (!element || !mentionAnchorRef.current) return;
      const { node, offset } = mentionAnchorRef.current;
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const badge = createMentionBadge(
        entry.path || "",
        entry.name,
        entry.type,
      );
      const space = applyMentionToTextNode(
        node,
        offset,
        selection.anchorOffset,
        badge,
      );
      placeCaretAfter(space);
      inputValueRef.current = serializeEditable(element);
      setHasInput(inputValueRef.current.trim().length > 0);
      setMentionOpen(false);
      element.focus();
    },
    [createMentionBadge],
  );

  // -- File/image handlers --------------------------------------
  const classifyFileModality = useCallback(
    (mimeType: string): string | null => {
      if (mimeType.startsWith("image/") && supportedInputModalities.has("image")) return "image";
      if (mimeType.startsWith("audio/") && supportedInputModalities.has("audio")) return "audio";
      if (mimeType.startsWith("video/") && supportedInputModalities.has("video")) return "video";
      if (mimeType === "application/pdf" && supportedInputModalities.has("pdf")) return "pdf";
      const documentMimeTypes = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "text/tab-separated-values",
      ];
      if (documentMimeTypes.includes(mimeType) && supportedInputModalities.has("document")) return "document";
      return null;
    },
    [supportedInputModalities],
  );

  const routeFileToState = useCallback(
    (file: globalThis.File) => {
      const modality = classifyFileModality(file.type);
      if (!modality) return;

      const reader = new FileReader();
      reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
        if (!readerEvent.target?.result) return;
        const dataUrl = readerEvent.target.result as string;

        if (modality === "image") {
          setPendingImages((previous) => [...previous, dataUrl]);
        } else {
          setPendingFiles((previous) => [
            ...previous,
            { name: file.name, mimeType: file.type, dataUrl, modality },
          ]);
        }
      };
      reader.readAsDataURL(file);
    },
    [classifyFileModality],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        routeFileToState(file);
      }
      e.target.value = "";
    },
    [routeFileToState],
  );

  const removeImage = useCallback((index: number) => {
    setPendingImages((previous) =>
      previous.filter((_, i) => i !== index),
    );
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((previous) =>
      previous.filter((_, i) => i !== index),
    );
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (supportsAnyFileInput && e.dataTransfer?.items?.length > 0) {
        setIsDragging(true);
      }
    },
    [supportsAnyFileInput],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      if (!supportsAnyFileInput) return;
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        routeFileToState(file);
      }
    },
    [supportsAnyFileInput, routeFileToState],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (!supportsAnyFileInput) return;
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((item) => {
          if (item.kind !== "file") return false;
          return classifyFileModality(item.type) !== null;
        })
        .map((item) => item.getAsFile())
        .filter((file): file is globalThis.File => file !== null);
      if (files.length === 0) return;
      e.preventDefault();
      for (const file of files) {
        routeFileToState(file);
      }
    },
    [supportsAnyFileInput, classifyFileModality, routeFileToState],
  );

  // -- Orchestration loop ---------------------------------------
  const runOrchestrationLoop = useCallback(
    async (conversationMessages: ClientMessage[], resolvedTitle: string) => {
      const currentMessages = [...conversationMessages];
      // Capture which conversation this generation belongs to — if the user
      // switches conversations, streaming callbacks will skip UI updates.
      const generationConversationId = conversationIdRef.current;

      await new Promise<void>((resolve, reject) => {
        // -- Build payload: Direct Chat (/chat) vs Agent (/agent) --
        const payload = isNoAgent
          ? {
              // Direct Chat: raw /chat endpoint — no agentic loop
              provider: settings.provider ?? "",
              model: settings.model ?? "",
              messages: [
                ...(settings.systemPrompt
                  ? [
                      {
                        role: "system" as const,
                        content: settings.systemPrompt,
                      },
                    ]
                  : []),
                ...currentMessages,
              ],
              maxTokens: settings.maxTokens,
              temperature: settings.temperature,
              ...(settings.thinkingEnabled !== undefined && {
                thinkingEnabled: settings.thinkingEnabled,
              }),
              ...(settings.reasoningEffort && {
                reasoningEffort: settings.reasoningEffort,
              }),
              ...(settings.thinkingBudget && {
                thinkingBudget: settings.thinkingBudget,
              }),
              ...(settings.thinkingLevel && {
                thinkingLevel: settings.thinkingLevel,
              }),
              // Native provider FC (Google code exec, LM Studio MCP, etc.)
              functionCallingEnabled: settings.functionCallingEnabled ?? false,
              ...(settings.functionCallingEnabled && {
                disabledTools: [...disabledTools, ...lockedOffTools.keys()],
              }),
              // Provider-native capabilities
              ...(settings.webSearchEnabled ? { webSearch: true } : {}),
              ...(settings.codeExecutionEnabled ? { codeExecution: true } : {}),
              ...(settings.urlContextEnabled ? { urlContext: true } : {}),
              conversationId,
              conversationMeta: {
                title: resolvedTitle,
                ...(settings.systemPrompt
                  ? { systemPrompt: settings.systemPrompt }
                  : {}),
              },
              // Omit project — falls back to x-project header ("prism"),
              // routing to the conversations collection
              traceId,
            }
          : {
              // Agent mode: full /agent endpoint with AgenticLoopService
              provider: settings.provider ?? "",
              model: settings.model ?? "",
              messages: [
                // System prompt placeholder — replaced server-side by SystemPromptAssembler
                { role: "system" as const, content: "" },
                ...currentMessages,
              ],
              functionCallingEnabled: true,
              disabledTools: [...disabledTools, ...lockedOffTools.keys()],
              maxTokens: settings.maxTokens,
              temperature: settings.temperature,
              ...(settings.thinkingEnabled !== undefined && {
                thinkingEnabled: settings.thinkingEnabled,
              }),
              ...(settings.reasoningEffort && {
                reasoningEffort: settings.reasoningEffort,
              }),
              ...(settings.thinkingBudget && {
                thinkingBudget: settings.thinkingBudget,
              }),
              ...(settings.thinkingLevel && {
                thinkingLevel: settings.thinkingLevel,
              }),
              // Local models need enough context for MCP tool schemas + conversation
              minContextLength: 120_000,
              project: agentProject,
              conversationId,
              conversationMeta: { title: resolvedTitle },
              traceId,
              agent: agentId,
              harness: settings?.agents?.harness || "standard",
              topology: settings?.agents?.topology || DEFAULT_TOPOLOGY,
              thoughtStructure:
                (settings?.agents?.thoughtStructure as string) || undefined,
              // Phase 1: Agentic controls
              autoApprove,
              planFirst,
              maxIterations: Number.isFinite(maxIterations) ? maxIterations : 0,
              maxSubAgentIterations: Number.isFinite(maxSubAgentIterations)
                ? maxSubAgentIterations
                : 0,
              maxRecursionDepth,
              ...(criticGateEnabled && { enableCriticGate: true }),
              ...(settings.agents?.workspaceEnabled === false && {
                workspaceEnabled: false,
              }),
              ...(settings.agents?.locale && {
                locale: settings.agents.locale,
              }),
            };

        let streamedText = "";
        let streamedThinking = "";
        let firstChunkTime: number | undefined;
        let prevChunkTime: number | null = null; // previous chunk's timestamp for delta accumulation
        let burstTokens = 0; // tokens in current generation burst (resets on gap)
        let burstElapsed = 0; // elapsed in current generation burst (resets on gap)
        const CHUNK_GAP_THRESHOLD = 500; // ms — gaps larger than this are processing/tool pauses
        // -- Interleaved content tracking --
        // contentSegments: ordered list of { type: "thinking", fragmentIndex } | { type: "text", fragmentIndex } | { type: "tools", toolIds: [...] }
        // textFragments: array of strings, one per text segment — the text delta between tool groups
        // thinkingFragments: array of strings, one per thinking segment — the thinking delta between tool groups
        const contentSegments: ContentSegment[] = [];
        const textFragments: string[] = [];
        const thinkingFragments: string[] = [];
        const segmentToolIdSet = new Set(); // Dedup: track tool IDs already in contentSegments
        let lastSegmentType: string | null = null; // "thinking" | "text" | "tools"
        let prevCleanLen = 0; // length of cleanTextRaw at last onChunk — used for computing deltas
        let prevThinkingLen = 0; // length of thinking text at last onThinking — used for computing deltas

        // Deep-copy segments for React state (objects are shared refs otherwise)
        const snapshotSegments = () =>
          contentSegments.map((segment) => ({
            ...segment,
            ...(segment.toolIds ? { toolIds: [...segment.toolIds] } : {}),
          }));

        // Guard: returns true when the user switched conversations — skip all UI updates
        // but let the stream continue (the backend saves independently).
        const isStale = () => conversationIdRef.current !== generationConversationId;

        // Direct Chat → streamText (/chat); Agents → streamAgentText (/agent)
        const streamFn = isNoAgent
          ? PrismService.streamText
          : PrismService.streamAgentText;
        abortRef.current = streamFn(payload, {
          onChunk: (
            content: string,
            _sourceModel?: string,
            outputCharacters?: number,
          ) => {
            streamedText += content;
            // Backend sends authoritative running token count on each chunk
            burstTokens++;
            // Skip UI updates if user switched conversations
            if (isStale()) return;
            const now = performance.now();
            if (!firstChunkTime)
              console.debug(
                `[onChunk] first chunk received, ${content.length}ch, stale=${isStale()}`,
              );
            if (!firstChunkTime) firstChunkTime = now;
            // Accumulate generation-only elapsed: skip gaps from processing/tool phases
            if (prevChunkTime !== null) {
              const delta = now - prevChunkTime;
              if (delta < CHUNK_GAP_THRESHOLD) {
                burstElapsed += delta;
              } else {
                // New generation burst — reset burst counters for fresh tok/s
                burstTokens = 1;
                burstElapsed = 0;
              }
            }
            prevChunkTime = now;

            // Track segment ordering: start a new text fragment when text resumes after tools
            if (lastSegmentType !== "text") {
              contentSegments.push({
                type: "text",
                fragmentIndex: textFragments.length,
              });
              textFragments.push("");
              lastSegmentType = "text";
            }

            // Text is now sanitized server-side (tool call XML stripped in
            // StreamChunkDispatcher/AgenticLoopService) — use streamedText directly.

            // Compute text delta since last update and append to current fragment
            const delta = streamedText.slice(prevCleanLen);
            if (delta) {
              textFragments[textFragments.length - 1] += delta;
            }
            prevCleanLen = streamedText.length;

            const cleanText = streamedText.trim();
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const lastMessage = updated[updated.length - 1];
              if (lastMessage?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...lastMessage,
                  content: cleanText,
                  contentSegments: snapshotSegments(),
                  textFragments: [...textFragments],
                  thinkingFragments: [...thinkingFragments],
                  _streamingOutputCharacters: outputCharacters || 0,
                  _streamingStartTime: firstChunkTime,
                  _streamingLastChunkTime: now,
                  _streamingBurstTokens: burstTokens,
                  _streamingBurstElapsed: burstElapsed,
                };
              } else {
                updated.push({
                  role: "assistant",
                  content: cleanText,
                  contentSegments: snapshotSegments(),
                  textFragments: [...textFragments],
                  thinkingFragments: [...thinkingFragments],
                  _streamingOutputCharacters: outputCharacters || 0,
                  _streamingStartTime: firstChunkTime,
                  _streamingLastChunkTime: now,
                  _streamingBurstTokens: burstTokens,
                  _streamingBurstElapsed: burstElapsed,
                });
              }
              return updated;
            });
          },
          onThinking: (
            content: string,
            _sourceModel?: string,
            outputCharacters?: number,
          ) => {
            streamedThinking += content;
            if (isStale()) return;

            // Backend sends authoritative running token count on each thinking chunk
            burstTokens++;
            const now = performance.now();
            if (!firstChunkTime) firstChunkTime = now;
            if (prevChunkTime !== null) {
              const delta = now - prevChunkTime;
              if (delta < CHUNK_GAP_THRESHOLD) {
                burstElapsed += delta;
              } else {
                burstTokens = 1;
                burstElapsed = 0;
              }
            }
            prevChunkTime = now;

            // Track segment ordering: start a new thinking fragment when thinking resumes after tools
            if (lastSegmentType !== "thinking") {
              contentSegments.push({
                type: "thinking",
                fragmentIndex: thinkingFragments.length,
              });
              thinkingFragments.push("");
              lastSegmentType = "thinking";
            }

            // Compute thinking delta and append to current fragment
            const delta = streamedThinking.slice(prevThinkingLen);
            if (delta) {
              thinkingFragments[thinkingFragments.length - 1] += delta;
            }
            prevThinkingLen = streamedThinking.length;

            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const lastMessage = updated[updated.length - 1];
              if (lastMessage?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...lastMessage,
                  thinking: streamedThinking,
                  contentSegments: snapshotSegments(),
                  thinkingFragments: [...thinkingFragments],
                  _streamingOutputCharacters: outputCharacters || 0,
                  _streamingStartTime: firstChunkTime,
                  _streamingLastChunkTime: now,
                  _streamingBurstTokens: burstTokens,
                  _streamingBurstElapsed: burstElapsed,
                };
              } else {
                updated.push({
                  role: "assistant",
                  content: "",
                  thinking: streamedThinking,
                  contentSegments: snapshotSegments(),
                  thinkingFragments: [...thinkingFragments],
                  _streamingOutputCharacters: outputCharacters || 0,
                  _streamingStartTime: firstChunkTime,
                  _streamingLastChunkTime: now,
                  _streamingBurstTokens: burstTokens,
                  _streamingBurstElapsed: burstElapsed,
                });
              }
              return updated;
            });
          },
          onImage: (dataStr: string, mimeType: string, minioRef?: string) => {
            if (isStale()) return;
            const imgRef = minioRef || dataStr;
            if (!imgRef) return;
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                const existingImages = last.images || [];
                if (!existingImages.includes(imgRef)) {
                  updated[updated.length - 1] = {
                    ...last,
                    images: [...existingImages, imgRef],
                  };
                }
              } else {
                updated.push({
                  role: "assistant",
                  content: "",
                  images: [imgRef],
                });
              }
              return updated;
            });
          },
          onAudio: (dataString: string, _mimeType: string) => {
            if (isStale()) return;
            if (!dataString) return;
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                const existingAudio = Array.isArray(last.audio)
                  ? last.audio
                  : last.audio
                    ? [last.audio]
                    : [];
                if (!existingAudio.includes(dataString)) {
                  updated[updated.length - 1] = {
                    ...last,
                    audio: [...existingAudio, dataString],
                  };
                }
              } else {
                updated.push({
                  role: "assistant",
                  content: "",
                  audio: [dataString],
                });
              }
              return updated;
            });
          },
          onToolExecution: (data: SSEData) => {
            if (isStale()) return;
            const toolData = data.tool;
            if (!toolData) return;
            const resolvedId =
              toolData.id || `tc-${Date.now()}-${Math.random()}`;
            console.debug(
              `[ToolExec] ${data.status} ${toolData.name} id=${resolvedId}`,
            );

            setToolActivity((previousToolActivity: ToolCallEvent[]) => {
              const next = applyToolExecutionToActivity(
                previousToolActivity,
                resolvedId,
                {
                  id: toolData.id,
                  name: toolData.name,
                  args: toolData.args,
                  status: data.status as string,
                  result: toolData.result,
                  durationMs: toolData.durationMs,
                },
              );
              return next ?? previousToolActivity;
            });

            // Track segment ordering: group consecutive tool events
            // Guard: only add to segments if not already tracked
            if (data.status === "streaming" || data.status === "calling") {
              if (!segmentToolIdSet.has(resolvedId)) {
                segmentToolIdSet.add(resolvedId);
                if (lastSegmentType === "tools") {
                  // Append to current tools segment
                  contentSegments[contentSegments.length - 1].toolIds!.push(
                    resolvedId,
                  );
                } else {
                  contentSegments.push({
                    type: "tools",
                    toolIds: [resolvedId],
                  });
                  lastSegmentType = "tools";
                }
              }
            }

            // Capture snapshot values from the mutable streaming closure
            // BEFORE passing to the functional updater
            const execSnapshot = {
              contentSegments: snapshotSegments(),
              textFragments: [...textFragments],
              thinkingFragments: [...thinkingFragments],
            };

            setMessages((msgPrev: ClientMessage[]) => {
              const next = applyToolExecutionToMessages(
                msgPrev,
                resolvedId,
                {
                  id: toolData.id,
                  name: toolData.name,
                  args: toolData.args,
                  status: data.status as string,
                  result: toolData.result,
                  durationMs: toolData.durationMs,
                },
                execSnapshot,
              ) as ClientMessage[];
              console.debug(
                `[ToolExec setMessages] ${data.status} ${toolData.name}: previousPixelSize=${msgPrev.length} → next=${next.length}`,
              );
              return next;
            });

            // Auto-refresh tasks panel when any task tool completes
            if (
              data.status !== "calling" &&
              toolData.name &&
              toolData.name.includes("_task")
            ) {
              setTasksRefreshKey((k) => k + 1);
            }

            // Increment scheduled task notification badge when agent creates a cron job
            if (
              data.status === "done" &&
              toolData.name === TOOL_NAMES.CREATE_CRON_JOB
            ) {
              const currentNotificationCount = parseInt(
                localStorage.getItem(LS_CRON_JOB_NOTIFICATIONS_COUNT) || "0",
                10,
              );
              localStorage.setItem(
                LS_CRON_JOB_NOTIFICATIONS_COUNT,
                String(currentNotificationCount + 1),
              );
              window.dispatchEvent(new CustomEvent(EV_CRON_JOB_SCHEDULED));
            }

            // Auto-refresh memories panel when save_memory completes
            if (
              data.status !== "calling" &&
              toolData.name === TOOL_NAMES.SAVE_MEMORY
            ) {
              if (hasAnyMemoryModelSet) {
                setLeftTabBottom("memories");
              }
              setMemoriesRefreshKey((k) => k + 1);
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((result) => setTotalMemoriesCount(result.total || 0))
                .catch(() => {
                  /* Non-critical background count refresh */
                });
            }

            // Auto-refresh workspace tree when filesystem-mutating tools complete
            if (
              data.status !== "calling" &&
              WORKSPACE_FS_TOOLS.has(toolData.name || "")
            ) {
              setWorkspaceTreeRefreshKey((k) => k + 1);

              // Live-update file viewer: refresh open tabs whose path was touched
              const mutatedPath =
                (toolData.args?.path as string) ||
                (toolData.args?.source as string) ||
                null;
              const openFiles = viewerOpenFilesRef.current;
              if (mutatedPath && openFiles.length > 0) {
                // delete_file and move_file both remove the source path
                if (
                  toolData.name === TOOL_NAMES.DELETE_FILE ||
                  toolData.name === TOOL_NAMES.MOVE_FILE
                ) {
                  const deleted = openFiles.find(
                    (file: ViewerOpenFile) => file.path === mutatedPath,
                  );
                  if (deleted) {
                    setViewerOpenFiles((previousViewerOpenFiles) => {
                      const next = previousViewerOpenFiles.filter(
                        (file: ViewerOpenFile) => file.path !== mutatedPath,
                      );
                      setViewerActiveFileId((activeId: string | null) => {
                        if (activeId !== deleted.id) return activeId;
                        const closedTabIndex = previousViewerOpenFiles.findIndex(
                          (file: ViewerOpenFile) => file.id === deleted.id,
                        );
                        const newActive =
                          next[Math.min(closedTabIndex, next.length - 1)];
                        return newActive?.id || null;
                      });
                      return next;
                    });
                  }
                } else if (openFiles.some((file) => file.path === mutatedPath)) {
                  // Bump refresh key to re-fetch modified file content
                  setViewerRefreshKey((k) => k + 1);
                }
              }
            }
          },
          // LM Studio native MCP tool calls (toolCall events)
          onToolCall: (toolCall: ToolCallEvent) => {
            if (isStale()) return;
            const toolData = toolCall;
            const resolvedId =
              toolData.id || `tc-${Date.now()}-${Math.random()}`;
            console.debug(
              `[ToolCall MCP] ${toolData.status} ${toolData.name} id=${resolvedId}`,
            );

            setToolActivity((previousToolActivity) => {
              const next = applyToolExecutionToActivity(
                previousToolActivity,
                resolvedId,
                {
                  id: toolData.id,
                  name: toolData.name,
                  args: toolData.args,
                  status: toolData.status as string,
                  result: toolData.result,
                },
              );
              return next ?? previousToolActivity;
            });

            // Track segment ordering: group consecutive tool events
            // Guard: only add to segments if not already tracked
            if (toolData.status === "streaming" || toolData.status === "calling") {
              if (!segmentToolIdSet.has(resolvedId)) {
                segmentToolIdSet.add(resolvedId);
                if (lastSegmentType === "tools") {
                  contentSegments[contentSegments.length - 1].toolIds!.push(
                    resolvedId,
                  );
                } else {
                  contentSegments.push({
                    type: "tools",
                    toolIds: [resolvedId],
                  });
                  lastSegmentType = "tools";
                }
              }
            }

            // Capture snapshot values from the mutable streaming closure
            const callSnapshot = {
              contentSegments: snapshotSegments(),
              textFragments: [...textFragments],
              thinkingFragments: [...thinkingFragments],
            };

            setMessages((msgPrev: ClientMessage[]) => {
              const next = applyToolCallToMessages(
                msgPrev,
                resolvedId,
                toolData,
                callSnapshot,
              ) as ClientMessage[];
              console.debug(
                `[ToolCall MCP setMessages] ${toolData.status} ${toolData.name}: previousPixelSize=${msgPrev.length} → next=${next.length}`,
              );
              return next;
            });

            // Auto-refresh tasks panel when any task tool completes (MCP path)
            if (
              toolData.status !== "calling" &&
              toolData.name &&
              toolData.name.includes("_task")
            ) {
              setTasksRefreshKey((k) => k + 1);
            }

            // Auto-refresh memories panel when save_memory completes (MCP path)
            if (
              toolData.status !== "calling" &&
              toolData.name === TOOL_NAMES.SAVE_MEMORY
            ) {
              if (hasAnyMemoryModelSet) {
                setLeftTabBottom("memories");
              }
              setMemoriesRefreshKey((k) => k + 1);
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((result) => setTotalMemoriesCount(result.total || 0))
                .catch(() => {
                  /* Non-critical background count refresh */
                });
            }

            // Increment scheduled task notification badge when agent creates a cron job
            if (
              toolData.status === "done" &&
              toolData.name === TOOL_NAMES.CREATE_CRON_JOB
            ) {
              const currentNotificationCount = parseInt(
                localStorage.getItem(LS_CRON_JOB_NOTIFICATIONS_COUNT) || "0",
                10,
              );
              localStorage.setItem(
                LS_CRON_JOB_NOTIFICATIONS_COUNT,
                String(currentNotificationCount + 1),
              );
              window.dispatchEvent(new CustomEvent(EV_CRON_JOB_SCHEDULED));
            }

            // Auto-refresh workspace tree when FS-mutating tools complete (MCP path)
            if (
              toolData.status !== "calling" &&
              WORKSPACE_FS_TOOLS.has(toolData.name)
            ) {
              setWorkspaceTreeRefreshKey((k) => k + 1);

              // Live-update file viewer (MCP path)
              const mutatedPath =
                toolData.args?.path || toolData.args?.source || null;
              const openFiles = viewerOpenFilesRef.current;
              if (mutatedPath && openFiles.length > 0) {
                // delete_file and move_file both remove the source path
                if (
                  toolData.name === TOOL_NAMES.DELETE_FILE ||
                  toolData.name === TOOL_NAMES.MOVE_FILE
                ) {
                  const deleted = openFiles.find(
                    (file: ViewerOpenFile) => file.path === mutatedPath,
                  );
                  if (deleted) {
                    setViewerOpenFiles((previousViewerOpenFiles) => {
                      const next = previousViewerOpenFiles.filter(
                        (file: ViewerOpenFile) => file.path !== mutatedPath,
                      );
                      setViewerActiveFileId((activeId: string | null) => {
                        if (activeId !== deleted.id) return activeId;
                        const closedTabIndex = previousViewerOpenFiles.findIndex(
                          (file: ViewerOpenFile) => file.id === deleted.id,
                        );
                        const newActive =
                          next[Math.min(closedTabIndex, next.length - 1)];
                        return newActive?.id || null;
                      });
                      return next;
                    });
                  }
                } else if (openFiles.some((file) => file.path === mutatedPath)) {
                  setViewerRefreshKey((k) => k + 1);
                }
              }
            }
          },
          onToolOutput: (data: SSEData) => {
            if (isStale()) return;
            if (data.event === "stdout" || data.event === "stderr") {
              setStreamingOutputs((previousPixelSize: Map<string, string>) => {
                const updated = new Map<string, string>(previousPixelSize);
                const key = data.toolCallId || data.name || "";
                const existing = updated.get(key) || "";
                updated.set(key, existing + (data.data || ""));
                return updated;
              });
            }
          },
          onApprovalRequired: (data: SSEData) => {
            if (isStale()) return;
            const toolCall = data.toolCall;
            if (!toolCall) return;
            setPendingApprovals((previousPendingApprovals) => [
              ...previousPendingApprovals,
              {
                id: toolCall.id || `ap-${Date.now()}`,
                toolName: toolCall.name || "",
                toolArgs: toolCall.args || {},
                tier: data.tier,
                status: "pending",
              },
            ]);
            // Clear processing metadata so the live TTFT badge stops
            // counting — user deliberation time on approval gates
            // should not inflate time-to-first-token.
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (
                last?.role === "assistant" &&
                (last.statusPhase || last._processingStartTime)
              ) {
                updated[updated.length - 1] = {
                  ...last,
                  statusPhase: undefined,
                  _processingStartTime: undefined,
                };
              }
              return updated;
            });
          },
          onUserQuestion: (data: SSEData) => {
            if (isStale()) return;
            setPendingUserQuestion({
              questions: data.questions || [],
              context: data.context || undefined,
            });
            // Clear processing metadata — user deliberation time should
            // not inflate TTFT (same pattern as approval gates).
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (
                last?.role === "assistant" &&
                (last.statusPhase || last._processingStartTime)
              ) {
                updated[updated.length - 1] = {
                  ...last,
                  statusPhase: undefined,
                  _processingStartTime: undefined,
                };
              }
              return updated;
            });
          },
          onPlanProposal: (data: SSEData) => {
            if (isStale()) return;

            // Inject plan as a content segment so it renders in-flow —
            // subsequent tool/text segments will appear after the plan card
            contentSegments.push({ type: "plan" });
            lastSegmentType = "plan";

            // Snapshot segments into the current assistant message.
            // When the plan requires user approval (not auto-approved),
            // clear processing metadata so the live TTFT badge stops
            // counting — user deliberation time is not part of TTFT.
            const isPending = !data.autoApproved;
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  contentSegments: snapshotSegments(),
                  textFragments: [...textFragments],
                  thinkingFragments: [...thinkingFragments],
                  ...(isPending
                    ? {
                        statusPhase: undefined,
                        _processingStartTime: undefined,
                      }
                    : {}),
                };
              }
              return updated;
            });

            setPlanProposal({
              plan: data.plan || "",
              steps: data.steps || [],
              status: isPending ? "pending" : "approved",
            });
          },
          onStatus: (statusData: SSEData) => {
            if (isStale()) return;
            // statusData is now the full SSE data object { type, message, iteration?, maxIterations? }
            if (statusData?.message === STATUS_MESSAGES.ITERATION_PROGRESS) {
              setAgenticProgress({
                iteration: statusData.iteration ?? 0,
                maxIterations: statusData.maxIterations ?? 0,
              });
            } else if (statusData?.message === STATUS_MESSAGES.SKILLS_INJECTED) {
              setInjectedSkills(statusData.skills || []);
            } else if (statusData?.message === STATUS_MESSAGES.COMPACTION_STARTED) {
              setMessages((previousMessages) => {
                const updatedMessages = [...previousMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                if (lastMessage?.role === "assistant") {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    status: "Compacting conversation...",
                    statusPhase: "prefilling",
                  };
                } else {
                  updatedMessages.push({
                    role: "assistant",
                    content: "",
                    status: "Compacting conversation...",
                    statusPhase: "prefilling",
                  });
                }
                return updatedMessages;
              });
            } else if (
              statusData?.message === STATUS_MESSAGES.COMPACTION_COMPLETE ||
              statusData?.message === STATUS_MESSAGES.COMPACTION_FAILED
            ) {
              setMessages((previousMessages) => {
                const updatedMessages = [...previousMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                if (
                  lastMessage?.role === "assistant" &&
                  lastMessage.statusPhase === "prefilling"
                ) {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    status: undefined,
                    statusPhase: undefined,
                  };
                }
                return updatedMessages;
              });
            } else if (statusData?.message === STATUS_MESSAGES.CONTEXT_TRUNCATED) {
              setContextTruncated({
                strategy: statusData.strategy || "",
                estimatedTokens: statusData.estimatedTokens,
              });
            } else if (statusData?.message === STATUS_MESSAGES.TOOL_SET_CHANGED) {
              const dynamicTools = statusData.dynamicTools as string[] | undefined;
              if (Array.isArray(dynamicTools) && dynamicTools.length > 0) {
                enableSpecificTools(dynamicTools);
              }
            } else if (statusData?.message === STATUS_MESSAGES.TASKS_UPDATED) {
              // Ephemeral tab switch — show tasks panel then revert after 5s
              switchTabTemporarily("tasks");
              setTasksRefreshKey((k) => k + 1);
              markTabNew("tasks");
            } else if (statusData?.message === STATUS_MESSAGES.SUB_AGENTS_UPDATED) {
              // Refresh sub-agents data without switching the active tab
              setTasksRefreshKey((k) => k + 1);
              markTabNew("subAgents");
            } else if (statusData?.message === STATUS_MESSAGES.MEMORIES_UPDATED) {
              if (hasAnyMemoryModelSet) {
                // Ephemeral tab switch — show memories panel then revert after 5s
                switchTabTemporarily("memories");
                markTabNew("memories");
              }
              setMemoriesRefreshKey((k) => k + 1);
              // Re-fetch count for the tab badge (MemoriesPanel may not be mounted yet)
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((result) => setTotalMemoriesCount(result.total || 0))
                .catch(() => {});
            } else if (statusData?.message === STATUS_MESSAGES.GENERATION_STARTED) {
              // Server-computed TTFT — accumulate per-iteration samples for averaging
              setMessages((previousMessages) => {
                const updated = [...previousMessages];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    _ttftSamples: [
                      ...(last._ttftSamples || []),
                      statusData.timeToFirstToken ?? 0,
                    ],
                  };
                }
                return updated;
              });
            } else if (statusData?.message === STATUS_MESSAGES.GENERATION_PROGRESS) {
              // Backend-computed metrics from ConversationGenerationTracker —
              // authoritative aggregate across orchestrator, sub-agents,
              // and tool sub-requests.
              setMessages((previousMessages) => {
                const updated = [...previousMessages];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    _liveGenProgress: {
                      tokPerSec: statusData.tokPerSec,
                      activeRequests: statusData.activeRequests,
                      outputTokens: statusData.outputTokens,
                      inputTokens: statusData.inputTokens,
                      totalTokens: statusData.totalTokens,
                      avgTtft: statusData.avgTtft,
                      timestamp: performance.now(),
                    },
                  };
                }
                return updated;
              });
            } else if (statusData?.phase) {
              // LM Studio lifecycle status (loading, processing, generating)
              setMessages((previousMessages) => {
                const updated = [...previousMessages];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    status: statusData.message,
                    statusPhase: statusData.phase,
                    // Structured progress (0-1) from LM Studio prompt prefilling
                    _statusProgress:
                      statusData.progress != null
                        ? statusData.progress
                        : last._statusProgress,
                    // Track when prefilling phase started for live TTFT estimation
                    _processingStartTime:
                      statusData.phase === "prefilling" &&
                      !last._processingStartTime
                        ? performance.now()
                        : last._processingStartTime,
                  };
                } else {
                  // Phase event arrived before any content chunk — create a
                  // placeholder assistant message to carry the phase metadata.
                  // onChunk/onThinking will merge into this message when they fire.
                  updated.push({
                    role: "assistant",
                    content: "",
                    status: statusData.message,
                    statusPhase: statusData.phase,
                    _statusProgress:
                      statusData.progress != null
                        ? statusData.progress
                        : undefined,
                    _processingStartTime:
                      statusData.phase === "prefilling"
                        ? performance.now()
                        : undefined,
                  });
                }
                return updated;
              });
            }
          },
          // -- Sub-agent agent live events -----------------------------
          onSubAgentToolExecution: (data: SSEData) => {
            if (isStale()) return;
            const subAgentId = data.subAgentId;
            if (!subAgentId) return;
            setSubAgentToolActivity((previousSubAgentToolActivity) => {
              const raw = previousSubAgentToolActivity[subAgentId];
              const entry = {
                toolCount: 0,
                currentTool: null as string | null,
                iteration: 0,
                toolNames: {} as Record<string, number>,
                toolCalls: [] as ToolCallEvent[],
                ...raw,
              };
              const toolData = data.tool;
              if (!toolData) return previousSubAgentToolActivity;

              let updatedCalls = [...entry.toolCalls];
              if (data.status === "streaming" || data.status === "calling") {
                const newCall: ToolCallEvent = {
                  id: toolData.id || `wtc-${Date.now()}`,
                  name: toolData.name || "unknown",
                  args: toolData.args || {},
                  status: data.status as string,
                };
                const existingIndex = updatedCalls.findIndex(
                  (toolCall) => toolCall.id === newCall.id,
                );
                if (existingIndex >= 0) {
                  updatedCalls = updatedCalls.map((toolCall) =>
                    toolCall.id === newCall.id
                      ? {
                          ...toolCall,
                          status: data.status as string,
                          ...(toolData.args &&
                          Object.keys(toolData.args).length > 0
                            ? { args: toolData.args }
                            : {}),
                        }
                      : toolCall,
                  );
                  return {
                    ...previousSubAgentToolActivity,
                    [subAgentId]: {
                      ...entry,
                      currentTool: toolData.name || entry.currentTool,
                      toolCalls: updatedCalls,
                      phase: undefined,
                    },
                  };
                }
                updatedCalls.push(newCall);

                const toolName = toolData.name || "unknown";
                const updatedToolNames: Record<string, number> = {
                  ...entry.toolNames,
                  [toolName]: (entry.toolNames[toolName] || 0) + 1,
                };
                return {
                  ...previousSubAgentToolActivity,
                  [subAgentId]: {
                    ...entry,
                    currentTool: toolName,
                    toolCount: entry.toolCount + 1,
                    toolNames: updatedToolNames,
                    toolCalls: updatedCalls,
                    phase: undefined, // Clear phase — tool is now active
                  },
                };
              } else if (data.status === "done" || data.status === "error") {
                updatedCalls = updatedCalls.map((toolCall) => {
                  if (
                    toolCall.id === toolData.id ||
                    (toolCall.name === toolData.name &&
                      (toolCall.status === "calling" ||
                        toolCall.status === "streaming"))
                  ) {
                    return {
                      ...toolCall,
                      status: data.status === "done" ? "done" : "error",
                      result: toolData.result,
                      durationMs: toolData.durationMs,
                    };
                  }
                  return toolCall;
                });
                return {
                  ...previousSubAgentToolActivity,
                  [subAgentId]: {
                    ...entry,
                    currentTool: null,
                    toolCalls: updatedCalls,
                    phase: undefined,
                  },
                };
              }
              return previousSubAgentToolActivity;
            });
          },
          onSubAgentToolOutput: (data: SSEData) => {
            if (isStale()) return;
            const subAgentId = data.subAgentId;
            const key = data.toolCallId || data.name || "";
            if (!subAgentId || !key) return;
            setStreamingOutputs((previousStreamingOutputs) => {
              const updated = new Map<string, string>(previousStreamingOutputs);
              const existing = updated.get(key) || "";
              updated.set(key, existing + (data.data || ""));
              return updated;
            });
          },
          onSubAgentStatus: (data: SSEData) => {
            if (isStale()) return;
            const subAgentId = data.subAgentId;
            if (!subAgentId) return;
            if (data.message === STATUS_MESSAGES.SPAWNED) {
              // Early mapping: store subAgentId indexed by description
              // so SpawnAgentRenderer can look up activity before tool result arrives
              setSubAgentToolActivity((previousSubAgentToolActivity) => ({
                ...previousSubAgentToolActivity,
                [subAgentId]: {
                  ...(previousSubAgentToolActivity[subAgentId] || {
                    toolCount: 0,
                    currentTool: null,
                    iteration: 0,
                    toolNames: {},
                  }),
                  description: data.description,
                  phase: "spawned",
                  conversationId: (data.conversationId as string) || undefined,
                },
              }));

              // Optimistic sidebar injection: add placeholder conversation
              // entry so sub-agent appears in the HistoryList immediately
              // rather than waiting for loadConversations() post-completion.
              const subAgentConversationId = data.conversationId as string | undefined;
              const subAgentParentConversationId = data.parentConversationId as string | undefined;
              if (subAgentConversationId) {
                const spawnTimestamp = new Date().toISOString();
                setConversations((previousConversations) => {
                  // Guard: don't duplicate if already in the list (e.g. continuation spawn)
                  if (previousConversations.some(
                    (existingConversation) => (existingConversation.id || String(existingConversation._id)) === subAgentConversationId,
                  )) {
                    return previousConversations;
                  }
                  return [
                    {
                      _id: subAgentConversationId,
                      id: subAgentConversationId,
                      project: agentProject || "",
                      title: data.description || "Sub-agent",
                      messages: [],
                      updatedAt: spawnTimestamp,
                      createdAt: spawnTimestamp,
                      parentConversationId: subAgentParentConversationId || null,
                      isGenerating: true,
                      ...(data.model ? { modelNames: [data.model as string] } : {}),
                      ...(data.provider ? { providers: [data.provider as string] } : {}),
                    } as AgentConversation,
                    ...previousConversations,
                  ];
                });
                // Mark this sub-agent conversation as generating so the
                // sidebar shows the pulsing generating-dot indicator.
                setGeneratingConversationIds(
                  (previousGeneratingConversationIds) =>
                    new Set(previousGeneratingConversationIds).add(
                      subAgentConversationId,
                    ),
                );
              }
            } else if (data.message === STATUS_MESSAGES.ITERATION_PROGRESS) {
              setSubAgentToolActivity((previousSubAgentToolActivity) => ({
                ...previousSubAgentToolActivity,
                [subAgentId]: {
                  ...(previousSubAgentToolActivity[subAgentId] || {
                    toolCount: 0,
                    currentTool: null,
                  }),
                  iteration: data.iteration,
                  maxIterations: data.maxIterations,
                },
              }));
            } else if (data.message === STATUS_MESSAGES.PHASE) {
              // Sub-agent LLM phase updates (generating, thinking, prefilling, loading)
              setSubAgentToolActivity((previousSubAgentToolActivity) => ({
                ...previousSubAgentToolActivity,
                [subAgentId]: {
                  ...(previousSubAgentToolActivity[subAgentId] || {
                    toolCount: 0,
                    currentTool: null,
                    iteration: 0,
                  }),
                  phase: data.phase,
                  phaseLabel: data.label || undefined,
                  phaseProgress:
                    data.progress != null
                      ? data.progress
                      : (previousSubAgentToolActivity[subAgentId]?.phaseProgress ??
                        undefined),
                },
              }));
            } else if (data.message === STATUS_MESSAGES.GENERATION_STARTED) {
              // Sub-agent server-computed TTFT — push into the shared samples array
              setMessages((previousMessages) => {
                const updated = [...previousMessages];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    _ttftSamples: [
                      ...(last._ttftSamples || []),
                      data.timeToFirstToken ?? 0,
                    ],
                  };
                }
                return updated;
              });
            } else if (data.message === STATUS_MESSAGES.GENERATION_PROGRESS) {
              setMessages((previousMessages) => {
                const updated = [...previousMessages];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  const wp = last._subAgentGenerationProgress || {};
                  const existing = wp[subAgentId] || {};
                  updated[updated.length - 1] = {
                    ...last,
                    _subAgentGenerationProgress: {
                      ...wp,
                      [subAgentId]: {
                        ...existing,
                        // Burst-scoped values for tok/s computation — only update when present
                        ...(data.outputTokens != null && {
                          outputTokens: data.outputTokens,
                        }),
                        ...(data.firstChunkTime != null && {
                          firstChunkTime: data.firstChunkTime,
                        }),
                        ...(data.lastChunkTime != null && {
                          lastChunkTime: data.lastChunkTime,
                        }),
                        // Cumulative total for token badge count
                        totalOutputTokens:
                          data.totalOutputTokens ||
                          data.outputTokens ||
                          existing.totalOutputTokens,
                        // Per-sub-agent tok/s from burst counters
                        tokPerSec: data.tokPerSec ?? existing.tokPerSec,
                        ...(data.inputTokens != null && {
                          inputTokens: data.inputTokens,
                        }),
                        ...(data.totalTokens != null && {
                          totalTokens: data.totalTokens,
                        }),
                        ...(data.avgTtft != null && { avgTtft: data.avgTtft }),
                      },
                    },
                  };
                }
                return updated;
              });
              // Also store on subAgentToolActivity so TeamCreateRenderer can
              // display live per-sub-agent metrics on each sub-agent's header
              setSubAgentToolActivity((previousSubAgentToolActivity) => {
                const existing = previousSubAgentToolActivity[subAgentId] || {
                  toolCount: 0,
                  currentTool: null,
                  iteration: 0,
                  toolNames: {},
                };
                return {
                  ...previousSubAgentToolActivity,
                  [subAgentId]: {
                    ...existing,
                    // Burst-scoped values — only update when present to prevent undefined overwrites
                    ...(data.outputTokens != null && {
                      outputTokens: data.outputTokens,
                    }),
                    ...(data.firstChunkTime != null && {
                      firstChunkTime: data.firstChunkTime,
                    }),
                    ...(data.lastChunkTime != null && {
                      lastChunkTime: data.lastChunkTime,
                    }),
                    totalOutputTokens:
                      data.totalOutputTokens ||
                      data.outputTokens ||
                      existing.totalOutputTokens,
                    // Per-sub-agent tok/s from burst counters
                    tokPerSec: data.tokPerSec ?? existing.tokPerSec,
                    ...(data.inputTokens != null && {
                      inputTokens: data.inputTokens,
                    }),
                    ...(data.totalTokens != null && {
                      totalTokens: data.totalTokens,
                    }),
                    ...(data.avgTtft != null && { avgTtft: data.avgTtft }),
                  },
                };
              });
            } else if (data.message === STATUS_MESSAGES.COMPLETE) {
              // Sub-agent finished — clear phase so StatusBar stops showing "Generating..."
              setSubAgentToolActivity((previousSubAgentToolActivity) => {
                // Remove the sub-agent's conversation from the generating set
                // so the sidebar generating-dot stops pulsing.
                const completedConversationId =
                  previousSubAgentToolActivity[subAgentId]?.conversationId;
                if (completedConversationId) {
                  setGeneratingConversationIds(
                    (previousGeneratingConversationIds) => {
                      const next = new Set(previousGeneratingConversationIds);
                      next.delete(completedConversationId);
                      return next;
                    },
                  );
                }
                return {
                  ...previousSubAgentToolActivity,
                  [subAgentId]: {
                    ...(previousSubAgentToolActivity[subAgentId] || {}),
                    phase: "complete",
                    currentTool: null,
                    durationMs: data.durationMs,
                    toolCount:
                      data.toolCount ?? previousSubAgentToolActivity[subAgentId]?.toolCount,
                  },
                };
              });
              // Accumulate sub-agent usage into the streaming assistant message
              // so stats badges update in real-time per sub-agent completion
              if (data.usage) {
                setMessages((previousMessages) => {
                  const updated = [...previousMessages];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    const wt = last._subAgentTokens || {
                      input: 0,
                      output: 0,
                      requests: 0,
                    };
                    // Remove completed sub-agent from live progress so stale tok/s doesn't linger
                    const wp = { ...(last._subAgentGenerationProgress || {}) };
                    delete wp[subAgentId];
                    updated[updated.length - 1] = {
                      ...last,
                      _subAgentTokens: {
                        input: (wt.input || 0) + (data.usage?.inputTokens || 0),
                        output:
                          (wt.output || 0) + (data.usage?.outputTokens || 0),
                        requests:
                          (wt.requests || 0) + (data.usage?.requests || 1),
                      },
                      _subAgentGenerationProgress:
                        Object.keys(wp).length > 0 ? wp : undefined,
                    };
                  }
                  return updated;
                });
              }
            } else if (data.message === STATUS_MESSAGES.FAILED) {
              // Sub-agent errored — mark as failed
              setSubAgentToolActivity((previousSubAgentToolActivity) => ({
                ...previousSubAgentToolActivity,
                [subAgentId]: {
                  ...(previousSubAgentToolActivity[subAgentId] || {}),
                  phase: "failed",
                  currentTool: null,
                  error: data.error,
                },
              }));
            }
          },
          onUsageUpdate: (data: SSEData) => {
            if (isStale()) return;
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (last?.role !== "assistant") return previousMessages;

              // Background operations (memory extraction, consolidation, embeddings,
              // compaction) emit incremental usage_update events. Accumulate them
              // separately so the token badge grows smoothly instead of jumping
              // when fetchConversationStats discovers them all at once.
              const op = (data.operation as string) || "";
              const isBackground =
                op.startsWith("memory:") ||
                op.startsWith("embed:") ||
                op.startsWith("compact:");
              if (isBackground) {
                const backgroundUsage = last._backgroundUsage || {
                  inputTokens: 0,
                  outputTokens: 0,
                  cost: 0,
                };
                updated[updated.length - 1] = {
                  ...last,
                  _backgroundUsage: {
                    inputTokens:
                      (backgroundUsage.inputTokens || 0) +
                      (data.usage?.inputTokens || 0),
                    outputTokens:
                      (backgroundUsage.outputTokens || 0) +
                      (data.usage?.outputTokens || 0),
                    requests:
                      (backgroundUsage.requests || 0) +
                      (data.usage?.requests || 1),
                    cost:
                      (backgroundUsage.cost || 0) + (data.estimatedCost || 0),
                  },
                };
              } else if (!last.usage) {
                // Authoritative per-iteration usage from the backend —
                // stored on the message so getConversationTokenStats can use it
                // as a middle priority between streaming estimate and final done.
                updated[updated.length - 1] = {
                  ...last,
                  _intermediateUsage: data.usage,
                  _intermediateEstimatedCost: data.estimatedCost ?? null,
                };
              }
              return updated;
            });
          },
          onDone: (data: SSEData) => {
            console.debug(`[onDone] stream finished, isStale=${isStale()}`);
            if (!isStale()) {
              setMessages((previousMessages) => {
                const updated = [...previousMessages];
                const last = updated[updated.length - 1];
                console.debug(
                  `[onDone setMessages] previousMessages=${previousMessages.length}, last.role=${last?.role}`,
                );
                if (last?.role === "assistant") {
                  const audioFromDone = data.audioRef
                    ? (() => {
                        const existing = Array.isArray(last.audio)
                          ? last.audio
                          : last.audio
                            ? [last.audio]
                            : [];
                        return existing.includes(data.audioRef as string)
                          ? existing.length > 0
                            ? existing
                            : undefined
                          : [...existing, data.audioRef as string];
                      })()
                    : last.audio;
                  updated[updated.length - 1] = {
                    ...last,
                    provider: settings.provider,
                    model: settings.model,
                    usage: data.usage,
                    totalTime: data.totalTime,
                    tokensPerSec: data.tokensPerSec,
                    estimatedCost: data.estimatedCost,
                    timeToGeneration: data.timeToGeneration,
                    completedAt: new Date().toISOString(),
                    status: undefined,
                    statusPhase: undefined,
                    ...(audioFromDone ? { audio: audioFromDone } : {}),
                  };
                }
                return updated;
              });
              setCurrentTurnStart(null);
              setPendingUserQuestion(null);
              fetchConversationStats(conversationId);
            }
            // ConversationSummarizer runs async after SSE stream closes —
            // poll every 2s for up to 20s until new memories are detected
            (async () => {
              const baselineCount = await PrismService.getAgentMemories(
                agentProject,
                1,
                agentId,
              )
                .then((result) => result.total || 0)
                .catch(() => 0);
              let pollAttempts = 0;
              const pollInterval = setInterval(async () => {
                pollAttempts++;
                try {
                  const { total } = await PrismService.getAgentMemories(
                    agentProject,
                    1,
                    agentId,
                  );
                  if (total > baselineCount) {
                    clearInterval(pollInterval);
                    setMemoriesRefreshKey((k) => k + 1);
                  }
                } catch {
                  /* Non-critical background poll */
                }
                if (pollAttempts >= 10) clearInterval(pollInterval);
              }, 2000);
            })();
            resolve();
          },
          onError: (error) => {
            console.error(`[onError] stream error:`, error);
            reject(error);
          },
        });
      });

      return [];
    },
    [
      settings.provider,
      settings.model,
      settings.maxTokens,
      settings.temperature,
      settings.thinkingEnabled,
      settings.reasoningEffort,
      settings.thinkingBudget,
      settings.systemPrompt,
      settings.functionCallingEnabled,
      settings.webSearchEnabled,
      settings.codeExecutionEnabled,
      settings.urlContextEnabled,
      settings.agents?.harness,
      settings.agents?.topology,
      settings.agents?.thoughtStructure,
      settings.agents?.workspaceEnabled,
      settings.agents?.locale,
      criticGateEnabled,
      conversationId,
      traceId,
      disabledTools,
      autoApprove,
      planFirst,
      maxIterations,
      maxSubAgentIterations,
      maxRecursionDepth,
      agentId,
      isNoAgent,
      agentProject,
      fetchConversationStats,
      markTabNew,
      switchTabTemporarily,
      rules,
    ],
  );

  // -- Send handler ---------------------------------------------
  // Read inputValue from ref at send-time to avoid re-creating
  // handleSend on every keystroke (the main cause of input lag).
  const pendingImagesRef = useRef<string[]>(pendingImages);
  pendingImagesRef.current = pendingImages;
  const pendingFilesRef = useRef<typeof pendingFiles>(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  const messagesRef = useRef<ClientMessage[]>(messages);
  messagesRef.current = messages;
  const titleRef = useRef<string>(title);
  titleRef.current = title;

  const handleSend = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement> | null,
      fetchOptions: {
        isQueueing?: boolean;
        overridePayload?: { text: string; images: string[] } | null;
      } = {},
    ) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();

      const { isQueueing = false, overridePayload = null } = fetchOptions;

      if (isGenerating && !isQueueing && !overridePayload) {
        handleStop();
        return;
      }

      const text = overridePayload
        ? overridePayload.text
        : inputValueRef.current.trim();
      const currentImages = overridePayload
        ? overridePayload.images
        : [...pendingImagesRef.current];
      const currentFiles = overridePayload ? [] : [...pendingFilesRef.current];

      if (!text && currentImages.length === 0 && currentFiles.length === 0) return;

      if (isQueueing) {
        setQueuedNextTurn({ text, images: currentImages });
        setTextareaValue("");
        setPendingImages([]);
        setPendingFiles([]);
        return;
      }

      if (!overridePayload) {
        setTextareaValue("");
        setPendingImages([]);
        setPendingFiles([]);
      }

      setIsGenerating(true);
      SoundService.playGenerationStart();
      isClientDrivenGenerationRef.current = true;
      // Re-engage sticky scroll when the user sends a message
      isUserNearBottomRef.current = true;
      // Track this conversation as generating (for history indicator even after switching away)
      const genId = conversationIdRef.current;
      console.debug(
        `[handleSend] starting generation, conversationId=${genId}, currentMessages=${messagesRef.current.length}`,
      );
      setGeneratingConversationIds((previousGeneratingConversationIds) =>
        new Set(previousGeneratingConversationIds).add(genId),
      );
      setToolActivity([]);
      setSubAgentToolActivity({});
      setStreamingOutputs(new Map());
      setPendingApprovals([]);
      setPendingUserQuestion(null);
      setPlanProposal(null);
      setAgenticProgress(null);
      setInjectedSkills([]);
      setContextTruncated(null);

      const currentMessages = messagesRef.current;
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
        window.dispatchEvent(
          new CustomEvent(EV_CONVERSATION_CHANGE, {
            detail: { conversationId: conversationId },
          }),
        );
        setConversations((previousConversations) => [
          {
            id: conversationId,
            title: resolvedTitle,
            updatedAt: now,
            createdAt: now,
          } as AgentConversation,
          ...previousConversations,
        ]);
      }

      setCurrentTurnStart(Date.now());
      setIsBackendStatsStale(true);
      // Prepend active rules to user message (Claude Code pattern)
      // Rules are extracted from inline badges in the contentEditable DOM.
      let finalMessageContent = text;
      const inlineActiveRuleNames = textareaRef.current
        ? extractSlashCommandNames(textareaRef.current)
        : new Set<string>();
      if (inlineActiveRuleNames.size > 0) {
        const enabledRules = rules.filter(
          (rule) => rule.enabled && inlineActiveRuleNames.has(rule.name),
        );
        if (enabledRules.length > 0) {
          const rulesBlock = enabledRules
            .map((rule) => `## /${rule.name}\n${rule.content}`)
            .join("\n\n");
          finalMessageContent = `[Active Rules]\n${rulesBlock}\n\n[User Message]\n${text}`;
        }
      }

      // Upload non-image files to MinIO and collect their URLs
      let uploadedFileUrls: { url: string; name: string; mimeType: string; modality: string }[] = [];
      if (currentFiles.length > 0) {
        try {
          const uploadResults = await Promise.all(
            currentFiles.map(async (pendingFile) => {
              const result = await PrismService.uploadFile(pendingFile.dataUrl);
              return {
                url: result.url,
                name: pendingFile.name,
                mimeType: pendingFile.mimeType,
                modality: pendingFile.modality,
              };
            }),
          );
          uploadedFileUrls = uploadResults;
        } catch (uploadError) {
          console.error("[handleSend] File upload to MinIO failed:", uploadError);
        }
      }

      const userMessage = {
        role: "user" as const,
        content: finalMessageContent,
        rawContent: text,
        timestamp: new Date().toISOString(),
        ...(currentImages.length > 0 ? { images: currentImages } : {}),
        ...(uploadedFileUrls.length > 0 ? { files: uploadedFileUrls } : {}),
      };
      const updatedMessages = [...currentMessages, userMessage];
      // Insert placeholder assistant message so the aiNode
      // (with blinking cursor) appears immediately
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          provider: settings.provider,
          model: settings.model,
        },
      ]);

      try {
        console.debug(
          `[handleSend] starting runOrchestrationLoop, updatedMessages=${updatedMessages.length}`,
        );
        await runOrchestrationLoop(updatedMessages, resolvedTitle);
        // Messages are already updated by the streaming callbacks — just reload history
        console.debug(
          `[handleSend] runOrchestrationLoop resolved, proceeding to post-stream refresh`,
        );
        loadConversations();

        // Refresh conversation messages from database to sync the user's message
        // with the server-side injected system context, enabling Clean/Raw View toggles.
        //
        // RACE GUARD: The `done` SSE event fires BEFORE appendMessages completes
        // on the backend. An immediate fetch can return stale/incomplete data
        // (e.g. 1.22 KB instead of 44 KB). We compare the fetched display count
        // against the current streaming count; if fewer, retry after a delay.
        const attemptPostStreamRefresh = async (attempt = 1) => {
          try {
            const full = isNoAgent
              ? await PrismService.getConversation(conversationId)
              : await PrismService.getAgentConversation(
                  conversationId,
                  agentProject!,
                );
            console.debug(
              `[PostStream refresh] attempt=${attempt} full?.messages?.length=${full?.messages?.length},`,
              `conversationMatch=${conversationIdRef.current === genId}`,
            );
            if (full && full.messages && conversationIdRef.current === genId) {
              const displayMessages = prepareDisplayMessages(full.messages);
              const currentCount = messagesRef.current.length;
              console.debug(
                `[PostStream setMessages] attempt=${attempt} raw=${full.messages.length} → display=${displayMessages.length}, currentStreaming=${currentCount}`,
                displayMessages.length === 0
                  ? "⚠️ EMPTY — this clears the chat!"
                  : "",
              );
              // Guard 1: don't replace streaming messages with stale/incomplete DB data
              if (displayMessages.length < currentCount) {
                if (attempt < 3) {
                  console.debug(
                    `[PostStream] ⚠️ Fetched fewer messages (${displayMessages.length}) than streaming (${currentCount}), retrying in 2s (attempt ${attempt})`,
                  );
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  return attemptPostStreamRefresh(attempt + 1);
                } else {
                  console.warn(
                    `[PostStream] ⚠️ Database is still missing the current turn's messages after ${attempt} attempts. Skipping overwrite to prevent disappearing messages.`,
                  );
                  return;
                }
              }
              // Guard 2: content-aware — verify that the last streaming user
              // message exists in the DB data. This catches the edge case where
              // DB has the right count but wrong content (e.g. user message was
              // dropped and replaced with an extra assistant message).
              const lastStreamingUserMessage = [...messagesRef.current]
                .reverse()
                .find((message: ClientMessage) => message.role === "user");
              if (lastStreamingUserMessage?.content) {
                const databaseUserContents = displayMessages
                  .filter((message: ClientMessage) => message.role === "user")
                  .map((message: ClientMessage) =>
                    message.content?.toString().trim(),
                  );
                const streamingUserContent = lastStreamingUserMessage.content
                  .toString()
                  .trim();
                if (
                  streamingUserContent &&
                  !databaseUserContents.includes(streamingUserContent)
                ) {
                  if (attempt < 3) {
                    console.debug(
                      `[PostStream] ⚠️ Last user message "${streamingUserContent.slice(0, 50)}…" not found in DB data, retrying in 2s (attempt ${attempt})`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    return attemptPostStreamRefresh(attempt + 1);
                  } else {
                    console.warn(
                      `[PostStream] ⚠️ Database is missing the latest user message after ${attempt} attempts. Skipping overwrite to preserve streaming state.`,
                    );
                    return;
                  }
                }
              }
              setMessages(displayMessages);
              if (full.systemPrompt != null) {
                setSettings((previousSettings) => ({
                  ...previousSettings,
                  systemPrompt: full.systemPrompt,
                }));
              }
            }
          } catch (error) {
            console.error(
              "Failed to refresh conversation messages after done:",
              error,
            );
          }
        };
        await attemptPostStreamRefresh();
      } catch (error: unknown) {
        console.error(`[handleSend] orchestration error:`, error);

        // Detect network/fetch errors caused by mobile screen lock, tab
        // suspension, or TCP connection drops. These are NOT real failures —
        // the backend agentic loop continues processing in the background.
        // Instead of showing "⚠️ Error", enter recovery polling mode to
        // re-fetch the conversation when the backend finishes.
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNetworkDisconnection =
          error instanceof TypeError ||
          errorMessage.includes("fetch") ||
          errorMessage.includes("network") ||
          errorMessage.includes("aborted") ||
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("ERR_NETWORK");

        if (isNetworkDisconnection && !isNoAgent && genId) {
          console.info(
            `[handleSend] Network disconnection detected — entering recovery polling for ${genId}`,
          );

          // Remove the in-flight error-like assistant message if present
          setMessages((previousMessages) => {
            const lastMessage = previousMessages[previousMessages.length - 1];
            if (lastMessage?.role === "assistant" && !lastMessage.content && !lastMessage.completedAt) {
              return previousMessages.slice(0, -1);
            }
            return previousMessages;
          });

          // Poll the backend for conversation state until the agent finishes
          const RECOVERY_POLL_INTERVAL_MILLISECONDS = 3_000;
          const RECOVERY_POLL_MAX_DURATION_MILLISECONDS = 5 * 60 * 1_000;
          const recoveryStartTimestamp = Date.now();

          const recoveryPoll = async () => {
            while (
              Date.now() - recoveryStartTimestamp < RECOVERY_POLL_MAX_DURATION_MILLISECONDS &&
              conversationIdRef.current === genId
            ) {
              try {
                const recoveredConversation = await PrismService.getAgentConversation(
                  genId,
                  agentProject!,
                );

                if (
                  recoveredConversation &&
                  recoveredConversation.messages &&
                  conversationIdRef.current === genId
                ) {
                  const displayMessages = prepareDisplayMessages(
                    recoveredConversation.messages,
                  );
                  setMessages(displayMessages);

                  // Check if generation completed (last message is assistant with content)
                  const lastRecoveredMessage =
                    recoveredConversation.messages[recoveredConversation.messages.length - 1];
                  const isGenerationComplete =
                    lastRecoveredMessage?.role === "assistant" &&
                    lastRecoveredMessage.content;

                  if (isGenerationComplete) {
                    console.info(
                      `[handleSend] Recovery polling: generation completed for ${genId}`,
                    );
                    return;
                  }
                }
              } catch {
                // Non-critical — keep polling
              }

              await new Promise((resolve) =>
                setTimeout(resolve, RECOVERY_POLL_INTERVAL_MILLISECONDS),
              );
            }
          };

          // Fire-and-forget — the finally block handles UI cleanup
          await recoveryPoll();
        } else {
          setMessages((previousMessages) => [
            ...previousMessages,
            {
              role: "assistant",
              content: `⚠️ Error: ${errorMessage}`,
              isError: true,
            },
          ]);
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
        // Only update local UI state if this conversation is still displayed
        if (conversationIdRef.current === genId) {
          setIsGenerating(false);
          SoundService.playGenerationEnd();
          isClientDrivenGenerationRef.current = false;
          abortRef.current = null;
          setCurrentTurnStart(null);
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
    [
      handleStop,
      isGenerating,
      isNoAgent,
      setTextareaValue,
      runOrchestrationLoop,
      loadConversations,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // -- Mention autocomplete keyboard nav --
      if (mentionOpen && mentionResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) => {
            const next = Math.min(i + 1, mentionResults.length - 1);
            // Scroll selected item into view
            (mentionListRef.current as HTMLElement)?.children[
              next
            ]?.scrollIntoView({
              block: "nearest",
            });
            return next;
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => {
            const next = Math.max(i - 1, 0);
            (mentionListRef.current as HTMLElement)?.children[
              next
            ]?.scrollIntoView({
              block: "nearest",
            });
            return next;
          });
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          applyMention(mentionResults[mentionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionOpen(false);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isGenerating) {
          handleSend(null, { isQueueing: true });
        } else {
          handleSend();
        }
      } else if (e.key === "Enter" && e.shiftKey) {
        // Shift+Enter: insert a <br> for newline in contentEditable
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement("br");
          range.insertNode(br);
          // Move cursor after the <br>
          const newRange = document.createRange();
          newRange.setStartAfter(br);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
    },
    [
      handleSend,
      isGenerating,
      mentionOpen,
      mentionResults,
      mentionIndex,
      applyMention,
    ],
  );

  // Auto-send queued message when generation completes
  useEffect(() => {
    if (!isGenerating && queuedNextTurn) {
      const payload = queuedNextTurn;
      setQueuedNextTurn(null);
      setTimeout(() => {
        handleSend(null, { overridePayload: payload });
      }, 50);
    }
  }, [isGenerating, queuedNextTurn, handleSend]);

  // -- Conversation management ----------------------------------
  const resetConversationState = useCallback(() => {
    console.debug(`[resetConversationState] clearing all messages and state`);
    setMessages([]);
    setToolActivity([]);
    setSubAgentToolActivity({});
    setStreamingOutputs(new Map());
    setPendingImages([]);
    setPendingApprovals([]);
    setPendingUserQuestion(null);
    setPlanProposal(null);
    setAgenticProgress(null);
    setInjectedSkills([]);
    setContextTruncated(null);
    setIsGenerating(false);
    setConversationId(generateUUID());
    setTraceId(null);
    setActiveId(null);
    setTitle(isNoAgent ? "Agentless Chat" : "Agent");
    setBackendConversationStats(null);
    setIsBackendStatsStale(false);
    setUnavailableWorkspace(null);
    tokenHwmRef.current = { input: 0, output: 0, total: 0 };
    isUserNearBottomRef.current = true;
    textareaRef.current?.focus();

    // New conversations start with all configurable tools disabled;
    // core tools respect coreToolsLocked (locked on = stay enabled).
    resetToAllDisabled();

    setSettings((currentSettings) => {
      let defaultTemperature = 1.0;
      if (config && currentSettings.provider && currentSettings.model) {
        const providerModels =
          config.textToText?.models?.[currentSettings.provider] || [];
        const modelDefinition = providerModels.find(
          (model) => model.name === currentSettings.model,
        );
        if (
          modelDefinition &&
          modelDefinition.defaultTemperature !== undefined
        ) {
          defaultTemperature = modelDefinition.defaultTemperature;
        }
      }

      // Restore the user's persisted workspace toggle preference for new conversations.
      // This reads from localStorage (explicit user action) rather than carrying over
      // whatever state the previous/loaded conversation had.
      const persistedWorkspaceToggle =
        typeof window !== "undefined"
          ? localStorage.getItem(LS_WORKSPACE_TOGGLE_PREFERENCE)
          : null;
      const workspaceEnabledPreference =
        persistedWorkspaceToggle !== null
          ? persistedWorkspaceToggle !== "false"
          : true;

      return {
        ...SETTINGS_DEFAULTS,
        provider: currentSettings.provider,
        model: currentSettings.model,
        agents: {
          ...currentSettings.agents,
          workspaceEnabled: workspaceEnabledPreference,
        },
        temperature: defaultTemperature,
        maxTokens: 64000,
        functionCallingEnabled: !isNoAgent,
        thinkingEnabled: true,
        minP: 0,
        repeatPenalty: 1.0,
        seed: null,
        responseFormat: "",
        serviceTier: !isNoAgent ? "auto" : "",
        parallelToolCalls: true,
        candidateCount: 1,
        responseMimeType: "",
        store: true,
        mediaResolution: "",
        topLogprobs: 0,
        responseLogprobs: false,
        logprobs: 0,
      };
    });

    // Clear conversation from URL
    window.dispatchEvent(
      new CustomEvent(EV_CONVERSATION_CHANGE, {
        detail: { conversationId: null },
      }),
    );
  }, [isNoAgent, config, resetToAllDisabled]);

  const handleNewChat = useCallback(() => {
    // If generating, snapshot the current conversation so user can switch back to it
    if (isGenerating) {
      const currentId = conversationIdRef.current;
      backgroundConversationsRef.current.set(currentId, {
        messages,
        title,
        toolActivity,
        subAgentToolActivity,
        streamingOutputs,
        pendingApprovals,
        pendingUserQuestion,
        planProposal,
        agenticProgress,
        settings: { ...settings },
        backendConversationStats,
        workspaceRoot: currentWorkspace?.path || null,
        disabledTools: [...disabledTools],
      });
      setIsGenerating(false);
    }
    // If already on a blank conversation, just reset directly (no pixelation needed)
    if (messages.length === 0 && !activeId) {
      resetConversationState();
      return;
    }
    // New conversation — instant reset, no pixelation transition needed
    resetConversationState();
  }, [
    isGenerating,
    messages,
    title,
    toolActivity,
    subAgentToolActivity,
    streamingOutputs,
    pendingApprovals,
    pendingUserQuestion,
    planProposal,
    agenticProgress,
    settings,
    backendConversationStats,
    activeId,
    resetConversationState,
    currentWorkspace?.path,
    disabledTools,
  ]);

  /* -- Chat header "New Conversation" glitch effect ------------------ */
  const chatNewBtnRef = useRef<HTMLButtonElement | null>(null);
  const chatRainbowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatGlitchInterval = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const [chatGlitchLabel, setChatGlitchLabel] = useState<string | null>(null);

  const handleNewChatGlitch = useCallback(() => {
    const element = chatNewBtnRef.current;
    if (element) {
      element.classList.remove(chatStyles['chat-header-new-button-element-rainbow']);
      void element.offsetWidth;
      element.classList.add(chatStyles['chat-header-new-button-element-rainbow']);

      setChatGlitchLabel(glitchText());
      if (chatGlitchInterval.current) clearInterval(chatGlitchInterval.current);
      chatGlitchInterval.current = setInterval(() => {
        setChatGlitchLabel(glitchText());
      }, 30);

      if (chatRainbowTimer.current) clearTimeout(chatRainbowTimer.current);
      chatRainbowTimer.current = setTimeout(() => {
        element.classList.remove(chatStyles['chat-header-new-button-element-rainbow']);
        if (chatGlitchInterval.current)
          clearInterval(chatGlitchInterval.current);
        chatGlitchInterval.current = null;
        setChatGlitchLabel(null);
      }, 1000);
    }
    handleNewChat();
  }, [handleNewChat]);

  /** Apply fetched/snapshot conversation data to component state immediately. */
  const applyConversationData = useCallback(
    (
      full: (AgentConversation | Conversation) & {
        workspaceRoot?: string;
        _fromSnapshot?: boolean;
        _snapshot?: ConversationSnapshot;
        isGenerating?: boolean;
        pendingApproval?: {
          isPending?: boolean;
          type?: string;
          toolCalls?: Array<{
            id?: string;
            name?: string;
            args?: Record<string, unknown>;
            _approval?: { tier?: 1 | 2 | 3 };
          }>;
          tools?: string[];
        };
        pendingQuestion?: {
          isPending?: boolean;
          question?: string;
          questions?: unknown[];
          choices?: string[];
        };
      },
    ) => {
      if (!full) return;

      // -- Restore workspace selection from the conversation document --
      // Agent conversations record which workspace they were started with;
      // switch to it so the workspace tree and tool routing match.
      if (full.workspaceRoot) {
        const match = workspaces.find((workspace) => workspace.path === full.workspaceRoot);
        if (match) {
          if (match.path !== currentWorkspace?.path) {
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
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(snap.messages as ClientMessage[]);
        setConversationId(full.id || generateUUID());
        setActiveId(full.id || null);
        window.dispatchEvent(
          new CustomEvent(EV_CONVERSATION_CHANGE, {
            detail: { conversationId: full.id },
          }),
        );
        setTitle(snap.title || "");
        setToolActivity(snap.toolActivity || []);
        setSubAgentToolActivity(snap.subAgentToolActivity || {});
        setStreamingOutputs(snap.streamingOutputs || new Map());
        setPendingApprovals(snap.pendingApprovals || []);
        setPendingUserQuestion(snap.pendingUserQuestion || null);
        setPlanProposal(snap.planProposal || null);
        setAgenticProgress(snap.agenticProgress || null);
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
        setIsGenerating(true);
        // Remove the snapshot — the SSE callbacks will resume updating React state
        // now that conversationIdRef matches again (isStale() → false)
        backgroundConversationsRef.current.delete(full.id || "");
      } else {
        // Normal backend-loaded conversation
        const displayMessages = prepareDisplayMessages(full.messages || []);
        console.debug(
          `[Conversation switch] id=${full.id}, raw=${full.messages?.length || 0} → display=${displayMessages.length}`,
        );
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(displayMessages);
        setConversationId(full.id || generateUUID());
        setTraceId(full.traceId || null);
        setActiveId(full.id ?? null);
        setIsGenerating(!!full.isGenerating);
        // Passive DB load — no active SSE connection for this generation
        isClientDrivenGenerationRef.current = false;

        // Load pending approvals from the enriched conversation response
        const pendingApprovalData = full.pendingApproval;
        if (pendingApprovalData && pendingApprovalData.isPending) {
          if (pendingApprovalData.type === "plan") {
            const lastAssistantMessage = [...(full.messages || [])]
              .reverse()
              .find((message) => message.role === "assistant");
            if (lastAssistantMessage && lastAssistantMessage.content) {
              const planText = lastAssistantMessage.content;
              const planSteps = planText
                .split("\n")
                .filter(
                  (line) =>
                    line.trim().startsWith("-") || /^\d+\./.test(line.trim()),
                );
              setPlanProposal({
                plan: planText,
                steps: planSteps,
                status: "pending",
              });
            }
          } else if (pendingApprovalData.toolCalls) {
            setPendingApprovals(
              pendingApprovalData.toolCalls.map((toolCall) => ({
                id: toolCall.id || `ap-${Date.now()}`,
                toolName: toolCall.name || "",
                toolArgs: toolCall.args || {},
                tier: toolCall._approval?.tier,
                status: "pending",
              })),
            );
          } else if (pendingApprovalData.tools) {
            setPendingApprovals(
              pendingApprovalData.tools.map((toolName: string) => ({
                id: `ap-${Date.now()}`,
                toolName: toolName,
                toolArgs: {},
                status: "pending",
              })),
            );
          }
        } else {
          setPendingApprovals([]);
          setPlanProposal(null);
        }

        // Load pending questions from the enriched conversation response
        const pendingQuestionData = full.pendingQuestion;
        if (pendingQuestionData && pendingQuestionData.isPending) {
          setPendingUserQuestion({
            questions: pendingQuestionData.questions || [],
          });
        } else {
          setPendingUserQuestion(null);
        }

        window.dispatchEvent(
          new CustomEvent(EV_CONVERSATION_CHANGE, {
            detail: { conversationId: full.id },
          }),
        );
        setTitle(full.title || "Agent");
        setToolActivity([]);
        setSubAgentToolActivity({});

        const lastAssistant = [...(full.messages || [])]
          .reverse()
          .find((message) => message.role === "assistant" && message.provider);
        const conversationSettings = full.settings as
          | Partial<PrismSettings>
          | undefined;
        setSettings((previousSettings) => {
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
          const conversationHarness = (conversationSettings as Record<string, unknown>)?.harness as string | undefined;
          const conversationTopology = (conversationSettings as Record<string, unknown>)?.topology as string | undefined;
          const conversationThoughtStructure = (conversationSettings as Record<string, unknown>)?.thoughtStructure as string | undefined;
          const conversationLocale = (conversationSettings as Record<string, unknown>)?.locale as string | undefined;
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
        });

        // Restore sub-agent recursion depth from conversation's persisted settings
        const persistedRecursionDepth = (conversationSettings as Record<string, unknown>)?.maxRecursionDepth;
        if (typeof persistedRecursionDepth === "number" && [0, 1, 2, 3].includes(persistedRecursionDepth)) {
          setMaxRecursionDepth(persistedRecursionDepth);
        }

        setBackendConversationStats(full.stats || null);
        setIsBackendStatsStale(false);
        tokenHwmRef.current = { input: 0, output: 0, total: 0 };

        // Restore tool toggle state from the conversation's persisted toolConfig.
        // Legacy conversations without toolConfig default to all tools disabled.
        const conversationToolConfig = (conversationSettings as Record<string, unknown>)?.toolConfig as
          | { disabledTools?: string[] }
          | undefined;
        if (conversationToolConfig && conversationToolConfig.disabledTools !== undefined) {
          restoreDisabledTools(conversationToolConfig.disabledTools);
        } else {
          resetToAllDisabled();
        }
      }
    },
    [workspaces, currentWorkspace?.path, setCurrentWorkspace, restoreDisabledTools, resetToAllDisabled],
  );

  const handleSelectConversation = useCallback(
    async (conversation: AgentConversation | Conversation) => {
      // If generating, snapshot the current conversation so user can switch back to it
      if (isGenerating) {
        const currentId = conversationIdRef.current;
        backgroundConversationsRef.current.set(currentId, {
          messages,
          title,
          toolActivity,
          subAgentToolActivity,
          streamingOutputs,
          pendingApprovals,
          pendingUserQuestion,
          planProposal,
          agenticProgress,
          settings: { ...settings },
          backendConversationStats,
          isBackendStatsStale,
          workspaceRoot: currentWorkspace?.path || null,
          disabledTools: [...disabledTools],
        } as ConversationSnapshot);
        setIsGenerating(false);
      }
      // Already viewing this conversation — just scroll to bottom instantly
      if (conversation.id === activeId) {
        endRef.current?.scrollIntoView({ behavior: "instant" });
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
      const snapshot = backgroundConversationsRef.current.get(conversation.id!);
      if (snapshot && generatingConversationIds.has(conversation.id)) {
        applyConversationData({
          id: conversation.id,
          title: snapshot.title,
          messages: snapshot.messages,
          stats: snapshot.backendConversationStats ?? undefined,
          workspaceRoot: snapshot.workspaceRoot || undefined,
          _fromSnapshot: true,
          _snapshot: snapshot,
        } as Parameters<typeof applyConversationData>[0]);
        recordPixelLoadTime(performance.now() - loadStart);
        setPixelTransition("in");
        return;
      }

      const conversationIdAtLoadStart = conversationIdRef.current;
      try {
        const full = isNoAgent
          ? await PrismService.getConversation(conversation.id!)
          : await PrismService.getAgentConversation(conversation.id!, agentProject!);
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
          error instanceof Error ? error.message : String(error);
        const is404 =
          errorMessage.includes("404") || errorMessage.includes("not found");
        if (is404) {
          console.warn(
            `Conversation ${conversation.id} not yet persisted (still generating?) — skipping switch`,
          );
        } else {
          console.error("Failed to load conversation:", error);
        }
        setPixelTransition(null);
      }
    },
    [
      isGenerating,
      activeId,
      agentProject,
      isNoAgent,
      messages,
      title,
      toolActivity,
      subAgentToolActivity,
      streamingOutputs,
      pendingApprovals,
      pendingUserQuestion,
      planProposal,
      agenticProgress,
      settings,
      backendConversationStats,
      generatingConversationIds,
      applyConversationData,
      recordPixelLoadTime,
      currentWorkspace?.path,
    ],
  );

  // -- Real-Time Background Synchronization (Change Streams) -----
  const refreshActiveConversation = useCallback(
    async (targetConversationId: string) => {
      if (!targetConversationId || targetConversationId !== conversationIdRef.current) return;
      // Skip change-stream refresh while actively generating — the SSE
      // streaming callbacks are the source of truth for message state.
      // Without this guard, a MongoDB change event (triggered when the
      // backend writes the user message) would overwrite the local
      // optimistic messages with stale/incomplete database data, causing
      // the user's latest message and assistant placeholder to vanish.
      if (isGeneratingRef.current && isClientDrivenGenerationRef.current) {
        // Only skip for client-driven generation (active SSE connection).
        // Server-initiated generation (timers, scheduled tasks) has no SSE
        // connection, so change-stream refresh is the only way to update.
        console.debug(
          `[refreshActiveConversation] skipping — conversation ${targetConversationId} is currently generating (client-driven)`,
        );
        return;
      }
      try {
        const full = isNoAgent
          ? await PrismService.getConversation(targetConversationId)
          : await PrismService.getAgentConversation(targetConversationId, agentProject!);
        if (full && full.id === conversationIdRef.current) {
          applyConversationData(full);
        }
      } catch (error) {
        console.error(
          "Failed to refresh active conversation via change stream:",
          error,
        );
      }
    },
    [isNoAgent, agentProject, applyConversationData],
  );

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
  }, [refreshActiveConversation, loadConversations]);

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
  }, [refreshActiveConversation, isNoAgent]);

  const handleUndoDelete = useCallback(
    (conversationId: string, toastId: number) => {
      const pending = pendingDeletionsRef.current.get(conversationId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingDeletionsRef.current.delete(conversationId);

        // Restore the conversation to conversations state
        setConversations((previousConversations) => {
          if (previousConversations.some((conversationItem) => conversationItem.id === conversationId))
            return previousConversations;
          const updated = [...previousConversations, pending.conversationEntry];
          // Sort by updatedAt or createdAt descending
          return updated.sort((conversationA, conversationB) => {
            const dateA = new Date(conversationA.updatedAt || conversationA.createdAt || 0).getTime();
            const dateB = new Date(conversationB.updatedAt || conversationB.createdAt || 0).getTime();
            return dateB - dateA;
          });
        });

        if (pending.wasActive) {
          handleSelectConversation(pending.conversationEntry);
        }

        // Dismiss the toast
        removeToast(toastId);
      }
    },
    [removeToast, handleSelectConversation],
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        const targetConversation = conversations.find((conversationItem) => conversationItem.id === conversationId);
        if (!targetConversation) return;

        const wasActive = activeId === conversationId;

        // Optimistically remove from state
        setConversations((previousConversations) =>
          previousConversations.filter((conversationItem) => conversationItem.id !== conversationId),
        );
        if (wasActive) {
          handleNewChat();
        }

        // Defer actual API deletion by 10 seconds (10000ms)
        const timeoutId = setTimeout(async () => {
          pendingDeletionsRef.current.delete(conversationId);
          try {
            if (isNoAgent) {
              await PrismService.deleteConversation(conversationId);
            } else {
              await PrismService.deleteAgentConversation(conversationId, agentProject!);
            }
          } catch (error) {
            console.error("Failed to delete conversation:", error);
          }
        }, 10000);

        // Store in pending deletions
        pendingDeletionsRef.current.set(conversationId, {
          timeoutId,
          conversationEntry: targetConversation,
          wasActive,
        });

        // Add toast notification
        const toastId = addToast(
          (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: "100%",
              }}
            >
              <span>Conversation deleted</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUndoDelete(conversationId, toastId);
                }}
                style={{
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "#818cf8",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  marginLeft: "auto",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
                }}
              >
                Undo
              </button>
            </div>
          ),
          "info",
          10000,
        );
      } catch (error: unknown) {
        console.error("Failed to delete conversation:", error);
      }
    },
    [
      activeId,
      handleNewChat,
      agentProject,
      isNoAgent,
      conversations,
      addToast,
      handleUndoDelete,
    ],
  );

  // -- Open file in the FileViewerPanel (shared by workspace tree & mention badges) --
  const handleOpenFileInViewer = useCallback(
    (absPath: string) => {
      const existingTab = viewerOpenFiles.find((file) => file.path === absPath);
      if (existingTab) {
        setViewerActiveFileId(existingTab.id);
      } else {
        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setViewerOpenFiles((previousViewerOpenFiles) => [
          ...previousViewerOpenFiles,
          { id, path: absPath },
        ]);
        setViewerActiveFileId(id);
      }
    },
    [viewerOpenFiles],
  );

  // -- Badge helper — 0 = greyed-out, >0 = lit, "new" if tab has unseen data
  const badgeProps = (count: number, tabKey: string) => ({
    badge: count,
    badgeDisabled: count === 0,
    badgeState: newDataTabs.has(tabKey) ? "new" : "default",
  });

  // -- Top panel group (settings, workspace, info, params) ------
  const leftPanel = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        overflow: "hidden",
      }}
    >
      <TabBarComponent
        tabs={[
          {
            key: "settings",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>🛠︎</span>,
            tooltip: "Settings",
          },
          {
            key: "params",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>🎚︎</span>,
            tooltip: "Parameters",
          },
          ...(isWorkspaceTabVisible
            ? [
                {
                  key: "workspace",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>📂</span>,
                  tooltip: "Workspace",
                  badge: workspaces.length,
                  badgeDisabled: workspaces.length === 0,
                },
              ]
            : []),
          {
            key: "info",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>📄</span>,
            tooltip: "Info",
          },
          ...(hasOrchestratorTools
            ? [
                {
                  key: "subAgents",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>🤖</span>,
                  ...badgeProps(subAgentsCount, "subAgents"),
                  badgeRainbow: Object.values(subAgentToolActivity).some(
                    (subAgent: SubAgentActivityEntry) =>
                      subAgent.currentTool ||
                      subAgent.phase === "generating" ||
                      subAgent.phase === "thinking",
                  ),
                  tooltip: "Sub-Agents",
                },
              ]
            : []),
          {
            key: "requests",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>📊</span>,
            ...badgeProps(
              backendConversationStats?.requestCount || 0,
              "requests",
            ),
            tooltip: "Requests",
          },
          {
            key: "nodes",
            icon: <Network size={13} />,
            tooltip: "Nodes",
          },
        ]}
        activeTab={leftTab}
        onChange={(tab: string) => {
          setLeftTab(tab);
          // User manually switched — cancel any pending ephemeral revert
          if (tabRevertTimerRef.current) {
            clearTimeout(tabRevertTimerRef.current);
            tabRevertTimerRef.current = null;
          }
          // Clear "new data" flag — user is now viewing this tab
          setNewDataTabs((previousNewDataTabs) => {
            if (!previousNewDataTabs.has(tab)) return previousNewDataTabs;
            const next = new Set(previousNewDataTabs);
            next.delete(tab);
            return next;
          });
        }}
      />

      {leftTab === "settings" && (
        <>
          <SidebarTabHeaderComponent icon="🛠︎" title="Settings" />
          <SettingsPanel
            readOnly={isAdmin}
            config={filteredConfig}
            settings={settings}
            onChange={
              isNoAgent
                ? (updates: Partial<PrismSettings>) =>
                    setSettings((state) => ({ ...state, ...updates }))
                : (updates: Partial<PrismSettings>) =>
                    setSettings((state) => ({
                      ...state,
                      ...updates,
                      functionCallingEnabled: true,
                    }))
            }
            _hasAssistantImages={false}
            lockedTools={isNoAgent ? new Set() : AGENT_LOCKED_TOOLS}
            hideSystemPrompt={!isNoAgent}
            conversationType={isNoAgent ? "chat" : "agent"}
            canSpawnSubAgents={
              !isNoAgent && (activeAgentData?.canSpawnSubAgents || false)
            }
            agentToggles={
              isNoAgent
                ? []
                : [
                    {
                      key: "plan",
                      icon: <ClipboardList size={12} />,
                      label: "Plan Mode",
                      checked: planFirst,
                      onChange: () => setPlanFirst((value) => !value),
                    },
                    {
                      key: "auto",
                      icon: <Zap size={12} />,
                      label: "Auto Approve Tool Use",
                      checked: autoApprove,
                      onChange: () => {
                        setAutoApprove((previousAutoApprove) => {
                          const nextAutoApprove = !previousAutoApprove;
                          localStorage.setItem(
                            LOCAL_STORAGE_AUTO_APPROVE_ENABLED,
                            String(nextAutoApprove),
                          );
                          return nextAutoApprove;
                        });
                      },
                    },
                    {
                      key: "criticGate",
                      icon: <ShieldCheck size={12} />,
                      label: "Critic Gate",
                      checked: criticGateEnabled,
                      onChange: () => {
                        setCriticGateEnabled((value) => {
                          const next = !value;
                          localStorage.setItem(
                            LS_CRITIC_GATE_ENABLED,
                            String(next),
                          );
                          return next;
                        });
                      },
                    },
                    {
                      key: "iterations",
                      type: "cycle",
                      icon: <Repeat size={12} />,
                      label: "Max Tool Iterations",
                      value: maxIterations,
                      isActive: true,
                      title: "Click to cycle: 10 → 25 → 50 → 100 → ∞",
                      onChange: () => {
                        const steps = [10, 25, 50, 100, Infinity];
                        const index = steps.indexOf(maxIterations);
                        const next = steps[(index + 1) % steps.length];
                        setMaxIterations(next);
                        localStorage.setItem(
                          LS_AGENT_MAX_ITERATIONS,
                          String(next),
                        );
                      },
                    },
                    {
                      key: "subAgentIterations",
                      type: "cycle",
                      icon: <Repeat size={12} />,
                      label: "Max Sub-Agent Tool Iterations",
                      value: maxSubAgentIterations,
                      isActive: true,
                      title: "Click to cycle: 10 → 25 → 50 → 100 → ∞",
                      onChange: () => {
                        const steps = [10, 25, 50, 100, Infinity];
                        const index = steps.indexOf(maxSubAgentIterations);
                        const next = steps[(index + 1) % steps.length];
                        setMaxSubAgentIterations(next);
                        localStorage.setItem(
                          LS_AGENT_MAX_SUB_AGENT_ITERATIONS,
                          String(next),
                        );
                      },
                    },
                    {
                      key: "recursionDepth",
                      type: "cycle",
                      icon: <GitBranch size={12} />,
                      label: "Sub-Agent Recursion Depth",
                      value: maxRecursionDepth,
                      isActive: maxRecursionDepth > 0,
                      title: "Click to cycle: Off → 1 (Workers) → 2 → 3",
                      onChange: () => {
                        const steps = [0, 1, 2, 3];
                        const index = steps.indexOf(maxRecursionDepth);
                        const next = steps[(index + 1) % steps.length];
                        setMaxRecursionDepth(next);
                        localStorage.setItem(
                          LS_AGENT_MAX_RECURSION_DEPTH,
                          String(next),
                        );
                      },
                    },
                  ]
            }
            conversationStats={
              (messages.length > 0
                ? backendConversationStats
                  ? (() => {
                      const mapSubStats = (sub: ConversationStats | undefined) => {
                        if (!sub) return undefined;
                        return {
                          messageCount: sub.requestCount || 0,
                          deletedCount: 0,
                          requestCount: sub.requestCount || 0,
                          uniqueModels: sub.models || [],
                          uniqueProviders: sub.providers || [],
                          totalTokens: {
                            input: sub.totalInputTokens || 0,
                            output: sub.totalOutputTokens || 0,
                            total: sub.totalTokens || 0,
                            cacheRead: sub.totalCacheReadInputTokens || 0,
                            cacheWrite: sub.totalCacheCreationInputTokens || 0,
                            reasoning: sub.totalReasoningOutputTokens || 0,
                          },
                          totalCost: sub.totalCost || 0,
                          originalTotalCost: 0,
                          usedTools: toolCountsToUsedTools(sub.toolCounts),
                          modalities: {},
                          completedElapsedTime: sub.totalElapsedTime || 0,
                          avgTokensPerSec: sub.avgTokensPerSec || undefined,
                          avgTimeToGeneration:
                            sub.avgTimeToGeneration || undefined,
                        };
                      };
                      // -- Token counts come exclusively from the backend --
                      // _liveGenProgress (from generation_progress SSE) carries
                      // authoritative, monotonic token counts from ConversationGenerationTracker.
                      // _backgroundUsage accumulates tokens from fire-and-forget LLM calls
                      // (memory extraction, consolidation) as they complete.
                      // When done, use backendConversationStats which includes everything.
                      const lastMessage = messages[messages.length - 1];
                      const activeMessageCost =
                        lastMessage?.role === "assistant" && isBackendStatsStale
                          ? lastMessage.estimatedCost ||
                            lastMessage._intermediateEstimatedCost ||
                            0
                          : 0;
                      const liveGP =
                        lastMessage?.role === "assistant"
                          ? lastMessage._liveGenProgress
                          : null;
                      const bgUsage =
                        lastMessage?.role === "assistant"
                          ? lastMessage._backgroundUsage
                          : null;
                      const bgInput = bgUsage?.inputTokens || 0;
                      const bgOutput = bgUsage?.outputTokens || 0;
                      const liveOutput = (liveGP?.outputTokens || 0) + bgOutput;
                      const liveInput = (liveGP?.inputTokens || 0) + bgInput;
                      const liveTotal = liveInput + liveOutput;

                      // Use the larger of backend stats or live progress to prevent
                      // dips during the gap between stream end and backend refresh.
                      const tokenOutput = Math.max(
                        backendConversationStats.totalOutputTokens || 0,
                        liveOutput,
                      );
                      const tokenInput = Math.max(
                        backendConversationStats.totalInputTokens || 0,
                        liveInput,
                      );
                      const tokenTotal = Math.max(
                        backendConversationStats.totalTokens || 0,
                        liveTotal,
                      );

                      const activeModel =
                        lastMessage?.role === "assistant"
                          ? lastMessage.model
                          : null;
                      const hasActiveUncountedRequest =
                        lastMessage?.role === "assistant" &&
                        !lastMessage.usage &&
                        !lastMessage._intermediateUsage;

                      return {
                        // -- Backend is source of truth (all requests incl. background) --
                        messageCount: messages.length,
                        deletedCount: 0,
                        requestCount:
                          (backendConversationStats.requestCount || 0) +
                          (bgUsage?.requests || 0) +
                          (hasActiveUncountedRequest ? 1 : 0),
                        uniqueModels: [
                          ...new Set([
                            ...(backendConversationStats.models || []),
                            ...(activeModel ? [activeModel] : []),
                          ]),
                        ],
                        uniqueProviders,
                        totalTokens: (() => {
                          const hwm = tokenHwmRef.current;
                          const threadMessage = {
                            input: Math.max(hwm.input, tokenInput),
                            output: Math.max(hwm.output, tokenOutput),
                            total: Math.max(hwm.total, tokenTotal),
                            cacheRead:
                              backendConversationStats.totalCacheReadInputTokens ||
                              0,
                            cacheWrite:
                              backendConversationStats.totalCacheCreationInputTokens ||
                              0,
                            reasoning:
                              backendConversationStats.totalReasoningOutputTokens ||
                              0,
                          };
                          tokenHwmRef.current = {
                            input: threadMessage.input,
                            output: threadMessage.output,
                            total: threadMessage.total,
                          };
                          return threadMessage;
                        })(),
                        totalCost:
                          (backendConversationStats.totalCost || 0) +
                          (bgUsage?.cost || 0) +
                          activeMessageCost,
                        originalTotalCost: 0,
                        // Merge backend toolCounts, client capabilities, and live
                        // sub-agent tool counts into a single usedTools array
                        usedTools: mergeUsedToolsWithSubAgents(
                          usedTools,
                          backendConversationStats.toolCounts,
                          subAgentToolActivity,
                        ),
                        modalities: (() => {
                          const raw =
                            backendConversationStats.modalities || modalities || {};
                          const mapped: Record<string, boolean> = {};
                          for (const [key, value] of Object.entries(raw)) {
                            mapped[key] = !!value;
                          }
                          return mapped;
                        })(),
                        completedElapsedTime:
                          backendConversationStats.totalElapsedTime ||
                          completedElapsedTime,
                        currentTurnStart,
                        conversationStartTime: messages.length > 0 ? messages[0]?.timestamp : null,
                        liveStreamingTokens,
                        liveStreamingStartTime,
                        liveStreamingLastChunkTime,
                        liveStreamingBurstTokens,
                        liveStreamingBurstElapsed,
                        subAgentGenerationProgress,
                        lastTimeToGeneration,
                        liveProcessingStartTime,
                        liveProcessingPhase,
                        liveTtftSamples,
                        liveGenProgress,
                        avgTokensPerSec:
                          backendConversationStats.avgTokensPerSec || null,
                        avgTimeToGeneration:
                          backendConversationStats.avgTimeToGeneration || null,
                        orchestrator: mapSubStats(
                          backendConversationStats.orchestrator,
                        ),
                        subAgents: mapSubStats(backendConversationStats.subAgents),
                        subAgentCount: subAgentsCount,
                        maxSubAgentDepth,
                      } as DisplayConversationStats;
                    })()
                  : (() => {
                      // -- Client-side fallback (live generation, no backend data yet) --
                      // When _liveGenProgress exists, use backend-authoritative token
                      // counts instead of the client-side computeConversationStats math.
                      // Include _backgroundUsage from fire-and-forget LLM calls.
                      const lastMessage = messages[messages.length - 1];
                      const gp =
                        lastMessage?.role === "assistant"
                          ? lastMessage._liveGenProgress
                          : null;
                      const bgUsage =
                        lastMessage?.role === "assistant"
                          ? lastMessage._backgroundUsage
                          : null;
                      const bgIn = bgUsage?.inputTokens || 0;
                      const bgOut = bgUsage?.outputTokens || 0;
                      const fallbackTokens = gp
                        ? {
                            input: (gp.inputTokens || 0) + bgIn,
                            output: (gp.outputTokens || 0) + bgOut,
                            total:
                              (gp.inputTokens || 0) +
                              (gp.outputTokens || 0) +
                              bgIn +
                              bgOut,
                          }
                        : {
                            input: (totalTokens.input || 0) + bgIn,
                            output: (totalTokens.output || 0) + bgOut,
                            total: (totalTokens.total || 0) + bgIn + bgOut,
                          };

                      const hasActiveUncountedRequest =
                        lastMessage?.role === "assistant" &&
                        !lastMessage.usage &&
                        !lastMessage._intermediateUsage;

                      return {
                        messageCount: messages.length,
                        deletedCount: 0,
                        requestCount:
                          requestCount +
                          (bgUsage?.requests || 0) +
                          (hasActiveUncountedRequest ? 1 : 0),
                        uniqueModels,
                        uniqueProviders,
                        totalTokens: (() => {
                          const hwm = tokenHwmRef.current;
                          const threadMessage = {
                            input: Math.max(
                              hwm.input,
                              fallbackTokens.input || 0,
                            ),
                            output: Math.max(
                              hwm.output,
                              fallbackTokens.output || 0,
                            ),
                            total: Math.max(
                              hwm.total,
                              fallbackTokens.total || 0,
                            ),
                          };
                          tokenHwmRef.current = {
                            input: threadMessage.input,
                            output: threadMessage.output,
                            total: threadMessage.total,
                          };
                          return threadMessage;
                        })(),
                        totalCost:
                          (totalCost as number) +
                          ((bgUsage?.cost || 0) as number),
                        originalTotalCost: 0,
                        // Merge client-side usedTools with live sub-agent tool counts
                        usedTools: mergeUsedToolsWithSubAgents(
                          usedTools,
                          null,
                          subAgentToolActivity,
                        ),
                        modalities: (() => {
                          const original = modalities || {};
                          const mapped: Record<string, boolean> = {};
                          for (const [key, value] of Object.entries(original)) {
                            mapped[key] = !!value;
                          }
                          return mapped;
                        })(),
                        completedElapsedTime,
                        currentTurnStart,
                        conversationStartTime: messages.length > 0 ? messages[0]?.timestamp : null,
                        liveStreamingTokens,
                        liveStreamingStartTime,
                        liveStreamingLastChunkTime,
                        liveStreamingBurstTokens,
                        liveStreamingBurstElapsed,
                        subAgentGenerationProgress,
                        lastTimeToGeneration,
                        liveProcessingStartTime,
                        liveProcessingPhase,
                        liveTtftSamples,
                        liveGenProgress,
                        subAgentCount: subAgentsCount,
                        maxSubAgentDepth,
                      } as DisplayConversationStats;
                    })()
                : null) as DisplayConversationStats | null
            }
            conversationProject={resolvedConversationMetadata.project}
            conversationUsername={resolvedConversationMetadata.username}
            conversationAgent={resolvedConversationMetadata.agentName}
          />
        </>
      )}

      {leftTab === "params" && (
        <>
          <SidebarTabHeaderComponent icon="🎚︎" title="Parameters" />
          <ParametersPanelComponent
            readOnly={isAdmin}
            settings={settings}
            onChange={(updates: Partial<PrismSettings>) =>
              setSettings((state) => ({ ...state, ...updates }))
            }
            config={filteredConfig}
            isAgentMode={!isNoAgent}
          />
        </>
      )}

      {leftTab === "workspace" && (
        <>
          <SidebarTabHeaderComponent
            icon="📂"
            title="Workspace"
            count={workspaceTreeStats?.totalEntries}
            countSuffix={workspaceTreeStats?.truncated ? "+" : ""}
            actions={<WorkspaceSwitcherButtonComponent />}
          />
          <WorkspaceTreePanelComponent
            workspaceTreeRefreshKey={workspaceTreeRefreshKey}
            onMentionFile={handleMentionFile}
            locked={messages.length > 0}
            unavailableWorkspace={unavailableWorkspace}
            hideHeader
            onTreeStats={setWorkspaceTreeStats}
            onOpenFile={(relativePath: string) => {
              // Build absolute path from workspace root + relative path
              const absPath = currentWorkspace?.path
                ? `${currentWorkspace.path.replace(/\/$/, "")}/${relativePath}`
                : relativePath;
              handleOpenFileInViewer(absPath);
            }}
          />
        </>
      )}

      {leftTab === "info" && (
        <>
          <SidebarTabHeaderComponent icon="📄" title="Model Info" />
          <ModelInfoPanel config={filteredConfig} settings={settings} llamaCppServerProps={llamaCppServerProps} />
        </>
      )}

      {leftTab === "subAgents" && (
        <>
          <SidebarTabHeaderComponent icon="🤖" title="Sub-Agents" count={subAgentsCount} actions={subAgentsHeaderActions} />
          <SubAgentsPanel
            conversationId={conversationId}
            refreshKey={tasksRefreshKey}
            onCountChange={setSubAgentsCount}
            onMaxDepthChange={setMaxSubAgentDepth}
            onActionsChange={setSubAgentsHeaderActions}
            subAgentToolActivity={subAgentToolActivity}
          />
        </>
      )}

      {leftTab === "requests" && (
        <>
          <SidebarTabHeaderComponent icon="📊" title="Requests" count={backendConversationStats?.requestCount || 0} />
          <div className={requestsTableStyles['sidebar-scroll-fill']}>
            <RequestsTableComponent
              conversationId={conversationId}
              refreshKey={requestsRefreshKey}
              compact
              mini
              maxHeight={null}
              storageKey="conversation-requests"
            />
          </div>
        </>
      )}

      {leftTab === "nodes" && (
        <>
          <SidebarTabHeaderComponent icon={<Network size={11} />} title="Nodes" />
          <ChatConversationGraphComponent
            conversationId={activeId}
            toolActivity={toolActivity}
            isGenerating={isGenerating}
            graphState={conversationGraphState}
            compact
          />
        </>
      )}

    </div>
  );

  // -- Bottom panel group (tools, extensions, data) ---------------
  const leftPanelBottom = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        overflow: "hidden",
      }}
    >
      <TabBarComponent
        tabs={[
          {
            key: "tools",
            icon: <span className={tabBarStyles['tab-emoji-icon']}>🔧</span>,
            ...badgeProps(selectableConfigurableTools.length + selectableCoreToolsCount, "tools"),
            tooltip: "Tools",
            tooltipDisabled: !settings.functionCallingEnabled,
          },
          ...(!isNoAgent
            ? [
                {
                  key: "skills",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>📖</span>,
                  ...badgeProps(
                    skills.filter((state) => state.enabled).length,
                    "skills",
                  ),
                  tooltip: "Skills",
                },
                {
                  key: "rules",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>📏</span>,
                  ...badgeProps(
                    rules.filter((rule) => rule.enabled).length,
                    "rules",
                  ),
                  tooltip: "Rules",
                },
                ...(hasAnyMemoryModelSet
                  ? [
                      {
                        key: "memories",
                        icon: <span className={tabBarStyles['tab-emoji-icon']}>🧠</span>,
                        ...badgeProps(totalMemoriesCount, "memories"),
                        tooltip: "Memories",
                      },
                    ]
                  : []),
                {
                  key: "tasks",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>✅</span>,
                  ...badgeProps(tasksCount, "tasks"),
                  tooltip: "Tasks",
                },
              ]
            : []),

        ]}
        activeTab={leftTabBottom}
        onChange={(tab: string) => {
          setLeftTabBottom(tab);
          // Clear "new data" flag — user is now viewing this tab
          setNewDataTabs((previousNewDataTabs) => {
            if (!previousNewDataTabs.has(tab)) return previousNewDataTabs;
            const next = new Set(previousNewDataTabs);
            next.delete(tab);
            return next;
          });
        }}
      />

      {leftTabBottom === "tools" && (
        <>
          <SidebarTabHeaderComponent
            icon="🔧"
            title="Tools"
            count={`${enabledSelectableConfigurableToolsCount + (isCoreToolsLocked ? selectableCoreToolsCount : enabledSelectableCoreToolsCount)} / ${selectableConfigurableTools.length + selectableCoreToolsCount}`}
            hasOnlyCoreToolsActive={enabledSelectableConfigurableToolsCount === 0 && (isCoreToolsLocked || enabledSelectableCoreToolsCount === 0)}
          />
          <ToolSelectionComponent
            availableTools={builtInTools}
            enabledTools={builtInTools
              .filter((tool) => !disabledTools.has(tool.name))
              .map((tool) => tool.name)}
            onEnabledToolsChange={(newEnabled) => {
              const enabledSet = new Set(newEnabled);
              for (const tool of builtInTools) {
                if (isCoreToolsLocked && tool.system) continue;
                const isDisabled = disabledTools.has(tool.name);
                const shouldBeEnabled = enabledSet.has(tool.name);
                if (isDisabled && shouldBeEnabled) handleToggleBuiltIn(tool.name);
                else if (!isDisabled && !shouldBeEnabled) handleToggleBuiltIn(tool.name);
              }
            }}
            coreToolsLocked={isCoreToolsLocked}
            lockedOffTools={lockedOffTools}
            readOnly={isSessionLocked}
          />
        </>
      )}

      {leftTabBottom === "skills" && (
        <>
          <SidebarTabHeaderComponent icon="📖" title="Skills" count={skills.length} actions={skillsHeaderActions} />
          <SkillsPanel
            readOnly={isAdmin}
            skills={skills}
            onSkillsChange={loadSkills}
            project={agentProject}
            onActionsChange={setSkillsHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "rules" && (
        <>
          <SidebarTabHeaderComponent icon="📏" title="Rules" count={rules.length} actions={rulesHeaderActions} />
          <RulesPanel
            readOnly={isAdmin}
            rules={rules}
            onRulesChange={loadRules}
            agent={agentId}
            onActionsChange={setRulesHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "memories" && hasAnyMemoryModelSet && (
        <>
          <SidebarTabHeaderComponent icon="🧠" title="Memories" count={totalMemoriesCount} actions={memoriesHeaderActions} />
          <MemoriesPanel
            project={agentProject}
            agent={agentId}
            refreshKey={memoriesRefreshKey}
            onCountChange={setTotalMemoriesCount}
            onActionsChange={setMemoriesHeaderActions}
            memoryConfigured={memoryConfigured}
          />
        </>
      )}

      {leftTabBottom === "tasks" && (
        <>
          <SidebarTabHeaderComponent icon="✅" title="Tasks" count={tasksCount} actions={tasksHeaderActions} />
          <TasksPanel
            project={agentProject}
            refreshKey={tasksRefreshKey}
            conversationId={conversationId}
            onCountChange={setTasksCount}
            onActionsChange={setTasksHeaderActions}
          />
        </>
      )}



    </div>
  );

  // -- Center: chat area ---------------------------------------
  const chatContent = (
    <div className={chatStyles['container']}>
      {/* -- Chat header bar (always visible "New Conversation") -- */}
      <div className={chatStyles['chat-header']}>
        <div className={chatStyles['chat-header-title']}>
          <span className={chatStyles['chat-header-title-text']}>{title || ""}</span>
        </div>
        <div className={chatStyles['chat-header-actions']}>
          <ChatViewModeControlComponent
              viewMode={chatAreaTab === "nodes" ? "nodes" : showRaw ? "raw" : "clean"}
              onViewModeChange={(mode: ChatViewMode) => {
                if (mode === "nodes") {
                  setChatAreaTab("nodes");
                } else {
                  setChatAreaTab("chat");
                  setShowRaw(mode === "raw");
                }
                if (isAdmin) {
                  const searchParameters = new URLSearchParams(window.location.search);
                  if (mode === "clean") {
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
            />
          {!isAdmin && (
            <>
              <div className={chatStyles['message-navigation-controls']}>
                <IconButtonComponent
                  icon={<ChevronUp size={15} />}
                  onClick={handleNavigateUp}
                  disabled={!canNavigateUp}
                  tooltip="Previous message"
                  className={chatStyles['message-navigation-button']}
                />
                <IconButtonComponent
                  icon={<ChevronDown size={15} />}
                  onClick={handleNavigateDown}
                  disabled={!canNavigateDown}
                  tooltip="Next message"
                  className={chatStyles['message-navigation-button']}
                />
              </div>
              <ButtonComponent
                ref={chatNewBtnRef}
                variant="primary"
                size="small"
                icon={chatGlitchLabel ? undefined : Plus}
                onClick={handleNewChatGlitch}
                disabled={messages.length === 0 && !activeId}
                className={`${chatStyles['chat-header-new-button']} ${chatGlitchLabel ? chatStyles['chat-header-new-button-element-glitch'] : ""}`}
                title="Start a new conversation"
              >
                {chatGlitchLabel || "New Conversation"}
              </ButtonComponent>
            </>
          )}
        </div>
      </div>
      {/* Nodes tab — inline conversation graph */}
      {chatAreaTab === "nodes" && (
        <ChatConversationGraphComponent
          conversationId={activeId}
          toolActivity={toolActivity}
          isGenerating={isGenerating}
          graphState={conversationGraphState}
        />
      )}
      {chatAreaTab !== "nodes" && !isAdmin && (
        <PixelTransitionComponent
          phase={pixelTransition}
          duration={
            pixelTransition === "in" ? PIXEL_IN_DURATION : pixelOutDuration
          }
          maxBlockSize={72}
          onComplete={() => {
            if (pixelTransition === "in") {
              setPixelTransition(null);
            }
          }}
          targetRef={messagesListRef}
        />
      )}
      {/* Messages (hidden when Nodes tab is active) */}
      {isAdmin && chatAreaTab !== "nodes" ? (
        <div className={adminPageStyles['viewer-body']} ref={adminViewerBodyRef}>
          {!activeId && !adminLoadingDetail ? (
            <div className={adminPageStyles['empty-viewer']}>
              <MessageSquare
                size={40}
                style={{ opacity: 0.3, marginBottom: 12 }}
              />
              <div>Select a conversation to view</div>
            </div>
          ) : adminLoadingDetail ? (
            <div className={adminPageStyles['empty-viewer']}>
              Loading conversation...
            </div>
          ) : (
            <MessageList
              messages={filteredMessages}
              readOnly
              showRaw={showRaw}
              activeAgent={resolvedConversationAgent}
              systemPrompt={
                showRaw
                  ? settings.systemPrompt ||
                    adminConversationSystemPrompt ||
                    messages.find(
                      (message) => message.role === "system" && !message.deleted,
                    )?.content
                  : undefined
              }
            />
          )}
        </div>
      ) : (
      <div
        className={`${chatStyles['messages-list']} ${agentBackgroundImage ? chatStyles['has-background'] : ""} ${chatAreaTab === "nodes" ? chatStyles['messages-list-hidden'] : ""}`}
        ref={messagesListRef}
        style={
          agentBackgroundImage
            ? ({
                "--agent-background-image": `url(${agentBackgroundImage})`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {messages.length === 0 && activeAgentData && (
          <EmptyStateComponent
            icon={
              <BadgeComponent
                type="agent"
                agent={activeAgentData}
                size={80}
                iconSize={40}
                animation
              />
            }
            title={emptyState.title}
            subtitle={emptyState.subtitle}
          >
            <BadgeComponent
              type="tools"
              count={selectableConfigurableTools.length + selectableCoreToolsCount}
            />
          </EmptyStateComponent>
        )}

        <MessageList
          messages={filteredMessages}
          showRaw={showRaw}
          systemPrompt={showRaw ? (previewSystemPrompt || settings.systemPrompt) : undefined}
          onSystemPromptEdit={
            isNoAgent
              ? (editedPromptValue: string) => {
                  setSettings((previousSettings) => ({
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
              : undefined
          }
          isGenerating={isGenerating}
          streamingOutputs={streamingOutputs}
          subAgentToolActivity={subAgentToolActivity}
          activeAgent={resolvedConversationAgent}
          knownPaths={knownPaths}
          onMentionFileOpen={(relativePath: string) => {
            const absPath = currentWorkspace?.path
              ? `${currentWorkspace.path.replace(/\/$/, "")}/${relativePath}`
              : relativePath;
            handleOpenFileInViewer(absPath);
          }}
          planProposal={planProposal}
          onPlanApprove={() => {
            setPlanProposal((previousPlan) => (previousPlan ? { ...previousPlan, status: "approved" } : null));
            PrismService.sendApprovalResponse(conversationId, true).catch(
              console.error,
            );
          }}
          onPlanReject={() => {
            setPlanProposal((previousPlan) => (previousPlan ? { ...previousPlan, status: "rejected" } : null));
            PrismService.sendApprovalResponse(conversationId, false).catch(
              console.error,
            );
          }}
        />

        {/* Pending approval cards */}
        {!isAdmin && pendingApprovals
          .filter((approvalItem) => approvalItem.status === "pending")
          .map((approval) => (
            <ApprovalCardComponent
              key={approval.id}
              toolName={approval.toolName}
              toolArgs={approval.toolArgs}
              tier={approval.tier}
              onApprove={() => {
                setPendingApprovals((previousPendingApprovals) =>
                  previousPendingApprovals.map((approvalItem) =>
                    approvalItem.id === approval.id ? { ...approvalItem, status: "approved" } : approvalItem,
                  ),
                );
                PrismService.sendApprovalResponse(conversationId, true).catch(
                  console.error,
                );
              }}
              onReject={() => {
                setPendingApprovals((previousPendingApprovals) =>
                  previousPendingApprovals.map((approvalItem) =>
                    approvalItem.id === approval.id ? { ...approvalItem, status: "rejected" } : approvalItem,
                  ),
                );
                PrismService.sendApprovalResponse(conversationId, false).catch(
                  console.error,
                );
              }}
              onApproveAll={() => {
                setPendingApprovals((previousPendingApprovals) =>
                  previousPendingApprovals.map((approvalItem) =>
                    approvalItem.status === "pending" ? { ...approvalItem, status: "approved" } : approvalItem,
                  ),
                );
                setAutoApprove(true);
                PrismService.sendApprovalResponse(conversationId, true, {
                  approveAll: true,
                }).catch(console.error);
              }}
            />
          ))}

        {/* Pending user question card */}
        {!isAdmin && pendingUserQuestion && (
          <UserQuestionCardComponent
            questions={pendingUserQuestion.questions as Array<{ question: string; header?: string | null; options: Array<{ label: string; preview?: string | null }>; multiSelect?: boolean }>}
            context={pendingUserQuestion.context}
            onAnswer={(
              answers: Array<{
                answer: string | string[];
                annotations?: string;
              }>,
            ) => {
              setPendingUserQuestion(null);
              PrismService.sendUserQuestionAnswer(
                conversationId,
                answers,
              ).catch(console.error);
            }}
          />
        )}

        <div ref={endRef} style={{ minHeight: 1 }} />
      </div>
      )}

      {/* -- Status indicator bar (rainbow canvas above input) -- */}
      {!isAdmin && (() => {
        const lastMessage = messages[messages.length - 1];

        // Derive raw status phase/label with robust local fallbacks when cloud models
        // do not emit explicit status events or when messages lack statusPhase metadata.
        let derivedPhase = null;
        let derivedLabel = null;

        // Check if there are active chunks flowing for this generation burst
        const CHUNK_FRESH_MS = 2000;
        const isChunksFlowing =
          liveStreamingLastChunkTime &&
          performance.now() - liveStreamingLastChunkTime < CHUNK_FRESH_MS;

        // Only derive phase from the last message's content/thinking when
        // it's the actively streaming message (no toolCalls). Finalized
        // messages from prior agentic iterations carry stale thinking/content
        // that would incorrectly show "Thinking..." during prompt prefill.
        const isActiveStreamingMessage =
          lastMessage?.role === "assistant" &&
          (!lastMessage.toolCalls || lastMessage.toolCalls.length === 0);

        if (isGenerating && lastMessage?.role === "assistant") {
          if (isChunksFlowing) {
            const segments = lastMessage.contentSegments || [];
            const lastSegment = segments[segments.length - 1];
            if (lastSegment?.type === "thinking") {
              derivedPhase = "thinking";
              derivedLabel = "Thinking...";
            } else if (lastSegment?.type === "text") {
              derivedPhase = "generating";
              derivedLabel = "Generating...";
            }
          }

          if (!derivedPhase && isActiveStreamingMessage) {
            if (lastMessage.content && lastMessage.content.trim().length > 0) {
              derivedPhase = "generating";
              derivedLabel = "Generating...";
            } else if (
              lastMessage.thinking &&
              lastMessage.thinking.trim().length > 0
            ) {
              derivedPhase = "thinking";
              derivedLabel = "Thinking...";
            }
          }
        }

        // On iteration 2+, the model is doing prompt prefill,
        // not bootstrapping — use "prefilling" as the default phase.
        const iterationFallbackPhase =
          (agenticProgress?.iteration ?? 0) > 1 ? "prefilling" : "starting";
        const iterationFallbackLabel =
          (agenticProgress?.iteration ?? 0) > 1 ? "Prefilling..." : "Starting...";

        const rawPhase = isGenerating
          ? derivedPhase || lastMessage?.statusPhase || iterationFallbackPhase
          : null;

        const rawLabel = isGenerating
          ? derivedLabel || lastMessage?.status || iterationFallbackLabel
          : undefined;

        const hasActiveTools = toolActivity.some((tool) => tool.status === "calling" || tool.status === "streaming");
        // Detect awaiting-approval state (plan proposal or tool approval pending)
        const isAwaitingApproval =
          planProposal?.status === "pending" ||
          pendingApprovals.some((approvalItem) => approvalItem.status === "pending") ||
          pendingUserQuestion !== null;

        // -- Derive phase from live sub-agent activity --------------
        // When coordinator tools (team_create) are executing, the
        // orchestrator bar should reflect the aggregate sub-agent state
        // rather than a static "Thinking...". Scan subAgentToolActivity
        // for the dominant phase among active sub-agents.
        let subAgentDerivedPhase = null;
        let subAgentDerivedLabel = null;
        if (hasActiveTools && Object.keys(subAgentToolActivity).length > 0) {
          const subAgents = Object.values(subAgentToolActivity);
          const activeSubAgents = subAgents.filter(
            (subAgent: SubAgentActivityEntry) =>
              subAgent.phase &&
              subAgent.phase !== "complete" &&
              subAgent.phase !== "failed" &&
              subAgent.phase !== "spawned",
          );
          if (activeSubAgents.length > 0) {
            // Priority: generating > thinking > prefilling > executing > loading > starting
            const phasePriority = [
              "generating",
              "thinking",
              "prefilling",
              "executing",
              "loading",
              "starting",
            ];
            for (const phase of phasePriority) {
              const count = activeSubAgents.filter(
                (subAgent: SubAgentActivityEntry) => subAgent.phase === phase,
              ).length;
              if (count > 0) {
                subAgentDerivedPhase = phase;
                const total = activeSubAgents.length;
                // Multiple sub-agents — show aggregate count; single sub-agent uses default phase label (null)
                subAgentDerivedLabel =
                  total > 1
                    ? `${count}/${total} sub-agent${total !== 1 ? "s" : ""} ${phase}…`
                    : null;
                break;
              }
            }
          }
        }

        const activeTool = toolActivity.find((tool) => tool.status === "calling" || tool.status === "streaming");
        const activeToolLabel = activeTool
          ? `Running tool ${renderToolName(activeTool.name)}...`
          : "Executing...";

        const phase = isGenerating
          ? isAwaitingApproval
            ? "awaiting"
            : subAgentDerivedPhase || (hasActiveTools ? "executing" : rawPhase)
          : null;

        // Sync phase color to :root so the sidebar generating-dot can match the bar
        const phaseGradientStops = phase ? PHASE_GRADIENT_STOPS[phase] : null;
        const phaseRepresentativeColor = phaseGradientStops ? phaseGradientStops[3] : null;
        if (phaseRepresentativeColor) {
          document.documentElement.style.setProperty("--generating-dot-phase-color", phaseRepresentativeColor);
        } else {
          document.documentElement.style.removeProperty("--generating-dot-phase-color");
        }
        const label = isGenerating
          ? isAwaitingApproval
            ? "Awaiting For User Input..."
            : subAgentDerivedPhase
              ? subAgentDerivedLabel
              : hasActiveTools
                ? activeToolLabel
                : rawLabel
          : undefined;
        // Structured progress (0-1) from LM Studio prompt prefilling / model loading
        const progress =
          phase === "prefilling" || phase === "loading"
            ? (lastMessage?._statusProgress ?? null)
            : null;

        // Orchestrator tok/s from burst-scoped generation metrics.
        // Show whenever the model is actively streaming chunks — including
        // during tool-call JSON generation (where hasActiveTools is true but
        // chunks are still flowing). We check chunk freshness rather than
        // phase labels to avoid going stale while the model streams FC args.
        let orchestratorTokPerSec = null;
        const isOrchestratorGenerating =
          ((phase === "generating" || phase === "thinking") &&
            !subAgentDerivedPhase) ||
          (hasActiveTools && isChunksFlowing); // tool-call JSON still streaming
        if (
          isOrchestratorGenerating &&
          liveStreamingBurstTokens > 1 &&
          liveStreamingBurstElapsed > 0
        ) {
          orchestratorTokPerSec =
            liveStreamingBurstTokens / (liveStreamingBurstElapsed / 1000);
        }


        return (
          <StatusBarComponent
            active={isGenerating}
            phase={phase as StatusBarPhase | undefined}
            label={label || undefined}
            progress={typeof progress === "number" ? progress : null}
            tokPerSec={orchestratorTokPerSec}
            iteration={agenticProgress?.iteration || 0}
            maxIterations={
              Number.isFinite(maxIterations) ? maxIterations : undefined
            }
          />
        );
      })()}

      {!isAdmin && (
      <div
        className={`${chatStyles['input-wrapper']} ${!settings.provider || !settings.model ? chatStyles['input-wrapper-disabled'] : ""}`}
      >
        <form
          onSubmit={handleSend}
          className={`${chatStyles['input-box']} ${isDragging ? chatStyles['input-box-drag-is-active-state'] : ""} ${isGenerating ? chatStyles['input-box-generating'] : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          {queuedNextTurn && (
            <div className={chatStyles['queued-message']}>
              <div className={chatStyles['queued-header']}>
                <div className={chatStyles['queued-header-left']}>
                  <CornerDownLeft size={14} />
                  <span>Queued for next turn</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTextareaValue(queuedNextTurn.text);
                    setPendingImages(queuedNextTurn.images);
                    setQueuedNextTurn(null);
                  }}
                  className={chatStyles['remove-attachment']}
                  title="Edit queue"
                >
                  <X size={14} />
                </button>
              </div>
              {queuedNextTurn.text && (
                <div className={chatStyles['queued-text']}>
                  {queuedNextTurn.text}
                </div>
              )}
              {queuedNextTurn.images?.length > 0 && (
                <div className={chatStyles['queued-images-count']}>
                  <Paperclip size={12} /> {queuedNextTurn.images.length}{" "}
                  image(s)
                </div>
              )}
            </div>
          )}
          {isDragging && (
            <div className={chatStyles['drag-overlay']}>
              <Paperclip size={20} />
              <span>
                Drop {[...supportedInputModalities].join(", ")} files here
              </span>
            </div>
          )}
          {(pendingImages.length > 0 || pendingFiles.length > 0) && (
            <div className={chatStyles['pending-images']}>
              {pendingImages.map((dataUrl, i) => (
                <div key={`img-${i}`} className={chatStyles['pending-attachment-wrap']}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt="Attached"
                    className={chatStyles['pending-img']}
                    onClick={() => setLightboxSourceUrl(dataUrl)}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className={chatStyles['remove-attachment']}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {pendingFiles.map((pendingFile, i) => {
                const FileIcon =
                  pendingFile.modality === "audio" ? Volume2
                  : pendingFile.modality === "video" ? Video
                  : pendingFile.modality === "pdf" ? FileText
                  : pendingFile.modality === "document" ? FileSpreadsheet
                  : File;
                return (
                  <div key={`file-${i}`} className={chatStyles['pending-attachment-wrap']}>
                    <div className={chatStyles['pending-file-thumb']}>
                      <FileIcon size={20} />
                      <span style={{ fontSize: "0.5625rem", textOverflow: "ellipsis", overflow: "hidden", maxWidth: 56, whiteSpace: "nowrap" }}>
                        {pendingFile.name.length > 10
                          ? pendingFile.name.slice(0, 7) + "..."
                          : pendingFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className={chatStyles['remove-attachment']}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Active rule badges are now inline in the contentEditable */}
          <div className={chatStyles['input-layout-row']}>
            {supportsAnyFileInput && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptFilter}
                  multiple
                  hidden
                  onChange={handleFileSelect}
                />
                <ChatInputButton
                  onClick={() => fileInputRef.current?.click()}
                  label={`Attach files (${[...supportedInputModalities].join(", ")})`}
                  icon="paperclip"
                  uploadTypes={
                    activeUploadTypes.length > 1
                      ? (activeUploadTypes as ("image" | "audio" | "video" | "pdf" | "document")[])
                      : undefined
                  }
                />
              </>
            )}
            <div
              ref={textareaRef}
              contentEditable
              role="textbox"
              aria-multiline="true"
              className={chatStyles['editable-input']}
              onInput={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handleEditablePaste}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.dataset?.slashCommand) {
                  target.remove();
                  const element = textareaRef.current;
                  if (element) {
                    inputValueRef.current = serializeEditable(element);
                    setHasInput(inputValueRef.current.trim().length > 0 || element.querySelectorAll("[data-slash-command]").length > 0);
                  }
                }
              }}
              onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
              data-placeholder={placeholderText}
              suppressContentEditableWarning
            />
            {/* -- Slash Command Picker -- */}
            {slashCommandOpen &&
              rules.length > 0 &&
              (() => {
                const filteredRules = rules.filter(
                  (rule) =>
                    rule.enabled &&
                    rule.name.toLowerCase().includes(slashCommandQuery),
                );
                if (filteredRules.length === 0) return null;
                return (
                  <div
                    className={chatStyles['mention-dropdown']}
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--color-amber) 30%, var(--calculated-border-color))",
                    }}
                  >
                    <div className={chatStyles['mention-list']}>
                      {filteredRules.map((rule) => (
                        <button
                          key={rule.id || rule._id?.toString()}
                          type="button"
                          className={chatStyles['mention-item']}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            const element = textareaRef.current;
                            if (element) {
                              // Clear the typed /query text
                              element.textContent = "";
                              // Insert the inline badge
                              const badge = createSlashCommandBadge(rule.name);
                              const space = document.createTextNode(" ");
                              element.appendChild(badge);
                              element.appendChild(space);
                              placeCaretAfter(space);
                              inputValueRef.current = serializeEditable(element);
                              setHasInput(true);
                              element.focus();
                            }
                            setSlashCommandOpen(false);
                            setSlashCommandQuery("");
                          }}
                        >
                          <span
                            style={{
                              color: "var(--color-amber)",
                              fontFamily: "var(--font-mono, monospace)",
                              fontWeight: 600,
                            }}
                          >
                            /{rule.name}
                          </span>
                          {rule.description && (
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontSize: "0.7rem",
                                marginInlineStart: "8px",
                              }}
                            >
                              {rule.description}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            {/* -- Mention Autocomplete Dropdown -- */}
            {mentionOpen && mentionResults.length > 0 && (
              <div className={chatStyles['mention-dropdown']}>
                <div className={chatStyles['mention-list']} ref={mentionListRef}>
                  {mentionResults.map((entry, i) => (
                    <button
                      key={entry.path}
                      type="button"
                      className={`${chatStyles['mention-item']} ${i === mentionIndex ? chatStyles['mention-item-is-active-state'] : ""}`}
                      onMouseDown={(e: React.MouseEvent) => {
                        e.preventDefault();
                        applyMention(entry);
                      }}
                      onMouseEnter={() => setMentionIndex(i)}
                    >
                      {entry.type === "directory" ? (
                        <FolderOpen size={12} />
                      ) : (
                        <File size={12} />
                      )}
                      <span className={chatStyles['mention-item-path']}>
                        {entry.path}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isGenerating && (
              <ChatInputButton
                variant="button"
                onClick={() => handleSend(null, { isQueueing: true })}
                disabled={!hasInput && pendingImages.length === 0 && pendingFiles.length === 0}
                label="Queue message for next turn"
                icon={<CornerDownLeft size={18} />}
              />
            )}
            <ButtonComponent
              variant="submit"
              icon={isGenerating ? Square : Send}
              isGenerating={isGenerating}
              disabled={
                isGenerating
                  ? false
                  : !hasInput && pendingImages.length === 0 && pendingFiles.length === 0
              }
              aria-label={isGenerating ? "Stop" : "Send"}
            />
          </div>
        </form>
      </div>
      )}
      {!isAdmin && lightboxSourceUrl && (
        <ImagePreviewComponent
          src={lightboxSourceUrl}
          onClose={() => setLightboxSourceUrl(null)}
          onUseAnnotated={(dataUrl: string) => {
            setPendingImages((previousPendingImages) => [
              ...previousPendingImages,
              dataUrl,
            ]);
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
        leftPanel={leftPanel}
        leftPanelBottom={leftPanelBottom}
        leftTitle={undefined}
        fileViewerPanel={
          !isAdmin &&
          !isNoAgent &&
          currentWorkspace &&
          hasFileOperations && (
            <FileViewerPanelComponent
              openFiles={viewerOpenFiles}
              activeFileId={viewerActiveFileId}
              onSelectFile={setViewerActiveFileId}
              onCloseFile={(id: string) => {
                setViewerOpenFiles((previousViewerOpenFiles) => {
                  const next = previousViewerOpenFiles.filter((file) => file.id !== id);
                  if (id === viewerActiveFileId) {
                    const closedTabIndex = previousViewerOpenFiles.findIndex(
                      (file: ViewerOpenFile) => file.id === id,
                    );
                    const newActive =
                      next[Math.min(closedTabIndex, next.length - 1)];
                    setViewerActiveFileId(newActive?.id || null);
                  }
                  return next;
                });
              }}
              onFileNotFound={(id: string) => {
                setViewerOpenFiles((previousViewerOpenFiles) => {
                  const next = previousViewerOpenFiles.filter((file) => file.id !== id);
                  setViewerActiveFileId((activeId: string | null) => {
                    if (activeId !== id) return activeId;
                    const closedTabIndex = previousViewerOpenFiles.findIndex(
                      (file: ViewerOpenFile) => file.id === id,
                    );
                    const newActive =
                      next[Math.min(closedTabIndex, next.length - 1)];
                    return newActive?.id || null;
                  });
                  return next;
                });
              }}
              isOpen={viewerOpenFiles.length > 0}
              width={viewerWidth}
              onWidthChange={(width: number) => {
                setViewerWidth(width);
                localStorage.setItem(LS_FILE_VIEWER_WIDTH, String(width));
              }}
              refreshKey={viewerRefreshKey}
              onMentionLines={handleMentionLines}
            />
          )
        }
        rightPanel={
          isAdmin ? (
            <HistoryPanel
              conversations={adminEntries as (AgentConversation | Conversation)[]}
              activeId={activeId}
              onSelect={(entry: AgentConversation | Conversation) => {
                const unifiedEntry = entry as UnifiedEntry;
                adminSelectEntry(
                  unifiedEntry.id || "",
                  unifiedEntry._source || "conversation",
                );
              }}
              readOnly
              showProject
              showUsername
              newIds={adminNewIds}
              disableNew
              newLabel="New Conversation"
              emptyText="No conversations found"
              searchText="Search conversations..."
              countLabel="conversations"
              hasMore={adminEntriesHasMore}
              loadingMore={adminEntriesLoading}
              onLoadMore={adminLoadMoreEntries}
              filterStorageKey={LS_ADMIN_CHAT_FILTERS}
              dateRange={adminDateRange}
              onDateChange={adminHeaderContext.setDateRange}
              initialProviders={adminProviderFilter ? [adminProviderFilter] : undefined}
              initialSearch={adminTraceFilter || undefined}
              knownParentConversationIds={knownParentConversationIds}
            />
          ) : (
            <HistoryPanel
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
              onDelete={handleDeleteConversation}
              disableNew={messages.length === 0 && !activeId}
              newLabel="New Conversation"
              emptyText="No recent conversations"
              searchText="Search conversations..."
              countLabel="conversations"
              generatingConversationIds={generatingConversationIds as Set<string>}
              knownParentConversationIds={knownParentConversationIds}
              hasMore={conversationsHasMore}
              loadingMore={conversationsLoading}
              onLoadMore={loadMoreConversations}
              filterStorageKey={LS_CHAT_FILTERS}
            />
          )
        }
        rightTitle={
          isAdmin
            ? `${adminEntries.length}${adminEntriesHasMore ? "+" : ""} Conversations`
            : `${conversations.length}${conversationsHasMore ? "+" : ""} Conversations`
        }
        conversationType="agent"
        headerCenter={
          <div className={layoutHeaderStyles["header-center-group"]}>
            {isAdmin ? (
              adminAgents.length > 1 && (
                <AgentPickerComponent
                  agents={adminAgents as AgentPersona[]}
                  activeAgentId={adminActiveAgentId}
                  onSelect={adminHandleAgentSelect}
                />
              )
            ) : (
              agents.length > 1 && (
                <AgentPickerComponent
                  agents={agents}
                  activeAgentId={agentId}
                  onSelect={(id: string) => {
                    window.dispatchEvent(
                      new CustomEvent(EV_AGENT_SWITCH, {
                        detail: { agentId: id },
                      }),
                    );
                  }}
                  disabled={isGenerating}
                />
              )
            )}
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={{ provider: settings.provider, model: settings.model }}
              disabled={isAdmin || isGenerating}
              onSelectModel={isAdmin ? undefined : (provider: string, modelName: string) => {
                const modelDef = (
                  filteredConfig?.textToText?.models?.[provider] || []
                ).find((model: ModelOption) => model.name === modelName);
                const temp = modelDef?.defaultTemperature ?? 1.0;
                setSettings((state) => ({
                  ...state,
                  provider,
                  model: modelName,
                  temperature: temp,
                }));
                if (activeId) {
                  PrismService.patchConversation(
                    activeId,
                    {
                      settings: {
                        ...settings,
                        provider,
                        model: modelName,
                        temperature: temp,
                      },
                    },
                    agentProject || undefined,
                  ).catch((err) => {
                    console.error(
                      "Failed to patch conversation settings:",
                      err,
                    );
                  });
                }
                saveModel(provider, modelName);
                window.dispatchEvent(
                  new CustomEvent(EV_MODEL_CHANGE, {
                    detail: { provider, model: modelName },
                  }),
                );
              }}
              favorites={favoriteKeys}
              onToggleFavorite={async (key: string) => {
                if (favoriteKeys.includes(key)) {
                  setFavoriteKeys((previousFavoriteKeys) =>
                    previousFavoriteKeys.filter((k) => k !== key),
                  );
                  PrismService.removeFavorite("model", key).catch(() => {});
                } else {
                  setFavoriteKeys((previousFavoriteKeys) => [
                    ...previousFavoriteKeys,
                    key,
                  ]);
                  const [provider, ...rest] = key.split(":");
                  PrismService.addFavorite("model", key, {
                    provider,
                    name: rest.join(":"),
                  }).catch(() => {});
                }
              }}
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
