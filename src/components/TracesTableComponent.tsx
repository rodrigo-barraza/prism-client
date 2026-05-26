import { TableComponent } from "@rodrigo-barraza/components-library";
import RequestsTableComponent from "./RequestsTableComponent";
import {
  traceIdColumn,
  projectColumn,
  userColumn,
  agentColumn,
  modalitiesColumn,
  modelsListColumn,
  providersListColumn,
  toolsColumn,
  requestCountColumn,
  tokenColumns,
  costColumns,
  latencyColumn,
  durationColumn,
  createdAtColumn,
} from "../utils/tableColumns";
import styles from "./TracesTableComponent.module.css";

/**
 * TracesTableComponent — reusable traces table with expandable rows
 * showing both a conversations table and a requests table side by side.
 */
export default function TracesTableComponent({
  traces = [],
  emptyText = "No traces",
  compact = false,
  mini = false,
  title,
  maxHeight,
  sortKey,
  sortDir,
  onSort,
  onRequestRowClick,
}: { traces?: Record<string, any>[]; emptyText?: string; compact?: boolean; mini?: boolean; title?: React.ReactNode; maxHeight?: number | string | null; sortKey?: string; sortDir?: string; onSort?: (key: string, dir: string) => void; onRequestRowClick?: (row: Record<string, any>) => void; }) {
  const SESSION_COLUMNS = [
    traceIdColumn(),
    projectColumn(),
    userColumn(),
    agentColumn(),
    modalitiesColumn(),
    modelsListColumn(),
    providersListColumn(),
    toolsColumn(),

    requestCountColumn(),
    ...tokenColumns({ showDash: true }),
    ...costColumns(1, { costKey: "totalCost" }),
    latencyColumn("totalLatency", "Latency"),
    durationColumn(),
    createdAtColumn(),
  ];

  // Remove costShare for traces — not useful without a global total
  const allColumns = SESSION_COLUMNS.filter((c: any) => c.key !== "costShare");

  const COMPACT_KEYS = [
    "id",
    "project",
    "username",
    "requestCount",
    "totalCost",
    "createdAt",
    "duration",
  ];
  const columns = compact
    ? allColumns.filter((c: any) => COMPACT_KEYS.includes(c.key))
    : allColumns;

  return (
    <TableComponent
      columns={columns}
      data={traces}
      getRowKey={(s: any, i: number) => s.id || `trace-${i}`}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      renderExpandedContent={(trace: any) => (
        <div className={styles.expandedPanels}>
          <RequestsTableComponent
            requests={trace.requests || []}
            emptyText="No requests"
            title="Requests"
            onRowClick={onRequestRowClick}
          />
        </div>
      )}
      emptyText={emptyText}
      title={title}
      maxHeight={maxHeight ?? undefined}
      mini={mini}
      storageKey="traces"
    />
  );
}
