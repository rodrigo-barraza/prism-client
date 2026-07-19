"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Paperclip,
  X,
  ClipboardList,
  Zap,
  GitBranch,
  Repeat,
  CornerDownLeft,
  Send,
  Square,
  File,
  FolderOpen,
  Plus,
  ShieldCheck,
  FileCode,
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
  TransformedRequestItem,
  LlamaCppServerProps,
  ContextBudget,
  LiveConversationStatus,
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
import DatastorePanel from "./DatastorePanelComponent";
import WorkflowMemoriesPanel from "./WorkflowMemoriesPanelComponent";

import SubAgentsPanel from "./SubAgentsPanelComponent";
import ParametersPanelComponent from "./ParametersPanelComponent";
import RequestsTableComponent from "./RequestsTableComponent";
import WorkspaceTreePanelComponent from "./WorkspaceTreePanelComponent";
import WorkspaceSwitcherButtonComponent from "./WorkspaceSwitcherButtonComponent";
import SidebarTabHeaderComponent from "./SidebarTabHeaderComponent";
import FileViewerPanelComponent from "./FileViewerPanelComponent";
import MessageList, {
  type QueuedNextTurn,
  type PendingFileAttachment,
} from "./MessageListComponent";
import { resolveDisplayMessages } from "../utils/messageHelpers";
import ContextBudgetIndicatorComponent from "./ContextBudgetIndicatorComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";

import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ApprovalCardComponent from "./ApprovalCardComponent";
import UserQuestionCardComponent from "./UserQuestionCardComponent";

import StatusBarComponent, { type StatusBarPhase } from "./StatusBarComponent";
import { PHASE_TOKENS } from "../utils/statusBarPhaseTokens";
import PixelTransitionComponent from "./PixelTransitionComponent";
import ChatConversationGraphComponent from "./ChatConversationGraphComponent";
import useConversationGraphData from "../hooks/useConversationGraphData";
import ChatViewModeControlComponent from "./ChatViewModeControlComponent";
import type { ChatViewMode } from "./ChatViewModeControlComponent";

import {
  applyToolExecutionToMessages,
  applyToolExecutionToActivity,
  applyToolCallToMessages,
} from "../utils/toolCallStateUpdaters";
import { cacheToolEmoji } from "./WorkflowNodeConstantsComponent";

import useConversationStats from "../hooks/useConversationStats";
import { 
  generateUUID, 
  renderToolName,
  type ToolDisplayMetadata,
} from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES, STATUS_MESSAGES, DEFAULT_TOPOLOGY, DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { buildUnifiedToolCounts, CAPABILITY_TOOL_NAMES, toolCountsToUsedTools, resolveDefaultModel, buildDateRangeParams, buildSettingsDefaults, isNameBasedThinkingModel } from "../utils/utilities";
import { buildResetConversationSettings } from "../utils/conversationReset";
import {
  MESSAGE_ROLES,
  EXECUTION_STATUS,
  APPROVAL_STATUS,
  PROJECT_AGENT,
  STORAGE_KEY_MODEL_MEMORY_AGENT,
  STORAGE_KEY_MODEL_MEMORY_AGENT_PREFIX,
  MAX_TOOL_ITERATIONS,
  LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH,
  LOCAL_STORAGE_KEY_CHAT_FILTERS,
  LOCAL_STORAGE_KEY_ADMIN_CHAT_FILTERS,
  LOCAL_STORAGE_KEY_DATE_RANGE,
  LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE,
  AGENT_IDS,
  AGENTLESS_AGENT,
  LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT,
  LOCAL_STORAGE_KEY_CRITIC_GATE_ENABLED,
  LOCAL_STORAGE_KEY_AUTO_APPROVE_ENABLED,
  LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS,
  LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS,
  LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH,
  DEFAULT_RECURSIVE_SPAWNING_DEPTH,
  EVENT_NAME_SIDEBAR_TAB_CHANGE,
  EVENT_NAME_SIDEBAR_TAB_BOTTOM_CHANGE,
  EVENT_NAME_VIEW_MODE_CHANGE,
  EVENT_NAME_USER_TYPING,
  EVENT_NAME_CONVERSATION_CHANGE,
  EVENT_NAME_AGENT_SWITCH,
  EVENT_NAME_MODEL_CHANGE,
  EVENT_NAME_CRON_JOB_SCHEDULED,
  LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE,
} from "../constants";
import adminPageStyles from "../app/admin/chat/page.module.css";
import requestsTableStyles from "./RequestsTableComponent.module.css";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import useProjectFilter from "../hooks/useProjectFilter";
import { getErrorMessage } from "../utils/errorMessage";
import {
  buildAcceptFilter,
  classifyIntakeFile,
  getTextualFileKind,
  isUniversallyReadableMime,
  normalizeDataUrlMimeType,
} from "../utils/fileIntake";
import { shouldOpenSubAgentLiveStream } from "../utils/subAgentLiveStreamGate";
import {
  shouldApplySnapshotRefresh,
  seedStreamAccumulators,
  extractPersistedContextBudget,
} from "../utils/liveConversationView";
import { useSearchParams, useRouter } from "next/navigation";
import chatStyles from "./ChatAreaComponent.module.css";
import ChatInputButton from "./ChatInputButtonComponent";
import InputBoxComponent from "./InputBoxComponent";
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
import ChatBackgroundComponent from "./ChatBackgroundComponent";
import { useChatBackgroundSetting } from "../hooks/useChatBackgroundSetting";
import useToolToggles from "../hooks/useToolToggles";
import useModelMemory from "../hooks/useModelMemory";
import AgentPickerComponent from "./AgentPickerComponent";
import BadgeComponent, { registerModelLabels } from "./BadgeComponent";
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

// Stable default so non-admin renders do not churn admin callback deps
const EMPTY_ADMIN_DATE_RANGE = { from: "", to: "" };

// -- Attachment guardrails ---------------------------------------
// Enforced at intake (file picker, drag-drop, paste) so oversized or
// excess attachments are rejected with feedback instead of silently
// bloating the payload. Images travel inline as base64; other files
// upload to MinIO before send.
const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB per image
const MAX_FILE_ATTACHMENT_BYTES = 40 * 1024 * 1024; // 40MB per non-image file
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const MODALITY_PLURAL_LABELS: Record<string, string> = {
  image: "images",
  audio: "audio",
  video: "video",
  pdf: "PDFs",
  document: "documents",
};

function formatByteLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

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
  tokensPerSecond?: number;
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

/**
 * Normalize a backend sub-agent status to the frontend phase vocabulary.
 *
 * The backend persists sub-agent status as "running" | "complete" | "failed" | "stopped",
 * and SubAgentResultBuilder transforms "complete" → "completed" for tool results.
 * The frontend terminal-phase checks use "complete" | "failed".
 *
 * "running" maps to "generating" so the StatusBarComponent shows active state.
 * Non-blocking dispatch closes the parent SSE stream while sub-agents continue
 * running — without this, the StatusBar would always show idle because no live
 * SSE events reach the client to override the hydrated phase.
 * If the sub-agent already completed before the hydration call, the next poll
 * will return "complete" and resolve the StatusBar to idle.
 */
function normalizeSubAgentStatusToPhase(backendStatus: string): string {
  switch (backendStatus) {
    case "completed":
    case "complete":
    case "stopped":
      return "complete";
    case "running":
      return "generating";
    case "failed":
      return "failed";
    default:
      return backendStatus;
  }
}

