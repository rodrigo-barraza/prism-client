import { useMemo } from "react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import { getRequestsColumns } from "../app/admin/requestsColumns";

/**
 * RequestsTableComponent — reusable admin table for displaying request logs.
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
}: { requests?: Record<string, unknown>[]; emptyText?: string; compact?: boolean; mini?: boolean; title?: React.ReactNode; maxHeight?: number | string | null; sortKey?: string; sortDir?: string; onSort?: (key: string, dir: string) => void; onRowClick?: (row: Record<string, unknown>) => void; onRowMouseEnter?: (row: Record<string, unknown>, e: React.MouseEvent) => void; onRowMouseLeave?: () => void; getRowClassName?: (row: Record<string, unknown>) => string; }) {
  const totalCost = useMemo(
    () =>
      requests.reduce((sum: number, r: Record<string, any>) => sum + (r.estimatedCost || 0), 0) ||
      1,
    [requests],
  );

  const totalDuration = useMemo(
    () =>
      requests.reduce((sum: number, r: Record<string, any>) => sum + (r.totalTime || 0), 0) || 1,
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
    ? allColumns.filter((c: Record<string, any>) => COMPACT_KEYS.includes(c.key))
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
      getRowKey={(r: Record<string, any>, i: number) => `${r.requestId || r._id || "req"}-${i}`}
      emptyText={emptyText}
      mini={mini}
      storageKey="requests"
    />
  );
}
