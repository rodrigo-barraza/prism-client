import type { IrisProjectStat } from "@/types/types";
import { TableComponent } from "@rodrigo-barraza/components-library";
import {
  projectColumn,
  requestsColumn,
  usageColumn,
  providerCountColumn,
  modelCountColumn,
  tokenColumns,
  costColumns,
  latencyColumn,
  countLinkColumns,
} from "../utils/tableColumns";

interface ProjectsTableProps {
  projects?: IrisProjectStat[];
  totalRequests?: number;
  totalCost?: number;
  emptyText?: string;
  compact?: boolean;
  title?: React.ReactNode;
  maxHeight?: number;
}

/**
 * ProjectsTableComponent — reusable admin table for displaying project-level
 * aggregated stats (requests, tokens, cost, latency, etc.).
 */
export default function ProjectsTableComponent({
  projects = [],
  totalRequests: totalRequestsProp,
  totalCost: totalCostProp,
  emptyText = "No projects yet",
  compact = false,
  title = "Projects",
  maxHeight = 420,
}: ProjectsTableProps) {
  const totalRequests =
    (totalRequestsProp ?? projects.reduce((sum, project) => sum + project.totalRequests, 0)) ||
    1;
  const totalCost =
    (totalCostProp ?? projects.reduce((sum, project) => sum + (project.totalCost || 0), 0)) ||
    1;

  const allColumns = [
    projectColumn(),
    requestsColumn(),
    usageColumn(totalRequests, ""),
    providerCountColumn(),
    modelCountColumn(),
    ...tokenColumns(),
    ...costColumns(totalCost),
    latencyColumn(),
    ...countLinkColumns("project", (row) => String(row.project || "")),
  ];

  const COMPACT_KEYS = [
    "project",
    "totalRequests",
    "totalCost",
    "avgLatency",
    "agentConversationCount",
    "conversationCount",
  ];
  const columns = compact
    ? allColumns.filter((column) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  return (
    <TableComponent
      className="projects-table-component"
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={projects}
      getRowKey={(project: IrisProjectStat, index: number) => `${project.project || "none"}-${index}`}
      emptyText={emptyText}
      storageKey="projects"
    />
  );
}
