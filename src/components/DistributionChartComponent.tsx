"use client";

import { useState, useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Sector } from "recharts";
import { SelectComponent } from "@rodrigo-barraza/components-library";
import ChartTabsComponent from "./ChartTabsComponent";
import { formatNumber, formatCost, formatLatency } from "@rodrigo-barraza/utilities-library";
import styles from "./DistributionChartComponent.module.css";
import type {
  IrisProjectStat,
  IrisModelStat,
  IrisProviderStat,
  IrisDashboardStats,
} from "../types/types";

const COLORS = [
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
];

const STATUS_COLORS: Record<string, string> = {
  Success: "#10b981",
  Error: "#ef4444",
};

/* -- Metric definitions -- */

const METRICS = [
  { value: "requests", label: "Requests" },
  { value: "totalTokens", label: "Total Tokens" },
  { value: "tokensIn", label: "Tokens In" },
  { value: "tokensOut", label: "Tokens Out" },
  { value: "avgTps", label: "Average Tokens per Second" },
  { value: "cost", label: "Cost" },
  { value: "avgLatency", label: "Average Latency" },
  { value: "conversations", label: "Conversations" },
  { value: "status", label: "Status" },
];

const TABS = [
  { key: "project", label: "Projects" },
  { key: "provider", label: "Providers" },
  { key: "model", label: "Models" },
];

/**
 * Extracts the raw numeric value for a metric from a stat record.
 */
type IrisStatRecord = IrisProjectStat | IrisModelStat | IrisProviderStat;

function extractValue(record: Record<string, unknown>, metric: string): number {
  if (!record) return 0;
  switch (metric) {
    case "requests":
      return (record.totalRequests as number) || 0;
    case "totalTokens":
      return ((record.totalInputTokens as number) || 0) + ((record.totalOutputTokens as number) || 0);
    case "tokensIn":
      return (record.totalInputTokens as number) || 0;
    case "tokensOut":
      return (record.totalOutputTokens as number) || 0;
    case "avgTps":
      return (record.avgTokensPerSec as number) || 0;
    case "cost":
      return (record.totalCost as number) || 0;
    case "avgLatency":
      return (record.avgLatency as number) || 0;
    case "conversations":
      return (record.conversationCount as number) || 0;
    default:
      return 0;
  }
}

/**
 * Formats a value using the appropriate unit for its metric.
 */
function formatValue(value: number, metric: string): string {
  switch (metric) {
    case "cost":
      return formatCost(value);
    case "avgLatency":
      return formatLatency(value);
    case "avgTps":
      return value > 0 ? `${value.toFixed(1)} tok/s` : "—";
    default:
      return formatNumber(value);
  }
}

/**
 * Returns the unit label for the center text (e.g. "requests", "tokens").
 */
function metricUnit(metric: string): string {
  switch (metric) {
    case "requests":
      return "requests";
    case "totalTokens":
    case "tokensIn":
    case "tokensOut":
      return "tokens";
    case "avgTps":
      return "tok/s";
    case "cost":
      return "";
    case "avgLatency":
      return "";
    case "conversations":
      return "convos";
    case "status":
      return "requests";
    default:
      return "";
  }
}

/**
 * Builds distribution entries: an array of { name, value } per tab/metric.
 */
function buildEntries(
  tab: string,
  metric: string,
  projectStats: IrisProjectStat[],
  providerStats: IrisProviderStat[],
  modelStats: IrisModelStat[],
): { name: string; value: number }[] {
  let source: IrisStatRecord[];
  let nameKey: string | ((record: IrisStatRecord) => string);

  switch (tab) {
    case "project":
      source = projectStats;
      nameKey = "project";
      break;
    case "provider":
      source = providerStats;
      nameKey = "provider";
      break;
    case "model":
      source = modelStats;
      nameKey = (record) => ((record as IrisModelStat).model || "").split("/").pop() || "unknown";
      break;
    default:
      return [];
  }

  const entries = source.map((record) => {
    const recordAsMap = record as unknown as Record<string, unknown>;
    const name =
      typeof nameKey === "function"
        ? nameKey(record)
        : (recordAsMap[nameKey as string] as string) || "unknown";
    const value = extractValue(recordAsMap, metric);
    return { name, value };
  });

  // Aggregate duplicate names (e.g. same model basename from different paths)
  const aggMap: Record<string, number> = {};
  for (const { name, value } of entries) {
    aggMap[name] = (aggMap[name] || 0) + value;
  }

  return Object.entries(aggMap)
    .map(([name, value]) => ({ name, value }))
    .sort((agent, current) => current.value - agent.value);
}

/**
 * Builds status entries from overall stats (Success / Error).
 */
function buildStatusEntries(
  stats: IrisDashboardStats | null,
): { name: string; value: number }[] {
  const entries: { name: string; value: number }[] = [];
  if (stats?.successCount)
    entries.push({ name: "Success", value: stats.successCount });
  if (stats?.errorCount)
    entries.push({ name: "Error", value: stats.errorCount });
  return entries;
}

/* -- Active sector renderer with glow and center text -- */

interface ActiveSectorRendererProps {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: { name: string; value: number };
  percent: number;
  metric: string;
}

