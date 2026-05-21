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
    (totalRequestsProp ??
      projects.reduce((s, x) => s + x.totalRequests, 0)) ||
    1;
  const totalCost =
    (totalCostProp ??
      projects.reduce((s, x) => s + (x.totalCost || 0), 0)) ||
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
    ...countLinkColumns("project", (row: any) => String(row.project || "")),
  ];

  const COMPACT_KEYS = [
    "project",
    "totalRequests",
    "totalCost",
    "avgLatency",
    "sessionCount",
    "conversationCount",
  ];
  const columns = compact
    ? allColumns.filter((c: any) => COMPACT_KEYS.includes(c.key))
    : allColumns;

  return (
    <TableComponent
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={projects}
      getRowKey={(p: any, i: number) => `${p.project || "none"}-${i}`}
      emptyText={emptyText}
      storageKey="projects"
    />
  );
}
