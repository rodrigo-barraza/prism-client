"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Bot,
  Settings,
  Wrench,
  Brain,
  Plug,
  GitBranch,
  ListChecks,
  BookOpen,
  Users,
  Info,
  Layers,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
} from "lucide-react";
import IrisService from "../services/IrisService";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import HistoryPanel from "./HistoryPanelComponent";
import SettingsPanel from "./SettingsPanelComponent";
import ModelInfoPanel from "./ModelInfoPanelComponent";
import CustomToolsPanel from "./CustomToolsPanelComponent";
import SkillsPanel from "./SkillsPanelComponent";
import MemoriesPanel from "./MemoriesPanelComponent";
import TasksPanel from "./TasksPanelComponent";
import MCPServersPanel from "./MCPServersPanelComponent";
import CoordinatorPanel from "./CoordinatorPanelComponent";
import WorkersPanel from "./WorkersPanelComponent";
import MessageList, { prepareDisplayMessages } from "./MessageListComponent";

import BadgeComponent from "./BadgeComponent";
import { useAdminHeader } from "./AdminHeaderContextComponent";

import { formatNumber } from "../utils/utilities";
import useSessionStats from "../hooks/useSessionStats";
import { PROJECT_AGENT } from "../constants";
import type { PrismConfig, Message, Conversation, CustomTool, ToolSchema, Skill, MCPServer, SessionStats, ModelOption } from "../types/types";
import { getErrorMessage } from "../utils/errorMessage";
import chatStyles from "./ChatAreaComponent.module.css";
import styles from "./AdminAgentViewerComponent.module.css";
import {
  EmptyStateComponent,
  TabBarComponent,
  tabBarStyles,
} from "@rodrigo-barraza/components-library";

/**
 * AdminAgentViewerComponent — read-only admin viewer for agent sessions.
 * Designed to work WITHIN AdminShell's main area (not ThreePanelLayout).
 * Reuses all agent sub-components: TabBarComponent, SettingsPanel,
 * MessageList, HistoryPanel, MemoriesPanel, TasksPanel, WorkersPanel, etc.
 */
