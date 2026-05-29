"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Clock,
  Activity,
} from "lucide-react";
import ToolsApiService from "../../../services/ToolsApiService";
import {
  BadgeComponent,
  TableComponent,
  LoadingIndicatorComponent,
} from "@rodrigo-barraza/components-library";
import { ErrorMessage } from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import { formatNumber, formatLatencyMs, formatDateTime, formatFileSize } from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../../../utils/utilities";
import styles from "./page.module.css";
import { getErrorMessage } from "../../../utils/errorMessage";

// -- Data Interfaces ------------------------------------------

interface ToolStat {
  toolName: string;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  errors: number;
  errorRate: number;
  totalTransferBytes?: number;
  [key: string]: string | number | undefined;
}

interface DomainStat {
  domain: string;
  count: number;
  avgMs: number;
  errors: number;
  [key: string]: string | number;
}

interface SlowestCall {
  _id?: string;
  toolName: string;
  domain?: string;
  elapsedMs: number;
  success: boolean;
  callerAgent?: string;
  timestamp?: string;
}

interface ToolErrorEntry {
  _id: string;
  errorCount: number;
  lastError?: string;
  lastErrorAt?: string;
}

interface ToolCallStats {
  totalCalls: number;
  successRate: number;
  byTool: ToolStat[];
  byDomain: DomainStat[];
  slowest: SlowestCall[];
  errorsByTool: ToolErrorEntry[];
}

// -- Column definitions for per-tool stats table --------------
function getToolColumns() {
  return [
    {
      key: "toolName",
      label: "Tool",
      description: "Registered tool function name",
      sortable: true,
      render: (r: ToolStat) => (
        <BadgeComponent variant="provider">{r.toolName}</BadgeComponent>
      ),
    },
    {
      key: "count",
      label: "Calls",
      description: "Total number of invocations",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) => formatNumber(r.count),
    },
    {
      key: "avgMs",
      label: "Avg Latency",
      description: "Mean execution time across all calls",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) => formatLatencyMs(r.avgMs),
    },
    {
      key: "minMs",
      label: "Min",
      description: "Fastest execution time recorded",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) => formatLatencyMs(r.minMs),
    },
    {
      key: "maxMs",
      label: "Max",
      description: "Slowest execution time recorded",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) => formatLatencyMs(r.maxMs),
    },
    {
      key: "errors",
      label: "Errors",
      description: "Total failed invocations",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) =>
        r.errors > 0 ? (
          <span className={styles.errorCount}>{r.errors}</span>
        ) : (
          <span className={styles.zeroErrors}>0</span>
        ),
    },
    {
      key: "errorRate",
      label: "Error %",
      description: "Percentage of calls that failed",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) => {
        if (r.errorRate === 0)
          return <span className={styles.zeroErrors}>0%</span>;
        return (
          <span
            className={
              r.errorRate > 5 ? styles.highErrorRate : styles.errorCount
            }
          >
            {r.errorRate}%
          </span>
        );
      },
    },
    {
      key: "totalTransferBytes",
      label: "Transfer",
      description: "Total bytes transferred (in + out)",
      sortable: true,
      align: "right" as const,
      render: (r: ToolStat) => {
        if (!r.totalTransferBytes || r.totalTransferBytes <= 0) return "—";
        return formatFileSize(r.totalTransferBytes);
      },
    },
  ];
}

// -- Domain breakdown columns ---------------------------------
function getDomainColumns() {
  return [
    {
      key: "domain",
      label: "Domain",
      sortable: true,
      render: (r: DomainStat) => (
        <BadgeComponent variant="info">{r.domain || "—"}</BadgeComponent>
      ),
    },
    {
      key: "count",
      label: "Calls",
      sortable: true,
      align: "right" as const,
      render: (r: DomainStat) => formatNumber(r.count),
    },
    {
      key: "avgMs",
      label: "Avg Latency",
      sortable: true,
      align: "right" as const,
      render: (r: DomainStat) => formatLatencyMs(r.avgMs),
    },
    {
      key: "errors",
      label: "Errors",
      sortable: true,
      align: "right" as const,
      render: (r: DomainStat) =>
        r.errors > 0 ? (
          <span className={styles.errorCount}>{r.errors}</span>
        ) : (
          <span className={styles.zeroErrors}>0</span>
        ),
    },
  ];
}

