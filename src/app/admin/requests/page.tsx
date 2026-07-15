"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Download, Filter } from "lucide-react";
import IrisService from "../../../services/IrisService";
import { formatNumber, formatTokensPerSec } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../../../utils/utilities";
import { getErrorMessage } from "../../../utils/errorMessage";

import RequestsTableComponent from "../../../components/RequestsTableComponent";
import {
  ButtonComponent,
  PaginationComponent,
  SelectComponent,
} from "@rodrigo-barraza/components-library";

import { ErrorMessage } from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";
import { LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER } from "../../../constants";
import styles from "./page.module.css";

const POLL_INTERVAL = 5000;
import { TransformedRequestItem } from "../../../types/types";

type RequestItem = TransformedRequestItem;

// Page-specific filters that aren't part of the shared filter card.
interface RequestFilters {
  endpoint: string[];
  operation: string[];
  success: string[];
}

const EMPTY_FILTERS: RequestFilters = {
  endpoint: [],
  operation: [],
  success: [],
};

export default function RequestsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Shared filters are driven by the URL + header context (via the filter card)
  const projectFilter = searchParams.get("project") || null;
  const providerFilter = searchParams.get("provider") || null;
  const modelFilter = searchParams.get("model") || null;
  const { setTitleBadge, dateRange, setDateRange, agentFilter } =
    useAdminHeader();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [filters, setFilters] = useState<RequestFilters>(EMPTY_FILTERS);

  const [hoveredConversationId, setHoveredConversationId] = useState<
    string | null
  >(null);
  const isInitialLoadDone = useRef<boolean>(false);
  const fetchGenRef = useRef<number>(0);

  // "Just now" row highlighting — track fresh rows and fade-outs
  const previousJustNowIdsRef = useRef<Set<string>>(new Set());
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const fadingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [justNowTick, setJustNowTick] = useState(0);

  // Compute which rows are "just now" (< 5s old) on every render/tick
  const justNowIds = useMemo<Set<string>>(() => {
    // eslint-disable-next-line react-hooks/purity -- time-based value is intentionally computed during render
    const now = Date.now();
    const ids = new Set<string>();
    for (const response of requests) {
      if (!response.createdAt) continue;
      const age = now - new Date(response.createdAt).getTime();
      // Treat timestamps up to 10s in the future (clock skew) or < 5s old
      if (age < 5000 && age > -10000) ids.add(response.requestId || response._id);
    }
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- justNowTick intentionally drives recomputation so rows age out
  }, [requests, justNowTick]);

  // Tick every 1s while there are "just now" rows so they age out naturally
  useEffect(() => {
    if (justNowIds.size === 0) return;
    const timer = setInterval(() => setJustNowTick((previousTick: number) => previousTick + 1), 1000);
    return () => clearInterval(timer);
  }, [justNowIds.size]);

  // Detect transitions: was "just now" → no longer → trigger fade
  useEffect(() => {
    const previousJustNowIds = previousJustNowIdsRef.current;
    for (const id of previousJustNowIds) {
      if (!justNowIds.has(id) && !fadingTimers.current.has(id)) {
        setFadingIds((state: Set<string>) => {
          const updatedSet = new Set(state);
          updatedSet.add(id);
          return updatedSet;
        });
        const timer = setTimeout(() => {
          setFadingIds((state: Set<string>) => {
            const updatedSet = new Set(state);
            updatedSet.delete(id);
            return updatedSet;
          });
          fadingTimers.current.delete(id);
        }, 1000);
        fadingTimers.current.set(id, timer);
      }
    }
    previousJustNowIdsRef.current = justNowIds;
  }, [justNowIds]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = fadingTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  const LIMIT = 50;

  const loadRequests = useCallback(async () => {
    const fetchGeneration = fetchGenRef.current;
    try {
      const params: Record<string, string | number | boolean> = {
        page,
        limit: LIMIT,
        sort,
        order,
      };
      if (projectFilter) params.project = projectFilter;
      if (agentFilter) params.agent = agentFilter;
      if (providerFilter) params.provider = providerFilter;
      if (modelFilter) params.model = modelFilter;

      Object.entries(filters).forEach(([key, filterValue]) => {
        if (filterValue.length > 0) params[key] = filterValue.join(",");
      });
      Object.assign(params, buildDateRangeParams(dateRange));

      const data = await IrisService.getRequests(params);
      if (fetchGeneration !== fetchGenRef.current) return;
      setRequests(data.data || []);
      setTotal(data.total || 0);
    } catch (error: unknown) {
      if (fetchGeneration !== fetchGenRef.current) return;
      setError(getErrorMessage(error));
    } finally {
      if (fetchGeneration !== fetchGenRef.current) return;
      if (!isInitialLoadDone.current) {
        isInitialLoadDone.current = true;
        setIsLoading(false);
      }
    }
  }, [page, sort, order, filters, dateRange, projectFilter, agentFilter, providerFilter, modelFilter]);

  useEffect(() => {
    // Bump generation to invalidate any in-flight requests from previous effect
    fetchGenRef.current += 1;
    isInitialLoadDone.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setIsLoading(true);
    setError(null);

    loadRequests();

    // Subscribe to change stream SSE for real-time updates
    let pollInterval: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadRequests, 800);
    };
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data: { changeStreams?: boolean }) => {
        if (!data.changeStreams) {
          // No Change Streams — fall back to polling
          if (!pollInterval) {
            pollInterval = setInterval(loadRequests, POLL_INTERVAL);
          }
        }
      },
      onChange: (event: { collection?: string }) => {
        if (event.collection === "requests") {
          debouncedLoad();
        }
      },
    });

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadRequests]);



  function handleSort(key: string, dir: string) {
    setSort(key);
    setOrder(dir);
    setPage(1);
  }

  const handleMultiFilterChange = useCallback(
    (key: keyof RequestFilters, values: string[]) => {
      setFilters((previous: RequestFilters) => ({ ...previous, [key]: values }));
      setPage(1);
    },
    [],
  );

  // Reset every filter — the page-specific selects plus the shared,
  // URL/context-driven filters owned by the filter card.
  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    ["project", "provider", "model", "agent"].forEach((key) =>
      params.delete(key),
    );
    router.replace(`${pathname}?${params.toString()}`);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER);
    } catch {
      /* localStorage unavailable */
    }
    setDateRange({ from: "", to: "" });
  }, [searchParams, router, pathname, setDateRange]);

  const endpointFilterOptions = useMemo(
    () => [
      { value: "/chat", label: "/chat" },
      { value: "/agent", label: "/coding-agent" },
      { value: "/embed", label: "/embed" },
      { value: "/live", label: "/live" },
    ],
    [],
  );

  const operationFilterOptions = useMemo(
    () => [
      { value: "chat", label: "Chat" },
      { value: "chat:image", label: "Chat: Image" },
      { value: "agent", label: "Agent" },
      { value: "agent:iteration", label: "Agent: Iteration" },
      { value: "agent:image", label: "Agent: Image" },
      { value: "live", label: "Live" },
      { value: "memory:extract", label: "Memory: Extract" },
      { value: "memory:consolidate", label: "Memory: Consolidate" },
      { value: "conversation:summarize", label: "Conversation: Summarize" },
      { value: "coordinator:decompose", label: "Coordinator: Decompose" },
      { value: "memory:embed", label: "Memory: Embed" },
    ],
    [],
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: "true", label: "Success" },
      { value: "false", label: "Error" },
    ],
    [],
  );

  const exportCSV = useCallback(() => {
    const headers = [
      "Timestamp",
      "Project",
      "Endpoint",
      "Operation",
      "Provider",
      "Model",
      "Tokens In",
      "Tokens Out",
      "Cost",
      "Tok/s",
      "Latency",
      "Status",
    ].join(",");
    const rows = requests.map((response: RequestItem) =>
      [
        response.createdAt || "",
        response.project || "",
        response.endpoint || "",
        response.operation || "",
        response.provider || "",
        response.model || "",
        response.inputTokens || 0,
        response.outputTokens || 0,
        response.estimatedCost || 0,
        response.tokensPerSec ? formatTokensPerSec(response.tokensPerSec) : "",
        response.totalTime || 0,
        response.success ? "OK" : "ERR",
      ].join(","),
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = url;
    downloadAnchor.download = `iris-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadAnchor.click();
    URL.revokeObjectURL(url);
  }, [requests]);

  const totalPages = Math.ceil(total / LIMIT);

  // Cleanup title badge on unmount
  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  // Set title badge with total count
  useEffect(() => {
    setTitleBadge(formatNumber(total));
  }, [setTitleBadge, total]);

  return (
    <div className={styles['page']}>
      {/* Filters */}
      <AdminFiltersCardComponent
        show={{ workspace: false }}
        actions={
          <>
            <ButtonComponent variant="ghost" onClick={clearFilters}>
              Clear
            </ButtonComponent>
            <ButtonComponent
              variant="secondary"
              icon={Download}
              onClick={exportCSV}
            >
              Export CSV
            </ButtonComponent>
          </>
        }
      >
        <SelectComponent
          multiple
          value={filters.endpoint}
          options={endpointFilterOptions}
          onChange={(values: string[]) =>
            handleMultiFilterChange("endpoint", values)
          }
          placeholder="All Endpoints"
          allLabel="All Endpoints"
          icon={<Filter size={14} />}
          compact
        />
        <SelectComponent
          multiple
          value={filters.operation}
          options={operationFilterOptions}
          onChange={(values: string[]) =>
            handleMultiFilterChange("operation", values)
          }
          placeholder="All Operations"
          allLabel="All Operations"
          icon={<Filter size={14} />}
          compact
          searchable
        />
        <SelectComponent
          multiple
          value={filters.success}
          options={statusFilterOptions}
          onChange={(values: string[]) =>
            handleMultiFilterChange("success", values)
          }
          placeholder="All Statuses"
          allLabel="All Statuses"
          icon={<Filter size={14} />}
          compact
        />
      </AdminFiltersCardComponent>

      <ErrorMessage message={error} />

      {/* Table */}
      <div className={styles['table-wrapper']}>
        <RequestsTableComponent
          requests={requests}
          sortKey={sort}
          sortDir={order}
          onSort={handleSort}
          maxHeight={null}
          onRowMouseEnter={(row: RequestItem) => {
            if (row.conversationId)
              setHoveredConversationId(row.conversationId);
          }}
          onRowMouseLeave={() => setHoveredConversationId(null)}
          getRowClassName={(row: RequestItem) => {
            const id = row.requestId || row._id;
            const classes = [];
            if (
              hoveredConversationId &&
              row.conversationId === hoveredConversationId
            ) {
              classes.push(styles['shared-conversation-layout-row']);
            }
            if (justNowIds.has(id)) classes.push(styles['new-layout-row']);
            else if (fadingIds.has(id)) classes.push(styles['new-layout-row-fade-out']);
            return classes.join(" ");
          }}
          emptyText={isLoading ? "Loading..." : "No requests found"}
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


    </div>
  );
}
