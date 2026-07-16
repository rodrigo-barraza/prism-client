"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  ChevronDown,
  ListChecks,
  Activity,
  Timer,
  Zap,
  Gauge,
  RotateCcw,
  Coins,
} from "lucide-react";
import { formatCost, formatLatency } from "@rodrigo-barraza/utilities-library";
import type { BenchmarkRunResult } from "../types/types";
import styles from "./BenchmarkAssertionReportComponent.module.css";

/**
 * BenchmarkAssertionReportComponent — per-result inspection card.
 *
 * Shows the metric strip (duration, TTFT, throughput, turns, cost) and the
 * per-assertion pass/fail breakdown, including LLM-judge verdicts with
 * expandable reasoning. Renders nothing for legacy results that lack
 * assertionResults and metrics.
 */
export default function BenchmarkAssertionReportComponent({
  result,
}: {
  result: BenchmarkRunResult;
}) {
  const [expandedJudge, setExpandedJudge] = useState<number | null>(null);

  const assertionResults = result.assertionResults || [];
  const metrics: Array<{ icon: React.ElementType; label: string; value: string }> = [];

  if (result.latency) {
    metrics.push({
      icon: Timer,
      label: "Duration",
      value: formatLatency(result.latency),
    });
  }
  if (result.ttftMs != null && result.ttftMs > 0) {
    metrics.push({
      icon: Zap,
      label: "First Token",
      value:
        result.ttftMs >= 1000
          ? `${(result.ttftMs / 1000).toFixed(2)}s`
          : `${result.ttftMs}ms`,
    });
  }
  if (result.tokensPerSecond && result.tokensPerSecond > 0) {
    metrics.push({
      icon: Gauge,
      label: "Throughput",
      value: `${result.tokensPerSecond.toFixed(1)} tok/s`,
    });
  }
  if (result.turnCount && result.turnCount > 1) {
    metrics.push({
      icon: RotateCcw,
      label: "Turns",
      value: String(result.turnCount),
    });
  }
  const totalCost = (result.estimatedCost || 0) + (result.judgeCost || 0);
  if (totalCost > 0) {
    metrics.push({
      icon: Coins,
      label: result.judgeCost ? "Cost (incl. judge)" : "Cost",
      value: formatCost(totalCost),
    });
  }

  if (assertionResults.length === 0 && metrics.length === 0) return null;

  const passedCount = assertionResults.filter(
    (assertion) => assertion.passed,
  ).length;

  return (
    <div className={`benchmark-assertion-report-component ${styles["container"]}`}>
      {/* ── Metric strip ─────────────────────────────────────── */}
      {metrics.length > 0 && (
        <div className={styles["metrics"]}>
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <span key={metric.label} className={styles["metric"]} title={metric.label}>
                <Icon size={11} />
                <span className={styles["metric-value"]}>{metric.value}</span>
                <span className={styles["metric-label"]}>{metric.label}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Assertion breakdown ──────────────────────────────── */}
      {assertionResults.length > 0 && (
        <div className={styles["assertions"]}>
          <div className={styles["assertions-header"]}>
            <ListChecks size={12} />
            Assertions
            <span
              className={`${styles["assertions-count"]} ${
                passedCount === assertionResults.length
                  ? styles["count-pass"]
                  : styles["count-fail"]
              }`}
            >
              {passedCount}/{assertionResults.length}
            </span>
          </div>
          <div className={styles["assertion-list"]}>
            {assertionResults.map((assertion, index) => {
              const hasJudge = !!assertion.judge;
              const isExpanded = expandedJudge === index;
              return (
                <div key={index} className={styles["assertion-item"]}>
                  <div
                    className={`${styles["assertion-row"]} ${hasJudge ? styles["assertion-row-clickable"] : ""}`}
                    onClick={
                      hasJudge
                        ? () => setExpandedJudge(isExpanded ? null : index)
                        : undefined
                    }
                  >
                    {assertion.error ? (
                      <AlertTriangle
                        size={13}
                        className={styles["icon-error"]}
                      />
                    ) : assertion.passed ? (
                      <CheckCircle2 size={13} className={styles["icon-pass"]} />
                    ) : (
                      <XCircle size={13} className={styles["icon-fail"]} />
                    )}
                    <span className={styles["assertion-kind"]}>
                      {assertion.kind === "text" ? (
                        <ListChecks size={10} />
                      ) : assertion.judge ? (
                        <Scale size={10} />
                      ) : (
                        <Activity size={10} />
                      )}
                    </span>
                    <span className={styles["assertion-label"]} title={assertion.label}>
                      {assertion.label}
                    </span>
                    {assertion.actual && (
                      <span className={styles["assertion-actual"]} title={assertion.actual}>
                        {assertion.actual}
                      </span>
                    )}
                    {hasJudge && (
                      <ChevronDown
                        size={12}
                        className={`${styles["judge-chevron"]} ${isExpanded ? styles["judge-chevron-open"] : ""}`}
                      />
                    )}
                  </div>
                  {assertion.error && (
                    <div className={styles["assertion-error"]}>
                      {assertion.error}
                    </div>
                  )}
                  {hasJudge && isExpanded && (
                    <div className={styles["judge-detail"]}>
                      {assertion.judge!.reasoning && (
                        <p className={styles["judge-reasoning"]}>
                          “{assertion.judge!.reasoning}”
                        </p>
                      )}
                      <div className={styles["judge-meta"]}>
                        {assertion.judge!.score != null && (
                          <span>Score {assertion.judge!.score}/10</span>
                        )}
                        {assertion.judge!.model && (
                          <span>Judge: {assertion.judge!.model}</span>
                        )}
                        {assertion.judge!.cost != null &&
                          assertion.judge!.cost > 0 && (
                            <span>{formatCost(assertion.judge!.cost)}</span>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
