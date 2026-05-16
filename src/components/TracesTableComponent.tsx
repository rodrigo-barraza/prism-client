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
 *
 * @param {Object}  props
 * @param {Array}   props.traces       - Array of trace objects
 * @param {string}  [props.emptyText]    - Text shown when no traces
 * @param {boolean} [props.compact]      - Hide some columns for compact layouts
 * @param {boolean} [props.mini]         - Mini density mode
 * @param {string}  [props.title]        - Optional table title
 * @param {number}  [props.maxHeight]    - Optional max height for scrollable body
 * @param {string}  [props.sortKey]    - Current sort key (for server-side sorting)
 * @param {string}  [props.sortDir]    - Current sort direction
 * @param {Function} [props.onSort]    - (key, dir) => void (server-side sort)
 * @param {Function} [props.onRequestRowClick] - (request) => void, opens detail drawer
 */
export default function TracesTableComponent({
  traces = [],
  emptyText = "No traces",
  compact = false,
  mini = false,
  // @ts-ignore
  // @ts-ignore
  title: any,
  // @ts-ignore
  // @ts-ignore
  maxHeight: any,
  // @ts-ignore
  // @ts-ignore
  sortKey: any,
  // @ts-ignore
  // @ts-ignore
  sortDir: any,
  // @ts-ignore
  // @ts-ignore
  onSort: any,
  // @ts-ignore
  // @ts-ignore
  onRequestRowClick: any,
}) {
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
  const allColumns = SESSION_COLUMNS.filter((c) => c.key !== "costShare");

  const COMPACT_KEYS = [
    "id", "project", "username",
    "requestCount", "totalCost", "createdAt", "duration",
  ];
  const columns = compact
    ? allColumns.filter((c) => COMPACT_KEYS.includes(c.key))
    : allColumns;

  return (
    <TableComponent
      columns={columns}
      data={traces}
      getRowKey={(s: any, i: any) => s.id || `trace-${i}`}
      // @ts-ignore
      sortKey={sortKey}
      // @ts-ignore
      sortDir={sortDir}
      // @ts-ignore
      onSort={onSort}
      renderExpandedContent={(trace: any) => (
        <div className={styles.expandedPanels}>
          {/* @ts-ignore */}
          <RequestsTableComponent
            requests={trace.requests || []}
            emptyText="No requests"
            title="Requests"
            // @ts-ignore
            onRowClick={onRequestRowClick}
          />
        </div>
      )}
      emptyText={emptyText}
      // @ts-ignore
      title={title}
      // @ts-ignore
      maxHeight={maxHeight}
      mini={mini}
      storageKey="traces"
    />
  );
}
