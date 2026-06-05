"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  BotMessageSquare,
  Paperclip,
  X,
  ClipboardList,
  Zap,
  Settings,
  Wrench,
  Brain,
  GitBranch,
  Repeat,
  ListChecks,
  BookOpen,
  Info,
  Activity,
  CornerDownLeft,
  Send,
  Square,
  SlidersHorizontal,
  File,
  FolderOpen,
  FolderTree,
  Plus,
  Bot,
  BarChart3,
  ScrollText,
  ShieldCheck,
  FileText,
  FileSpreadsheet,
  Volume2,
  Video,
} from "lucide-react";
import PrismService from "../services/PrismService";
import IrisService, {
  IrisCollectionChangeEvent,
} from "../services/IrisService";
import ToolsApiService from "../services/ToolsApiService";
import {
  Message,
  PrismConfig,
  AgentSession,
  CustomTool,
  Skill,
  Rule,
  ToolCallEvent,
  CustomAgent,
  PrismSettings,
  Conversation,
  AgentPersona,
  ToolSchema,
  WorkerGenerationProgress,
  BackgroundUsage,
  SessionStats,
  ModelOption,
  SSEData,
  ContentSegment,
} from "../types/types";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import HistoryPanel from "./HistoryPanelComponent";
import SettingsPanel, {
  SessionStats as DisplaySessionStats,
} from "./SettingsPanelComponent";
import ModelInfoPanel from "./ModelInfoPanelComponent";
import CustomToolsPanel from "./CustomToolsPanelComponent";
import SkillsPanel from "./SkillsPanelComponent";
import RulesPanel from "./RulesPanelComponent";
import MemoriesPanel from "./MemoriesPanelComponent";
import TasksPanel from "./TasksPanelComponent";

import WorkersPanel from "./WorkersPanelComponent";
import ParametersPanelComponent from "./ParametersPanelComponent";
import SessionRequestsListComponent from "./SessionRequestsListComponent";
import WorkspaceTreePanelComponent from "./WorkspaceTreePanelComponent";
import SidebarTabHeaderComponent from "./SidebarTabHeaderComponent";
import FileViewerPanelComponent from "./FileViewerPanelComponent";
import MessageList, { prepareDisplayMessages } from "./MessageListComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";

import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ApprovalCardComponent from "./ApprovalCardComponent";
import UserQuestionCardComponent from "./UserQuestionCardComponent";

import StatusBarComponent from "./StatusBarComponent";
import PixelTransitionComponent from "./PixelTransitionComponent";

import { buildToolSchemas } from "../utils/FunctionCallingUtilities";
import {
  applyToolExecutionToMessages,
  applyToolExecutionToActivity,
  applyToolCallToMessages,
} from "../utils/toolCallStateUpdaters";

import useSessionStats from "../hooks/useSessionStats";
import { generateUUID, renderToolName } from "@rodrigo-barraza/utilities-library";
import { mergeUsedToolsWithWorkers, toolCountsToUsedTools, resolveDefaultModel } from "../utils/utilities";
import {
  PROJECT_AGENT,
  SETTINGS_DEFAULTS,
  SK_MODEL_MEMORY_AGENT,
  SK_MODEL_MEMORY_AGENT_PREFIX,
  SK_TOOL_MEMORY_AGENT,
  SK_TOOL_MEMORY_AGENT_PREFIX,
  MAX_TOOL_ITERATIONS,
  LS_FILE_VIEWER_WIDTH,
} from "../constants";
import chatStyles from "./ChatAreaComponent.module.css";
import ChatInputButton from "./ChatInputButtonComponent";
import {
  ButtonComponent,
  EmptyStateComponent,
  layoutHeaderStyles,
  TabBarComponent,
  tabBarStyles,
  ToastComponent,
  useToast,
} from "@rodrigo-barraza/components-library";
import useToolToggles from "../hooks/useToolToggles";
import useModelMemory from "../hooks/useModelMemory";
import AgentPickerComponent from "./AgentPickerComponent";
import BadgeComponent from "./BadgeComponent";
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
const WORKSPACE_FS_TOOLS = new Set([
  "write_file",
  "str_replace_file",
  "patch_file",
  "move_file",
  "delete_file",
  "run_command",
  "notebook_edit",
]);

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

