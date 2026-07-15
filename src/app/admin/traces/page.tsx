"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FolderOpen } from "lucide-react";
import PanelLoadingSpinner from "../../../components/PanelLoadingSpinnerComponent";
import IrisService, {
  type IrisRequestEntry,
} from "../../../services/IrisService";
import { buildDateRangeParams } from "../../../utils/utilities";
import { PaginationComponent } from "@rodrigo-barraza/components-library";
import { useSearchParams } from "next/navigation";
import TracesTableComponent from "../../../components/TracesTableComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";

import styles from "./page.module.css";

const PAGE_SIZE = 30;
const POLL_INTERVAL = 5000; // 5s


export default function TracesPage() {
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project") || null;
  const { setTitleBadge, dateRange, agentFilter } = useAdminHeader();
  const [traces, setTraces] = useState<IrisRequestEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef<boolean>(false);
  const fetchGenRef = useRef<number>(0);

  const dateParams = useMemo(
    () => buildDateRangeParams(dateRange),
    [dateRange],
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadTraces = useCallback(async () => {
    const fetchGeneration = fetchGenRef.current;

    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const params: Record<string, string | number | boolean> = {
        page,
        limit: PAGE_SIZE,
        sort,
        order,
        ...dateParams,
      };
      if (projectFilter) params.project = projectFilter;
      if (agentFilter) params.agent = agentFilter;

      const data = await IrisService.getTraces(params, abortController.signal);
      // Discard stale responses from previous filter/page generations
      if (fetchGeneration !== fetchGenRef.current) return;
      setTraces(data.data || []);
      setTotal(data.total || 0);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (fetchGeneration !== fetchGenRef.current) return;
      console.error("Failed to load traces:", error);
    } finally {
      if (fetchGeneration !== fetchGenRef.current) return;
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, [page, sort, order, dateParams, projectFilter, agentFilter]);

  useEffect(() => {
    // Bump generation to invalidate any in-flight requests from previous effect
    fetchGenRef.current += 1;
    initialLoadDone.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setLoading(true);

    loadTraces();

    // Subscribe to change stream SSE for real-time updates.
    // Traces are derived from requests, so we refresh on request changes.
    let pollInterval: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadTraces, 800);
    };
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data: { changeStreams?: boolean }) => {
        if (!data.changeStreams) {
          // No Change Streams — fall back to polling
          if (!pollInterval) {
            pollInterval = setInterval(loadTraces, POLL_INTERVAL);
          }
        }
      },
      onChange: (event: { collection?: string }) => {
        if (event.collection === "requests") {
          // Request changes update trace data — debounce to batch streaming updates
          debouncedLoad();
        }
      },
    });

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
      // Abort any in-flight request on cleanup
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadTraces]);


  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  // Set title badge with total count
  useEffect(() => {
    setTitleBadge(total);
  }, [setTitleBadge, total]);

  return (
    <div className={styles['page']}>
      <AdminFiltersCardComponent
        show={{ provider: false, model: false, workspace: false }}
      />
      {loading ? (
        <div className={styles['is-loading-state']}>
          <PanelLoadingSpinner size="large" />
        </div>
      ) : traces.length === 0 ? (
        <div className={styles['empty']}>
          <FolderOpen size={36} style={{ opacity: 0.3 }} />
          <div>No traces yet</div>
          <div style={{ fontSize: 12 }}>
            Traces are created when AI calls are grouped together
          </div>
        </div>
      ) : (
        <>
          <TracesTableComponent
            traces={traces}
            emptyText="No traces"
            sortKey={sort}
            sortDir={order}
            onSort={(key: string, dir: string) => {
              setSort(key);
              setOrder(dir);
              setPage(1);
            }}
          />

          {/* Pagination */}
          <PaginationComponent
            page={page}
            totalPages={totalPages}
            totalItems={total}
            onPageChange={setPage}
            limit={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
