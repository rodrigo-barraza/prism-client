import { TableComponent } from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";
import ProportionBarComponent from "./ProportionBarComponent";
import {
  requestsColumn,
  modelCountColumn,
  tokenColumns,
  costColumns,
  latencyColumn,
  emptyDash,
} from "../utils/tableColumns";
import type { IrisAgentStat } from "../types/types";

interface AgentsTableProps {
  agents?: IrisAgentStat[];
  totalRequests?: number;
  totalCost?: number;
  emptyText?: string;
  compact?: boolean;
  title?: React.ReactNode;
  maxHeight?: number;
}

/**
 * AgentsTableComponent — reusable admin table for displaying agent-level
 * aggregated stats (requests, tokens, cost, latency, models, providers).
 */
export default function AgentsTableComponent({
  agents = [],
  totalRequests: totalRequestsProp,
  totalCost: totalCostProp,
  emptyText = "No agents yet",
  compact = false,
  title = "Agents",
  maxHeight = 420,
}: AgentsTableProps) {
  const totalRequests =
    (totalRequestsProp ??
      agents.reduce((sum, agent) => sum + agent.totalRequests, 0)) || 1;
  const totalCost =
    (totalCostProp ??
      agents.reduce((sum, agent) => sum + (agent.totalCost || 0), 0)) || 1;

  const allColumns = [
    {
      key: "agent",
      label: "Agent",
      description: "The agent persona that originated these requests",
      render: (row: IrisAgentStat) => (
        <BadgeComponent type="agent" agents={row.agent ? [row.agent] : []} />
      ),
    },
    {
      key: "type",
      label: "Type",
      description: "Agent persona type (e.g. chat, coding, research)",
      defaultHidden: true,
      render: (row: IrisAgentStat) =>
        row.type ? (
          <BadgeComponent variant="info" mini>
            {row.type}
          </BadgeComponent>
        ) : (
          emptyDash()
        ),
    },
    requestsColumn(),
    {
      key: "usage",
      label: "Usage",
      description: "Proportional share of total requests",
      sortValue: (row: IrisAgentStat) => row.totalRequests,
      render: (row: IrisAgentStat, index: number) => {
        const agentColors = [
          "oklch(0.72 0.18 145)",
          "oklch(0.72 0.18 250)",
          "oklch(0.72 0.18 30)",
          "oklch(0.72 0.18 310)",
          "oklch(0.72 0.18 70)",
          "oklch(0.72 0.18 190)",
        ];
        return (
          <ProportionBarComponent
            value={row.totalRequests}
            total={totalRequests}
            color={agentColors[index % agentColors.length]}
          />
        );
      },
    },
    {
      key: "providerCount",
      label: "Providers",
      description: "Number of distinct API providers used by this agent",
      align: "right" as const,
      render: (row: IrisAgentStat) => row.providerCount ?? 0,
    },
    modelCountColumn(),
    ...tokenColumns(),
    ...costColumns(totalCost),
    latencyColumn(),
    {
      key: "conversationCount",
      label: "Conversations",
      description: "Number of conversations this agent was used in",
      align: "right" as const,
      render: (row: IrisAgentStat) => row.conversationCount ?? 0,
    },
  ];

  const COMPACT_KEYS = [
    "agent",
    "totalRequests",
    "totalCost",
    "avgLatency",
    "conversationCount",
  ];
  const columns = compact
    ? allColumns.filter((column: any) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  return (
    <TableComponent
      title={title}
      maxHeight={maxHeight}
      columns={columns as any}
      data={agents}
      getRowKey={(agent: any, index: number) =>
        `${agent.agent || "unknown"}-${index}`
      }
      emptyText={emptyText}
      storageKey="agents"
    />
  );
}
