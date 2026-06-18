"use client";

import { useState, useMemo } from "react";
import {
  SearchInputComponent,
  SelectComponent,
  ToolCardComponent as ToolSchemaCard,
  TableComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";
import {
  Wrench,
  Search,
  LayoutGrid,
  List,
  Table,
  Braces,
} from "lucide-react";
import {
  formatCompact,
  formatLatencyMilliseconds,
} from "@rodrigo-barraza/utilities-library";
import styles from "./ToolsTableComponent.module.css";

/* -- Types --------------------------------------------------- */

export interface ToolSchema {
  name: string;
  description?: string;
  emoji?: string | string[];
  domain?: string;
  parameters?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
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

export interface ToolUsageStat {
  tool: string;
  totalCalls?: number;
  totalRequests?: number;
  totalCost?: number;
  avgLatency?: number;
  minLatency?: number;
  maxLatency?: number;
  errorRate?: number;
  totalTransferBytes?: number;
  topModels?: { model: string; provider: string; count: number }[];
  topAgents?: { agent: string; count: number }[];
  totalInputTokens?: number;
  totalOutputTokens?: number;
  successCount?: number;
  failureCount?: number;
  firstUsed?: string;
  lastUsed?: string;
}

/* -- Helpers ------------------------------------------------- */

function countParams(tool: ToolSchema): number {
  const properties = tool.parameters?.properties;
  if (!properties) return 0;
  return Object.keys(properties).length;
}

function extractDomains(tools: ToolSchema[]): string[] {
  const domainSet = new Set<string>();
  for (const tool of tools) {
    if (tool.domain) domainSet.add(tool.domain);
  }
  return [...domainSet].sort();
}



function groupByDomain(
  tools: ToolSchema[],
): Record<string, ToolSchema[]> {
  const groups: Record<string, ToolSchema[]> = {};
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

// Domain → Icon mapping
import {
  Cloud,
  Zap,
  Gamepad2,
  Database,
  Globe,
  Package,
  Brain,
  Palette,
  Heart,
  Navigation,
  Cog,
  Cpu,
  Ship,
  Lightbulb,
  MessageCircle,
  Bot,
  FolderOpen,
  Layers,
  Clock,
  Shield,
} from "lucide-react";

const DOMAIN_ICONS: Record<string, React.ElementType> = {
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

function getDomainIcon(domain: string): React.ElementType {
  return DOMAIN_ICONS[domain] || Wrench;
}

/* -- Sub-components ------------------------------------------ */

function ToolCard({
  tool,
  onClick,
  agents,
}: {
  tool: ToolSchema;
  onClick: (tool: ToolSchema) => void;
  agents: { id: string; name: string }[];
}) {
  const parameterCount = countParams(tool);
  const resolvedEmoji = Array.isArray(tool.emoji) ? tool.emoji[0] : tool.emoji;
  return (
    <ToolSchemaCard
      name={tool.name}
      description={tool.description || ""}
      emoji={resolvedEmoji}
      domain={tool.domain}
      onClick={() => onClick(tool)}
    >
      {agents?.length > 0 && (
        <div className={styles['agent-badges']}>
          <BadgeComponent type="agent" agents={agents} size={20} iconSize={11} />
        </div>
      )}

      {parameterCount > 0 && (
        <span className={styles['param-count']}>
          <Braces /> {parameterCount} param{parameterCount !== 1 ? "s" : ""}
        </span>
      )}
    </ToolSchemaCard>
  );
}



/* -- Main Component ------------------------------------------ */

export interface ToolsTableComponentProps {
  tools: ToolSchema[];
  agents?: AgentMinimal[];
  toolStats?: Record<string, ToolUsageStat>;
  onSelect?: (tool: ToolSchema) => void;
  showSearch?: boolean;
  emptyText?: string;
}

export default function ToolsTableComponent({
  tools,
  agents = [],
  toolStats = {},
  onSelect,
  showSearch = true,
  emptyText,
}: ToolsTableComponentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");

  const toolAgentMap = useMemo(() => buildToolAgentMap(agents), [agents]);
  const allDomains = useMemo(() => extractDomains(tools), [tools]);

  const filteredTools = useMemo(() => {
    const normalizedSearch = searchQuery.toLowerCase().trim();
    const hasDomainFilter = domainFilter.length > 0;
    const hasAgentFilter = agentFilter.length > 0;

    let agentToolUnion: Set<string> | null = null;
    if (hasAgentFilter) {
      agentToolUnion = new Set<string>();
      let hasWildcard = false;
      for (const selectedAgentId of agentFilter) {
        const agentData = agents.find(
          (agent: AgentMinimal) => agent.id === selectedAgentId,
        );
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

    return tools.filter((tool: ToolSchema) => {
      if (hasDomainFilter && (!tool.domain || !domainFilter.includes(tool.domain)))
        return false;
      if (agentToolUnion && !agentToolUnion.has(tool.name)) return false;
      if (normalizedSearch) {
        const agentNames = (toolAgentMap[tool.name] || [])
          .map((agent) => agent.name)
          .join(" ");
        const haystack =
          `${tool.name} ${tool.description} ${tool.domain || ""} ${agentNames}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      }
      return true;
    });
  }, [tools, searchQuery, domainFilter, agentFilter, agents, toolAgentMap]);

  const grouped = useMemo(() => groupByDomain(filteredTools), [filteredTools]);

  const handleToolClick = (tool: ToolSchema) => {
    onSelect?.(tool);
  };

  const tableColumns = useMemo(() => {
    return [
      {
        key: "emoji",
        label: "",
        align: "center" as const,
        sortable: true,
        sortValue: (row: ToolSchema) => {
          const resolvedEmoji = Array.isArray(row.emoji) ? row.emoji[0] : row.emoji;
          return resolvedEmoji || "";
        },
        width: "40px",
        render: (row: ToolSchema) => {
          const resolvedEmoji = Array.isArray(row.emoji) ? row.emoji[0] : row.emoji;
          return resolvedEmoji ? (
            resolvedEmoji.startsWith("http") ? (
              <img
                src={resolvedEmoji}
                alt={row.name}
                style={{ width: "1.25rem", height: "1.25rem", objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: "1.1rem" }}>{resolvedEmoji}</span>
            )
          ) : (
            <Wrench size={14} style={{ opacity: 0.4 }} />
          );
        },
      },
      {
        key: "name",
        label: "Name",
        sortable: true,
        sortValue: (row: ToolSchema) => row.name.toLowerCase(),
        render: (row: ToolSchema) => (
          <span className={styles['table-name-cell-mono']}>{row.name}</span>
        ),
      },
      {
        key: "domain",
        label: "Domain",
        sortable: true,
        sortValue: (row: ToolSchema) => (row.domain || "").toLowerCase(),
        render: (row: ToolSchema) =>
          row.domain ? (
            <span className={styles['tool-domain']}>{row.domain}</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          ),
      },
      {
        key: "params",
        label: "Params",
        sortable: true,
        sortValue: (row: ToolSchema) => countParams(row),
        render: (row: ToolSchema) => {
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
        sortValue: (row: ToolSchema) => {
          const rowAgents = toolAgentMap[row.name] || [];
          return rowAgents.map((agent) => agent.name).sort().join(",");
        },
        render: (row: ToolSchema) => {
          const rowAgents = toolAgentMap[row.name] || [];
          return rowAgents.length > 0 ? (
            <BadgeComponent type="agent" agents={rowAgents} size={20} iconSize={11} />
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
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.totalCalls || 0;
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
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
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.avgLatency || 0;
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.avgLatency ? (
            <span className={styles['table-stat-value']}>
              {formatLatencyMilliseconds(stat.avgLatency)}
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
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.minLatency || 0;
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.minLatency ? (
            <span className={styles['table-stat-value']}>
              {formatLatencyMilliseconds(stat.minLatency)}
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
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.maxLatency || 0;
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.maxLatency ? (
            <span className={styles['table-stat-value']}>
              {formatLatencyMilliseconds(stat.maxLatency)}
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
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.errorRate || 0;
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          if (!stat || stat.totalCalls === 0)
            return <span style={{ color: "var(--text-muted)" }}>—</span>;
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
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.totalTransferBytes || 0;
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          return stat?.totalTransferBytes ? (
            <span className={styles['table-stat-value']}>
              {formatCompact(stat.totalTransferBytes)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          );
        },
      },
      {
        key: "lastUsed",
        label: "Last Used",
        sortable: true,
        align: "left" as const,
        sortValue: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          if (!stat?.lastUsed) return 0;
          return new Date(stat.lastUsed).getTime();
        },
        render: (row: ToolSchema) => {
          const stat = toolStats[row.name];
          if (!stat?.lastUsed) return "—";
          return (
            <BadgeComponent
              type="dateTime"
              date={stat.lastUsed}
              relative
              highlightNew
            />
          );
        },
      },
    ];
  }, [toolAgentMap, toolStats]);

  return (
    <div className={`tools-table-component ${styles['container']}`}>
      {showSearch && (
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search tools by name, description, or label…"
          compact
          className={styles["tools-search"]}
        />
      )}

      <div className={styles['filter-bar']}>
        <SelectComponent
          value={domainFilter}
          multiple
          compact
          allLabel="All Domains"
          placeholder="Filter Domains"
          options={allDomains.map((domain: string) => ({ value: domain, label: domain }))}
          onChange={(value: string[]) => setDomainFilter(value)}
        />


        <SelectComponent
          value={agentFilter}
          multiple
          compact
          allLabel="All Agents"
          placeholder="Filter Agents"
          options={agents.map((agent: AgentMinimal) => ({
            value: agent.id,
            label: `${agent.name}${agent.toolCount !== undefined ? ` (${agent.toolCount})` : ""}`,
          }))}
          onChange={(value: string[]) => setAgentFilter(value)}
        />

        <div className={styles['view-toggle']}>
          <button
            className={`${styles['view-button']} ${viewMode === "grid" ? styles['view-is-active-state'] : ""}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <LayoutGrid />
          </button>
          <button
            className={`${styles['view-button']} ${viewMode === "list" ? styles['view-is-active-state'] : ""}`}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <List />
          </button>
          <button
            className={`${styles['view-button']} ${viewMode === "table" ? styles['view-is-active-state'] : ""}`}
            onClick={() => setViewMode("table")}
            title="Table view"
          >
            <Table />
          </button>
        </div>
      </div>

      {filteredTools.length === 0 ? (
        <div className={styles['empty-state']}>
          <Search />
          <p>{emptyText || "No tools match your filters."}</p>
        </div>
      ) : viewMode === "table" ? (
        <div className={styles['table-wrapper']}>
          <TableComponent
            columns={tableColumns}
            data={filteredTools}
            getRowKey={(tool: ToolSchema) => tool.name}
            emptyText={emptyText || "No tools match your filters."}
            onRowClick={(tool: ToolSchema) => handleToolClick(tool)}
            storageKey="tools-explorer-table"
          />
        </div>
      ) : (
        Object.entries(grouped).map(
          ([domain, domainTools]: [string, ToolSchema[]]) => {
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

                {viewMode === "grid" ? (
                  <div className={styles['tool-grid']}>
                    {domainTools.map((tool: ToolSchema) => (
                      <ToolCard
                        key={tool.name}
                        tool={tool}
                        agents={toolAgentMap[tool.name] || []}
                        onClick={() => handleToolClick(tool)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles['table-wrapper']}>
                    <TableComponent
                      columns={tableColumns}
                      data={domainTools}
                      getRowKey={(tool: ToolSchema) => tool.name}
                      emptyText="No tools in this domain."
                      onRowClick={(tool: ToolSchema) => handleToolClick(tool)}
                      storageKey={`tools-list-${domain}`}
                    />
                  </div>
                )}
              </div>
            );
          },
        )
      )}
    </div>
  );
}
