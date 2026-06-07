import { useState, useEffect, useCallback, useMemo } from "react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import { getRequestsColumns } from "../app/admin/requestsColumns";
import IrisService from "../services/IrisService";
import type { IrisRequestEntry } from "../services/IrisService";
import { getErrorMessage } from "../utils/errorMessage";

/**
 * RequestsTableComponent — reusable table for displaying request logs.
 *
 * Supports three usage modes:
 *   1. **External data** — pass `requests` directly (admin global view, paginated).
 *   2. **Session-scoped** — pass `conversationId` to auto-fetch session requests.
 *   3. **User-scoped** — pass `requests` filtered by the caller (user dashboard).
 *
 * When `conversationId` is provided, the component manages its own loading
 * state and fetches via `IrisService.getSessionRequests()`.
 */
export default function RequestsTableComponent({
  requests: externalRequests,
  conversationId,
  refreshKey = 0,
  emptyText = "No requests yet",
  compact = false,
  mini = false,
  title,
  maxHeight = 420,
  sortKey: externalSortKey,
  sortDir: externalSortDir,
  onSort: externalOnSort,
  onRowClick,
  onRowMouseEnter,
  onRowMouseLeave,
  getRowClassName,
  storageKey = "requests",
}: {
  requests?: any[];
  conversationId?: string | null;
  refreshKey?: number;
  emptyText?: string;
  compact?: boolean;
  mini?: boolean;
  title?: React.ReactNode;
  maxHeight?: number | string | null;
  sortKey?: string;
  sortDir?: string;
  onSort?: (key: string, dir: string) => void;
  onRowClick?: (row: any) => void;
  onRowMouseEnter?: (row: any, event: any) => void;
  onRowMouseLeave?: () => void;
  getRowClassName?: (row: any) => string;
  storageKey?: string;
}) {
  const isSelfFetching = !!conversationId && !externalRequests;

  const [fetchedRequests, setFetchedRequests] = useState<IrisRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [internalSortKey, setInternalSortKey] = useState("timestamp");
  const [internalSortDir, setInternalSortDir] = useState("desc");

  const fetchSessionRequests = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const result = await IrisService.getSessionRequests(conversationId);
      setFetchedRequests(result?.requests || []);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      if (!errorMessage.includes("404")) {
        setFetchError(errorMessage);
      }
      setFetchedRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (isSelfFetching) {
      fetchSessionRequests();
    }
  }, [isSelfFetching, fetchSessionRequests, refreshKey]);

  const requests = externalRequests ?? fetchedRequests;
  const sortKey = externalSortKey ?? internalSortKey;
  const sortDir = externalSortDir ?? internalSortDir;

  const handleSort = useCallback(
    (key: string, direction: string) => {
      if (externalOnSort) {
        externalOnSort(key, direction);
      } else {
        setInternalSortKey(key);
        setInternalSortDir(direction);
      }
    },
    [externalOnSort],
  );

  const totalCost = useMemo(
    () =>
      requests.reduce(
        (sum: number, request: any) => sum + (request.estimatedCost || 0),
        0,
      ) || 1,
    [requests],
  );

  const totalDuration = useMemo(
    () =>
      requests.reduce((sum: number, request: any) => sum + (request.totalTime || 0), 0) ||
      1,
    [requests],
  );

  const allColumns = useMemo(
    () => getRequestsColumns({ totalCost, totalDuration, mini }) as any[],
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
    ? allColumns.filter((column: any) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  const resolvedEmptyText = isLoading
    ? "Loading…"
    : fetchError
      ? `Error: ${fetchError}`
      : emptyText;

  return (
    <TableComponent
      className="requests-table-component"
      title={title}
      maxHeight={maxHeight ?? undefined}
      columns={columns}
      data={requests}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={handleSort}
      onRowClick={onRowClick}
      onRowMouseEnter={onRowMouseEnter}
      onRowMouseLeave={onRowMouseLeave}
      getRowClassName={getRowClassName}
      getRowKey={(request: any, index: number) => `${request.requestId || request._id || "request"}-${index}`}
      emptyText={resolvedEmptyText}
      mini={mini}
      storageKey={storageKey}
    />
  );
}
