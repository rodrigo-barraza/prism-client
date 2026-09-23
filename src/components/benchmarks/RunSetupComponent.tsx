"use client";

/**
 * What a run evaluated and how: contestants (every pinned setting), the
 * suites as snapshotted, the method, and — for a scheduled run — how it
 * compared with the previous one.
 */
import Link from "next/link";
import type { BenchmarkRun } from "../../types/benchmarks";
import { contestantChips, contestantKindLabel, diffInterval, money, percent, points, pValue, scorerSummary, seriesColor } from "../../utils/benchmarkFormat";
import styles from "./Benchmarks.module.css";

export default function RunSetupComponent({ run }: { run: BenchmarkRun }) {
  const { settings } = run;
  return (
    <div className={styles["section"]} style={{ gap: 20 }}>
      {run.regression && (
        <section className={styles["section"]}>
          <h3 className={styles["section-title"]}>Compared with the previous scheduled run</h3>
          {run.regression.regressions.length === 0 ? (
            <p className={styles["section-hint"]}>
              {run.regression.baselineRunId ? "No significant drop beyond the threshold." : "This was the schedule's first completed run — nothing to compare with yet."}
            </p>
          ) : (
            <div className={styles["table-scroll"]}>
              <table className={styles["table"]}>
                <thead>
                  <tr>
                    <th>Contestant</th>
                    <th>Suite</th>
                    <th className={styles["numeric"]}>Before → now</th>
                    <th className={styles["numeric"]}>Change</th>
                    <th>Cases lost</th>
                  </tr>
                </thead>
                <tbody>
                  {run.regression.regressions.map((regression) => (
                    <tr key={`${regression.suiteId}-${regression.contestantKey}`}>
                      <td>{regression.label}</td>
                      <td>{regression.suiteName}</td>
                      <td className={styles["numeric"]}>
                        {percent(regression.baseline)} → {percent(regression.current)}
                      </td>
                      <td className={styles["numeric"]} title={`95% CI ${diffInterval(regression.ci)} · ${pValue(regression.pValue)}`}>
                        {points(regression.diff)}
                      </td>
                      <td className={styles["mono"]} style={{ fontSize: "var(--font-size-xs)" }}>
                        {regression.casesLost.slice(0, 8).join(", ")}
                        {regression.casesLost.length > 8 ? ` +${regression.casesLost.length - 8}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className={styles["section"]}>
        <h3 className={styles["section-title"]}>Contestants</h3>
        <div className={styles["card-grid"]}>
          {run.contestants.map((contestant, index) => (
            <div key={contestant.key} className={styles["card"]}>
              <div className={styles["row"]}>
                <span className={styles["swatch"]} style={{ background: seriesColor(index) }} aria-hidden />
                <strong>{contestant.label}</strong>
              </div>
              <div className={`${styles["small"]} ${styles["muted"]}`} style={{ marginBlock: 6 }}>
                {contestantKindLabel(contestant)} · {contestant.provider} · <span className={styles["mono"]}>{contestant.model}</span>
              </div>
              <div className={styles["row"]}>
                {contestantChips(contestant).map((chip) => (
                  <span key={chip} className={styles["chip"]}>
                    {chip}
                  </span>
                ))}
              </div>
              {contestant.systemPrompt && <pre className={styles["code-block"]} style={{ marginBlockStart: 8, maxBlockSize: 120 }}>{contestant.systemPrompt}</pre>}
              <div className={`${styles["small"]} ${styles["muted"]} ${styles["mono"]}`} style={{ marginBlockStart: 6 }}>
                {contestant.key}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles["section"]}>
        <h3 className={styles["section-title"]}>Suites</h3>
        <div className={styles["table-scroll"]}>
          <table className={styles["table"]}>
            <thead>
              <tr>
                <th>Suite</th>
                <th className={styles["numeric"]}>Cases</th>
                <th>Scorers</th>
                <th>Tools</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {run.suites.map((suite) => (
                <tr key={suite.id}>
                  <td>
                    <Link href={`/benchmarks/suites/${encodeURIComponent(suite.id)}`}>{suite.name}</Link>
                  </td>
                  <td className={styles["numeric"]}>
                    {suite.cases.length}
                    {suite.totalCases > suite.cases.length ? ` of ${suite.totalCases}` : ""}
                  </td>
                  <td>{suite.scorers.length > 0 ? suite.scorers.map(scorerSummary).join(" · ") : <span className={styles["muted"]}>per case</span>}</td>
                  <td>{suite.tools.mode === "list" ? suite.tools.tools.join(", ") : suite.tools.mode === "agent" ? "the agent's" : "none"}</td>
                  <td className={styles["muted"]}>v{suite.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles["section"]}>
        <h3 className={styles["section-title"]}>Method</h3>
        <div className={styles["tiles"]}>
          <div className={styles["tile"]}>
            <span className={styles["tile-label"]}>Epochs</span>
            <span className={styles["tile-value"]}>{settings.epochs}</span>
          </div>
          <div className={styles["tile"]}>
            <span className={styles["tile-label"]}>Sampling</span>
            <span className={styles["tile-value"]}>{settings.sampleLimit ? `${settings.sampleLimit} / suite` : "all cases"}</span>
            {settings.sampleLimit && <span className={styles["tile-detail"]}>seed {settings.sampleSeed}</span>}
          </div>
          <div className={styles["tile"]}>
            <span className={styles["tile-label"]}>Judges</span>
            <span className={styles["tile-value"]} style={{ fontSize: "var(--font-size-sm)" }}>
              {settings.judges.length > 0 ? settings.judges.join(", ") : "default"}
            </span>
          </div>
          <div className={styles["tile"]}>
            <span className={styles["tile-label"]}>Head to head</span>
            <span className={styles["tile-value"]} style={{ fontSize: "var(--font-size-sm)" }}>
              {settings.pairwise.mode === "off" ? "off" : settings.pairwise.mode === "all_pairs" ? "every pair" : "vs baseline"}
            </span>
          </div>
          <div className={styles["tile"]}>
            <span className={styles["tile-label"]}>Budget</span>
            <span className={styles["tile-value"]}>{settings.budgetUsd ? money(settings.budgetUsd) : "none"}</span>
          </div>
          <div className={styles["tile"]}>
            <span className={styles["tile-label"]}>Concurrency</span>
            <span className={styles["tile-value"]}>{settings.concurrency}</span>
            <span className={styles["tile-detail"]}>{settings.providerConcurrency} per provider · {settings.maxAttempts} attempts</span>
          </div>
        </div>
      </section>
    </div>
  );
}