// -- Slowest calls columns ------------------------------------
function getSlowestColumns() {
  return [
    {
      key: "toolName",
      label: "Tool",
      sortable: false,
      render: (r: SlowestCall) => (
        <BadgeComponent variant="provider">{r.toolName}</BadgeComponent>
      ),
    },
    {
      key: "domain",
      label: "Domain",
      sortable: false,
      render: (r: SlowestCall) => (
        <BadgeComponent variant="info">{r.domain || "—"}</BadgeComponent>
      ),
    },
    {
      key: "elapsedMs",
      label: "Latency",
      sortable: false,
      align: "right" as const,
      render: (r: SlowestCall) => formatLatencyMs(r.elapsedMs),
    },
    {
      key: "success",
      label: "Status",
      sortable: false,
      render: (r: SlowestCall) =>
        r.success ? (
          <BadgeComponent variant="success">OK</BadgeComponent>
        ) : (
          <BadgeComponent variant="error">Error</BadgeComponent>
        ),
    },
    {
      key: "callerAgent",
      label: "Agent",
      sortable: false,
      render: (r: SlowestCall) =>
        r.callerAgent ? (
          <BadgeComponent variant="accent">{r.callerAgent}</BadgeComponent>
        ) : (
          "—"
        ),
    },
    {
      key: "timestamp",
      label: "When",
      sortable: false,
      render: (r: SlowestCall) =>
        r.timestamp ? formatDateTime(r.timestamp) : "—",
    },
  ];
}

