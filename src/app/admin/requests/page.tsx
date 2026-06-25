"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Download,
  Filter,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
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
import { FilterInputComponent } from "../../../components/FilterBarComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import styles from "./page.module.css";

const POLL_INTERVAL = 5000;
import { TransformedRequestItem } from "../../../types/types";

type RequestItem = TransformedRequestItem;

interface RequestFilters {
  provider: string[];
  model: string;
  endpoint: string[];
  operation: string[];
  success: string[];
}

export default function RequestsPage() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange, agentFilter } = useAdminHeader();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("timestamp");
  const [order, setOrder] = useState("desc");
  const [filters, setFilters] = useState<RequestFilters>({
    provider: [],
    model: "",
    endpoint: [],
    operation: [],
    success: [],
  });

  const [hoveredConversationId, setHoveredConversationId] = useState<
    string | null
  >(null);
  const isInitialLoadDone = useRef<boolean>(false);
  const fetchGenRef = useRef<number>(0);
  const searchParams = useSearchParams();

  // "Just now" row highlighting — track fresh rows and fade-outs
  const previousJustNowIdsRef = useRef<Set<string>>(new Set());
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const fadingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [justNowTick, setJustNowTick] = useState(0);

  // Compute which rows are "just now" (< 5s old) on every render/tick
  const justNowIds = useMemo<Set<string>>(() => {
    const now = Date.now();
    const ids = new Set<string>();
    for (const response of requests) {
      if (!response.timestamp) continue;
      const age = now - new Date(response.timestamp).getTime();
      // Treat timestamps up to 10s in the future (clock skew) or < 5s old
      if (age < 5000 && age > -10000) ids.add(response.requestId || response._id);
    }
    return ids;
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

      Object.entries(filters).forEach(([key, filterValue]) => {
        if (Array.isArray(filterValue)) {
          if (filterValue.length > 0) params[key] = filterValue.join(",");
        } else if (filterValue) {
          params[key] = filterValue;
        }
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
  }, [page, sort, order, filters, dateRange, projectFilter, agentFilter]);

  useEffect(() => {
    // Bump generation to invalidate any in-flight requests from previous effect
    fetchGenRef.current += 1;
    isInitialLoadDone.current = false;
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

  const handleModelFilterChange = useCallback((value: string) => {
    setFilters((previous: RequestFilters) => ({ ...previous, model: value }));
    setPage(1);
  }, []);

  function clearFilters() {
    setFilters({
      provider: [],
      model: "",
      endpoint: [],
      operation: [],
      success: [],
    });
    setPage(1);
  }

  const providerFilterOptions = useMemo(
    () => [
      { value: "openai", label: "OpenAI" },
      { value: "anthropic", label: "Anthropic" },
      { value: "google", label: "Google" },
      { value: "elevenlabs", label: "ElevenLabs" },
    ],
    [],
  );

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
        response.timestamp || "",
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

  // Inject controls into AdminShell header
  useEffect(() => {
    setControls(
      <>
        <ErrorMessage message={error} />
        <SelectComponent
          value={projectFilter || ""}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
        />
      </>,
    );
  }, [
    setControls,
    total,
    error,
    projectFilter,
    projectOptions,
    handleProjectChange,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // Set title badge with total count
  useEffect(() => {
    setTitleBadge(formatNumber(total));
  }, [setTitleBadge, total]);

  return (
    <div className={styles['page']}>
      {/* Filters */}
      <div className={styles['filter-bar']}>
        <div className={styles['filter-layout-row']}>
          <SelectComponent
            multiple
            label="Provider"
            icon={<Filter size={12} />}
            value={filters.provider}
            options={providerFilterOptions}
            onChange={(values: string[]) =>
              handleMultiFilterChange("provider", values)
            }
            allLabel="All Providers"
            compact
          />
          <div className={styles['filter-label-group']}>
            <span className={styles['filter-label-text']}>Model</span>
            <FilterInputComponent
              placeholder="Filter by model…"
              value={filters.model}
              onChange={handleModelFilterChange}
            />
          </div>
        </div>
        <div className={styles['filter-layout-row']}>
          <SelectComponent
            multiple
            label="Endpoint"
            icon={<Filter size={12} />}
            value={filters.endpoint}
            options={endpointFilterOptions}
            onChange={(values: string[]) =>
              handleMultiFilterChange("endpoint", values)
            }
            allLabel="All Endpoints"
            compact
          />
          <SelectComponent
            multiple
            label="Operation"
            icon={<Filter size={12} />}
            value={filters.operation}
            options={operationFilterOptions}
            onChange={(values: string[]) =>
              handleMultiFilterChange("operation", values)
            }
            allLabel="All Operations"
            compact
          />
          <SelectComponent
            multiple
            label="Status"
            icon={<Filter size={12} />}
            value={filters.success}
            options={statusFilterOptions}
            onChange={(values: string[]) =>
              handleMultiFilterChange("success", values)
            }
            allLabel="All Statuses"
            compact
          />
        </div>
        <div className={styles['filter-actions']}>
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
        </div>
      </div>

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
