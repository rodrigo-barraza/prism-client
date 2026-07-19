"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Gauge,
  Coins,
  Wrench,
  ArrowDownUp,
} from "lucide-react";
import { formatCost, formatLatency } from "@rodrigo-barraza/utilities-library";
import { SegmentedControlComponent } from "@rodrigo-barraza/components-library";
import { MarkdownContentComponent } from "@rodrigo-barraza/components-library";
import type { BenchmarkRunResult } from "../types/types";
import styles from "./BenchmarkCompareComponent.module.css";

/**
 * BenchmarkCompareComponent — side-by-side comparison of a run's results.
 *
 * One column per result: verdict, metrics, tool usage, assertion breakdown,
 * and the full response, aligned horizontally for direct comparison.
 * Sortable by run order, pass/fail, speed, or cost.
 */

type SortKey = "order" | "passed" | "latency" | "cost";

const SORT_SEGMENTS = [
  { value: "order", label: "Run Order" },
  { value: "passed", label: "Pass First" },
  { value: "latency", label: "Fastest" },
  { value: "cost", label: "Cheapest" },
];

export default function BenchmarkCompareComponent({
  results,
}: {
  results: BenchmarkRunResult[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("passed");

  const sorted = useMemo(() => {
    const list = [...results];
    switch (sortKey) {
      case "passed":
        return list.sort(
          (first, second) =>
            Number(!!second.passed) - Number(!!first.passed) ||
            (first.latency || 0) - (second.latency || 0),
        );
      case "latency":
        return list.sort(
          (first, second) =>
            (first.latency || Number.MAX_VALUE) -
            (second.latency || Number.MAX_VALUE),
        );
      case "cost":
        return list.sort(
          (first, second) =>
            (first.estimatedCost || 0) +
            (first.judgeCost || 0) -
            ((second.estimatedCost || 0) + (second.judgeCost || 0)),
        );
      default:
        return list;
    }
  }, [results, sortKey]);

  if (results.length === 0) return null;

  return (
    <div className={`benchmark-compare-component ${styles["container"]}`}>
      <div className={styles["toolbar"]}>
        <span className={styles["toolbar-label"]}>
          <ArrowDownUp size={12} />
          Sort
        </span>
        <SegmentedControlComponent
          value={sortKey}
          onChange={(value: string) => setSortKey(value as SortKey)}
          segments={SORT_SEGMENTS}
          compact
        />
      </div>

      <div className={styles["columns"]}>
        {sorted.map((result, index) => {
          const totalCost =
            (result.estimatedCost || 0) + (result.judgeCost || 0);
          const assertionResults = result.assertionResults || [];
          const passedAssertions = assertionResults.filter(
            (assertion) => assertion.passed,
          ).length;
          return (
            <div
              key={`${result.provider}:${result.label}:${index}`}
              className={`${styles["column"]} ${
                result.error
                  ? styles["column-error"]
                  : result.passed
                    ? styles["column-pass"]
                    : styles["column-fail"]
              }`}
            >
              {/* Column header */}
              <div className={styles["column-header"]}>
                {result.error ? (
                  <AlertTriangle size={14} className={styles["icon-error"]} />
                ) : result.passed ? (
                  <CheckCircle2 size={14} className={styles["icon-pass"]} />
                ) : (
                  <XCircle size={14} className={styles["icon-fail"]} />
                )}
                <span className={styles["column-title"]} title={result.label}>
                  {result.label || result.model}
                </span>
                {!!result.trial && !!result.trialCount && result.trialCount > 1 && (
                  <span className={styles["trial-chip"]}>
                    T{result.trial}/{result.trialCount}
                  </span>
                )}
              </div>
              <div className={styles["column-provider"]}>{result.provider}</div>

              {/* Metrics */}
              <div className={styles["metrics"]}>
                {!!result.latency && (
                  <span title="Duration">
                    <Timer size={10} />
                    {formatLatency(result.latency)}
                  </span>
                )}
                {!!result.tokensPerSecond && result.tokensPerSecond > 0 && (
                  <span title="Throughput">
                    <Gauge size={10} />
                    {result.tokensPerSecond.toFixed(1)} t/s
                  </span>
                )}
                {totalCost > 0 && (
                  <span title="Cost">
                    <Coins size={10} />
                    {formatCost(totalCost)}
                  </span>
                )}
                {(result.toolNames?.length || 0) > 0 && (
                  <span title={`Tools: ${result.toolNames!.join(", ")}`}>
                    <Wrench size={10} />
                    {result.toolNames!.length}
                  </span>
                )}
              </div>

              {/* Assertion summary */}
              {assertionResults.length > 0 && (
                <div className={styles["assertions"]}>
                  {assertionResults.map((assertion, assertionIndex) => (
                    <span
                      key={assertionIndex}
                      className={`${styles["assertion-chip"]} ${
                        assertion.passed
                          ? styles["assertion-chip-pass"]
                          : styles["assertion-chip-fail"]
                      }`}
                      title={`${assertion.passed ? "✓" : "✗"} ${assertion.label}${assertion.actual ? ` — ${assertion.actual}` : ""}`}
                    >
                      {assertion.passed ? "✓" : "✗"} {assertion.label}
                    </span>
                  ))}
                  <span className={styles["assertion-total"]}>
                    {passedAssertions}/{assertionResults.length}
                  </span>
                </div>
              )}

              {/* Response body */}
              <div className={styles["response"]}>
                {result.error ? (
                  <div className={styles["error-text"]}>{result.error}</div>
                ) : result.response ? (
                  <MarkdownContentComponent content={result.response} />
                ) : (
                  <div className={styles["empty-text"]}>No response</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