interface WorkerActivityEntry {
  phase?: string;
  currentTool?: string | null;
  iteration?: number;
  workerId?: string;
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

/** Snapshot of UI state stored when a background-generating session is paused. */
interface SessionSnapshot {
  messages: ClientMessage[];
  title: string;
  toolActivity: ToolCallEvent[];
  workerToolActivity: Record<string, WorkerActivityEntry>;
  streamingOutputs: Map<string, string>;
  pendingApprovals: PendingApproval[];
  pendingUserQuestion: {
    question?: string;
    questions?: unknown[];
    choices?: string[];
    context?: string;
  } | null;
  planProposal: { plan: string; steps?: string[]; status?: string } | null;
  agenticProgress: { iteration: number; maxIterations: number } | null;
  settings: Record<string, unknown>;
  backendSessionStats: SessionStats | null;
  workspaceRoot: string | null;
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
  _workerGenerationProgress?: Record<string, WorkerGenerationProgress>;
  _workerTokens?: {
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

export interface ChatSessionComponentProps {
  agentId?: string;
  agents?: Array<
    AgentPersona | (Partial<AgentPersona> & { id: string; name: string })
  >;
  initialFcEnabled?: boolean;
  initialThinkingEnabled?: boolean;
  initialModel?: string | null;
  initialSessionId?: string | null;
  initialTabKey?: string | null;
}

export default function ChatSessionComponent({
  agentId: propAgentId = "CODING",
  agents = [],
  initialFcEnabled = false,
  initialThinkingEnabled = false,
  initialModel = null,
  initialSessionId = null,
  initialTabKey = null,
}: ChatSessionComponentProps) {
  // Track whether the URL model param has been applied — prevents re-apply on re-render
  const urlModelAppliedRef = useRef<boolean>(false);
  // Track whether the URL session param has been consumed
  const urlSessionAppliedRef = useRef<boolean>(false);
  const agentId = propAgentId;
  const isNoAgent = agentId === "NONE";
  const activeAgentData = agents.find((agent) => agent.id === agentId);
  // Direct Chat omits project so it uses the default x-project header — this
  // routes persistence to the conversations collection.
  // Agent modes use the persona's project so persistence goes to agent_conversations.
  const agentProject = isNoAgent
    ? undefined
    : activeAgentData?.project ||
      (agentId.toUpperCase() === "CODING" ? "coding" : "prism-chat");
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
  const [sessions, setSessions] = useState<Array<AgentSession | Conversation>>(
    [],
  );
  const sessionsCursorRef = useRef<string | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [title, setTitle] = useState(isNoAgent ? "Agentless Chat" : "Agent");
  const [leftTab, setLeftTab] = useState(initialTabKey || "settings"); // "settings" | "tools"
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
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
  // When a loaded session references a workspace that isn't currently connected,
  // store the path so the UI can show "workspace not available" instead of looping errors.
  const [unavailableWorkspace, setUnavailableWorkspace] = useState<
    string | null
  >(null);

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
        session: AgentSession | Conversation;
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
  const [workersCount, setWorkersCount] = useState(0);
  const [workersHeaderActions, setWorkersHeaderActions] =
    useState<ReactNode>(null);
  const [skillsHeaderActions, setSkillsHeaderActions] =
    useState<ReactNode>(null);
  const [rulesHeaderActions, setRulesHeaderActions] = useState<ReactNode>(null);
  const [tasksHeaderActions, setTasksHeaderActions] = useState<ReactNode>(null);
  const [workspaceTreeStats, setWorkspaceTreeStats] = useState<{
    totalEntries: number;
    truncated: boolean;
  } | null>(null);
  const [workerToolActivity, setWorkerToolActivity] = useState<
    Record<string, WorkerActivityEntry>
  >({});

  // Track which tabs have received new data the user hasn't viewed yet
  const [newDataTabs, setNewDataTabs] = useState(new Set());
  const leftTabRef = useRef<string>(leftTab);
  leftTabRef.current = leftTab;
  const [leftTabBottom, setLeftTabBottom] = useState("tools");
  const leftTabBottomRef = useRef<string>(leftTabBottom);
  leftTabBottomRef.current = leftTabBottom;

  useEffect(() => {
    if (leftTab) {
      window.dispatchEvent(
        new CustomEvent("sidebarTab:change", {
          detail: { tab: leftTab },
        }),
      );
    }
  }, [leftTab]);

  const BOTTOM_PANEL_TABS = new Set(["tools", "skills", "rules", "memories", "tasks"]);

  useEffect(() => {
    if (initialTabKey) {
      if (BOTTOM_PANEL_TABS.has(initialTabKey)) {
        if (initialTabKey !== leftTabBottom) setLeftTabBottom(initialTabKey);
      } else {
        if (initialTabKey !== leftTab) setLeftTab(initialTabKey);
      }
    }
  }, [initialTabKey]);

  /** Mark a tab as having new unseen data (only if user isn't already viewing it). */
  const markTabNew = useCallback((tabKey: string) => {
    if (leftTabRef.current === tabKey || leftTabBottomRef.current === tabKey)
      return;
    setNewDataTabs((previousPixelSize) => {
      if (previousPixelSize.has(tabKey)) return previousPixelSize;
      const next = new Set(previousPixelSize);
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

  // Count concurrent API calls: main generation + active worker agents
  const activeApiCount = useMemo(() => {
    const activeWorkers = Object.values(workerToolActivity).filter(
      (worker: WorkerActivityEntry) =>
        worker.currentTool || worker.phase === "generating" || worker.phase === "thinking",
    ).length;
    return (isGenerating ? 1 : 0) + activeWorkers;
  }, [isGenerating, workerToolActivity]);
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
  // -- Agent-scoped storage keys ---------------------------------
  const toolMemoryKey =
    agentId === "CODING"
      ? SK_TOOL_MEMORY_AGENT
      : SK_TOOL_MEMORY_AGENT_PREFIX + agentId;
  const modelMemoryKey =
    agentId === "CODING"
      ? SK_MODEL_MEMORY_AGENT
      : SK_MODEL_MEMORY_AGENT_PREFIX + agentId;

  const { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn } =
    useToolToggles(builtInTools, toolMemoryKey);

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
  >({
    ...SETTINGS_DEFAULTS,
    maxTokens: 64000,
    // Agents always need FC for tool orchestration; Direct Chat defaults off
    // to avoid injecting large tool schemas into local model contexts.
    functionCallingEnabled: initialFcEnabled ? true : !isNoAgent,
    thinkingEnabled: initialThinkingEnabled
      ? true
      : SETTINGS_DEFAULTS.thinkingEnabled || false,
  });

  const placeholderText = isNoAgent
    ? `Message ${settings.model || "model"}`
    : `Message ${activeAgentData?.name || "agent"}`;

  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<
    { name: string; mimeType: string; dataUrl: string; modality: string }[]
  >([]);
  const [lightboxSourceUrl, setLightboxSourceUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef<number>(0);

  // Phase 1: Agentic controls
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxIterations, setMaxIterations] = useState(MAX_TOOL_ITERATIONS);
  const [maxWorkerIterations, setMaxWorkerIterations] =
    useState(MAX_TOOL_ITERATIONS);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const parseStored = (key: string) => {
      const stored = localStorage.getItem(key);
      if (stored === "Infinity") return Infinity;
      const parsed = Number(stored);
      return [10, 25, 50, 100].includes(parsed) ? parsed : null;
    };
    const iter = parseStored("agent:maxIterations");
    if (iter != null) setMaxIterations(iter);
    const workerIter = parseStored("agent:maxWorkerIterations");
    if (workerIter != null) setMaxWorkerIterations(workerIter);
  }, []);
  const [planFirst, setPlanFirst] = useState(false);
  const [criticGateEnabled, setCriticGateEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("agent:criticGateEnabled") === "true";
    }
    return false;
  });
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [pendingUserQuestion, setPendingUserQuestion] = useState<{
    question?: string;
    questions?: unknown[];
    choices?: string[];
    context?: string;
  } | null>(null);
  const [planProposal, setPlanProposal] = useState<{
    plan: string;
    steps?: string[];
    status?: string;
  } | null>(null); // { plan, steps, status }
  const [agenticProgress, setAgenticProgress] = useState<{
    iteration: number;
    maxIterations: number;
  } | null>(null); // { iteration, maxIterations }
  const [_contextTruncated, setContextTruncated] = useState<{
    strategy: string;
    estimatedTokens?: number;
  } | null>(null); // { strategy, estimatedTokens }
  const [currentTurnStart, setCurrentTurnStart] = useState<number | null>(null); // Date.now() when user sends
  const [backendSessionStats, setBackendSessionStats] =
    useState<SessionStats | null>(null);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

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
  // Track session load durations via EMA to predict the "out" duration.
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

  /** Record a completed session load and update the EMA in localStorage. */
  const recordPixelLoadTime = useCallback((elapsed: number) => {
    const stored = localStorage.getItem(PIXEL_LS_KEY);
    const alpha = 0.3; // EMA smoothing — higher = more reactive to recent loads
    const previousPixelSize = stored ? Number(stored) : PIXEL_DEFAULT_OUT;
    const next = alpha * elapsed + (1 - alpha) * previousPixelSize;
    localStorage.setItem(PIXEL_LS_KEY, String(Math.round(next)));
  }, []);

  const textareaRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const scrollBehaviorRef = useRef<ScrollBehavior>("smooth"); // "smooth" for streaming, "instant" for history loads
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);

  // -- Sticky auto-scroll -------------------------------------
  // Only auto-scroll when the user is near the bottom of the messages container.
  // Re-engaged on send, session load, and new chat.
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
  // Track which sessions have active background generation (for history indicator)
  const [generatingSessionIds, setGeneratingSessionIds] = useState(
    () => new Set(),
  );
  // Snapshot cache: stores UI state for sessions that are generating in the background
  // so the user can switch back without waiting for backend persistence.
  const backgroundSessionsRef = useRef<Map<string, SessionSnapshot>>(new Map());

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsGenerating(false);
    setPlanProposal(null);

    // Immediately stop the elapsed-time ticker (StopwatchBadgeComponent)
    // so the badge freezes on abort instead of continuing until the
    // finally block in handleSend runs.
    setCurrentTurnStart(null);

    // Clear live streaming and processing metadata from the in-flight
    // assistant message so the TTFT badge and tok/s indicators stop
    // calculating.  Without this, statusPhase / _processingStartTime /
    // _streamingLastChunkTime remain on the message and the SettingsPanel
    // ticker keeps running after the user hits stop.
    setMessages((previousPixelSize) => {
      const last = previousPixelSize[previousPixelSize.length - 1];
      if (last?.role === "assistant" && !last.completedAt) {
        const updated = [...previousPixelSize];
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
      return previousPixelSize;
    });

    // Force all active workers to terminal state so their StatusBarComponent
    // bars stop animating — the SSE stream was aborted before "complete" events
    // could arrive, leaving activity entries stuck in active phases.
    setWorkerToolActivity((previousPixelSize) => {
      const hasActive = Object.values(previousPixelSize).some(
        (worker: WorkerActivityEntry) =>
          worker.phase && worker.phase !== "complete" && worker.phase !== "failed",
      );
      if (!hasActive) return previousPixelSize;
      const next: Record<string, WorkerActivityEntry> = {};
      for (const [id, worker] of Object.entries(previousPixelSize)) {
        next[id] =
          worker.phase && worker.phase !== "complete" && worker.phase !== "failed"
            ? { ...worker, phase: "complete", currentTool: null }
            : worker;
      }
      return next;
    });

    // Explicitly abort any running workers for this session — belt-and-suspenders
    // alongside the backend SSE disconnect handler
    // Direct Chat (NONE) has no workers — skip.
    if (!isNoAgent) {
      PrismService.stopCoordinatorWorkers(conversationIdRef.current).catch(
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
  // Once a session has messages, the user should not switch model or agent
  // mid-conversation — the session data owns those values.
  const isSessionLocked = useMemo(
    () => Boolean(activeId && messages.length > 0),
    [activeId, messages.length],
  );

  // -- Effects --------------------------------------------------

  // Sticky auto-scroll: track whether the user is near the bottom of the
  // scroll container.  When they scroll up, auto-scroll disengages; when
  // they scroll back to the bottom (within SCROLL_BOTTOM_THRESHOLD px), it
  // re-engages.  Uses a passive scroll listener for zero main-thread cost.
  useEffect(() => {
    const element = messagesListRef.current;
    if (!element) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      isUserNearBottomRef.current =
        scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

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
        setFavoriteKeys(favs.map((f) => f.key)),
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
      setSettings((s) => ({
        ...s,
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
        setSettings((s) => ({
          ...s,
          provider,
          model,
          temperature,
        }));
      }
    };

    PrismService.getConfigWithLocalModels({
      onConfig: (config: PrismConfig) => {
        setConfig(config);
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

    // Check if the model is an always-on thinking model (e.g. Gemini 3.5 Flash)
    const canDisable =
      !modelDef.thinkingLevels || modelDef.thinkingLevels.includes("minimal");
    const alwaysOn =
      !canDisable && settings.provider === "google" && modelDef.thinking;

    if (alwaysOn && !settings.thinkingEnabled) {
      setSettings((s) => ({
        ...s,
        thinkingEnabled: true,
      }));
    }
  }, [config, settings.provider, settings.model, settings.thinkingEnabled]);

  // Load session history — Direct Chat reads from conversations collection
  const loadSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      const result = isNoAgent
        ? await PrismService.getConversations()
        : await PrismService.getAgentSessions(agentProject!, {
            agent: agentId,
          });
      setSessions(result.items);
      sessionsCursorRef.current = result.nextCursor;
      setSessionsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load sessions:", error);
    } finally {
      setSessionsLoading(false);
    }
  }, [agentProject, agentId, isNoAgent]);

  const loadMoreSessions = useCallback(async () => {
    if (!sessionsCursorRef.current || sessionsLoading) return;
    try {
      setSessionsLoading(true);
      const fetchOptions = {
        cursor: sessionsCursorRef.current,
        agent: agentId,
      };
      const result = isNoAgent
        ? await PrismService.getConversations(fetchOptions)
        : await PrismService.getAgentSessions(agentProject!, fetchOptions);
      setSessions((previousPixelSize) => [
        ...previousPixelSize,
        ...result.items,
      ]);
      sessionsCursorRef.current = result.nextCursor;
      setSessionsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load more sessions:", error);
    } finally {
      setSessionsLoading(false);
    }
  }, [agentProject, isNoAgent, sessionsLoading]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // -- Auto-load session from URL ?session= param ----------------
  // Runs once on mount. Fetches the full session and applies it.
  // Uses a ref guard to prevent double-loading on StrictMode re-mounts.
  useEffect(() => {
    if (!initialSessionId || urlSessionAppliedRef.current) return;
    urlSessionAppliedRef.current = true;

    (async () => {
      try {
        const full = isNoAgent
          ? await PrismService.getConversation(initialSessionId)
          : await PrismService.getAgentSession(initialSessionId, agentProject!);
        if (!full) return;

        const displayMessages = prepareDisplayMessages(full.messages || []);
        console.debug(
          `[URL session load] id=${initialSessionId}, raw=${full.messages?.length || 0} → display=${displayMessages.length}`,
        );
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(displayMessages);
        setConversationId(full.id || generateUUID());
        setTraceId(full.traceId || null);
        setActiveId(full.id || null);
        setTitle(full.title || (isNoAgent ? "Agentless Chat" : "Agent"));
        setToolActivity([]);
        setWorkerToolActivity({});

        const lastAssistant = [...(full.messages || [])]
          .reverse()
          .find((message) => message.role === "assistant" && message.provider);
        if (lastAssistant) {
          const gs = (lastAssistant.generationSettings || {}) as Record<
            string,
            string | number | boolean | undefined
          >;
          setSettings((previousPixelSize) => ({
            ...previousPixelSize,
            ...(lastAssistant.provider && { provider: lastAssistant.provider }),
            ...(lastAssistant.model && { model: lastAssistant.model }),
            ...(gs.temperature !== undefined && {
              temperature: Number(gs.temperature),
            }),
            ...(gs.maxTokens !== undefined && {
              maxTokens: Number(gs.maxTokens),
            }),
            ...(gs.thinkingEnabled !== undefined && {
              thinkingEnabled: Boolean(gs.thinkingEnabled),
            }),
            ...(gs.reasoningEffort && {
              reasoningEffort: String(gs.reasoningEffort),
            }),
            ...(gs.thinkingBudget && {
              thinkingBudget: String(gs.thinkingBudget),
            }),
            ...(full.systemPrompt != null && {
              systemPrompt: full.systemPrompt,
            }),
          }));
        }
        setBackendSessionStats(full.stats || null);
        tokenHwmRef.current = { input: 0, output: 0, total: 0 };
      } catch (error: unknown) {
        console.error("Failed to preload session from URL:", error);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load custom tools
  const loadCustomTools = useCallback(async () => {
    try {
      const tools = await PrismService.getCustomTools(agentProject);
      setCustomTools(tools);
    } catch (error: unknown) {
      console.error("Failed to load custom tools:", error);
    }
  }, [agentProject]);

  useEffect(() => {
    loadCustomTools();
  }, [loadCustomTools]);

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
    loadSkills();
  }, [loadSkills]);

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
    loadRules();
  }, [loadRules]);



  // Fetch built-in tools for the active agent (filtered server-side by persona)
  // NONE = no agent filter → all tools exposed, but workspace/file tools are
  // stripped client-side since agentless mode has no backend workspace awareness.
  useEffect(() => {
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
        const agentOnlyDomains = new Set([
          "Workspace",
        ]);
        tools = tools.filter(
          (tool) => !agentOnlyDomains.has(tool.domain || ""),
        );
      }

      setBuiltInTools(tools);
    }
    loadAgenticTools().catch(console.error);
  }, [agentId, isNoAgent]);

  // -- Fetch settings to determine which model-dependent tools are configured --
  useEffect(() => {
    PrismService.getSettings()
      .then((s: PrismSettings) => {
        const memorySection = s?.memory;
        const creativeSection = s?.creative;

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
    if (!memoryConfigured) lockedToolsMap.set("upsert_memory", "Configure all Memory Models in Settings to unlock");
    if (!extractionModelConfigured) lockedToolsMap.set("extract_memories", "Configure the Extraction Model in Settings → Memory Models to unlock");
    if (!consolidationModelConfigured) lockedToolsMap.set("consolidate_memories", "Configure the Consolidation Model in Settings → Memory Models to unlock");
    if (!embeddingModelConfigured) lockedToolsMap.set("search_memories", "Configure the Embedding Model in Settings → Memory Models to unlock");
    if (!imageModelConfigured) lockedToolsMap.set("generate_image", "Configure the Image Generation Model in Settings → Creative Tools to unlock");
    if (!visionModelConfigured) lockedToolsMap.set("describe_image", "Configure the Vision Model in Settings → Creative Tools to unlock");
    if (!textToSpeechModelConfigured) lockedToolsMap.set("text_to_speech", "Configure the Text-to-Speech Model in Settings → Audio to unlock");
    if (!speechToTextModelConfigured) lockedToolsMap.set("speech_to_text", "Configure the Speech-to-Text Model in Settings → Audio to unlock");
    return lockedToolsMap;
  }, [memoryConfigured, extractionModelConfigured, consolidationModelConfigured, embeddingModelConfigured, imageModelConfigured, visionModelConfigured, textToSpeechModelConfigured, speechToTextModelConfigured]);

  // -- Eager-fetch tab badge counts (fires on mount / session change) --

  useEffect(() => {
    PrismService.getAgentMemories(agentProject, 1, agentId)
      .then((r) => setTotalMemoriesCount(r.total || 0))
      .catch(() => {});
  }, [agentProject, agentId]);

  useEffect(() => {
    ToolsApiService.getAllAgenticTasks({ conversationId })
      .then((r) => setTasksCount(r.summary?.total || (r.tasks || []).length))
      .catch(() => {});
  }, [conversationId, tasksRefreshKey]);

  useEffect(() => {
    PrismService.getCoordinatorWorkers(conversationId)
      .then((r) => setWorkersCount((r.workers || []).length))
      .catch(() => {});
  }, [conversationId, tasksRefreshKey]);

  // System prompt is fully assembled server-side by SystemPromptAssembler.
  // The client sends a placeholder system message that gets replaced.

  // -- Session stats for SettingsPanel ------------------
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
    workerGenerationProgress,
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  } = useSessionStats(messages);

  // -- Live-patch sidebar session metadata ------------------
  // Keep the active session's entry in `sessions[]` in sync with the
  // live stats derived from messages so the HistoryPanel badges
  // (model, provider, modalities, cost) update in real-time during
  // generation — no full loadSessions() round-trip needed.
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    setSessions((previousPixelSize) => {
      const index = previousPixelSize.findIndex((s) => s.id === activeId);
      if (index === -1) return previousPixelSize;
      const existing = previousPixelSize[index] as unknown as Record<
        string,
        unknown
      >;
      // Only patch if something actually changed to avoid churn
      const resolvedCost = (backendSessionStats?.totalCost ??
        totalCost) as number;
      const resolvedModalities: Record<string, number> =
        (backendSessionStats?.modalities ?? modalities) as Record<
          string,
          number
        >;
      const resolvedToolCounts = backendSessionStats?.toolCounts ?? undefined;
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
        return previousPixelSize;
      }
      const updated = [...previousPixelSize] as unknown as Record<
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
      return updated as unknown as Array<AgentSession | Conversation>;
    });
  }, [
    activeId,
    title,
    modalities,
    uniqueModels,
    uniqueProviders,
    totalCost,
    backendSessionStats,
    messages.length,
  ]);

  // -- Fetch backend-aggregate session stats ----------------
  const fetchSessionStats = useCallback(
    (sessionId: string) => {
      if (!sessionId) return;
      // Direct Chat sessions live in the conversations collection which
      // doesn't have the stats aggregation endpoint — skip, but update the refresh key.
      if (isNoAgent) {
        setRequestsRefreshKey((previousKey) => previousKey + 1);
        return;
      }
      // Two-phase fetch: first at 2s catches iteration requests,
      // second at 8s catches background requests (memory extraction,
      // embedding) that take longer to flush to the DB.
      const refetch = () =>
        PrismService.getAgentSession(sessionId, agentProject!)
          .then((session) => {
            if (session?.stats) {
              setBackendSessionStats(session.stats);
              setRequestsRefreshKey((k) => k + 1);
              // Clear incremental background usage from the message —
              // the backend aggregate now includes those requests.
              setMessages((previousPixelSize) => {
                const last = previousPixelSize[previousPixelSize.length - 1];
                if (last?.role === "assistant" && last._backgroundUsage) {
                  const updated = [...previousPixelSize];
                  updated[updated.length - 1] = {
                    ...last,
                    _backgroundUsage: undefined,
                  };
                  return updated;
                }
                return previousPixelSize;
              });
            }
          })
          .catch(() => {}); // silently ignore if no requests yet
      const t1 = setTimeout(refetch, 2000);
      const t2 = setTimeout(refetch, 8000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    },
    [agentProject, isNoAgent],
  );

  // Build final tool schemas
  const allToolSchemas = useMemo(
    () => buildToolSchemas(builtInTools, disabledTools, customTools),
    [customTools, builtInTools, disabledTools],
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

  const isCoreToolsLocked = !isNoAgent && (activeAgentData?.coreToolsLocked ?? true);

  const enabledCoreToolsCount = useMemo(() => {
    return builtInTools.filter((tool) => tool.system === true && !disabledTools.has(tool.name)).length;
  }, [builtInTools, disabledTools]);

  // Derive whether the active agent has Workspace capability (files, git, search, etc.)
  const hasFileOperations = useMemo(
    () => builtInTools.some((t) => t.domain === "Workspace"),
    [builtInTools],
  );

  // -- Memoize filtered messages for MessageList to prevent ref churn --
  const filteredMessages = useMemo(
    () => messages.filter((message) => message.role === "user" || message.role === "assistant"),
    [messages],
  );

  const hasSystemContextMessage = useMemo(() => {
    return messages.some(
      (message) =>
        message.role === "user" &&
        (message.content?.startsWith("[System Context]") ||
          message.rawContent?.startsWith("[System Context]") ||
          message.content?.startsWith("[System Context - Local Time:") ||
          message.rawContent?.startsWith("[System Context - Local Time:")),
    );
  }, [messages]);

  // ── Editable serialization ─────────────────────────────────────
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
      window.dispatchEvent(new CustomEvent("user:typing"));
      const hasSlashBadges = element.querySelectorAll("[data-slash-command]").length > 0;
      const nowHasInput = value.trim().length > 0 || hasSlashBadges;
      setHasInput((previousPixelSize) =>
        previousPixelSize !== nowHasInput ? nowHasInput : previousPixelSize,
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

  // ── Mention Autocomplete ───────────────────────────────────────
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
    async (sessionMessages: ClientMessage[], resolvedTitle: string) => {
      const currentMessages = [...sessionMessages];
      // Capture which session this generation belongs to — if the user
      // switches sessions, streaming callbacks will skip UI updates.
      const genSessionId = conversationIdRef.current;

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
                disabledTools: [...disabledTools],
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
              disabledTools: [...disabledTools],
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
              // Local models need enough context for MCP tool schemas + session
              minContextLength: 65_000,
              project: agentProject,
              conversationId,
              conversationMeta: { title: resolvedTitle },
              traceId,
              agent: agentId,
              harness: settings?.agents?.harness || "standard",
              // Phase 1: Agentic controls
              autoApprove,
              planFirst,
              maxIterations: Number.isFinite(maxIterations) ? maxIterations : 0,
              maxWorkerIterations: Number.isFinite(maxWorkerIterations)
                ? maxWorkerIterations
                : 0,
              ...(criticGateEnabled && { enableCriticGate: true }),
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
          contentSegments.map((s) => ({
            ...s,
            ...(s.toolIds ? { toolIds: [...s.toolIds] } : {}),
          }));

        // Guard: returns true when the user switched sessions — skip all UI updates
        // but let the stream continue (the backend saves independently).
        const isStale = () => conversationIdRef.current !== genSessionId;

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
            // Skip UI updates if user switched sessions
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
            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
              const lastMessage = updated[updated.length - 1];
              if (lastMessage?.role === "assistant") {
                lastMessage.content = cleanText;
                lastMessage.contentSegments = snapshotSegments();
                lastMessage.textFragments = [...textFragments];
                lastMessage.thinkingFragments = [...thinkingFragments];
                lastMessage._streamingOutputCharacters = outputCharacters || 0;
                lastMessage._streamingStartTime = firstChunkTime;
                lastMessage._streamingLastChunkTime = now;
                lastMessage._streamingBurstTokens = burstTokens;
                lastMessage._streamingBurstElapsed = burstElapsed;
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

            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
              const lastMessage = updated[updated.length - 1];
              if (lastMessage?.role === "assistant") {
                lastMessage.thinking = streamedThinking;
                lastMessage.contentSegments = snapshotSegments();
                lastMessage.thinkingFragments = [...thinkingFragments];
                lastMessage._streamingOutputCharacters = outputCharacters || 0;
                lastMessage._streamingStartTime = firstChunkTime;
                lastMessage._streamingLastChunkTime = now;
                lastMessage._streamingBurstTokens = burstTokens;
                lastMessage._streamingBurstElapsed = burstElapsed;
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
            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
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
          onToolExecution: (data: SSEData) => {
            if (isStale()) return;
            const toolData = data.tool;
            if (!toolData) return;
            const resolvedId =
              toolData.id || `tc-${Date.now()}-${Math.random()}`;
            console.debug(
              `[ToolExec] ${data.status} ${toolData.name} id=${resolvedId}`,
            );

            setToolActivity((previousPixelSize: ToolCallEvent[]) => {
              const next = applyToolExecutionToActivity(
                previousPixelSize,
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
              return next ?? previousPixelSize;
            });

            // Track segment ordering: group consecutive tool events
            // Guard: only add to segments if not already tracked
            if (data.status === "calling") {
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
              // TODO(cleanup): Remove "task_" startsWith once historical sessions have aged out
              ((toolData.name || "").includes("_task") || (toolData.name || "").startsWith("task_"))
            ) {
              setTasksRefreshKey((k) => k + 1);
            }

            // Increment scheduled task notification badge when agent creates a cron job
            if (
              data.status === "done" &&
              toolData.name === "create_cron_job"
            ) {
              const currentNotificationCount = parseInt(
                localStorage.getItem("cron-job-notifications-count") || "0",
                10,
              );
              localStorage.setItem(
                "cron-job-notifications-count",
                String(currentNotificationCount + 1),
              );
              window.dispatchEvent(new CustomEvent("cron-job-scheduled"));
            }

            // Auto-refresh memories panel when upsert_memory completes
            if (
              data.status !== "calling" &&
              toolData.name === "upsert_memory"
            ) {
              if (hasAnyMemoryModelSet) {
                setLeftTabBottom("memories");
              }
              setMemoriesRefreshKey((k) => k + 1);
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((r) => setTotalMemoriesCount(r.total || 0))
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
                  toolData.name === "delete_file" ||
                  toolData.name === "move_file"
                ) {
                  const deleted = openFiles.find(
                    (f: ViewerOpenFile) => f.path === mutatedPath,
                  );
                  if (deleted) {
                    setViewerOpenFiles((previousPixelSize) => {
                      const next = previousPixelSize.filter(
                        (f: ViewerOpenFile) => f.path !== mutatedPath,
                      );
                      setViewerActiveFileId((activeId: string | null) => {
                        if (activeId !== deleted.id) return activeId;
                        const closedTabIndex = previousPixelSize.findIndex(
                          (f: ViewerOpenFile) => f.id === deleted.id,
                        );
                        const newActive =
                          next[Math.min(closedTabIndex, next.length - 1)];
                        return newActive?.id || null;
                      });
                      return next;
                    });
                  }
                } else if (openFiles.some((f) => f.path === mutatedPath)) {
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

            setToolActivity((previousPixelSize) => {
              const next = applyToolExecutionToActivity(
                previousPixelSize,
                resolvedId,
                {
                  id: toolData.id,
                  name: toolData.name,
                  args: toolData.args,
                  status: toolData.status as string,
                  result: toolData.result,
                },
              );
              return next ?? previousPixelSize;
            });

            // Track segment ordering: group consecutive tool events
            // Guard: only add to segments if not already tracked
            if (toolData.status === "calling") {
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
              // TODO(cleanup): Remove "task_" startsWith once historical sessions have aged out
              (toolData.name?.includes("_task") || toolData.name?.startsWith("task_"))
            ) {
              setTasksRefreshKey((k) => k + 1);
            }

            // Auto-refresh memories panel when upsert_memory completes (MCP path)
            if (
              toolData.status !== "calling" &&
              toolData.name === "upsert_memory"
            ) {
              if (hasAnyMemoryModelSet) {
                setLeftTabBottom("memories");
              }
              setMemoriesRefreshKey((k) => k + 1);
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((r) => setTotalMemoriesCount(r.total || 0))
                .catch(() => {
                  /* Non-critical background count refresh */
                });
            }

            // Increment scheduled task notification badge when agent creates a cron job
            if (
              toolData.status === "done" &&
              toolData.name === "create_cron_job"
            ) {
              const currentNotificationCount = parseInt(
                localStorage.getItem("cron-job-notifications-count") || "0",
                10,
              );
              localStorage.setItem(
                "cron-job-notifications-count",
                String(currentNotificationCount + 1),
              );
              window.dispatchEvent(new CustomEvent("cron-job-scheduled"));
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
                  toolData.name === "delete_file" ||
                  toolData.name === "move_file"
                ) {
                  const deleted = openFiles.find(
                    (f: ViewerOpenFile) => f.path === mutatedPath,
                  );
                  if (deleted) {
                    setViewerOpenFiles((previousPixelSize) => {
                      const next = previousPixelSize.filter(
                        (f: ViewerOpenFile) => f.path !== mutatedPath,
                      );
                      setViewerActiveFileId((activeId: string | null) => {
                        if (activeId !== deleted.id) return activeId;
                        const closedTabIndex = previousPixelSize.findIndex(
                          (f: ViewerOpenFile) => f.id === deleted.id,
                        );
                        const newActive =
                          next[Math.min(closedTabIndex, next.length - 1)];
                        return newActive?.id || null;
                      });
                      return next;
                    });
                  }
                } else if (openFiles.some((f) => f.path === mutatedPath)) {
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
            setPendingApprovals((previousPixelSize) => [
              ...previousPixelSize,
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
            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
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
              // Multi-question payload (new)
              questions: data.questions || [],
              // Backward-compat single-question fields
              question: data.question || "",
              choices: data.choices || [],
              context: data.context || undefined,
            });
            // Clear processing metadata — user deliberation time should
            // not inflate TTFT (same pattern as approval gates).
            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
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
            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
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
            if (statusData?.message === "iteration_progress") {
              setAgenticProgress({
                iteration: statusData.iteration ?? 0,
                maxIterations: statusData.maxIterations ?? 0,
              });
            } else if (statusData?.message === "skills_injected") {
              setInjectedSkills(statusData.skills || []);
            } else if (statusData?.message === "compaction_started") {
              setMessages((previousMessages) => {
                const updatedMessages = [...previousMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                if (lastMessage?.role === "assistant") {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    status: "Compacting conversation...",
                    statusPhase: "processing",
                  };
                } else {
                  updatedMessages.push({
                    role: "assistant",
                    content: "",
                    status: "Compacting conversation...",
                    statusPhase: "processing",
                  });
                }
                return updatedMessages;
              });
            } else if (
              statusData?.message === "compaction_complete" ||
              statusData?.message === "compaction_failed"
            ) {
              setMessages((previousMessages) => {
                const updatedMessages = [...previousMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                if (
                  lastMessage?.role === "assistant" &&
                  lastMessage.statusPhase === "processing"
                ) {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    status: undefined,
                    statusPhase: undefined,
                  };
                }
                return updatedMessages;
              });
            } else if (statusData?.message === "context_truncated") {
              setContextTruncated({
                strategy: statusData.strategy || "",
                estimatedTokens: statusData.estimatedTokens,
              });
            } else if (statusData?.message === "tasks_updated") {
              // Ephemeral tab switch — show tasks panel then revert after 5s
              switchTabTemporarily("tasks");
              setTasksRefreshKey((k) => k + 1);
              markTabNew("tasks");
            } else if (statusData?.message === "workers_updated") {
              // Refresh workers data without switching the active tab
              setTasksRefreshKey((k) => k + 1);
              markTabNew("workers");
            } else if (statusData?.message === "memories_updated") {
              if (hasAnyMemoryModelSet) {
                // Ephemeral tab switch — show memories panel then revert after 5s
                switchTabTemporarily("memories");
                markTabNew("memories");
              }
              setMemoriesRefreshKey((k) => k + 1);
              // Re-fetch count for the tab badge (MemoriesPanel may not be mounted yet)
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((r) => setTotalMemoriesCount(r.total || 0))
                .catch(() => {});
            } else if (statusData?.message === "custom_tools_updated") {
              // Agent created/updated/deleted a custom tool — refresh the panel
              loadCustomTools();
            } else if (statusData?.message === "generation_started") {
              // Server-computed TTFT — accumulate per-iteration samples for averaging
              setMessages((previousPixelSize) => {
                const updated = [...previousPixelSize];
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
            } else if (statusData?.message === "generation_progress") {
              // Backend-computed metrics from SessionGenerationTracker —
              // authoritative aggregate across orchestrator, workers,
              // and tool sub-requests.
              setMessages((previousPixelSize) => {
                const updated = [...previousPixelSize];
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
              setMessages((previousPixelSize) => {
                const updated = [...previousPixelSize];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    status: statusData.message,
                    statusPhase: statusData.phase,
                    // Structured progress (0-1) from LM Studio prompt processing
                    _statusProgress:
                      statusData.progress != null
                        ? statusData.progress
                        : last._statusProgress,
                    // Track when processing phase started for live TTFT estimation
                    _processingStartTime:
                      statusData.phase === "processing" &&
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
                      statusData.phase === "processing"
                        ? performance.now()
                        : undefined,
                  });
                }
                return updated;
              });
            }
          },
          // -- Worker agent live events -----------------------------
          onWorkerToolExecution: (data: SSEData) => {
            if (isStale()) return;
            const workerId = data.workerId;
            if (!workerId) return;
            setWorkerToolActivity((previousPixelSize) => {
              const raw = previousPixelSize[workerId];
              const entry = {
                toolCount: 0,
                currentTool: null as string | null,
                iteration: 0,
                toolNames: {} as Record<string, number>,
                toolCalls: [] as ToolCallEvent[],
                ...raw,
              };
              const toolData = data.tool;
              if (!toolData) return previousPixelSize;

              let updatedCalls = [...entry.toolCalls];
              if (data.status === "calling") {
                const newCall: ToolCallEvent = {
                  id: toolData.id || `wtc-${Date.now()}`,
                  name: toolData.name || "unknown",
                  args: toolData.args || {},
                  status: "calling",
                };
                updatedCalls.push(newCall);

                const toolName = toolData.name || "unknown";
                const updatedToolNames: Record<string, number> = {
                  ...entry.toolNames,
                  [toolName]: (entry.toolNames[toolName] || 0) + 1,
                };
                return {
                  ...previousPixelSize,
                  [workerId]: {
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
                      toolCall.status === "calling")
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
                  ...previousPixelSize,
                  [workerId]: {
                    ...entry,
                    currentTool: null,
                    toolCalls: updatedCalls,
                    phase: undefined,
                  },
                };
              }
              return previousPixelSize;
            });
          },
          onWorkerToolOutput: (data: SSEData) => {
            if (isStale()) return;
            const workerId = data.workerId;
            const key = data.toolCallId || data.name || "";
            if (!workerId || !key) return;
            setStreamingOutputs((previousPixelSize) => {
              const updated = new Map<string, string>(previousPixelSize);
              const existing = updated.get(key) || "";
              updated.set(key, existing + (data.data || ""));
              return updated;
            });
          },
          onWorkerStatus: (data: SSEData) => {
            if (isStale()) return;
            const workerId = data.workerId;
            if (!workerId) return;
            if (data.message === "spawned") {
              // Early mapping: store workerId indexed by description
              // so SpawnAgentRenderer can look up activity before tool result arrives
              setWorkerToolActivity((previousPixelSize) => ({
                ...previousPixelSize,
                [workerId]: {
                  ...(previousPixelSize[workerId] || {
                    toolCount: 0,
                    currentTool: null,
                    iteration: 0,
                    toolNames: {},
                  }),
                  description: data.description,
                  phase: "spawned",
                },
              }));
            } else if (data.message === "iteration_progress") {
              setWorkerToolActivity((previousPixelSize) => ({
                ...previousPixelSize,
                [workerId]: {
                  ...(previousPixelSize[workerId] || {
                    toolCount: 0,
                    currentTool: null,
                  }),
                  iteration: data.iteration,
                  maxIterations: data.maxIterations,
                },
              }));
            } else if (data.message === "phase") {
              // Worker LLM phase updates (generating, thinking, processing, loading)
              setWorkerToolActivity((previousPixelSize) => ({
                ...previousPixelSize,
                [workerId]: {
                  ...(previousPixelSize[workerId] || {
                    toolCount: 0,
                    currentTool: null,
                    iteration: 0,
                  }),
                  phase: data.phase,
                  phaseLabel: data.label || undefined,
                  phaseProgress:
                    data.progress != null
                      ? data.progress
                      : (previousPixelSize[workerId]?.phaseProgress ??
                        undefined),
                },
              }));
            } else if (data.message === "generation_started") {
              // Worker server-computed TTFT — push into the shared samples array
              setMessages((previousPixelSize) => {
                const updated = [...previousPixelSize];
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
            } else if (data.message === "generation_progress") {
              setMessages((previousPixelSize) => {
                const updated = [...previousPixelSize];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  const wp = last._workerGenerationProgress || {};
                  const existing = wp[workerId] || {};
                  updated[updated.length - 1] = {
                    ...last,
                    _workerGenerationProgress: {
                      ...wp,
                      [workerId]: {
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
                        // Per-worker tok/s from burst counters
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
              // Also store on workerToolActivity so TeamCreateRenderer can
              // display live per-worker metrics on each worker's header
              setWorkerToolActivity((previousPixelSize) => {
                const existing = previousPixelSize[workerId] || {
                  toolCount: 0,
                  currentTool: null,
                  iteration: 0,
                  toolNames: {},
                };
                return {
                  ...previousPixelSize,
                  [workerId]: {
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
                    // Per-worker tok/s from burst counters
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
            } else if (data.message === "complete") {
              // Worker finished — clear phase so StatusBar stops showing "Generating..."
              setWorkerToolActivity((previousPixelSize) => ({
                ...previousPixelSize,
                [workerId]: {
                  ...(previousPixelSize[workerId] || {}),
                  phase: "complete",
                  currentTool: null,
                  durationMs: data.durationMs,
                  toolCount:
                    data.toolCount ?? previousPixelSize[workerId]?.toolCount,
                },
              }));
              // Accumulate worker usage into the streaming assistant message
              // so stats badges update in real-time per worker completion
              if (data.usage) {
                setMessages((previousPixelSize) => {
                  const updated = [...previousPixelSize];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    const wt = last._workerTokens || {
                      input: 0,
                      output: 0,
                      requests: 0,
                    };
                    // Remove completed worker from live progress so stale tok/s doesn't linger
                    const wp = { ...(last._workerGenerationProgress || {}) };
                    delete wp[workerId];
                    updated[updated.length - 1] = {
                      ...last,
                      _workerTokens: {
                        input: (wt.input || 0) + (data.usage?.inputTokens || 0),
                        output:
                          (wt.output || 0) + (data.usage?.outputTokens || 0),
                        requests:
                          (wt.requests || 0) + (data.usage?.requests || 1),
                      },
                      _workerGenerationProgress:
                        Object.keys(wp).length > 0 ? wp : undefined,
                    };
                  }
                  return updated;
                });
              }
            } else if (data.message === "failed") {
              // Worker errored — mark as failed
              setWorkerToolActivity((previousPixelSize) => ({
                ...previousPixelSize,
                [workerId]: {
                  ...(previousPixelSize[workerId] || {}),
                  phase: "failed",
                  currentTool: null,
                  error: data.error,
                },
              }));
            }
          },
          onUsageUpdate: (data: SSEData) => {
            if (isStale()) return;
            setMessages((previousPixelSize) => {
              const updated = [...previousPixelSize];
              const last = updated[updated.length - 1];
              if (last?.role !== "assistant") return previousPixelSize;

              // Background operations (memory extraction, consolidation, embeddings,
              // compaction) emit incremental usage_update events. Accumulate them
              // separately so the token badge grows smoothly instead of jumping
              // when fetchSessionStats discovers them all at once.
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
                // stored on the message so getSessionTokenStats can use it
                // as a middle priority between streaming estimate and final done.
                updated[updated.length - 1] = {
                  ...last,
                  _intermediateUsage: data.usage,
                };
              }
              return updated;
            });
          },
          onDone: (data: SSEData) => {
            console.debug(`[onDone] stream finished, isStale=${isStale()}`);
            if (!isStale()) {
              setMessages((previousPixelSize) => {
                const updated = [...previousPixelSize];
                const last = updated[updated.length - 1];
                console.debug(
                  `[onDone setMessages] previousPixelSize=${previousPixelSize.length}, last.role=${last?.role}`,
                );
                if (last?.role === "assistant") {
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
                  };
                }
                return updated;
              });
              setCurrentTurnStart(null);
              setPendingUserQuestion(null);
              fetchSessionStats(conversationId);
            }
            // SessionSummarizer runs async after SSE stream closes —
            // poll every 2s for up to 20s until new memories are detected
            (async () => {
              const baselineCount = await PrismService.getAgentMemories(
                agentProject,
                1,
                agentId,
              )
                .then((r) => r.total || 0)
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
      conversationId,
      traceId,
      disabledTools,
      autoApprove,
      planFirst,
      maxIterations,
      maxWorkerIterations,
      agentId,
      isNoAgent,
      agentProject,
      fetchSessionStats,
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
      // Track this session as generating (for history indicator even after switching away)
      const genId = conversationIdRef.current;
      console.debug(
        `[handleSend] starting generation, sessionId=${genId}, currentMessages=${messagesRef.current.length}`,
      );
      setGeneratingSessionIds((previousPixelSize) =>
        new Set(previousPixelSize).add(genId),
      );
      setToolActivity([]);
      setWorkerToolActivity({});
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
          text || (isNoAgent ? "New conversation" : "Agent session");
        resolvedTitle =
          titleText.length > 60 ? titleText.slice(0, 57) + "..." : titleText;
        setTitle(resolvedTitle);
        // Optimistic: add the session to the history list immediately
        const now = new Date().toISOString();
        setActiveId(conversationId);
        window.dispatchEvent(
          new CustomEvent("conversation:change", {
            detail: { conversationId: conversationId },
          }),
        );
        setSessions((previousPixelSize) => [
          {
            id: conversationId,
            title: resolvedTitle,
            updatedAt: now,
            createdAt: now,
          } as AgentSession,
          ...previousPixelSize,
        ]);
      }

      setCurrentTurnStart(Date.now());
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
        loadSessions();

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
              : await PrismService.getAgentSession(
                  conversationId,
                  agentProject!,
                );
            console.debug(
              `[PostStream refresh] attempt=${attempt} full?.messages?.length=${full?.messages?.length},`,
              `sessionMatch=${conversationIdRef.current === genId}`,
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
            }
          } catch (error) {
            console.error(
              "Failed to refresh session messages after done:",
              error,
            );
          }
        };
        await attemptPostStreamRefresh();
      } catch (error: unknown) {
        console.error(`[handleSend] orchestration error:`, error);
        setMessages((previousPixelSize) => [
          ...previousPixelSize,
          {
            role: "assistant",
            content: `⚠️ Error: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          },
        ]);
      } finally {
        console.debug(
          `[handleSend finally] genId=${genId}, currentSessionId=${conversationIdRef.current}, match=${conversationIdRef.current === genId}`,
        );
        // Remove this session from the generating set
        setGeneratingSessionIds((previousPixelSize) => {
          const next = new Set(previousPixelSize);
          next.delete(genId);
          return next;
        });
        // Clean up the background snapshot — session is now persisted to backend
        backgroundSessionsRef.current.delete(genId);
        // Only update local UI state if this session is still displayed
        if (conversationIdRef.current === genId) {
          setIsGenerating(false);
          SoundService.playGenerationEnd();
          isClientDrivenGenerationRef.current = false;
          abortRef.current = null;
          setCurrentTurnStart(null);
          setMessages((previousPixelSize) => {
            const last = previousPixelSize[previousPixelSize.length - 1];
            console.debug(
              `[handleSend finally setMessages] previousPixelSize=${previousPixelSize.length}, last.role=${last?.role}, last.completedAt=${last?.completedAt}`,
            );
            if (last?.role === "assistant" && !last.completedAt) {
              const updated = [...previousPixelSize];
              updated[updated.length - 1] = {
                ...last,
                completedAt: new Date().toISOString(),
              };
              return updated;
            }
            return previousPixelSize;
          });
        } else {
          console.debug(
            `[handleSend finally] session switched away, skipping UI updates`,
          );
          // Session was switched away — just clear the abort ref
          abortRef.current = null;
        }
        // Reload sessions list regardless (title/metadata may have changed)
        loadSessions();
      }
    },
    [
      handleStop,
      isGenerating,
      isNoAgent,
      setTextareaValue,
      runOrchestrationLoop,
      loadSessions,
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

  // -- Session management ----------------------------------
  const resetSessionState = useCallback(() => {
    console.debug(`[resetSessionState] clearing all messages and state`);
    setMessages([]);
    setToolActivity([]);
    setWorkerToolActivity({});
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
    setBackendSessionStats(null);
    setUnavailableWorkspace(null);
    tokenHwmRef.current = { input: 0, output: 0, total: 0 };
    isUserNearBottomRef.current = true;
    textareaRef.current?.focus();

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

      return {
        ...SETTINGS_DEFAULTS,
        provider: currentSettings.provider,
        model: currentSettings.model,
        temperature: defaultTemperature,
        maxTokens: 64000,
        functionCallingEnabled: !isNoAgent,
        thinkingEnabled: false,
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

    // Clear session from URL
    window.dispatchEvent(
      new CustomEvent("conversation:change", {
        detail: { conversationId: null },
      }),
    );
  }, [isNoAgent, config]);

  const handleNewChat = useCallback(() => {
    // If generating, snapshot the current session so user can switch back to it
    if (isGenerating) {
      const currentId = conversationIdRef.current;
      backgroundSessionsRef.current.set(currentId, {
        messages,
        title,
        toolActivity,
        workerToolActivity,
        streamingOutputs,
        pendingApprovals,
        pendingUserQuestion,
        planProposal,
        agenticProgress,
        settings: { ...settings },
        backendSessionStats,
        workspaceRoot: currentWorkspace?.path || null,
      });
      setIsGenerating(false);
    }
    // If already on a blank session, just reset directly (no pixelation needed)
    if (messages.length === 0 && !activeId) {
      resetSessionState();
      return;
    }
    // New session — instant reset, no pixelation transition needed
    resetSessionState();
  }, [
    isGenerating,
    messages,
    title,
    toolActivity,
    workerToolActivity,
    streamingOutputs,
    pendingApprovals,
    pendingUserQuestion,
    planProposal,
    agenticProgress,
    settings,
    backendSessionStats,
    activeId,
    resetSessionState,
    currentWorkspace?.path,
  ]);

  /* ── Chat header "New Session" glitch effect ────────────────── */
  const chatNewBtnRef = useRef<HTMLButtonElement | null>(null);
  const chatRainbowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatGlitchInterval = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const [chatGlitchLabel, setChatGlitchLabel] = useState<string | null>(null);

  const handleNewChatGlitch = useCallback(() => {
    const element = chatNewBtnRef.current;
    if (element) {
      element.classList.remove(chatStyles.chatHeaderNewBtnRainbow);
      void element.offsetWidth;
      element.classList.add(chatStyles.chatHeaderNewBtnRainbow);

      setChatGlitchLabel(glitchText());
      if (chatGlitchInterval.current) clearInterval(chatGlitchInterval.current);
      chatGlitchInterval.current = setInterval(() => {
        setChatGlitchLabel(glitchText());
      }, 30);

      if (chatRainbowTimer.current) clearTimeout(chatRainbowTimer.current);
      chatRainbowTimer.current = setTimeout(() => {
        element.classList.remove(chatStyles.chatHeaderNewBtnRainbow);
        if (chatGlitchInterval.current)
          clearInterval(chatGlitchInterval.current);
        chatGlitchInterval.current = null;
        setChatGlitchLabel(null);
      }, 1000);
    }
    handleNewChat();
  }, [handleNewChat]);

  /** Apply fetched/snapshot session data to component state immediately. */
  const applySessionData = useCallback(
    (
      full: (AgentSession | Conversation) & {
        workspaceRoot?: string;
        _fromSnapshot?: boolean;
        _snapshot?: SessionSnapshot;
        isGenerating?: boolean;
        pendingApproval?: {
          pending?: boolean;
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
          pending?: boolean;
          question?: string;
          questions?: unknown[];
          choices?: string[];
        };
      },
    ) => {
      if (!full) return;

      // ── Restore workspace selection from the session document ──
      // Agent sessions record which workspace they were started with;
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
        // Restoring a background generating session from snapshot
        const snap = full._snapshot;
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(snap.messages as ClientMessage[]);
        setConversationId(full.id || generateUUID());
        setActiveId(full.id || null);
        window.dispatchEvent(
          new CustomEvent("conversation:change", {
            detail: { conversationId: full.id },
          }),
        );
        setTitle(snap.title || "");
        setToolActivity(snap.toolActivity || []);
        setWorkerToolActivity(snap.workerToolActivity || {});
        setStreamingOutputs(snap.streamingOutputs || new Map());
        setPendingApprovals(snap.pendingApprovals || []);
        setPendingUserQuestion(snap.pendingUserQuestion || null);
        setPlanProposal(snap.planProposal || null);
        setAgenticProgress(snap.agenticProgress || null);
        setSettings((previousPixelSize) => ({
          ...previousPixelSize,
          ...(snap.settings as Partial<typeof previousPixelSize>),
        }));
        setBackendSessionStats(snap.backendSessionStats || null);
        // Re-attach: mark as generating so the UI shows the active state
        setIsGenerating(true);
        // Remove the snapshot — the SSE callbacks will resume updating React state
        // now that conversationIdRef matches again (isStale() → false)
        backgroundSessionsRef.current.delete(full.id || "");
      } else {
        // Normal backend-loaded session
        const displayMessages = prepareDisplayMessages(full.messages || []);
        console.debug(
          `[Session switch] id=${full.id}, raw=${full.messages?.length || 0} → display=${displayMessages.length}`,
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

        // Load pending approvals from the enriched session response
        const pendingApprovalData = full.pendingApproval;
        if (pendingApprovalData && pendingApprovalData.pending) {
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

        // Load pending questions from the enriched session response
        const pendingQuestionData = full.pendingQuestion;
        if (pendingQuestionData && pendingQuestionData.pending) {
          setPendingUserQuestion({
            questions: pendingQuestionData.questions || [],
            question: pendingQuestionData.question || "",
            choices: pendingQuestionData.choices || [],
          });
        } else {
          setPendingUserQuestion(null);
        }

        window.dispatchEvent(
          new CustomEvent("conversation:change", {
            detail: { conversationId: full.id },
          }),
        );
        setTitle(full.title || "Agent");
        setToolActivity([]);
        setWorkerToolActivity({});

        const lastAssistant = [...(full.messages || [])]
          .reverse()
          .find((message) => message.role === "assistant" && message.provider);
        if (lastAssistant) {
          const gs = lastAssistant.generationSettings || {};
          // Session-level settings (from patchConversation) represent the
          // user's latest explicit model choice and take priority over the
          // last assistant message which may reflect a previous model.
          const sessionSettings = full.settings as
            | Partial<PrismSettings>
            | undefined;
          setSettings((previousPixelSize) => ({
            ...previousPixelSize,
            ...(lastAssistant.provider && { provider: lastAssistant.provider }),
            ...(lastAssistant.model && { model: lastAssistant.model }),
            ...(gs.temperature !== undefined && {
              temperature: gs.temperature,
            }),
            ...(gs.maxTokens !== undefined && { maxTokens: gs.maxTokens }),
            ...(gs.thinkingEnabled !== undefined && {
              thinkingEnabled: gs.thinkingEnabled,
            }),
            ...(gs.reasoningEffort && { reasoningEffort: gs.reasoningEffort }),
            ...(gs.thinkingBudget !== undefined && {
              thinkingBudget: String(gs.thinkingBudget),
            }),
            // Conversations store systemPrompt at root — restore for Direct Chat
            ...(full.systemPrompt != null && {
              systemPrompt: full.systemPrompt,
            }),
            // Session-level settings override last-assistant-message values —
            // the user may have changed the model without sending a message yet
            ...(sessionSettings?.provider && {
              provider: sessionSettings.provider,
            }),
            ...(sessionSettings?.model && { model: sessionSettings.model }),
            ...(sessionSettings?.temperature !== undefined && {
              temperature: sessionSettings.temperature,
            }),
          }));
          // Model/agent URL params are stripped when conversation:change fires —
          // the loaded session's data is the source of truth.
        }
        setBackendSessionStats(full.stats || null);
        tokenHwmRef.current = { input: 0, output: 0, total: 0 };
      }
    },
    [workspaces, currentWorkspace?.path, setCurrentWorkspace],
  );

  const handleSelectSession = useCallback(
    async (conversation: AgentSession | Conversation) => {
      // If generating, snapshot the current session so user can switch back to it
      if (isGenerating) {
        const currentId = conversationIdRef.current;
        backgroundSessionsRef.current.set(currentId, {
          messages,
          title,
          toolActivity,
          workerToolActivity,
          streamingOutputs,
          pendingApprovals,
          pendingUserQuestion,
          planProposal,
          agenticProgress,
          settings: { ...settings },
          backendSessionStats,
          workspaceRoot: currentWorkspace?.path || null,
        } as SessionSnapshot);
        setIsGenerating(false);
      }
      // Already viewing this session — just scroll to bottom instantly
      if (conversation.id === activeId) {
        endRef.current?.scrollIntoView({ behavior: "instant" });
        return;
      }

      // Start pixel-out animation concurrently — acts as a loading veil
      // for slower connections. Gets interrupted by the "in" reveal once
      // data arrives (no waiting for the out animation to finish).
      setPixelTransition("out");
      const loadStart = performance.now();

      // If the target session is still generating in the background,
      // restore from the in-memory snapshot instead of hitting the backend
      // (which would 404 because the session hasn't been persisted yet).
      const snapshot = backgroundSessionsRef.current.get(conversation.id!);
      if (snapshot && generatingSessionIds.has(conversation.id)) {
        applySessionData({
          id: conversation.id,
          title: snapshot.title,
          messages: snapshot.messages,
          stats: snapshot.backendSessionStats ?? undefined,
          workspaceRoot: snapshot.workspaceRoot || undefined,
          _fromSnapshot: true,
          _snapshot: snapshot,
        } as Parameters<typeof applySessionData>[0]);
        recordPixelLoadTime(performance.now() - loadStart);
        setPixelTransition("in");
        return;
      }

      try {
        const full = isNoAgent
          ? await PrismService.getConversation(conversation.id!)
          : await PrismService.getAgentSession(conversation.id!, agentProject!);
        applySessionData(full);
        recordPixelLoadTime(performance.now() - loadStart);
        setPixelTransition("in");
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const is404 =
          errorMessage.includes("404") || errorMessage.includes("not found");
        if (is404) {
          console.warn(
            `Session ${conversation.id} not yet persisted (still generating?) — skipping switch`,
          );
        } else {
          console.error("Failed to load session:", error);
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
      workerToolActivity,
      streamingOutputs,
      pendingApprovals,
      pendingUserQuestion,
      planProposal,
      agenticProgress,
      settings,
      backendSessionStats,
      generatingSessionIds,
      applySessionData,
      recordPixelLoadTime,
      currentWorkspace?.path,
    ],
  );

  // -- Real-Time Background Synchronization (Change Streams) -----
  const refreshActiveSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId !== conversationIdRef.current) return;
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
          `[refreshActiveSession] skipping — session ${sessionId} is currently generating (client-driven)`,
        );
        return;
      }
      try {
        const full = isNoAgent
          ? await PrismService.getConversation(sessionId)
          : await PrismService.getAgentSession(sessionId, agentProject!);
        if (full && full.id === conversationIdRef.current) {
          applySessionData(full);
        }
      } catch (error) {
        console.error(
          "Failed to refresh active session via change stream:",
          error,
        );
      }
    },
    [isNoAgent, agentProject, applySessionData],
  );

  useEffect(() => {
    let listRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedListRefresh = () => {
      if (listRefreshTimer) clearTimeout(listRefreshTimer);
      listRefreshTimer = setTimeout(() => {
        loadSessions();
      }, 500);
    };

    const onCollectionChange = (event: IrisCollectionChangeEvent) => {
      if (
        event.collection !== "agent_conversations" &&
        event.collection !== "model_conversations"
      ) {
        return;
      }

      // Active session update → refresh its messages in-place
      if (event.id && event.id === conversationIdRef.current) {
        refreshActiveSession(event.id);
      }

      // New or externally modified session → refresh the sidebar list.
      // Inserts always warrant a list refresh; updates for non-active
      // sessions (e.g., title changes from background summarization)
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
  }, [refreshActiveSession, loadSessions]);

  const handleUndoDelete = useCallback(
    (conversationId: string, toastId: number) => {
      const pending = pendingDeletionsRef.current.get(conversationId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingDeletionsRef.current.delete(conversationId);

        // Restore the session to sessions state
        setSessions((previousPixelSize) => {
          if (previousPixelSize.some((sessionItem) => sessionItem.id === conversationId))
            return previousPixelSize;
          const updated = [...previousPixelSize, pending.session];
          // Sort by updatedAt or createdAt descending
          return updated.sort((sessionA, sessionB) => {
            const dateA = new Date(sessionA.updatedAt || sessionA.createdAt || 0).getTime();
            const dateB = new Date(sessionB.updatedAt || sessionB.createdAt || 0).getTime();
            return dateB - dateA;
          });
        });

        if (pending.wasActive) {
          handleSelectSession(pending.session);
        }

        // Dismiss the toast
        removeToast(toastId);
      }
    },
    [removeToast, handleSelectSession],
  );

  const handleDeleteSession = useCallback(
    async (conversationId: string) => {
      try {
        const session = sessions.find((sessionItem) => sessionItem.id === conversationId);
        if (!session) return;

        const wasActive = activeId === conversationId;

        // Optimistically remove from state
        setSessions((previousPixelSize) =>
          previousPixelSize.filter((sessionItem) => sessionItem.id !== conversationId),
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
              await PrismService.deleteAgentSession(conversationId, agentProject!);
            }
          } catch (error) {
            console.error("Failed to delete session:", error);
          }
        }, 10000);

        // Store in pending deletions
        pendingDeletionsRef.current.set(conversationId, {
          timeoutId,
          session,
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
        console.error("Failed to delete session:", error);
      }
    },
    [
      activeId,
      handleNewChat,
      agentProject,
      isNoAgent,
      sessions,
      addToast,
      handleUndoDelete,
    ],
  );

  // -- Open file in the FileViewerPanel (shared by workspace tree & mention badges) --
  const handleOpenFileInViewer = useCallback(
    (absPath: string) => {
      const existingTab = viewerOpenFiles.find((f) => f.path === absPath);
      if (existingTab) {
        setViewerActiveFileId(existingTab.id);
      } else {
        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setViewerOpenFiles((previousPixelSize) => [
          ...previousPixelSize,
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
            icon: <span className={tabBarStyles.tabEmojiIcon}>🛠︎</span>,
            tooltip: "Settings",
          },
          {
            key: "params",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🎚︎</span>,
            tooltip: "Parameters",
          },
          ...(!isNoAgent &&
          ((currentWorkspace && hasFileOperations) || unavailableWorkspace)
            ? [
                {
                  key: "workspace",
                  icon: <span className={tabBarStyles.tabEmojiIcon}>📂</span>,
                  tooltip: "Workspace",
                },
              ]
            : []),
          {
            key: "info",
            icon: <span className={tabBarStyles.tabEmojiIcon}>📄</span>,
            tooltip: "Info",
          },
          ...(!isNoAgent
            ? [
                {
                  key: "workers",
                  icon: <span className={tabBarStyles.tabEmojiIcon}>🤖</span>,
                  ...badgeProps(workersCount, "workers"),
                  badgeRainbow: Object.values(workerToolActivity).some(
                    (worker: WorkerActivityEntry) =>
                      worker.currentTool ||
                      worker.phase === "generating" ||
                      worker.phase === "thinking",
                  ),
                  tooltip: "Workers",
                },
              ]
            : []),
          {
            key: "requests",
            icon: <span className={tabBarStyles.tabEmojiIcon}>📊</span>,
            ...badgeProps(
              backendSessionStats?.requestCount || 0,
              "requests",
            ),
            tooltip: "Requests",
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
          setNewDataTabs((previousPixelSize) => {
            if (!previousPixelSize.has(tab)) return previousPixelSize;
            const next = new Set(previousPixelSize);
            next.delete(tab);
            return next;
          });
        }}
      />

      {leftTab === "settings" && (
        <>
          <SidebarTabHeaderComponent icon={Settings} title="Settings" />
          <SettingsPanel
            config={filteredConfig}
            settings={settings}
            onChange={
              isNoAgent
                ? (updates: Partial<PrismSettings>) =>
                    setSettings((s) => ({ ...s, ...updates }))
                : (updates: Partial<PrismSettings>) =>
                    setSettings((s) => ({
                      ...s,
                      ...updates,
                      functionCallingEnabled: true,
                    }))
            }
            _hasAssistantImages={false}
            lockedTools={isNoAgent ? new Set() : AGENT_LOCKED_TOOLS}
            hideSystemPrompt={!isNoAgent}
            sessionType={isNoAgent ? "chat" : "agent"}
            canSpawnWorkers={
              !isNoAgent && (activeAgentData?.canSpawnWorkers || false)
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
                      onChange: () => setPlanFirst((v) => !v),
                    },
                    {
                      key: "auto",
                      icon: <Zap size={12} />,
                      label: "Auto Approve Tool Use",
                      checked: autoApprove,
                      onChange: () => setAutoApprove((v) => !v),
                    },
                    {
                      key: "criticGate",
                      icon: <ShieldCheck size={12} />,
                      label: "Critic Gate",
                      checked: criticGateEnabled,
                      onChange: () => {
                        setCriticGateEnabled((v) => {
                          const next = !v;
                          localStorage.setItem(
                            "agent:criticGateEnabled",
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
                          "agent:maxIterations",
                          String(next),
                        );
                      },
                    },
                    {
                      key: "workerIterations",
                      type: "cycle",
                      icon: <Repeat size={12} />,
                      label: "Max Worker Tool Iterations",
                      value: maxWorkerIterations,
                      isActive: true,
                      title: "Click to cycle: 10 → 25 → 50 → 100 → ∞",
                      onChange: () => {
                        const steps = [10, 25, 50, 100, Infinity];
                        const index = steps.indexOf(maxWorkerIterations);
                        const next = steps[(index + 1) % steps.length];
                        setMaxWorkerIterations(next);
                        localStorage.setItem(
                          "agent:maxWorkerIterations",
                          String(next),
                        );
                      },
                    },
                  ]
            }
            sessionStats={
              (messages.length > 0
                ? backendSessionStats
                  ? (() => {
                      const mapSubStats = (sub: SessionStats | undefined) => {
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
                      // authoritative, monotonic token counts from SessionGenerationTracker.
                      // _backgroundUsage accumulates tokens from fire-and-forget LLM calls
                      // (memory extraction, consolidation) as they complete.
                      // When done, use backendSessionStats which includes everything.
                      const lastMessage = messages[messages.length - 1];
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
                        backendSessionStats.totalOutputTokens || 0,
                        liveOutput,
                      );
                      const tokenInput = Math.max(
                        backendSessionStats.totalInputTokens || 0,
                        liveInput,
                      );
                      const tokenTotal = Math.max(
                        backendSessionStats.totalTokens || 0,
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
                          (backendSessionStats.requestCount || 0) +
                          (bgUsage?.requests || 0) +
                          (hasActiveUncountedRequest ? 1 : 0),
                        uniqueModels: [
                          ...new Set([
                            ...(backendSessionStats.models || []),
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
                              backendSessionStats.totalCacheReadInputTokens ||
                              0,
                            cacheWrite:
                              backendSessionStats.totalCacheCreationInputTokens ||
                              0,
                            reasoning:
                              backendSessionStats.totalReasoningOutputTokens ||
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
                          (backendSessionStats.totalCost || 0) +
                          (bgUsage?.cost || 0),
                        originalTotalCost: 0,
                        // Merge backend toolCounts, client capabilities, and live
                        // worker tool counts into a single usedTools array
                        usedTools: mergeUsedToolsWithWorkers(
                          usedTools,
                          backendSessionStats.toolCounts,
                          workerToolActivity,
                        ),
                        modalities: (() => {
                          const raw =
                            backendSessionStats.modalities || modalities || {};
                          const mapped: Record<string, boolean> = {};
                          for (const [key, value] of Object.entries(raw)) {
                            mapped[key] = !!value;
                          }
                          return mapped;
                        })(),
                        completedElapsedTime:
                          backendSessionStats.totalElapsedTime ||
                          completedElapsedTime,
                        currentTurnStart,
                        conversationStartTime: messages.length > 0 ? messages[0]?.timestamp : null,
                        liveStreamingTokens,
                        liveStreamingStartTime,
                        liveStreamingLastChunkTime,
                        liveStreamingBurstTokens,
                        liveStreamingBurstElapsed,
                        workerGenerationProgress,
                        lastTimeToGeneration,
                        liveProcessingStartTime,
                        liveProcessingPhase,
                        liveTtftSamples,
                        liveGenProgress,
                        avgTokensPerSec:
                          backendSessionStats.avgTokensPerSec || null,
                        avgTimeToGeneration:
                          backendSessionStats.avgTimeToGeneration || null,
                        orchestrator: mapSubStats(
                          backendSessionStats.orchestrator,
                        ),
                        workers: mapSubStats(backendSessionStats.workers),
                      } as DisplaySessionStats;
                    })()
                  : (() => {
                      // -- Client-side fallback (live generation, no backend data yet) --
                      // When _liveGenProgress exists, use backend-authoritative token
                      // counts instead of the client-side computeSessionStats math.
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
                        // Merge client-side usedTools with live worker tool counts
                        usedTools: mergeUsedToolsWithWorkers(
                          usedTools,
                          null,
                          workerToolActivity,
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
                        workerGenerationProgress,
                        lastTimeToGeneration,
                        liveProcessingStartTime,
                        liveProcessingPhase,
                        liveTtftSamples,
                        liveGenProgress,
                      } as DisplaySessionStats;
                    })()
                : null) as DisplaySessionStats | null
            }
          />
        </>
      )}

      {leftTab === "params" && (
        <>
          <SidebarTabHeaderComponent icon={SlidersHorizontal} title="Parameters" />
          <ParametersPanelComponent
            settings={settings}
            onChange={(updates: Partial<PrismSettings>) =>
              setSettings((s) => ({ ...s, ...updates }))
            }
            config={filteredConfig}
            isAgentMode={!isNoAgent}
          />
        </>
      )}

      {leftTab === "workspace" && (
        <>
          <SidebarTabHeaderComponent
            icon={FolderOpen}
            title="Workspace"
            count={workspaceTreeStats?.totalEntries}
            countSuffix={workspaceTreeStats?.truncated ? "+" : ""}
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
          <SidebarTabHeaderComponent icon={Info} title="Model Info" />
          <ModelInfoPanel config={filteredConfig} settings={settings} />
        </>
      )}

      {leftTab === "workers" && (
        <>
          <SidebarTabHeaderComponent icon={Bot} title="Workers" count={workersCount} actions={workersHeaderActions} />
          <WorkersPanel
            conversationId={conversationId}
            refreshKey={tasksRefreshKey}
            onCountChange={setWorkersCount}
            onActionsChange={setWorkersHeaderActions}
            workerToolActivity={workerToolActivity}
          />
        </>
      )}

      {leftTab === "requests" && (
        <>
          <SidebarTabHeaderComponent icon={BarChart3} title="Requests" count={backendSessionStats?.requestCount || 0} />
          <SessionRequestsListComponent
            conversationId={conversationId}
            refreshKey={requestsRefreshKey}
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
            icon: <span className={tabBarStyles.tabEmojiIcon}>🔧</span>,
            ...badgeProps(allToolSchemas.length, "tools"),
            tooltip: "Tools",
            tooltipDisabled: !settings.functionCallingEnabled,
          },
          ...(!isNoAgent
            ? [
                {
                  key: "skills",
                  icon: <span className={tabBarStyles.tabEmojiIcon}>📖</span>,
                  ...badgeProps(
                    skills.filter((s) => s.enabled).length,
                    "skills",
                  ),
                  tooltip: "Skills",
                },
                {
                  key: "rules",
                  icon: <span className={tabBarStyles.tabEmojiIcon}>📏</span>,
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
                        icon: <span className={tabBarStyles.tabEmojiIcon}>🧠</span>,
                        ...badgeProps(totalMemoriesCount, "memories"),
                        tooltip: "Memories",
                      },
                    ]
                  : []),
                {
                  key: "tasks",
                  icon: <span className={tabBarStyles.tabEmojiIcon}>✅</span>,
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
          setNewDataTabs((previousPixelSize) => {
            if (!previousPixelSize.has(tab)) return previousPixelSize;
            const next = new Set(previousPixelSize);
            next.delete(tab);
            return next;
          });
        }}
      />

      {leftTabBottom === "tools" && (
        <>
          <SidebarTabHeaderComponent
            icon={Wrench}
            title="Tools"
            count={`${enabledConfigurableCount + (isCoreToolsLocked ? coreToolsCount : enabledCoreToolsCount)} / ${configurableTools.length + coreToolsCount}`}
            hasOnlyCoreToolsActive={enabledConfigurableCount === 0 && (isCoreToolsLocked || enabledCoreToolsCount === 0)}
          />
          <CustomToolsPanel
            tools={customTools}
            onToolsChange={loadCustomTools}
            project={agentProject}
            builtInTools={builtInTools}
            disabledTools={disabledTools}
            onToggleBuiltIn={handleToggleBuiltIn}
            onToggleAllBuiltIn={handleToggleAllBuiltIn}
            lockedOffTools={lockedOffTools}
            agent={!isNoAgent}
            coreToolsLocked={!isNoAgent && (activeAgentData?.coreToolsLocked ?? true)}
          />
        </>
      )}

      {leftTabBottom === "skills" && (
        <>
          <SidebarTabHeaderComponent icon={BookOpen} title="Skills" count={skills.length} actions={skillsHeaderActions} />
          <SkillsPanel
            skills={skills}
            onSkillsChange={loadSkills}
            project={agentProject}
            onActionsChange={setSkillsHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "rules" && (
        <>
          <SidebarTabHeaderComponent icon={ScrollText} title="Rules" count={rules.length} actions={rulesHeaderActions} />
          <RulesPanel
            rules={rules}
            onRulesChange={loadRules}
            agent={agentId}
            onActionsChange={setRulesHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "memories" && hasAnyMemoryModelSet && (
        <>
          <SidebarTabHeaderComponent icon={Brain} title="Memories" count={totalMemoriesCount} actions={memoriesHeaderActions} />
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
          <SidebarTabHeaderComponent icon={ListChecks} title="Tasks" count={tasksCount} actions={tasksHeaderActions} />
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
    <div className={chatStyles.container}>
      {/* -- Chat header bar (always visible "New Session") -- */}
      <div className={chatStyles.chatHeader}>
        <div className={chatStyles.chatHeaderTitle}>
          <span className={chatStyles.chatHeaderTitleText}>{title || ""}</span>
        </div>
        <div className={chatStyles.chatHeaderActions}>
          {hasSystemContextMessage && (
            <div className={chatStyles.debugToggleContainer}>
              <ButtonComponent
                variant={!showRaw ? "tonal" : "text"}
                size="small"
                onClick={() => setShowRaw(false)}
                className={chatStyles.debugToggleButton}
              >
                Clean
              </ButtonComponent>
              <ButtonComponent
                variant={showRaw ? "tonal" : "text"}
                size="small"
                onClick={() => setShowRaw(true)}
                className={chatStyles.debugToggleButton}
              >
                Raw
              </ButtonComponent>
            </div>
          )}
          <ButtonComponent
            ref={chatNewBtnRef}
            variant="primary"
            size="small"
            icon={chatGlitchLabel ? undefined : Plus}
            onClick={handleNewChatGlitch}
            disabled={messages.length === 0 && !activeId}
            className={`${chatStyles.chatHeaderNewButton} ${chatGlitchLabel ? chatStyles.chatHeaderNewBtnGlitch : ""}`}
            title="Start a new session"
          >
            {chatGlitchLabel || "New Session"}
          </ButtonComponent>
        </div>
      </div>
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
      {/* Messages */}
      <div
        className={`${chatStyles.messagesList} ${agentBackgroundImage ? chatStyles.hasBackground : ""}`}
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
          />
        )}

        <MessageList
          messages={filteredMessages}
          showRaw={showRaw}
          isGenerating={isGenerating}
          streamingOutputs={streamingOutputs}
          workerToolActivity={workerToolActivity}
          activeAgent={activeAgentData}
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
        {pendingApprovals
          .filter((approvalItem) => approvalItem.status === "pending")
          .map((approval) => (
            <ApprovalCardComponent
              key={approval.id}
              toolName={approval.toolName}
              toolArgs={approval.toolArgs}
              tier={approval.tier}
              onApprove={() => {
                setPendingApprovals((previousPixelSize) =>
                  previousPixelSize.map((approvalItem) =>
                    approvalItem.id === approval.id ? { ...approvalItem, status: "approved" } : approvalItem,
                  ),
                );
                PrismService.sendApprovalResponse(conversationId, true).catch(
                  console.error,
                );
              }}
              onReject={() => {
                setPendingApprovals((previousPixelSize) =>
                  previousPixelSize.map((approvalItem) =>
                    approvalItem.id === approval.id ? { ...approvalItem, status: "rejected" } : approvalItem,
                  ),
                );
                PrismService.sendApprovalResponse(conversationId, false).catch(
                  console.error,
                );
              }}
              onApproveAll={() => {
                setPendingApprovals((previousPixelSize) =>
                  previousPixelSize.map((approvalItem) =>
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
        {pendingUserQuestion && (
          <UserQuestionCardComponent
            questions={pendingUserQuestion.questions}
            question={pendingUserQuestion.question}
            choices={pendingUserQuestion.choices}
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

      {/* -- Status indicator bar (rainbow canvas above input) -- */}
      {(() => {
        const lastMessage = messages[messages.length - 1];

        // Derive raw status phase/label with robust local fallbacks when cloud models
        // do not emit explicit status events or when messages lack statusPhase metadata.
        let derivedPhase = null;
        let derivedLabel = null;

        if (isGenerating && lastMessage?.role === "assistant") {
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

        const rawPhase = isGenerating
          ? derivedPhase || lastMessage?.statusPhase || "starting"
          : null;

        const rawLabel = isGenerating
          ? derivedLabel || lastMessage?.status || "Starting..."
          : undefined;

        const hasActiveTools = toolActivity.some((t) => t.status === "calling");
        // Detect awaiting-approval state (plan proposal or tool approval pending)
        const isAwaitingApproval =
          planProposal?.status === "pending" ||
          pendingApprovals.some((approvalItem) => approvalItem.status === "pending") ||
          pendingUserQuestion !== null;

        // -- Derive phase from live worker activity --------------
        // When coordinator tools (team_create) are executing, the
        // orchestrator bar should reflect the aggregate worker state
        // rather than a static "Thinking...". Scan workerToolActivity
        // for the dominant phase among active workers.
        let workerDerivedPhase = null;
        let workerDerivedLabel = null;
        if (hasActiveTools && Object.keys(workerToolActivity).length > 0) {
          const workers = Object.values(workerToolActivity);
          const activeWorkers = workers.filter(
            (worker: WorkerActivityEntry) =>
              worker.phase &&
              worker.phase !== "complete" &&
              worker.phase !== "failed" &&
              worker.phase !== "spawned",
          );
          if (activeWorkers.length > 0) {
            // Priority: generating > thinking > processing > loading > starting
            const phasePriority = [
              "generating",
              "thinking",
              "processing",
              "loading",
              "starting",
            ];
            for (const phase of phasePriority) {
              const count = activeWorkers.filter(
                (worker: WorkerActivityEntry) => worker.phase === phase,
              ).length;
              if (count > 0) {
                workerDerivedPhase = phase;
                const total = activeWorkers.length;
                // Multiple workers — show aggregate count; single worker uses default phase label (null)
                workerDerivedLabel =
                  total > 1
                    ? `${count}/${total} worker${total !== 1 ? "s" : ""} ${phase}…`
                    : null;
                break;
              }
            }
          }
        }

        const activeTool = toolActivity.find((t) => t.status === "calling");
        const activeToolLabel = activeTool
          ? `Running tool ${renderToolName(activeTool.name)}...`
          : "Processing...";

        const phase = isGenerating
          ? isAwaitingApproval
            ? "awaiting"
            : workerDerivedPhase || (hasActiveTools ? "processing" : rawPhase)
          : null;
        const label = isGenerating
          ? isAwaitingApproval
            ? "Awaiting For User Input..."
            : workerDerivedPhase
              ? workerDerivedLabel
              : hasActiveTools
                ? activeToolLabel
                : rawLabel
          : undefined;
        // Structured progress (0-1) from LM Studio prompt processing / model loading
        const progress =
          phase === "processing" || phase === "loading"
            ? (lastMessage?._statusProgress ?? null)
            : null;

        // Orchestrator tok/s from burst-scoped generation metrics.
        // Show whenever the model is actively streaming chunks — including
        // during tool-call JSON generation (where hasActiveTools is true but
        // chunks are still flowing). We check chunk freshness rather than
        // phase labels to avoid going stale while the model streams FC args.
        let orchestratorTokPerSec = null;
        const CHUNK_FRESH_MS = 2000;
        const isChunksFlowing =
          liveStreamingLastChunkTime &&
          performance.now() - liveStreamingLastChunkTime < CHUNK_FRESH_MS;
        const isOrchestratorGenerating =
          ((phase === "generating" || phase === "thinking") &&
            !workerDerivedPhase) ||
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
            phase={phase}
            label={label}
            progress={progress}
            tokPerSec={orchestratorTokPerSec}
            iteration={agenticProgress?.iteration || 0}
            maxIterations={
              Number.isFinite(maxIterations) ? maxIterations : undefined
            }
          />
        );
      })()}

      <div
        className={`${chatStyles.inputWrapper} ${!settings.provider || !settings.model ? chatStyles.inputWrapperDisabled : ""}`}
      >
        <form
          onSubmit={handleSend}
          className={`${chatStyles.inputBox} ${isDragging ? chatStyles.inputBoxDragActive : ""} ${isGenerating ? chatStyles.inputBoxGenerating : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          {queuedNextTurn && (
            <div className={chatStyles.queuedMessage}>
              <div className={chatStyles.queuedHeader}>
                <div className={chatStyles.queuedHeaderLeft}>
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
                  className={chatStyles.removeAttachment}
                  title="Edit queue"
                >
                  <X size={14} />
                </button>
              </div>
              {queuedNextTurn.text && (
                <div className={chatStyles.queuedText}>
                  {queuedNextTurn.text}
                </div>
              )}
              {queuedNextTurn.images?.length > 0 && (
                <div className={chatStyles.queuedImagesCount}>
                  <Paperclip size={12} /> {queuedNextTurn.images.length}{" "}
                  image(s)
                </div>
              )}
            </div>
          )}
          {isDragging && (
            <div className={chatStyles.dragOverlay}>
              <Paperclip size={20} />
              <span>
                Drop {[...supportedInputModalities].join(", ")} files here
              </span>
            </div>
          )}
          {(pendingImages.length > 0 || pendingFiles.length > 0) && (
            <div className={chatStyles.pendingImages}>
              {pendingImages.map((dataUrl, i) => (
                <div key={`img-${i}`} className={chatStyles.pendingAttachmentWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt="Attached"
                    className={chatStyles.pendingImg}
                    onClick={() => setLightboxSourceUrl(dataUrl)}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className={chatStyles.removeAttachment}
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
                  <div key={`file-${i}`} className={chatStyles.pendingAttachmentWrap}>
                    <div className={chatStyles.pendingFileThumb}>
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
                      className={chatStyles.removeAttachment}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Active rule badges are now inline in the contentEditable */}
          <div className={chatStyles.inputRow}>
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
              className={chatStyles.editableInput}
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
            {/* ── Slash Command Picker ── */}
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
                    className={chatStyles.mentionDropdown}
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--color-amber) 30%, var(--calculated-border-color))",
                    }}
                  >
                    <div className={chatStyles.mentionList}>
                      {filteredRules.map((rule) => (
                        <button
                          key={rule.id || rule._id?.toString()}
                          type="button"
                          className={chatStyles.mentionItem}
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
            {/* ── Mention Autocomplete Dropdown ── */}
            {mentionOpen && mentionResults.length > 0 && (
              <div className={chatStyles.mentionDropdown}>
                <div className={chatStyles.mentionList} ref={mentionListRef}>
                  {mentionResults.map((entry, i) => (
                    <button
                      key={entry.path}
                      type="button"
                      className={`${chatStyles.mentionItem} ${i === mentionIndex ? chatStyles.mentionItemActive : ""}`}
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
                      <span className={chatStyles.mentionItemPath}>
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
      {lightboxSourceUrl && (
        <ImagePreviewComponent
          src={lightboxSourceUrl}
          onClose={() => setLightboxSourceUrl(null)}
          onUseAnnotated={(dataUrl: string) => {
            setPendingImages((previousPixelSize) => [
              ...previousPixelSize,
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
        navSidebar={
          <NavigationSidebarComponent
            mode="user"
            isGenerating={isGenerating}
            activeApiCount={activeApiCount}
          />
        }
        leftPanel={leftPanel}
        leftPanelBottom={leftPanelBottom}
        leftTitle={undefined}
        fileViewerPanel={
          !isNoAgent &&
          currentWorkspace &&
          hasFileOperations && (
            <FileViewerPanelComponent
              openFiles={viewerOpenFiles}
              activeFileId={viewerActiveFileId}
              onSelectFile={setViewerActiveFileId}
              onCloseFile={(id: string) => {
                setViewerOpenFiles((previousPixelSize) => {
                  const next = previousPixelSize.filter((f) => f.id !== id);
                  // If the closed tab was active, switch to the nearest tab
                  if (id === viewerActiveFileId) {
                    const closedTabIndex = previousPixelSize.findIndex(
                      (f: ViewerOpenFile) => f.id === id,
                    );
                    const newActive =
                      next[Math.min(closedTabIndex, next.length - 1)];
                    setViewerActiveFileId(newActive?.id || null);
                  }
                  return next;
                });
              }}
              onFileNotFound={(id: string) => {
                // Auto-close tabs for files that no longer exist
                setViewerOpenFiles((previousPixelSize) => {
                  const next = previousPixelSize.filter((f) => f.id !== id);
                  setViewerActiveFileId((activeId: string | null) => {
                    if (activeId !== id) return activeId;
                    const closedTabIndex = previousPixelSize.findIndex(
                      (f: ViewerOpenFile) => f.id === id,
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
          <HistoryPanel
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            onNew={handleNewChat}
            onDelete={handleDeleteSession}
            disableNew={messages.length === 0 && !activeId}
            newLabel="New Session"
            emptyText="No recent sessions"
            searchText="Search sessions..."
            countLabel="sessions"
            generatingSessionIds={generatingSessionIds as Set<string>}
            hasMore={sessionsHasMore}
            loadingMore={sessionsLoading}
            onLoadMore={loadMoreSessions}
          />
        }
        rightTitle={`${sessions.length}${sessionsHasMore ? "+" : ""} Sessions`}
        sessionType="agent"
        headerCenter={
          <div className={layoutHeaderStyles["header-center-group"]}>
            {agents.length > 1 && (
              <AgentPickerComponent
                agents={agents}
                activeAgentId={agentId}
                onSelect={(id: string) => {
                  // Agent switching is handled by the parent page via URL/state
                  // Emit a custom event or call a callback
                  window.dispatchEvent(
                    new CustomEvent("agent:switch", {
                      detail: { agentId: id },
                    }),
                  );
                }}
                disabled={isGenerating}
              />
            )}
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={{ provider: settings.provider, model: settings.model }}
              disabled={isGenerating}
              onSelectModel={(provider: string, modelName: string) => {
                const modelDef = (
                  filteredConfig?.textToText?.models?.[provider] || []
                ).find((model: ModelOption) => model.name === modelName);
                const temp = modelDef?.defaultTemperature ?? 1.0;
                setSettings((s) => ({
                  ...s,
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
                  new CustomEvent("model:change", {
                    detail: { provider, model: modelName },
                  }),
                );
              }}
              favorites={favoriteKeys}
              onToggleFavorite={async (key: string) => {
                if (favoriteKeys.includes(key)) {
                  setFavoriteKeys((previousPixelSize) =>
                    previousPixelSize.filter((k) => k !== key),
                  );
                  PrismService.removeFavorite("model", key).catch(() => {});
                } else {
                  setFavoriteKeys((previousPixelSize) => [
                    ...previousPixelSize,
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
