"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  BotMessageSquare,
  Paperclip,
  X,
  ClipboardList,
  Zap,
  Settings,
  Wrench,
  Brain,
  Plug,
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
} from "lucide-react";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import {
  Message,
  PrismConfig,
  AgentSession,
  CustomTool,
  Skill,
  MCPServer,
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
import ThreePanelLayout, { layoutStyles } from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import HistoryPanel from "./HistoryPanelComponent";
import SettingsPanel, { SessionStats as DisplaySessionStats } from "./SettingsPanelComponent";
import ModelInfoPanel from "./ModelInfoPanelComponent";
import CustomToolsPanel from "./CustomToolsPanelComponent";
import SkillsPanel from "./SkillsPanelComponent";
import MemoriesPanel from "./MemoriesPanelComponent";
import TasksPanel from "./TasksPanelComponent";
import MCPServersPanel from "./MCPServersPanelComponent";
import CoordinatorPanel from "./CoordinatorPanelComponent";
import WorkersPanel from "./WorkersPanelComponent";
import ParametersPanelComponent from "./ParametersPanelComponent";
import SessionRequestsListComponent from "./SessionRequestsListComponent";
import WorkspaceTreePanelComponent from "./WorkspaceTreePanelComponent";
import FileViewerPanelComponent from "./FileViewerPanelComponent";
import MessageList, { prepareDisplayMessages } from "./MessageListComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";

import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ApprovalCardComponent from "./ApprovalCardComponent";
import UserQuestionCardComponent from "./UserQuestionCardComponent";

import StatusBarComponent from "./StatusBarComponent";
import PixelTransitionComponent from "./PixelTransitionComponent";

import { buildToolSchemas } from "../utils/FunctionCallingUtilities";

import useSessionStats from "../hooks/useSessionStats";
import {
  mergeUsedToolsWithWorkers,
  toolCountsToUsedTools,
  generateUUID,
  resolveDefaultModel,
} from "../utils/utilities";
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
  TabBarComponent,
} from "@rodrigo-barraza/components-library";
import useToolToggles from "../hooks/useToolToggles";
import useModelMemory from "../hooks/useModelMemory";
import AgentPickerComponent from "./AgentPickerComponent";
import AgentBadgeComponent from "./AgentBadgeComponent";
import WorkspaceSelectorComponent from "./WorkspaceSelectorComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import WorkspaceService from "../services/WorkspaceService";
import {
  serializeEditable,
  flattenTree,
  detectMentionToken,
  filterMentionResults,
  createMentionBadge as _createMentionBadge,
  placeCaretAfter,
  applyMentionToTextNode,
} from "../utils/mentionUtils";

// -- Per-agent empty state config ---------------------------------
const AGENT_EMPTY_STATE = {
  CODING: {
    title: "Coding Agent",
    subtitle:
      "Read, edit, search, and browse your codebase with AI-powered tools.",
    placeholder: "Ask me to read, edit, search, or explore your codebase...",
  },
  OMNI: {
    title: "Omni Agent",
    subtitle:
      "Universal agent with access to every tool — coding, web, health, finance, smart home, and more.",
    placeholder: "Ask me anything — I have access to all tools...",
  },
  LUPOS: {
    title: "Lupos",
    subtitle:
      "The insane wolf king. Web search, image generation, trends, and more.",
    placeholder: "Talk to the wolf king...",
  },
  STICKERS: {
    title: "Clankerbox",
    subtitle:
      "Sticker-designing vending machine. Image generation and web search.",
    placeholder: "Ask Clankerbox to create something...",
  },
  DIGEST: {
    title: "Digest",
    subtitle:
      "Evidence-based nutrition & exercise coach. USDA data, meal planning, calorie tracking, and workout search.",
    placeholder:
      "Ask about nutrition, exercises, meal plans, or calorie targets...",
  },
  IMAGE: {
    title: "Image Agent",
    subtitle:
      "A visionary AI artist. Creative prompt design, image generation, visual styles, and inspiration.",
    placeholder: "Describe the image or concept you want to create...",
  },
};

