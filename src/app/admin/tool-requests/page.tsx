"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePersistedState } from "../../../hooks/usePersistedState";
import { Download, ExternalLink } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import ToolsApiService from "../../../services/ToolsApiService";
import IrisService from "../../../services/IrisService";
import type { IrisRequestEntry } from "../../../services/IrisService";
import JsonViewerComponent from "../../../components/JsonViewerComponent";
import {
  BadgeComponent,
  ButtonComponent,
  PaginationComponent,
  TableComponent,
} from "@rodrigo-barraza/components-library";
import { ErrorMessage } from "../../../components/StateMessageComponent";
import {
  FilterBarComponent,
  FilterGroupComponent,
  FilterInputComponent,
  FilterSelectComponent,
  FilterClearButton,
} from "../../../components/FilterBarComponent";
import RequestDetailsComponent from "../../../components/RequestDetailsComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import { formatNumber, formatLatencyMilliseconds, formatDateTime, formatFileSize, formatCost } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../../../utils/utilities";
import { getToolRequestsColumns, ToolCallRecord } from "./toolRequestsColumns";
import styles from "./page.module.css";

// -- Domain options (from ToolSchemaService TOOL_DOMAINS) ---------
const DOMAIN_OPTIONS = [
  { value: "", label: "All" },
  { value: "Weather & Environment", label: "Weather" },
  { value: "Events", label: "Events" },
  { value: "Markets & Commodities", label: "Markets" },
  { value: "Trends", label: "Trends" },
  { value: "Products", label: "Products" },
  { value: "Finance", label: "Finance" },
  { value: "Knowledge", label: "Knowledge" },
  { value: "Movies & TV", label: "Movies & TV" },
  { value: "Health", label: "Health" },
  { value: "Transit", label: "Transit" },
  { value: "Utilities", label: "Utilities" },
  { value: "Compute", label: "Compute" },
  { value: "Maritime", label: "Maritime" },
  { value: "Energy", label: "Energy" },
  { value: "Workspace", label: "Workspace" },
  { value: "Web", label: "Web" },
  { value: "Browser", label: "Browser" },
  { value: "Communication", label: "Communication" },
];

