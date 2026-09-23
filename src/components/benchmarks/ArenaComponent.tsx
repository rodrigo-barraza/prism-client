"use client";

/**
 * The arena: standings from blind human votes (or from judge battles —
 * never mixed unless asked), a live battle on a prompt of your own, blind
 * review of a finished run, and the battles so far.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { IconButtonComponent, LoadingStateComponent, SegmentedControlComponent, SwitchComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi from "../../services/BenchmarkApi";
import PrismService from "../../services/PrismService";
import type { ArenaReport, Battle, ContestantSpec, RunListItem } from "../../types/benchmarks";
import type { PrismConfig } from "../../types/types";
import { relativeTime } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import ArenaStandingsComponent from "./ArenaStandingsComponent";
import BlindVoteComponent from "./BlindVoteComponent";
import LiveBattleComponent from "./LiveBattleComponent";
import type { AgentOption } from "./ContestantEditorComponent";
import styles from "./Benchmarks.module.css";

type Source = "human" | "judge" | "all";

const WINNER_TEXT: Record<Battle["winner"], string> = { a: "won", b: "lost", tie: "tied", both_bad: "both bad" };

export default function ArenaComponent() {
  const [source, setSource] = useState<Source>("human");
  const [styleControl, setStyleControl] = useState(false);
  const [report, setReport] = useState<(ArenaReport & { source: string }) | null>(null);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [pool, setPool] = useState<ContestantSpec[]>([]);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [reviewRunId, setReviewRunId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const loadStandings = useCallback(() => {
    BenchmarkApi.arena({ source, styleControl })
      .then(setReport)
      .catch((caught) => setError(getErrorMessage(caught)));
    BenchmarkApi.battles({ source: source === "all" ? undefined : source, limit: 30 })
      .then(setBattles)
      .catch(() => setBattles([]));
  }, [source, styleControl]);

  useEffect(() => {
    loadStandings();
  }, [loadStandings]);

  useEffect(() => {
    PrismService.getConfigWithLocalModels()
      .then(setConfig)
      .catch(() => setConfig(null));
    BenchmarkApi.options()
      .then((options) => setAgents(options.agents))
      .catch(() => setAgents([]));
    BenchmarkApi.leaderboard()
      .then((board) =>
        setPool(board.contestants.map((contestant) => ({ kind: contestant.kind, provider: contestant.provider, model: contestant.model, agent: contestant.agent ?? null }))),
      )
      .catch(() => setPool([]));
    BenchmarkApi.runs({ limit: 100 })
      .then((loaded) => setRuns(loaded.filter((run) => run.contestants.length >= 2 && run.progress.done > 0)))
      .catch(() => setRuns([]));
  }, []);

  const initialPair = useMemo<[ContestantSpec, ContestantSpec]>(() => {
    const fallback = config?.textToText?.recommendedDefault;
    const first: ContestantSpec = pool[0] ?? { kind: "model", provider: fallback?.provider ?? "google", model: fallback?.model ?? "" };
    const second: ContestantSpec = pool[1] ?? { ...first, effort: "none" };
    return [first, second];
  }, [config, pool]);

  const deleteBattle = async (battle: Battle) => {
    await BenchmarkApi.deleteBattle(battle.id);
    loadStandings();
  };

  return (
    <div className={styles["section"]} style={{ gap: 28 }}>
      <section className={styles["section"]}>
        <div className={styles["section-header"]}>
          <h2 className={styles["section-title"]}>Standings</h2>
          <div className={styles["toolbar"]}>
            <SegmentedControlComponent
              value={source}
              onChange={(value) => setSource(value as Source)}
              segments={[
                { value: "human", label: "Your votes" },
                { value: "judge", label: "Judge battles" },
                { value: "all", label: "Both" },
              ]}
              compact
            />
            <SwitchComponent checked={styleControl} onChange={setStyleControl} label="Style control" />
          </div>
        </div>
        {error ? <p className={styles["error-text"]}>{error}</p> : !report ? <LoadingStateComponent message="Fitting ratings…" /> : <ArenaStandingsComponent report={report} />}
      </section>

      <section className={styles["section"]}>
        <div className={styles["section-header"]}>
          <h2 className={styles["section-title"]}>Live battle</h2>
          <p className={styles["section-hint"]}>Two contestants answer your prompt at once, names hidden; vote, then see who was who. Every vote feeds the standings above.</p>
        </div>
        {config ? (
          <LiveBattleComponent key={initialPair.map((spec) => `${spec.provider}:${spec.model}`).join("|")} config={config} agents={agents} initial={initialPair} pool={pool} />
        ) : (
          <LoadingStateComponent message="Loading models…" />
        )}
      </section>

      <section className={styles["section"]}>
        <div className={styles["section-header"]}>
          <h2 className={styles["section-title"]}>Blind review of a run</h2>
          <p className={styles["section-hint"]}>Judge a finished run&apos;s answers yourself, two at a time and without names — the fairest check on an LLM judge.</p>
        </div>
        {runs.length === 0 ? (
          <div className={`${styles["card"]} ${styles["empty"]}`}>No run with two or more contestants has answers yet.</div>
        ) : (
          <>
            <select className={styles["native-select"]} style={{ maxInlineSize: 480 }} value={reviewRunId} onChange={(event) => setReviewRunId(event.target.value)} aria-label="Run to review">
              <option value="">Pick a run…</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} · {relativeTime(run.createdAt)}
                </option>
              ))}
            </select>
            {reviewRunId && <BlindVoteComponent key={reviewRunId} runId={reviewRunId} onVoted={loadStandings} />}
          </>
        )}
      </section>

      {battles.length > 0 && (
        <section className={styles["section"]}>
          <h2 className={styles["section-title"]}>Recent battles</h2>
          <div className={styles["table-scroll"]}>
            <table className={styles["table"]}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Prompt</th>
                  <th>A</th>
                  <th>Result</th>
                  <th>B</th>
                  <th>Source</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {battles.map((battle) => (
                  <tr key={battle.id}>
                    <td className={styles["muted"]}>{relativeTime(battle.createdAt)}</td>
                    <td style={{ maxInlineSize: 360 }}>
                      <span className={styles["contestant-label"]} title={battle.prompt} style={{ display: "block" }}>
                        {battle.prompt}
                      </span>
                    </td>
                    <td>{battle.a.label}</td>
                    <td>{WINNER_TEXT[battle.winner]}</td>
                    <td>{battle.b.label}</td>
                    <td className={styles["muted"]}>{battle.source === "judge" ? "judge" : battle.runId ? "your vote (run)" : "your vote (live)"}</td>
                    <td>
                      <IconButtonComponent icon={<Trash2 size={14} />} tooltip="Delete this battle" variant="destructive" onClick={() => void deleteBattle(battle)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
