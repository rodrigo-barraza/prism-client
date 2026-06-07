"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { buildDateRangeParams } from "../utils/utilities";
import { getErrorMessage } from "../utils/errorMessage";
import useSessionStats from "../hooks/useSessionStats";
import {
  Loader,
  MessageSquare,
  Settings,
  SlidersHorizontal,
  Info,
  Wrench,
  BookOpen,
  Brain,
  ListChecks,
  BotMessageSquare,
  GitBranch,
  Activity,
  ScrollText,
} from "lucide-react";

import IrisService from "../services/IrisService";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import MessageList, { prepareDisplayMessages } from "./MessageListComponent";
import SettingsPanel, { SessionStats as PanelSessionStats } from "./SettingsPanelComponent";
import ModelInfoPanel from "./ModelInfoPanelComponent";
import ParametersPanelComponent from "./ParametersPanelComponent";
import HistoryPanel from "./HistoryPanelComponent";
import CustomToolsPanel from "./CustomToolsPanelComponent";
import SkillsPanel from "./SkillsPanelComponent";
import MemoriesPanel from "./MemoriesPanelComponent";
import TasksPanel from "./TasksPanelComponent";

import WorkersPanel from "./WorkersPanelComponent";
import RequestsTableComponent from "./RequestsTableComponent";
import RulesPanel from "./RulesPanelComponent";
import SidebarTabHeaderComponent from "./SidebarTabHeaderComponent";
import ChatSessionGraphComponent from "./ChatSessionGraphComponent";
import ChatViewModeControlComponent from "./ChatViewModeControlComponent";
import type { ChatViewMode } from "./ChatViewModeControlComponent";

import ThreePanelLayout from "./ThreePanelLayoutComponent";
import {
  layoutHeaderStyles,
  SelectComponent,
  TabBarComponent,
  tabBarStyles,
  ButtonComponent,
} from "@rodrigo-barraza/components-library";

import AgentPickerComponent from "./AgentPickerComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";

import { ErrorMessage } from "./StateMessageComponent";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import useProjectFilter from "../hooks/useProjectFilter";
import BadgeComponent from "./BadgeComponent";

import { SETTINGS_DEFAULTS, PROJECT_AGENT, LS_ADMIN_CHAT_FILTERS } from "../constants";
import type {
  Conversation,
  AgentSession,
  PrismConfig,
  Favorite,
  Workflow,
  AgentPersona,
  CustomTool,
  Skill,
  ToolSchema,
  SessionStats,
  TransformedRequestItem,
  Message,
  Rule,
} from "../types/types";
import styles from "../app/admin/chat/page.module.css";
import chatStyles from "./ChatAreaComponent.module.css";

const POLL_INTERVAL = 5000;

