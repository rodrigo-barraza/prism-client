import { useMemo, useCallback } from "react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import {
  benchmarkStatusColumn,
  benchmarkModelColumn,
  benchmarkToolsColumn,
  benchmarkThinkingColumn,
  benchmarkSizeColumn,
  benchmarkResponseColumn,
  benchmarkLatencyColumn,
  benchmarkDurationColumn,
  benchmarkTokensInColumn,
  benchmarkTokensOutColumn,
  benchmarkTokPerSecColumn,
  benchmarkCostColumn,
  benchmarkDateColumn,
  benchmarkMatchModeColumn,
} from "../utils/tableColumns";
import type { BenchmarkRunResult } from "../types/types";
import styles from "./BenchmarksTableComponent.module.css";

interface ActiveModelEntry {
  model: { provider: string; model: string; label?: string };
  progress: number;
  phase: string;
}

interface PendingTarget {
  provider: string;
  model: string;
  display_name?: string;
}

interface BenchmarkDisplayRow extends Partial<BenchmarkRunResult> {
  _running?: boolean;
  _pending?: boolean;
  _progress?: number;
  _phase?: string;
}

interface BenchmarksTableComponentProps {
  results?: BenchmarkRunResult[];
  expectedValue?: string;
  modelConfigMap?: Record<string, Record<string, unknown>>;
  emptyText?: string;
  mini?: boolean;
  title?: React.ReactNode;
  maxHeight?: number;
  sortKey?: string;
  sortDir?: string;
  onSort?: (key: string, direction: string) => void;
  onRowClick?: (row: BenchmarkRunResult | BenchmarkDisplayRow) => void;
  activeRowKey?: string;
  activeModels?: Map<string, ActiveModelEntry>;
  pendingTargets?: PendingTarget[];
}

/**
 * BenchmarksTableComponent — reusable table for displaying benchmark run
 * results (per-model pass/fail, response, latency, throughput, cost).
 *
 * Eager row population: when `pendingTargets` is provided, all model
 * rows are shown immediately (as "Queued"). Completed results replace
 * their pending counterparts, concurrently-running models each show
 * their own progress bar, and remaining targets appear dimmed with a
 * queued indicator.
 *
 * Supports concurrent model execution: `activeModels` is a Map keyed
 * by "provider:model" → { model, progress, phase }. Multiple models
 * from different provider buckets can run simultaneously.
 */
export default function BenchmarksTableComponent({
  results = [],
  expectedValue,
  modelConfigMap = {},
  emptyText = "No results",
  mini = false,
  title,
  maxHeight,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  activeRowKey,
  activeModels = new Map(),
  pendingTargets = [],
}: BenchmarksTableComponentProps) {
  const columns = useMemo(
    () => [
      benchmarkStatusColumn(),
      benchmarkModelColumn(),
      benchmarkToolsColumn(),
      benchmarkThinkingColumn(),
      benchmarkSizeColumn({ modelConfigMap }),
      benchmarkMatchModeColumn(),
      benchmarkResponseColumn({ expectedValue }),
      benchmarkDurationColumn(),
      benchmarkLatencyColumn(),
      benchmarkTokensInColumn(),
      benchmarkTokensOutColumn(),
      benchmarkTokPerSecColumn(),
      benchmarkCostColumn(),
      benchmarkDateColumn(),
    ],
    [expectedValue, modelConfigMap],
  );

  // Build display data: completed results + active running rows + queued pending rows
  const displayData = useMemo(() => {
    // No pending targets — fall back to simple results-only mode
    if (!pendingTargets.length) {
      if (activeModels.size === 0) return results;
      // Append synthetic running rows for all active models
      const runningRows: BenchmarkDisplayRow[] = [...activeModels.values()].map((entry) => ({
        _running: true,
        _progress: entry.progress,
        _phase: entry.phase,
        provider: entry.model.provider,
        model: entry.model.model,
        label: entry.model.label || entry.model.model,
      }));
      return [...results, ...runningRows];
    }

    // Eager population: build a row for every target
    // Track which targets have completed results by index (order-preserving)
    const rows: BenchmarkDisplayRow[] = [];
    const completedByIndex = new Map<number, BenchmarkRunResult>();

    // Map completed results back to their target index by matching provider + model/display_name
    // Results arrive in order, so the i-th result of a given provider:model corresponds
    // to the i-th target with that same provider:model.
    const targetCounters = new Map<string, number[]>();
    const resultCounters = new Map<string, number>();

    // First pass: count how many times each target key appears
    for (let targetIndex = 0; targetIndex < pendingTargets.length; targetIndex++) {
      const benchmarkTarget = pendingTargets[targetIndex];
      const targetKey = `${benchmarkTarget.provider}:${benchmarkTarget.model}`;
      if (!targetCounters.has(targetKey)) targetCounters.set(targetKey, []);
      targetCounters.get(targetKey)!.push(targetIndex);
    }

    // Map each result to its target index
    for (const result of results) {
      const resultKey = `${result.provider}:${result.model}`;
      const count = resultCounters.get(resultKey) || 0;
      const indices = targetCounters.get(resultKey);
      if (indices && count < indices.length) {
        completedByIndex.set(indices[count], result);
      }
      resultCounters.set(resultKey, count + 1);
    }

    for (let targetIndex = 0; targetIndex < pendingTargets.length; targetIndex++) {
      const target = pendingTargets[targetIndex];

      // Check if this target has a completed result
      if (completedByIndex.has(targetIndex)) {
        rows.push(completedByIndex.get(targetIndex)!);
        continue;
      }

      // Check if this target matches any concurrently-running model
      const modelKey = `${target.provider}:${target.model}`;
      const activeEntry = activeModels.get(modelKey);

      if (activeEntry) {
        // Verify it's the right instance (first unfinished one for this key)
        const completedCount = resultCounters.get(modelKey) || 0;
        const indices = targetCounters.get(modelKey);
        const isActiveInstance =
          indices && indices.indexOf(targetIndex) === completedCount;

        if (isActiveInstance) {
          rows.push({
            _running: true,
            _progress: activeEntry.progress,
            _phase: activeEntry.phase,
            provider: activeEntry.model.provider,
            model: activeEntry.model.model,
            label: activeEntry.model.label || activeEntry.model.model,
          });
          continue;
        }
      }

      // Pending/queued
      rows.push({
        _pending: true,
        provider: target.provider,
        model: target.model,
        label: target.display_name || target.model,
      });
    }

    return rows;
  }, [results, activeModels, pendingTargets]);

  // Assign a CSS class for running/pending rows
  const getRowClassName = useCallback((row: BenchmarkDisplayRow) => {
    if (row._running) return styles['running-layout-row'];
    if (row._pending) return styles['pending-layout-row'];
    return "";
  }, []);

  // Build a custom style variable for progress width on running rows
  const getRowStyle = useCallback((row: BenchmarkDisplayRow) => {
    if (!row._running) return {};
    return {
      "--progress": `${(row._progress || 0) * 100}%`,
    } as React.CSSProperties;
  }, []);

  return (
    <TableComponent
      className="benchmarks-table-component"
      title={title}
      maxHeight={maxHeight}
      columns={columns}
      data={displayData}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      onRowClick={onRowClick}
      activeRowKey={activeRowKey}
      getRowKey={(row: BenchmarkDisplayRow, index: number) => `${row.provider}:${row.label}:${index}`}
      getRowClassName={getRowClassName}
      getRowStyle={getRowStyle}
      emptyText={emptyText}
      mini={mini}
      storageKey="benchmarks"
    />
  );
}
