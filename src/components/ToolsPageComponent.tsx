"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import { ToolSchema } from "../types/types";
import { getErrorMessage } from "../utils/errorMessage";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import ToolsTableComponent, { type ToolUsageStat } from "./ToolsTableComponent";
import ToolDetailModalComponent, {
  type ToolDetailStats,
} from "./ToolDetailModalComponent";

import {
  Wrench,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./ToolsPageComponent.module.css";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import ToolsSidebarNavigationComponent from "./ToolsSidebarNavigationComponent";

/* -- Types --------------------------------------------------- */

interface ClientToolSchema extends ToolSchema {
  emoji?: string | string[];
  dataSource?: {
    type: string;
    provider?: string;
    intervalSeconds?: number;
  };
}

interface AgentMinimal {
  id: string;
  name: string;
  enabledToolNames?: string[];
  toolCount?: number;
}

interface ExtendedToolStats extends ToolUsageStat {
  topModels?: { model: string; provider: string; count: number }[];
  topAgents?: { agent: string; count: number }[];
  avgLatency?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  successCount?: number;
  failureCount?: number;
  firstUsed?: string;
  lastUsed?: string;
  minLatency?: number;
  maxLatency?: number;
  errorRate?: number;
  totalTransferBytes?: number;
}

/* -- Helpers ------------------------------------------------- */

function buildToolAgentMap(agents: AgentMinimal[]) {
  const map: Record<string, { id: string; name: string }[]> = {};
  for (const agent of agents) {
    if (!agent.enabledToolNames) continue;
    if (agent.enabledToolNames.includes("*")) continue;
    for (const toolName of agent.enabledToolNames) {
      if (!map[toolName]) map[toolName] = [];
      map[toolName].push({ id: agent.id, name: agent.name });
    }
  }
  return map;
}

function extractDomains(tools: ClientToolSchema[]): string[] {
  const domainSet = new Set<string>();
  for (const tool of tools) {
    if (tool.domain) domainSet.add(tool.domain);
  }
  return [...domainSet].sort();
}

/* -- Main Component ------------------------------------------ */

export default function ToolsPageComponent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const isAdministratorMode = pathname.startsWith("/admin");
  const adminHeader = useAdminHeader();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tools, setTools] = useState<ClientToolSchema[]>([]);
  const [agents, setAgents] = useState<AgentMinimal[]>([]);
  const [toolStats, setToolStats] = useState<Record<string, ExtendedToolStats>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedTool, setSelectedTool] = useState<ClientToolSchema | null>(
    null,
  );

  const toolNameFromUrl = searchParameters.get("name");

  /* -- Deep-link: resolve ?name= once tools are loaded -------- */
  const hasResolvedDeepLink = useRef(false);
  useEffect(() => {
    if (hasResolvedDeepLink.current || !toolNameFromUrl || tools.length === 0) return;
    const matchedTool = tools.find(
      (tool) => tool.name.toLowerCase() === toolNameFromUrl.toLowerCase(),
    );
    if (matchedTool) {
      setSelectedTool(matchedTool);
    }
    hasResolvedDeepLink.current = true;
  }, [toolNameFromUrl, tools]);

  /* -- Sync URL when selected tool changes -------------------- */
  const handleToolSelect = useCallback(
    (tool: ClientToolSchema) => {
      setSelectedTool(tool);
      const nextParameters = new URLSearchParams(searchParameters.toString());
      nextParameters.set("name", tool.name);
      router.replace(`${pathname}?${nextParameters.toString()}`, { scroll: false });
    },
    [router, pathname, searchParameters],
  );

  const handleToolClose = useCallback(() => {
    setSelectedTool(null);
    const nextParameters = new URLSearchParams(searchParameters.toString());
    nextParameters.delete("name");
    const queryString = nextParameters.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [router, pathname, searchParameters]);

  /* -- Fetch tools -------------------------------------------- */
  const fetchTools = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [schemas, agentList] = await Promise.all([
        PrismService.getBuiltInToolSchemas(undefined),
        PrismService.getAgentPersonas().catch(() => []),
      ]);
      setTools(schemas || []);
      setAgents((agentList as AgentMinimal[]) || []);
    } catch (fetchError: unknown) {
      setError(getErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  /* -- Fetch tool usage stats (non-blocking) ------------------ */
  const fetchToolStats = useCallback(async () => {
    try {
      const [prismStatistics, toolCallStatistics] = await Promise.all([
        PrismService.getToolStats().catch(() => []),
        ToolsApiService.getToolCallStats().catch(() => null) as Promise<{
          byTool?: Array<{
            toolName: string;
            count: number;
            avgMs: number;
            minMs: number;
            maxMs: number;
            errorRate: number;
            totalTransferBytes: number;
          }>;
        } | null>,
      ]);
      const statisticsMap: Record<string, ExtendedToolStats> = {};
      for (const statistics of prismStatistics || []) {
        statisticsMap[statistics.tool] = statistics;
      }
      if (toolCallStatistics && toolCallStatistics.byTool) {
        for (const toolStat of toolCallStatistics.byTool) {
          const toolName = toolStat.toolName;
          const existingStatistics = statisticsMap[toolName] || {};
          statisticsMap[toolName] = {
            ...existingStatistics,
            tool: toolName,
            totalCalls: toolStat.count,
            avgLatency: toolStat.avgMs,
            minLatency: toolStat.minMs,
            maxLatency: toolStat.maxMs,
            errorRate: toolStat.errorRate,
            totalTransferBytes: toolStat.totalTransferBytes,
          };
        }
      }
      setToolStats(statisticsMap);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchTools();
    fetchToolStats();
  }, [fetchTools, fetchToolStats]);

  /* -- Refresh (re-fetch from tools-api) ---------------------- */
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await PrismService.refreshBuiltInToolSchemas();
      await fetchTools();
    } catch (refreshError: unknown) {
      setError(getErrorMessage(refreshError));
    } finally {
      setRefreshing(false);
    }
  }, [fetchTools]);

  /* -- Admin header controls & badge -------------------------- */
  const { setControls, setTitleBadge } = adminHeader;
  useEffect(() => {
    if (!isAdministratorMode) return;

    setControls(
      <button
        className={`${styles['refresh-button']} ${refreshing ? styles['spinning'] : ""}`}
        onClick={handleRefresh}
        disabled={refreshing}
        title="Re-fetch schemas from tools-api"
      >
        <RefreshCw /> Refresh
      </button>,
    );

    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [isAdministratorMode, setControls, setTitleBadge, refreshing, handleRefresh]);

  useEffect(() => {
    if (!isAdministratorMode) return;
    setTitleBadge(tools.length);
  }, [isAdministratorMode, setTitleBadge, tools.length]);

  /* -- Derived data ------------------------------------------- */
  const allDomains = useMemo(() => extractDomains(tools), [tools]);
  const toolAgentMap = useMemo(() => buildToolAgentMap(agents), [agents]);

  /* -- Render ------------------------------------------------- */

  if (loading) {
    return (
      <ThreePanelLayout
        navSidebar={isAdministratorMode ? null : <NavigationSidebarComponent mode="user" />}
        leftPanel={null}
        leftTitle="Domains"
        title="Tools"
        hideHeader={isAdministratorMode}
      >
        <div className={styles['container']}>
          <div className={styles['is-loading-state']}>
            <PanelLoadingSpinner size="large" />
            <span className={styles['is-loading-state-text']}>Loading tools from Prism…</span>
          </div>
        </div>
      </ThreePanelLayout>
    );
  }

  return (
    <ThreePanelLayout
      className="tools-page-component"
      navSidebar={isAdministratorMode ? null : <NavigationSidebarComponent mode="user" />}
      leftPanel={
        <ToolsSidebarNavigationComponent
          domains={allDomains}
          scrollContainerRef={scrollContainerRef}
        />
      }
      leftTitle="Domains"
      title="Tools"
      hideHeader={isAdministratorMode}
      headerControls={
        isAdministratorMode ? null : (
          <button
            className={`${styles['refresh-button']} ${refreshing ? styles['spinning'] : ""}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Re-fetch schemas from tools-api"
          >
            <RefreshCw /> Refresh
          </button>
        )
      }
    >
      <div className={styles['container']} ref={scrollContainerRef}>
        <div className={styles['header']}>
          <div className={styles['header-left']}>
            <h2 className={styles['title']}>
              <Wrench className={styles['title-icon']} size={20} />
              Tools
            </h2>
            <p className={styles['subtitle']}>
              All available tool schemas from the Tools API — used for agentic function calling.
            </p>
          </div>
        </div>

        <div className={styles['stats-badges']}>
          <div className={styles['stat-badge']}>
            <span className={styles['stat-value']}>{tools.length}</span> tools
          </div>
          <div className={styles['stat-badge']}>
            <span className={styles['stat-value']}>{allDomains.length}</span>{" "}
            domains
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className={styles['error']}>
            <AlertCircle />
            {error}
          </div>
        )}

        <ToolsTableComponent
          tools={tools}
          agents={agents}
          toolStats={toolStats}
          onSelect={(tool) => handleToolSelect(tool as ClientToolSchema)}
        />

        {/* Detail modal */}
        {selectedTool && (
          <ToolDetailModalComponent
            tool={selectedTool}
            agents={
              (toolAgentMap as Record<string, { id: string; name: string }[]>)[
                selectedTool.name
              ] || []
            }
            stats={toolStats[selectedTool.name] || ({} as ToolDetailStats)}
            allTools={tools}
            onClose={handleToolClose}
          />
        )}
      </div>
    </ThreePanelLayout>
  );
}