export default function AdminAgentViewerComponent() {
  const { setTitleBadge, setControls } = useAdminHeader();

  // -- State ----------------------------------------------------
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, _setPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [title, setTitle] = useState("");
  const [leftTab, setLeftTab] = useState("settings");
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [builtInTools, setBuiltInTools] = useState<ToolSchema[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [memoriesRefreshKey] = useState(0);
  const [totalMemoriesCount, setTotalMemoriesCount] = useState(0);
  const [workersCount, setWorkersCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [backendSessionStats, setBackendSessionStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [settings, setSettings] = useState({
    provider: "",
    model: "",
    temperature: 1.0,
    maxTokens: 64000,
    functionCallingEnabled: true,
  });

  const endRef = useRef<HTMLDivElement | null>(null);

  // -- Effects --------------------------------------------------

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set admin header badge
  useEffect(() => {
    setTitleBadge(total > 0 ? formatNumber(total) : null);
    return () => setTitleBadge(null);
  }, [total, setTitleBadge]);

  // Cleanup admin controls on unmount
  useEffect(() => {
    return () => setControls(null);
  }, [setControls]);

  // Fetch Prism config (for model info panels, provider logos, etc.)
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: (config: PrismConfig) => setConfig(config),
      onLocalMerge: (merged: PrismConfig) => setConfig(merged),
    }).catch(console.error);
  }, []);

  // Load agent sessions list (admin — cross-user)
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await IrisService.getAgentSessions({
        page,
        limit: 50,
        sort: "updatedAt",
        order: "desc",
      });
      setSessions((data.data as Conversation[]) || []);
      setTotal(data.total || 0);
    } catch (error: unknown) {
      console.error("Failed to load admin agent sessions:", getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load custom tools (read-only display)
  useEffect(() => {
    PrismService.getCustomTools(PROJECT_AGENT)
      .then((tools: CustomTool[]) => setCustomTools(tools))
      .catch(() => {});
  }, []);

  // Load skills (read-only display)
  useEffect(() => {
    PrismService.getSkills(PROJECT_AGENT)
      .then((s: Skill[]) => setSkills(s))
      .catch(() => {});
  }, []);

  // Load MCP servers (read-only display)
  useEffect(() => {
    PrismService.getMCPServers(PROJECT_AGENT)
      .then((s: MCPServer[]) => setMcpServers(s))
      .catch(() => {});
  }, []);

  // Load built-in tools
  useEffect(() => {
    PrismService.getBuiltInToolSchemas("CODING")
      .then((tools: ToolSchema[]) => setBuiltInTools(tools))
      .catch(() => {});
  }, []);

  // Fetch memory count
  useEffect(() => {
    PrismService.getAgentMemories(PROJECT_AGENT, 1, undefined)
      .then((r: { total?: number }) => setTotalMemoriesCount(r.total || 0))
      .catch(() => {});
  }, []);

  // -- Filtered config: only function-calling models ------------
  const filteredConfig = useMemo((): PrismConfig | null => {
    if (!config) return null;
    const textModelsMap = config.textToText?.models || {};
    const filteredTextModels: Record<string, ModelOption[]> = {};

    for (const [provider, models] of Object.entries(textModelsMap)) {
      const fcModels = models.filter((m) =>
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
        ...(config.textToText || {}),
        models: filteredTextModels,
      },
      textToImage: { models: {}, defaults: {} },
      textToSpeech: { models: {}, voices: {}, defaultVoices: {}, defaults: {} },
      audioToText: { models: {}, defaults: {} },
      imageToText: { models: {}, defaults: {} },
      embedding: { models: {}, defaults: {} },
    };
  }, [config]);

  // -- Session stats -------------------------------------------
  const {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens,
    requestCount,
    usedTools,
    modalities,
    elapsedTime: completedElapsedTime,
  } = useSessionStats(messages);

  // Fetch backend stats when session changes
  const fetchSessionStats = useCallback((sessionId: string) => {
    if (!sessionId) return;
    IrisService.getSessionStats(sessionId)
      .then((stats: SessionStats) => setBackendSessionStats(stats))
      .catch(() => {});
  }, []);

  // -- Session selection ----------------------------------------
  const handleSelectSession = useCallback(
    async (conversation: Conversation) => {
      try {
        const cId = conversation.id || "";
        const full = await IrisService.getAgentSession(cId);
        const displayMessages = prepareDisplayMessages(full.messages || []);
        setMessages(displayMessages);
        setAgentSessionId(cId || null);
        setActiveId(cId || null);
        setTitle(full.title || "Agent Session");

        // Restore settings from the last assistant message
        const lastAssistant = [...(full.messages || [])]
          .reverse()
          .find((m) => m.role === "assistant" && m.provider);
        if (lastAssistant) {
          const gs = (lastAssistant.generationSettings || {}) as Record<string, unknown>;
          setSettings((prev) => {
            const next = { ...prev };
            if (lastAssistant.provider) next.provider = lastAssistant.provider;
            if (lastAssistant.model) next.model = lastAssistant.model;
            if (gs.temperature !== undefined) next.temperature = gs.temperature as number;
            if (gs.maxTokens !== undefined) next.maxTokens = gs.maxTokens as number;
            return next;
          });
        }

        // Fetch backend aggregate stats
        fetchSessionStats(cId);

        // Fetch tasks count for this session
        ToolsApiService.getAllAgenticTasks({ agentSessionId: cId })
          .then((r: { summary?: { total?: number }; tasks?: unknown[] }) =>
            setTasksCount(r.summary?.total || (r.tasks || []).length),
          )
          .catch(() => {});

        // Fetch workers count
        PrismService.getCoordinatorWorkers(cId)
          .then((r: { workers?: unknown[] }) => setWorkersCount((r.workers || []).length))
          .catch(() => {});
      } catch (error: unknown) {
        console.error("Failed to load agent session:", getErrorMessage(error));
      }
    },
    [fetchSessionStats],
  );

  // Tool count for badge
  const allToolCount = builtInTools.length + customTools.length;

  // -- Badge helper ---------------------------------------------
  const badgeProps = (count: number) => ({
    badge: count,
    badgeDisabled: count === 0,
  });

  // -- Left sidebar: tab bar + content --------------------------
  const leftPanel = (
    <>
      <TabBarComponent
        tabs={[
          {
            key: "settings",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🛠︎</span>,
            tooltip: "Settings",
          },
          { key: "info", icon: <span className={tabBarStyles.tabEmojiIcon}>📄</span>, tooltip: "Info" },
          {
            key: "tools",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🔧</span>,
            ...badgeProps(allToolCount),
            tooltip: "Tools",
          },
          {
            key: "skills",
            icon: <span className={tabBarStyles.tabEmojiIcon}>📖</span>,
            ...badgeProps(skills.filter((s) => s.enabled).length),
            tooltip: "Skills",
          },
          {
            key: "memories",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🧠</span>,
            ...badgeProps(totalMemoriesCount),
            tooltip: "Memories",
          },
          {
            key: "tasks",
            icon: <span className={tabBarStyles.tabEmojiIcon}>✅</span>,
            ...badgeProps(tasksCount),
            tooltip: "Tasks",
          },
          {
            key: "mcp",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🔌</span>,
            ...badgeProps(mcpServers.filter((s) => s.connected).length),
            tooltip: "MCP Servers",
          },
          {
            key: "workers",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🤖</span>,
            ...badgeProps(workersCount),
            tooltip: "Workers",
          },
          {
            key: "coordinator",
            icon: <span className={tabBarStyles.tabEmojiIcon}>🌿</span>,
            tooltip: "Coordinator",
          },
        ]}
        activeTab={leftTab}
        onChange={setLeftTab}
      />

      {leftTab === "settings" && (
        <SettingsPanel
          config={filteredConfig}
          settings={settings}
          onChange={() => {}}
          readOnly
          hideSystemPrompt
          sessionType="agent"
          sessionStats={
            messages.length > 0
              ? {
                  messageCount: messages.length,
                  deletedCount: 0,
                  requestCount:
                    backendSessionStats?.requestCount || requestCount,
                  uniqueModels:
                    (backendSessionStats?.models?.length || 0) >
                    uniqueModels.length
                      ? backendSessionStats!.models || []
                      : uniqueModels,
                  uniqueProviders,
                  totalTokens: backendSessionStats
                    ? {
                        input: backendSessionStats.totalInputTokens || 0,
                        output: backendSessionStats.totalOutputTokens || 0,
                        total: backendSessionStats.totalTokens || 0,
                      }
                    : totalTokens,
                  totalCost:
                    backendSessionStats?.totalCost ?? totalCost,
                  originalTotalCost: 0,
                  usedTools,
                  modalities: (backendSessionStats?.modalities
                    ? Object.fromEntries(
                        Object.entries(backendSessionStats.modalities).map(([k, v]) => [k, Boolean(v)])
                      )
                    : modalities) as Record<string, boolean>,
                  completedElapsedTime:
                    backendSessionStats?.totalElapsedTime ||
                    completedElapsedTime,
                }
              : null
          }
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
          onToolsChange={() => {}}
          project={PROJECT_AGENT}
          builtInTools={builtInTools}
          disabledBuiltIns={new Set()}
          onToggleBuiltIn={() => {}}
          onToggleAllBuiltIn={() => {}}
          readOnly
        />
      )}

      {leftTab === "skills" && (
        <SkillsPanel
          skills={skills}
          onSkillsChange={() => {}}
          project={PROJECT_AGENT}
          readOnly
        />
      )}

      {leftTab === "memories" && (
        <MemoriesPanel
          project={PROJECT_AGENT}
          refreshKey={memoriesRefreshKey}
          onCountChange={setTotalMemoriesCount}
          memoryConfigured
        />
      )}

      {leftTab === "tasks" && agentSessionId && (
        <TasksPanel
          project={PROJECT_AGENT}
          refreshKey={0}
          agentSessionId={agentSessionId}
          onCountChange={setTasksCount}
        />
      )}

      {leftTab === "mcp" && (
        <MCPServersPanel
          servers={mcpServers}
          onServersChange={() => {}}
          project={PROJECT_AGENT}
          readOnly
        />
      )}

      {leftTab === "workers" && agentSessionId && (
        <WorkersPanel
          agentSessionId={agentSessionId}
          refreshKey={0}
          onCountChange={setWorkersCount}
          workerToolActivity={{}}
        />
      )}

      {leftTab === "coordinator" && (
        <CoordinatorPanel project={PROJECT_AGENT} />
      )}
    </>
  );

  // -- Center: chat area (read-only) ---------------------------
  const chatContent = (
    <div className={chatStyles.container}>
      <div className={chatStyles.messagesList}>
        {!activeId && (
          <EmptyStateComponent
            icon={<Bot size={40} />}
            title="Agent Sessions"
            subtitle="Select a session from the right panel to view its messages and tool activity."
          />
        )}

        <MessageList
          messages={messages.filter(
            (m) => m.role === "user" || m.role === "assistant",
          )}
          isGenerating={false}
          streamingOutputs={new Map()}
        />

        <div ref={endRef} style={{ minHeight: 24 }} />
      </div>

      {/* Read-only banner instead of input area */}
      {activeId && (
        <div className={styles.readOnlyBanner}>
          <Layers size={13} />
          Read-only admin view — {messages.length} messages
        </div>
      )}
    </div>
  );

  // -- Layout (within AdminShell's main area) ------------------
  return (
    <div className={styles.viewer}>
      {/* Mini header: session title + model badge + panel toggles */}
      <header className={styles.viewerHeader}>
        <button
          className={`${styles.panelToggle} ${!showLeft ? styles.panelToggleHidden : ""}`}
          onClick={() => setShowLeft((v) => !v)}
          title={showLeft ? "Hide settings" : "Show settings"}
        >
          {showLeft ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
        </button>

        <span className={styles.viewerTitle}>
          {title || "Select a session"}
        </span>

        {activeId && settings.model && (
          <BadgeComponent
            type="model"
            models={[settings.model]}
            provider={settings.provider}
          />
        )}

        <div style={{ flex: 1 }} />

        <button
          className={`${styles.panelToggle} ${!showRight ? styles.panelToggleHidden : ""}`}
          onClick={() => setShowRight((v) => !v)}
          title={showRight ? "Hide sessions" : "Show sessions"}
        >
          {showRight ? <PanelRightClose size={15} /> : <PanelRight size={15} />}
        </button>
      </header>

      {/* 3-column body */}
      <div className={styles.viewerBody}>
        {/* Left panel - settings/tools/info tabs */}
        <aside
          className={`${styles.leftPanel} ${!showLeft ? styles.panelHidden : ""}`}
        >
          {leftPanel}
        </aside>

        {/* Center - messages */}
        <section className={styles.centerPanel}>{chatContent}</section>

        {/* Right panel - sessions list */}
        <aside
          className={`${styles.rightPanel} ${!showRight ? styles.panelHidden : ""}`}
        >
          <HistoryPanel
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            readOnly
            showProject
            showUsername
            emptyText={loading ? "Loading..." : "No agent sessions"}
            searchText="Search sessions..."
            itemIcon={Bot}
            countLabel="sessions"
          />
        </aside>
      </div>
    </div>
  );
}