const DEFAULT_EMPTY_STATE = {
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

function glitchText(len = 6) {
  let result = "";
  for (let i = 0; i < len; i++) {
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

/** No-agent empty state — raw chat via /chat endpoint, no agentic loop. */
const NONE_EMPTY_STATE: EmptyStateConfig = {
  title: "Direct Chat",
  subtitle: "Raw model interaction — no agentic loop, no persona.",
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
  [key: string]: string | number | boolean | null | undefined | Record<string, number>;
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
  pendingUserQuestion: { question?: string; questions?: unknown[]; choices?: string[]; context?: string } | null;
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

export interface AgentComponentProps {
  agentId?: string;
  agents?: Array<AgentPersona | (Partial<AgentPersona> & { id: string; name: string })>;
  initialFcEnabled?: boolean;
  initialThinkingEnabled?: boolean;
  initialModel?: string | null;
  initialSessionId?: string | null;
}

export default function AgentComponent({
  agentId: propAgentId = "CODING",
  agents = [],
  initialFcEnabled = false,
  initialThinkingEnabled = false,
  initialModel = null,
  initialSessionId = null,
}: AgentComponentProps) {
  // Track whether the URL model param has been applied — prevents re-apply on re-render
  const urlModelAppliedRef = useRef<boolean>(false);
  // Track whether the URL session param has been consumed
  const urlSessionAppliedRef = useRef<boolean>(false);
  const agentId = propAgentId;
  const isNoAgent = agentId === "NONE";
  const activeAgentData = agents.find((a) => a.id === agentId);
  // Direct Chat omits project so it uses the default x-project header — this
  // routes persistence to the conversations collection.
  // Agent modes use the persona's project so persistence goes to agent_conversations.
  const agentProject = isNoAgent
    ? undefined
    : activeAgentData?.project ||
      (agentId.toUpperCase() === "CODING" ? "coding" : "prism-chat");
  const agentBackgroundImage = activeAgentData?.backgroundImage || "";
  const rawEmptyState: EmptyStateConfig = isNoAgent
    ? NONE_EMPTY_STATE
    : (AGENT_EMPTY_STATE as Record<string, EmptyStateConfig>)[agentId] ||
      (activeAgentData?.name
        ? {
            title: activeAgentData.name,
            subtitle:
              activeAgentData.description ||
              "AI-powered agent with tool access.",
            placeholder: `Talk to ${activeAgentData.name}...`,
          }
        : DEFAULT_EMPTY_STATE);
  const emptyState = {
    ...rawEmptyState,
    subtitle: activeAgentData?.description || rawEmptyState.subtitle,
  };

  const { currentWorkspace, setCurrentWorkspace, workspaces } = useWorkspace();

  // -- State ----------------------------------------------------
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [queuedNextTurn, setQueuedNextTurn] = useState<QueuedNextTurn | null>(null);
  const inputValueRef = useRef<string>("");
  const [hasInput, setHasInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toolActivity, setToolActivity] = useState<ToolCallEvent[]>([]);
  const [streamingOutputs, setStreamingOutputs] = useState<Map<string, string>>(new Map());
  const [agentSessionId, setAgentSessionId] = useState(() => generateUUID());
  const [traceId, setTraceId] = useState(() => generateUUID());
  const [sessions, setSessions] = useState<Array<AgentSession | Conversation>>([]);
  const sessionsCursorRef = useRef<string | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [title, setTitle] = useState(isNoAgent ? "Direct Chat" : "Agent");
  const [leftTab, setLeftTab] = useState("settings"); // "settings" | "tools"
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [builtInTools, setBuiltInTools] = useState<ToolSchema[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [_injectedSkills, setInjectedSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [memoriesRefreshKey, setMemoriesRefreshKey] = useState(0);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [workspaceTreeRefreshKey, setWorkspaceTreeRefreshKey] = useState(0);
  // When a loaded session references a workspace that isn't currently connected,
  // store the path so the UI can show "workspace not available" instead of looping errors.
  const [unavailableWorkspace, setUnavailableWorkspace] = useState<string | null>(null);

  // -- File viewer pane state (VS Code-style read-only viewer) --
  const [viewerOpenFiles, setViewerOpenFiles] = useState<ViewerOpenFile[]>([]);
  const [viewerActiveFileId, setViewerActiveFileId] = useState<string | null>(null);
  const [viewerRefreshKey, setViewerRefreshKey] = useState(0);
  const viewerOpenFilesRef = useRef<ViewerOpenFile[]>(viewerOpenFiles);
  viewerOpenFilesRef.current = viewerOpenFiles;
  const [viewerWidth, setViewerWidth] = useState(() => {
    if (typeof window === "undefined") return 500;
    const stored = localStorage.getItem(LS_FILE_VIEWER_WIDTH);
    return stored ? Math.max(300, Math.min(Number(stored), 1200)) : 500;
  });
  const [totalMemoriesCount, setTotalMemoriesCount] = useState(0);
  const [workersCount, setWorkersCount] = useState(0);
  const [workerToolActivity, setWorkerToolActivity] = useState<Record<string, WorkerActivityEntry>>({});

  // Track which tabs have received new data the user hasn't viewed yet
  const [newDataTabs, setNewDataTabs] = useState(new Set());
  const leftTabRef = useRef<string>(leftTab);
  leftTabRef.current = leftTab;

  /** Mark a tab as having new unseen data (only if user isn't already viewing it). */
  const markTabNew = useCallback((tabKey: string) => {
    if (leftTabRef.current === tabKey) return;
    setNewDataTabs((prev) => {
      if (prev.has(tabKey)) return prev;
      const next = new Set(prev);
      next.add(tabKey);
      return next;
    });
  }, []);

  // Ephemeral tab switch — temporarily show a tab then revert after a delay.
  // Cancels any pending revert to avoid stacking timeouts.
  const tabRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTabTemporarily = useCallback((targetTab: string, delayMs = 5000) => {
    // Already viewing this tab — keep them there, no revert needed
    const previousTab = leftTabRef.current;
    if (previousTab === targetTab) return;
    // Cancel any pending revert from a previous ephemeral switch
    if (tabRevertTimerRef.current) clearTimeout(tabRevertTimerRef.current);
    setLeftTab(targetTab);
    tabRevertTimerRef.current = setTimeout(() => {
      tabRevertTimerRef.current = null;
      // Only revert if the user hasn't manually navigated away
      if (leftTabRef.current === targetTab) {
        setLeftTab(previousTab);
      }
    }, delayMs);
  }, []);

  // Count concurrent API calls: main generation + active worker agents
  const activeApiCount = useMemo(() => {
    const activeWorkers = Object.values(workerToolActivity).filter(
      (w: WorkerActivityEntry) =>
        w.currentTool || w.phase === "generating" || w.phase === "thinking",
    ).length;
    return (isGenerating ? 1 : 0) + activeWorkers;
  }, [isGenerating, workerToolActivity]);
  const [tasksCount, setTasksCount] = useState(0);
  const [memoryConfigured, setMemoryConfigured] = useState(false);
  // -- Agent-scoped storage keys ---------------------------------
  const toolMemoryKey =
    agentId === "CODING"
      ? SK_TOOL_MEMORY_AGENT
      : SK_TOOL_MEMORY_AGENT_PREFIX + agentId;
  const modelMemoryKey =
    agentId === "CODING"
      ? SK_MODEL_MEMORY_AGENT
      : SK_MODEL_MEMORY_AGENT_PREFIX + agentId;

  const { disabledBuiltIns, handleToggleBuiltIn, handleToggleAllBuiltIn } =
    useToolToggles(builtInTools, toolMemoryKey);

  // -- Model memory (persist last-used model per agent) ----------
  const { saveModel, restoreModel } = useModelMemory(modelMemoryKey);
  const [settings, setSettings] = useState<PrismSettings & {
    maxTokens: number;
    functionCallingEnabled: boolean;
    thinkingEnabled: boolean;
    codeExecutionEnabled?: boolean;
    urlContextEnabled?: boolean;
  }>({
    ...SETTINGS_DEFAULTS,
    maxTokens: 64000,
    // Agents always need FC for tool orchestration; Direct Chat defaults off
    // to avoid injecting large tool schemas into local model contexts.
    functionCallingEnabled: initialFcEnabled ? true : !isNoAgent,
    thinkingEnabled: initialThinkingEnabled
      ? true
      : SETTINGS_DEFAULTS.thinkingEnabled || false,
  });

  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
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
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [pendingUserQuestion, setPendingUserQuestion] = useState<{ question?: string; questions?: unknown[]; choices?: string[]; context?: string } | null>(null);
  const [planProposal, setPlanProposal] = useState<{plan: string; steps?: string[]; status?: string} | null>(null); // { plan, steps, status }
  const [agenticProgress, setAgenticProgress] = useState<{iteration: number; maxIterations: number} | null>(null); // { iteration, maxIterations }
  const [_contextTruncated, setContextTruncated] = useState<{strategy: string; estimatedTokens?: number} | null>(null); // { strategy, estimatedTokens }
  const [currentTurnStart, setCurrentTurnStart] = useState<number | null>(null); // Date.now() when user sends
  const [backendSessionStats, setBackendSessionStats] = useState<SessionStats | null>(null);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);

  // Frontend-side high-water marks for token display.
  // Ensures the token badges never show a lower number than previously
  // displayed, regardless of which computation path produced the values.
  const tokenHwmRef = useRef<{input: number; output: number; total: number}>({ input: 0, output: 0, total: 0 });

  // -- Pixelation transition state ----------------------------
  const [pixelTransition, setPixelTransition] = useState<'out' | 'in' | null>(null); // 'out' | 'in' | null

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
    const prev = stored ? Number(stored) : PIXEL_DEFAULT_OUT;
    const next = alpha * elapsed + (1 - alpha) * prev;
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
  const SCROLL_BOTTOM_THRESHOLD = 20;

  const agentSessionIdRef = useRef<string>(agentSessionId);
  agentSessionIdRef.current = agentSessionId;
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
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.completedAt) {
        const updated = [...prev];
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
      return prev;
    });

    // Force all active workers to terminal state so their StatusBarComponent
    // bars stop animating — the SSE stream was aborted before "complete" events
    // could arrive, leaving activity entries stuck in active phases.
    setWorkerToolActivity((prev) => {
      const hasActive = Object.values(prev).some(
        (w: WorkerActivityEntry) => w.phase && w.phase !== "complete" && w.phase !== "failed",
      );
      if (!hasActive) return prev;
      const next: Record<string, WorkerActivityEntry> = {};
      for (const [id, w] of Object.entries(prev)) {
        next[id] =
          w.phase && w.phase !== "complete" && w.phase !== "failed"
            ? { ...w, phase: "complete", currentTool: null }
            : w;
      }
      return next;
    });

    // Explicitly abort any running workers for this session — belt-and-suspenders
    // alongside the backend SSE disconnect handler
    // Direct Chat (NONE) has no workers — skip.
    if (!isNoAgent) {
      PrismService.stopCoordinatorWorkers(agentSessionIdRef.current).catch(
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
      } as PrismConfig;
    }

    const textModelsMap = config.textToText?.models || {};
    const filteredTextModels: Record<string, ModelOption[]> = {};

    for (const [provider, models] of Object.entries(
      textModelsMap as Record<string, ModelOption[]>,
    )) {
      const fcModels = models.filter((m: ModelOption) =>
        m.tools?.includes("Tool Calling"),
      );
      if (fcModels.length > 0) filteredTextModels[provider] = fcModels;
    }

    const filteredProviderList = (config.providerList || []).filter(
      (p) => filteredTextModels[p],
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
    } as PrismConfig;
  }, [config, isNoAgent]);

  // -- Model capability detection ------------------------------
  const supportsImageInput = useMemo(() => {
    if (!filteredConfig) return false;
    const models = filteredConfig.textToText?.models?.[settings.provider ?? ""] || [];
    const modelDef = models.find((m: ModelOption) => m.name === settings.model) as (ModelOption & { inputTypes?: string[] }) | undefined;
    return modelDef?.inputTypes?.includes("image") ?? false;
  }, [filteredConfig, settings.provider, settings.model]);

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
      .then((favs: Array<{key: string}>) => setFavoriteKeys(favs.map((f) => f.key)))
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
      const modelDef = providerModels.find((m) => m.name === urlModelName);
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
      const { provider, model, temperature } = resolveDefaultModel(config, !isNoAgent);
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
    const modelDef = providerModels.find((m) => m.name === settings.model);
    if (!modelDef) return;

    // Check if the model is an always-on thinking model (e.g. Gemini 3.5 Flash)
    const canDisable =
      !modelDef.thinkingLevels ||
      modelDef.thinkingLevels.includes("minimal");
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
        : await PrismService.getAgentSessions(agentProject!, { agent: agentId });
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
      const fetchOptions = { cursor: sessionsCursorRef.current, agent: agentId };
      const result = isNoAgent
        ? await PrismService.getConversations(fetchOptions)
        : await PrismService.getAgentSessions(agentProject!, fetchOptions);
      setSessions((prev) => [...prev, ...result.items]);
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
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(displayMessages);
        setAgentSessionId(full.id || generateUUID());
        setTraceId(full.traceId || null);
        setActiveId(full.id || null);
        setTitle(full.title || (isNoAgent ? "Direct Chat" : "Agent"));
        setToolActivity([]);
        setWorkerToolActivity({});

        const lastAssistant = [...(full.messages || [])]
          .reverse()
          .find((m) => m.role === "assistant" && m.provider);
        if (lastAssistant) {
          const gs = (lastAssistant.generationSettings || {}) as Record<string, string | number | boolean | undefined>;
          setSettings((prev) => ({
            ...prev,
            ...(lastAssistant.provider && { provider: lastAssistant.provider }),
            ...(lastAssistant.model && { model: lastAssistant.model }),
            ...(gs.temperature !== undefined && {
              temperature: Number(gs.temperature),
            }),
            ...(gs.maxTokens !== undefined && { maxTokens: Number(gs.maxTokens) }),
            ...(gs.thinkingEnabled !== undefined && {
              thinkingEnabled: Boolean(gs.thinkingEnabled),
            }),
            ...(gs.reasoningEffort && { reasoningEffort: String(gs.reasoningEffort) }),
            ...(gs.thinkingBudget && { thinkingBudget: String(gs.thinkingBudget) }),
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
      const s = await PrismService.getSkills(agentProject);
      setSkills(s);
    } catch (error: unknown) {
      console.error("Failed to load skills:", error);
    }
  }, [agentProject]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Load MCP servers
  const loadMCPServers = useCallback(async () => {
    try {
      const s = await PrismService.getMCPServers(agentProject);
      setMcpServers(s);
    } catch (error: unknown) {
      console.error("Failed to load MCP servers:", error);
    }
  }, [agentProject]);

  useEffect(() => {
    loadMCPServers();
  }, [loadMCPServers]);

  // Fetch built-in tools for the active agent (filtered server-side by persona)
  // NONE = no agent filter → all tools exposed
  useEffect(() => {
    async function loadAgenticTools() {
      // Trigger Prism to re-fetch from tools-api (picks up newly added tools)
      try {
        await PrismService.refreshBuiltInToolSchemas();
      } catch {
        // Non-fatal — Prism may still have a stale cache
      }

      const tools = await PrismService.getBuiltInToolSchemas(
        isNoAgent ? undefined : agentId,
      );
      setBuiltInTools(tools);
    }
    loadAgenticTools().catch(console.error);
  }, [agentId, isNoAgent]);

  // -- Fetch memory settings to determine if memories are configured --
  useEffect(() => {
    PrismService.getSettings()
      .then((s: PrismSettings) => {
        const mem = s?.memory;
        setMemoryConfigured(
          Boolean(
            mem &&
            mem.extractionProvider &&
            mem.extractionModel &&
            mem.consolidationProvider &&
            mem.consolidationModel &&
            mem.embeddingProvider &&
            mem.embeddingModel,
          ),
        );
      })
      .catch(() => setMemoryConfigured(false));
  }, []);

  // Tools that are force-disabled because a prerequisite isn't met
  const lockedOffTools = useMemo(() => {
    const set = new Set<string>();
    if (!memoryConfigured) set.add("upsert_memory");
    return set;
  }, [memoryConfigured]);

  // -- Eager-fetch tab badge counts (fires on mount / session change) --

  useEffect(() => {
    PrismService.getAgentMemories(agentProject, 1, agentId)
      .then((r) => setTotalMemoriesCount(r.total || 0))
      .catch(() => {});
  }, [agentProject, agentId]);

  useEffect(() => {
    ToolsApiService.getAllAgenticTasks({ agentSessionId })
      .then((r) =>
        setTasksCount(r.summary?.total || (r.tasks || []).length),
      )
      .catch(() => {});
  }, [agentSessionId, tasksRefreshKey]);

  useEffect(() => {
    PrismService.getCoordinatorWorkers(agentSessionId)
      .then((r) => setWorkersCount((r.workers || []).length))
      .catch(() => {});
  }, [agentSessionId, tasksRefreshKey]);

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
    setSessions((prev) => {
      const index = prev.findIndex((s) => s.id === activeId);
      if (index === -1) return prev;
      const existing = prev[index] as unknown as Record<string, unknown>;
      // Only patch if something actually changed to avoid churn
      const resolvedCost = (backendSessionStats?.totalCost ?? totalCost) as number;
      const resolvedModalities: Record<string, number> =
        (backendSessionStats?.modalities ?? modalities) as Record<string, number>;
      const resolvedToolCounts =
        backendSessionStats?.toolCounts ?? undefined;
      const resolvedProviders =
        uniqueProviders.length > 0 ? uniqueProviders : existing.providers;
      const resolvedModels =
        uniqueModels.length > 0 ? uniqueModels : existing._liveModelNames;
      // Shallow equality check — skip update if nothing visually changed
      const prevMod = existing._liveModalities as Record<string, number> | undefined;
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
        return prev;
      }
      const updated = [...prev] as unknown as Record<string, unknown>[];
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
      // doesn't have the stats aggregation endpoint — skip.
      if (isNoAgent) return;
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
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last._backgroundUsage) {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...last,
                    _backgroundUsage: undefined,
                  };
                  return updated;
                }
                return prev;
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
    () => buildToolSchemas(builtInTools, disabledBuiltIns, customTools),
    [customTools, builtInTools, disabledBuiltIns],
  );

  // Derive whether the active agent has File Operations capability
  const hasFileOps = useMemo(
    () =>
      builtInTools.some((t) => t.domain === "Agentic: File Operations"),
    [builtInTools],
  );

  // -- Memoize filtered messages for MessageList to prevent ref churn --
  const filteredMessages = useMemo(
    () =>
      messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages],
  );

  // ── Editable serialization ─────────────────────────────────────
  // The input is a contentEditable div. Mention badges are non-editable
  // <span data-mention-path="..."> elements. We serialize them back to
  // `@full/path` when sending so the model gets the real file reference.
  // Pure logic lives in mentionUtils.js; here we just wire it up.

  /** Create a styled mention badge span (wraps the pure fn). */
  const createMentionBadge = useCallback(
    (path: string, name: string, type: string | undefined, badgeOpts?: Parameters<typeof _createMentionBadge>[3]) => {
      return _createMentionBadge(path, name, type, badgeOpts);
    },
    [],
  );

  // -- Stable input change handler -----------------------------
  const handleInputChange = useCallback((_e: React.FormEvent<HTMLDivElement>) => {
    const element = textareaRef.current;
    if (!element) return;
    const value = serializeEditable(element);
    inputValueRef.current = value;
    const nowHasInput = value.trim().length > 0;
    setHasInput((prev) => (prev !== nowHasInput ? nowHasInput : prev));
    // -- Mention autocomplete detection --
    detectMentionQueryRef.current?.(element);
  }, []);

  // Helper to programmatically set the editable value (quick prompts, queue cancel)
  const setTextareaValue = useCallback((text: string) => {
    inputValueRef.current = text;
    setHasInput(text.trim().length > 0);
    if (textareaRef.current) {
      textareaRef.current.textContent = text;
    }
  }, []);

  /** Strip HTML on paste — contentEditable should only accept plain text. */
  const handleEditablePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
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
  }, []);

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
      const sel = window.getSelection();
      const range =
        sel && sel.rangeCount && element.contains(sel.anchorNode)
          ? sel.getRangeAt(0)
          : null;
      if (range) {
        const container = range.startContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          const characterCount = container.textContent
            ? container.textContent[range.startOffset - 1]
            : "";
          if (characterCount && characterCount !== " " && characterCount !== "\n") {
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
      const sel = window.getSelection();
      const range =
        sel && sel.rangeCount && element.contains(sel.anchorNode)
          ? sel.getRangeAt(0)
          : null;
      if (range) {
        const container = range.startContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          const characterCount = container.textContent
            ? container.textContent[range.startOffset - 1]
            : "";
          if (characterCount && characterCount !== " " && characterCount !== "\n") {
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
        setKnownPaths(flat.map((e) => e.path).filter((p): p is string => typeof p === "string"));
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
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !element.contains(sel.anchorNode)) {
        setMentionOpen(false);
        return;
      }
      const anchor = sel.anchorNode as Text | null;
      if (
        !anchor ||
        anchor.nodeType !== Node.TEXT_NODE ||
        !anchor.textContent
      ) {
        setMentionOpen(false);
        return;
      }
      const result = detectMentionToken(anchor.textContent, sel.anchorOffset);
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
  const detectMentionQueryRef = useRef<((el: HTMLDivElement) => void) | null>(detectMentionQuery);
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
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const badge = createMentionBadge(entry.path || '', entry.name, entry.type);
      const space = applyMentionToTextNode(
        node,
        offset,
        sel.anchorOffset,
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

  // -- Image handlers ------------------------------------------
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        if (ev.target?.result) {
          setPendingImages((prev) => [...prev, ev.target?.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) =>
      prev.filter((_, i) => i !== index),
    );
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (supportsImageInput && e.dataTransfer?.items?.length > 0) {
        setIsDragging(true);
      }
    },
    [supportsImageInput],
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
      if (!supportsImageInput) return;
      const files = Array.from(e.dataTransfer?.files || []);
      const images = files.filter((f) => f.type.startsWith("image/"));
      for (const file of images) {
        const reader = new FileReader();
        reader.onload = (ev: ProgressEvent<FileReader>) => {
          if (ev.target?.result) {
            setPendingImages((prev) => [...prev, ev.target?.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [supportsImageInput],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (!supportsImageInput) return;
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;
      e.preventDefault();
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = (ev: ProgressEvent<FileReader>) => {
          if (ev.target?.result) {
            setPendingImages((prev) => [...prev, ev.target?.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [supportsImageInput],
  );

  // -- Orchestration loop ---------------------------------------
  const runOrchestrationLoop = useCallback(
    async (sessionMessages: ClientMessage[], resolvedTitle: string) => {
      const currentMessages = [...sessionMessages];
      // Capture which session this generation belongs to — if the user
      // switches sessions, streaming callbacks will skip UI updates.
      const genSessionId = agentSessionIdRef.current;

      await new Promise<void>((resolve, reject) => {
        // -- Build payload: Direct Chat (/chat) vs Agent (/agent) --
        const payload = isNoAgent
          ? {
              // Direct Chat: raw /chat endpoint — no agentic loop
              provider: settings.provider ?? "",
              model: settings.model ?? "",
              messages: [
                ...(settings.systemPrompt
                  ? [{ role: "system" as const, content: settings.systemPrompt }]
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
                disabledBuiltIns: [...disabledBuiltIns],
              }),
              // Provider-native capabilities
              ...(settings.webSearchEnabled ? { webSearch: true } : {}),
              ...(settings.codeExecutionEnabled
                ? { codeExecution: true }
                : {}),
              ...(settings.urlContextEnabled
                ? { urlContext: true }
                : {}),
              // Persistence — use agentSessionId as conversationId for /chat
              conversationId: agentSessionId,
              // Also pass agentSessionId so request logs are queryable by session
              agentSessionId,
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
              disabledBuiltIns: [...disabledBuiltIns],
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
              agentSessionId,
              conversationMeta: { title: resolvedTitle },
              traceId,
              agent: agentId,
              // Phase 1: Agentic controls
              autoApprove,
              planFirst,
              maxIterations: Number.isFinite(maxIterations) ? maxIterations : 0,
              maxWorkerIterations: Number.isFinite(maxWorkerIterations)
                ? maxWorkerIterations
                : 0,
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
        const isStale = () => agentSessionIdRef.current !== genSessionId;

        // Direct Chat → streamText (/chat); Agents → streamAgentText (/agent)
        const streamFn = isNoAgent
          ? PrismService.streamText
          : PrismService.streamAgentText;
        abortRef.current = streamFn(payload, {
          onChunk: (content: string, _sourceModel?: string, outputCharacters?: number) => {
            streamedText += content;
            // Backend sends authoritative running token count on each chunk
            burstTokens++;
            // Skip UI updates if user switched sessions
            if (isStale()) return;
            const now = performance.now();
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
            setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg?.role === "assistant") {
                lastMsg.content = cleanText;
                lastMsg.contentSegments = snapshotSegments();
                lastMsg.textFragments = [...textFragments];
                lastMsg.thinkingFragments = [...thinkingFragments];
                lastMsg._streamingOutputCharacters = outputCharacters || 0;
                lastMsg._streamingStartTime = firstChunkTime;
                lastMsg._streamingLastChunkTime = now;
                lastMsg._streamingBurstTokens = burstTokens;
                lastMsg._streamingBurstElapsed = burstElapsed;
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

            setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg?.role === "assistant") {
                lastMsg.thinking = streamedThinking;
                lastMsg.contentSegments = snapshotSegments();
                lastMsg.thinkingFragments = [...thinkingFragments];
                lastMsg._streamingOutputCharacters = outputCharacters || 0;
                lastMsg._streamingStartTime = firstChunkTime;
                lastMsg._streamingLastChunkTime = now;
                lastMsg._streamingBurstTokens = burstTokens;
                lastMsg._streamingBurstElapsed = burstElapsed;
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
            setMessages((prev) => {
              const updated = [...prev];
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
            const tc = data.tool;
            if (!tc) return;
            setToolActivity((prev: ToolCallEvent[]) => {
              let updated: ToolCallEvent[] = [];
              const resolvedId = tc.id || `tc-${Date.now()}-${Math.random()}`;
              if (data.status === "calling") {
                // Deduplicate: skip if this tool ID was already registered
                if (prev.some((a) => a.id === resolvedId)) {
                  return prev;
                }
                updated = [
                  ...prev,
                  {
                    id: resolvedId,
                    name: tc.name || "unknown",
                    args: tc.args || {},
                    status: "calling",
                    timestamp: Date.now(),
                  },
                ];
                // Track segment ordering: group consecutive tool events
                // Guard: only add to segments if not already tracked
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
              } else {
                updated = prev.map((activity) => {
                  if (
                    (tc.id && activity.id === tc.id) ||
                    (!tc.id &&
                      activity.name === (tc.name || "unknown") &&
                      activity.status === "calling")
                  ) {
                    return {
                      ...activity,
                      status: data.status,
                      result: tc.result,
                      args: tc.args || {},
                    };
                  }
                  return activity;
                });
              }
              setMessages((msgPrev: ClientMessage[]) => {
                const array = [...msgPrev];
                const last = array[array.length - 1];
                if (last?.role === "assistant") {
                  array[array.length - 1] = {
                    ...last,
                    toolCalls: updated,
                    contentSegments: snapshotSegments(),
                    textFragments: [...textFragments],
                    thinkingFragments: [...thinkingFragments],
                  };
                } else {
                  // Tool events can arrive before any text chunks — create placeholder
                  array.push({
                    role: "assistant",
                    content: "",
                    toolCalls: updated,
                    contentSegments: snapshotSegments(),
                    textFragments: [...textFragments],
                    thinkingFragments: [...thinkingFragments],
                  });
                }
                return array;
              });
              return updated;
            });

            // Auto-refresh tasks panel when any task tool completes
            if (data.status !== "calling" && (tc.name || "").startsWith("task_")) {
              setTasksRefreshKey((k) => k + 1);
            }

            // Auto-refresh memories panel when upsert_memory completes
            if (data.status !== "calling" && tc.name === "upsert_memory") {
              setLeftTab("memories");
              setMemoriesRefreshKey((k) => k + 1);
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((r) => setTotalMemoriesCount(r.total || 0))
                .catch(() => {
                  /* Non-critical background count refresh */
                });
            }

            // Auto-refresh workspace tree when filesystem-mutating tools complete
            if (data.status !== "calling" && WORKSPACE_FS_TOOLS.has(tc.name || "")) {
              setWorkspaceTreeRefreshKey((k) => k + 1);

              // Live-update file viewer: refresh open tabs whose path was touched
              const mutatedPath = (tc.args?.path as string) || (tc.args?.source as string) || null;
              const openFiles = viewerOpenFilesRef.current;
              if (mutatedPath && openFiles.length > 0) {
                // delete_file and move_file both remove the source path
                if (tc.name === "delete_file" || tc.name === "move_file") {
                  const deleted = openFiles.find(
                    (f: ViewerOpenFile) => f.path === mutatedPath,
                  );
                  if (deleted) {
                    setViewerOpenFiles((prev) => {
                      const next = prev.filter(
                        (f: ViewerOpenFile) => f.path !== mutatedPath,
                      );
                      setViewerActiveFileId((activeId: string | null) => {
                        if (activeId !== deleted.id) return activeId;
                        const closedIdx = prev.findIndex(
                          (f: ViewerOpenFile) => f.id === deleted.id,
                        );
                        const newActive =
                          next[Math.min(closedIdx, next.length - 1)];
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
          onToolCall: (tc: ToolCallEvent) => {
            if (isStale()) return;
            setToolActivity((prev) => {
              let updated;
              const resolvedId = tc.id || `tc-${Date.now()}-${Math.random()}`;
              if (tc.status === "calling") {
                // Deduplicate: skip if this tool ID was already registered
                if (prev.some((a) => a.id === resolvedId)) {
                  return prev;
                }
                updated = [
                  ...prev,
                  {
                    id: resolvedId,
                    name: tc.name,
                    args: tc.args,
                    status: "calling",
                    timestamp: Date.now(),
                  },
                ];
                // Track segment ordering: group consecutive tool events
                // Guard: only add to segments if not already tracked
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
              } else {
                // done or error — update existing entry
                updated = prev.map((activity) => {
                  if (
                    (tc.id && activity.id === tc.id) ||
                    (!tc.id &&
                      activity.name === tc.name &&
                      activity.status === "calling")
                  ) {
                    return {
                      ...activity,
                      status: tc.status,
                      result: tc.result,
                      ...(tc.args && Object.keys(tc.args).length > 0
                        ? { args: tc.args }
                        : {}),
                    };
                  }
                  return activity;
                });
              }
              setMessages((msgPrev: ClientMessage[]) => {
                const array = [...msgPrev];
                const last = array[array.length - 1];
                if (last?.role === "assistant") {
                  array[array.length - 1] = {
                    ...last,
                    toolCalls: updated,
                    contentSegments: snapshotSegments(),
                    textFragments: [...textFragments],
                    thinkingFragments: [...thinkingFragments],
                  };
                } else {
                  array.push({
                    role: "assistant",
                    content: "",
                    toolCalls: updated,
                    contentSegments: snapshotSegments(),
                    textFragments: [...textFragments],
                    thinkingFragments: [...thinkingFragments],
                  });
                }
                return array;
              });
              return updated;
            });

            // Auto-refresh tasks panel when any task tool completes (MCP path)
            if (tc.status !== "calling" && tc.name?.startsWith("task_")) {
              setTasksRefreshKey((k) => k + 1);
            }

            // Auto-refresh memories panel when upsert_memory completes (MCP path)
            if (tc.status !== "calling" && tc.name === "upsert_memory") {
              setLeftTab("memories");
              setMemoriesRefreshKey((k) => k + 1);
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((r) => setTotalMemoriesCount(r.total || 0))
                .catch(() => {
                  /* Non-critical background count refresh */
                });
            }

            // Auto-refresh workspace tree when FS-mutating tools complete (MCP path)
            if (tc.status !== "calling" && WORKSPACE_FS_TOOLS.has(tc.name)) {
              setWorkspaceTreeRefreshKey((k) => k + 1);

              // Live-update file viewer (MCP path)
              const mutatedPath = tc.args?.path || tc.args?.source || null;
              const openFiles = viewerOpenFilesRef.current;
              if (mutatedPath && openFiles.length > 0) {
                // delete_file and move_file both remove the source path
                if (tc.name === "delete_file" || tc.name === "move_file") {
                  const deleted = openFiles.find(
                    (f: ViewerOpenFile) => f.path === mutatedPath,
                  );
                  if (deleted) {
                    setViewerOpenFiles((prev) => {
                      const next = prev.filter(
                        (f: ViewerOpenFile) => f.path !== mutatedPath,
                      );
                      setViewerActiveFileId((activeId: string | null) => {
                        if (activeId !== deleted.id) return activeId;
                        const closedIdx = prev.findIndex(
                          (f: ViewerOpenFile) => f.id === deleted.id,
                        );
                        const newActive =
                          next[Math.min(closedIdx, next.length - 1)];
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
              setStreamingOutputs((prev: Map<string, string>) => {
                const updated = new Map<string, string>(prev);
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
            setPendingApprovals((prev) => [
              ...prev,
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
            setMessages((prev) => {
              const updated = [...prev];
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
            setMessages((prev) => {
              const updated = [...prev];
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
            setMessages((prev) => {
              const updated = [...prev];
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
              // Ephemeral tab switch — show memories panel then revert after 5s
              switchTabTemporarily("memories");
              setMemoriesRefreshKey((k) => k + 1);
              markTabNew("memories");
              // Re-fetch count for the tab badge (MemoriesPanel may not be mounted yet)
              PrismService.getAgentMemories(agentProject, 1, agentId)
                .then((r) => setTotalMemoriesCount(r.total || 0))
                .catch(() => {});
            } else if (statusData?.message === "custom_tools_updated") {
              // Agent created/updated/deleted a custom tool — refresh the panel
              loadCustomTools();
            } else if (statusData?.message === "generation_started") {
              // Server-computed TTFT — accumulate per-iteration samples for averaging
              setMessages((prev) => {
                const updated = [...prev];
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
              setMessages((prev) => {
                const updated = [...prev];
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
              setMessages((prev) => {
                const updated = [...prev];
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
            setWorkerToolActivity((prev) => {
              const raw = prev[workerId];
              const entry = {
                toolCount: 0,
                currentTool: null as string | null,
                iteration: 0,
                toolNames: {} as Record<string, number>,
                ...raw,
              };
              if (data.status === "calling") {
                const toolName = data.tool?.name || "unknown";
                const updatedToolNames: Record<string, number> = {
                  ...entry.toolNames,
                  [toolName]: (entry.toolNames[toolName] || 0) + 1,
                };
                return {
                  ...prev,
                  [workerId]: {
                    ...entry,
                    currentTool: toolName,
                    toolCount: entry.toolCount + 1,
                    toolNames: updatedToolNames,
                    phase: undefined, // Clear phase — tool is now active
                  },
                };
              }
              // done/error — clear currentTool, phase will be set by next chunk event
              return {
                ...prev,
                [workerId]: { ...entry, currentTool: null, phase: undefined },
              };
            });
          },
          onWorkerStatus: (data: SSEData) => {
            if (isStale()) return;
            const workerId = data.workerId;
            if (!workerId) return;
            if (data.message === "spawned") {
              // Early mapping: store workerId indexed by description
              // so SpawnAgentRenderer can look up activity before tool result arrives
              setWorkerToolActivity((prev) => ({
                ...prev,
                [workerId]: {
                  ...(prev[workerId] || {
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
              setWorkerToolActivity((prev) => ({
                ...prev,
                [workerId]: {
                  ...(prev[workerId] || {
                    toolCount: 0,
                    currentTool: null,
                  }),
                  iteration: data.iteration,
                  maxIterations: data.maxIterations,
                },
              }));
            } else if (data.message === "phase") {
              // Worker LLM phase updates (generating, thinking, processing, loading)
              setWorkerToolActivity((prev) => ({
                ...prev,
                [workerId]: {
                  ...(prev[workerId] || {
                    toolCount: 0,
                    currentTool: null,
                    iteration: 0,
                  }),
                  phase: data.phase,
                  phaseLabel: data.label || undefined,
                  phaseProgress:
                    data.progress != null
                      ? data.progress
                      : (prev[workerId]?.phaseProgress ?? undefined),
                },
              }));
            } else if (data.message === "generation_started") {
              // Worker server-computed TTFT — push into the shared samples array
              setMessages((prev) => {
                const updated = [...prev];
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
              setMessages((prev) => {
                const updated = [...prev];
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
              setWorkerToolActivity((prev) => {
                const existing = prev[workerId] || {
                  toolCount: 0,
                  currentTool: null,
                  iteration: 0,
                  toolNames: {},
                };
                return {
                  ...prev,
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
              setWorkerToolActivity((prev) => ({
                ...prev,
                [workerId]: {
                  ...(prev[workerId] || {}),
                  phase: "complete",
                  currentTool: null,
                  durationMs: data.durationMs,
                  toolCount: data.toolCount ?? prev[workerId]?.toolCount,
                },
              }));
              // Accumulate worker usage into the streaming assistant message
              // so stats badges update in real-time per worker completion
              if (data.usage) {
                setMessages((prev) => {
                  const updated = [...prev];
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
                        input: wt.input + (data.usage.inputTokens || 0),
                        output: wt.output + (data.usage.outputTokens || 0),
                        requests: wt.requests + (data.usage.requests || 1),
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
              setWorkerToolActivity((prev) => ({
                ...prev,
                [workerId]: {
                  ...(prev[workerId] || {}),
                  phase: "failed",
                  currentTool: null,
                  error: data.error,
                },
              }));
            }
          },
          onUsageUpdate: (data: SSEData) => {
            if (isStale()) return;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role !== "assistant") return prev;

              // Background operations (memory extraction, consolidation, embeddings)
              // emit incremental usage_update events. Accumulate them separately so
              // the token badge grows smoothly instead of jumping when
              // fetchSessionStats discovers them all at once.
              const op = data.operation || "";
              const isBackground =
                op.startsWith("memory:") || op.startsWith("embed:");
              if (isBackground) {
                const bg = last._backgroundUsage || {
                  inputTokens: 0,
                  outputTokens: 0,
                  cost: 0,
                };
                updated[updated.length - 1] = {
                  ...last,
                  _backgroundUsage: {
                    inputTokens:
                      bg.inputTokens + (data.usage?.inputTokens || 0),
                    outputTokens:
                      bg.outputTokens + (data.usage?.outputTokens || 0),
                    requests: (bg.requests || 0) + (data.usage?.requests || 1),
                    cost: bg.cost + (data.usage?.estimatedCost || 0),
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
            if (!isStale()) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
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
              fetchSessionStats(agentSessionId);
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
          onError: (error) => reject(error),
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
      agentSessionId,
      traceId,
      disabledBuiltIns,
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
    ],
  );

  // -- Send handler ---------------------------------------------
  // Read inputValue from ref at send-time to avoid re-creating
  // handleSend on every keystroke (the main cause of input lag).
  const pendingImagesRef = useRef<string[]>(pendingImages);
  pendingImagesRef.current = pendingImages;
  const messagesRef = useRef<ClientMessage[]>(messages);
  messagesRef.current = messages;
  const titleRef = useRef<string>(title);
  titleRef.current = title;

  const handleSend = useCallback(
    async (e?: React.FormEvent<HTMLFormElement> | null, fetchOptions: { isQueueing?: boolean; overridePayload?: { text: string; images: string[] } | null } = {}) => {
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

      if (!text && currentImages.length === 0) return;

      if (isQueueing) {
        setQueuedNextTurn({ text, images: currentImages });
        setTextareaValue("");
        setPendingImages([]);
        return;
      }

      if (!overridePayload) {
        setTextareaValue("");
        setPendingImages([]);
      }

      setIsGenerating(true);
      // Re-engage sticky scroll when the user sends a message
      isUserNearBottomRef.current = true;
      // Track this session as generating (for history indicator even after switching away)
      const genId = agentSessionIdRef.current;
      setGeneratingSessionIds((prev) => new Set(prev).add(genId));
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
        setActiveId(agentSessionId);
        window.dispatchEvent(
          new CustomEvent("conversation:change", {
            detail: { conversationId: agentSessionId },
          }),
        );
        setSessions((prev) => [
          {
            id: agentSessionId,
            title: resolvedTitle,
            updatedAt: now,
            createdAt: now,
          } as AgentSession,
          ...prev,
        ]);
      }

      setCurrentTurnStart(Date.now());
      const userMessage = {
        role: "user" as const,
        content: text,
        timestamp: new Date().toISOString(),
        ...(currentImages.length > 0 ? { images: currentImages } : {}),
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
        await runOrchestrationLoop(updatedMessages, resolvedTitle);
        // Messages are already updated by the streaming callbacks — just reload history
        loadSessions();
      } catch (error: unknown) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `⚠️ Error: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          },
        ]);
      } finally {
        // Remove this session from the generating set
        setGeneratingSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(genId);
          return next;
        });
        // Clean up the background snapshot — session is now persisted to backend
        backgroundSessionsRef.current.delete(genId);
        // Only update local UI state if this session is still displayed
        if (agentSessionIdRef.current === genId) {
          setIsGenerating(false);
          abortRef.current = null;
          setCurrentTurnStart(null);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.completedAt) {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                completedAt: new Date().toISOString(),
              };
              return updated;
            }
            return prev;
          });
        } else {
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
            (mentionListRef.current as HTMLElement)?.children[next]?.scrollIntoView({
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
            (mentionListRef.current as HTMLElement)?.children[next]?.scrollIntoView({
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
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement("br");
          range.insertNode(br);
          // Move cursor after the <br>
          const newRange = document.createRange();
          newRange.setStartAfter(br);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
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
    setMessages([]);
    setToolActivity([]);
    setWorkerToolActivity({});
    setPendingImages([]);
    setPlanProposal(null);
    setAgentSessionId(generateUUID());
    setTraceId(null);
    setActiveId(null);
    setTitle(isNoAgent ? "Direct Chat" : "Agent");
    setBackendSessionStats(null);
    setUnavailableWorkspace(null);
    tokenHwmRef.current = { input: 0, output: 0, total: 0 };
    isUserNearBottomRef.current = true;
    textareaRef.current?.focus();
    // Clear session from URL
    window.dispatchEvent(
      new CustomEvent("conversation:change", {
        detail: { conversationId: null },
      }),
    );
  }, [isNoAgent]);

  const handleNewChat = useCallback(() => {
    // If generating, snapshot the current session so user can switch back to it
    if (isGenerating) {
      const currentId = agentSessionIdRef.current;
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
  const chatGlitchInterval = useRef<ReturnType<typeof setInterval> | null>(null);
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
        if (chatGlitchInterval.current) clearInterval(chatGlitchInterval.current);
        chatGlitchInterval.current = null;
        setChatGlitchLabel(null);
      }, 1000);
    }
    handleNewChat();
  }, [handleNewChat]);

  /** Apply fetched/snapshot session data to component state immediately. */
  const applySessionData = useCallback(
    (full: (AgentSession | Conversation) & { workspaceRoot?: string; _fromSnapshot?: boolean; _snapshot?: SessionSnapshot }) => {
      if (!full) return;

      // ── Restore workspace selection from the session document ──
      // Agent sessions record which workspace they were started with;
      // switch to it so the workspace tree and tool routing match.
      if (full.workspaceRoot) {
        const match = workspaces.find(
          (w) => w.path === full.workspaceRoot,
        );
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
        setAgentSessionId(full.id || generateUUID());
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
        setSettings((prev) => ({ ...prev, ...(snap.settings as Partial<typeof prev>) }));
        setBackendSessionStats(snap.backendSessionStats || null);
        // Re-attach: mark as generating so the UI shows the active state
        setIsGenerating(true);
        // Remove the snapshot — the SSE callbacks will resume updating React state
        // now that agentSessionIdRef matches again (isStale() → false)
        backgroundSessionsRef.current.delete(full.id || '');
      } else {
        // Normal backend-loaded session
        const displayMessages = prepareDisplayMessages(full.messages || []);
        scrollBehaviorRef.current = "instant";
        isUserNearBottomRef.current = true;
        setMessages(displayMessages);
        setAgentSessionId(full.id || generateUUID());
        setTraceId(full.traceId || null);
        setActiveId(full.id ?? null);
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
          .find((m) => m.role === "assistant" && m.provider);
        if (lastAssistant) {
          const gs = lastAssistant.generationSettings || {};
          setSettings((prev) => ({
            ...prev,
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
            ...(gs.thinkingBudget !== undefined && { thinkingBudget: String(gs.thinkingBudget) }),
            // Conversations store systemPrompt at root — restore for Direct Chat
            ...(full.systemPrompt != null && {
              systemPrompt: full.systemPrompt,
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
        const currentId = agentSessionIdRef.current;
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
        const errMsg = error instanceof Error ? error.message : String(error);
        const is404 =
          errMsg.includes("404") ||
          errMsg.includes("not found");
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

  const handleDeleteSession = useCallback(
    async (convId: string) => {
      try {
        // Direct Chat sessions live in the conversations collection
        if (isNoAgent) {
          await PrismService.deleteConversation(convId);
        } else {
          await PrismService.deleteAgentSession(convId, agentProject!);
        }
        setSessions((prev) => prev.filter((c) => c.id !== convId));
        if (activeId === convId) {
          handleNewChat();
        }
      } catch (error: unknown) {
        console.error("Failed to delete session:", error);
      }
    },
    [activeId, handleNewChat, agentProject, isNoAgent],
  );

  // -- Open file in the FileViewerPanel (shared by workspace tree & mention badges) --
  const handleOpenFileInViewer = useCallback(
    (absPath: string) => {
      const existingTab = viewerOpenFiles.find((f) => f.path === absPath);
      if (existingTab) {
        setViewerActiveFileId(existingTab.id);
      } else {
        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setViewerOpenFiles((prev) => [...prev, { id, path: absPath }]);
        setViewerActiveFileId(id);
      }
    },
    [viewerOpenFiles],
  );

  // -- Left sidebar: tab bar + content --------------------------
  // Badge helper — 0 = greyed-out, >0 = lit, "new" if tab has unseen data
  const badgeProps = (count: number, tabKey: string) => ({
    badge: count,
    badgeDisabled: count === 0,
    badgeState: newDataTabs.has(tabKey) ? "new" : "default",
  });

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
            icon: <Settings size={14} />,
            tooltip: "Settings",
          },
          ...((currentWorkspace && hasFileOps) || unavailableWorkspace
            ? [
                {
                  key: "workspace",
                  icon: <FolderTree size={14} />,
                  tooltip: "Workspace",
                },
              ]
            : []),
          {
            key: "info",
            icon: <Info size={14} />,
            tooltip: "Info",
          },
          {
            key: "tools",
            icon: <Wrench size={14} />,
            ...badgeProps(allToolSchemas.length, "tools"),
            tooltip: "Tool Calling",
            tooltipDisabled: !settings.functionCallingEnabled,
          },
          ...(isNoAgent
            ? [
                {
                  key: "params",
                  icon: <SlidersHorizontal size={14} />,
                  tooltip: "Parameters",
                },
              ]
            : []),
          ...(!isNoAgent
            ? [
                {
                  key: "skills",
                  icon: <BookOpen size={14} />,
                  ...badgeProps(
                    skills.filter((s) => s.enabled).length,
                    "skills",
                  ),
                  tooltip: "Skills",
                },
                {
                  key: "memories",
                  icon: <Brain size={14} />,
                  ...badgeProps(totalMemoriesCount, "memories"),
                  tooltip: "Memories",
                },
                {
                  key: "tasks",
                  icon: <ListChecks size={14} />,
                  ...badgeProps(tasksCount, "tasks"),
                  tooltip: "Tasks",
                },
                {
                  key: "mcp",
                  icon: <Plug size={14} />,
                  ...badgeProps(
                    mcpServers.filter((s) => s.connected).length,
                    "mcp",
                  ),
                  tooltip: "MCP Servers",
                },
                {
                  key: "workers",
                  icon: <BotMessageSquare size={14} />,
                  ...badgeProps(workersCount, "workers"),
                  badgeRainbow: Object.values(workerToolActivity).some(
                    (w: WorkerActivityEntry) =>
                      w.currentTool ||
                      w.phase === "generating" ||
                      w.phase === "thinking",
                  ),
                  tooltip: "Workers",
                },
              ]
            : []),
          {
            key: "requests",
            icon: <Activity size={14} />,
            ...badgeProps(
              backendSessionStats?.requestCount || 0,
              "requests",
            ),
            tooltip: "Requests",
          },
          ...(!isNoAgent
            ? [
                {
                  key: "coordinator",
                  icon: <GitBranch size={14} />,
                  tooltip: "Coordinator",
                },
              ]
            : []),
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
          setNewDataTabs((prev) => {
            if (!prev.has(tab)) return prev;
            const next = new Set(prev);
            next.delete(tab);
            return next;
          });
        }}
      />

      {leftTab === "settings" && (
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
                      localStorage.setItem("agent:maxIterations", String(next));
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
                        avgTimeToGeneration: sub.avgTimeToGeneration || undefined,
                      };
                    };
                    // -- Token counts come exclusively from the backend --
                    // _liveGenProgress (from generation_progress SSE) carries
                    // authoritative, monotonic token counts from SessionGenerationTracker.
                    // _backgroundUsage accumulates tokens from fire-and-forget LLM calls
                    // (memory extraction, consolidation) as they complete.
                    // When done, use backendSessionStats which includes everything.
                    const lastMsg = messages[messages.length - 1];
                    const liveGP =
                      lastMsg?.role === "assistant"
                        ? lastMsg._liveGenProgress
                        : null;
                    const bgUsage =
                      lastMsg?.role === "assistant"
                        ? lastMsg._backgroundUsage
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

                    return {
                      // -- Backend is source of truth (all requests incl. background) --
                      messageCount: messages.length,
                      deletedCount: 0,
                      requestCount:
                        (backendSessionStats.requestCount || 0) +
                        (bgUsage?.requests || 0),
                      uniqueModels: backendSessionStats.models,
                      uniqueProviders,
                      totalTokens: (() => {
                        const hwm = tokenHwmRef.current;
                        const t = {
                          input: Math.max(hwm.input, tokenInput),
                          output: Math.max(hwm.output, tokenOutput),
                          total: Math.max(hwm.total, tokenTotal),
                          cacheRead:
                            backendSessionStats
                              .totalCacheReadInputTokens || 0,
                          cacheWrite:
                            backendSessionStats
                              .totalCacheCreationInputTokens || 0,
                          reasoning:
                            backendSessionStats
                              .totalReasoningOutputTokens || 0,
                        };
                        tokenHwmRef.current = {
                          input: t.input,
                          output: t.output,
                          total: t.total,
                        };
                        return t;
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
                        const raw = backendSessionStats.modalities || modalities || {};
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
                        backendSessionStats.avgTimeToGeneration ||
                        null,
                      orchestrator: mapSubStats(
                        backendSessionStats.orchestrator,
                      ),
                      workers: mapSubStats(
                        backendSessionStats.workers,
                      ),
                    } as DisplaySessionStats;
                  })()
                : (() => {
                    // -- Client-side fallback (live generation, no backend data yet) --
                    // When _liveGenProgress exists, use backend-authoritative token
                    // counts instead of the client-side computeSessionStats math.
                    // Include _backgroundUsage from fire-and-forget LLM calls.
                    const lastMsg = messages[messages.length - 1];
                    const gp =
                      lastMsg?.role === "assistant"
                        ? lastMsg._liveGenProgress
                        : null;
                    const bgUsage =
                      lastMsg?.role === "assistant"
                        ? lastMsg._backgroundUsage
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
                    return {
                      messageCount: messages.length,
                      deletedCount: 0,
                      requestCount: requestCount + (bgUsage?.requests || 0),
                      uniqueModels,
                      uniqueProviders,
                      totalTokens: (() => {
                        const hwm = tokenHwmRef.current;
                        const t = {
                          input: Math.max(hwm.input, fallbackTokens.input || 0),
                          output: Math.max(
                            hwm.output,
                            fallbackTokens.output || 0,
                          ),
                          total: Math.max(hwm.total, fallbackTokens.total || 0),
                        };
                        tokenHwmRef.current = {
                          input: t.input,
                          output: t.output,
                          total: t.total,
                        };
                        return t;
                      })(),
                      totalCost: (totalCost as number) + ((bgUsage?.cost || 0) as number),
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
      )}

      {leftTab === "workspace" && (
        <WorkspaceTreePanelComponent
          workspaceTreeRefreshKey={workspaceTreeRefreshKey}
          onMentionFile={handleMentionFile}
          locked={messages.length > 0}
          unavailableWorkspace={unavailableWorkspace}
          onOpenFile={(relativePath: string) => {
            // Build absolute path from workspace root + relative path
            const absPath = currentWorkspace?.path
              ? `${currentWorkspace.path.replace(/\/$/, "")}/${relativePath}`
              : relativePath;
            handleOpenFileInViewer(absPath);
          }}
        />
      )}

      {leftTab === "info" && (
        <ModelInfoPanel
          config={filteredConfig}
          settings={settings}
        />
      )}

      {leftTab === "tools" && (
        <CustomToolsPanel
          tools={customTools}
          onToolsChange={loadCustomTools}
          project={agentProject}
          builtInTools={builtInTools}
          disabledBuiltIns={disabledBuiltIns}
          onToggleBuiltIn={handleToggleBuiltIn}
          onToggleAllBuiltIn={handleToggleAllBuiltIn}
          lockedOffTools={lockedOffTools}
          agent={!isNoAgent}
        />
      )}

      {leftTab === "params" && (
        <ParametersPanelComponent
          settings={settings}
          onChange={(updates: Partial<PrismSettings>) =>
            setSettings((s) => ({ ...s, ...updates }))
          }
          config={filteredConfig}
        />
      )}

      {leftTab === "skills" && (
        <SkillsPanel
          skills={skills}
          onSkillsChange={loadSkills}
          project={agentProject}
        />
      )}

      {leftTab === "memories" && (
        <MemoriesPanel
          project={agentProject}
          agent={agentId}
          refreshKey={memoriesRefreshKey}
          onCountChange={setTotalMemoriesCount}
          memoryConfigured={memoryConfigured}
        />
      )}

      {leftTab === "tasks" && (
        <TasksPanel
          project={agentProject}
          refreshKey={tasksRefreshKey}
          agentSessionId={agentSessionId}
          onCountChange={setTasksCount}
        />
      )}

      {leftTab === "mcp" && (
        <MCPServersPanel
          servers={mcpServers}
          onServersChange={loadMCPServers}
          project={agentProject}
        />
      )}

      {leftTab === "workers" && (
        <WorkersPanel
          agentSessionId={agentSessionId}
          refreshKey={tasksRefreshKey}
          onCountChange={setWorkersCount}
          workerToolActivity={workerToolActivity}
        />
      )}

      {leftTab === "requests" && (
        <SessionRequestsListComponent
          agentSessionId={agentSessionId}
          refreshKey={requestsRefreshKey}
        />
      )}

      {leftTab === "coordinator" && <CoordinatorPanel project={agentProject} />}
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
          <ButtonComponent
            ref={chatNewBtnRef}
            variant="primary"
            size="small"
            icon={chatGlitchLabel ? undefined : Plus}
            onClick={handleNewChatGlitch}
            disabled={messages.length === 0 && !activeId}
            className={`${chatStyles.chatHeaderNewBtn} ${chatGlitchLabel ? chatStyles.chatHeaderNewBtnGlitch : ""}`}
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
            ? ({ "--agent-bg-image": `url(${agentBackgroundImage})` } as React.CSSProperties)
            : undefined
        }
      >
        {messages.length === 0 && activeAgentData && (
          <EmptyStateComponent
            icon={
              <AgentBadgeComponent
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
          isGenerating={isGenerating}
          streamingOutputs={streamingOutputs}
          workerToolActivity={workerToolActivity}
          knownPaths={knownPaths}
          onMentionFileOpen={(relativePath: string) => {
            const absPath = currentWorkspace?.path
              ? `${currentWorkspace.path.replace(/\/$/, "")}/${relativePath}`
              : relativePath;
            handleOpenFileInViewer(absPath);
          }}
          planProposal={planProposal}
          onPlanApprove={() => {
            setPlanProposal((p) =>
              p ? { ...p, status: "approved" } : null,
            );
            PrismService.sendApprovalResponse(agentSessionId, true).catch(
              console.error,
            );
          }}
          onPlanReject={() => {
            setPlanProposal((p) =>
              p ? { ...p, status: "rejected" } : null,
            );
            PrismService.sendApprovalResponse(agentSessionId, false).catch(
              console.error,
            );
          }}
        />

        {/* Pending approval cards */}
        {pendingApprovals
          .filter((a) => a.status === "pending")
          .map((approval) => (
            <ApprovalCardComponent
              key={approval.id}
              toolName={approval.toolName}
              toolArgs={approval.toolArgs}
              tier={approval.tier}
              onApprove={() => {
                setPendingApprovals((prev) =>
                  prev.map((a) =>
                    a.id === approval.id ? { ...a, status: "approved" } : a,
                  ),
                );
                PrismService.sendApprovalResponse(agentSessionId, true).catch(
                  console.error,
                );
              }}
              onReject={() => {
                setPendingApprovals((prev) =>
                  prev.map((a) =>
                    a.id === approval.id ? { ...a, status: "rejected" } : a,
                  ),
                );
                PrismService.sendApprovalResponse(agentSessionId, false).catch(
                  console.error,
                );
              }}
              onApproveAll={() => {
                setPendingApprovals((prev) =>
                  prev.map((a) =>
                    a.status === "pending" ? { ...a, status: "approved" } : a,
                  ),
                );
                setAutoApprove(true);
                PrismService.sendApprovalResponse(agentSessionId, true, {
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
            onAnswer={(answers: Array<{ answer: string | string[]; annotations?: string }>) => {
              setPendingUserQuestion(null);
              PrismService.sendUserQuestionAnswer(
                agentSessionId,
                answers,
              ).catch(console.error);
            }}
          />
        )}

        <div ref={endRef} style={{ minHeight: 24 }} />
      </div>

      {/* -- Status indicator bar (rainbow canvas above input) -- */}
      {(() => {
        const lastMsg = messages[messages.length - 1];
        const rawPhase = isGenerating
          ? lastMsg?.statusPhase || "starting"
          : null;
        const hasActiveTools = toolActivity.some(
          (t) => t.status === "calling",
        );
        // Detect awaiting-approval state (plan proposal or tool approval pending)
        const isAwaitingApproval =
          planProposal?.status === "pending" ||
          pendingApprovals.some((a) => a.status === "pending") ||
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
            (w: WorkerActivityEntry) =>
              w.phase &&
              w.phase !== "complete" &&
              w.phase !== "failed" &&
              w.phase !== "spawned",
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
            for (const p of phasePriority) {
              const count = activeWorkers.filter(
                (w: WorkerActivityEntry) => w.phase === p,
              ).length;
              if (count > 0) {
                workerDerivedPhase = p;
                const total = activeWorkers.length;
                // Multiple workers — show aggregate count; single worker uses default phase label (null)
                workerDerivedLabel =
                  total > 1
                    ? `${count}/${total} worker${total !== 1 ? "s" : ""} ${p}…`
                    : null;
                break;
              }
            }
          }
        }

        const phase = isGenerating
          ? isAwaitingApproval
            ? "awaiting"
            : workerDerivedPhase || (hasActiveTools ? "thinking" : rawPhase)
          : null;
        const label = isGenerating
          ? isAwaitingApproval
            ? "Awaiting For User Input..."
            : workerDerivedPhase
              ? workerDerivedLabel
              : hasActiveTools
                ? "Thinking..."
                : lastMsg?.status || undefined
          : undefined;
        // Structured progress (0-1) from LM Studio prompt processing / model loading
        const progress =
          phase === "processing" || phase === "loading"
            ? (lastMsg?._statusProgress ?? null)
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
        {messages.length === 0 ? (
          <div className={chatStyles.workspaceRow}>
            <span className={chatStyles.workspaceLabel}>
              New conversation in
            </span>
            <WorkspaceSelectorComponent />
          </div>
        ) : (
          <div className={chatStyles.workspaceRowLocked}>
            <WorkspaceSelectorComponent
              locked
              unavailableWorkspace={unavailableWorkspace}
            />
          </div>
        )}
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
                  <Paperclip size={12} />{" "}
                  {queuedNextTurn.images.length} image(s)
                </div>
              )}
            </div>
          )}
          {isDragging && (
            <div className={chatStyles.dragOverlay}>
              <Paperclip size={20} />
              <span>Drop images here</span>
            </div>
          )}
          {pendingImages.length > 0 && (
            <div className={chatStyles.pendingImages}>
              {pendingImages.map((dataUrl, i) => (
                <div key={i} className={chatStyles.pendingAttachmentWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt="Attached"
                    className={chatStyles.pendingImg}
                    onClick={() => setLightboxSrc(dataUrl)}
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
            </div>
          )}
          <div className={chatStyles.inputRow}>
            {supportsImageInput && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleImageSelect}
                />
                <ChatInputButton
                  onClick={() => fileInputRef.current?.click()}
                  label="Attach image"
                  icon="paperclip"
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
              onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
              data-placeholder={emptyState.placeholder}
              suppressContentEditableWarning
            />
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
                disabled={!hasInput && pendingImages.length === 0}
                label="Queue message for next turn"
                icon={<CornerDownLeft size={18} />}
              />
            )}
            <ButtonComponent
              variant="submit"
              icon={isGenerating ? Square : Send}
              isGenerating={isGenerating}
              disabled={
                isGenerating ? false : !hasInput && pendingImages.length === 0
              }
              aria-label={isGenerating ? "Stop" : "Send"}
            />
          </div>
        </form>
        <div className={chatStyles.hint}>
          Press <kbd>Enter</kbd> to send, <kbd>Shift</kbd> + <kbd>Enter</kbd>{" "}
          for new line
        </div>
      </div>
      {lightboxSrc && (
        <ImagePreviewComponent
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
          onUseAnnotated={(dataUrl: string) => {
            setPendingImages((prev) => [...prev, dataUrl]);
            setLightboxSrc(null);
          }}
        />
      )}
    </div>
  );

  // -- Layout ---------------------------------------------------
  return (
    <ThreePanelLayout
      navSidebar={
        <NavigationSidebarComponent
          mode="user"
          isGenerating={isGenerating}
          activeApiCount={activeApiCount}
        />
      }
      leftPanel={leftPanel}
      leftTitle={undefined}
      fileViewerPanel={
        currentWorkspace &&
        hasFileOps && (
          <FileViewerPanelComponent
            openFiles={viewerOpenFiles}
            activeFileId={viewerActiveFileId}
            onSelectFile={setViewerActiveFileId}
            onCloseFile={(id: string) => {
              setViewerOpenFiles((prev) => {
                const next = prev.filter((f) => f.id !== id);
                // If the closed tab was active, switch to the nearest tab
                if (id === viewerActiveFileId) {
                  const closedIdx = prev.findIndex((f: ViewerOpenFile) => f.id === id);
                  const newActive = next[Math.min(closedIdx, next.length - 1)];
                  setViewerActiveFileId(newActive?.id || null);
                }
                return next;
              });
            }}
            onFileNotFound={(id: string) => {
              // Auto-close tabs for files that no longer exist
              setViewerOpenFiles((prev) => {
                const next = prev.filter((f) => f.id !== id);
                setViewerActiveFileId((activeId: string | null) => {
                  if (activeId !== id) return activeId;
                  const closedIdx = prev.findIndex((f: ViewerOpenFile) => f.id === id);
                  const newActive = next[Math.min(closedIdx, next.length - 1)];
                  return newActive?.id || null;
                });
                return next;
              });
            }}
            isOpen={viewerOpenFiles.length > 0}
            width={viewerWidth}
            onWidthChange={(w: number) => {
              setViewerWidth(w);
              localStorage.setItem(LS_FILE_VIEWER_WIDTH, String(w));
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
        <div className={layoutStyles.headerCenterGroup}>
          {agents.length > 1 && (
            <AgentPickerComponent
              agents={agents}
              activeAgentId={agentId}
              onSelect={(id: string) => {
                // Agent switching is handled by the parent page via URL/state
                // Emit a custom event or call a callback
                window.dispatchEvent(
                  new CustomEvent("agent:switch", { detail: { agentId: id } }),
                );
              }}
              disabled={isGenerating || isSessionLocked}
            />
          )}
          <ModelPickerPopoverComponent
            config={filteredConfig}
            settings={{ provider: settings.provider, model: settings.model }}
            disabled={isGenerating || isSessionLocked}
            onSelectModel={(provider: string, modelName: string) => {
              const modelDef = (
                filteredConfig?.textToText?.models?.[provider] || []
              ).find((m: ModelOption) => m.name === modelName);
              const temp = modelDef?.defaultTemperature ?? 1.0;
              setSettings((s) => ({
                ...s,
                provider,
                model: modelName,
                temperature: temp,
              }));
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
                setFavoriteKeys((prev) =>
                  prev.filter((k) => k !== key),
                );
                PrismService.removeFavorite("model", key).catch(() => {});
              } else {
                setFavoriteKeys((prev) => [...prev, key]);
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
  );
}
