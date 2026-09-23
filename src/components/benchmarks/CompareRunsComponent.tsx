"use client";

/**
 * /benchmarks/compare?base=&head= — what changed between two runs: per
 * suite and contestant they share, the paired difference on the cases
 * both evaluated (with its interval and test), and the cases that
 * improved or regressed.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitCompareArrows } from "lucide-react";
import { LoadingStateComponent, PageHeroComponent, SegmentedControlComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi from "../../services/BenchmarkApi";
import type { RunComparison, RunListItem } from "../../types/benchmarks";
import { diffInterval, divergingFill, percent, points, pValue, relativeTime } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import styles from "./Benchmarks.module.css";

export default function CompareRunsComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const base = searchParams.get("base") ?? "";
  const head = searchParams.get("head") ?? "";
  const [runs, setRuns] = useState<RunListItem[]>([]);
  /** The comparison and the pair it is of — a stale one (another pair) reads as loading. */
  const [loaded, setLoaded] = useState<{ pair: string; comparison: RunComparison | null; error: string | null } | null>(null);
  const pairKey = `${base}|${head}`;
  const comparison = loaded?.pair === pairKey ? loaded.comparison : null;
  const error = loaded?.pair === pairKey ? loaded.error : null;
  const [changeFilter, setChangeFilter] = useState<"regressed" | "improved" | "all">("regressed");

  useEffect(() => {
    BenchmarkApi.runs({ limit: 200 })
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);

  useEffect(() => {
    if (!base || !head) return;
    const pair = `${base}|${head}`;
    BenchmarkApi.compare(base, head)
      .then((result) => setLoaded({ pair, comparison: result, error: null }))
      .catch((caught) => setLoaded({ pair, comparison: null, error: getErrorMessage(caught) }));
  }, [base, head]);

  const labels = useMemo(() => new Map(comparison?.deltas.map((delta) => [delta.contestantKey, delta.label]) ?? []), [comparison]);
  const cases = (comparison?.cases ?? []).filter((entry) => changeFilter === "all" || entry.change === changeFilter);
  const pick = (which: "base" | "head", id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(which, id);
    router.replace(`/benchmarks/compare?${params}`);
  };
  const runSelect = (which: "base" | "head", value: string) => (
    <select className={styles["native-select"]} style={{ maxInlineSize: 420 }} value={value} onChange={(event) => pick(which, event.target.value)} aria-label={which === "base" ? "Before" : "After"}>
      <option value="">Pick a run…</option>
      {runs.map((run) => (
        <option key={run.id} value={run.id}>
          {run.name} · {relativeTime(run.createdAt)}
        </option>
      ))}
    </select>
  );

  return (
    <div className={`${styles["theme"]} ${styles["page"]}`}>
      <PageHeroComponent variant="row" icon={GitCompareArrows} title="Compare runs" subtitle="The same contestants on the same cases, before and after: which differences are real, and which cases moved." />
      <div className={styles["toolbar"]}>
        <span className={styles["field-label"]}>Before</span>
        {runSelect("base", base)}
        <span className={styles["field-label"]}>After</span>
        {runSelect("head", head)}
      </div>
      {error && <p className={styles["error-text"]}>{error}</p>}
      {base && head && !comparison && !error && <LoadingStateComponent message="Comparing…" />}
      {comparison && (
        <>
          {comparison.deltas.length === 0 ? (
            <div className={`${styles["card"]} ${styles["empty"]}`}>These runs share no suite with a common contestant.</div>
          ) : (
            <div className={styles["table-scroll"]}>
              <table className={styles["table"]}>
                <thead>
                  <tr>
                    <th>Contestant</th>
                    <th>Suite</th>
                    <th className={styles["numeric"]}>Before</th>
                    <th className={styles["numeric"]}>After</th>
                    <th className={styles["numeric"]}>Change</th>
                    <th>95% interval</th>
                    <th className={styles["numeric"]}>Cases ↑ / ↓</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.deltas.map((delta) => (
                    <tr key={`${delta.suiteId}-${delta.contestantKey}`}>
                      <td>{delta.label}</td>
                      <td>{delta.suiteName}</td>
                      <td className={styles["numeric"]}>{percent(delta.base)}</td>
                      <td className={styles["numeric"]}>{percent(delta.head)}</td>
                      <td className={styles["numeric"]} style={{ background: divergingFill(delta.diff), fontWeight: 600 }}>
                        {points(delta.diff)}
                      </td>
                      <td className={styles["small"]}>{diffInterval(delta.ci)}</td>
                      <td className={styles["numeric"]}>
                        {delta.improved} / {delta.regressed}
                      </td>
                      <td className={styles["small"]}>{delta.significant ? `real change (${pValue(delta.pValue)})` : "within noise"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <section className={styles["section"]}>
            <div className={styles["section-header"]}>
              <h2 className={styles["section-title"]}>Cases that moved</h2>
              <SegmentedControlComponent
                value={changeFilter}
                onChange={(value) => setChangeFilter(value as typeof changeFilter)}
                segments={[
                  { value: "regressed", label: "Regressed" },
                  { value: "improved", label: "Improved" },
                  { value: "all", label: "All changes" },
                ]}
                compact
              />
            </div>
            {cases.length === 0 ? (
              <div className={`${styles["card"]} ${styles["empty"]}`}>None.</div>
            ) : (
              <div className={styles["table-scroll"]} style={{ maxBlockSize: "60vh" }}>
                <table className={styles["table"]}>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Contestant</th>
                      <th className={styles["numeric"]}>Before → after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((entry) => (
                      <tr
                        key={`${entry.suiteId}-${entry.caseId}-${entry.contestantKey}`}
                        className={styles["clickable-row"]}
                        tabIndex={0}
                        onClick={() => router.push(`/benchmarks/runs/${comparison.head.id}`)}
                      >
                        <td>
                          <div className={styles["mono"]} style={{ fontSize: "var(--font-size-xs)" }}>
                            {entry.caseId}
                          </div>
                          <div className={styles["contestant-label"]} style={{ maxInlineSize: 520, color: "var(--text-secondary)" }} title={entry.input}>
                            {entry.input}
                          </div>
                        </td>
                        <td>{labels.get(entry.contestantKey) ?? entry.contestantKey}</td>
                        <td className={styles["numeric"]}>
                          {entry.base === null ? "new" : percent(entry.base, 0)} → {entry.head === null ? "missing" : percent(entry.head, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
