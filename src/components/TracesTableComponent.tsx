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
import type { TableRow } from "../utils/tableColumns";
import type { TransformedRequestItem } from "../types/types";
import styles from "./TracesTableComponent.module.css";

interface TraceRow extends TableRow {
  requests?: TransformedRequestItem[];
}

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
}: {
  traces?: TraceRow[];
  emptyText?: string;
  compact?: boolean;
  mini?: boolean;
  title?: React.ReactNode;
  maxHeight?: number | string | null;
  sortKey?: string;
  sortDir?: string;
  onSort?: (key: string, dir: string) => void;
}) {
  const CONVERSATION_COLUMNS = [
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

  const allColumns = CONVERSATION_COLUMNS.filter((column) => column.key !== "costShare");

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
    ? allColumns.filter((column) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  return (
    <TableComponent
      columns={columns}
      data={traces}
      getRowKey={(trace: TraceRow, index: number) => trace.id || `trace-${index}`}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      renderExpandedContent={(trace: TraceRow) => (
        <div className={`traces-table-component ${styles['expanded-panels']}`}>
          <RequestsTableComponent
            requests={trace.requests || []}
            emptyText="No requests"
            title="Requests"
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
