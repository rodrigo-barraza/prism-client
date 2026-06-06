"use client";

import {
  SearchInputComponent,
  SelectComponent,
  ToolCardComponent as ToolSchemaCard,
  TableComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import { ToolSchema, CustomAgent, ToolUsageStat } from "../types/types";
import { getErrorMessage } from "../utils/errorMessage";
import { useAdminHeader } from "./AdminHeaderContextComponent";

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
  Search,
  LayoutGrid,
  List,
  Table,
  RefreshCw,
  X,
  Play,
  AlertCircle,
  Braces,
  Cloud,
  Globe,
  Cpu,
  Terminal,
  GitBranch,
  Database,
  Zap,
  Shield,
  Heart,
  Navigation,
  Ship,
  Lightbulb,
  MessageCircle,
  Palette,
  Gamepad2,
  Bot,
  Brain,
  Layers,
  FileSearch,
  FolderOpen,
  Cog,
  Clock,
  Package,
  BarChart3,
  Activity,
  DollarSign,
  TrendingUp,
  Calendar,
  Hash,
  CheckCircle2,
  XCircle,
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
 * Each agent has enabledToolNames (resolved array of tool name strings).
 * Agents with enabledToolNames: ["*"] are omitted from the per-tool map
 * since they apply to ALL tools (avoids noise in every tool card).
 */
function buildToolAgentMap(agents: AgentMinimal[]) {
  const map = {};
  for (const agent of agents) {
    if (!agent.enabledToolNames) continue;
    // Skip wildcard agents — they apply to all tools
    if (agent.enabledToolNames.includes("*")) continue;
    for (const toolName of agent.enabledToolNames) {
      if (!(map as Record<string, { id: string; name: string }[]>)[toolName])
        (map as Record<string, { id: string; name: string }[]>)[toolName] = [];
      (map as Record<string, { id: string; name: string }[]>)[toolName].push({
        id: agent.id,
        name: agent.name,
      });
    }
  }
  return map;
}

// -- Domain → Icon mapping --------------------------------------
const DOMAIN_ICONS = {
  "Weather & Environment": Cloud,
  Events: Zap,
  Sports: Gamepad2,
  "Markets & Commodities": Database,
  Trends: Globe,
  Products: Package,
  Finance: Database,
  Knowledge: Brain,
  "Movies & TV": Palette,
  Health: Heart,
  Transit: Navigation,
  Utilities: Cog,
  Compute: Cpu,
  Maritime: Ship,
  Energy: Lightbulb,
  Communication: MessageCircle,
  Creative: Palette,
  Discord: MessageCircle,
  "Smart Home": Lightbulb,
  Reasoning: Brain,
  Coordinator: Bot,
  Workspace: FolderOpen,
  Web: Globe,
  Browser: Globe,
  "Task Management": Layers,
  Memory: Brain,
  "Agent Management": Bot,
  "Model Context Protocol": Cpu,
  Meta: Cog,
  "Scheduled Tasks": Clock,
  Timers: Clock,
  Skills: Zap,
  "Control Flow": Shield,
  "Structured Output": Braces,
};

function getDomainIcon(domain: string) {
  return (DOMAIN_ICONS as Record<string, React.ElementType>)[domain] || Wrench;
}

/** Count parameters from a tool schema */
function countParams(tool: ClientToolSchema) {
  const props = tool.parameters?.properties;
  if (!props) return 0;
  return Object.keys(props).length;
}

/** Extract all unique domains from tools */
function extractDomains(tools: ClientToolSchema[]): string[] {
  const set = new Set();
  for (const t of tools) {
    if (t.domain) set.add(t.domain);
  }
  return [...set].sort() as string[];
}

/** Extract all unique labels from tools */
function extractLabels(tools: ClientToolSchema[]): string[] {
  const set = new Set();
  for (const t of tools) {
    if (t.labels) {
      for (const l of t.labels) set.add(l);
    }
  }
  return [...set].sort() as string[];
}

/** Group tools by domain, sorted alphabetically */
function groupByDomain(
  tools: ClientToolSchema[],
): Record<string, ClientToolSchema[]> {
  const groups: Record<string, ClientToolSchema[]> = {};
  for (const tool of tools) {
    const domain = tool.domain || "Uncategorized";
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(tool);
  }
  return Object.fromEntries(
    Object.entries(groups).sort(([domainA], [domainB]) =>
      domainA.localeCompare(domainB),
    ),
  );
}

/** Extract output fields from the `fields` parameter enum, if present */
function extractOutputFields(tool: ClientToolSchema) {
  const fieldsParam = (tool.parameters?.properties as Record<string, any>)
    ?.fields;
  if (!fieldsParam) return null;
  // Fields param has items.enum or direct enum
  if ((fieldsParam as { items?: { enum?: string[] } }).items?.enum)
    return (fieldsParam as { items?: { enum?: string[] } }).items!.enum;
  if ((fieldsParam as { enum?: string[] }).enum)
    return (fieldsParam as { enum?: string[] }).enum;
  // Check description for available fields hint
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
              {tool.labels?.map((l: string) => (
                <span key={l} className={styles['tool-label']}>
                  {l}
                </span>
              ))}
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
          <button className={styles['try-tool-button']} onClick={handleTryTool}>
            <Play size={14} /> Try Tool in Direct Chat
          </button>

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

// -- Tool Card (Grid view) ----------------------------------------

function ToolCard({
  tool,
  onClick,
  agents,
}: {
  tool: ClientToolSchema;
  onClick: (t: ClientToolSchema) => void;
  agents: { id: string; name: string }[];
}) {
  const paramCount = countParams(tool);
  return (
    <ToolSchemaCard
      name={tool.name}
      description={tool.description}
      emoji={tool.emoji}
      domain={tool.domain}
      onClick={() => onClick(tool)}
    >
      {agents?.length > 0 && (
        <div className={styles['agent-badges']}>
          <BadgeComponent type="agent" agents={agents} size={20} iconSize={11} />
        </div>
      )}
      {tool.labels?.slice(0, 4).map((l: string) => (
        <span key={l} className={styles['tool-label']}>
          {l}
        </span>
      ))}
      {paramCount > 0 && (
        <span className={styles['param-count']}>
          <Braces /> {paramCount} param{paramCount !== 1 ? "s" : ""}
        </span>
      )}
    </ToolSchemaCard>
  );
}

// -- Tool Row (List view) -----------------------------------------

function ToolRow({
  tool,
  onClick,
  agents,
  statistics,
}: {
  tool: ClientToolSchema;
  onClick: (tool: ClientToolSchema) => void;
  agents: { id: string; name: string }[];
  statistics?: ExtendedToolStats;
}) {
  const parameterCount = countParams(tool);
  const totalCallsCount = statistics?.totalCalls ?? 0;
  const averageLatency = statistics?.avgLatency ?? 0;
  const minimumLatency = statistics?.minLatency ?? 0;
  const maximumLatency = statistics?.maxLatency ?? 0;
  const errorRatePercentage = statistics?.errorRate ?? 0;
  const totalTransferBytes = statistics?.totalTransferBytes ?? 0;

  return (
    <div className={styles['tool-row']} onClick={() => onClick(tool)}>
      {tool.emoji ? (
        tool.emoji.startsWith("http") ? (
          <img src={tool.emoji} alt={tool.name} className={styles['tool-row-emoji-image']} />
        ) : (
          <span className={styles['tool-row-emoji']}>{tool.emoji}</span>
        )
      ) : (
        <span className={styles['tool-row-emoji']} />
      )}
      <span className={styles['tool-row-name']} title={tool.name}>
        {tool.name}
      </span>
      <span className={styles["statistic-cell"]}>
        {totalCallsCount > 0 ? formatCompact(totalCallsCount) : "—"}
      </span>
      <span className={styles["statistic-cell"]}>
        {totalCallsCount > 0 ? formatLatencyMs(averageLatency) : "—"}
      </span>
      <span className={styles["statistic-cell"]}>
        {totalCallsCount > 0 ? formatLatencyMs(minimumLatency) : "—"}
      </span>
      <span className={styles["statistic-cell"]}>
        {totalCallsCount > 0 ? formatLatencyMs(maximumLatency) : "—"}
      </span>
      <span className={styles["statistic-cell"]}>
        {totalCallsCount > 0 ? `${errorRatePercentage.toFixed(0)}%` : "—"}
      </span>
      <span className={styles["statistic-cell"]}>
        {totalTransferBytes > 0 ? formatCompact(totalTransferBytes) : "—"}
      </span>
      <div className={styles['tool-row-meta']}>
        {agents?.length > 0 && (
          <BadgeComponent type="agent" agents={agents} size={20} iconSize={11} />
        )}
        {tool.domain && (
          <span className={styles['tool-domain']}>{tool.domain}</span>
        )}
        {parameterCount > 0 && (
          <span className={styles['param-count']}>
            <Braces /> {parameterCount}
          </span>
        )}
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

  // Filters
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [view, setView] = useState("grid"); // "grid" | "list" | "table"

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
  const allLabels = useMemo(() => extractLabels(tools), [tools]);
  const toolAgentMap = useMemo(() => buildToolAgentMap(agents), [agents]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    const hasDomainFilter = domainFilter.length > 0;
    const hasLabelFilter = labelFilter.length > 0;
    const hasAgentFilter = agentFilter.length > 0;

    // Pre-compute the union of tool names across all selected agents
    let agentToolUnion: Set<string> | null = null;
    if (hasAgentFilter) {
      agentToolUnion = new Set<string>();
      let hasWildcard = false;
      for (const selectedAgentId of agentFilter) {
        const agentData = agents.find((a: AgentMinimal) => a.id === selectedAgentId);
        if (agentData?.enabledToolNames?.includes("*")) {
          hasWildcard = true;
          break;
        }
        if (agentData?.enabledToolNames) {
          for (const toolName of agentData.enabledToolNames) {
            agentToolUnion.add(toolName);
          }
        }
      }
      if (hasWildcard) agentToolUnion = null;
    }

    return tools.filter((t: ClientToolSchema) => {
      if (hasDomainFilter && (!t.domain || !domainFilter.includes(t.domain))) return false;
      if (hasLabelFilter && (!t.labels || !t.labels.some((label: string) => labelFilter.includes(label)))) return false;
      if (agentToolUnion && !agentToolUnion.has(t.name)) return false;
      if (normalizedSearch) {
        const agentNames = (
          (toolAgentMap as Record<string, { id: string; name: string }[]>)[
            t.name
          ] || []
        )
          .map((a: { id: string; name: string }) => a.name)
          .join(" ");
        const haystack =
          `${t.name} ${t.description} ${t.domain || ""} ${(t.labels || []).join(" ")} ${agentNames}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      }
      return true;
    });
  }, [
    tools,
    search,
    domainFilter,
    labelFilter,
    agentFilter,
    agents,
    toolAgentMap,
  ]);

  const grouped = useMemo(() => groupByDomain(filtered), [filtered]);

  const tableColumns = useMemo(() => {
    return [
      {
        key: "emoji",
        label: "",
        align: "center" as const,
        sortable: true,
        sortValue: (row: ClientToolSchema) => row.emoji || "",
        width: "40px",
        render: (row: ClientToolSchema) => (
          row.emoji ? (
            row.emoji.startsWith("http") ? (
              <img src={row.emoji} alt={row.name} style={{ width: "1.25rem", height: "1.25rem", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: "1.1rem" }}>{row.emoji}</span>
            )
          ) : (
            <Wrench size={14} style={{ opacity: 0.4 }} />
          )
        ),
      },
      {
        key: "name",
        label: "Name",
        sortable: true,
        sortValue: (row: ClientToolSchema) => row.name.toLowerCase(),
        render: (row: ClientToolSchema) => (
          <span className={styles['table-name-cell-mono']}>
            {row.name}
          </span>
        ),
      },
      {
        key: "domain",
        label: "Domain",
        sortable: true,
        sortValue: (row: ClientToolSchema) => (row.domain || "").toLowerCase(),
        render: (row: ClientToolSchema) => (
          row.domain ? (
            <span className={styles['tool-domain']}>{row.domain}</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )
        ),
      },
      {
        key: "params",
        label: "Params",
        sortable: true,
        sortValue: (row: ClientToolSchema) => countParams(row),
        render: (row: ClientToolSchema) => {
          const paramCount = countParams(row);
          return paramCount > 0 ? (
            <span className={styles['table-param-cell']}>
              <Braces size={12} /> {paramCount}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>0</span>
          );
        },
      },
      {
        key: "agents",
        label: "Agents",
        sortable: true,
        sortValue: (row: ClientToolSchema) => {
          const rowAgents = (toolAgentMap as Record<string, { id: string; name: string }[]>)[row.name] || [];
          return rowAgents.map((agent) => agent.name).sort().join(",");
        },
        render: (row: ClientToolSchema) => {
          const rowAgents = (toolAgentMap as Record<string, { id: string; name: string }[]>)[row.name] || [];
          return rowAgents.length > 0 ? (
            <BadgeComponent
              type="agent"
              agents={rowAgents}
              size={20}
              iconSize={11}
            />
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
      {
        key: "calls",
        label: "Calls",
        sortable: true,
        align: "right" as const,
        sortValue: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.totalCalls || 0;
        },
        render: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.totalCalls ? (
            <span className={styles['table-stat-value']}>
              {formatCompact(stat.totalCalls)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
      {
        key: "latency",
        label: "Avg Latency",
        sortable: true,
        align: "right" as const,
        sortValue: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.avgLatency || 0;
        },
        render: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.avgLatency ? (
            <span className={styles['table-stat-value']}>
              {formatLatencyMs(stat.avgLatency)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
      {
        key: "minLatency",
        label: "Min Latency",
        sortable: true,
        align: "right" as const,
        sortValue: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.minLatency || 0;
        },
        render: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.minLatency ? (
            <span className={styles['table-stat-value']}>
              {formatLatencyMs(stat.minLatency)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
      {
        key: "maxLatency",
        label: "Max Latency",
        sortable: true,
        align: "right" as const,
        sortValue: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.maxLatency || 0;
        },
        render: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.maxLatency ? (
            <span className={styles['table-stat-value']}>
              {formatLatencyMs(stat.maxLatency)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
      {
        key: "errorRate",
        label: "Error Rate",
        sortable: true,
        align: "right" as const,
        sortValue: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.errorRate || 0;
        },
        render: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          if (!stat || stat.totalCalls === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
          const rate = stat.errorRate ?? 0;
          const color =
            rate === 0
              ? "var(--color-success)"
              : rate <= 15
                ? "var(--color-warning)"
                : "var(--color-danger)";
          return (
            <span style={{ fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>
              {rate.toFixed(0)}%
            </span>
          );
        },
      },
      {
        key: "transfer",
        label: "Transfer",
        sortable: true,
        align: "right" as const,
        sortValue: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.totalTransferBytes || 0;
        },
        render: (row: ClientToolSchema) => {
          const stat = (toolStats as Record<string, ExtendedToolStats>)[row.name];
          return stat?.totalTransferBytes ? (
            <span className={styles['table-stat-value']}>
              {formatCompact(stat.totalTransferBytes)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
    ];
  }, [toolAgentMap, toolStats]);

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
          <div className={styles['stat-badge']}>
            <span className={styles['stat-value']}>{allLabels.length}</span>{" "}
            labels
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className={styles['error']}>
            <AlertCircle />
            {error}
          </div>
        )}

      <SearchInputComponent
        value={search}
        onChange={setSearch}
        placeholder="Search tools by name, description, or label…"
        compact
        className={styles["tools-search"]}
      />

      {/* Filter bar */}
      <div className={styles['filter-bar']}>
        <SelectComponent
          value={domainFilter}
          multiple
          compact
          allLabel="All Domains"
          placeholder="Filter Domains"
          options={allDomains.map((d: string) => ({ value: d, label: d }))}
          onChange={(val: string[]) => setDomainFilter(val)}
        />

        <SelectComponent
          value={labelFilter}
          multiple
          compact
          allLabel="All Labels"
          placeholder="Filter Labels"
          options={allLabels.map((l: string) => ({ value: l, label: l }))}
          onChange={(val: string[]) => setLabelFilter(val)}
        />

        <SelectComponent
          value={agentFilter}
          multiple
          compact
          allLabel="All Agents"
          placeholder="Filter Agents"
          options={agents.map((a: AgentMinimal) => ({
            value: a.id,
            label: `${a.name}${a.toolCount !== undefined ? ` (${a.toolCount})` : ""}`,
          }))}
          onChange={(val: string[]) => setAgentFilter(val)}
        />

        <div className={styles['view-toggle']}>
          <button
            className={`${styles['view-button']} ${view === "grid" ? styles['view-active'] : ""}`}
            onClick={() => setView("grid")}
            title="Grid view"
          >
            <LayoutGrid />
          </button>
          <button
            className={`${styles['view-button']} ${view === "list" ? styles['view-active'] : ""}`}
            onClick={() => setView("list")}
            title="List view"
          >
            <List />
          </button>
          <button
            className={`${styles['view-button']} ${view === "table" ? styles['view-active'] : ""}`}
            onClick={() => setView("table")}
            title="Table view"
          >
            <Table />
          </button>
        </div>
      </div>

      {/* Tools display */}
      {filtered.length === 0 ? (
        <div className={styles['empty-state']}>
          <Search />
          <p>No tools match your filters.</p>
        </div>
      ) : view === "table" ? (
        <div className={styles['table-wrapper']}>
          <TableComponent
            columns={tableColumns as any}
            data={filtered}
            getRowKey={(tool: ClientToolSchema) => tool.name}
            emptyText="No tools match your filters."
            onRowClick={(tool: ClientToolSchema) => setSelectedTool(tool)}
            storageKey="tools-explorer-table"
          />
        </div>
      ) : (
        Object.entries(grouped).map(
          ([domain, domainTools]: [string, ClientToolSchema[]]) => {
            const DomainIcon = getDomainIcon(domain);
            return (
              <div
                key={domain}
                className={styles['domain-section']}
                data-domain-section={domain}
              >
                <div className={styles['domain-header']}>
                  <DomainIcon className={styles['domain-icon']} />
                  <h2>{domain}</h2>
                  <span className={styles['domain-count']}>
                    {domainTools.length}
                  </span>
                </div>

                {view === "grid" ? (
                  <div className={styles['tool-grid']}>
                    {domainTools.map((tool: ClientToolSchema) => (
                      <ToolCard
                        key={tool.name}
                        tool={tool}
                        agents={
                          (
                            toolAgentMap as Record<
                              string,
                              { id: string; name: string }[]
                            >
                          )[tool.name] || []
                        }
                        onClick={() => setSelectedTool(tool)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles['table-wrapper']}>
                    <TableComponent
                      columns={tableColumns as any}
                      data={domainTools}
                      getRowKey={(tool: ClientToolSchema) => tool.name}
                      emptyText="No tools in this domain."
                      onRowClick={(tool: ClientToolSchema) => setSelectedTool(tool)}
                      storageKey={`tools-list-${domain}`}
                    />
                  </div>
                )}
              </div>
            );
          },
        )
      )}

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
