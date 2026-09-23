"use client";

/**
 * The run report's two charts:
 *   - score against cost (or latency) per sample — the Pareto frontier in
 *     the accent hue, everyone it dominates in gray (emphasis, not eight
 *     hues on a scatter). Points carry their leaderboard rank and a key
 *     below names them: contestants that score and cost alike sit on top
 *     of each other, and names there collide;
 *   - pass^k against k — how fast "solved every time" falls as k grows
 *     (τ-bench), one line per contestant in its run color, with a legend.
 * The leaderboard table beside them carries every plotted number.
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContestantSummary } from "../../types/benchmarks";
import { duration, money, percent, seriesColor } from "../../utils/benchmarkFormat";
import styles from "./Benchmarks.module.css";

const AXIS_TICK = { fill: "var(--text-muted)", fontSize: 11 };

interface ScatterPoint {
  key: string;
  label: string;
  rank: number;
  x: number;
  y: number;
  frontier: boolean;
}

/** A score axis that starts just below the lowest value, in steps of 10 points: scores bunched at the top stay apart. */
export function scoreDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  const low = Math.max(0, Math.floor((Math.min(...finite) - 0.05) * 10) / 10);
  return [Math.min(low, 0.9), 1];
}

/** Round-numbered ticks over a score domain: 90, 92 … 100 % rather than 92.5 % shown as "93%". */
export function scoreTicks([low, high]: [number, number]): number[] {
  const span = high - low;
  const step = span <= 0.1 ? 0.02 : span <= 0.3 ? 0.05 : span <= 0.6 ? 0.1 : 0.25;
  const count = Math.round(span / step);
  return Array.from({ length: count + 1 }, (_, index) => Math.round((low + index * step) * 1000) / 1000);
}

/** A decade tick as written: $0.001, 10 ms — not $0.0010. */
function decadeLabel(value: number, axis: "cost" | "latency"): string {
  if (axis === "latency") return duration(value);
  return value >= 1 ? money(value) : `$${Number(value.toPrecision(1))}`;
}

/** Decade ticks spanning the values, for a log axis (recharts gives one tick otherwise). */
export function decadeTicks(values: number[]): number[] {
  const positive = values.filter((value) => value > 0 && Number.isFinite(value));
  if (positive.length === 0) return [];
  const from = Math.floor(Math.log10(Math.min(...positive)));
  const to = Math.ceil(Math.log10(Math.max(...positive)));
  return Array.from({ length: Math.max(1, to - from) + 1 }, (_, index) => 10 ** (from + index));
}

function RankLabel(props: { x?: unknown; y?: unknown; value?: unknown; frontier: boolean }) {
  const x = Number(props.x);
  const y = Number(props.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || props.value === null || props.value === undefined) return null;
  return (
    <text x={x + 8} y={y + 4} fontSize={11} fontWeight={600} fill={props.frontier ? "var(--text-primary)" : "var(--text-secondary)"}>
      {String(props.value)}
    </text>
  );
}

function ScatterTooltip({ active, payload, axis }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; axis: "cost" | "latency" }) {
  const point = payload?.[0]?.payload as ScatterPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className={styles["card"]} style={{ padding: "8px 10px", fontSize: "var(--font-size-xs)" }}>
      <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{percent(point.y)}</div>
      <div>{axis === "cost" ? `${money(point.x)} per sample` : `${duration(point.x)} per sample`}</div>
      <div className={styles["muted"]}>
        {point.label}
        {point.frontier ? " · on the frontier" : ""}
      </div>
    </div>
  );
}

