"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { formatCost } from "@rodrigo-barraza/utilities-library";
import type { BenchmarkModelStat } from "../types/types";
import styles from "./BenchmarkParetoChartComponent.module.css";

/**
 * BenchmarkParetoChartComponent — cost-vs-accuracy scatter across model
 * configs with the Pareto frontier highlighted. A config is on the frontier
 * when no other config passes at least as often for less money — those are
 * the "cheapest at that quality" picks.
 *
 * X: average cost per test (all runs) · Y: pass rate (latest results)
 */

interface ParetoPoint {
  key: string;
  label: string;
  provider: string;
  agent: string | null;
  costPerTest: number;
  passRatePct: number;
  tests: number;
  runCount: number;
  totalCost: number;
  isFrontier: boolean;
}

const FRONTIER_COLOR = "var(--color-success)";
const POINT_COLOR = "var(--accent-primary)";

/** Compact tick label: "Free", "$0.004", "$0.02", "$1.20" — no trailing-zero noise. */
function formatAxisCost(value: number): string {
  if (value === 0) return "Free";
  const decimals = value >= 1 ? 2 : value >= 0.01 ? 2 : value >= 0.001 ? 3 : 4;
  return `$${Number.parseFloat(value.toFixed(decimals))}`;
}

function computePoints(stats: BenchmarkModelStat[]): ParetoPoint[] {
  const points: ParetoPoint[] = stats
    .filter((stat) => stat.total > 0)
    .map((stat) => {
      const runCount = stat.runCount || stat.runs || stat.total;
      return {
        key: `${stat.provider}:${stat.model}:${stat.thinkingEnabled ? "T" : ""}:${stat.toolsEnabled ? "F" : ""}:${stat.agent || ""}`,
        label: stat.label || stat.model,
        provider: stat.provider,
        agent: stat.agent || null,
        costPerTest: runCount > 0 ? stat.totalCost / runCount : 0,
        passRatePct: Math.round(stat.passRate * 1000) / 10,
        tests: stat.total,
        runCount,
        totalCost: stat.totalCost,
        isFrontier: false,
      };
    });

  // Pareto frontier: not dominated by any point that is both cheaper-or-equal
  // and better-or-equal (with at least one strict inequality).
  for (const point of points) {
    point.isFrontier = !points.some(
      (other) =>
        other !== point &&
        other.costPerTest <= point.costPerTest &&
        other.passRatePct >= point.passRatePct &&
        (other.costPerTest < point.costPerTest ||
          other.passRatePct > point.passRatePct),
    );
  }
  return points;
}

interface ParetoTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ParetoPoint }>;
}

function ParetoTooltip({ active, payload }: ParetoTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className={styles["tooltip"]}>
      <div className={styles["tooltip-title"]}>
        {point.agent ? "🤖 " : ""}
        {point.label}
        {point.isFrontier && (
          <span className={styles["tooltip-frontier"]}>Pareto</span>
        )}
      </div>
      <div className={styles["tooltip-rows"]}>
        <span>Pass rate</span>
        <strong>{point.passRatePct}%</strong>
        <span>Cost / test</span>
        <strong>
          {point.costPerTest > 0 ? formatCost(point.costPerTest) : "Free"}
        </strong>
        <span>Tests × runs</span>
        <strong>
          {point.tests} × {point.runCount}
        </strong>
        <span>Total spend</span>
        <strong>{point.totalCost > 0 ? formatCost(point.totalCost) : "—"}</strong>
      </div>
    </div>
  );
}

export default function BenchmarkParetoChartComponent({
  stats,
}: {
  stats: BenchmarkModelStat[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const points = useMemo(() => computePoints(stats), [stats]);
  const frontier = useMemo(
    () =>
      points
        .filter((point) => point.isFrontier)
        .sort((first, second) => first.costPerTest - second.costPerTest),
    [points],
  );

  // Need at least a few points with cost variance for the chart to be useful
  if (points.length < 2) return null;

  const maxCost = Math.max(...points.map((point) => point.costPerTest));

  return (
    <div className={`benchmark-pareto-chart-component ${styles["container"]}`}>
      <button
        type="button"
        className={styles["header"]}
        onClick={() => setCollapsed((previous) => !previous)}
        title={collapsed ? "Expand chart" : "Collapse chart"}
      >
        <TrendingUp size={14} />
        <span className={styles["title"]}>Cost vs. Accuracy</span>
        <span className={styles["subtitle"]}>
          {frontier.length} of {points.length} configs on the Pareto frontier —
          the cheapest at their pass rate
        </span>
      </button>

      {!collapsed && (
        <div className={styles["chart-wrap"]}>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--calculated-border-color)"
              />
              <XAxis
                type="number"
                dataKey="costPerTest"
                name="Cost per test"
                domain={[0, maxCost * 1.15 || 0.001]}
                tickCount={6}
                tickFormatter={formatAxisCost}
                tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                tickMargin={6}
                stroke="var(--calculated-border-color)"
              />
              <YAxis
                type="number"
                dataKey="passRatePct"
                name="Pass rate"
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                stroke="var(--calculated-border-color)"
                width={44}
              />
              <Tooltip
                content={<ParetoTooltip />}
                cursor={{ strokeDasharray: "3 3" }}
              />
              {/* Frontier connector */}
              <Scatter
                data={frontier}
                line={{
                  stroke: FRONTIER_COLOR,
                  strokeWidth: 1.5,
                  strokeDasharray: "5 4",
                }}
                fill="transparent"
                shape={() => <g />}
                isAnimationActive={false}
              />
              {/* All points */}
              <Scatter data={points} isAnimationActive={false}>
                {points.map((point) => (
                  <Cell
                    key={point.key}
                    fill={point.isFrontier ? FRONTIER_COLOR : POINT_COLOR}
                    fillOpacity={point.isFrontier ? 0.95 : 0.55}
                    stroke={point.isFrontier ? FRONTIER_COLOR : "transparent"}
                    strokeWidth={point.isFrontier ? 2 : 0}
                    r={point.isFrontier ? 6 : 4}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {frontier.length > 0 && (
            <div className={styles["frontier-legend"]}>
              {frontier.slice(0, 6).map((point) => (
                <span key={point.key} className={styles["frontier-item"]}>
                  <span className={styles["frontier-dot"]} />
                  {point.agent ? "🤖 " : ""}
                  {point.label}
                  <span className={styles["frontier-meta"]}>
                    {point.passRatePct}% ·{" "}
                    {point.costPerTest > 0
                      ? `${formatCost(point.costPerTest)}/test`
                      : "free"}
                  </span>
                </span>
              ))}
              {frontier.length > 6 && (
                <span className={styles["frontier-more"]}>
                  +{frontier.length - 6} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