function ActiveSectorRenderer(props: ActiveSectorRendererProps) {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    metric,
  } = props;

  const unit = metricUnit(metric);
  const formattedValue =
    metric === "status"
      ? payload.value.toLocaleString()
      : formatValue(payload.value, metric);

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={1}
        style={{ filter: `drop-shadow(0 0 8px ${fill})` }}
      />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fill="#f8f8f8"
        fontSize="12"
        fontWeight="600"
      >
        {payload.name.length > 16
          ? payload.name.slice(0, 14) + "…"
          : payload.name}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#8e95ae" fontSize="11">
        {formattedValue}
        {unit ? ` ${unit}` : ""}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill="#5a6078" fontSize="10">
        {(percent * 100).toFixed(1)}%
      </text>
    </g>
  );
}

interface DistributionChartProps {
  projectStats?: IrisProjectStat[];
  providerStats?: IrisProviderStat[];
  modelStats?: IrisModelStat[];
  stats?: IrisDashboardStats | null;
  loading?: boolean;
  height?: number;
  title?: string;
}

const SafePie = Pie as React.ComponentType<Record<string, unknown>>;

export default function DistributionChartComponent({
  projectStats = [],
  providerStats = [],
  modelStats = [],
  stats = null,
  loading = false,
  height = 220,
  title = "Distribution",
}: DistributionChartProps) {
  const [activeTab, setActiveTab] = useState("project");
  const [activeMetric, setActiveMetric] = useState("requests");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const isStatus = activeMetric === "status";

  const entries = useMemo(() => {
    if (isStatus) return buildStatusEntries(stats);
    return buildEntries(
      activeTab,
      activeMetric,
      projectStats,
      providerStats,
      modelStats,
    );
  }, [
    activeTab,
    activeMetric,
    projectStats,
    providerStats,
    modelStats,
    stats,
    isStatus,
  ]);

  const pieData = useMemo(() => {
    return entries.map(({ name, value }, i: number) => ({
      name,
      value,
      fill: isStatus
        ? STATUS_COLORS[name] || COLORS[0]
        : COLORS[i % COLORS.length],
    }));
  }, [entries, isStatus]);

  const isAvgMetric =
    activeMetric === "avgTps" || activeMetric === "avgLatency";
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  const displayTotal = isAvgMetric
    ? entries.length > 0
      ? total / entries.length
      : 0
    : total;
  const totalLabel = isAvgMetric ? "avg" : "total";

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setActiveIndex(null);
  };

  const handleMetricChange = (value: string) => {
    setActiveMetric(value);
    setActiveIndex(null);
  };

  return (
    <div className={`distribution-chart-component ${styles['container']}`}>
      {/* -- Metric selector + title -- */}
      <div className={styles['metric-layout-row']}>
        {title && <h2 className={styles['title']}>{title}</h2>}
        <SelectComponent
          value={activeMetric}
          options={METRICS}
          onChange={handleMetricChange}
        />
      </div>

      {/* -- Tab bar -- */}
      <div className={styles['header']}>
        {!isStatus && (
          <ChartTabsComponent
            tabs={TABS}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        )}
        {isStatus && (
          <span className={styles['status-label']}>Success / Error</span>
        )}
        {total > 0 && (
          <span className={styles['total-badge']}>
            {formatValue(displayTotal, activeMetric)} {totalLabel}
          </span>
        )}
      </div>

      {/* -- Chart + Legend -- */}
      <div className={styles['body']}>
        {pieData.length > 0 ? (
          <>
            <div className={styles['chart-area']}>
              <ResponsiveContainer width="100%" height={height}>
                <PieChart>
                  <SafePie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={height * 0.22}
                    outerRadius={height * 0.36}
                    paddingAngle={2}
                    dataKey="value"
                    activeIndex={activeIndex !== null ? activeIndex : undefined}
                    activeShape={(sectorProps: Record<string, unknown>) => (
                      <ActiveSectorRenderer {...sectorProps as unknown as ActiveSectorRendererProps} metric={activeMetric} />
                    )}
                    onMouseEnter={(_: unknown, index: number) =>
                      setActiveIndex(index)
                    }
                    onMouseLeave={() => setActiveIndex(null)}
                    animationDuration={200}
                    animationEasing="ease-in-out"
                  >
                    {pieData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.fill}
                        stroke="transparent"
                        opacity={
                          activeIndex === null || activeIndex === i ? 1 : 0.3
                        }
                        style={{ transition: "opacity 0.2s ease" }}
                      />
                    ))}
                  </SafePie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={styles['legend']}>
              {entries.map(({ name, value }, i: number) => {
                const percentage =
                  total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                const color = isStatus
                  ? STATUS_COLORS[name] || COLORS[0]
                  : COLORS[i % COLORS.length];

                return (
                  <div
                    key={name}
                    className={`${styles['legend-layout-row']} ${activeIndex === i ? styles['legend-layout-row-is-active-state'] : ""}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    <span
                      className={styles['legend-dot']}
                      style={{ background: color }}
                    />
                    <span className={styles['legend-name']} title={name}>
                      {name}
                    </span>
                    <span className={styles['legend-value']}>
                      {formatValue(value, activeMetric)}
                    </span>
                    <span className={styles['legend-pct']}>{percentage}%</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles['empty']}>
            {loading ? "Loading..." : "No data yet"}
          </div>
        )}
      </div>
    </div>
  );
}
