"use client";

/**
 * A run's results for one scope (all suites, or one): the verdict in a
 * sentence, the leaderboard with 95 % intervals and rank ranges, every
 * pair's paired difference, the Pareto and reliability charts, the tag
 * breakdown and the suite's health.
 */
import { useMemo } from "react";
import { Scale } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import type { BenchmarkRun, ContestantSummary, PairwiseComparison, RunReport, SuiteReport } from "../../types/benchmarks";
import {
  compact,
  diffInterval,
  divergingFill,
  duration,
  ERROR_KIND_LABELS,
  heatFill,
  interval,
  money,
  percent,
  points,
  pValue,
  seriesColor,
  verdictOf,
} from "../../utils/benchmarkFormat";
import { ContestantName, IntervalBar, Tile } from "./BenchmarkBits";
import { ParetoChart, PassCurveChart } from "./RunChartsComponent";
import styles from "./Benchmarks.module.css";
import arena from "./Arena.module.css";

function LeaderboardTable({ summaries, run, indexOf }: { summaries: ContestantSummary[]; run: BenchmarkRun; indexOf: (key: string) => number }) {
  const epochs = run.settings.epochs;
  const agentic = run.contestants.some((contestant) => contestant.kind === "agent") || summaries.some((summary) => summary.meanToolCalls > 0);
  return (
    <div className={styles["table-scroll"]}>
      <table className={styles["table"]}>
        <thead>
          <tr>
            <th title="Rank by score; the range is what the paired tests allow">Rank</th>
            <th>Contestant</th>
            <th className={styles["numeric"]}>Score</th>
            <th>95% interval</th>
            <th className={styles["numeric"]} title="Samples that passed every required scorer">Pass rate</th>
            {epochs > 1 && (
              <th className={styles["numeric"]} title={`pass@${epochs}: solved at least once in ${epochs} · pass^${epochs}: solved every time`}>
                pass@{epochs} / pass^{epochs}
              </th>
            )}
            <th className={styles["numeric"]}>Cost</th>
            <th className={styles["numeric"]} title="Contestant spend per passed sample">Per pass</th>
            <th className={styles["numeric"]}>Latency p50 / p95</th>
            <th className={styles["numeric"]}>Tokens in / out</th>
            {agentic && <th className={styles["numeric"]}>Turns / tools</th>}
            <th className={styles["numeric"]}>Errors</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((summary) => {
            const index = indexOf(summary.key);
            const errorKinds = Object.entries(summary.errors)
              .map(([kind, count]) => `${count} ${ERROR_KIND_LABELS[kind as keyof typeof ERROR_KIND_LABELS] ?? kind}`)
              .join(", ");
            return (
              <tr key={summary.key}>
                <td className={`${styles["muted"]} ${styles["nowrap"]}`}>{summary.rankRange[0] === summary.rankRange[1] ? summary.rank : `${summary.rank} (${summary.rankRange[0]}–${summary.rankRange[1]})`}</td>
                <td>
                  <ContestantName
                    label={summary.label}
                    index={index}
                    kind={run.contestants.find((contestant) => contestant.key === summary.key)?.kind}
                    sub={`${summary.cases} cases · ${summary.samples} samples${summary.flakyCases > 0 ? ` · ${summary.flakyCases} flaky` : ""}`}
                  />
                </td>
                <td className={styles["numeric"]} style={{ fontWeight: 600 }}>
                  {summary.cases > 0 ? percent(summary.mean) : "—"}
                </td>
                <td>
                  {summary.cases > 0 && (
                    <span className={styles["row"]} style={{ flexWrap: "nowrap" }}>
                      <IntervalBar value={summary.mean} ci={summary.ci} color={seriesColor(index)} />
                      <span className={`${styles["small"]} ${styles["muted"]} ${styles["nowrap"]}`}>{interval(summary.ci)}</span>
                    </span>
                  )}
                </td>
                <td className={styles["numeric"]}>{percent(summary.passRate)}</td>
                {epochs > 1 && (
                  <td className={styles["numeric"]}>
                    {percent(summary.passAtK)} / {percent(summary.passHatK)}
                  </td>
                )}
                <td className={styles["numeric"]} title={`${money(summary.cost.perSample)} per sample${summary.cost.judge > 0 ? ` · judges ${money(summary.cost.judge)}` : ""}`}>
                  {money(summary.cost.total)}
                </td>
                <td className={styles["numeric"]}>{money(summary.cost.perPass)}</td>
                <td className={styles["numeric"]} title={summary.ttftMs !== null ? `first token after ${duration(summary.ttftMs)}` : undefined}>
                  {duration(summary.latency.p50Ms)} / {duration(summary.latency.p95Ms)}
                </td>
                <td className={styles["numeric"]} title={summary.tokens.reasoning > 0 ? `${compact(summary.tokens.reasoning)} reasoning tokens` : undefined}>
                  {compact(summary.tokens.input)} / {compact(summary.tokens.output)}
                </td>
                {agentic && (
                  <td className={styles["numeric"]}>
                    {summary.meanTurns.toFixed(1)} / {summary.meanToolCalls.toFixed(1)}
                  </td>
                )}
                <td className={styles["numeric"]} title={errorKinds || undefined}>
                  {summary.errored > 0 ? <span className={styles["chip-bad"]}>{summary.errored}</span> : <span className={styles["muted"]}>0</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PairwiseMatrix({ summaries, pairwise }: { summaries: ContestantSummary[]; pairwise: PairwiseComparison[] }) {
  const keys = summaries.map((summary) => summary.key);
  const label = (key: string) => summaries.find((summary) => summary.key === key)?.label ?? key;
  const find = (row: string, column: string) => {
    const direct = pairwise.find((pair) => pair.a === row && pair.b === column);
    if (direct) return { pair: direct, sign: 1 };
    const reverse = pairwise.find((pair) => pair.a === column && pair.b === row);
    return reverse ? { pair: reverse, sign: -1 } : null;
  };
  if (keys.length < 2 || keys.length > 12) return null;
  return (
    <div className={styles["card"]}>
      <div className={styles["field-label"]} style={{ marginBlockEnd: 8 }}>
        Paired differences — row minus column, on the cases both answered. <span className={styles["muted"]}>● significant after Holm correction · blue: row ahead · red: row behind</span>
      </div>
      <div className={arena["matrix"]} style={{ gridTemplateColumns: `minmax(120px, 200px) repeat(${keys.length}, minmax(64px, 1fr))` }} role="table">
        <span />
        {keys.map((key) => (
          <span key={key} className={arena["matrix-head"]} title={label(key)} role="columnheader">
            {label(key)}
          </span>
        ))}
        {keys.map((row) => (
          <FragmentRow key={row} row={row} keys={keys} label={label} find={find} />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  keys,
  label,
  find,
}: {
  row: string;
  keys: string[];
  label: (key: string) => string;
  find: (row: string, column: string) => { pair: PairwiseComparison; sign: number } | null;
}) {
  return (
    <>
      <span className={arena["matrix-head"]} title={label(row)} role="rowheader">
        {label(row)}
      </span>
      {keys.map((column) => {
        if (row === column) return <span key={column} className={arena["matrix-cell"]} aria-hidden />;
        const found = find(row, column);
        if (!found || found.pair.test === "none") {
          return (
            <span key={column} className={arena["matrix-cell"]} role="cell">
              —
            </span>
          );
        }
        const { pair, sign } = found;
        const diff = pair.diff * sign;
        const ci = sign === 1 ? pair.ci : { low: -pair.ci.high, high: -pair.ci.low };
        const [wins, losses] = sign === 1 ? [pair.wins, pair.losses] : [pair.losses, pair.wins];
        return (
          <TooltipComponent
            key={column}
            label={`${label(row)} vs ${label(column)}: ${points(diff)} (95% CI ${diffInterval(ci)}), ${pValue(pair.pAdjusted)} adjusted · ${
              pair.test === "mcnemar" ? "McNemar" : "sign-flip permutation"
            } · ${wins} cases better, ${pair.ties} equal, ${losses} worse · detectable ≈ ${Math.round(pair.mde * 100)} pts${
              pair.correlation !== null ? ` · ρ ${pair.correlation.toFixed(2)}` : ""
            }`}
          >
            <span className={arena["matrix-cell"]} style={{ background: divergingFill(diff) }} role="cell">
              {pair.significant ? "● " : ""}
              {points(diff, 1).replace(" pts", "")}
            </span>
          </TooltipComponent>
        );
      })}
    </>
  );
}

function TagTable({ suite, summaries }: { suite: SuiteReport; summaries: ContestantSummary[] }) {
  if (suite.tags.length === 0) return null;
  return (
    <div className={styles["section"]}>
      <div className={styles["field-label"]}>By category</div>
      <div className={styles["table-scroll"]}>
        <table className={styles["table"]}>
          <thead>
            <tr>
              <th>Tag</th>
              <th className={styles["numeric"]}>Cases</th>
              {summaries.map((summary) => (
                <th key={summary.key} className={styles["numeric"]} title={summary.label}>
                  {summary.label.length > 18 ? `${summary.label.slice(0, 18)}…` : summary.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suite.tags.map((tag) => (
              <tr key={tag.tag}>
                <td>{tag.tag}</td>
                <td className={styles["numeric"]}>{tag.cases}</td>
                {summaries.map((summary) => {
                  const value = tag.means[summary.key];
                  return (
                    <td key={summary.key} className={styles["numeric"]} style={{ background: heatFill(value) }}>
                      {value === undefined ? "—" : percent(value, 0)}
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

export default function RunOverviewComponent({
  run,
  report,
  scope,
}: {
  run: BenchmarkRun;
  report: RunReport;
  /** "overall", or a suite id. */
  scope: string;
}) {
  const suite = report.suites.find((candidate) => candidate.suiteId === scope) ?? null;
  const summaries = suite ? suite.summaries : report.overall;
  const pairwise = suite ? suite.pairwise : report.suites.length === 1 ? report.suites[0].pairwise : [];
  const indexOf = useMemo(() => {
    const positions = new Map(run.contestants.map((contestant, index) => [contestant.key, index]));
    return (key: string) => positions.get(key) ?? -1;
  }, [run.contestants]);
  const verdict = verdictOf(summaries, pairwise);
  const totalJudge = report.judgeCost;

  return (
    <div className={styles["section"]} style={{ gap: 20 }}>
      <div className={styles["verdict"]}>
        <Scale size={18} className={styles["verdict-icon"]} aria-hidden />
        <span>{verdict.text}</span>
      </div>

      <LeaderboardTable summaries={summaries} run={run} indexOf={indexOf} />

      {pairwise.length > 0 ? (
        <PairwiseMatrix summaries={summaries} pairwise={pairwise} />
      ) : (
        !suite &&
        report.suites.length > 1 &&
        run.contestants.length > 1 && <p className={styles["section-hint"]}>Pick a suite above for its paired comparisons; the overall score averages the suites (each weighs the same).</p>
      )}

      <div className={styles["card-grid"]} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
        <ParetoChart summaries={summaries} frontier={report.pareto.cost} axis="cost" />
        <ParetoChart summaries={summaries} frontier={report.pareto.latency} axis="latency" />
        {run.settings.epochs > 1 && <PassCurveChart summaries={summaries} indexOf={indexOf} />}
      </div>

      {suite && <TagTable suite={suite} summaries={summaries} />}

      <div className={styles["tiles"]}>
        <Tile label="Total cost" value={money(report.totalCost)} detail={totalJudge > 0 ? `${money(totalJudge)} of it judges` : "no judge calls"} />
        {suite && (
          <>
            <Tile label="Saturated cases" value={suite.health.saturated} detail="everyone passed every epoch — they separate no one" />
            <Tile label="Unsolved cases" value={suite.health.unsolved} detail="no one passed — too hard, or a broken case" />
            <Tile
              label="Signal to noise"
              value={suite.health.signalToNoise === null ? "—" : suite.health.signalToNoise.toFixed(1)}
              detail="spread of the scores ÷ their standard error; below ~2, the suite barely ranks these"
            />
          </>
        )}
        {report.judgeAgreement && (
          <Tile
            label="Judge vs you"
            value={`${report.judgeAgreement.agreed}/${report.judgeAgreement.compared}`}
            detail={`agreement on the samples you graded${report.judgeAgreement.kappa !== null ? ` · κ ${report.judgeAgreement.kappa.toFixed(2)}` : ""}`}
          />
        )}
      </div>
    </div>
  );
}
