"use client";

import { useState, useMemo } from "react";
import {
  EmptyStateComponent,
  SearchInputComponent,
  SegmentedControlComponent,
  SelectComponent,
  ToolCardComponent as ToolSchemaCard,
  TableComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";
import {
  Search,
  LayoutGrid,
  List,
  Table,
  Braces,
  Wrench,
} from "lucide-react";
import {
  formatCompact,
  formatLatencyMilliseconds,
} from "@rodrigo-barraza/utilities-library";
import { getDomainIcon } from "../utils/toolDomainIcons";
import styles from "./ToolsTableComponent.module.css";

/* -- Constants ------------------------------------------------ */

const VIEW_MODES = {
  GRID: "grid",
  LIST: "list",
  TABLE: "table",
} as const;

type ViewMode = (typeof VIEW_MODES)[keyof typeof VIEW_MODES];

const VIEW_MODE_ICON_SIZE = 14;

const TABLE_STORAGE_KEY = "tools-explorer-table";

/** Error rates above this percentage render as danger instead of warning. */
const ERROR_RATE_WARNING_MAX_PERCENT = 15;
const DOMAIN_TABLE_STORAGE_KEY_PREFIX = "tools-list-";

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

/* -- Sub-components ------------------------------------------ */

function MutedCell({ children = "\u2014" }: { children?: React.ReactNode }) {
  return <span className={styles['muted-cell']}>{children}</span>;
}

function ToolCard({
  tool,
  onClick,
  agents,
}: {
  tool: ToolSchema;
  onClick: (_tool: ToolSchema) => void;
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
  onSelect?: (_tool: ToolSchema) => void;
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
  const [viewMode, setViewMode] = useState<ViewMode>(VIEW_MODES.GRID);

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
                className={styles['table-emoji-image']}
              />
            ) : (
              <span className={styles['table-emoji-glyph']}>{resolvedEmoji}</span>
            )
          ) : (
            <Wrench size={VIEW_MODE_ICON_SIZE} className={styles['table-emoji-fallback']} />
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
            <MutedCell />
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
            <MutedCell>0</MutedCell>
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
            <MutedCell />
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
            <MutedCell />
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
            <MutedCell />
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
            <MutedCell />
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
            <MutedCell />
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
            return <MutedCell />;
          const rate = stat.errorRate ?? 0;
          const rateClass =
            rate === 0
              ? styles['error-rate-none']
              : rate <= ERROR_RATE_WARNING_MAX_PERCENT
                ? styles['error-rate-warning']
                : styles['error-rate-danger'];
          return (
            <span className={`${styles['error-rate-cell']} ${rateClass}`}>
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
            <MutedCell />
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

        <SegmentedControlComponent
          value={viewMode}
          onChange={(value: string) => setViewMode(value as ViewMode)}
          compact
          segments={[
            { value: VIEW_MODES.GRID, icon: <LayoutGrid size={VIEW_MODE_ICON_SIZE} /> },
            { value: VIEW_MODES.LIST, icon: <List size={VIEW_MODE_ICON_SIZE} /> },
            { value: VIEW_MODES.TABLE, icon: <Table size={VIEW_MODE_ICON_SIZE} /> },
          ]}
          className={styles['view-toggle']}
        />
      </div>

      {filteredTools.length === 0 ? (
        <EmptyStateComponent
          icon={<Search />}
          subtitle={emptyText || "No tools match your filters."}
        />
      ) : viewMode === VIEW_MODES.TABLE ? (
        <div className={styles['table-wrapper']}>
          <TableComponent
            columns={tableColumns}
            data={filteredTools}
            getRowKey={(tool: ToolSchema) => tool.name}
            emptyText={emptyText || "No tools match your filters."}
            onRowClick={(tool: ToolSchema) => handleToolClick(tool)}
            storageKey={TABLE_STORAGE_KEY}
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

                {viewMode === VIEW_MODES.GRID ? (
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
                      storageKey={`${DOMAIN_TABLE_STORAGE_KEY_PREFIX}${domain}`}
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