/** Approval request from an agentic tool call. */
interface PendingApproval {
  id: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  tier?: 1 | 2 | 3;
  status: (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];
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
    tokensPerSecond?: number;
    totalOutputTokens?: number;
    cost?: number;
    requests?: number;
    activeRequests?: number;
    totalTokens?: number;
    avgTtft?: number;
    /** Live server-estimated cost of the in-flight generation (USD) */
    estimatedCost?: number | null;
    timestamp?: number;
  };
  _fromSnapshot?: boolean;
  _snapshot?: Record<string, unknown>;
  statusPhase?: string;
  synthetic?: boolean;
  /** UI-only status marker for in-flight messages (e.g. 'thinking', 'processing') */
  status?: string;
  /** Populated when the agentic loop terminates for a non-standard reason (e.g. iteration limit, stall, cost limit) */
  _terminationReason?: string;
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
  initialViewMode = null,
  isAdmin = false,
  initialId = null,
}: AgentChatComponentProps) {
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
  // Ref mirror so the long-lived change-stream subscription reads the
  // current source without re-subscribing (see activeIdRef).
  const adminSelectedSourceRef = useRef<
    "conversation" | "agent_conversation" | null
  >(adminSelectedSource);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  adminSelectedSourceRef.current = adminSelectedSource;
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
  const adminDateRange = isAdmin ? adminHeaderContext.dateRange : EMPTY_ADMIN_DATE_RANGE;
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

  const { currentWorkspace, setCurrentWorkspace, workspaces, workspacesLoaded } = useWorkspace();

  // Ambient 3D backdrop for the empty state ("clouds" by default); an
  // agent's own backgroundImage takes precedence over the scene.
  const [chatBackground] = useChatBackgroundSetting();

  // -- State ----------------------------------------------------
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [queuedNextTurn, setQueuedNextTurn] = useState<QueuedNextTurn | null>(
    null,
  );

  const inputValueRef = useRef<string>("");
  const [hasInput, setHasInput] = useState(false);
  const [draftInputLength, setDraftInputLength] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUserExplicitlyStopped, setIsUserExplicitlyStopped] = useState(false);
  const [contextBudget, setContextBudget] = useState<ContextBudget | null>(null);
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
  // Ref mirrors for long-lived subscriptions (admin change-stream onChange)
  // that must read the CURRENT selection without re-subscribing on every
  // selection change.
  const activeIdRef = useRef<string | null>(activeId);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  activeIdRef.current = activeId;

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
  // Single source of truth for the chat-area view mode. `showRaw` and the
  // Nodes checks below are derived from this so no impossible state combos
  // exist (previously two independent booleans: chatAreaTab + showRaw).
  const [viewMode, setViewMode] = useState<ChatViewMode>(() => {
    if (initialViewMode === "nodes") return "nodes";
    if (initialViewMode === "raw") return "raw";
    if (initialViewMode === "clean") return "clean";
    if (initialViewMode === "terminal") return "terminal";
    // Minimal, friendly Chat view is the default.
    return "chat";
  });
  const showRaw = viewMode === "raw";
  const isTerminalView = viewMode === "terminal";
  // Empty conversation → show the ambient scene (unless the agent brings
  // its own background image, the user turned scenes off, or the flat
  // Terminal view is active).
  const showsChatBackgroundScene =
    messages.length === 0 &&
    !agentBackgroundImage &&
    chatBackground !== "none" &&
    !isTerminalView;
  const [builtInTools, setBuiltInTools] = useState<ToolSchema[]>([]);
  const toolDisplayMetadataMap = useMemo(() => {
    const map: Record<string, ToolDisplayMetadata> = {};
    for (const tool of builtInTools || []) {
      if (tool.display) {
        map[tool.name] = tool.display;
      }
    }
    return map;
  }, [builtInTools]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [_injectedSkills, setInjectedSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  // Active rules are tracked as inline badges in the contentEditable DOM.
  // At send time we extract names via extractSlashCommandNames().
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashCommandQuery, setSlashCommandQuery] = useState("");
  const [memoriesRefreshKey, setMemoriesRefreshKey] = useState(0);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [datastoreRefreshKey, setDatastoreRefreshKey] = useState(0);
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
    _message: React.ReactNode,
    _type?: "success" | "warning" | "error" | "info" | string,
    _duration?: number,
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
    const pendingDeletions = pendingDeletionsRef.current;
    return () => {
      pendingDeletions.forEach((pending) => {
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
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  viewerOpenFilesRef.current = viewerOpenFiles;
  const [viewerWidth, setViewerWidth] = useState(() => {
    if (typeof window === "undefined") return 500;
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH);
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
  const [datastoreHeaderActions, setDatastoreHeaderActions] =
    useState<ReactNode>(null);
  const [workflowMemoriesCount, setWorkflowMemoriesCount] = useState(0);
  const [workflowMemoriesHeaderActions, setWorkflowMemoriesHeaderActions] =
    useState<ReactNode>(null);
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
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
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
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  leftTabBottomRef.current = leftTabBottom;

  useEffect(() => {
    if (leftTab) {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME_SIDEBAR_TAB_CHANGE, {
          detail: { tab: leftTab },
        }),
      );
    }
  }, [leftTab]);

  useEffect(() => {
    if (leftTabBottom) {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME_SIDEBAR_TAB_BOTTOM_CHANGE, {
          detail: { tabBottom: leftTabBottom },
        }),
      );
    }
  }, [leftTabBottom]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME_VIEW_MODE_CHANGE, {
        detail: { viewMode },
      }),
    );
  }, [viewMode]);

  useEffect(() => {
    if (initialTabKey) {
      if (BOTTOM_PANEL_TABS.has(initialTabKey)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
        if (initialTabKey !== leftTabBottom) setLeftTabBottom(initialTabKey);
      } else {
        if (initialTabKey !== leftTab) setLeftTab(initialTabKey);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial tab sync runs on trigger props only; adding tab state would clobber user navigation
  }, [initialTabKey]);

  useEffect(() => {
    if (initialTabBottomKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      if (initialTabBottomKey !== leftTabBottom) setLeftTabBottom(initialTabBottomKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial tab sync runs on trigger props only; adding tab state would clobber user navigation
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

  /* Maps each sub-agent's conversationId → live StatusBarPhase so the sidebar
     HistoryItemComponent progress bars use the correct gradient palette that
     matches the conversation-view StatusBarComponent. */
  const subAgentLivePhases = useMemo(() => {
    const phaseMap = new Map<string, StatusBarPhase>();
    for (const entry of Object.values(subAgentToolActivity)) {
      const subAgentEntry = entry as SubAgentActivityEntry;
      if (subAgentEntry.conversationId && subAgentEntry.phase) {
        const validPhases = new Set<string>([
          "starting", "loading", "prefilling", "generating",
          "thinking", "executing", "synthesizing", "delegating", "awaiting",
        ]);
        if (validPhases.has(subAgentEntry.phase)) {
          phaseMap.set(
            subAgentEntry.conversationId as string,
            subAgentEntry.phase as StatusBarPhase,
          );
        }
      }
    }
    return phaseMap;
  }, [subAgentToolActivity]);
  const [tasksCount, setTasksCount] = useState(0);
  const [datastoreCount, setDatastoreCount] = useState(0);
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
      ? STORAGE_KEY_MODEL_MEMORY_AGENT
      : STORAGE_KEY_MODEL_MEMORY_AGENT_PREFIX + agentId;

  const { disabledTools, handleToggleBuiltIn, resetToAllDisabled, restoreDisabledTools, enableSpecificTools } =
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
        ? localStorage.getItem(LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE)
        : null;
    const workspaceEnabledPreference =
      persistedWorkspaceToggle !== null
        ? persistedWorkspaceToggle !== "false"
        : true;

    return {
      maxTokens: 64000,
      functionCallingEnabled: initialFcEnabled ? true : !isNoAgent,
      thinkingEnabled: initialThinkingEnabled
        ? true
        : (buildSettingsDefaults(config?.parameterDescriptors).thinkingEnabled as boolean) || false,
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
  const [pendingFiles, setPendingFiles] = useState<PendingFileAttachment[]>([]);
  // Refs mirror the pending attachment state so intake validation and
  // handleSend can read current values without re-creating callbacks on
  // every attachment change (the main cause of input lag).
  const pendingImagesRef = useRef<string[]>(pendingImages);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  pendingImagesRef.current = pendingImages;
  const pendingFilesRef = useRef<typeof pendingFiles>(pendingFiles);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  pendingFilesRef.current = pendingFiles;
  const [lightboxSourceUrl, setLightboxSourceUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef<number>(0);

  // Phase 1: Agentic controls
  const [autoApprove, setAutoApprove] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LOCAL_STORAGE_KEY_AUTO_APPROVE_ENABLED) === "true";
    }
    return false;
  });
  const [maxIterations, setMaxIterations] = useState(MAX_TOOL_ITERATIONS);
  const [maxSubAgentIterations, setMaxSubAgentIterations] =
    useState(MAX_TOOL_ITERATIONS);
  const [maxRecursionDepth, setMaxRecursionDepth] = useState(DEFAULT_RECURSIVE_SPAWNING_DEPTH);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const parseStored = (key: string) => {
      const stored = localStorage.getItem(key);
      if (stored === "Infinity") return Infinity;
      const parsed = Number(stored);
      return [10, 25, 50, 100].includes(parsed) ? parsed : null;
    };
    const iter = parseStored(LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (iter != null) setMaxIterations(iter);
    const subAgentIter = parseStored(LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS);
    if (subAgentIter != null) setMaxSubAgentIterations(subAgentIter);
    const storedRecursionDepth = localStorage.getItem(LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH);
    if (storedRecursionDepth != null) {
      const parsedDepth = Number(storedRecursionDepth);
      if ([0, 1, 2, 3].includes(parsedDepth)) setMaxRecursionDepth(parsedDepth);
    }
  }, []);
  const [planFirst, setPlanFirst] = useState(false);
  const [criticGateEnabled, setCriticGateEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LOCAL_STORAGE_KEY_CRITIC_GATE_ENABLED) === "true";
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
  // Elapsed time offset (ms) from the backend's live status registry.
  // Seeds the StatusBar's asymptotic timer so it resumes at the correct
  // position after a conversation switch or page refresh.
  const [statusBarInitialElapsedMilliseconds, setStatusBarInitialElapsedMilliseconds] =
    useState<number | null>(null);
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
  const loadConversationsRef = useRef<(() => Promise<void>) | null>(null);

  // -- Message navigation (up/down chevron buttons in header) --
  const [canNavigateUp, setCanNavigateUp] = useState(false);
  const [canNavigateDown, setCanNavigateDown] = useState(false);

  // -- Sticky auto-scroll -------------------------------------
  // Only auto-scroll when the user is near the bottom of the messages container.
  // Re-engaged on send, conversation load, and new chat.
  const isUserNearBottomRef = useRef<boolean>(true);
  const SCROLL_BOTTOM_THRESHOLD = 150;

  const conversationIdRef = useRef<string>(conversationId);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  conversationIdRef.current = conversationId;
  const isGeneratingRef = useRef<boolean>(isGenerating);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  isGeneratingRef.current = isGenerating;
  // Distinguish client-initiated generation (active SSE via handleSend)
  // from server-initiated generation (timer/scheduled task, passive DB load).
  // Change-stream refresh is safe to skip only for client-driven generation.
  const isClientDrivenGenerationRef = useRef<boolean>(false);
  const isWebSocketStreamingRef = useRef<boolean>(false);
  // True only once the live WebSocket stream has actually delivered content
  // for the viewed conversation. DB-snapshot refreshes are suppressed only
  // then — a silent subscription (e.g. service without direct-viewer
  // broadcast support) must NOT block boundary refreshes.
  const webSocketHasStreamedContentRef = useRef<boolean>(false);
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

  // Poll for pendingBackgroundTasks resolution when the SSE stream has closed
  // but the conversation still has outstanding background tasks. The backend
  // emits a WebSocket event when tasks complete, but the client has no
  // persistent WebSocket listener — so we poll until the counter resolves.
  const pendingBackgroundTaskCountForPolling = useMemo(() => {
    if (!activeId) return 0;
    const activeEntry = conversations.find((entry) => entry.id === activeId);
    return (activeEntry as { pendingBackgroundTasks?: number } | undefined)
      ?.pendingBackgroundTasks ?? 0;
  }, [activeId, conversations]);

  const isActiveConversationSubAgent = useMemo(() => {
    if (!activeId) return false;
    const activeEntry = conversations.find((entry) => entry.id === activeId);
    return !!(
      activeEntry as { parentAgentConversationId?: string | null } | undefined
    )?.parentAgentConversationId;
  }, [activeId, conversations]);

  // Whether the backend explicitly marks this conversation as still running
  // (isActive === true). Survives page refresh — unlike isGenerating which
  // is client-side SSE state that gets lost when the stream is interrupted.
  const isActiveConversationExplicitlyActive = useMemo(() => {
    if (!activeId) return false;
    const activeEntry = conversations.find((entry) => entry.id === activeId);
    return activeEntry?.isActive === true;
  }, [activeId, conversations]);

  // Unified "is the conversation still doing work" flag — used for the
  // stop/send button toggle and the input-box generating class.
  // True when the client is streaming (isGenerating), OR the backend
  // reports the session as active (isActive), OR background tasks remain.
  // Immediately false when the user explicitly pressed stop, bypassing
  // stale backend state that hasn't refreshed yet.
  const isConversationRunning =
    !isUserExplicitlyStopped &&
    (isGenerating ||
    isActiveConversationExplicitlyActive ||
    pendingBackgroundTaskCountForPolling > 0);

  useEffect(() => {
    if (!activeId || isGenerating || pendingBackgroundTaskCountForPolling <= 0) return;

    const backgroundTaskPollInterval = setInterval(async () => {
      try {
        const freshConversation = await PrismService.getConversation(activeId);
        const freshPendingCount =
          (freshConversation as unknown as { pendingBackgroundTasks?: number })
            ?.pendingBackgroundTasks ?? 0;
        const freshIsActive =
          (freshConversation as unknown as { isActive?: boolean })
            ?.isActive;
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
  }, [activeId, isGenerating, pendingBackgroundTaskCountForPolling]);

  // Poll sub-agent status when the parent SSE stream has closed (non-blocking
  // dispatch) but sub-agents are still running in the background. The SSE
  // stream is the primary delivery channel for live sub-agent events, but it
  // closes when the parent generation ends. Without this poll, the StatusBar
  // inside the tool call block would remain stuck on the hydrated state.
  useEffect(() => {
    if (!activeId || isGenerating || pendingBackgroundTaskCountForPolling <= 0) return;

    const subAgentStatusPollInterval = setInterval(async () => {
      try {
        const result = await PrismService.getCoordinatorSubAgents(activeId);
        const subAgentsList = result.subAgents || [];
        setSubAgentsCount(subAgentsList.length);
        setMaxSubAgentDepth(
          subAgentsList.reduce(
            (maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0),
            0,
          ),
        );
        setSubAgentToolActivity((previousSubAgentToolActivity) => {
          const nextSubAgentToolActivity = { ...previousSubAgentToolActivity };
          for (const subAgent of subAgentsList) {
            const subAgentAgentId = subAgent.agentId || subAgent.id;
            if (!subAgentAgentId) continue;
            const normalizedPhase = normalizeSubAgentStatusToPhase(subAgent.status);
            const existingEntry = nextSubAgentToolActivity[subAgentAgentId];
            // Always update from the backend during background polling —
            // the SSE stream is closed so no live data is arriving to conflict.
            nextSubAgentToolActivity[subAgentAgentId] = {
              toolCount: subAgent.toolCallCount || existingEntry?.toolCount || 0,
              currentTool: existingEntry?.currentTool ?? null,
              iteration: existingEntry?.iteration ?? 0,
              toolNames: subAgent.toolNames || existingEntry?.toolNames || {},
              description: subAgent.description,
              phase: normalizedPhase,
              conversationId: subAgent.id || existingEntry?.conversationId || undefined,
            };
          }
          return nextSubAgentToolActivity;
        });
      } catch {
        // Non-critical polling — silently ignore network failures
      }
    }, 3000);

    return () => clearInterval(subAgentStatusPollInterval);
  }, [activeId, isGenerating, pendingBackgroundTaskCountForPolling]);


  // Snapshot cache: stores UI state for conversations that are generating in the background
  // so the user can switch back without waiting for backend persistence.
  const backgroundConversationsRef = useRef<Map<string, ConversationSnapshot>>(new Map());

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsGenerating(false);
    setIsUserExplicitlyStopped(true);
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
      const terminalPhases = new Set(["complete", "completed", "failed", "stopped"]);
      const hasActive = Object.values(previousSubAgentToolActivity).some(
        (subAgent: SubAgentActivityEntry) =>
          !subAgent.phase || !terminalPhases.has(subAgent.phase),
      );
      if (!hasActive) return previousSubAgentToolActivity;
      const next: Record<string, SubAgentActivityEntry> = {};
      for (const [id, subAgent] of Object.entries(previousSubAgentToolActivity)) {
        next[id] =
          !subAgent.phase || !terminalPhases.has(subAgent.phase)
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

    // Reload the conversation list so isActive / pendingBackgroundTasks
    // refresh and isConversationRunning flips to false once the backend
    // processes the stop request. Use setTimeout to give the backend a
    // brief window to persist the stopped state before we re-fetch.
    setTimeout(() => {
      loadConversationsRef.current?.();
    }, 500);
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
      // Honor every attachment-capable modality the model declares —
      // e.g. Gemini models list audio/video/pdf alongside image.
      // ("text" is not an attachment modality; office documents stay
      // tool-gated via inputModalities below.)
      for (const inputType of modelDef?.inputTypes ?? []) {
        if (["image", "audio", "video", "pdf"].includes(inputType)) {
          modalities.add(inputType);
        }
      }
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

  // Text/code files are always accepted (inlined server-side for every
  // provider), so file input is never fully unavailable.
  const supportsAnyFileInput = true;

  // Human-readable list of what can currently be attached — the
  // modality labels plus the always-supported text/code files.
  const attachmentKindsLabel = useMemo(
    () =>
      [
        ...[...supportedInputModalities].map(
          (modality) => MODALITY_PLURAL_LABELS[modality] || modality,
        ),
        "text/code files",
      ].join(", "),
    [supportedInputModalities],
  );

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

  const acceptFilter = useMemo(
    () => buildAcceptFilter(supportedInputModalities),
    [supportedInputModalities],
  );

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

    // Always-on thinking is a model capability, fully derivable from the
    // catalog: a thinking model whose thinkingLevels can't drop to "minimal"
    // cannot have thinking disabled. (Previously also gated on
    // `provider === "google"`, which was redundant with thinkingLevels.)
    const canDisable =
      !modelDef.thinkingLevels || modelDef.thinkingLevels.includes("minimal");
    const isThinkingAlwaysOn = !canDisable && modelDef.thinking;

    // Anthropic adaptive thinking models (Fable 5, Mythos 5, Opus 4.7+) have
    // thinking as an inherent capability — default it on when switching to them.
    const isAdaptiveThinking =
      modelDef.adaptiveThinking === true && modelDef.thinking;

    if (isThinkingAlwaysOn && !settings.thinkingEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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

      // Reconcile generatingConversationIds with DB-persisted flags — both
      // directions. Adding covers page refresh mid-generation; removing covers
      // the race where a list fetch (started before a sub-agent's completion
      // write landed) re-added an id after the `complete` SSE event already
      // cleared it. Ids absent from this page of results are left untouched:
      // the fetch says nothing about them.
      const stillActiveConversationIds = new Set<string>();
      const settledConversationIds = new Set<string>();
      for (const entry of result.items) {
        const record = entry as unknown as Record<string, unknown>;
        const entryId = entry.id || String(entry._id);
        if (record.isActive === true || record.isGenerating === true) {
          stillActiveConversationIds.add(entryId);
        } else {
          settledConversationIds.add(entryId);
        }
      }
      if (stillActiveConversationIds.size > 0 || settledConversationIds.size > 0) {
        // Never remove the conversation this client is actively streaming —
        // the listing may predate the backend's markGenerating(true) write
        // (the handleSend → change-stream stale window).
        const streamingConversationId = isGeneratingRef.current
          ? conversationIdRef.current
          : null;
        setGeneratingConversationIds((previousIds) => {
          const next = new Set(previousIds);
          for (const conversationId of stillActiveConversationIds) next.add(conversationId);
          for (const conversationId of settledConversationIds) {
            if (conversationId === streamingConversationId) continue;
            next.delete(conversationId);
          }
          return next;
        });
      }

      conversationsCursorRef.current = result.nextCursor;
      setConversationsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, [agentProject, agentId, isNoAgent]);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  loadConversationsRef.current = loadConversations;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- agentId is read at call time; reloads are triggered explicitly on agent switch
  }, [agentProject, isNoAgent, conversationsLoading]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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

        const displayMessages = resolveDisplayMessages(full);
        console.debug(
          `[URL conversation load] id=${initialConversationId}, displayMessages=${displayMessages.length}`,
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
          const urlThinkingEnabled = urlLoadConversationSettings?.thinkingEnabled;
          if (urlThinkingEnabled !== undefined) {
            nextSettings.thinkingEnabled = Boolean(urlThinkingEnabled);
          }
          const urlThinkingBudget = urlLoadConversationSettings?.thinkingBudget;
          if (urlThinkingBudget !== undefined) {
            nextSettings.thinkingBudget = String(urlThinkingBudget);
          }
          const urlThinkingLevel = urlLoadConversationSettings?.thinkingLevel as string | undefined;
          if (urlThinkingLevel) {
            nextSettings.thinkingLevel = urlThinkingLevel;
          }
          const urlReasoningEffort = urlLoadConversationSettings?.reasoningEffort as string | undefined;
          if (urlReasoningEffort) {
            nextSettings.reasoningEffort = urlReasoningEffort;
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
        const persistedRecursionDepth = urlLoadConversationSettings?.maxRecursionDepth;
        if (typeof persistedRecursionDepth === "number" && [0, 1, 2, 3].includes(persistedRecursionDepth)) {
          setMaxRecursionDepth(persistedRecursionDepth);
        }

        setBackendConversationStats(full.stats || null);
        setIsBackendStatsStale(false);
        tokenHwmRef.current = { input: 0, output: 0, total: 0 };

        // Hydrate persisted context budget from the conversation document
        setContextBudget(extractPersistedContextBudget(full));
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
      | { availableTools?: string[]; disabledTools?: string[]; dynamicEnabledTools?: string[] }
      | undefined
      ?? null;
  }, [isAdmin, activeId, conversations]);

  // Admin: load agent-specific data (tools, skills, memories, rules) for selected conversation
  useEffect(() => {
    if (!isAdmin) return;
    if (!adminTargetAgentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
        .then((tools: ToolSchema[]) => {
          setBuiltInTools(tools);
        })
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
      const parameters: Record<string, string | number | boolean> = {
        page: 1,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (adminTraceFilter) {
        parameters.trace = adminTraceFilter;
      } else {
        Object.assign(parameters, buildDateRangeParams(adminDateRange));
        if (adminProjectFilter) parameters.project = adminProjectFilter;
      }
      if (adminProviderFilter) parameters.provider = adminProviderFilter;
      if (adminModelFilter) parameters.model = adminModelFilter;

      if (adminIsNoAgent) {
        parameters.type = "direct";
      } else if (adminIsAgentMode) {
        parameters.agent = adminActiveAgentId;
      }

      const data = await IrisService.getConversations(parameters);
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
        // eslint-disable-next-line react-hooks/immutability -- existing mutation pattern outside render tracking; restructuring risks behavior change
        adminSelectEntry(list[0].id || "", list[0]._source || "conversation");
      }

      setAdminError((previousError) => (previousError !== null ? null : previousError));
    } catch (error) {
      setAdminError(getErrorMessage(error));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- adminSelectEntry is invoked imperatively; keeping identity stable avoids effect churn
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
      const parameters: Record<string, string | number | boolean> = {
        page: nextPage,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (adminTraceFilter) {
        parameters.trace = adminTraceFilter;
      } else {
        Object.assign(parameters, buildDateRangeParams(adminDateRange));
        if (adminProjectFilter) parameters.project = adminProjectFilter;
      }
      if (adminProviderFilter) parameters.provider = adminProviderFilter;
      if (adminModelFilter) parameters.model = adminModelFilter;

      if (adminIsNoAgent) {
        parameters.type = "direct";
      } else if (adminIsAgentMode) {
        parameters.agent = adminActiveAgentId;
      }

      const data = await IrisService.getConversations(parameters);
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
  // Admin: upsert a freshly-fetched document into `conversations`. The
  // live-stream gate (isConversationRunning / isActiveConversationSubAgent)
  // derives from this entry's isActive/parentAgentConversationId, so it must
  // track the latest fetch — an insert-only snapshot would freeze the gate
  // in whatever state the conversation had when first selected.
  const adminUpsertConversationEntry = useCallback(
    (fullEntry: AgentConversation | Conversation) => {
      if (!fullEntry?.id) return;
      setConversations((previousConversations) => {
        const exists = previousConversations.some(
          (entry) => entry.id === fullEntry.id,
        );
        if (!exists) return [fullEntry, ...previousConversations];
        return previousConversations.map((entry) =>
          entry.id === fullEntry.id ? { ...entry, ...fullEntry } : entry,
        );
      });
    },
    [],
  );

  const adminSelectEntry = useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
    async (id: string, source: "conversation" | "agent_conversation" = "conversation") => {
      if (!isAdmin || id === activeId) return;
      setActiveId(id);
      setAdminSelectedSource(source);

      // Update URL for deep-linking
      const parameters = new URLSearchParams();
      if (adminAgentParam) parameters.set("agent", adminAgentParam);
      if (adminTraceFilter) parameters.set("trace", adminTraceFilter);
      if (adminProjectFilter) parameters.set("project", adminProjectFilter);
      if (adminProviderFilter) parameters.set("provider", adminProviderFilter);
      if (adminModelFilter) parameters.set("model", adminModelFilter);

      const queryString = parameters.toString();
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
        const displayMessages = resolveDisplayMessages(fullEntry);
        setMessages(displayMessages);
        setConversationId(fullEntry.id || generateUUID());
        setTitle(fullEntry.title || "Untitled");
        setBackendConversationStats(fullEntry.stats || null);
        // Hydrate the persisted context budget so the read-only budget
        // indicator renders for the viewed conversation.
        setContextBudget(extractPersistedContextBudget(fullEntry));
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
        adminUpsertConversationEntry(fullEntry as AgentConversation | Conversation);
      } catch {
        setMessages([]);
      } finally {
        setAdminLoadingDetail(false);
      }
    },
    [isAdmin, activeId, adminAgentParam, adminTraceFilter, adminProjectFilter, adminProviderFilter, adminModelFilter, adminUpsertConversationEntry],
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
        // Keep the gate-driving entry (isActive etc.) in sync with the DB
        adminUpsertConversationEntry(full as AgentConversation | Conversation);
        // Budget updates never clobber streamed text — safe during streaming
        setContextBudget(extractPersistedContextBudget(full));
        // While the live WebSocket stream is actively delivering content,
        // don't clobber the partially-streamed text with a whole-document
        // snapshot — the stream's onDone does the final canonical refresh.
        // A merely-open-but-silent subscription must not block refreshes.
        if (
          !shouldApplySnapshotRefresh({
            isStreamOpen: isWebSocketStreamingRef.current,
            hasStreamedContent: webSocketHasStreamedContentRef.current,
          })
        ) {
          return;
        }
        const displayMessages = resolveDisplayMessages(full);
        setMessages(displayMessages);
        setBackendConversationStats(full.stats || null);
      } catch (error: unknown) {
        console.error("Failed to refresh selected entry:", error);
      }
    },
    [isAdmin, adminUpsertConversationEntry],
  );

  // Admin: initial detail load by ID
  useEffect(() => {
    if (!isAdmin || !initialId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setAdminLoadingDetail(true);
    IrisService.getConversation(initialId)
      .then((conversation: unknown) => {
        const conversationEntry = conversation as UnifiedEntry & { type?: string };
        const source = conversationEntry.type === "agent" ? "agent_conversation" : "conversation";
        setAdminSelectedSource(source);
        setActiveId(conversationEntry.id || initialId);
        setConversationId(conversationEntry.id || generateUUID());
        setTitle(conversationEntry.title || "Untitled");
        const displayMessages = resolveDisplayMessages(conversationEntry);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
          // Also refresh selected entry if it matches. Read the CURRENT
          // selection through refs — this subscription lives for the whole
          // admin session, so closing over activeId state would compare
          // against the selection at subscribe time (always null) and the
          // viewed conversation would never refresh.
          const currentActiveId = activeIdRef.current;
          if (event.id && event.id === currentActiveId) {
            adminRefreshSelectedEntry(
              currentActiveId,
              adminSelectedSourceRef.current,
            );
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
      const parameters = new URLSearchParams(adminSearchParams.toString());
      if (agentPickedId === "ALL") {
        parameters.delete("agent");
      } else {
        parameters.set("agent", agentPickedId);
      }
      const queryString = parameters.toString();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- effect keyed to explicit admin filters; adminHeaderContext object identity churns every render
  }, [
    isAdmin,
    adminProjectFilter,
    adminProjectOptions,
    adminHandleProjectChange,
    adminGeneratingCount,
    adminError,
    adminTraceFilter,
  ]);  

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
    const hasNativeThinking = !!(
      activeModelDefinition?.thinking ||
      activeModelDefinition?.supportsThinking ||
      (Array.isArray(activeModelDefinition?.thinkingLevels) && (activeModelDefinition.thinkingLevels as string[]).length > 0) ||
      (Array.isArray(activeModelDefinition?.tools) && (activeModelDefinition.tools as string[]).includes("Thinking")) ||
      (settings.provider === "lm-studio" &&
        isNameBasedThinkingModel(settings.model, config))
    );
    if (hasNativeThinking) {
      lockedToolsMap.set(TOOL_NAMES.THINK, "Disabled — this model has built-in thinking/reasoning");
    }

    // Force-disable workspace tools if no workspace is set up or active workspace is down
    const workspaceIsDown = !currentWorkspace || !currentWorkspace.isAgentServed;
    if (workspaceIsDown) {
      const reason = !currentWorkspace
        ? "No workspace set up — configure one in Settings to unlock"
        : "Workspace connector is offline — make sure the connector is running and connected";
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
    if (!showRaw || isNoAgent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setPreviewSystemPrompt(null);
      return;
    }

    // For existing agent conversations (messages already sent), the DB's
    // systemPrompt is the authoritative prompt that was sent to providers.
    // Calling the preview endpoint would re-assemble from scratch AND inject
    // the stored prompt as "User System Instruction", causing duplication.
    // Only call the preview for NEW conversations where no agent turn has
    // happened yet and we need to show what the prompt WILL look like.
    if (messages.length > 0 && settings.systemPrompt) {
      setPreviewSystemPrompt(null);
      return;
    }

    const debounceTimer = setTimeout(() => {
      const allDisabledTools = [...disabledTools, ...lockedOffTools.keys()];
      PrismService.previewSystemPrompt({
        agent: agentId || undefined,
        disabledTools: allDisabledTools,
        workspaceEnabled: settings.agents?.workspaceEnabled !== false,
        locale: settings.agents?.locale || undefined,
        model: settings.model || undefined,
      })
        .then((result) => {
          setPreviewSystemPrompt(result.prompt);
          if (result.baselineBudget) {
            setContextBudget(result.baselineBudget);
          }
        })
        .catch((error: unknown) => {
          console.error("[SystemPromptPreview] Failed to fetch preview:", error);
          setPreviewSystemPrompt(null);
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [
    showRaw,
    isNoAgent,
    agentId,
    messages.length,
    disabledTools,
    lockedOffTools,
    settings.agents?.workspaceEnabled,
    settings.agents?.locale,
    settings.systemPrompt,
    settings.model,
  ]);

  // -- Baseline context budget for new conversations -----------------
  // When no messages exist yet, fetch the baseline budget so the user
  // can see how much of the context window is consumed by the system
  // prompt, tool schemas, and locale before sending a message.
  // This runs independently of showRaw (the prompt preview effect above
  // handles its own baseline call when Raw view is active).
  useEffect(() => {
    if (messages.length > 0 || isNoAgent || showRaw) return;
    if (!settings.provider || !settings.model) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setContextBudget(null);
      return;
    }

    const debounceTimer = setTimeout(() => {
      const allDisabledTools = [...disabledTools, ...lockedOffTools.keys()];
      PrismService.previewSystemPrompt({
        agent: agentId || undefined,
        disabledTools: allDisabledTools,
        workspaceEnabled: settings.agents?.workspaceEnabled !== false,
        locale: settings.agents?.locale || undefined,
        model: settings.model || undefined,
      })
        .then((result) => {
          if (result.baselineBudget) {
            setContextBudget(result.baselineBudget);
          }
        })
        .catch((error: unknown) => {
          console.error("[BaselineBudget] Failed to fetch estimate:", error);
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [
    messages.length,
    isNoAgent,
    showRaw,
    agentId,
    disabledTools,
    lockedOffTools,
    settings.agents?.workspaceEnabled,
    settings.agents?.locale,
    settings.systemPrompt,
    settings.model,
    settings.provider,
  ]);

  // -- Eager-fetch tab badge counts (fires on mount / conversation change) --

  useEffect(() => {
    if (isAdmin) return;
    PrismService.getAgentMemories(agentProject, 1, agentId)
      .then((result) => setTotalMemoriesCount(result.total || 0))
      .catch(() => {});
    PrismService.getWorkflowMemories(agentProject, 1, agentId)
      .then((result) => setWorkflowMemoriesCount(result.total || 0))
      .catch(() => {});
  }, [agentProject, agentId, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    ToolsApiService.getAllAgenticTasks({ conversationId })
      .then((result) => setTasksCount(result.summary?.total || (result.tasks || []).length))
      .catch(() => {});
  }, [conversationId, tasksRefreshKey, isAdmin]);

  useEffect(() => {
    if (isAdmin || !agentProject) return;
    ToolsApiService.queryDatastore(agentProject)
      .then((result) =>
        setDatastoreCount(
          (result.namespaces || []).reduce(
            (sum, namespaceInfo) => sum + namespaceInfo.count,
            0,
          ),
        ),
      )
      .catch(() => {});
  }, [agentProject, datastoreRefreshKey, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    PrismService.getCoordinatorSubAgents(conversationId)
      .then((result) => {
        const subAgentsList = result.subAgents || [];
        setSubAgentsCount(subAgentsList.length);
        setMaxSubAgentDepth(
          subAgentsList.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
        );
        setSubAgentToolActivity((previousSubAgentToolActivity) => {
          const nextSubAgentToolActivity = { ...previousSubAgentToolActivity };
          for (const subAgent of subAgentsList) {
            const agentId = subAgent.agentId || subAgent.id;
            if (agentId && !nextSubAgentToolActivity[agentId]) {
              nextSubAgentToolActivity[agentId] = {
                toolCount: subAgent.toolCallCount || 0,
                currentTool: null,
                iteration: 0,
                toolNames: subAgent.toolNames || {},
                description: subAgent.description,
                phase: normalizeSubAgentStatusToPhase(subAgent.status),
                conversationId: subAgent.id || undefined,
              };
            }
          }
          return nextSubAgentToolActivity;
        });
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
  } = useConversationStats(messages, {
    modelNames: backendConversationStats?.models,
    providers: backendConversationStats?.providers,
    totalCost: backendConversationStats?.totalCost,
    inputTokens: backendConversationStats?.totalInputTokens,
    outputTokens: backendConversationStats?.totalOutputTokens,
    toolCounts: backendConversationStats?.toolCounts,
    modalities: backendConversationStats?.modalities,
    totalElapsedTime: backendConversationStats?.totalElapsedTime,
    requestCount: backendConversationStats?.requestCount,
  } as any);

  // -- Live-patch sidebar conversation metadata ------------------
  // Keep the active conversation's entry in `conversations[]` in sync with the
  // live stats derived from messages so the HistoryPanel badges
  // (model, provider, modalities, cost) update in real-time during
  // generation — no full loadConversations() round-trip needed.
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- agent-status effect keyed to explicit triggers; messages/isNoAgent read as snapshots
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

  const configurableTools = useMemo(() => {
    return builtInTools.filter((tool) => tool.system !== true);
  }, [builtInTools]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLeftTab("settings");
    }
  }, [leftTab, isWorkspaceTabVisible]);

  // Keep the Workspace toggle in sync with live workspace availability while
  // the conversation is still new (settings unlocked): a disconnect flips it
  // off, a reconnect restores the user's persisted preference. The persisted
  // preference itself is only written by explicit user toggles.
  useEffect(() => {
    if (!workspacesLoaded || isNoAgent || messages.length > 0) return;
    const workspaceAvailable = workspaces.length > 0;
    const workspaceToggledOn = settings.agents?.workspaceEnabled !== false;
    if (!workspaceAvailable && workspaceToggledOn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setSettings((state) => ({
        ...state,
        agents: { ...state.agents, workspaceEnabled: false },
      }));
    } else if (workspaceAvailable && !workspaceToggledOn) {
      const persistedWorkspaceToggle = localStorage.getItem(
        LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE,
      );
      if (persistedWorkspaceToggle !== "false") {
        setSettings((state) => ({
          ...state,
          agents: { ...state.agents, workspaceEnabled: true },
        }));
      }
    }
  }, [
    workspacesLoaded,
    workspaces.length,
    isNoAgent,
    messages.length,
    settings.agents?.workspaceEnabled,
  ]);

  useEffect(() => {
    if (leftTab === "subAgents" && !hasOrchestratorTools) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
      setDraftInputLength(value.length);
      window.dispatchEvent(new CustomEvent(EVENT_NAME_USER_TYPING));
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
    setDraftInputLength(text.length);
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
        setDraftInputLength(inputValueRef.current.length);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setKnownPaths(undefined);
    // Re-fetch immediately so knownPaths is available for badge staleness
    ensureMentionCache();
  }, [workspaceTreeRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eagerly populate knownPaths on mount so message list badges can
  // detect staleness without waiting for the user to type @.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
  const detectMentionQueryRef = useRef<((_element: HTMLDivElement) => void) | null>(
    detectMentionQuery,
  );
  // eslint-disable-next-line react-hooks/immutability, react-hooks/refs -- see rule docs; compiler-prep lints, React Compiler not enabled
  detectMentionQueryRef.current = detectMentionQuery;

  const mentionResults = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
    if (!mentionOpen || !mentionCacheRef.current) return [];
    // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
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
  // MIME → modality classification with an extension fallback for the
  // odd/empty MIME types browsers report for code and config files
  // (see utils/fileIntake). Returns the modality plus the effective
  // MIME type — normalized from the fallback table when the browser's
  // was generic — or null when the active model can't take the file.
  const classifyFileModality = useCallback(
    (file: { name: string; type: string }) => {
      const classification = classifyIntakeFile(file.name, file.type);
      if (!classification) return null;
      // Text/code files are universally supported — the server inlines
      // them as plain text for every provider, so they bypass the
      // model-modality gate. Binary media (images/audio/video/pdf and
      // office documents) still require the modality.
      if (
        !supportedInputModalities.has(classification.modality) &&
        !isUniversallyReadableMime(classification.mimeType)
      ) {
        return null;
      }
      return classification;
    },
    [supportedInputModalities],
  );

  const routeFileToState = useCallback(
    (file: globalThis.File, modality: string, mimeType: string) => {
      const reader = new FileReader();
      reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
        if (!readerEvent.target?.result) return;
        // Rewrite generic data-URL MIMEs (application/octet-stream,
        // empty) to the effective type — the server upload allowlist
        // blocks octet-stream by design and relies on the client
        // normalizing. The original filename rides on the attachment.
        const dataUrl = normalizeDataUrlMimeType(
          readerEvent.target.result as string,
          mimeType,
        );

        if (modality === "image") {
          setPendingImages((previous) => [...previous, dataUrl]);
        } else {
          setPendingFiles((previous) => [
            ...previous,
            { name: file.name, mimeType, dataUrl, modality },
          ]);
        }
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  // Single validated intake path for every attachment source (picker,
  // drag-drop, paste). Rejections always surface a toast — files are
  // never silently dropped.
  const intakeFiles = useCallback(
    (incomingFiles: globalThis.File[]) => {
      // Running total so a single multi-file drop can't blow past the
      // attachment cap before React state catches up.
      let totalAttachments =
        pendingImagesRef.current.length + pendingFilesRef.current.length;
      for (const file of incomingFiles) {
        const classification = classifyFileModality(file);
        if (!classification) {
          addToast(
            `"${file.name}" isn't supported by the current model (supports: ${attachmentKindsLabel})`,
            "warning",
          );
          continue;
        }
        const { modality, mimeType } = classification;
        const byteLimit =
          modality === "image"
            ? MAX_IMAGE_ATTACHMENT_BYTES
            : MAX_FILE_ATTACHMENT_BYTES;
        if (file.size > byteLimit) {
          addToast(
            `"${file.name}" is too large (${formatByteLimit(file.size)}) — the limit is ${formatByteLimit(byteLimit)} per ${modality === "image" ? "image" : "file"}`,
            "warning",
          );
          continue;
        }
        if (totalAttachments >= MAX_ATTACHMENTS_PER_MESSAGE) {
          addToast(
            `"${file.name}" not attached — a message can have at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`,
            "warning",
          );
          continue;
        }
        totalAttachments++;
        routeFileToState(file, modality, mimeType);
      }
    },
    [classifyFileModality, attachmentKindsLabel, addToast, routeFileToState],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      intakeFiles(files);
      e.target.value = "";
    },
    [intakeFiles],
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
      intakeFiles(files);
    },
    [supportsAnyFileInput, intakeFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (!supportsAnyFileInput) return;
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is globalThis.File => file !== null);
      if (files.length === 0) return;
      e.preventDefault();
      intakeFiles(files);
    },
    [supportsAnyFileInput, intakeFiles],
  );

  // -- Orchestration loop ---------------------------------------
  const runOrchestrationLoop = useCallback(
    async (
      conversationMessages: ClientMessage[],
      activeRuleNames: string[] = [],
    ) => {
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
                        role: MESSAGE_ROLES.SYSTEM,
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
              // Title is derived server-side (ChatRoutes) — send only meta
              // the server can't derive itself.
              ...(settings.systemPrompt
                ? { conversationMeta: { systemPrompt: settings.systemPrompt } }
                : {}),
              // Omit project — falls back to x-project header ("prism"),
              // routing to the conversations collection
              traceId,
            }
          : {
              // Agent mode: full /agent endpoint with AgenticLoopService.
              // No system placeholder — the harness assembles the system
              // prompt server-side and feeds it to providers as a
              // first-class parameter, never via the messages array.
              provider: settings.provider ?? "",
              model: settings.model ?? "",
              messages: currentMessages,
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
              project: agentProject,
              conversationId,
              traceId,
              agent: agentId,
              ...(activeRuleNames.length > 0 && { activeRuleNames }),
              // Send only explicit user overrides — the server owns the
              // defaults (harness "standard", minContextLength, agent).
              ...(settings?.agents?.harness && {
                harness: settings.agents.harness,
              }),
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
        const audioRefs: string[] = []; // one entry per audio segment — mirrors message.audio
        const imageRefs: string[] = []; // one entry per image segment — mirrors message.images
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
        // Unified handler for both tool-event pipelines: agentic
        // `tool_execution` envelopes and LM Studio native MCP `toolCall`
        // events. Owns activity/message state updates, segment tracking,
        // and the panel-refresh side effects.
        const handleToolEvent = (
          toolInput: {
            id?: string;
            name?: string;
            args?: Record<string, unknown>;
            result?: unknown;
            status: string;
            durationMs?: number;
            timestamp?: number;
          },
          { toolEmoji, logLabel }: { toolEmoji?: string; logLabel: string },
        ) => {
          if (toolEmoji && toolInput.name) cacheToolEmoji(toolInput.name, toolEmoji);
          const resolvedId = toolInput.id || `tc-${Date.now()}-${Math.random()}`;
          console.debug(
            `[${logLabel}] ${toolInput.status} ${toolInput.name} id=${resolvedId}`,
          );

          setToolActivity((previousToolActivity: ToolCallEvent[]) => {
            const next = applyToolExecutionToActivity(
              previousToolActivity,
              resolvedId,
              toolInput,
            );
            return next ?? previousToolActivity;
          });

          // Track segment ordering: group consecutive tool events
          // Guard: only add to segments if not already tracked
          if (toolInput.status === "streaming" || toolInput.status === "calling") {
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
          const snapshot = {
            contentSegments: snapshotSegments(),
            textFragments: [...textFragments],
            thinkingFragments: [...thinkingFragments],
          };

          setMessages(
            (msgPrev: ClientMessage[]) =>
              applyToolExecutionToMessages(
                msgPrev,
                resolvedId,
                toolInput,
                snapshot,
              ) as ClientMessage[],
          );

          // Auto-refresh tasks panel when any task tool completes
          if (
            toolInput.status !== "calling" &&
            toolInput.name &&
            toolInput.name.includes("_task")
          ) {
            setTasksRefreshKey((k) => k + 1);
          }

          // Auto-refresh datastore panel when any datastore tool completes
          if (
            toolInput.status !== "calling" &&
            toolInput.name &&
            toolInput.name.includes("_datastore")
          ) {
            setDatastoreRefreshKey((k) => k + 1);
          }

          // Increment scheduled task notification badge when agent creates a cron job
          if (
            toolInput.status === "done" &&
            toolInput.name === TOOL_NAMES.CREATE_CRON_JOB
          ) {
            const currentNotificationCount = parseInt(
              localStorage.getItem(LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT) || "0",
              10,
            );
            localStorage.setItem(
              LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT,
              String(currentNotificationCount + 1),
            );
            window.dispatchEvent(new CustomEvent(EVENT_NAME_CRON_JOB_SCHEDULED));
          }

          // Auto-refresh memories panel when save_memory completes
          if (
            toolInput.status !== "calling" &&
            toolInput.name === TOOL_NAMES.SAVE_MEMORY
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
            toolInput.status !== "calling" &&
            WORKSPACE_FS_TOOLS.has(toolInput.name || "")
          ) {
            setWorkspaceTreeRefreshKey((k) => k + 1);

            // Live-update file viewer: refresh open tabs whose path was touched
            const mutatedPath =
              (toolInput.args?.path as string) ||
              (toolInput.args?.source as string) ||
              null;
            const openFiles = viewerOpenFilesRef.current;
            if (mutatedPath && openFiles.length > 0) {
              // delete_file and move_file both remove the source path
              if (
                toolInput.name === TOOL_NAMES.DELETE_FILE ||
                toolInput.name === TOOL_NAMES.MOVE_FILE
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
        };

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
                  role: MESSAGE_ROLES.ASSISTANT,
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
                  role: MESSAGE_ROLES.ASSISTANT,
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
            // Track segment ordering so images render inline at their true
            // position (matching the backend's post-stream displayMessages)
            if (!imageRefs.includes(imgRef)) {
              contentSegments.push({
                type: "image",
                fragmentIndex: imageRefs.length,
              });
              imageRefs.push(imgRef);
              lastSegmentType = "image";
            }
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  images: [...imageRefs],
                  contentSegments: snapshotSegments(),
                };
              } else {
                updated.push({
                  role: MESSAGE_ROLES.ASSISTANT,
                  content: "",
                  images: [...imageRefs],
                  contentSegments: snapshotSegments(),
                });
              }
              return updated;
            });
          },
          onAudio: (dataString: string, _mimeType: string) => {
            if (isStale()) return;
            if (!dataString) return;
            // Track segment ordering so audio players render inline at their
            // true position (matching the backend's post-stream displayMessages)
            if (!audioRefs.includes(dataString)) {
              contentSegments.push({
                type: "audio",
                fragmentIndex: audioRefs.length,
              });
              audioRefs.push(dataString);
              lastSegmentType = "audio";
            }
            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  audio: [...audioRefs],
                  contentSegments: snapshotSegments(),
                };
              } else {
                updated.push({
                  role: MESSAGE_ROLES.ASSISTANT,
                  content: "",
                  audio: [...audioRefs],
                  contentSegments: snapshotSegments(),
                });
              }
              return updated;
            });
          },
          onToolExecution: (data: SSEData) => {
            if (isStale()) return;
            const toolData = data.tool;
            if (!toolData) return;
            handleToolEvent(
              {
                id: toolData.id,
                name: toolData.name,
                args: toolData.args,
                status: data.status as string,
                result: toolData.result,
                durationMs: toolData.durationMs,
                timestamp: data.timestamp as number | undefined,
              },
              {
                toolEmoji: data.toolEmoji as string | undefined,
                logLabel: "ToolExec",
              },
            );
          },
          // LM Studio native MCP tool calls (toolCall events)
          onToolCall: (toolCall: ToolCallEvent) => {
            if (isStale()) return;
            handleToolEvent(
              {
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.args,
                status: (toolCall.status as string) || "",
                result: toolCall.result,
                durationMs: toolCall.durationMs,
              },
              { logLabel: "ToolCall MCP" },
            );
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
                status: EXECUTION_STATUS.PENDING,
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
              // Clear the elapsed offset once live SSE events start flowing —
              // the StatusBar's own timer is now tracking real-time progress.
              setStatusBarInitialElapsedMilliseconds(null);
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
                    role: MESSAGE_ROLES.ASSISTANT,
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
                      // Server emits `tokPerSec`; accept the legacy alias too.
                      tokensPerSecond:
                        (statusData as any).tokPerSec ??
                        (statusData as any).tokensPerSecond,
                      activeRequests: (statusData as any).activeRequests,
                      outputTokens: (statusData as any).outputTokens,
                      inputTokens: (statusData as any).inputTokens,
                      totalTokens: (statusData as any).totalTokens,
                      avgTtft: (statusData as any).avgTtft,
                      // Live server-estimated cost — monotonic per turn (server
                      // emits a high-water mark). Keep the previous value when a
                      // frame arrives without one.
                      estimatedCost:
                        (statusData as any).estimatedCost ??
                        last._liveGenProgress?.estimatedCost,
                      timestamp: performance.now(),
                    },
                  };
                }
                return updated;
              });
            } else if (
              statusData?.message === STATUS_MESSAGES.ITERATION_LIMIT_REACHED ||
              statusData?.message === STATUS_MESSAGES.SEMANTIC_STALL_DETECTED ||
              statusData?.message === STATUS_MESSAGES.COST_LIMIT_REACHED ||
              statusData?.message === STATUS_MESSAGES.EMPTY_OUTPUT
            ) {
              // ── Loop termination events ──────────────────────────
              // The agentic loop terminated for a non-standard reason.
              // Surface this to the user as inline metadata on the last
              // assistant message so ChatMessageComponent renders a notice.
              const terminationLabels: Record<string, string> = {
                [STATUS_MESSAGES.ITERATION_LIMIT_REACHED]:
                  "The agent reached its maximum iteration limit before producing a final response.",
                [STATUS_MESSAGES.SEMANTIC_STALL_DETECTED]:
                  "The agent was stuck in a behavioral loop, calling the same tools repeatedly.",
                [STATUS_MESSAGES.COST_LIMIT_REACHED]:
                  "The generation was stopped because the cost limit was reached.",
                [STATUS_MESSAGES.EMPTY_OUTPUT]:
                  "The model produced an empty response with no text or tool calls.",
              };
              const terminationReason =
                terminationLabels[statusData.message as string] ||
                "The generation ended unexpectedly.";

              setMessages((previousMessages) => {
                const updatedMessages = [...previousMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                if (lastMessage?.role === "assistant") {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    _terminationReason: terminationReason,
                  };
                }
                return updatedMessages;
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
                    role: MESSAGE_ROLES.ASSISTANT,
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
              if (data.toolEmoji && toolData.name) cacheToolEmoji(toolData.name as string, data.toolEmoji as string);

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
                      durationMs: toolData.durationMs || (toolData as Record<string, unknown>).durationMilliseconds as number | undefined,
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
            // Terminal-state settle for a sub-agent's own conversation entry:
            // stop the sidebar generating dot and resolve the derived state to
            // "completed" immediately, without waiting for a list reload.
            const settleSubAgentConversation = (settledConversationId: string) => {
              setGeneratingConversationIds(
                (previousGeneratingConversationIds) => {
                  if (!previousGeneratingConversationIds.has(settledConversationId)) {
                    return previousGeneratingConversationIds;
                  }
                  const next = new Set(previousGeneratingConversationIds);
                  next.delete(settledConversationId);
                  return next;
                },
              );
              setConversations((previousConversations) =>
                previousConversations.map((entry) => {
                  if ((entry.id || String(entry._id)) !== settledConversationId) {
                    return entry;
                  }
                  return {
                    ...entry,
                    isActive: false,
                    isGenerating: false,
                    pendingBackgroundTasks: 0,
                  } as typeof entry;
                }),
              );
            };
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
                      agentIndex: typeof data.agentIndex === "number" ? data.agentIndex : null,
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
                  const existing = (wp[subAgentId] || {}) as SubAgentGenerationProgress;
                  updated[updated.length - 1] = {
                    ...last,
                    _subAgentGenerationProgress: {
                      ...wp,
                      [subAgentId]: {
                        ...existing,
                        // Burst-scoped values for tok/s computation — only update when present
                        ...((data as any).outputTokens != null && {
                          outputTokens: (data as any).outputTokens,
                        }),
                        ...((data as any).firstChunkTime != null && {
                          firstChunkTime: (data as any).firstChunkTime,
                        }),
                        ...((data as any).lastChunkTime != null && {
                          lastChunkTime: (data as any).lastChunkTime,
                        }),
                        // Cumulative total for token badge count
                        totalOutputTokens:
                          (data as any).totalOutputTokens ||
                          (data as any).outputTokens ||
                          existing.totalOutputTokens,
                        // Per-sub-agent tok/s from burst counters
                        // (server emits `tokPerSec`; accept the legacy alias)
                        tokensPerSecond:
                          (data as any).tokPerSec ??
                          (data as any).tokensPerSecond ??
                          existing.tokensPerSecond,
                        ...((data as any).inputTokens != null && {
                          inputTokens: (data as any).inputTokens,
                        }),
                        ...((data as any).totalTokens != null && {
                          totalTokens: (data as any).totalTokens,
                        }),
                        ...((data as any).avgTtft != null && { avgTtft: (data as any).avgTtft }),
                      },
                    },
                  };
                }
                return updated;
              });
              // Also store on subAgentToolActivity so TeamCreateRenderer can
              // display live per-sub-agent metrics on each sub-agent's header
              setSubAgentToolActivity((previousSubAgentToolActivity) => {
                const existing = (previousSubAgentToolActivity[subAgentId] || {
                  toolCount: 0,
                  currentTool: null,
                  iteration: 0,
                  toolNames: {},
                }) as SubAgentActivityEntry;
                return {
                  ...previousSubAgentToolActivity,
                  [subAgentId]: {
                    ...existing,
                    status: (data as any).status || existing.status,
                    iteration: (data as any).iteration || existing.iteration,
                    // Burst-scoped values for header tok/s computation
                    ...((data as any).outputTokens != null && {
                      outputTokens: (data as any).outputTokens,
                    }),
                    ...((data as any).firstChunkTime != null && {
                      firstChunkTime: (data as any).firstChunkTime,
                    }),
                    ...((data as any).lastChunkTime != null && {
                      lastChunkTime: (data as any).lastChunkTime,
                    }),
                    // Cumulative total for token badge count
                    totalOutputTokens:
                      (data as any).totalOutputTokens ||
                      (data as any).outputTokens ||
                      existing.totalOutputTokens,
                    // Per-sub-agent tok/s from burst counters
                    tokensPerSecond: (data as any).tokensPerSecond ?? existing.tokensPerSecond,
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
                // Settle the sub-agent's conversation so the sidebar dot and
                // progress bar stop. Prefer the event's conversationId (the
                // backend includes it on terminal events) — the activity-map
                // fallback only works when this client saw the "spawned" event.
                const completedConversationId =
                  (data.conversationId as string | undefined) ||
                  (previousSubAgentToolActivity[subAgentId]?.conversationId as
                    | string
                    | undefined);
                if (completedConversationId) {
                  settleSubAgentConversation(completedConversationId);
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
              // Sub-agent errored — mark as failed and settle its conversation
              // (failures previously left the sidebar dot/progress bar running).
              setSubAgentToolActivity((previousSubAgentToolActivity) => {
                const failedConversationId =
                  (data.conversationId as string | undefined) ||
                  (previousSubAgentToolActivity[subAgentId]?.conversationId as
                    | string
                    | undefined);
                if (failedConversationId) {
                  settleSubAgentConversation(failedConversationId);
                }
                return {
                  ...previousSubAgentToolActivity,
                  [subAgentId]: {
                    ...(previousSubAgentToolActivity[subAgentId] || {}),
                    phase: "failed",
                    currentTool: null,
                    error: data.error,
                  },
                };
              });
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
          onContextBudget: (data: SSEData) => {
            if (isStale()) return;
            setContextBudget({
              contextWindow: data.contextWindow as number,
              messageTokens: data.messageTokens as number,
              systemPromptTokens: data.systemPromptTokens as number,
              toolSchemaTokens: data.toolSchemaTokens as number,
              skillTokens: data.skillTokens !== undefined ? (data.skillTokens as number) : undefined,
              safetyMarginTokens: data.safetyMarginTokens as number,
              totalInputTokens: data.totalInputTokens as number,
              availableOutputTokens: data.availableOutputTokens as number,
              requestedOutputTokens: data.requestedOutputTokens !== undefined ? (data.requestedOutputTokens as number) : undefined,
              isClamped: data.isClamped as boolean,
              toolCount: data.toolCount as number,
              source: (data.source as "estimated" | "reported") || "estimated",
              lastReportedInputTokens: data.lastReportedInputTokens !== undefined ? (data.lastReportedInputTokens as number) : undefined,
              calibrationRatio: data.calibrationRatio !== undefined ? (data.calibrationRatio as number) : undefined,
            });
          },
          onTaskNotification: (data: SSEData) => {
            console.debug(`[onTaskNotification] received, isStale=${isStale()}`);
            if (isStale()) return;

            // ── Finalize current assistant message + inject notification ──
            // The auto-response will stream new chunks into a fresh
            // assistant message. Reset local streaming accumulators so the
            // new content doesn't merge with the previous agent's output.
            streamedText = "";
            streamedThinking = "";
            contentSegments.length = 0;
            textFragments.length = 0;
            thinkingFragments.length = 0;
            segmentToolIdSet.clear();
            lastSegmentType = null;
            prevCleanLen = 0;
            prevThinkingLen = 0;
            firstChunkTime = undefined;
            prevChunkTime = null;
            burstTokens = 0;
            burstElapsed = 0;

            setMessages((previousMessages) => {
              const updated = [...previousMessages];
              const lastIndex = updated.length - 1;
              const lastMessage = updated[lastIndex];

              // Finalize the current assistant message if present
              if (lastMessage?.role === "assistant" && !lastMessage.completedAt) {
                updated[lastIndex] = {
                  ...lastMessage,
                  completedAt: new Date().toISOString(),
                };
              }

              // Inject the notification as a user-role message
              updated.push({
                role: MESSAGE_ROLES.USER,
                content: data.content as string,
                timestamp: data.timestamp as string,
                _notificationSource: data._notificationSource as string,
                _notificationId: data._notificationId as string,
              });

              // Create a new empty assistant placeholder for the auto-response
              updated.push({
                role: MESSAGE_ROLES.ASSISTANT,
                content: "",
                timestamp: new Date().toISOString(),
                provider: settings.provider,
                model: settings.model,
              });

              return updated;
            });
          },
          onConversationStateUpdate: (data: SSEData) => {
            // Patch the conversations list entry with the updated counter
            // and isActive flag so the status bar resolves correctly.
            const updatedPendingCount = (data.pendingBackgroundTasks as number) ?? 0;
            const updatedIsActive = data.isActive as boolean | undefined;
            setConversations((previousConversations) =>
              previousConversations.map((entry) => {
                if (entry.id !== conversationId) return entry;
                return {
                  ...entry,
                  pendingBackgroundTasks: updatedPendingCount,
                  ...(updatedIsActive !== undefined ? { isActive: updatedIsActive } : {}),
                } as typeof entry;
              }),
            );
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
                    thinkingDurationSeconds: (data.thinkingDurationSeconds as number | undefined),
                    contentDurationSeconds: (data.contentDurationSeconds as number | undefined),
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

              // Immediately patch the conversation entry to terminal state.
              // The SSE `done` event definitively means the backend finished —
              // clear pendingBackgroundTasks and isActive so the status bar
              // resolves on the very next render instead of waiting for the
              // async `loadConversations()` round-trip that races the re-render.
              setConversations((previousConversations) =>
                previousConversations.map((entry) => {
                  if (entry.id !== conversationId) return entry;
                  return {
                    ...entry,
                    pendingBackgroundTasks: 0,
                    isActive: false,
                  } as typeof entry;
                }),
              );
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
          // Transport EOF without a done/error event (server crash mid-turn,
          // proxy timeout). Classified as a network error so the catch below
          // enters recovery polling — the backend loop persists independently.
          onStreamClosed: ({ reason }) => {
            reject(new Error(`SSE network stream closed early (${reason})`));
          },
        });
      });

      return [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payload builder reads latest settings at call time; identity kept stable by design
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
  const messagesRef = useRef<ClientMessage[]>(messages);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  messagesRef.current = messages;
  const titleRef = useRef<string>(title);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  titleRef.current = title;

  const handleSend = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement> | null,
      fetchOptions: {
        isQueueing?: boolean;
        overridePayload?: {
          text: string;
          images: string[];
          files?: PendingFileAttachment[];
        } | null;
      } = {},
    ) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();

      const { isQueueing = false, overridePayload = null } = fetchOptions;

      if (isConversationRunning && !isQueueing && !overridePayload) {
        handleStop();
        return;
      }

      const text = overridePayload
        ? overridePayload.text
        : inputValueRef.current.trim();
      const currentImages = overridePayload
        ? overridePayload.images
        : [...pendingImagesRef.current];
      const currentFiles = overridePayload
        ? [...(overridePayload.files ?? [])]
        : [...pendingFilesRef.current];

      if (!text && currentImages.length === 0 && currentFiles.length === 0) return;

      if (isQueueing) {
        setQueuedNextTurn({ text, images: currentImages, files: currentFiles });
        setTextareaValue("");
        setPendingImages([]);
        setPendingFiles([]);
        return;
      }

      // Upload non-image files to MinIO BEFORE any destructive state
      // changes (clearing the input, optimistic conversation entries) so
      // a failed upload aborts the send with everything still intact —
      // the user keeps their text + attachments and can simply retry.
      let uploadedFileUrls: {
        url: string;
        name: string;
        mimeType: string;
        modality: string;
      }[] = [];
      if (currentFiles.length > 0) {
        try {
          uploadedFileUrls = await Promise.all(
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
        } catch (uploadError) {
          console.error("[handleSend] File upload to MinIO failed:", uploadError);
          if (overridePayload) {
            // The queued payload already cleared the input when it was
            // queued — put it back so nothing is lost.
            setTextareaValue(text);
            setPendingImages(currentImages);
            setPendingFiles(currentFiles);
          }
          addToast(
            `File upload failed — message not sent. ${getErrorMessage(uploadError)}`,
            "error",
          );
          return;
        }
      }

      if (!overridePayload) {
        setTextareaValue("");
        setPendingImages([]);
        setPendingFiles([]);
      }

      setIsUserExplicitlyStopped(false);
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
      // Preserve sub-agent entries that are still in non-terminal phases
      // so their progress bars remain visible while the follow-up generates.
      // Only wipe entries that already reached "complete" or "failed".
      setSubAgentToolActivity((previousSubAgentToolActivity) => {
        const terminalPhases = new Set(["complete", "completed", "failed", "stopped"]);
        const preserved: Record<string, SubAgentActivityEntry> = {};
        for (const [id, entry] of Object.entries(previousSubAgentToolActivity)) {
          if (!entry.phase || !terminalPhases.has(entry.phase)) {
            preserved[id] = entry;
          }
        }
        return preserved;
      });
      setStreamingOutputs(new Map());
      setPendingApprovals([]);
      setPendingUserQuestion(null);
      setPlanProposal(null);
      setAgenticProgress(null);
      setStatusBarInitialElapsedMilliseconds(null);
      setInjectedSkills([]);
      setContextTruncated(null);

      const currentMessages = messagesRef.current;
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
        window.dispatchEvent(
          new CustomEvent(EVENT_NAME_CONVERSATION_CHANGE, {
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
      const inlineActiveRuleNames = textareaRef.current
        ? extractSlashCommandNames(textareaRef.current)
        : new Set<string>();
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

      const userMessage = {
        role: MESSAGE_ROLES.USER,
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
          role: MESSAGE_ROLES.ASSISTANT,
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
        await runOrchestrationLoop(updatedMessages, turnActiveRuleNames);
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
            if (full && (full.displayMessages || full.messages) && conversationIdRef.current === genId) {
              const displayMessages = resolveDisplayMessages(full);
              const currentCount = messagesRef.current.length;
              console.debug(
                `[PostStream setMessages] attempt=${attempt} display=${displayMessages.length}, currentStreaming=${currentCount}`,
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
        const errorMessage = getErrorMessage(error);
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
                  (recoveredConversation.displayMessages || recoveredConversation.messages) &&
                  conversationIdRef.current === genId
                ) {
                  const displayMessages = resolveDisplayMessages(recoveredConversation);
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
              role: MESSAGE_ROLES.ASSISTANT,
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

          // Force all active sub-agents to terminal state. The SSE stream
          // may close before all "complete" events arrive (e.g. non-blocking
          // dispatch), leaving stale non-terminal entries that keep
          // hasNonTerminalSubAgents true and the status bar stuck.
          setSubAgentToolActivity((previousSubAgentToolActivity) => {
            const terminalPhases = new Set(["complete", "completed", "failed", "stopped"]);
            const hasActiveSubAgent = Object.values(previousSubAgentToolActivity).some(
              (subAgent: SubAgentActivityEntry) =>
                !subAgent.phase || !terminalPhases.has(subAgent.phase),
            );
            if (!hasActiveSubAgent) return previousSubAgentToolActivity;
            const nextSubAgentToolActivity: Record<string, SubAgentActivityEntry> = {};
            for (const [id, subAgent] of Object.entries(previousSubAgentToolActivity)) {
              nextSubAgentToolActivity[id] =
                !subAgent.phase || !terminalPhases.has(subAgent.phase)
                  ? { ...subAgent, phase: "complete", currentTool: null }
                  : subAgent;
            }
            return nextSubAgentToolActivity;
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
      setTextareaValue,
      runOrchestrationLoop,
      loadConversations,
      addToast,
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
        if (isConversationRunning) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isConversationRunning read as call-time snapshot by design
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
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
    setContextBudget(null);
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

    setSettings((currentSettings) =>
      buildResetConversationSettings(config, currentSettings, isNoAgent),
    );

    // Clear conversation from URL
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME_CONVERSATION_CHANGE, {
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

      // Hydrate persisted context budget from the conversation document,
      // or clear if the conversation has no budget data.
      setContextBudget(extractPersistedContextBudget(full));

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
          new CustomEvent(EVENT_NAME_CONVERSATION_CHANGE, {
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
        setIsUserExplicitlyStopped(false);
        setIsGenerating(true);
        // Remove the snapshot — the SSE callbacks will resume updating React state
        // now that conversationIdRef matches again (isStale() → false)
        backgroundConversationsRef.current.delete(full.id || "");
      } else {
        // Normal backend-loaded conversation
        const displayMessages = resolveDisplayMessages(full);
        console.debug(
          `[Conversation switch] id=${full.id}, displayMessages=${displayMessages.length}`,
        );
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
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
        // Passive DB load — no active SSE connection for this generation
        isClientDrivenGenerationRef.current = false;

        // Hydrate StatusBar state from the backend's live status registry
        // so the progress bar, phase, and iteration resume at the correct
        // position after a conversation switch or page refresh.
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
            const hydratedSubAgentActivity: Record<string, any> = {};
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
                status: EXECUTION_STATUS.PENDING,
              });
            }
          } else if (pendingApprovalData.toolCalls) {
            setPendingApprovals(
              pendingApprovalData.toolCalls.map((toolCall) => ({
                id: toolCall.id || `ap-${Date.now()}`,
                toolName: toolCall.name || "",
                toolArgs: toolCall.args || {},
                tier: toolCall._approval?.tier,
                status: EXECUTION_STATUS.PENDING,
              })),
            );
          } else if (pendingApprovalData.tools) {
            setPendingApprovals(
              pendingApprovalData.tools.map((toolName: string) => ({
                id: `ap-${Date.now()}`,
                toolName: toolName,
                toolArgs: {},
                status: EXECUTION_STATUS.PENDING,
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
          new CustomEvent(EVENT_NAME_CONVERSATION_CHANGE, {
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
        // Conversations without toolConfig default to all tools disabled.
        const conversationToolConfig = (conversationSettings as Record<string, unknown>)?.toolConfig as
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
        const freshConversationRecord = full as unknown as Record<string, unknown>;
        const freshIsActive = freshConversationRecord.isActive as boolean | undefined;
        const freshPendingBackgroundTasks = freshConversationRecord.pendingBackgroundTasks as number | undefined;
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
      }
    },
    [workspaces, currentWorkspace?.path, setCurrentWorkspace, restoreDisabledTools, resetToAllDisabled, enableSpecificTools],
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
          getErrorMessage(error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stats builder reads latest tool state at call time; identity kept stable by design
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
    if (isClientDrivenGenerationRef.current || isWebSocketStreamingRef.current) return;
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
  }, [
    activeId,
    isActiveConversationSubAgent,
    isConversationRunning,
    isNoAgent,
    agentProject,
    applyConversationData,
  ]);

  // ── Live WebSocket stream for viewed sub-agent conversations ──────
  // When the user navigates directly to a sub-agent conversation that
  // is still actively running, open a WebSocket subscription to receive
  // the raw SSE events (chunk, thinking, tool_execution, tool_output,
  // status, done) that the sub-agent's agentic loop emits. This makes
  // the conversation stream live — text appears as it's generated,
  // thinking blocks expand, and tool activity renders in real-time.
  //
  // The backend's SubAgentTelemetryEmitter broadcasts these events to
  // any WebSocket subscriber registered for the sub-agent's own
  // conversationId via WebSocketConnectionRegistry.
  // Admin's subscription is always-on for the viewed conversation, so its
  // gate must not depend on the (change-stream-lagged) running flag — a
  // constant here keeps the effect from tearing the socket down mid-turn
  // every time the persisted flag flips.
  const liveStreamConversationRunning = isAdmin ? false : isConversationRunning;

  useEffect(() => {
    if (!activeId) return;
    if (
      !shouldOpenSubAgentLiveStream({
        activeConversationId: activeId,
        isSubAgentConversation: isActiveConversationSubAgent,
        isClientDrivenGeneration: isClientDrivenGenerationRef.current,
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
    isClientDrivenGenerationRef.current = true;

    // Mutable streaming state (avoids stale closures in callbacks).
    // Seeds ONLY from a trailing in-flight assistant bubble (joining a
    // generation already mid-stream) — see seedStreamAccumulators.
    const seeded = seedStreamAccumulators(messagesRef.current);
    let streamedText = seeded.streamedText;
    let streamedThinking = seeded.streamedThinking;
    let isSubscriptionActive = true;

    // Non-admin (viewed sub-agent): the gate guarantees a generation is
    // running, so show the active state immediately. Admin: the always-on
    // subscription is mostly idle — the flag raises lazily when events
    // actually arrive (markStreamDelivering) and clears on done.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (!isAdmin) setIsGenerating(true);

    // An event just arrived — this stream owns `messages` until done.
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

    const cleanupWebSocket = PrismService.subscribeToAutoResponse(activeId, {
      onUserMessage: (data: SSEData) => {
        if (!isSubscriptionActive) return;
        // A new turn started: reset the accumulators and render the user's
        // prompt immediately — it is only persisted at finalize, so no
        // snapshot refresh can show it until the turn ends.
        markStreamDelivering();
        streamedText = "";
        streamedThinking = "";
        const userMessageContent = (data.content as string) || "";
        if (!userMessageContent) return;
        setMessages((previousMessages) => {
          const lastMessage = previousMessages[previousMessages.length - 1];
          if (
            lastMessage?.role === "user" &&
            lastMessage.content === userMessageContent
          ) {
            return previousMessages; // already present (e.g. snapshot race)
          }
          return [
            ...previousMessages,
            {
              role: MESSAGE_ROLES.USER,
              content: userMessageContent,
              timestamp: new Date(
                (data.timestamp as number) || Date.now(),
              ).toISOString(),
            } as ClientMessage,
          ];
        });
      },

      onChunk: (content: string) => {
        if (!isSubscriptionActive) return;
        markStreamDelivering();
        streamedText += content;
        const trimmedText = streamedText.trim();

        setMessages((previousMessages) => {
          const updated = [...previousMessages];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage?.role === "assistant") {
            updated[updated.length - 1] = {
              ...lastMessage,
              content: trimmedText,
            };
          } else {
            updated.push({
              role: MESSAGE_ROLES.ASSISTANT,
              content: trimmedText,
            } as ClientMessage);
          }
          return updated;
        });
      },

      onThinking: (content: string) => {
        if (!isSubscriptionActive) return;
        markStreamDelivering();
        streamedThinking += content;

        setMessages((previousMessages) => {
          const updated = [...previousMessages];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage?.role === "assistant") {
            updated[updated.length - 1] = {
              ...lastMessage,
              thinking: streamedThinking,
              statusPhase: "thinking",
            } as ClientMessage;
          } else {
            updated.push({
              role: MESSAGE_ROLES.ASSISTANT,
              content: "",
              thinking: streamedThinking,
              statusPhase: "thinking",
            } as ClientMessage);
          }
          return updated;
        });
      },

      onToolExecution: (data: SSEData) => {
        if (!isSubscriptionActive) return;
        markStreamDelivering();
        const toolData = data.tool as Record<string, unknown> | undefined;
        if (!toolData) return;
        if (data.toolEmoji && toolData.name) {
          cacheToolEmoji(toolData.name as string, data.toolEmoji as string);
        }
        const resolvedToolId =
          (toolData.id as string) || `tc-${Date.now()}-${Math.random()}`;

        setToolActivity((previousToolActivity: ToolCallEvent[]) => {
          const next = applyToolExecutionToActivity(
            previousToolActivity,
            resolvedToolId,
            {
              id: toolData.id as string | undefined,
              name: toolData.name as string | undefined,
              args: toolData.args as Record<string, unknown> | undefined,
              status: data.status as string,
              result: toolData.result,
              durationMs: (toolData.durationMs ||
                toolData.durationMilliseconds) as number | undefined,
              timestamp: data.timestamp as number | undefined,
            },
          );
          return next ?? previousToolActivity;
        });

        setMessages((previousMessages: ClientMessage[]) => {
          const lastAssistant = [...previousMessages]
            .reverse()
            .find((m) => m.role === "assistant");
          const snapshot = {
            contentSegments: lastAssistant?.contentSegments || [],
            textFragments: lastAssistant?.textFragments || [],
            thinkingFragments: lastAssistant?.thinkingFragments || [],
          };
          const next = applyToolExecutionToMessages(
            previousMessages,
            resolvedToolId,
            {
              id: toolData.id as string | undefined,
              name: toolData.name as string | undefined,
              args: toolData.args as Record<string, unknown> | undefined,
              status: data.status as string,
              result: toolData.result,
              durationMs: (toolData.durationMs ||
                toolData.durationMilliseconds) as number | undefined,
              timestamp: data.timestamp as number | undefined,
            },
            snapshot,
          );
          return (next ?? previousMessages) as ClientMessage[];
        });
      },

      onToolOutput: (data: SSEData) => {
        if (!isSubscriptionActive) return;
        const toolCallId = data.toolCallId as string | undefined;
        if (!toolCallId) return;

        setMessages((previousMessages: ClientMessage[]) => {
          const lastAssistant = [...previousMessages]
            .reverse()
            .find((m) => m.role === "assistant");
          const snapshot = {
            contentSegments: lastAssistant?.contentSegments || [],
            textFragments: lastAssistant?.textFragments || [],
            thinkingFragments: lastAssistant?.thinkingFragments || [],
          };
          const next = applyToolCallToMessages(
            previousMessages,
            toolCallId,
            {
              id: toolCallId,
              name: data.name as string,
              args: {},
              result: data.data,
              status: "complete",
            },
            snapshot,
          );
          return (next ?? previousMessages) as ClientMessage[];
        });
      },

      onStatus: (data: SSEData) => {
        if (!isSubscriptionActive) return;
        const statusMessage = data.message as string | undefined;

        // Update iteration progress
        if (statusMessage === "iteration_progress") {
          const iteration = data.iteration as number | undefined;
          const maxIterations = data.maxIterations as number | undefined;
          if (typeof iteration === "number") {
            setAgenticProgress({
              iteration,
              maxIterations: maxIterations || 0,
            });
          }
        }

        // Update phase on last assistant message
        const phase = data.phase as string | undefined;
        if (phase) {
          setMessages((previousMessages) => {
            if (previousMessages.length === 0) return previousMessages;
            const lastMessage = previousMessages[previousMessages.length - 1];
            if (lastMessage?.role !== "assistant") return previousMessages;
            if ((lastMessage as ClientMessage).statusPhase === phase) {
              return previousMessages;
            }
            const updatedMessages = [...previousMessages];
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMessage,
              statusPhase: phase,
            } as ClientMessage;
            return updatedMessages;
          });
        }
      },

      onDone: (_data?: SSEData) => {
        if (!isSubscriptionActive) return;
        // Generation finished — do a final full refresh from DB
        // to get the canonical message state with all metadata.
        setIsGenerating(false);
        isClientDrivenGenerationRef.current = false;
        isWebSocketStreamingRef.current = false;
        // Release `messages` ownership so snapshot refreshes flow again
        // between turns of an always-on (admin) subscription.
        webSocketHasStreamedContentRef.current = false;
        streamedText = "";
        streamedThinking = "";

        // The admin viewer reads cross-user documents through the admin
        // fetchers — the username-scoped PrismService endpoints would miss
        // another user's conversation entirely.
        if (isAdmin) {
          adminRefreshSelectedEntry(activeId, adminSelectedSourceRef.current);
          return;
        }

        (async () => {
          try {
            const finalConversation = isNoAgent
              ? await PrismService.getConversation(activeId)
              : await PrismService.getAgentConversation(activeId, agentProject!);
            if (
              finalConversation &&
              finalConversation.id === conversationIdRef.current
            ) {
              applyConversationData(finalConversation);
            }
          } catch {
            // Non-critical — the change stream will catch up
          }
        })();
      },

      onError: () => {
        if (!isSubscriptionActive) return;
        // WebSocket error — fall back to change-stream updates
        setIsGenerating(false);
        isClientDrivenGenerationRef.current = false;
        isWebSocketStreamingRef.current = false;
      },
    });

    return () => {
      isSubscriptionActive = false;
      cleanupWebSocket();
      const hadStreamedContent = webSocketHasStreamedContentRef.current;
      isWebSocketStreamingRef.current = false;
      webSocketHasStreamedContentRef.current = false;
      isClientDrivenGenerationRef.current = false;
      setIsGenerating(false);
      // Admin viewer: always land on the canonical DB state once the live
      // stream closes (gate closed / selection changed). Without this, a
      // subscription that streamed partial content — or suppressed a
      // boundary refresh — would leave the viewer stale until manual reload.
      if (isAdmin && hadStreamedContent) {
        adminRefreshSelectedEntry(streamedConversationId, streamedAdminSource);
      }
    };
  }, [
    activeId,
    isActiveConversationSubAgent,
    liveStreamConversationRunning,
    isNoAgent,
    isAdmin,
    agentProject,
    applyConversationData,
    adminRefreshSelectedEntry,
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
                  color: "oklch(0.65 0.2 277)",
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

  // -- Top panel group (settings, workspace, info, parameters) ------
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
            key: "parameters",
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
                            LOCAL_STORAGE_KEY_AUTO_APPROVE_ENABLED,
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
                            LOCAL_STORAGE_KEY_CRITIC_GATE_ENABLED,
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
                          LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS,
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
                          LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS,
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
                      title: "Click to cycle: Off → 1 (Workers) → 2 → 3 → 5 → 10",
                      onChange: () => {
                        const steps = [0, 1, 2, 3, 5, 10];
                        const index = steps.indexOf(maxRecursionDepth);
                        const next = steps[(index + 1) % steps.length];
                        setMaxRecursionDepth(next);
                        localStorage.setItem(
                          LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH,
                          String(next),
                        );
                      },
                    },
                  ]
            }
            conversationStats={
              (messages.length > 0
                ? backendConversationStats
                  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
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
                      // Live cost signals for the in-flight turn, best first:
                      // _liveGenProgress.estimatedCost streams continuously from
                      // the tracker (covers orchestrator + sub-agents + tool
                      // sub-requests, all providers); usage_update and the final
                      // message cost arrive at iteration/turn boundaries. Take
                      // the max so the badge ticks live and never regresses.
                      const activeMessageCost =
                        lastMessage?.role === "assistant" && isBackendStatsStale
                          ? Math.max(
                              lastMessage.estimatedCost || 0,
                              lastMessage._liveGenProgress?.estimatedCost || 0,
                              lastMessage._intermediateEstimatedCost || 0,
                            )
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
                        // Backend toolCounts already includes sub-agent tools
                        // (aggregated via discoverDescendantConversationIds).
                        // Only overlay live SSE deltas for inflight requests.
                        usedTools: buildUnifiedToolCounts(
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
                  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
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
                          ((bgUsage?.cost || 0) as number) +
                          // Live in-flight turn cost — the conversation doc's
                          // totalCost only updates once the turn persists.
                          (lastMessage?.role === "assistant"
                            ? Math.max(
                                lastMessage.estimatedCost || 0,
                                (gp as any)?.estimatedCost || 0,
                                lastMessage._intermediateEstimatedCost || 0,
                              )
                            : 0),
                        originalTotalCost: 0,
                        // No backend stats yet — use client-derived tool counts as fallback
                        usedTools: buildUnifiedToolCounts(
                          usedTools,
                          Object.fromEntries(
                            usedTools
                              .filter((entry) => !CAPABILITY_TOOL_NAMES.has(entry.name))
                              .map((entry) => [entry.name, entry.count]),
                          ),
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

      {leftTab === "parameters" && (
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
                ...(hasAnyMemoryModelSet
                  ? [
                      {
                        key: "workflows",
                        icon: <span className={tabBarStyles['tab-emoji-icon']}>⚡</span>,
                        ...badgeProps(workflowMemoriesCount, "workflows"),
                        tooltip: "Workflows",
                      },
                    ]
                  : []),
                {
                  key: "tasks",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>✅</span>,
                  ...badgeProps(tasksCount, "tasks"),
                  tooltip: "Tasks",
                },
                {
                  key: "datastore",
                  icon: <span className={tabBarStyles['tab-emoji-icon']}>🗄️</span>,
                  ...badgeProps(datastoreCount, "datastore"),
                  tooltip: "Datastore",
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

      {leftTabBottom === "workflows" && hasAnyMemoryModelSet && (
        <>
          <SidebarTabHeaderComponent icon="⚡" title="Workflows" count={workflowMemoriesCount} actions={workflowMemoriesHeaderActions} />
          <WorkflowMemoriesPanel
            project={agentProject}
            agent={agentId}
            onCountChange={setWorkflowMemoriesCount}
            onActionsChange={setWorkflowMemoriesHeaderActions}
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

      {leftTabBottom === "datastore" && (
        <>
          <SidebarTabHeaderComponent icon="🗄️" title="Datastore" count={datastoreCount} actions={datastoreHeaderActions} />
          <DatastorePanel
            project={agentProject}
            refreshKey={datastoreRefreshKey}
            onCountChange={setDatastoreCount}
            onActionsChange={setDatastoreHeaderActions}
          />
        </>
      )}



    </div>
  );

  // -- Center: chat area ---------------------------------------
  // `chat-terminal-mode` is a global (non-module) class so the terminal
  // skin in each child component's CSS module can scope under it via
  // :global(.chat-terminal-mode).
  const chatContent = (
    <div
      className={`${chatStyles['container']}${isTerminalView ? " chat-terminal-mode" : ""}`}
    >
      {/* -- Chat header bar (always visible "New Conversation") -- */}
      <div className={chatStyles['chat-header']}>
        <div className={chatStyles['chat-header-title']}>
          <span className={chatStyles['chat-header-title-text']}>{title || ""}</span>
        </div>
        <div className={chatStyles['chat-header-actions']}>
          <ChatViewModeControlComponent
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
      {isAdmin && viewMode !== "nodes" ? (
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
              minimal={viewMode === "chat" || isTerminalView}
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
              toolDisplayMetadataMap={toolDisplayMetadataMap}
            />
          )}
        </div>
      ) : (
      <div
        className={`${chatStyles['messages-list']} ${agentBackgroundImage && !isTerminalView ? chatStyles['has-background'] : ""} ${showsChatBackgroundScene ? chatStyles['has-scene'] : ""} ${viewMode === "nodes" ? chatStyles['messages-list-hidden'] : ""}`}
        ref={messagesListRef}
        style={
          agentBackgroundImage
            ? ({
                "--agent-background-image": `url(${agentBackgroundImage})`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {showsChatBackgroundScene && (
          <ChatBackgroundComponent background={chatBackground} />
        )}
        {messages.length === 0 && activeAgentData && (
          <EmptyStateComponent
            className={showsChatBackgroundScene ? chatStyles['empty-state-over-scene'] : ""}
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
          minimal={viewMode === "chat" || isTerminalView}
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
          queuedNextTurn={queuedNextTurn}
          onCancelQueuedTurn={() => {
            setTextareaValue(queuedNextTurn?.text || "");
            setPendingImages(queuedNextTurn?.images || []);
            setPendingFiles(queuedNextTurn?.files || []);
            setQueuedNextTurn(null);
          }}
          onMentionFileOpen={(relativePath: string) => {
            const absPath = currentWorkspace?.path
              ? `${currentWorkspace.path.replace(/\/$/, "")}/${relativePath}`
              : relativePath;
            handleOpenFileInViewer(absPath);
          }}
          onOpenFileInViewer={handleOpenFileInViewer}
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
          toolDisplayMetadataMap={toolDisplayMetadataMap}
        />

        {/* Pending approval cards */}
        {!isAdmin && pendingApprovals
          .filter((approvalItem) => approvalItem.status === APPROVAL_STATUS.PENDING)
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
                    approvalItem.status === APPROVAL_STATUS.PENDING ? { ...approvalItem, status: APPROVAL_STATUS.APPROVED } : approvalItem,
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
          // eslint-disable-next-line react-hooks/purity -- time-based value is intentionally computed during render
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

        const hasActiveTools = toolActivity.some((tool) => tool.status === EXECUTION_STATUS.CALLING || tool.status === EXECUTION_STATUS.STREAMING);
        // Detect awaiting-approval state (plan proposal or tool approval pending)
        const isAwaitingApproval =
          planProposal?.status === APPROVAL_STATUS.PENDING ||
          pendingApprovals.some((approvalItem) => approvalItem.status === APPROVAL_STATUS.PENDING) ||
          pendingUserQuestion !== null;

        // -- Derive phase from live sub-agent activity --------------
        // When sub-agents are active (whether via an in-flight tool call
        // or after a non-blocking create_subagents dispatch), the orchestrator
        // bar should reflect the aggregate sub-agent state.
        const terminalSubAgentPhases = new Set<string>([
          EXECUTION_STATUS.COMPLETE,
          EXECUTION_STATUS.COMPLETED,
          EXECUTION_STATUS.FAILED,
          EXECUTION_STATUS.STOPPED,
        ]);
        let subAgentDerivedPhase = null;
        let subAgentDerivedLabel = null;
        let hasNonTerminalSubAgents = false;

        // Check if the conversation has pending background tasks (sub-agents,
        // long-running tools) that outlive the SSE stream. This counter is
        // persisted in MongoDB and fetched with the conversation list.
        // Reuse the component-level memos instead of re-deriving from conversations[].
        const hasPendingBackgroundTasks = pendingBackgroundTaskCountForPolling > 0;
        const conversationIsExplicitlyInactive =
          !isActiveConversationExplicitlyActive &&
          activeId != null &&
          conversations.find((entry) => entry.id === activeId)?.isActive === false;
        const conversationIsExplicitlyActive = isActiveConversationExplicitlyActive;

        if (Object.keys(subAgentToolActivity).length > 0) {
          const subAgents = Object.values(subAgentToolActivity);

          // Track whether ANY sub-agent hasn't reached a terminal state yet.
          // A sub-agent with no phase is only treated as non-terminal when the
          // conversation is still actively running (generating or has pending
          // background tasks). Once both are false the conversation is done and
          // phase-less entries are considered stale residue that should not
          // keep the status bar alive.
          const conversationIsStillRunning = isGenerating || hasPendingBackgroundTasks;
          hasNonTerminalSubAgents = subAgents.some(
            (subAgent: SubAgentActivityEntry) =>
              subAgent.phase
                ? !terminalSubAgentPhases.has(subAgent.phase)
                : conversationIsStillRunning,
          );

          const activeSubAgents = subAgents.filter(
            (subAgent: SubAgentActivityEntry) =>
              subAgent.phase &&
              !terminalSubAgentPhases.has(subAgent.phase) &&
              subAgent.phase !== EXECUTION_STATUS.SPAWNED,
          );
          if (activeSubAgents.length > 0) {
            // Priority: generating > thinking > synthesizing > prefilling > executing > loading > starting
            const phasePriority = [
              EXECUTION_STATUS.GENERATING,
              EXECUTION_STATUS.THINKING,
              EXECUTION_STATUS.SYNTHESIZING,
              EXECUTION_STATUS.PREFILLING,
              EXECUTION_STATUS.EXECUTING,
              EXECUTION_STATUS.LOADING,
              EXECUTION_STATUS.STARTING,
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

          // When sub-agents exist but none matched the priority phases
          // (all spawned, undefined phase from tool execution, etc.),
          // fall back to "delegating" to keep the status bar informative.
          // Show the active tool name from any sub-agent that has one.
          if (!subAgentDerivedPhase && hasNonTerminalSubAgents) {
            subAgentDerivedPhase = "delegating";
            const activeSubAgentTool = subAgents.find(
              (subAgent: SubAgentActivityEntry) => subAgent.currentTool,
            )?.currentTool;
            subAgentDerivedLabel = activeSubAgentTool
              ? `Awaiting ${renderToolName(activeSubAgentTool)}…`
              : "Awaiting Sub-Agents…";
          }
        }

        // Fallback: if no live SSE sub-agent activity but pendingBackgroundTasks > 0,
        // the SSE stream has closed but async work is still running in the background.
        // Show a delegating phase so the status bar stays alive.
        // Guard: only activate when the orchestrator is NOT generating — when
        // isGenerating is true the SSE stream is still open and the actual
        // generation phase (generating/thinking/etc.) should take priority.
        if (!subAgentDerivedPhase && hasPendingBackgroundTasks && !isGenerating) {
          subAgentDerivedPhase = "delegating";
          subAgentDerivedLabel = "Awaiting Background Tasks…";
        }

        const activeTool = toolActivity.find((tool) => tool.status === "calling" || tool.status === "streaming");
        const activeToolLabel = activeTool
          ? `Running tool ${renderToolName(activeTool.name)}...`
          : "Executing...";

        const isToolGenerating =
          hasActiveTools &&
          liveGenProgress &&
          ((liveGenProgress.activeRequests ?? 0) > 0 || (liveGenProgress.tokensPerSecond ?? 0) > 0);

        const phase = isUserExplicitlyStopped
          ? null
          : isGenerating
          ? isAwaitingApproval
            ? "awaiting"
            : subAgentDerivedPhase ||
              (isToolGenerating ? "generating" : hasActiveTools ? "executing" : rawPhase)
          : subAgentDerivedPhase
            ? "delegating"
            : conversationIsExplicitlyActive
              ? "synthesizing"
              : null;

        // Sync phase tokens to :root so both the sidebar generating-dot
        // and the HistoryItem inline progress bar match the live phase
        const resolvedPhaseTokens = phase ? PHASE_TOKENS[phase as keyof typeof PHASE_TOKENS] : null;
        const phasePulseColor = resolvedPhaseTokens?.overlay.pulse ?? null;
        if (phasePulseColor) {
          document.documentElement.style.setProperty("--generating-dot-phase-color", phasePulseColor);
        } else {
          document.documentElement.style.removeProperty("--generating-dot-phase-color");
        }
        const resolvedGradientStops = resolvedPhaseTokens?.gradientStops;
        if (resolvedGradientStops) {
          for (let stopIndex = 0; stopIndex < 7; stopIndex++) {
            document.documentElement.style.setProperty(
              `--live-phase-gradient-stop-${stopIndex + 1}`,
              resolvedGradientStops[stopIndex],
            );
          }
        } else {
          for (let stopIndex = 0; stopIndex < 7; stopIndex++) {
            document.documentElement.style.removeProperty(`--live-phase-gradient-stop-${stopIndex + 1}`);
          }
        }
        const label = isGenerating
          ? isAwaitingApproval
            ? "Awaiting For User Input..."
            : subAgentDerivedPhase
              ? subAgentDerivedLabel
              : hasActiveTools
                ? activeToolLabel
                : rawLabel
          : subAgentDerivedPhase
            ? subAgentDerivedLabel || (() => {
                const fallbackToolName = Object.values(subAgentToolActivity).find(
                  (subAgent) => subAgent.currentTool,
                )?.currentTool;
                return fallbackToolName
                  ? `Awaiting ${renderToolName(fallbackToolName)}…`
                  : "Awaiting Sub-Agents…";
              })()
            : conversationIsExplicitlyActive
              ? "Synthesizing…"
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
          (hasActiveTools && isChunksFlowing) ||
          isToolGenerating;
        if (
          isOrchestratorGenerating &&
          liveStreamingBurstTokens > 1 &&
          liveStreamingBurstElapsed > 0
        ) {
          orchestratorTokPerSec =
            liveStreamingBurstTokens / (liveStreamingBurstElapsed / 1000);
        } else if (isToolGenerating && liveGenProgress && (liveGenProgress.tokensPerSecond ?? 0) > 0) {
          orchestratorTokPerSec = liveGenProgress.tokensPerSecond;
        }

        // The status bar is active when the orchestrator is generating,
        // OR when sub-agents are still running after a non-blocking dispatch,
        // OR when any sub-agent hasn't reached a terminal state yet
        // (covers spawned/undefined-phase windows during create_subagents).
        //
        // isGenerating (client-side SSE state) overrides conversationIsExplicitlyInactive
        // because the conversations array may contain a stale isActive: false from
        // the prior completed generation that hasn't been refreshed yet.
        const isStatusBarActive =
          !isUserExplicitlyStopped &&
          (isGenerating ||
          (!conversationIsExplicitlyInactive &&
           (!!subAgentDerivedPhase || hasNonTerminalSubAgents || hasPendingBackgroundTasks || conversationIsExplicitlyActive)));

        if (!isStatusBarActive) return null;

        return (
          <StatusBarComponent
            active={isStatusBarActive}
            phase={phase as StatusBarPhase | undefined}
            label={label || undefined}
            progress={typeof progress === "number" ? progress : null}
            tokensPerSecond={orchestratorTokPerSec}
            iteration={agenticProgress?.iteration || 0}
            maxIterations={
              Number.isFinite(maxIterations) ? maxIterations : undefined
            }
            initialElapsedMilliseconds={statusBarInitialElapsedMilliseconds}
          />
        );
      })()}

      {/* Admin viewer: read-only context budget in the input-wrapper slot,
          without the input form itself */}
      {isAdmin && contextBudget && (
        <div className={chatStyles['input-wrapper']}>
          <ContextBudgetIndicatorComponent contextBudget={contextBudget} />
        </div>
      )}

      {!isAdmin && (
      <div
        className={`${chatStyles['input-wrapper']} ${!settings.provider || !settings.model || isActiveConversationSubAgent ? chatStyles['input-wrapper-disabled'] : ""}`}
      >
        {contextBudget && (
          <ContextBudgetIndicatorComponent
            contextBudget={contextBudget}
            estimatedDraftTokens={Math.ceil(draftInputLength / 4)}
          />
        )}
        <InputBoxComponent
          as="form"
          onSubmit={handleSend}
          isDragActive={isDragging}
          isGenerating={isConversationRunning}
          className={chatStyles['input-box-layout']}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >

          {isDragging && (
            <div className={chatStyles['drag-overlay']}>
              <Paperclip size={20} />
              <span>
                Drop files here ({attachmentKindsLabel})
              </span>
            </div>
          )}
          {(pendingImages.length > 0 || pendingFiles.length > 0) && (
            <div className={chatStyles['pending-images']}>
              {pendingImages.map((dataUrl, i) => (
                <div key={`img-${i}`} className={chatStyles['pending-attachment-wrap']}>
                  { }
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
                // Text/code documents get code-flavoured icons; other
                // documents (docx/xlsx/csv) keep the spreadsheet icon.
                const textualKind =
                  pendingFile.modality === "document"
                    ? getTextualFileKind(pendingFile.name)
                    : null;
                const FileIcon =
                  pendingFile.modality === "audio" ? Volume2
                  : pendingFile.modality === "video" ? Video
                  : pendingFile.modality === "pdf" ? FileText
                  : textualKind === "code" ? FileCode
                  : textualKind === "text" ? FileText
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
                  label={`Attach files (${attachmentKindsLabel})`}
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
                            // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
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
                              // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
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
            {isConversationRunning && (
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
              icon={isConversationRunning ? Square : Send}
              isGenerating={isConversationRunning}
              disabled={
                isConversationRunning
                  ? false
                  : !hasInput && pendingImages.length === 0 && pendingFiles.length === 0
              }
              aria-label={isConversationRunning ? "Stop" : "Send"}
            />
          </div>
        </InputBoxComponent>
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
                localStorage.setItem(LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH, String(width));
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
              generatingConversationIds={generatingConversationIds as Set<string>}
              hasMore={adminEntriesHasMore}
              loadingMore={adminEntriesLoading}
              onLoadMore={adminLoadMoreEntries}
              filterStorageKey={LOCAL_STORAGE_KEY_ADMIN_CHAT_FILTERS}
              dateStorageKey={LOCAL_STORAGE_KEY_ADMIN_DATE_RANGE}
              dateRange={adminDateRange}
              onDateChange={adminHeaderContext.setDateRange}
              initialProviders={adminProviderFilter ? [adminProviderFilter] : undefined}
              initialSearch={adminTraceFilter || undefined}
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
              filterStorageKey={LOCAL_STORAGE_KEY_CHAT_FILTERS}
              dateStorageKey={LOCAL_STORAGE_KEY_DATE_RANGE}
              subAgentLivePhases={subAgentLivePhases}
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
                      new CustomEvent(EVENT_NAME_AGENT_SWITCH, {
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
                  new CustomEvent(EVENT_NAME_MODEL_CHANGE, {
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
