"use client";

/**
 * Cases × contestants: every cell a contestant's mean score on a case
 * (shaded by the score, one hue), its passes over epochs, and a mark for
 * errors. Filters find the cases that matter — where contestants
 * disagree, where everyone failed, where a contestant is flaky.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { SearchInputComponent, SegmentedControlComponent } from "@rodrigo-barraza/components-library";
import type { BenchmarkRun, BenchmarkSample, CaseRow, RunReport } from "../../types/benchmarks";
import { heatFill, percent, seriesColor } from "../../utils/benchmarkFormat";
import styles from "./Benchmarks.module.css";

type Filter = "all" | "disagree" | "failed" | "flaky" | "errors";
type Sort = "suite" | "discrimination" | "hardest";

export default function CaseMatrixComponent({
  run,
  report,
  suiteId,
  samples,
  onOpenCase,
}: {
  run: BenchmarkRun;
  report: RunReport;
  suiteId: string;
  samples: BenchmarkSample[];
  onOpenCase: (suiteId: string, caseId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("suite");
  const [search, setSearch] = useState("");
  const suite = report.suites.find((candidate) => candidate.suiteId === suiteId);

  const errors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sample of samples) {
      if (sample.suiteId !== suiteId || sample.status !== "error") continue;
      const key = `${sample.caseId}\u0000${sample.contestantKey}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [samples, suiteId]);

  const rows = useMemo(() => {
    if (!suite) return [];
    const needle = search.trim().toLowerCase();
    const keys = run.contestants.map((contestant) => contestant.key);
    const matches = (row: CaseRow) => {
      if (needle && !`${row.caseId} ${row.input} ${row.tags.join(" ")}`.toLowerCase().includes(needle)) return false;
      const tallies = keys.map((key) => row.passes[key]).filter(Boolean);
      switch (filter) {
        case "disagree":
          return row.discrimination > 0;
        case "failed":
          return tallies.length > 0 && tallies.every(([passed]) => passed === 0);
        case "flaky":
          return tallies.some(([passed, counted]) => passed > 0 && passed < counted);
        case "errors":
          return keys.some((key) => errors.has(`${row.caseId}\u0000${key}`));
        default:
          return true;
      }
    };
    const filtered = suite.caseRows.filter(matches);
    const meanOf = (row: CaseRow) => {
      const values = Object.values(row.scores).filter((value): value is number => value !== null);
      return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
    };
    if (sort === "discrimination") return [...filtered].sort((first, second) => second.discrimination - first.discrimination);
    if (sort === "hardest") return [...filtered].sort((first, second) => meanOf(first) - meanOf(second));
    return filtered;
  }, [suite, search, filter, sort, errors, run.contestants]);

  if (!suite) return null;
  const epochs = run.settings.epochs;

  return (
    <div className={styles["section"]}>
      <div className={styles["toolbar"]}>
        <SegmentedControlComponent
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          segments={[
            { value: "all", label: `All (${suite.caseRows.length})` },
            { value: "disagree", label: "Disagreements" },
            { value: "failed", label: "Everyone failed" },
            ...(epochs > 1 ? [{ value: "flaky", label: "Flaky" }] : []),
            { value: "errors", label: "Errors" },
          ]}
          compact
        />
        <select className={styles["native-select"]} style={{ inlineSize: "auto" }} value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort cases">
          <option value="suite">Suite order</option>
          <option value="discrimination">Most separating first</option>
          <option value="hardest">Hardest first</option>
        </select>
        <div style={{ minInlineSize: 200 }}>
          <SearchInputComponent value={search} onChange={setSearch} placeholder="Find a case" compact />
        </div>
        <span className={`${styles["small"]} ${styles["muted"]}`}>{rows.length} shown</span>
      </div>
      <div className={styles["table-scroll"]} style={{ maxBlockSize: "70vh" }}>
        <table className={styles["table"]}>
          <thead>
            <tr>
              <th>Case</th>
              {run.contestants.map((contestant, index) => (
                <th key={contestant.key} className={styles["numeric"]} title={contestant.label}>
                  <span className={styles["contestant"]} style={{ justifyContent: "flex-end" }}>
                    <span className={styles["swatch"]} style={{ background: seriesColor(index) }} aria-hidden />
                    <span className={styles["contestant-label"]} style={{ maxInlineSize: 120 }}>
                      {contestant.label}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.caseId}
                className={styles["clickable-row"]}
                tabIndex={0}
                onClick={() => onOpenCase(suiteId, row.caseId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpenCase(suiteId, row.caseId);
                }}
              >
                <td style={{ maxInlineSize: 440 }}>
                  <div className={styles["mono"]} style={{ fontSize: "var(--font-size-xs)" }}>
                    {row.caseId}
                    {row.tags.length > 0 && <span className={styles["muted"]}> · {row.tags.join(", ")}</span>}
                  </div>
                  <div className={styles["contestant-label"]} style={{ maxInlineSize: 440, color: "var(--text-secondary)" }} title={row.input}>
                    {row.input}
                  </div>
                </td>
                {run.contestants.map((contestant) => {
                  const score = row.scores[contestant.key];
                  const tally = row.passes[contestant.key];
                  const errored = errors.get(`${row.caseId}\u0000${contestant.key}`) ?? 0;
                  const passedAll = tally && tally[0] === tally[1];
                  const passedNone = tally && tally[0] === 0;
                  return (
                    <td
                      key={contestant.key}
                      className={styles["numeric"]}
                      style={{ background: heatFill(score) }}
                      title={
                        score === null || score === undefined
                          ? "not scored"
                          : `${percent(score)} · passed ${tally?.[0] ?? 0} of ${tally?.[1] ?? 0}${errored ? ` · ${errored} errored` : ""}`
                      }
                    >
                      <span className={styles["row"]} style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                        {errored > 0 && <AlertTriangle size={12} aria-label="errored" style={{ color: "var(--bench-warn)" }} />}
                        {score === null || score === undefined ? (
                          <span className={styles["muted"]}>—</span>
                        ) : passedAll ? (
                          <Check size={13} aria-label="passed" />
                        ) : passedNone ? (
                          <X size={13} aria-label="failed" />
                        ) : null}
                        {score !== null && score !== undefined && (epochs > 1 && tally ? `${tally[0]}/${tally[1]}` : percent(score, 0))}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
