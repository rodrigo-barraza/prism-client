"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Customized,
} from "recharts";
import { SelectComponent } from "@rodrigo-barraza/components-library";
import { Clock } from "lucide-react";
import styles from "./TimelineChartComponent.module.css";
import ChartTabsComponent from "./ChartTabsComponent";
import { formatNumber } from "@rodrigo-barraza/utilities-library";
import { GRANULARITY_TIERS } from "../utils/timelineGranularity";

interface RechartsChartOffset {
  top?: number;
  height?: number;
}

interface RechartsDataPoint {
  x: number;
  y: number;
}

interface RechartsFormattedItem {
  props?: { points?: RechartsDataPoint[] };
  points?: RechartsDataPoint[];
}

interface RechartsCustomizedProps {
  formattedGraphicalItems?: RechartsFormattedItem[];
  offset?: RechartsChartOffset;
}

type RechartsValueType = number | string | readonly (string | number)[];

interface RechartsTooltipPayloadEntry {
  value?: RechartsValueType;
}

interface RechartsTooltipProps {
  active?: boolean;
  payload?: readonly RechartsTooltipPayloadEntry[];
  label?: string | number;
}

interface RechartsDotProps {
  cx?: number;
  cy?: number;
}

interface RechartsTickPayload {
  index: number;
  value: string;
}

interface RechartsTickProps {
  x: string | number;
  y: string | number;
  payload?: RechartsTickPayload;
}

interface TimelineTabDefinition {
  key: string;
  label: string;
  color: string;
  unit: string;
}
const TABS = [
  { key: "requests", label: "Requests", color: "#6366f1", unit: "" },
  { key: "tokens", label: "Tokens", color: "#a855f7", unit: "" },
  { key: "cost", label: "Cost", color: "#f59e0b", unit: "$" },
  { key: "avgLatency", label: "Latency", color: "#ec4899", unit: "ms" },
  { key: "successRate", label: "Success", color: "#10b981", unit: "%" },
];

/**
 * VerticalGridLines — renders thin vertical lines at every data point.
 * Used for 10-min and hourly granularity to visually subdivide the chart
 * without adding extra XAxis labels.
 *
 * Injected via Recharts' <Customized /> component.
 */
function VerticalGridLines(props: RechartsCustomizedProps) {
  const { formattedGraphicalItems, offset } = props;

  const areaItem = formattedGraphicalItems?.[0];
  const points = areaItem?.props?.points || areaItem?.points || [];
  if (points.length < 2) return null;

  const yTop = offset?.top ?? 0;
  const yBottom = yTop + (offset?.height ?? 0);

  return (
    <g className="vertical-grid-lines">
      {points.map((point: RechartsDataPoint, pointIndex: number) => (
        <line
          key={`vg-${pointIndex}`}
          x1={point.x}
          y1={yTop}
          x2={point.x}
          y2={yBottom}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={0.5}
        />
      ))}
    </g>
  );
}

