"use client";

import {
  ButtonComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import { ToolSchema, CustomAgent, ToolUsageStat } from "../types/types";
import { getErrorMessage } from "../utils/errorMessage";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import ToolsTableComponent from "./ToolsTableComponent";

interface ClientToolSchema extends ToolSchema {
  emoji?: string;
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

interface TopModelStat {
  model: string;
  provider: string;
  count: number;
}

interface TopAgentStat {
  agent: string;
  count: number;
}

interface ExtendedToolStats extends ToolUsageStat {
  topModels?: TopModelStat[];
  topAgents?: TopAgentStat[];
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

import StorageService from "../services/StorageService";
import {
  Wrench,
  RefreshCw,
  X,
  Play,
  AlertCircle,
  Braces,
  Bot,
  Zap,
  BarChart3,
  Activity,
  DollarSign,
  TrendingUp,
  Calendar,
  Hash,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./ToolsPageComponent.module.css";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import ToolsSidebarNavigationComponent from "./ToolsSidebarNavigationComponent";
import { humanizeToolName, formatCostAdaptive, formatCompact, formatLatencyMs, timeAgo as formatTimeAgo } from "@rodrigo-barraza/utilities-library";
// -- Agent color mapping (stable hues per built-in agent) -------
const AGENT_COLORS = {
  CODING: "#3b82f6",
  OMNI: "#dc2626",
  OOG: "#a78bfa",
  LUPOS: "#ef4444",
  STICKERS: "#f59e0b",
  LIGHTS: "#22c55e",
  DIGEST: "#14b8a6",
  IMAGE: "#ec4899",
};

function getAgentColor(agentId: string) {
  return (
    (AGENT_COLORS as Record<string, string>)[agentId] || "var(--accent-primary)"
  );
}

/**
 * Build a reverse map: toolName → [{ id, name }] from agents list.
 * Used by ToolDetailModal for displaying agent associations.
 */
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

/** Count parameters from a tool schema */
function countParams(tool: ClientToolSchema) {
  const props = tool.parameters?.properties;
  if (!props) return 0;
  return Object.keys(props).length;
}

/** Extract all unique domains from tools */
function extractDomains(tools: ClientToolSchema[]): string[] {
  const set = new Set<string>();
  for (const tool of tools) {
    if (tool.domain) set.add(tool.domain);
  }
  return [...set].sort();
}

/** Extract output fields from the `fields` parameter enum, if present */
function extractOutputFields(tool: ClientToolSchema) {
  const fieldsParam = (tool.parameters?.properties as Record<string, any>)
    ?.fields;
  if (!fieldsParam) return null;
  if ((fieldsParam as { items?: { enum?: string[] } }).items?.enum)
    return (fieldsParam as { items?: { enum?: string[] } }).items!.enum;
  if ((fieldsParam as { enum?: string[] }).enum)
    return (fieldsParam as { enum?: string[] }).enum;
  return null;
}

/** Get input parameters (excluding the `fields` meta-param) */
function getInputParams(tool: ClientToolSchema) {
  const props = tool.parameters?.properties || {};
  return Object.entries(props).filter(([name]) => name !== "fields");
}

// -- Tool Detail Modal --------------------------------------------

function ToolDetailModal({
  tool,
  onClose,
  agents,
  stats,
  allTools,
}: {
  tool: ClientToolSchema;
  onClose: () => void;
  agents: { id: string; name: string }[];
  stats: ExtendedToolStats;
  allTools: ClientToolSchema[];
}) {
  const router = useRouter();
  const required = new Set(
    (tool.parameters as { required?: string[] })?.required || [],
  );
  const inputParams = getInputParams(tool);
  const outputFields = extractOutputFields(tool);
  const cleanName = humanizeToolName(tool.name);
  const [showRaw, setShowRaw] = useState(false);

  const handleTryTool = () => {
    if (!allTools) return;
    const allToolNames = allTools.map((t: ClientToolSchema) => t.name);
    const disabledTools = allToolNames.filter(
      (name: string) => name !== tool.name,
    );
    StorageService.set("toolMemory:agent:NONE", { disabledTools });
    router.push("/chat?agent=NONE&fc=true&thinking=true");
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const successRate = stats
    ? ((stats.successCount || 0) /
        ((stats.successCount || 0) + (stats.failureCount || 0))) *
        100 || 0
    : 0;

  return (
    <div className={styles['detail-overlay']} onClick={onClose}>
      <div
        className={styles['detail-panel']}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles['detail-header']}>
          <div className={styles['detail-title-block']}>
            <div className={styles['detail-clean-name']}>
              {tool.emoji && (
                tool.emoji.startsWith("http") ? (
                  <img src={tool.emoji} alt={tool.name} className={styles['detail-emoji-image']} />
                ) : (
                  <span className={styles['detail-emoji']}>{tool.emoji}</span>
                )
              )}
              {cleanName}
            </div>
            <div className={styles['detail-title']}>{tool.name}</div>
            <div className={styles['detail-domain-row']}>
              {tool.domain && (
                <span className={styles['tool-domain']}>{tool.domain}</span>
              )}
              {tool.dataSource && (
                <span className={styles['data-source-badge']}>
                  <span className={styles['data-source-type']}>
                    {tool.dataSource.type}
                  </span>
                  {tool.dataSource.provider && (
                    <span className={styles['data-source-provider']}>
                      {tool.dataSource.provider}
                    </span>
                  )}
                  {tool.dataSource.intervalSeconds && (
                    <span className={styles['data-source-interval']}>
                      ~{tool.dataSource.intervalSeconds}s
                    </span>
                  )}
                </span>
              )}
              {agents?.length > 0 &&
                agents.map((a: { id: string; name: string }) => (
                  <span
                    key={a.id}
                    className={styles['agent-badge']}
                    style={
                      {
                        "--agent-color": getAgentColor(a.id),
                      } as React.CSSProperties
                    }
                  >
                    <Bot size={10} />
                    {a.name}
                  </span>
                ))}
            </div>
          </div>
          <button
            className={styles['detail-close']}
            onClick={onClose}
            title="Close"
          >
            <X />
          </button>
        </div>

        {/* Body */}
        <div className={styles['detail-body']}>
          <ButtonComponent
            variant="primary"
            icon={Play}
            onClick={handleTryTool}
            className={styles['try-tool-button']}
          >
            Try Tool in Direct Chat
          </ButtonComponent>

          {/* Description */}
          <div className={styles['detail-description']}>{tool.description}</div>

          {/* Lifetime Stats */}
          <div className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              <BarChart3 size={12} /> Lifetime Usage Stats
            </div>
            {stats ? (
              <>
                <div className={styles['stats-grid']}>
                  <div className={styles['stat-cell']}>
                    <Hash size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(stats.totalCalls)}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Calls</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <Activity size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(stats.totalRequests)}
                    </div>
                    <div className={styles['stat-cell-label']}>Requests</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <DollarSign size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCostAdaptive(stats.totalCost)}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Cost</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <TrendingUp size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatLatencyMs(stats.avgLatency)}
                    </div>
                    <div className={styles['stat-cell-label']}>Avg Latency</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <Zap size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(
                        (stats.totalInputTokens || 0) +
                          (stats.totalOutputTokens || 0),
                      )}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Tokens</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <CheckCircle2 size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {successRate.toFixed(0)}%
                    </div>
                    <div className={styles['stat-cell-label']}>Success Rate</div>
                  </div>
                </div>

                {/* Time Range */}
                <div className={styles['stats-time-range']}>
                  <div className={styles['stats-time-item']}>
                    <Calendar size={12} />
                    <span className={styles['stats-time-label']}>First used</span>
                    <span className={styles['stats-time-value']}>
                      {formatTimeAgo(stats.firstUsed)}
                    </span>
                  </div>
                  <div className={styles['stats-time-item']}>
                    <Clock size={12} />
                    <span className={styles['stats-time-label']}>Last used</span>
                    <span className={styles['stats-time-value']}>
                      {formatTimeAgo(stats.lastUsed)}
                    </span>
                  </div>
                  {(stats.failureCount || 0) > 0 && (
                    <div className={styles['stats-time-item']}>
                      <XCircle size={12} />
                      <span className={styles['stats-time-label']}>Failures</span>
                      <span className={styles['stats-time-value-danger']}>
                        {stats.failureCount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Top Models / Agents */}
                {((stats.topModels && stats.topModels.length > 0) ||
                  (stats.topAgents && stats.topAgents.length > 0)) && (
                  <div className={styles['stats-breakdown']}>
                    {stats.topModels && stats.topModels.length > 0 && (
                      <div className={styles['stats-breakdown-col']}>
                        <div className={styles['stats-breakdown-title']}>
                          Top Models
                        </div>
                        {stats.topModels.map((m: TopModelStat) => (
                          <div
                            key={m.model}
                            className={styles['stats-breakdown-row']}
                          >
                            <span className={styles['stats-breakdown-name']}>
                              {m.model}
                            </span>
                            <span className={styles['stats-breakdown-count']}>
                              {m.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {stats.topAgents && stats.topAgents.length > 0 && (
                      <div className={styles['stats-breakdown-col']}>
                        <div className={styles['stats-breakdown-title']}>
                          Top Agents
                        </div>
                        {stats.topAgents.map((a: TopAgentStat) => (
                          <div
                            key={a.agent}
                            className={styles['stats-breakdown-row']}
                          >
                            <span className={styles['stats-breakdown-name']}>
                              {a.agent}
                            </span>
                            <span className={styles['stats-breakdown-count']}>
                              {a.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className={styles['stats-empty']}>
                <Activity size={16} />
                No usage data recorded yet
              </div>
            )}
          </div>

          {/* Payload (Input Parameters) */}
          {inputParams.length > 0 && (
            <div className={styles['detail-section']}>
              <div className={styles['detail-section-title']}>
                Payload — Input Parameters ({inputParams.length})
              </div>
              <table className={styles['param-table']}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {inputParams.map(
                    ([name, schema]: [
                      string,
                      {
                        type?: string;
                        enum?: (string | number)[];
                        description?: string;
                      },
                    ]) => (
                      <tr key={name}>
                        <td>
                          <span className={styles['param-name']}>{name}</span>
                          {required.has(name) && (
                            <span className={styles['param-required']}>req</span>
                          )}
                        </td>
                        <td>
                          <span className={styles['param-type']}>
                            {schema.type || "any"}
                          </span>
                          {schema.enum && (
                            <div className={styles['param-enum']}>
                              {schema.enum.map((v: string | number) => (
                                <span key={v} className={styles['enum-value']}>
                                  {String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{schema.description || "—"}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Output Fields */}
          {outputFields && outputFields.length > 0 && (
            <div className={styles['detail-section']}>
              <div className={styles['detail-section-title']}>
                Output — Available Fields ({outputFields.length})
              </div>
              <div className={styles['output-fields-grid']}>
                {outputFields.map((f: string) => (
                  <span key={f} className={styles['output-field']}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON schema (collapsible) */}
          <div className={styles['detail-section']}>
            <button
              className={styles['raw-toggle']}
              onClick={() => setShowRaw(!showRaw)}
            >
              <span className={styles['detail-section-title']}>Raw Schema</span>
              <span className={styles['raw-chevron']} data-is-open={showRaw}>
                ▾
              </span>
            </button>
            {showRaw && (
              <pre className={styles['json-block']}>
                {JSON.stringify(tool, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



// -- Main Component -----------------------------------------------

export default function ToolsPageComponent() {
  const pathname = usePathname();
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



  // Detail modal
  const [selectedTool, setSelectedTool] = useState<ClientToolSchema | null>(
    null,
  );

  // -- Fetch tools ----------------------------------------------
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
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  // -- Fetch tool usage stats (non-blocking) --------------------
  const fetchToolStats = useCallback(async () => {
    try {
      const [prismStatistics, toolCallStatistics] = await Promise.all([
        PrismService.getToolStats().catch(() => []),
        ToolsApiService.getToolCallStats().catch(() => null) as Promise<any>,
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

  // -- Refresh (re-fetch from tools-api) ------------------------
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await PrismService.refreshBuiltInToolSchemas();
      await fetchTools();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [fetchTools]);

  // -- Admin header controls & badge ---------------------------
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

  // -- Derived data ---------------------------------------------
  const allDomains = useMemo(() => extractDomains(tools), [tools]);
  const toolAgentMap = useMemo(() => buildToolAgentMap(agents), [agents]);



  // -- Render ---------------------------------------------------

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
            <span className={styles['loading-text']}>Loading tools from Prism…</span>
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
        toolStats={toolStats as any}
        onSelect={(tool) => setSelectedTool(tool as ClientToolSchema)}
      />

      {/* Detail modal */}
      {selectedTool && (
        <ToolDetailModal
          tool={selectedTool}
          agents={
            (toolAgentMap as Record<string, { id: string; name: string }[]>)[
              (selectedTool as ClientToolSchema).name
            ] || []
          }
          stats={(toolStats as Record<string, any>)[(selectedTool as any).name]}
          allTools={tools}
          onClose={() => setSelectedTool(null)}
        />
      )}
    </div>
    </ThreePanelLayout>
  );
}