export default function ToolCallsPage() {
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();
  const [stats, setStats] = useState<ToolCallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sort state for tools table
  const [toolSort, setToolSort] = useState("count");
  const [toolOrder, setToolOrder] = useState("desc");

  // Sort state for domain table
  const [domainSort, setDomainSort] = useState("count");
  const [domainOrder, setDomainOrder] = useState("desc");

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = {};
      const dateParams = buildDateRangeParams(dateRange);
      if (dateParams?.since) params.since = dateParams.since;
      const data = await ToolsApiService.getToolCallStats(params);
      setStats(data as unknown as ToolCallStats);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // -- Header controls ----------------------------------------
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
    if (stats) setTitleBadge(formatNumber(stats.totalCalls));
  }, [setTitleBadge, stats]);

  // -- Column definitions (stable) ----------------------------
  const toolColumns = useMemo(() => getToolColumns(), []);
  const domainColumns = useMemo(() => getDomainColumns(), []);
  const slowestColumns = useMemo(() => getSlowestColumns(), []);

  // -- Sorted data --------------------------------------------
  const sortedTools = useMemo(() => {
    if (!stats?.byTool) return [];
    const array = [...stats.byTool];
    array.sort((a: ToolStat, b: ToolStat) => {
      const mult = toolOrder === "desc" ? -1 : 1;
      if (toolSort === "toolName")
        return mult * a.toolName.localeCompare(b.toolName);
      return (
        mult *
        (((a[toolSort as keyof ToolStat] as number) || 0) -
          ((b[toolSort as keyof ToolStat] as number) || 0))
      );
    });
    return array;
  }, [stats, toolSort, toolOrder]);

  const sortedDomains = useMemo(() => {
    if (!stats?.byDomain) return [];
    const array = [...stats.byDomain];
    array.sort((a: DomainStat, b: DomainStat) => {
      const mult = domainOrder === "desc" ? -1 : 1;
      if (domainSort === "domain")
        return mult * (a.domain || "").localeCompare(b.domain || "");
      return (
        mult *
        (((a[domainSort as keyof DomainStat] as number) || 0) -
          ((b[domainSort as keyof DomainStat] as number) || 0))
      );
    });
    return array;
  }, [stats, domainSort, domainOrder]);

  // -- Derived computed stats ---------------------------------
  const avgLatencyAll = useMemo(() => {
    if (!stats?.byTool?.length) return 0;
    const totalMs = stats.byTool.reduce(
      (sum: number, t: ToolStat) => sum + t.avgMs * t.count,
      0,
    );
    return totalMs / stats.totalCalls;
  }, [stats]);

  const topDomain = useMemo(() => {
    if (!stats?.byDomain?.length) return "—";
    return stats.byDomain[0].domain;
  }, [stats]);

  if (loading && !stats) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <LoadingIndicatorComponent
            size="small"
            color="inherit"
            label="Loading tool call statistics…"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* -- Summary Cards -- */}
      <div className={styles.summaryGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <BarChart3 size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>
              {formatNumber(stats?.totalCalls || 0)}
            </span>
            <span className={styles.statLabel}>Total Calls</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.successIcon}`}>
            <CheckCircle size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats?.successRate ?? 0}%</span>
            <span className={styles.statLabel}>Success Rate</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.latencyIcon}`}>
            <Clock size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>
              {formatLatencyMs(avgLatencyAll)}
            </span>
            <span className={styles.statLabel}>Avg Latency</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.domainIcon}`}>
            <Activity size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{topDomain}</span>
            <span className={styles.statLabel}>Top Domain</span>
          </div>
        </div>
      </div>

      {/* -- Per-Tool Statistics -- */}
      <TableComponent
        title="Per-Tool Statistics"
        columns={toolColumns}
        data={sortedTools}
        sortKey={toolSort}
        sortDir={toolOrder}
        onSort={(key: string, dir: string) => {
          setToolSort(key);
          setToolOrder(dir);
        }}
        getRowKey={(r: ToolStat) => r.toolName}
        emptyText="No tool data"
        maxHeight={undefined}
        storageKey="tool-calls-by-tool"
      />

      {/* -- Domain Breakdown -- */}
      <TableComponent
        title="Domain Breakdown"
        columns={domainColumns}
        data={sortedDomains}
        sortKey={domainSort}
        sortDir={domainOrder}
        onSort={(key: string, dir: string) => {
          setDomainSort(key);
          setDomainOrder(dir);
        }}
        getRowKey={(r: DomainStat) => r.domain}
        emptyText="No domain data"
        maxHeight={undefined}
        storageKey="tool-calls-by-domain"
      />

      {/* -- Slowest Calls -- */}
      {(stats?.slowest?.length ?? 0) > 0 && stats && (
        <TableComponent
          title="Top 10 Slowest Calls"
          columns={slowestColumns}
          data={stats.slowest}
          getRowKey={(r: SlowestCall, i: number) => r._id || `slow-${i}`}
          emptyText="No data"
          maxHeight={undefined}
          storageKey="tool-calls-slowest"
        />
      )}

      {/* -- Error Breakdown -- */}
      {(stats?.errorsByTool?.length ?? 0) > 0 && stats && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} ${styles.errorTitle}`}>
            <AlertTriangle size={16} /> Errors by Tool
          </h2>
          <div className={styles.errorGrid}>
            {stats.errorsByTool.map((error: ToolErrorEntry) => (
              <div key={error._id} className={styles.errorCard}>
                <div className={styles.errorCardHeader}>
                  <BadgeComponent variant="provider">
                    {error._id}
                  </BadgeComponent>
                  <span className={styles.errorCardCount}>
                    {error.errorCount} error{error.errorCount !== 1 ? "s" : ""}
                  </span>
                </div>
                {error.lastError && (
                  <div className={styles.errorCardMessage}>
                    {error.lastError}
                  </div>
                )}
                {error.lastErrorAt && (
                  <div className={styles.errorCardTime}>
                    Last: {formatDateTime(error.lastErrorAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
