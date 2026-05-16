import { useMemo } from "react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import { getRequestsColumns } from "../app/admin/requestsColumns";

/**
 * RequestsTableComponent — reusable admin table for displaying request logs.
 *
 * @param {Object}   props
 * @param {Array}    props.requests          - Array of request objects
 * @param {string}   [props.emptyText]       - Text shown when no data
 * @param {boolean}  [props.compact]         - Reduced column set
 * @param {boolean}  [props.mini]            - Mini density mode
 * @param {string}   [props.title]           - Optional table title
 * @param {number}   [props.maxHeight]       - Optional max height for scrollable body
 * @param {string}   [props.sortKey]         - Current sort key (for server-side sorting)
 * @param {string}   [props.sortDir]         - Current sort direction
 * @param {Function} [props.onSort]          - (key, dir) => void
 * @param {Function} [props.onRowClick]      - (request) => void
 * @param {Function} [props.onRowMouseEnter] - (row) => void
 * @param {Function} [props.onRowMouseLeave] - () => void
 * @param {Function} [props.getRowClassName] - (row) => string
 */
export default function RequestsTableComponent({
  requests = [],
  emptyText = "No requests yet",
  compact = false,
  mini = false,
  // @ts-ignore
  // @ts-ignore
  title: any,
  maxHeight = 420,
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
  onRowClick: any,
  // @ts-ignore
  // @ts-ignore
  onRowMouseEnter: any,
  // @ts-ignore
  // @ts-ignore
  onRowMouseLeave: any,
  // @ts-ignore
  // @ts-ignore
  getRowClassName: any,
}) {
  const totalCost = useMemo<any>(
    // @ts-ignore
    () => requests.reduce((sum, r) => sum + (r.estimatedCost || 0), 0) || 1,
    [requests],
  );

  const totalDuration = useMemo<any>(
    // @ts-ignore
    () => requests.reduce((sum, r) => sum + (r.totalTime || 0), 0) || 1,
    [requests],
  );

  const allColumns = useMemo<any>(
    () => getRequestsColumns({ totalCost, totalDuration, mini }),
    [totalCost, totalDuration, mini],
  );

  const COMPACT_KEYS = [
    "timestamp",
    "project",
    "provider",
    "model",
    "estimatedCost",
    "totalTime",
    "success",
  ];
  const columns = compact
    ? allColumns.filter((c: any) => COMPACT_KEYS.includes(c.key))
    : allColumns;

  return (
    <TableComponent
      // @ts-ignore
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={requests}
      // @ts-ignore
      sortKey={sortKey}
      // @ts-ignore
      sortDir={sortDir}
      // @ts-ignore
      onSort={onSort}
      // @ts-ignore
      onRowClick={onRowClick}
      // @ts-ignore
      onRowMouseEnter={onRowMouseEnter}
      // @ts-ignore
      onRowMouseLeave={onRowMouseLeave}
      // @ts-ignore
      getRowClassName={getRowClassName}
      getRowKey={(r: any, i: any) => `${r.requestId || r._id || "req"}-${i}`}
      emptyText={emptyText}
      mini={mini}
      storageKey="requests"
    />
  );
}
