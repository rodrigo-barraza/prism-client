"use client";

/**
 * Small pieces every benchmark view shares: a contestant's name with its
 * color key, a score with its 95 % interval, a run's status.
 */
import type { ReactNode } from "react";
import { Bot, Cpu } from "lucide-react";
import { BadgeComponent, ProgressBarComponent, TooltipComponent } from "@rodrigo-barraza/components-library";
import type { Interval, RunProgress, RunStatus } from "../../types/benchmarks";
import { interval, percent, RUN_STATUS_LABELS, runStatusVariant, seriesColor } from "../../utils/benchmarkFormat";
import styles from "./Benchmarks.module.css";

export function ContestantName({
  label,
  index,
  kind,
  sub,
}: {
  label: string;
  /** The contestant's position in its run (its color); omitted: no swatch. */
  index?: number;
  kind?: "model" | "agent";
  sub?: ReactNode;
}) {
  return (
    <span className={styles["contestant"]}>
      {index !== undefined && <span className={styles["swatch"]} style={{ background: seriesColor(index) }} aria-hidden />}
      {kind === "agent" ? <Bot size={13} aria-label="agent" /> : kind === "model" ? <Cpu size={13} aria-label="model" /> : null}
      <span>
        <span className={styles["contestant-label"]} title={label}>
          {label}
        </span>
        {sub && <span className={styles["contestant-sub"]}>{sub}</span>}
      </span>
    </span>
  );
}

/**
 * A score on a shared 0–100 % axis: the point and its 95 % interval.
 * The numbers are always printed beside it; this only shows the shape.
 */
export function IntervalBar({ value, ci, color }: { value: number; ci: Interval; color: string }) {
  const clamp = (number: number) => Math.max(0, Math.min(1, number)) * 100;
  return (
    <TooltipComponent label={`${percent(value)} · 95% CI ${interval(ci, 1)}`}>
      <span className={styles["interval"]} role="img" aria-label={`${percent(value)}, 95% interval ${interval(ci)}`}>
        <span className={styles["interval-track"]} />
        <span
          className={styles["interval-range"]}
          style={{ insetInlineStart: `${clamp(ci.low)}%`, inlineSize: `${Math.max(0.5, clamp(ci.high) - clamp(ci.low))}%`, background: color }}
        />
        <span className={styles["interval-point"]} style={{ insetInlineStart: `${clamp(value)}%`, background: color }} />
      </span>
    </TooltipComponent>
  );
}

export function RunStatusBadge({ status, reason }: { status: RunStatus; reason?: string | null }) {
  return (
    <BadgeComponent variant={runStatusVariant(status)} tooltip={reason ?? undefined}>
      {RUN_STATUS_LABELS[status]}
    </BadgeComponent>
  );
}

/** Samples done of total (and judge battles or a regrade when those are running). */
export function RunProgressLine({ progress, status }: { progress: RunProgress; status: RunStatus }) {
  const regrading = typeof progress.regradeTotal === "number" && progress.regradeTotal > 0;
  const judging = status === "judging" && !regrading && progress.battlesTotal > 0;
  const [done, total, noun] = regrading
    ? [progress.regradeDone ?? 0, progress.regradeTotal ?? 0, "regraded"]
    : judging
      ? [progress.battlesDone, progress.battlesTotal, "battles judged"]
      : [progress.done + progress.errored, progress.total, "samples"];
  const value = total > 0 ? done / total : 0;
  return (
    <span className={styles["row"]} style={{ minInlineSize: 180 }}>
      <span style={{ flex: 1, minInlineSize: 100 }}>
        <ProgressBarComponent value={value * 100} size="sm" animated={status === "running" || status === "judging"} />
      </span>
      <span className={styles["small"]}>
        {done}/{total} {noun}
        {progress.errored > 0 && !regrading && !judging ? ` · ${progress.errored} errored` : ""}
      </span>
    </span>
  );
}

export function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className={styles["tile"]}>
      <span className={styles["tile-label"]}>{label}</span>
      <span className={styles["tile-value"]}>{value}</span>
      {detail && <span className={styles["tile-detail"]}>{detail}</span>}
    </div>
  );
}