export default function ToolRequestsPage() {
  const router = useRouter();
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("timestamp");
  const [order, setOrder] = useState("desc");
  const [selectedCall, setSelectedCall] = useState<ToolCallRecord | null>(null);
  const [associatedRequest, setAssociatedRequest] = useState<IrisRequestEntry | null>(null);
  const [loadingAssociatedRequest, setLoadingAssociatedRequest] = useState(false);

  const urlSearchParameters = useSearchParams();
  const highlightedToolCallId = urlSearchParameters.get("id");

  useEffect(() => {
    if (!highlightedToolCallId) return;
    let isCancelled = false;
    ToolsApiService.getToolCall(highlightedToolCallId)
      .then((toolCallData) => {
        if (!isCancelled) {
          setSelectedCall(toolCallData as ToolCallRecord);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [highlightedToolCallId]);

  useEffect(() => {
    if (!selectedCall?.callerRequestId || selectedCall.callerRequestId === "—") {
      setAssociatedRequest(null);
      return;
    }
    let isCancelled = false;
    setLoadingAssociatedRequest(true);
    IrisService.getRequest(selectedCall.callerRequestId)
      .then((requestData) => {
        if (!isCancelled) setAssociatedRequest(requestData);
      })
      .catch(() => {
        if (!isCancelled) setAssociatedRequest(null);
      })
      .finally(() => {
        if (!isCancelled) setLoadingAssociatedRequest(false);
      });
    return () => { isCancelled = true; };
  }, [selectedCall?.callerRequestId]);
  const [filterDomain, setFilterDomain] = usePersistedState("tool-requests:filter-domain", "");
  const [filterSuccess, setFilterSuccess] = usePersistedState("tool-requests:filter-success", "");
  const [filters, setFilters] = useState({
    toolName: "",
    domain: filterDomain,
    success: filterSuccess,
    callerAgent: "",
    callerRequestId: "",
  });

  const LIMIT = 50;

  const loadToolCalls = useCallback(async () => {
    try {
      const params: Record<string, string | number | boolean> = {
        limit: LIMIT,
        skip: (page - 1) * LIMIT,
      };
      Object.entries(filters).forEach(([k, value]) => {
        if (value) params[k] = value;
      });
      // Date range
      const dateParams = buildDateRangeParams(dateRange) as Record<
        string,
        string
      >;
      if (dateParams.since) params.since = dateParams.since;
      if (dateParams.until) params.until = dateParams.until;

      const data = await ToolsApiService.getToolCalls(params);
      setToolCalls(data.toolCalls || []);
      setTotal(data.total || 0);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [page, filters, dateRange]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setToolCalls([]);
    setTotal(0);
    loadToolCalls();
  }, [loadToolCalls]);

  function handleSort(key: string, dir: "asc" | "desc" | string) {
    setSort(key);
    setOrder(dir);
    setPage(1);
  }

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    if (key === "domain") setFilterDomain(value);
    if (key === "success") setFilterSuccess(value);
    setPage(1);
  }, [setFilterDomain, setFilterSuccess]);

  function clearFilters() {
    setFilters({
      toolName: "",
      domain: "",
      success: "",
      callerAgent: "",
      callerRequestId: "",
    });
    setFilterDomain("");
    setFilterSuccess("");
    setPage(1);
  }

  // -- Column definitions -----------------------------------------
  const totalDuration = useMemo(
    () =>
      toolCalls.reduce(
        (sum: number, toolCall: ToolCallRecord) => sum + (toolCall.elapsedMs || 0),
        0,
      ) || 1,
    [toolCalls],
  );

  const columns = useMemo(
    () => getToolRequestsColumns({ totalDuration }),
    [totalDuration],
  );

  // -- CSV Export -------------------------------------------------
  const exportCSV = useCallback(() => {
    const headers = [
      "Timestamp",
      "Tool",
      "Domain",
      "Method",
      "Agent",
      "User",
      "Latency (ms)",
      "Status",
      "Error",
    ].join(",");
    const rows = toolCalls.map((toolCall: ToolCallRecord) =>
      [
        toolCall.timestamp || "",
        toolCall.toolName || "",
        toolCall.domain || "",
        toolCall.method || "",
        toolCall.callerAgent || "",
        toolCall.callerUsername || "",
        toolCall.elapsedMs || 0,
        toolCall.success ? "OK" : "ERR",
        toolCall.errorMessage || "",
      ].join(","),
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = url;
    downloadAnchor.download = `tool-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadAnchor.click();
    URL.revokeObjectURL(url);
  }, [toolCalls]);

  const totalPages = Math.ceil(total / LIMIT);

  // -- Build detail sections for the drawer ----------------------
  function buildDetailSections(toolCall: ToolCallRecord | null) {
    if (!toolCall) return [];
    return [
      {
        title: "Overview",
        items: [
          { label: "Tool", value: toolCall.toolName },
          { label: "Domain", value: toolCall.domain },
          { label: "Method", value: toolCall.method },
          { label: "Path", value: toolCall.path, mono: true },
          { label: "Status Code", value: toolCall.status },
          {
            label: "Success",
            value: toolCall.success ? "✓ OK" : "✗ Error",
          },
          ...(toolCall.errorMessage
            ? [{ label: "Error", value: toolCall.errorMessage }]
            : []),
        ],
      },
      {
        title: "Performance",
        items: [
          {
            label: "Latency",
            value: toolCall.elapsedMs ? formatLatencyMilliseconds(toolCall.elapsedMs) : "—",
          },
          {
            label: "Latency (raw)",
            value: toolCall.elapsedMs ? `${toolCall.elapsedMs.toFixed(2)} ms` : "—",
            mono: true,
          },
          {
            label: "Request Size",
            value:
              (toolCall.inBytes || 0) > 0 ? formatFileSize(toolCall.inBytes || 0) : "—",
          },
          {
            label: "Response Size",
            value:
              (toolCall.outBytes || 0) > 0 ? formatFileSize(toolCall.outBytes || 0) : "—",
          },
        ],
      },
      {
        title: "Caller Context",
        items: [
          { label: "Project", value: toolCall.callerProject || "—" },
          { label: "Username", value: toolCall.callerUsername || "—" },
          { label: "Agent", value: toolCall.callerAgent || "—" },
          { label: "Request ID", value: toolCall.callerRequestId || "—", mono: true },
          {
            label: "Conversation ID",
            value: toolCall.callerConversationId || "—",
            mono: true,
          },
          {
            label: "Iteration",
            value: toolCall.callerIteration != null ? `#${toolCall.callerIteration}` : "—",
          },
          { label: "Client IP", value: toolCall.clientIp || "—", mono: true },
        ],
      },
      {
        title: "Timing",
        items: [
          {
            label: "Timestamp",
            value: toolCall.timestamp ? formatDateTime(toolCall.timestamp) : "—",
          },
        ],
      },
    ];
  }

  // -- Header controls --------------------------------------------
  useEffect(() => {
    setControls(
      <>
        <ErrorMessage message={error} />
      </>,
    );
  }, [setControls, error]);

  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  useEffect(() => {
    setTitleBadge(formatNumber(total));
  }, [setTitleBadge, total]);

  return (
    <div className={styles['page']}>
      {/* Filters */}
      <FilterBarComponent>
        <FilterGroupComponent label="Tool">
          <FilterInputComponent
            placeholder="Filter by tool name..."
            value={filters.toolName}
            onChange={(value: string) => handleFilterChange("toolName", value)}
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Domain">
          <FilterSelectComponent
            value={filters.domain}
            onChange={(value: string) => handleFilterChange("domain", value)}
            options={DOMAIN_OPTIONS}
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Request ID">
          <FilterInputComponent
            placeholder="Search request ID..."
            value={filters.callerRequestId}
            onChange={(value: string) =>
              handleFilterChange("callerRequestId", value)
            }
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Agent">
          <FilterInputComponent
            placeholder="Filter by agent..."
            value={filters.callerAgent}
            onChange={(value: string) =>
              handleFilterChange("callerAgent", value)
            }
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Status">
          <FilterSelectComponent
            value={filters.success}
            onChange={(value: string) => handleFilterChange("success", value)}
            options={[
              { value: "", label: "All" },
              { value: "true", label: "Success" },
              { value: "false", label: "Error" },
            ]}
          />
        </FilterGroupComponent>

        <FilterClearButton onClick={clearFilters} />
        <ButtonComponent
          variant="secondary"
          icon={Download}
          onClick={exportCSV}
        >
          Export CSV
        </ButtonComponent>
      </FilterBarComponent>

      {/* Table */}
      <div className={styles['table-wrapper']} data-drawer-ignore-click-outside>
        <TableComponent
          columns={columns}
          data={toolCalls}
          sortKey={sort}
          sortDir={order}
          onSort={handleSort}
          onRowClick={(toolCall: ToolCallRecord) => setSelectedCall(toolCall)}
          getRowKey={(toolCall: ToolCallRecord, i: number) => toolCall._id || `tc-${i}`}
          emptyText={loading ? "Loading..." : "No tool calls found"}
          maxHeight={undefined}
          storageKey="tool-requests"
        />

        {/* Pagination */}
        <PaginationComponent
          page={page}
          totalPages={totalPages}
          totalItems={total}
          onPageChange={setPage}
          limit={LIMIT}
        />
      </div>

      {/* Detail drawer */}
      <RequestDetailsComponent
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        title="Tool Call Detail"
        sections={buildDetailSections(selectedCall)}
        contentKey={selectedCall?._id}
      >
        {selectedCall && (
          <>
            {/* Associated Request */}
            <div className={styles['detail-section']}>
              <div className={styles['detail-section-title']}>Associated Request</div>
              {loadingAssociatedRequest ? (
                <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>Loading…</span>
              ) : associatedRequest ? (
                <div
                  className={styles['associated-request-card']}
                  onClick={() => router.push(`/admin/requests?id=${associatedRequest.requestId || associatedRequest._id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles['associated-request-layout-row']}>
                    <BadgeComponent variant="provider">{associatedRequest.provider || "—"}</BadgeComponent>
                    <BadgeComponent variant="info">{associatedRequest.operation || associatedRequest.endpoint || "—"}</BadgeComponent>
                    {associatedRequest.agent && (
                      <BadgeComponent variant="accent">{associatedRequest.agent}</BadgeComponent>
                    )}
                  </div>
                  <div className={styles['associated-request-layout-row']}>
                    <span className={styles['associated-request-model']}>{associatedRequest.model || "—"}</span>
                    {associatedRequest.estimatedCost != null && (
                      <span className={styles['associated-request-cost']}>{formatCost(associatedRequest.estimatedCost)}</span>
                    )}
                    {associatedRequest.timestamp && (
                      <span className={styles['associated-request-timestamp']}>{formatDateTime(associatedRequest.timestamp)}</span>
                    )}
                    <ExternalLink size={12} style={{ opacity: 0.5, marginInlineStart: "auto" }} />
                  </div>
                </div>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
                  {selectedCall.callerRequestId ? "Request not found" : "No associated request"}
                </span>
              )}
            </div>

            {selectedCall.args && Object.keys(selectedCall.args).length > 0 && (
              <div className={styles['detail-section']}>
                <JsonViewerComponent
                  data={selectedCall.args}
                  label="Arguments"
                  maxHeight="300px"
                />
              </div>
            )}
            {selectedCall.result &&
              Object.keys(selectedCall.result).length > 0 && (
                <div className={styles['detail-section']}>
                  <JsonViewerComponent
                    data={selectedCall.result}
                    label="Result (Sanitized)"
                    maxHeight="400px"
                  />
                </div>
              )}
          </>
        )}
      </RequestDetailsComponent>
    </div>
  );
}
