"use client";

/**
 * /benchmarks/runs/[id] — a run: its progress while it works (live over
 * SSE; it keeps going if this page closes), then the report — overview,
 * cases, samples, arena, setup — and everything you can do to it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  GitCompareArrows,
  Pencil,
  Play,
  RefreshCcw,
  Square,
  Swords,
  Trash2,
} from "lucide-react";
import {
  ButtonComponent,
  DrawerComponent,
  LoadingStateComponent,
  ModalComponent,
  SegmentedControlComponent,
  SwitchComponent,
  TabBarComponent,
} from "@rodrigo-barraza/components-library";
import BenchmarkApi, { type RunDetail, type RunStreamEvent } from "../../services/BenchmarkApi";
import type { BenchmarkSample, RunListItem, RunReport } from "../../types/benchmarks";
import { ERROR_KIND_LABELS, isLiveStatus, money, percent, relativeTime, seriesColor } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import { RunProgressLine, RunStatusBadge } from "./BenchmarkBits";
import RunOverviewComponent from "./RunOverviewComponent";
import CaseMatrixComponent from "./CaseMatrixComponent";
import CaseDetailComponent from "./CaseDetailComponent";
import RunSetupComponent from "./RunSetupComponent";
import ArenaStandingsComponent from "./ArenaStandingsComponent";
import BlindVoteComponent from "./BlindVoteComponent";
import styles from "./Benchmarks.module.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "cases", label: "Cases" },
  { key: "samples", label: "Samples" },
  { key: "arena", label: "Arena" },
  { key: "setup", label: "Setup" },
];
const REPORT_REFRESH_MILLISECONDS = 2500;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SamplesTable({ run, samples, onOpen }: { run: RunDetail; samples: BenchmarkSample[]; onOpen: (sample: BenchmarkSample) => void }) {
  const [contestant, setContestant] = useState("all");
  const [status, setStatus] = useState("all");
  const index = useMemo(() => new Map(run.contestants.map((entry, position) => [entry.key, position])), [run.contestants]);
  const shown = samples.filter((sample) => {
    if (contestant !== "all" && sample.contestantKey !== contestant) return false;
    const passed = sample.override ? sample.override.passed : sample.passed;
    if (status === "passed") return sample.status === "done" && passed === true;
    if (status === "failed") return sample.status === "done" && passed === false;
    if (status === "error") return sample.status === "error";
    if (status === "unrun") return sample.status === "pending" || sample.status === "cancelled" || sample.status === "running";
    return true;
  });
  return (
    <div className={styles["section"]}>
      <div className={styles["toolbar"]}>
        <select className={styles["native-select"]} style={{ inlineSize: "auto" }} value={contestant} onChange={(event) => setContestant(event.target.value)} aria-label="Contestant">
          <option value="all">Every contestant</option>
          {run.contestants.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
        <SegmentedControlComponent
          value={status}
          onChange={setStatus}
          segments={[
            { value: "all", label: "All" },
            { value: "passed", label: "Passed" },
            { value: "failed", label: "Failed" },
            { value: "error", label: "Errored" },
            { value: "unrun", label: "Not run" },
          ]}
          compact
        />
        <span className={`${styles["small"]} ${styles["muted"]}`}>{shown.length} samples</span>
      </div>
      <div className={styles["table-scroll"]} style={{ maxBlockSize: "70vh" }}>
        <table className={styles["table"]}>
          <thead>
            <tr>
              <th>Case</th>
              <th>Contestant</th>
              {run.settings.epochs > 1 && <th className={styles["numeric"]}>Epoch</th>}
              <th>Result</th>
              <th className={styles["numeric"]}>Score</th>
              <th className={styles["numeric"]}>Latency</th>
              <th className={styles["numeric"]}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 1000).map((sample) => {
              const passed = sample.override ? sample.override.passed : sample.passed;
              const position = index.get(sample.contestantKey) ?? -1;
              return (
                <tr
                  key={sample.id}
                  className={styles["clickable-row"]}
                  tabIndex={0}
                  onClick={() => onOpen(sample)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onOpen(sample);
                  }}
                >
                  <td className={styles["mono"]} style={{ fontSize: "var(--font-size-xs)" }}>
                    {sample.caseId}
                  </td>
                  <td>
                    <span className={styles["contestant"]}>
                      <span className={styles["swatch"]} style={{ background: seriesColor(position) }} aria-hidden />
                      <span className={styles["contestant-label"]} style={{ maxInlineSize: 220 }}>
                        {run.contestants[position]?.label ?? sample.contestantKey}
                      </span>
                    </span>
                  </td>
                  {run.settings.epochs > 1 && <td className={styles["numeric"]}>{sample.epoch}</td>}
                  <td>
                    {sample.status === "done" ? (
                      <span className={passed ? styles["chip-good"] : styles["chip-bad"]}>
                        {passed ? "passed" : "failed"}
                        {sample.override ? " (you)" : ""}
                      </span>
                    ) : sample.status === "error" && sample.error ? (
                      <span className={styles["chip-bad"]} title={sample.error.message}>
                        {ERROR_KIND_LABELS[sample.error.kind]}
                      </span>
                    ) : (
                      <span className={styles["muted"]}>{sample.status}</span>
                    )}
                  </td>
                  <td className={styles["numeric"]}>{typeof sample.score === "number" ? percent(sample.score) : "—"}</td>
                  <td className={styles["numeric"]}>{sample.latencyMs !== null ? `${(sample.latencyMs / 1000).toFixed(1)} s` : "—"}</td>
                  <td className={styles["numeric"]}>{money(sample.cost + sample.judgeCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > 1000 && <p className={styles["section-hint"]}>Showing the first 1,000 — export the run for all of them.</p>}
    </div>
  );
}

function PairwiseModal({ run, onClose, onStarted }: { run: RunDetail; onClose: () => void; onStarted: () => void }) {
  const [mode, setMode] = useState<"all_pairs" | "vs_baseline">(run.contestants.length > 3 ? "vs_baseline" : "all_pairs");
  const [baseline, setBaseline] = useState(run.contestants[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairs = mode === "all_pairs" ? (run.contestants.length * (run.contestants.length - 1)) / 2 : run.contestants.length - 1;
  const cases = run.suites.reduce((sum, suite) => sum + suite.cases.length, 0) * run.settings.epochs;
  const start = async () => {
    setBusy(true);
    try {
      await BenchmarkApi.judgePairwise(run.id, { mode, baselineKey: mode === "vs_baseline" ? baseline : null, judges: run.settings.pairwise.judges ?? null });
      onStarted();
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <ModalComponent
      title="Judge the answers head to head"
      onClose={onClose}
      footer={
        <div className={styles["row"]} style={{ inlineSize: "100%" }}>
          {error && <span className={styles["error-text"]}>{error}</span>}
          <span className={styles["spacer"]} />
          <ButtonComponent variant="secondary" onClick={onClose}>
            Cancel
          </ButtonComponent>
          <ButtonComponent variant="primary" icon={Swords} loading={busy} onClick={() => void start()}>
            Judge {pairs * cases} pairs
          </ButtonComponent>
        </div>
      }
    >
      <div className={styles["section"]}>
        <p className={styles["section-hint"]}>
          A judge reads two contestants&apos; answers to the same case — twice, with the sides swapped — and picks the better one; a preference that follows the position counts as a tie. The battles give this run
          arena ratings. Pairs already judged are skipped.
        </p>
        <SegmentedControlComponent
          value={mode}
          onChange={(value) => setMode(value as "all_pairs" | "vs_baseline")}
          segments={[
            { value: "all_pairs", label: "Every pair" },
            { value: "vs_baseline", label: "Everyone vs a baseline" },
          ]}
          compact
        />
        {mode === "vs_baseline" && (
          <select className={styles["native-select"]} value={baseline} onChange={(event) => setBaseline(event.target.value)} aria-label="Baseline">
            {run.contestants.map((contestant) => (
              <option key={contestant.key} value={contestant.key}>
                {contestant.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </ModalComponent>
  );
}

function CompareModal({ run, onClose }: { run: RunDetail; onClose: () => void }) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  useEffect(() => {
    BenchmarkApi.runs({ limit: 200 })
      .then((loaded) => setRuns(loaded.filter((candidate) => candidate.id !== run.id && candidate.contestants.some((contestant) => run.contestants.some((own) => own.key === contestant.key)))))
      .catch(() => setRuns([]));
  }, [run]);
  return (
    <ModalComponent title="Compare with another run" onClose={onClose}>
      {!runs ? (
        <LoadingStateComponent message="Loading runs…" />
      ) : runs.length === 0 ? (
        <p className={styles["section-hint"]}>No other run shares a contestant with this one.</p>
      ) : (
        <div className={styles["section"]} style={{ gap: 6 }}>
          <p className={styles["section-hint"]}>The comparison pairs the same contestant on the same cases in both runs: what changed, and whether it is more than noise.</p>
          {runs.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={styles["card"]}
              style={{ textAlign: "start", cursor: "pointer", font: "inherit", color: "inherit" }}
              onClick={() => router.push(`/benchmarks/compare?base=${candidate.id}&head=${run.id}`)}
            >
              <strong>{candidate.name}</strong>
              <div className={`${styles["small"]} ${styles["muted"]}`}>
                {relativeTime(candidate.createdAt)} · {candidate.contestants.length} contestants
              </div>
            </button>
          ))}
        </div>
      )}
    </ModalComponent>
  );
}

export default function RunReportComponent({ runId }: { runId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [samples, setSamples] = useState<BenchmarkSample[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState("overall");
  const [excludeErrors, setExcludeErrors] = useState(false);
  const [openCase, setOpenCase] = useState<{ suiteId: string; caseId: string } | null>(null);
  const [modal, setModal] = useState<"pairwise" | "compare" | null>(null);
  const [humanArena, setHumanArena] = useState<Awaited<ReturnType<typeof BenchmarkApi.arena>> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followAbort = useRef<AbortController | null>(null);

  const loadReport = useCallback(async () => {
    try {
      setReport(await BenchmarkApi.report(runId, excludeErrors ? "exclude" : "fail"));
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }, [runId, excludeErrors]);

  const loadSamples = useCallback(async () => {
    setSamples(await BenchmarkApi.samples(runId).catch(() => []));
  }, [runId]);

  const loadRun = useCallback(async () => {
    try {
      const loaded = await BenchmarkApi.run(runId);
      setRun(loaded);
      return loaded;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return null;
    }
  }, [runId]);

  /** Refresh the report at most every few seconds while samples stream in. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void loadReport();
      if (tab === "cases" || tab === "samples") void loadSamples();
    }, REPORT_REFRESH_MILLISECONDS);
  }, [loadReport, loadSamples, tab]);

  const follow = useCallback(() => {
    followAbort.current?.abort();
    const controller = new AbortController();
    followAbort.current = controller;
    void BenchmarkApi.followRun(
      runId,
      (event: RunStreamEvent) => {
        if (event.type === "snapshot" || event.type === "status" || event.type === "progress") {
          setRun((current) =>
            current
              ? {
                  ...current,
                  progress: event.progress,
                  ...(event.type !== "progress" && { status: event.status, statusReason: event.statusReason ?? current.statusReason }),
                }
              : current,
          );
        }
        if (event.type === "sample" || event.type === "battle") scheduleRefresh();
        if (event.type === "end") {
          void loadRun();
          void loadReport();
          void loadSamples();
        }
      },
      controller.signal,
    ).catch(() => {});
  }, [runId, scheduleRefresh, loadRun, loadReport, loadSamples]);

  useEffect(() => {
    void loadRun().then((loaded) => {
      if (loaded && (loaded.live || isLiveStatus(loaded.status))) follow();
    });
    return () => {
      followAbort.current?.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // Follow once per run page; later follows start from the actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if ((tab === "cases" || tab === "samples") && samples === null) void loadSamples();
    if (tab === "arena") {
      BenchmarkApi.arena({ source: "human", runId })
        .then(setHumanArena)
        .catch(() => setHumanArena(null));
    }
  }, [tab, samples, loadSamples, runId]);

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      const loaded = await loadRun();
      if (loaded) follow();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  if (error && !run) return <p className={styles["error-text"]}>{error}</p>;
  if (!run) return <LoadingStateComponent message="Loading the run…" />;

  const live = run.live || isLiveStatus(run.status);
  const resumable = !live && (run.status === "cancelled" || run.status === "interrupted" || run.status === "failed" || run.progress.errored > 0 || run.progress.done + run.progress.errored < run.progress.total);
  const scopes = [{ value: "overall", label: run.suites.length > 1 ? "All suites" : run.suites[0]?.name ?? "Suite" }, ...(run.suites.length > 1 ? run.suites.map((suite) => ({ value: suite.id, label: suite.name })) : [])];
  const effectiveScope = run.suites.length === 1 ? run.suites[0].id : scope;
  const caseSuite = run.suites.some((suite) => suite.id === scope) ? scope : run.suites[0]?.id;

  return (
    <div className={`${styles["theme"]} ${styles["page"]}`}>
      <header className={styles["section"]} style={{ gap: 10 }}>
        <div className={styles["row"]} style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minInlineSize: 240 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>{run.name}</h1>
            <div className={`${styles["small"]} ${styles["muted"]}`} style={{ marginBlockStart: 4 }}>
              {run.suites.map((suite) => suite.name).join(" · ")} · {run.contestants.length} contestant{run.contestants.length === 1 ? "" : "s"} · {run.settings.epochs} epoch
              {run.settings.epochs === 1 ? "" : "s"} · started {relativeTime(run.startedAt ?? run.createdAt)}
            </div>
          </div>
          <div className={styles["row"]}>
            <RunStatusBadge status={run.status} reason={run.statusReason} />
            <span className={styles["chip"]}>{money(run.progress.cost + run.progress.judgeCost)}</span>
          </div>
        </div>
        {run.statusReason && <p className={styles["section-hint"]}>{run.statusReason}</p>}
        {(live || run.progress.done + run.progress.errored < run.progress.total) && <RunProgressLine progress={run.progress} status={run.status} />}
        <div className={`${styles["toolbar"]} ${styles["run-actions"]}`}>
          {live ? (
            <ButtonComponent variant="destructive" size="small" icon={Square} onClick={() => void act(() => BenchmarkApi.cancelRun(run.id))}>
              Stop
            </ButtonComponent>
          ) : (
            <>
              {resumable && (
                <ButtonComponent variant="primary" size="small" icon={Play} onClick={() => void act(() => BenchmarkApi.resumeRun(run.id, { retryErrors: true }))}>
                  Resume{run.progress.errored > 0 ? " (retry errors)" : ""}
                </ButtonComponent>
              )}
              <ButtonComponent variant="secondary" size="small" icon={RefreshCcw} onClick={() => void act(() => BenchmarkApi.regradeRun(run.id))}>
                Regrade
              </ButtonComponent>
              {run.contestants.length > 1 && (
                <ButtonComponent variant="secondary" size="small" icon={Swords} onClick={() => setModal("pairwise")}>
                  Judge head to head
                </ButtonComponent>
              )}
            </>
          )}
          <ButtonComponent
            variant="secondary"
            size="small"
            icon={Copy}
            onClick={() =>
              void BenchmarkApi.rerun(run.id)
                .then((copy) => router.push(`/benchmarks/runs/${copy.id}`))
                .catch((caught) => setError(getErrorMessage(caught)))
            }
          >
            Run again
          </ButtonComponent>
          <ButtonComponent variant="secondary" size="small" icon={Pencil} onClick={() => router.push(`/benchmarks/new?fromRun=${run.id}`)}>
            Variant…
          </ButtonComponent>
          <ButtonComponent variant="secondary" size="small" icon={GitCompareArrows} onClick={() => setModal("compare")}>
            Compare…
          </ButtonComponent>
          <ButtonComponent
            variant="text"
            size="small"
            icon={Download}
            onClick={() => void BenchmarkApi.downloadExport(run.id, "csv").then((blob) => download(blob, `benchmark-${run.id.slice(0, 8)}.csv`))}
          >
            CSV
          </ButtonComponent>
          <ButtonComponent
            variant="text"
            size="small"
            icon={Download}
            onClick={() => void BenchmarkApi.downloadExport(run.id, "json").then((blob) => download(blob, `benchmark-${run.id.slice(0, 8)}.json`))}
          >
            JSON
          </ButtonComponent>
          <span className={styles["spacer"]} />
          <ButtonComponent
            variant="text"
            size="small"
            icon={Trash2}
            onClick={() => {
              if (!window.confirm("Delete this run, its answers and its battles?")) return;
              void BenchmarkApi.deleteRun(run.id).then(() => router.push("/benchmarks"));
            }}
          >
            Delete
          </ButtonComponent>
        </div>
        {error && <p className={styles["error-text"]}>{error}</p>}
      </header>

      <TabBarComponent tabs={TABS} activeTab={tab} onChange={setTab} ariaLabel="Run sections" />

      {(tab === "overview" || tab === "cases") && run.suites.length > 1 && (
        <div className={styles["toolbar"]}>
          <SegmentedControlComponent
            value={tab === "cases" ? (caseSuite ?? "") : scope}
            onChange={setScope}
            segments={tab === "cases" ? scopes.filter((entry) => entry.value !== "overall") : scopes}
            compact
          />
        </div>
      )}

      {tab === "overview" &&
        (!report ? (
          <LoadingStateComponent message="Computing the report…" />
        ) : (
          <>
            <div className={styles["toolbar"]}>
              <SwitchComponent checked={excludeErrors} onChange={setExcludeErrors} label="Leave out infrastructure errors" />
              <span className={`${styles["small"]} ${styles["muted"]}`}>
                Off: an answer that never came (provider, harness or workspace failure) counts as a fail. Refusals and timeouts always count.
              </span>
            </div>
            <RunOverviewComponent run={run} report={report} scope={effectiveScope} />
          </>
        ))}

      {tab === "cases" &&
        (!report || !samples || !caseSuite ? (
          <LoadingStateComponent message="Loading cases…" />
        ) : (
          <CaseMatrixComponent run={run} report={report} suiteId={caseSuite} samples={samples} onOpenCase={(suiteId, caseId) => setOpenCase({ suiteId, caseId })} />
        ))}

      {tab === "samples" &&
        (!samples ? (
          <LoadingStateComponent message="Loading samples…" />
        ) : (
          <SamplesTable run={run} samples={samples} onOpen={(sample) => setOpenCase({ suiteId: sample.suiteId, caseId: sample.caseId })} />
        ))}

      {tab === "arena" && (
        <div className={styles["section"]} style={{ gap: 24 }}>
          <section className={styles["section"]}>
            <div className={styles["section-header"]}>
              <h2 className={styles["section-title"]}>Judge battles</h2>
              {!live && run.contestants.length > 1 && (
                <ButtonComponent variant="secondary" size="small" icon={Swords} onClick={() => setModal("pairwise")}>
                  Judge head to head
                </ButtonComponent>
              )}
            </div>
            {report?.arena ? <ArenaStandingsComponent report={report.arena} /> : <p className={styles["section-hint"]}>No judge battles in this run yet.</p>}
          </section>
          <section className={styles["section"]}>
            <div className={styles["section-header"]}>
              <h2 className={styles["section-title"]}>Your blind votes</h2>
              <p className={styles["section-hint"]}>Kept apart from the judge&apos;s — comparing the two is how you learn whether to trust the judge.</p>
            </div>
            {humanArena && humanArena.battles > 0 && <ArenaStandingsComponent report={humanArena} showMatrix={false} />}
            {run.contestants.length > 1 ? (
              <BlindVoteComponent
                runId={run.id}
                onVoted={() =>
                  void BenchmarkApi.arena({ source: "human", runId: run.id })
                    .then(setHumanArena)
                    .catch(() => {})
                }
              />
            ) : (
              <p className={styles["section-hint"]}>Blind review needs two or more contestants.</p>
            )}
          </section>
        </div>
      )}

      {tab === "setup" && <RunSetupComponent run={run} />}

      <DrawerComponent open={!!openCase} onClose={() => setOpenCase(null)} title={openCase ? `Case ${openCase.caseId}` : ""} anchor="right" width="min(960px, 96vw)" contentKey={openCase ? `${openCase.suiteId}/${openCase.caseId}` : null}>
        {openCase && (
          <CaseDetailComponent
            run={run}
            suiteId={openCase.suiteId}
            caseId={openCase.caseId}
            onChanged={() => {
              void loadReport();
              void loadSamples();
            }}
          />
        )}
      </DrawerComponent>

      {modal === "pairwise" && (
        <PairwiseModal
          run={run}
          onClose={() => setModal(null)}
          onStarted={() => {
            setModal(null);
            void loadRun().then((loaded) => loaded && follow());
          }}
        />
      )}
      {modal === "compare" && <CompareModal run={run} onClose={() => setModal(null)} />}
    </div>
  );
}