/** Synthetic agent entry representing "All" — merges both collections. */
const ALL_AGENT = {
  id: "ALL",
  name: "All",
  description: "View all conversations and agent sessions.",
  project: "",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

/** Synthetic "Agentless" entry — direct model chat. */
const NONE_AGENT = {
  id: "NONE",
  name: "Agentless",
  description:
    "A straightforward conversation with the AI — no automated workflows, just you and the model.",
  project: "direct",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

/** Unified entry type — conversations and agent sessions share these fields for display. */
type UnifiedEntry = (Conversation | AgentSession) & {
  _source?: "conversation" | "agent_session";
};

interface AdminChatViewerProps {
  initialId?: string | null;
}

export default function AdminChatViewerComponent({
  initialId = null,
}: AdminChatViewerProps) {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerFilter = searchParams.get("provider") || null;
  const modelFilter = searchParams.get("model") || null;
  const agentParam = searchParams.get("agent") || null;
  const {
    setControls,
    setTitleBadge,
    dateRange,
    setDateRange,
    sessionFilter,
    setSessionFilter,
  } = useAdminHeader();

  // -- Agent state --
  const [agents, setAgents] = useState<
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
  const activeAgentId = agentParam || "ALL";
  const isAllMode = activeAgentId === "ALL";
  const isNoAgent = activeAgentId === "NONE";
  const isAgentMode = !isAllMode && !isNoAgent;

  // -- Session/conversation list state --
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [entriesHasMore, setEntriesHasMore] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const entriesPageRef = useRef<number>(1);
  const entriesTotalRef = useRef<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [selectedEntry, setSelectedEntry] = useState<UnifiedEntry | null>(null);
  const [selectedSource, setSelectedSource] = useState<
    "conversation" | "agent_session" | null
  >(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [chatAreaTab, setChatAreaTab] = useState<"chat" | "nodes">("chat");
  const [config, setConfig] = useState<PrismConfig | null>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [generatingCount, setGeneratingCount] = useState(0);
  const [changeStreamsActive, setChangeStreamsActive] = useState(false);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [leftTab, setLeftTab] = useState("settings");
  const [leftTabBottom, setLeftTabBottom] = useState("tools");
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  // Agent-specific sub-panel state
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [builtInTools, setBuiltInTools] = useState<ToolSchema[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [totalMemoriesCount, setTotalMemoriesCount] = useState(0);
  const [workersCount, setWorkersCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [backendSessionStats, setBackendSessionStats] =
    useState<SessionStats | null>(null);
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState<string | null>(
    null,
  );

  const knownIdsRef = useRef<Set<string> | null>(null);
  const lastFingerprintRef = useRef<string>("");
  const autoSelectedRef = useRef<boolean>(!!initialId);
  const viewerBodyRef = useRef<HTMLDivElement | null>(null);

  const activeSession = sessionFilter;

  // ── Fetch agent personas ─────────────────────────────────────
  useEffect(() => {
    PrismService.getAgentPersonas()
      .then((list: AgentPersona[]) =>
        setAgents([ALL_AGENT, NONE_AGENT, ...list]),
      )
      .catch(console.error);
  }, []);

  // ── Fetch config ─────────────────────────────────────────────
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: (prismConfig: PrismConfig) => setConfig(prismConfig),
      onLocalMerge: (merged: PrismConfig) => setConfig(merged),
    }).catch(() => {});

    PrismService.getFavorites("model")
      .then((favorites: Favorite[]) =>
        setFavoriteKeys(favorites.map((favorite: Favorite) => favorite.key as string)),
      )
      .catch(() => {});
  }, []);

  const isSelectedAgent = selectedSource === "agent_session";
  const targetAgentId = isSelectedAgent ? selectedEntry?.agent : (isAgentMode ? activeAgentId : null);
  const targetProject = isSelectedAgent ? (selectedEntry?.project || selectedEntry?.agent || PROJECT_AGENT) : (isAgentMode ? PROJECT_AGENT : null);

  // ── Agent-specific data (tools, skills, memories, MCP, rules) ───────
  useEffect(() => {
    if (!targetAgentId) {
      setCustomTools([]);
      setSkills([]);
      setBuiltInTools([]);
      setTotalMemoriesCount(0);
      setRules([]);
      return;
    }

    const project = targetProject || PROJECT_AGENT;

    PrismService.getCustomTools(project)
      .then((tools: CustomTool[]) => setCustomTools(tools))
      .catch(() => {});
    PrismService.getSkills(project)
      .then((loadedSkills: Skill[]) => setSkills(loadedSkills))
      .catch(() => {});
    PrismService.getBuiltInToolSchemas(targetAgentId)
      .then((tools: ToolSchema[]) => setBuiltInTools(tools))
      .catch(() => {});
    PrismService.getAgentMemories(project, 1, undefined)
      .then((result: { total?: number }) => setTotalMemoriesCount(result.total || 0))
      .catch(() => {});
    PrismService.getRules(targetAgentId)
      .then((rulesList: Rule[]) => setRules(rulesList))
      .catch(() => {});
  }, [targetAgentId, targetProject]);

  // Align active tab states on mode transitions (agent vs direct chat)
  useEffect(() => {
    if (isSelectedAgent) {
      if (leftTab === "params") {
        setLeftTab("settings");
      }
      if (leftTabBottom === "params") {
        setLeftTabBottom("tools");
      }
    } else {
      if (leftTab !== "settings" && leftTab !== "info" && leftTab !== "params") {
        setLeftTab("settings");
      }
    }
  }, [isSelectedAgent, leftTab, leftTabBottom]);

  // ── Favorites toggle ─────────────────────────────────────────
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((previousFavoriteKeys) => previousFavoriteKeys.filter((favoriteKey: string) => favoriteKey !== key));
        PrismService.removeFavorite("model", key).catch(() => {});
      } else {
        setFavoriteKeys((previousFavoriteKeys) => [...previousFavoriteKeys, key]);
        const [provider, ...rest] = key.split(":");
        PrismService.addFavorite("model", key, {
          provider,
          name: rest.join(":"),
        }).catch(() => {});
      }
    },
    [favoriteKeys],
  );

  // ── Load initial detail by ID ────────────────────────────────
  useEffect(() => {
    if (!initialId) return;
    setLoadingDetail(true);
    IrisService.getConversation(initialId)
      .then((conversation: unknown) => {
        const conversationEntry = conversation as UnifiedEntry & { type?: string };
        setSelectedEntry(conversationEntry);
        setSelectedSource(
          conversationEntry.type === "agent" ? "agent_session" : "conversation",
        );
      })
      .catch(() => {
        setSelectedEntry(null);
        setSelectedSource(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [initialId]);

  // ── Lazy load system prompt for agent sessions ───────────────
  useEffect(() => {
    setSessionSystemPrompt(null);
    if (!selectedId || selectedSource !== "agent_session") return;

    let cancelled = false;
    IrisService.getRequests({ conversationId: selectedId, limit: 1 })
      .then((res) => {
        if (cancelled) return;
        const firstReq = res.data?.[0] as TransformedRequestItem | undefined;
        const payload = firstReq?.requestPayload as
          | { messages?: Message[] }
          | undefined;
        const systemMessage = payload?.messages?.find(
          (message: Message) => message.role === "system",
        );
        if (systemMessage?.content) {
          setSessionSystemPrompt(systemMessage.content as string);
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedSource]);

  // ── Load entries (conversations / agent sessions / both) ─────
  const loadEntries = useCallback(async () => {
    try {
      const params: Record<string, string | number | boolean> = {
        page: 1,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (activeSession) {
        params.trace = activeSession;
      } else {
        Object.assign(params, buildDateRangeParams(dateRange));
        if (projectFilter) params.project = projectFilter;
      }
      if (providerFilter) params.provider = providerFilter;
      if (modelFilter) params.model = modelFilter;

      if (isNoAgent) {
        params.type = "direct";
      } else if (isAgentMode) {
        params.agent = activeAgentId;
      }

      const data = await IrisService.getConversations(params);
      const list = (data.data || []).map(
        (conversation: Conversation & { type?: string }) => ({
          ...conversation,
          _source:
            conversation.type === "agent"
              ? ("agent_session" as const)
              : ("conversation" as const),
        }),
      );
      const total = data.total || 0;

      // Fingerprint for dedup
      const fp = list
        .map(
          (conversation) =>
            `${conversation.id}:${conversation.messages?.length || (conversation as Conversation).messageCount || 0}`,
        )
        .join("|");

      if (fp !== lastFingerprintRef.current) {
        lastFingerprintRef.current = fp;
        setEntries(list);
        setFingerprint(fp);
      }

      entriesPageRef.current = 1;
      entriesTotalRef.current = total;
      setEntriesHasMore(list.length < total);

      // Track new IDs
      const currentIds = new Set(list.map((conversation) => conversation.id || ""));
      if (knownIdsRef.current === null) {
        knownIdsRef.current = currentIds;
      } else {
        const freshIds = new Set<string>();
        for (const id of currentIds) {
          if (!knownIdsRef.current.has(id)) freshIds.add(id);
        }
        if (freshIds.size > 0) {
          setNewIds((previousNewIds) => {
            const merged = new Set(previousNewIds);
            for (const id of freshIds) merged.add(id);
            return merged;
          });
          knownIdsRef.current = currentIds;
        }
      }

      // Auto-select first entry on load
      if (list.length > 0 && !autoSelectedRef.current) {
        autoSelectedRef.current = true;
        selectEntry(list[0].id || "", list[0]._source || "conversation");
      }

      setError((previousError) => (previousError !== null ? null : previousError));
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }, [
    projectFilter,
    providerFilter,
    modelFilter,
    dateRange,
    activeSession,
    activeAgentId,
    isNoAgent,
    isAgentMode,
  ]);

  // Load more (pagination)
  const loadMoreEntries = useCallback(async () => {
    if (entriesLoading || !entriesHasMore) return;
    try {
      setEntriesLoading(true);
      const nextPage = entriesPageRef.current + 1;
      const params: Record<string, string | number | boolean> = {
        page: nextPage,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (activeSession) {
        params.trace = activeSession;
      } else {
        Object.assign(params, buildDateRangeParams(dateRange));
        if (projectFilter) params.project = projectFilter;
      }
      if (providerFilter) params.provider = providerFilter;
      if (modelFilter) params.model = modelFilter;

      if (isNoAgent) {
        params.type = "direct";
      } else if (isAgentMode) {
        params.agent = activeAgentId;
      }

      const data = await IrisService.getConversations(params);
      const newItems = (data.data || []).map(
        (conversation: Conversation & { type?: string }) => ({
          ...conversation,
          _source:
            conversation.type === "agent"
              ? ("agent_session" as const)
              : ("conversation" as const),
        }),
      );

      entriesPageRef.current = nextPage;
      setEntries((previousEntries) => [...previousEntries, ...newItems]);
      setEntriesHasMore(
        entries.length + newItems.length < entriesTotalRef.current,
      );
    } catch (error) {
      console.error("Failed to load more entries:", error);
    } finally {
      setEntriesLoading(false);
    }
  }, [
    entriesLoading,
    entriesHasMore,
    activeSession,
    dateRange,
    projectFilter,
    providerFilter,
    modelFilter,
    entries.length,
    isNoAgent,
    isAgentMode,
    activeAgentId,
  ]);

  // Generating count
  useEffect(() => {
    IrisService.getConversationStats(projectFilter)
      .then((data) => setGeneratingCount(data.generatingCount || 0))
      .catch(() => {});
  }, [projectFilter]);

  // ── Live updates (SSE) ───────────────────────────────────────
  const fingerprintRef = useRef<string>("");
  const [fingerprint, setFingerprint] = useState("");
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const selectedSourceRef = useRef<"conversation" | "agent_session" | null>(
    selectedSource,
  );
  selectedSourceRef.current = selectedSource;

  const refreshSelectedEntry = useCallback(
    async (id: string, source: "conversation" | "agent_session" | null) => {
      if (!id) return;
      try {
        const full =
          source === "agent_session"
            ? ((await IrisService.getAgentSession(id)) as UnifiedEntry)
            : ((await IrisService.getConversation(id)) as UnifiedEntry);
        setSelectedEntry((previousEntry) => {
          const oldMsgs = previousEntry?.messages || [];
          const newMsgs = full?.messages || [];
          if (oldMsgs.length !== newMsgs.length) return full;
          const oldLast = oldMsgs[oldMsgs.length - 1];
          const newLast = newMsgs[newMsgs.length - 1];
          if (oldLast?.content?.length !== newLast?.content?.length)
            return full;
          const previousGeneratingState = (previousEntry as Conversation | null)?.isGenerating;
          const fullGen = (full as Conversation | null)?.isGenerating;
          if (previousGeneratingState !== fullGen) return full;
          return previousEntry;
        });
      } catch (error: unknown) {
        console.error("Failed to refresh selected entry:", error);
      }
    },
    [],
  );

  // Change Stream-driven detail refresh
  useEffect(() => {
    if (!changeStreamsActive) return;

    const onEvent = (event: { collection?: string; id?: string }) => {
      if (
        (event.collection === "model_conversations" ||
          event.collection === "agent_conversations") &&
        selectedIdRef.current &&
        event.id === selectedIdRef.current
      ) {
        refreshSelectedEntry(selectedIdRef.current, selectedSourceRef.current);
      }
    };

    const es = IrisService.subscribeCollectionChanges({ onChange: onEvent });
    return () => es.close();
  }, [changeStreamsActive, refreshSelectedEntry]);

  // Fallback: fingerprint-based refresh
  useEffect(() => {
    if (changeStreamsActive) return;
    if (!selectedId || fingerprint === fingerprintRef.current) return;
    fingerprintRef.current = fingerprint;
    refreshSelectedEntry(selectedId, selectedSource);
  }, [
    selectedId,
    fingerprint,
    changeStreamsActive,
    refreshSelectedEntry,
    selectedSource,
  ]);

  // Entry list — SSE-driven with polling fallback
  useEffect(() => {
    knownIdsRef.current = null;
    if (!initialId) autoSelectedRef.current = false;
    lastFingerprintRef.current = "";
    setEntries([]);
    setFingerprint("");

    loadEntries();

    let pollInterval: NodeJS.Timeout | null = null;
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data: { changeStreams?: boolean }) => {
        setChangeStreamsActive(!!data.changeStreams);
        if (!data.changeStreams) {
          if (!pollInterval) {
            pollInterval = setInterval(loadEntries, POLL_INTERVAL);
          }
        }
      },
      onChange: (event: { collection?: string }) => {
        if (
          event.collection === "model_conversations" ||
          event.collection === "agent_conversations"
        ) {
          loadEntries();
        }
      },
    });

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [loadEntries]);

  // Workflows for selected
  useEffect(() => {
    if (!selectedId || selectedSource === "agent_session") {
      setWorkflows([]);
      return;
    }
    IrisService.getConversationWorkflows(selectedId)
      .then(setWorkflows)
      .catch(() => setWorkflows([]));
  }, [selectedId, selectedSource]);

  // Backend session stats for agent sessions
  useEffect(() => {
    if (!selectedId) {
      setBackendSessionStats(null);
      return;
    }
    if (selectedSource === "agent_session") {
      IrisService.getSessionStats(selectedId)
        .then((stats) => setBackendSessionStats(stats))
        .catch(() => setBackendSessionStats(null));

      ToolsApiService.getAllAgenticTasks({ conversationId: selectedId })
        .then((result) => setTasksCount(result.summary?.total || (result.tasks || []).length))
        .catch(() => setTasksCount(0));

      PrismService.getCoordinatorWorkers(selectedId)
        .then((result) => setWorkersCount((result.workers || []).length))
        .catch(() => setWorkersCount(0));
    } else {
      setBackendSessionStats(null);
      setTasksCount(0);
      setWorkersCount(0);
    }
  }, [selectedId, selectedSource]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!loadingDetail && selectedEntry && viewerBodyRef.current) {
      const element = viewerBodyRef.current;
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [selectedId, loadingDetail, selectedEntry]);

  const generatingDisplay = useMemo(() => generatingCount, [generatingCount]);

  // ── Select an entry ──────────────────────────────────────────
  async function selectEntry(
    id: string,
    source: "conversation" | "agent_session" = "conversation",
  ) {
    if (id === selectedId) return;
    setSelectedId(id);
    setSelectedSource(source);

    // Update URL for deep-linking
    const params = new URLSearchParams();
    if (agentParam) params.set("agent", agentParam);
    if (activeSession) params.set("trace", activeSession);
    if (projectFilter) params.set("project", projectFilter);
    if (providerFilter) params.set("provider", providerFilter);
    if (modelFilter) params.set("model", modelFilter);
    const queryString = params.toString();
    window.history.replaceState(
      null,
      "",
      `/admin/chat/${id}${queryString ? `?${queryString}` : ""}`,
    );

    // Remove NEW badge
    setNewIds((previousNewIds) => {
      if (!previousNewIds.has(id)) return previousNewIds;
      const next = new Set(previousNewIds);
      next.delete(id);
      return next;
    });

    setLoadingDetail(true);
    try {
      const detail =
        source === "agent_session"
          ? await IrisService.getAgentSession(id)
          : await IrisService.getConversation(id);
      setSelectedEntry(detail as UnifiedEntry);
    } catch {
      setSelectedEntry(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  // ── Agent picker handler ─────────────────────────────────────
  const handleAgentSelect = useCallback(
    (agentId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (agentId === "ALL") {
        params.delete("agent");
      } else {
        params.set("agent", agentId);
      }
      const queryString = params.toString();
      router.replace(
        queryString ? `/admin/chat?${queryString}` : "/admin/chat",
        { scroll: false },
      );

      // Reset list state
      setSelectedId(null);
      setSelectedEntry(null);
      setSelectedSource(null);
      autoSelectedRef.current = false;
    },
    [searchParams, router],
  );

  // ── Session stats ────────────────────────────────────────────
  const convTitle = selectedEntry
    ? selectedEntry.title || "Untitled"
    : "Select a conversation";

  const {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens,
    requestCount,
    usedTools,
    modalities,
    elapsedTime: completedElapsedTime,
  } = useSessionStats(selectedEntry?.messages || []);

  const settingsWithDefaults = useMemo(
    () => ({
      ...SETTINGS_DEFAULTS,
      ...((selectedEntry as Conversation | null)?.settings || {}),
    }),
    [selectedEntry],
  );

  // Resolve model/provider from multiple fallback sources:
  // 1. Entry root (conversation.provider / conversation.model)
  // 2. Entry settings (settings.provider / settings.model)
  // 3. Last assistant message (message.provider / message.model)
  // 4. Backend session stats (stats.models[0])
  const resolvedModelSettings = useMemo(() => {
    const currentSettings = settingsWithDefaults;
    let provider = selectedEntry?.provider || currentSettings.provider || "";
    let model = selectedEntry?.model || currentSettings.model || "";

    // Fallback: extract from last assistant message
    if (!model && selectedEntry?.messages?.length) {
      for (let i = selectedEntry.messages.length - 1; i >= 0; i--) {
        const message = selectedEntry.messages[i];
        if (message.role === "assistant" && message.model) {
          model = message.model;
          provider = message.provider || provider;
          break;
        }
      }
    }

    // Fallback: backend session stats
    if (!model && backendSessionStats?.models?.length) {
      model = backendSessionStats.models[0];
    }

    return { ...currentSettings, provider, model };
  }, [settingsWithDefaults, selectedEntry, backendSessionStats]);

  // Resolve whether selected entry is an agent session

  const hasSystemContextMessage = useMemo(() => {
    return (selectedEntry?.messages || []).some(
      (message) =>
        message.role === "user" &&
        (message.content?.startsWith("[System Context]") ||
          message.rawContent?.startsWith("[System Context]") ||
          message.content?.startsWith("[System Context - Local Time:") ||
          message.rawContent?.startsWith("[System Context - Local Time:")),
    );
  }, [selectedEntry?.messages]);

  // ── Admin header controls ────────────────────────────────────
  useEffect(() => {
    setControls(
      <>
        <SelectComponent
          value={projectFilter || ""}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
          disabled={!!activeSession}
        />
        {generatingCount > 0 && (
          <span className={`${styles['stat-pill']} ${styles['stat-pill-generating']}`}>
            <Loader size={10} className={styles['spinning']} />
            {generatingDisplay} generating
          </span>
        )}
        <ErrorMessage message={error} />
      </>,
    );
  }, [
    setControls,
    projectFilter,
    projectOptions,
    handleProjectChange,
    generatingCount,
    generatingDisplay,
    error,
    activeSession,
  ]);

  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  useEffect(() => {
    setTitleBadge(entries.length);
  }, [setTitleBadge, entries.length]);

  // ── Badge helper ─────────────────────────────────────────────
  const badgeProps = (count: number) => ({
    badge: count,
    badgeDisabled: count === 0,
  });

  const allToolCount = builtInTools.length + customTools.length;

  // ── Top panel tab definitions (adaptive) ────────────────────
  const topTabs = useMemo(() => {
    const tabs: Array<{
      key: string;
      icon: React.ReactNode;
      tooltip: string;
      badge?: number;
      badgeDisabled?: boolean;
    }> = [
      {
        key: "settings",
        icon: <span className={tabBarStyles['tab-emoji-icon']}>🛠︎</span>,
        tooltip: "Settings",
      },
    ];

    if (!isSelectedAgent) {
      tabs.push({
        key: "params",
        icon: <span className={tabBarStyles['tab-emoji-icon']}>🎚︎</span>,
        tooltip: "Parameters",
      });
    }

    tabs.push({
      key: "info",
      icon: <span className={tabBarStyles['tab-emoji-icon']}>📄</span>,
      tooltip: "Info",
    });

    if (isSelectedAgent) {
      // Agent mode tabs
      tabs.push(
        {
          key: "workers",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>🤖</span>,
          ...badgeProps(workersCount),
          tooltip: "Workers",
        },
        {
          key: "requests",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>📊</span>,
          ...badgeProps(backendSessionStats?.requestCount || 0),
          tooltip: "Requests",
        },
      );
    }

    return tabs;
  }, [isSelectedAgent, workersCount, backendSessionStats]);

  // ── Bottom panel tab definitions (adaptive) ─────────────────
  const bottomTabs = useMemo(() => {
    const tabs: Array<{
      key: string;
      icon: React.ReactNode;
      tooltip: string;
      badge?: number;
      badgeDisabled?: boolean;
    }> = [];

    if (isSelectedAgent) {
      tabs.push(
        {
          key: "tools",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>🔧</span>,
          ...badgeProps(allToolCount),
          tooltip: "Tools",
        },
        {
          key: "skills",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>📖</span>,
          ...badgeProps(skills.filter((s) => s.enabled).length),
          tooltip: "Skills",
        },
        {
          key: "rules",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>📏</span>,
          ...badgeProps(rules.filter((r) => r.enabled).length),
          tooltip: "Rules",
        },
        {
          key: "memories",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>🧠</span>,
          ...badgeProps(totalMemoriesCount),
          tooltip: "Memories",
        },
        {
          key: "tasks",
          icon: <span className={tabBarStyles['tab-emoji-icon']}>✅</span>,
          ...badgeProps(tasksCount),
          tooltip: "Tasks",
        },
      );
    }

    return tabs;
  }, [
    isSelectedAgent,
    allToolCount,
    skills,
    rules,
    totalMemoriesCount,
    tasksCount,
  ]);

  // ── Build session stats for SettingsPanel ────────────────────
  const sessionStatsForPanel = useMemo((): PanelSessionStats | null => {
    if (!selectedEntry?.messages || selectedEntry.messages.length === 0)
      return null;

    const displayMessages = prepareDisplayMessages(selectedEntry.messages);

    const transformModalities = (
      inputModalities: Record<string, number | boolean> | undefined,
    ): Record<string, boolean> => {
      const result: Record<string, boolean> = {};
      if (inputModalities) {
        for (const [key, value] of Object.entries(inputModalities)) {
          result[key] = Boolean(value);
        }
      }
      return result;
    };

    if (isSelectedAgent && backendSessionStats) {
      return {
        messageCount: displayMessages.length,
        deletedCount: 0,
        requestCount: backendSessionStats.requestCount || requestCount,
        uniqueModels:
          (backendSessionStats.models?.length || 0) > uniqueModels.length
            ? backendSessionStats.models
            : uniqueModels,
        uniqueProviders,
        totalTokens: {
          input: backendSessionStats.totalInputTokens || 0,
          output: backendSessionStats.totalOutputTokens || 0,
          total: backendSessionStats.totalTokens || 0,
        },
        totalCost: backendSessionStats.totalCost ?? totalCost,
        originalTotalCost: 0,
        usedTools,
        modalities: transformModalities(backendSessionStats.modalities || modalities),
        completedElapsedTime:
          backendSessionStats.totalElapsedTime || completedElapsedTime,
        conversationStartTime: selectedEntry.messages.length > 0 ? selectedEntry.messages[0]?.timestamp : null,
      };
    }

    return {
      messageCount: displayMessages.length,
      deletedCount:
        ((selectedEntry as Conversation).messageCount ||
          selectedEntry.messages.length) - selectedEntry.messages.length,
      requestCount,
      uniqueModels,
      uniqueProviders,
      totalTokens,
      totalCost,
      originalTotalCost: (selectedEntry as Conversation).totalCost || 0,
      usedTools,
      modalities: transformModalities(modalities),
      conversationStartTime: selectedEntry.messages.length > 0 ? selectedEntry.messages[0]?.timestamp : null,
    };
  }, [
    selectedEntry,
    isSelectedAgent,
    backendSessionStats,
    requestCount,
    uniqueModels,
    uniqueProviders,
    totalTokens,
    totalCost,
    usedTools,
    modalities,
    completedElapsedTime,
  ]);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={`admin-chat-viewer-component ${styles['page']}`}>
      <div className={styles['chat-container']}>
        <ThreePanelLayout
          leftPanel={
            (selectedEntry as Conversation)?.settings || isSelectedAgent ? (
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
                  tabs={topTabs}
                  activeTab={leftTab}
                  onChange={setLeftTab}
                />
                {leftTab === "settings" && (
                  <>
                    <SidebarTabHeaderComponent icon={Settings} title="Settings" />
                    <SettingsPanel
                      config={config}
                      settings={settingsWithDefaults}
                      readOnly
                      hideProviderModel
                      hideSystemPrompt={isSelectedAgent}
                      workflows={workflows}
                      sessionType={isSelectedAgent ? "agent" : "chat"}
                      sessionStats={sessionStatsForPanel}
                    />
                  </>
                )}
                {leftTab === "params" && !isSelectedAgent && (
                  <>
                    <SidebarTabHeaderComponent icon={SlidersHorizontal} title="Parameters" />
                    <ParametersPanelComponent
                      settings={settingsWithDefaults}
                      config={config}
                      readOnly
                    />
                  </>
                )}
                {leftTab === "info" && (
                  <>
                    <SidebarTabHeaderComponent icon={Info} title="Model Info" />
                    <ModelInfoPanel
                      config={config}
                      settings={settingsWithDefaults}
                      readOnly
                    />
                  </>
                )}
                {leftTab === "workers" && isSelectedAgent && (
                  <>
                    <SidebarTabHeaderComponent icon={BotMessageSquare} title="Workers" count={workersCount} />
                    <WorkersPanel
                      conversationId={selectedId || ""}
                      refreshKey={0}
                      onCountChange={setWorkersCount}
                      workerToolActivity={{}}
                    />
                  </>
                )}
                {leftTab === "requests" && isSelectedAgent && selectedId && (
                  <>
                    <SidebarTabHeaderComponent icon={Activity} title="Requests" count={backendSessionStats?.requestCount || 0} />
                    <RequestsTableComponent
                      conversationId={selectedId}
                      compact
                      mini
                      maxHeight={null}
                      storageKey="admin-session-requests"
                    />
                  </>
                )}
              </div>
            ) : (
              <div className={styles['empty-panel']}>
                Select a conversation to view settings
              </div>
            )
          }
          leftPanelBottom={
            ((selectedEntry as Conversation)?.settings || isSelectedAgent) && isSelectedAgent ? (
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
                  tabs={bottomTabs}
                  activeTab={leftTabBottom}
                  onChange={setLeftTabBottom}
                />
                {leftTabBottom === "tools" && isSelectedAgent && (
                  <>
                    <SidebarTabHeaderComponent
                      icon={Wrench}
                      title="Tools"
                      count={`${builtInTools.length + customTools.length}`}
                    />
                    <CustomToolsPanel
                      tools={customTools}
                      onToolsChange={() => {}}
                      project={targetProject || PROJECT_AGENT}
                      builtInTools={builtInTools}
                      disabledTools={new Set()}
                      onToggleBuiltIn={() => {}}
                      onToggleAllBuiltIn={() => {}}
                      readOnly
                    />
                  </>
                )}
                {leftTabBottom === "skills" && isSelectedAgent && (
                  <>
                    <SidebarTabHeaderComponent icon={BookOpen} title="Skills" count={skills.length} />
                    <SkillsPanel
                      skills={skills}
                      onSkillsChange={() => {}}
                      project={targetProject || PROJECT_AGENT}
                      readOnly
                    />
                  </>
                )}
                {leftTabBottom === "rules" && isSelectedAgent && (
                  <>
                    <SidebarTabHeaderComponent icon={ScrollText} title="Rules" count={rules.length} />
                    <RulesPanel
                      rules={rules}
                      onRulesChange={() => {}}
                      agent={targetAgentId || undefined}
                      readOnly
                    />
                  </>
                )}
                {leftTabBottom === "memories" && isSelectedAgent && (
                  <>
                    <SidebarTabHeaderComponent icon={Brain} title="Memories" count={totalMemoriesCount} />
                    <MemoriesPanel
                      project={targetProject || PROJECT_AGENT}
                      refreshKey={0}
                      onCountChange={setTotalMemoriesCount}
                      memoryConfigured
                    />
                  </>
                )}
                {leftTabBottom === "tasks" && isSelectedAgent && selectedId && (
                  <>
                    <SidebarTabHeaderComponent icon={ListChecks} title="Tasks" count={tasksCount} />
                    <TasksPanel
                      project={targetProject || PROJECT_AGENT}
                      refreshKey={0}
                      conversationId={selectedId}
                      onCountChange={setTasksCount}
                    />
                  </>
                )}

              </div>
            ) : null
          }
          rightPanel={
            <HistoryPanel
              sessions={entries}
              activeId={selectedId}
              onSelect={(entry: UnifiedEntry) =>
                selectEntry(entry.id || "", entry._source || "conversation")
              }
              readOnly
              showProject
              showUsername
              newIds={newIds}
              initialProviders={providerFilter ? [providerFilter] : undefined}
              initialSearch={modelFilter || ""}
              countLabel={
                isNoAgent
                  ? "conversations"
                  : isAgentMode
                    ? "sessions"
                    : "entries"
              }
              searchText={
                isNoAgent
                  ? "Search conversations..."
                  : isAgentMode
                    ? "Search sessions..."
                    : "Search all..."
              }
              hasMore={entriesHasMore}
              loadingMore={entriesLoading}
              onLoadMore={loadMoreEntries}
              dateRange={dateRange}
              onDateChange={setDateRange}
              filterStorageKey={LS_ADMIN_CHAT_FILTERS}
            />
          }
          rightTitle={`${entries.length}${entriesHasMore ? "+" : ""} ${isNoAgent ? "Conversations" : isAgentMode ? "Sessions" : "Entries"}`}
          headerMeta={
            selectedEntry && (
              <div className={styles['header-meta']}>
                <BadgeComponent
                  type="project"
                  project={selectedEntry.project}
                />
                <BadgeComponent
                  type="user"
                  username={(selectedEntry as Conversation).username}
                />
                {isSelectedAgent && (
                  <BadgeComponent
                    type="agent"
                    agent={
                      agents.find((agent) => agent.id === selectedEntry.agent) as
                        | AgentPersona
                        | undefined
                    }
                  />
                )}
                {(selectedEntry as Conversation).isGenerating && (
                  <span className={styles['generating-badge']}>
                    <Loader size={12} className={styles['spinning']} />
                    Generating
                  </span>
                )}
              </div>
            )
          }
          headerCenter={
            <div className={layoutHeaderStyles["header-center-group"]}>
              <AgentPickerComponent
                agents={agents}
                activeAgentId={activeAgentId}
                onSelect={handleAgentSelect}
              />
              <ModelPickerPopoverComponent
                config={config}
                settings={
                  resolvedModelSettings as unknown as {
                    [key: string]: string | number | boolean | undefined;
                  }
                }
                disabled
                favorites={favoriteKeys}
                onSelectModel={() => {}}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>
          }
        >
          <div className={chatStyles['container']}>
            {/* -- Chat header bar -- */}
            <div className={chatStyles['chat-header']}>
              <div className={chatStyles['chat-header-title']}>
                <span className={chatStyles['chat-header-title-text']}>
                  {convTitle}
                </span>
              </div>
              <div className={chatStyles['chat-header-actions']}>
                {hasSystemContextMessage && (
                  <ChatViewModeControlComponent
                    viewMode={chatAreaTab === "nodes" ? "nodes" : showRaw ? "raw" : "clean"}
                    onViewModeChange={(mode: ChatViewMode) => {
                      if (mode === "nodes") {
                        setChatAreaTab("nodes");
                      } else {
                        setChatAreaTab("chat");
                        setShowRaw(mode === "raw");
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Nodes tab — inline session graph */}
            {chatAreaTab === "nodes" && isSelectedAgent && selectedId && (
              <ChatSessionGraphComponent sessionId={selectedId} />
            )}
            {chatAreaTab !== "nodes" && (
            <div className={styles['viewer-body']} ref={viewerBodyRef}>
              {!selectedEntry && !loadingDetail ? (
                <div className={styles['empty-viewer']}>
                  <MessageSquare
                    size={40}
                    style={{ opacity: 0.3, marginBottom: 12 }}
                  />
                  <div>Select a conversation to view</div>
                </div>
              ) : loadingDetail ? (
                <div className={styles['empty-viewer']}>
                  Loading conversation...
                </div>
              ) : (
                <MessageList
                  messages={prepareDisplayMessages(
                    selectedEntry?.messages || [],
                  )}
                  readOnly
                  showRaw={showRaw}
                  systemPrompt={
                    selectedEntry?.systemPrompt ||
                    sessionSystemPrompt ||
                    (selectedEntry as Conversation)?.settings?.systemPrompt ||
                    selectedEntry?.messages?.find(
                      (message) => message.role === "system" && !message.deleted,
                    )?.content
                  }
                />
              )}
            </div>
            )}
          </div>
        </ThreePanelLayout>
      </div>
    </div>
  );
}
