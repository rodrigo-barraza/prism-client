// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  Zap,
  CheckCircle,
  AlertTriangle,
  Clock,
  Activity,
} from "lucide-react";
import ToolsApiService from "../../../services/ToolsApiService";
import { BadgeComponent, TableComponent, LoadingIndicatorComponent } from "@rodrigo-barraza/components-library";
import { ErrorMessage } from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import {
  formatNumber,
  formatLatencyMs,
  formatDateTime,
  formatFileSize,
  buildDateRangeParams,
} from "../../../utils/utilities";
import styles from "./page.module.css";

// -- Column definitions for per-tool stats table --------------
function getToolColumns() {
  return [
    {
      key: "toolName",
      label: "Tool",
      description: "Registered tool function name",
      sortable: true,
      render: (r: any) => (
        <BadgeComponent variant="provider">{r.toolName}</BadgeComponent>
      ),
    },
    {
      key: "count",
      label: "Calls",
      description: "Total number of invocations",
      sortable: true,
      align: "right",
      render: (r: any) => formatNumber(r.count),
    },
    {
      key: "avgMs",
      label: "Avg Latency",
      description: "Mean execution time across all calls",
      sortable: true,
      align: "right",
      render: (r: any) => formatLatencyMs(r.avgMs),
    },
    {
      key: "minMs",
      label: "Min",
      description: "Fastest execution time recorded",
      sortable: true,
      align: "right",
      render: (r: any) => formatLatencyMs(r.minMs),
    },
    {
      key: "maxMs",
      label: "Max",
      description: "Slowest execution time recorded",
      sortable: true,
      align: "right",
      render: (r: any) => formatLatencyMs(r.maxMs),
    },
    {
      key: "errors",
      label: "Errors",
      description: "Total failed invocations",
      sortable: true,
      align: "right",
      render: (r: any) =>
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
      align: "right",
      render: (r: any) => {
        if (r.errorRate === 0) return <span className={styles.zeroErrors}>0%</span>;
        return (
          <span className={r.errorRate > 5 ? styles.highErrorRate : styles.errorCount}>
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
      align: "right",
      render: (r: any) => {
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
      render: (r: any) => (
        <BadgeComponent variant="info">{r.domain || "—"}</BadgeComponent>
      ),
    },
    {
      key: "count",
      label: "Calls",
      sortable: true,
      align: "right",
      render: (r: any) => formatNumber(r.count),
    },
    {
      key: "avgMs",
      label: "Avg Latency",
      sortable: true,
      align: "right",
      render: (r: any) => formatLatencyMs(r.avgMs),
    },
    {
      key: "errors",
      label: "Errors",
      sortable: true,
      align: "right",
      render: (r: any) =>
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
      render: (r: any) => (
        <BadgeComponent variant="provider">{r.toolName}</BadgeComponent>
      ),
    },
    {
      key: "domain",
      label: "Domain",
      sortable: false,
      render: (r: any) => (
        <BadgeComponent variant="info">{r.domain || "—"}</BadgeComponent>
      ),
    },
    {
      key: "elapsedMs",
      label: "Latency",
      sortable: false,
      align: "right",
      render: (r: any) => formatLatencyMs(r.elapsedMs),
    },
    {
      key: "success",
      label: "Status",
      sortable: false,
      render: (r: any) =>
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
      render: (r: any) =>
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
      render: (r: any) => (r.timestamp ? formatDateTime(r.timestamp) : "—"),
    },
  ];
}

export default function ToolCallsPage() {
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      const params = {};
      const dateParams = buildDateRangeParams(dateRange);
      if ((dateParams as any).since) (params as any).since = (dateParams as any).since;
      const data = await ToolsApiService.getToolCallStats(params);
      setStats(data);
    } catch (error: any) {
      setError(error.message);
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
    if (stats) setTitleBadge(formatNumber((stats as any).totalCalls));
  }, [setTitleBadge, stats]);

  // -- Column definitions (stable) ----------------------------
  const toolColumns = useMemo(() => getToolColumns(), []);
  const domainColumns = useMemo(() => getDomainColumns(), []);
  const slowestColumns = useMemo(() => getSlowestColumns(), []);

  // -- Sorted data --------------------------------------------
  const sortedTools = useMemo(() => {
    if (!(stats as any)?.byTool) return [];
    const array = [...(stats as any).byTool];
    array.sort((a: any, b: any) => {
      const mult = toolOrder === "desc" ? -1 : 1;
      if (toolSort === "toolName") return mult * a.toolName.localeCompare(b.toolName);
      return mult * ((a[toolSort] || 0) - (b[toolSort] || 0));
    });
    return array;
  }, [stats, toolSort, toolOrder]);

  const sortedDomains = useMemo(() => {
    if (!(stats as any)?.byDomain) return [];
    const array = [...(stats as any).byDomain];
    array.sort((a: any, b: any) => {
      const mult = domainOrder === "desc" ? -1 : 1;
      if (domainSort === "domain") return mult * (a.domain || "").localeCompare(b.domain || "");
      return mult * ((a[domainSort] || 0) - (b[domainSort] || 0));
    });
    return array;
  }, [stats, domainSort, domainOrder]);

  // -- Derived computed stats ---------------------------------
  const avgLatencyAll = useMemo(() => {
    if (!(stats as any)?.byTool?.length) return 0;
    const totalMs = (stats as any).byTool.reduce((sum: any, t: any) => sum + t.avgMs * t.count, 0);
    return totalMs / (stats as any).totalCalls;
  }, [stats]);

  const topDomain = useMemo(() => {
    if (!(stats as any)?.byDomain?.length) return "—";
    return (stats as any).byDomain[0].domain;
  }, [stats]);

  if (loading && !stats) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <LoadingIndicatorComponent size="small" color="inherit" label="Loading tool call statistics…" />
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
              {formatNumber((stats as any)?.totalCalls || 0)}
            </span>
            <span className={styles.statLabel}>Total Calls</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.successIcon}`}>
            <CheckCircle size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>
              {(stats as any)?.successRate ?? 0}%
            </span>
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
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Zap size={16} /> Per-Tool Statistics
        </h2>
        <TableComponent
          columns={toolColumns}
          data={sortedTools}
          sortKey={toolSort}
          sortDir={toolOrder}
          onSort={(key: any, dir: any) => {
            setToolSort(key);
            setToolOrder(dir);
          }}
          getRowKey={(r: any) => r.toolName}
          emptyText="No tool data"
          maxHeight={null}
          storageKey="tool-calls-by-tool"
        />
      </section>

      {/* -- Domain Breakdown -- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Activity size={16} /> Domain Breakdown
        </h2>
        <TableComponent
          columns={domainColumns}
          data={sortedDomains}
          sortKey={domainSort}
          sortDir={domainOrder}
          onSort={(key: any, dir: any) => {
            setDomainSort(key);
            setDomainOrder(dir);
          }}
          getRowKey={(r: any) => r.domain}
          emptyText="No domain data"
          maxHeight={null}
          storageKey="tool-calls-by-domain"
        />
      </section>

      {/* -- Slowest Calls -- */}
      {(stats as any)?.slowest?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Clock size={16} /> Top 10 Slowest Calls
          </h2>
          <TableComponent
            columns={slowestColumns}
            data={stats.slowest}
            getRowKey={(r: any, i: any) => r._id || `slow-${i}`}
            emptyText="No data"
            maxHeight={null}
            storageKey="tool-calls-slowest"
          />
        </section>
      )}

      {/* -- Error Breakdown -- */}
      {(stats as any)?.errorsByTool?.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} ${styles.errorTitle}`}>
            <AlertTriangle size={16} /> Errors by Tool
          </h2>
          <div className={styles.errorGrid}>
            {stats.errorsByTool.map((error: any) => (
              <div key={error._id} className={styles.errorCard}>
                <div className={styles.errorCardHeader}>
                  <BadgeComponent variant="provider">{error._id}</BadgeComponent>
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
