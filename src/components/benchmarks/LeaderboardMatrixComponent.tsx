"use client";

/**
 * Every contestant's latest result on every suite, across runs: a
 * contestants × suites matrix, each cell a score with its 95 % interval,
 * shaded by the score (one hue). Cells come from different runs — the
 * paired statistics live on each run's page.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownWideNarrow, Info } from "lucide-react";
import { LoadingStateComponent, SearchInputComponent, SegmentedControlComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi from "../../services/BenchmarkApi";
import type { Leaderboard } from "../../types/benchmarks";
import { heatFill, interval, percent, relativeTime } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import { ContestantName } from "./BenchmarkBits";
import styles from "./Benchmarks.module.css";

type KindFilter = "all" | "model" | "agent";

export default function LeaderboardMatrixComponent() {
  const router = useRouter();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sortBy, setSortBy] = useState<string>("average");

  useEffect(() => {
    BenchmarkApi.leaderboard()
      .then(setBoard)
      .catch((caught) => setError(getErrorMessage(caught)));
  }, []);

  const rows = useMemo(() => {
    if (!board) return [];
    const needle = search.trim().toLowerCase();
    return board.contestants
      .filter((contestant) => kind === "all" || contestant.kind === kind)
      .filter((contestant) => !needle || `${contestant.label} ${contestant.model} ${contestant.agent ?? ""}`.toLowerCase().includes(needle))
      .map((contestant) => {
        const cells = board.suites.map((suite) => board.cells[suite.id]?.[contestant.key] ?? null);
        const present = cells.filter((cell): cell is NonNullable<typeof cell> => cell !== null);
        const average = present.length > 0 ? present.reduce((sum, cell) => sum + cell.mean, 0) / present.length : null;
        return { contestant, cells, average, coverage: present.length };
      })
      .sort((first, second) => {
        const value = (row: typeof first) =>
          sortBy === "average" ? row.average : (row.cells[board.suites.findIndex((suite) => suite.id === sortBy)]?.mean ?? null);
        return (value(second) ?? -1) - (value(first) ?? -1);
      });
  }, [board, search, kind, sortBy]);

  if (error) return <p className={styles["error-text"]}>Could not load the leaderboard: {error}</p>;
  if (!board) return <LoadingStateComponent message="Loading the leaderboard…" />;
  if (board.contestants.length === 0) {
    return <div className={`${styles["card"]} ${styles["empty"]}`}>The leaderboard fills in as runs complete: every contestant&apos;s latest score on every suite.</div>;
  }

  const sortHeader = (key: string, label: string) => (
    <button type="button" className={styles["sort-button"]} onClick={() => setSortBy(key)} aria-pressed={sortBy === key}>
      {label}
      {sortBy === key && <ArrowDownWideNarrow size={12} aria-label="sorted" />}
    </button>
  );

  return (
    <div className={styles["section"]}>
      <div className={styles["toolbar"]}>
        <div style={{ minInlineSize: 220 }}>
          <SearchInputComponent value={search} onChange={setSearch} placeholder="Filter contestants" />
        </div>
        <SegmentedControlComponent
          value={kind}
          onChange={(value) => setKind(value as KindFilter)}
          segments={[
            { value: "all", label: "All" },
            { value: "model", label: "Models" },
            { value: "agent", label: "Agents" },
          ]}
          compact
        />
        <span className={styles["spacer"]} />
        <span className={`${styles["small"]} ${styles["muted"]}`}>
          <Info size={12} style={{ verticalAlign: "-2px" }} /> Each cell is the latest run of that contestant on that suite; compare contestants inside one run for paired tests.
        </span>
      </div>
      <div className={styles["table-scroll"]}>
        <table className={styles["table"]}>
          <thead>
            <tr>
              <th>Contestant</th>
              <th className={styles["numeric"]}>{sortHeader("average", "Average")}</th>
              {board.suites.map((suite) => (
                <th key={suite.id} className={styles["numeric"]} title={`${suite.name} · ${suite.runs} run${suite.runs === 1 ? "" : "s"}`}>
                  {sortHeader(suite.id, suite.name.length > 22 ? `${suite.name.slice(0, 22)}…` : suite.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ contestant, cells, average, coverage }) => (
              <tr key={contestant.key}>
                <td>
                  <ContestantName
                    label={contestant.label}
                    kind={contestant.kind}
                    sub={`${contestant.runs} run${contestant.runs === 1 ? "" : "s"} · last ${relativeTime(contestant.lastRunAt)}`}
                  />
                </td>
                <td className={styles["numeric"]}>
                  {average === null ? "—" : percent(average)}
                  {coverage < board.suites.length && average !== null && (
                    <div className={`${styles["small"]} ${styles["muted"]}`}>
                      {coverage}/{board.suites.length} suites
                    </div>
                  )}
                </td>
                {cells.map((cell, index) =>
                  cell ? (
                    <td
                      key={board.suites[index].id}
                      className={`${styles["numeric"]} ${styles["clickable-row"]}`}
                      style={{ background: heatFill(cell.mean) }}
                      tabIndex={0}
                      title={`${cell.runName} · ${cell.cases} cases · ${relativeTime(cell.completedAt)}`}
                      onClick={() => router.push(`/benchmarks/runs/${cell.runId}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") router.push(`/benchmarks/runs/${cell.runId}`);
                      }}
                    >
                      <div>{percent(cell.mean)}</div>
                      <div className={styles["small"]} style={{ color: "var(--text-secondary)" }}>
                        {interval(cell)}
                      </div>
                    </td>
                  ) : (
                    <td key={board.suites[index].id} className={`${styles["numeric"]} ${styles["muted"]}`}>
                      —
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
