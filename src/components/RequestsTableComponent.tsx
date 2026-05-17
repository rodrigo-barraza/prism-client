import { useMemo } from "react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import { getRequestsColumns } from "../app/admin/requestsColumns";

/**
 * RequestsTableComponent — reusable admin table for displaying request logs.
 *

 * @param {Array}    props.requests          - Array of request objects


 */
export default function RequestsTableComponent({
  requests = [],
  emptyText = "No requests yet",
  compact = false,
  mini = false,
  title,
  maxHeight = 420,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  onRowMouseEnter,
  onRowMouseLeave,
  getRowClassName,
}: any) {
  const totalCost = useMemo(
    () => requests.reduce((sum: any, r: any) => sum + (r.estimatedCost || 0), 0) || 1,
    [requests],
  );

  const totalDuration = useMemo(
    () => requests.reduce((sum: any, r: any) => sum + (r.totalTime || 0), 0) || 1,
    [requests],
  );

  const allColumns = useMemo(
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
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={requests}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      onRowClick={onRowClick}
      onRowMouseEnter={onRowMouseEnter}
      onRowMouseLeave={onRowMouseLeave}
      getRowClassName={getRowClassName}
      getRowKey={(r: any, i: any) => `${r.requestId || r._id || "req"}-${i}`}
      emptyText={emptyText}
      mini={mini}
      storageKey="requests"
    />
  );
}
