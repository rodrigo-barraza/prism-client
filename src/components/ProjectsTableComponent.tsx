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
}: unknown) {
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
    ...countLinkColumns("project", (row) => row.project),
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
    ? allColumns.filter((c) => COMPACT_KEYS.includes(c.key))
    : allColumns;

  return (
    <TableComponent
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={projects}
      getRowKey={(p: unknown, i: unknown) => `${p.project || "none"}-${i}`}
      emptyText={emptyText}
      storageKey="projects"
    />
  );
}