function formatValue(value: RechartsValueType | null | undefined, tab: TimelineTabDefinition): string {
  if (value === null || value === undefined || typeof value !== "number") return "—";
  if (tab.key === "cost") {
    return value >= 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(6)}`;
  }
  if (tab.key === "avgLatency") {
    return value >= 1000
      ? `${(value / 1000).toFixed(1)}s`
      : `${Math.round(value)}ms`;
  }
  if (tab.key === "successRate") {
    return `${value}%`;
  }
  return formatNumber(value);
}

function yTickFormatter(value: number, tabKey: string): string {
  if (tabKey === "cost") return `$${value.toFixed(2)}`;
  if (tabKey === "avgLatency")
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
  if (tabKey === "successRate") return `${value}%`;
  return formatNumber(value);
}

/* Custom tooltip — uses `label` field (always present, e.g. "14:10") */
function ChartTooltipComponent({ active, payload, label, tab }: RechartsTooltipProps & { tab: TimelineTabDefinition }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles['tooltip']}>
      <span className={styles['tooltip-label']}>{label}</span>
      <span className={styles['tooltip-value']} style={{ color: tab.color }}>
        {formatValue(payload[0].value, tab)}
      </span>
    </div>
  );
}

/* Custom glow dot */
function GlowDotComponent({ cx, cy, color }: RechartsDotProps & { color: string }) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r="8" fill={color} opacity="0.2" />
      <circle
        cx={cx}
        cy={cy}
        r="4"
        fill={color}
        stroke="#fff"
        strokeWidth="1.5"
      />
    </g>
  );
}

/**
 * Custom XAxis tick — only renders text when `tickLabel` is non-empty.
 * This keeps the axis sparse for 10-min granularity (label only at hour marks).
 */
function SparseTick({ x, y, payload, data }: RechartsTickProps & { data?: TimelineDataPoint[] }) {
  const entry = data?.[payload?.index ?? 0];
  const text = entry?.tickLabel;
  if (!text) return null;
  return (
    <text x={x} y={Number(y) + 12} textAnchor="middle" fill="#5a6078" fontSize={11}>
      {text}
    </text>
  );
}

/**
 * TimelineChartComponent — tabbed area chart for timeline data.
 *
 * Props:
 *   data     — array of { hour, requests, tokens, cost, avgLatency, successRate, label, tickLabel }
 *   loading  — boolean
 *   height   — chart height in px (default: 260)
 */
interface TimelineDataPoint {
  hour?: string;
  requests?: number;
  tokens?: number;
  cost?: number;
  avgLatency?: number;
  successRate?: number;
  label?: string;
  tickLabel?: string;
}

interface TimelineChartProps {
  data?: TimelineDataPoint[];
  loading?: boolean;
  height?: number;
  title?: string;
  granularity?: string | null;
  defaultGranularity?: string;
  validGranularities?: string[];
  onGranularityChange?: (granularity: string | null) => void;
}

export default function TimelineChartComponent({
  data = [],
  loading = false,
  height = 260,
  title = "Activity Over Time",
  granularity,
  defaultGranularity,
  validGranularities = [],
  onGranularityChange,
}: TimelineChartProps) {
  const [activeTab, setActiveTab] = useState("requests");
  const tab = TABS.find((tabOption) => tabOption.key === activeTab) || TABS[0];

  const gradientId = `timeline-chart-gradient-${tab.key}`;

  const yDomain = useMemo(() => {
    if (tab.key === "successRate") return [0, 100];
    return ["auto", "auto"];
  }, [tab.key]);

  const renderTooltip = useCallback(
    (props: RechartsTooltipProps) => {
      return <ChartTooltipComponent {...props} tab={tab} />;
    },
    [tab],
  );

  const renderDot = useCallback(
    (props: RechartsDotProps) => {
      return <GlowDotComponent {...props} color={tab.color} />;
    },
    [tab],
  );

  // Detect if we have sub-hourly data where we need sparse tick labels
  const hasSubHourBins = useMemo(() => {
    if (!data.length) return false;
    return data[0]?.hour?.includes(":") ?? false;
  }, [data]);

  // For low-density sub-daily data we draw vertical grid lines at every data point.
  // At high density (>50 pts) the lines merge into visual noise, so skip them.
  const needsVerticalGrid = useMemo(() => {
    if (!data.length || data.length > 50) return false;
    const hourLabel = data[0]?.hour || "";
    return hourLabel.length > 10; // any sub-daily granularity
  }, [data]);

  // Custom tick renderer that pulls tickLabel from data
  const renderTick = useCallback(
    (props: RechartsTickProps) => <SparseTick {...props} data={data} />,
    [data],
  );

  const granularityOptions = useMemo(() => {
    if (validGranularities.length < 2) return [];
    const options = [
      { value: "", label: "Auto" },
      ...validGranularities.map((key) => {
        const tier = GRANULARITY_TIERS.find((tierItem) => tierItem.key === key);
        return { value: key, label: tier?.shortLabel || key };
      }),
    ];
    return options;
  }, [validGranularities]);

  const handleGranularityChange = useCallback(
    (value: string) => {
      onGranularityChange?.(value || null);
    },
    [onGranularityChange],
  );

  const isAutoGranularity = !granularity;

  return (
    <div className={`timeline-chart-component ${styles['container']}`}>
      {title && <h2 className={styles['title']}>{title}</h2>}
      <div className={styles['header']}>
        <ChartTabsComponent
          tabs={TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        {granularityOptions.length > 0 && (
          <div className={styles["granularity-picker"]}>
            <SelectComponent
              value={isAutoGranularity ? "" : (granularity || "")}
              options={granularityOptions}
              onChange={handleGranularityChange}
              placeholder="Auto"
              icon={<Clock size={13} />}
              compact
            />
          </div>
        )}
      </div>

      <div className={styles['chart-area']} style={{ height }}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tab.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={tab.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 6"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              {needsVerticalGrid && (
                <Customized component={VerticalGridLines} />
              )}
              <XAxis
                dataKey="label"
                tick={
                  hasSubHourBins
                    ? renderTick
                    : { fill: "#5a6078", fontSize: 11 }
                }
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
                interval={hasSubHourBins ? 0 : "preserveStartEnd"}
              />
              <YAxis
                tick={{ fill: "#5a6078", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => yTickFormatter(value, tab.key)}
                domain={yDomain}
              />
              <Tooltip
                content={renderTooltip}
                cursor={{
                  stroke: `${tab.color}40`,
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              <Area
                type="monotone"
                dataKey={tab.key}
                stroke={tab.color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                activeDot={renderDot}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className={styles['empty']}>
            {loading ? "Loading..." : "No data yet"}
          </div>
        )}
      </div>
    </div>
  );
}
