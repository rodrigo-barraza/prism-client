"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Target,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { POLL_FAST } from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";

import BenchmarkBarComponent from "./BenchmarkBarComponent";
import SoundService from "@/services/SoundService";
import type { Benchmark, BenchmarkAssertion } from "@/types/types";
import styles from "./BenchmarkSidebarComponent.module.css";

/**
 * BenchmarkSidebarComponent — a navigable list of all benchmarks,
 * intended to live in the ThreePanelLayout rightSidebar slot.
 *
 * Props:
 *   activeBenchmarkId — highlight the currently viewed benchmark
 */
export default function BenchmarkSidebarComponent({
  activeBenchmarkId,
}: {
  activeBenchmarkId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeBenchmarkIds, setActiveBenchmarkIds] = useState(new Set());

  // -- Load benchmarks ----------------------------------------
  const loadBenchmarks = useCallback(async () => {
    try {
      const { benchmarks: data } = await PrismService.getBenchmarks();
      setBenchmarks(data || []);
    } catch (error: unknown) {
      console.error("Failed to load benchmarks:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBenchmarks();
  }, [loadBenchmarks]);

  // -- Adaptive poll: only keep polling while benchmarks are active --
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const { activeIds } = await PrismService.getActiveBenchmarks();
        if (cancelled) return;

        const ids = activeIds || [];
        setActiveBenchmarkIds(new Set(ids));

        // Start polling if active runs exist, stop if none
        if (ids.length > 0 && !interval) {
          interval = setInterval(poll, POLL_FAST);
        } else if (ids.length === 0 && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        /* ignore */
      }
    };

    // Re-check when a run starts elsewhere on the page
    const onRunStarted = () => poll();
    window.addEventListener("benchmark-run-started", onRunStarted);

    poll(); // single check on mount
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener("benchmark-run-started", onRunStarted);
    };
  }, []);

  // -- Filtered list ------------------------------------------
  const filtered = useMemo(() => {
    if (!search.trim()) return benchmarks;
    const normalizedSearch = search.toLowerCase();
    return benchmarks.filter(
      (current) =>
        current.name.toLowerCase().includes(normalizedSearch) ||
        current.prompt?.toLowerCase().includes(normalizedSearch) ||
        current.expectedValue?.toLowerCase().includes(normalizedSearch) ||
        current.assertions?.some((assertion: BenchmarkAssertion) =>
          assertion.expectedValue?.toLowerCase().includes(normalizedSearch),
        ),
    );
  }, [benchmarks, search]);

  // -- Navigate -----------------------------------------------
  const navigate = useCallback(
    (benchmark: Benchmark) => {
      router.push(`/benchmarks/${benchmark.id}`);
    },
    [router],
  );

  const navigateToNew = useCallback(() => {
    router.push("/benchmarks/new");
  }, [router]);

  const isOnNewPage = pathname === "/benchmarks/new";

  return (
    <div className={`benchmark-sidebar-component ${styles['container']}`}>
      {/* New Benchmark */}
      <ButtonComponent
        variant="primary"
        icon={Plus}
        onClick={navigateToNew}
        disabled={isOnNewPage}
        className={styles['new-button']}
        data-panel-close
      >
        New Benchmark
      </ButtonComponent>

      {/* Search */}
      <div className={styles['search-wrap']}>
        <SearchInputComponent
          value={search}
          onChange={setSearch}
          placeholder="Search benchmarks…"
          compact
        />
      </div>

      {/* "All Benchmarks" link */}
      <button
        className={`${styles['all-link']} ${pathname === "/benchmarks" && !activeBenchmarkId ? styles['all-link-is-active-state'] : ""}`}
        onClick={() => router.push("/benchmarks")}
        data-panel-close
      >
        <Target size={13} />
        All Benchmarks
        <span className={styles['all-link-count']}>{benchmarks.length}</span>
      </button>

      {/* List */}
      <div className={styles['list']}>
        {loading ? (
          <div className={styles['empty']}>
            <Loader2 size={16} className={styles['spin-icon']} />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles['empty']}>
            {search ? "No matches" : "No benchmarks yet"}
          </div>
        ) : (
          filtered.map((current) => {
            const isActive = activeBenchmarkId === current.id;
            const isRunning = activeBenchmarkIds.has(current.id);
            const run = current.latestRun;

            return (
              <div
                key={current.id}
                className={`${styles['item']} ${isActive ? styles['item-is-active-state'] : ""} ${isRunning ? styles['item-running'] : ""}`}
                {...SoundService.interactive(() => navigate(current))}
                data-panel-close
              >
                {/* Row 1: date (left) · cost (right) */}
                <div className={styles['top-layout-row']}>
                  <BadgeComponent
                    type="dateTime"
                    date={current.updatedAt || current.createdAt}
                  />
                  {isRunning && (
                    <Loader2 size={10} className={styles['spin-icon']} />
                  )}
                  <BadgeComponent type="cost" cost={current.cumulativeCost} />
                </div>

                {/* Row 2: name */}
                <span className={styles['item-name']}>{current.name}</span>

                {/* Row 3: passed/failed (left) · pass bar (right) */}
                {run ? (
                  <div className={styles['bottom-layout-row']}>
                    <div className={styles['stats-left']}>
                      <span className={styles['stat-passed']}>
                        <CheckCircle2 size={10} />
                        {run.summary?.passed}
                      </span>
                      <span className={styles['stat-failed']}>
                        <XCircle size={10} />
                        {(run.summary?.failed ?? 0) +
                          (run.summary?.errored || 0)}
                      </span>
                    </div>
                    <BenchmarkBarComponent
                      passed={run.summary?.passed ?? 0}
                      total={run.summary?.total ?? 0}
                      mini
                    />
                  </div>
                ) : (
                  <div className={styles['bottom-layout-row']}>
                    <div className={styles['stats-left']}>
                      <Clock size={10} />
                      <span className={styles['no-runs']}>No runs yet</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