export function ParetoChart({ summaries, frontier, axis }: { summaries: ContestantSummary[]; frontier: string[]; axis: "cost" | "latency" }) {
  const points = useMemo<ScatterPoint[]>(
    () =>
      summaries
        .filter((summary) => summary.cases > 0)
        .map((summary) => ({
          key: summary.key,
          label: summary.label,
          rank: summary.rank,
          x: axis === "cost" ? summary.cost.perSample : summary.latency.meanMs,
          y: summary.mean,
          frontier: frontier.includes(summary.key),
        })),
    [summaries, frontier, axis],
  );
  const positive = points.filter((point) => point.x > 0);
  // Costs and latencies span orders of magnitude: a log axis keeps the cheap ones apart.
  const useLog = positive.length === points.length && positive.length > 1 && Math.max(...positive.map((point) => point.x)) / Math.min(...positive.map((point) => point.x)) > 20;
  const onFrontier = points.filter((point) => point.frontier);
  const dominated = points.filter((point) => !point.frontier);
  const ticks = useLog ? decadeTicks(positive.map((point) => point.x)) : undefined;
  const yDomain = scoreDomain(points.map((point) => point.y));

  if (points.length < 2) return null;
  return (
    <figure className={styles["card"]} style={{ margin: 0 }}>
      <figcaption className={styles["field-label"]}>
        Score vs {axis === "cost" ? "cost" : "latency"} per sample
        <span className={styles["muted"]}> — blue: on the frontier (nothing is {axis === "cost" ? "cheaper" : "faster"} and better)</span>
      </figcaption>
      <div style={{ inlineSize: "100%", blockSize: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--bench-grid)" strokeWidth={1} />
            <XAxis
              type="number"
              dataKey="x"
              scale={useLog ? "log" : "auto"}
              domain={useLog && ticks ? [ticks[0], ticks[ticks.length - 1]] : [0, "auto"]}
              {...(ticks && { ticks })}
              tick={AXIS_TICK}
              tickFormatter={(value: number) => (useLog ? decadeLabel(value, axis) : axis === "cost" ? money(value) : duration(value))}
              axisLine={{ stroke: "var(--bench-axis)" }}
              tickLine={false}
              allowDataOverflow={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={yDomain}
              ticks={scoreTicks(yDomain)}
              tick={AXIS_TICK}
              tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
              axisLine={{ stroke: "var(--bench-axis)" }}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<ScatterTooltip axis={axis} />} cursor={false} />
            <Scatter data={dominated} fill="var(--bench-series-other)" stroke="var(--background-surface)" strokeWidth={2} isAnimationActive={false}>
              <LabelList dataKey="rank" content={(props) => <RankLabel {...props} frontier={false} />} />
            </Scatter>
            <Scatter data={onFrontier} fill="var(--bench-series-1)" stroke="var(--background-surface)" strokeWidth={2} isAnimationActive={false}>
              <LabelList dataKey="rank" content={(props) => <RankLabel {...props} frontier />} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ol className={styles["chart-key"]}>
        {[...points]
          .sort((first, second) => first.rank - second.rank)
          .map((point) => (
            <li key={point.key}>
              <span className={styles["chart-key-dot"]} style={{ background: point.frontier ? "var(--bench-series-1)" : "var(--bench-series-other)" }} aria-hidden />
              <span className={styles["chart-key-rank"]}>{point.rank}</span>
              <span className={point.frontier ? undefined : styles["muted"]}>{point.label}</span>
            </li>
          ))}
      </ol>
    </figure>
  );
}

export function PassCurveChart({ summaries, indexOf }: { summaries: ContestantSummary[]; indexOf: (key: string) => number }) {
  const withCurves = summaries.filter((summary) => summary.passCurve.length > 1);
  const data = useMemo(() => {
    const maxK = Math.max(0, ...withCurves.map((summary) => summary.passCurve.length));
    return Array.from({ length: maxK }, (_, index) => {
      const row: Record<string, number> = { k: index + 1 };
      for (const summary of withCurves) {
        const point = summary.passCurve[index];
        if (point) row[summary.key] = point.passHat;
      }
      return row;
    });
  }, [withCurves]);
  if (withCurves.length === 0) return null;
  const passDomain = scoreDomain(withCurves.flatMap((summary) => summary.passCurve.map((point) => point.passHat)));
  return (
    <figure className={styles["card"]} style={{ margin: 0 }}>
      <figcaption className={styles["field-label"]}>
        Reliability — pass^k: every one of k tries passes <span className={styles["muted"]}>(a flat line is a dependable contestant)</span>
      </figcaption>
      <div style={{ inlineSize: "100%", blockSize: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--bench-grid)" strokeWidth={1} vertical={false} />
            <XAxis dataKey="k" tick={AXIS_TICK} axisLine={{ stroke: "var(--bench-axis)" }} tickLine={false} tickFormatter={(value: number) => `k=${value}`} />
            <YAxis
              domain={passDomain}
              ticks={scoreTicks(passDomain)}
              tick={AXIS_TICK}
              tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(value, key) => [percent(Number(value)), withCurves.find((summary) => summary.key === key)?.label ?? String(key)]}
              labelFormatter={(label) => `pass^${String(label)}`}
              contentStyle={{ background: "var(--background-elevated)", border: "1px solid var(--calculated-border-color)", fontSize: 12 }}
              cursor={{ stroke: "var(--bench-axis)", strokeWidth: 1 }}
            />
            <Legend formatter={(key: string) => withCurves.find((summary) => summary.key === key)?.label ?? key} wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
            {withCurves.map((summary) => (
              <Line
                key={summary.key}
                type="linear"
                dataKey={summary.key}
                stroke={seriesColor(indexOf(summary.key))}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: "var(--background-surface)", fill: seriesColor(indexOf(summary.key)) }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
