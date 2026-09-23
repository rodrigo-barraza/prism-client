"use client";

/**
 * Bradley–Terry standings: rating with its bootstrap interval on a shared
 * axis, the rank range the intervals allow, the record; and the predicted
 * win-probability matrix (diverging around an even match).
 */
import { useMemo } from "react";
import type { ArenaReport } from "../../types/benchmarks";
import { divergingFill, percent } from "../../utils/benchmarkFormat";
import { ContestantName } from "./BenchmarkBits";
import styles from "./Benchmarks.module.css";
import arena from "./Arena.module.css";

function RatingBar({ rating, low, high, min, max }: { rating: number; low: number; high: number; min: number; max: number }) {
  const span = Math.max(1, max - min);
  const position = (value: number) => ((value - min) / span) * 100;
  return (
    <span className={arena["rating-axis"]} role="img" aria-label={`${Math.round(rating)}, 95% interval ${Math.round(low)} to ${Math.round(high)}`}>
      <span className={styles["interval-track"]} />
      <span
        className={styles["interval-range"]}
        style={{ insetInlineStart: `${position(low)}%`, inlineSize: `${Math.max(0.5, position(high) - position(low))}%`, background: "var(--bench-series-1)" }}
      />
      <span className={styles["interval-point"]} style={{ insetInlineStart: `${position(rating)}%`, background: "var(--bench-series-1)" }} />
    </span>
  );
}

export default function ArenaStandingsComponent({ report, showMatrix = true }: { report: ArenaReport; showMatrix?: boolean }) {
  const [min, max] = useMemo(() => {
    const lows = report.standings.map((standing) => standing.ci.low);
    const highs = report.standings.map((standing) => standing.ci.high);
    return [Math.min(...lows, 950) - 10, Math.max(...highs, 1050) + 10];
  }, [report]);

  if (report.standings.length === 0) {
    return <div className={`${styles["card"]} ${styles["empty"]}`}>No battles yet.</div>;
  }

  const keys = report.standings.map((standing) => standing.key);
  const labels = Object.fromEntries(report.standings.map((standing) => [standing.key, standing.label]));

  return (
    <div className={styles["section"]}>
      <div className={styles["table-scroll"]}>
        <table className={styles["table"]}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Contestant</th>
              <th className={styles["numeric"]}>Rating</th>
              <th>95% interval</th>
              <th className={styles["numeric"]}>Battles</th>
              <th className={styles["numeric"]}>W / T / L</th>
              <th className={styles["numeric"]}>Win rate</th>
            </tr>
          </thead>
          <tbody>
            {report.standings.map((standing) => (
              <tr key={standing.key}>
                <td className={`${styles["muted"]} ${styles["nowrap"]}`} title="Best and worst rank the intervals allow">
                  {standing.rankRange[0] === standing.rankRange[1] ? standing.rank : `${standing.rank} (${standing.rankRange[0]}–${standing.rankRange[1]})`}
                </td>
                <td>
                  <ContestantName label={standing.label} />
                </td>
                <td className={styles["numeric"]} style={{ fontWeight: 600 }}>
                  {Math.round(standing.rating)}
                </td>
                <td>
                  <span className={styles["row"]} style={{ flexWrap: "nowrap" }}>
                    <RatingBar rating={standing.rating} low={standing.ci.low} high={standing.ci.high} min={min} max={max} />
                    <span className={`${styles["small"]} ${styles["muted"]}`}>
                      {Math.round(standing.ci.low)}–{Math.round(standing.ci.high)}
                    </span>
                  </span>
                </td>
                <td className={styles["numeric"]}>{standing.battles}</td>
                <td className={styles["numeric"]}>
                  {standing.wins} / {standing.ties} / {standing.losses}
                </td>
                <td className={styles["numeric"]}>{percent(standing.winRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles["section-hint"]}>
        Bradley–Terry ratings on the Elo scale (mean 1000; +100 ≈ 64% expected wins) with bootstrap 95% intervals over {report.battles} battles
        {report.styleControlled ? ", controlling for answer length and markdown" : ""}. Ties and &ldquo;both bad&rdquo; count half a win each.
        {typeof report.inconsistentJudgements === "number" && report.inconsistentJudgements > 0
          ? ` ${report.inconsistentJudgements} judge verdicts flipped when the answers swapped sides and were counted as ties.`
          : ""}
      </p>
      {showMatrix && keys.length > 1 && keys.length <= 12 && (
        <details>
          <summary className={styles["small"]} style={{ cursor: "pointer", color: "var(--text-secondary)" }}>
            Predicted win probability (row beats column)
          </summary>
          <div className={arena["matrix"]} style={{ gridTemplateColumns: `minmax(120px, 180px) repeat(${keys.length}, minmax(56px, 1fr))`, marginBlockStart: 8 }} role="table">
            <span />
            {keys.map((key) => (
              <span key={key} className={arena["matrix-head"]} title={labels[key]} role="columnheader">
                {labels[key]}
              </span>
            ))}
            {keys.map((row) => (
              <FragmentRow key={row} row={row} keys={keys} labels={labels} matrix={report.winMatrix} counts={report.battleCounts} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FragmentRow({
  row,
  keys,
  labels,
  matrix,
  counts,
}: {
  row: string;
  keys: string[];
  labels: Record<string, string>;
  matrix: ArenaReport["winMatrix"];
  counts: ArenaReport["battleCounts"];
}) {
  return (
    <>
      <span className={arena["matrix-head"]} title={labels[row]} role="rowheader">
        {labels[row]}
      </span>
      {keys.map((column) => {
        if (row === column) return <span key={column} className={arena["matrix-cell"]} aria-hidden />;
        const probability = matrix[row]?.[column] ?? 0.5;
        return (
          <span
            key={column}
            className={arena["matrix-cell"]}
            style={{ background: divergingFill(probability - 0.5) }}
            title={`${labels[row]} beats ${labels[column]} ${percent(probability)} of the time · ${counts[row]?.[column] ?? 0} battles between them`}
            role="cell"
          >
            {Math.round(probability * 100)}%
          </span>
        );
      })}
    </>
  );
}
