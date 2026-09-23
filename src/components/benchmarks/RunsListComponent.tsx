"use client";

/**
 * The runs of this project, newest first, with their live progress and
 * leader; below them, the scheduled runs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, Trash2 } from "lucide-react";
import { ButtonComponent, IconButtonComponent, LoadingStateComponent } from "@rodrigo-barraza/components-library";
import BenchmarkApi, { type BenchmarkSchedule } from "../../services/BenchmarkApi";
import type { RunListItem } from "../../types/benchmarks";
import { interval, isLiveStatus, money, percent, relativeTime } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import { RunProgressLine, RunStatusBadge } from "./BenchmarkBits";
import styles from "./Benchmarks.module.css";

const POLL_MILLISECONDS = 3000;

export default function RunsListComponent() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [schedules, setSchedules] = useState<BenchmarkSchedule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([BenchmarkApi.runs({ limit: 200 }), BenchmarkApi.schedules().catch(() => [])])
        .then(([loadedRuns, loadedSchedules]) => {
          setRuns(loadedRuns);
          setSchedules(loadedSchedules);
          setError(null);
        })
        .catch((caught) => setError(getErrorMessage(caught))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const anyLive = useMemo(() => (runs ?? []).some((run) => isLiveStatus(run.status)), [runs]);
  useEffect(() => {
    if (!anyLive) return;
    const timer = setInterval(() => void load(), POLL_MILLISECONDS);
    return () => clearInterval(timer);
  }, [anyLive, load]);

  const deleteRun = async (run: RunListItem) => {
    if (!window.confirm(`Delete "${run.name}" and every answer in it?`)) return;
    await BenchmarkApi.deleteRun(run.id);
    void load();
  };

  const rerun = async (run: RunListItem) => {
    const copy = await BenchmarkApi.rerun(run.id);
    router.push(`/benchmarks/runs/${copy.id}`);
  };

  const deleteSchedule = async (schedule: BenchmarkSchedule) => {
    if (!window.confirm(`Stop the schedule "${schedule.name}"? Its past runs stay.`)) return;
    await BenchmarkApi.deleteSchedule(schedule.id);
    void load();
  };

  if (error) return <p className={styles["error-text"]}>Could not load runs: {error}</p>;
  if (!runs) return <LoadingStateComponent message="Loading runs…" />;

  return (
    <div className={styles["section"]}>
      {runs.length === 0 ? (
        <div className={`${styles["card"]} ${styles["empty"]}`}>
          <p>No runs yet. A run evaluates one or more suites against the contestants you pick — models, agents, or both.</p>
          <div className={styles["row"]} style={{ justifyContent: "center" }}>
            <ButtonComponent variant="primary" onClick={() => router.push("/benchmarks/new?preset=quick")}>
              Check a model on the built-in suites
            </ButtonComponent>
            <ButtonComponent variant="secondary" onClick={() => router.push("/benchmarks?tab=suites")}>
              Browse suites
            </ButtonComponent>
          </div>
        </div>
      ) : (
        <div className={styles["table-scroll"]}>
          <table className={styles["table"]}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Contestants</th>
                <th>Leader</th>
                <th className={styles["numeric"]}>Cost</th>
                <th>Started</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const leader = run.results?.leader;
                const leaderCell = leader ? run.results?.overall[leader.key] : null;
                return (
                  <tr
                    key={run.id}
                    className={styles["clickable-row"]}
                    tabIndex={0}
                    onClick={() => router.push(`/benchmarks/runs/${run.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/benchmarks/runs/${run.id}`);
                    }}
                  >
                    <td>
                      <div style={{ fontWeight: 500 }}>{run.name}</div>
                      <div className={`${styles["small"]} ${styles["muted"]}`}>
                        {run.suites.map((suite) => `${suite.name} (${suite.caseCount})`).join(" · ")}
                        {run.settings.epochs > 1 ? ` · ${run.settings.epochs} epochs` : ""}
                        {run.scheduleId ? " · scheduled" : ""}
                      </div>
                    </td>
                    <td>
                      <div className={styles["row"]}>
                        <RunStatusBadge status={run.status} reason={run.statusReason} />
                        {run.regression?.regressed && <span className={`${styles["chip"]} ${styles["chip-bad"]}`}>regressed</span>}
                      </div>
                      {isLiveStatus(run.status) && <RunProgressLine progress={run.progress} status={run.status} />}
                    </td>
                    <td>
                      <span title={run.contestants.map((contestant) => contestant.label).join("\n")}>
                        {run.contestants.length === 1 ? run.contestants[0].label : `${run.contestants.length} contestants`}
                      </span>
                    </td>
                    <td>
                      {leader && leaderCell ? (
                        <span>
                          {leader.label}{" "}
                          <span className={styles["muted"]}>
                            {percent(leader.mean)} <span className={styles["small"]}>({interval(leaderCell)})</span>
                          </span>
                        </span>
                      ) : (
                        <span className={styles["muted"]}>—</span>
                      )}
                    </td>
                    <td className={styles["numeric"]}>{money(run.progress.cost + run.progress.judgeCost)}</td>
                    <td className={styles["muted"]}>{relativeTime(run.createdAt)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className={styles["row"]} style={{ flexWrap: "nowrap" }}>
                        <IconButtonComponent icon={<Copy size={14} />} tooltip="Run again" onClick={() => void rerun(run)} />
                        <IconButtonComponent icon={<Trash2 size={14} />} tooltip="Delete run" variant="destructive" onClick={() => void deleteRun(run)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {schedules.length > 0 && (
        <div className={styles["section"]}>
          <div className={styles["section-header"]}>
            <h2 className={styles["section-title"]}>
              <CalendarClock size={15} style={{ verticalAlign: "-2px" }} /> Scheduled runs
            </h2>
            <p className={styles["section-hint"]}>Each run is compared with the schedule&apos;s previous one; a significant drop alerts on ntfy and the webhook bus.</p>
          </div>
          <div className={styles["table-scroll"]}>
            <table className={styles["table"]}>
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>When</th>
                  <th>Contestants</th>
                  <th>Last run</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>{schedule.name}</td>
                    <td className={styles["mono"]}>{schedule.cronExpression || [schedule.scheduleType, schedule.scheduleTime].filter(Boolean).join(" ")}</td>
                    <td>{schedule.benchmark?.contestants.length ?? 0}</td>
                    <td className={styles["muted"]}>{relativeTime(schedule.lastRunAt)}</td>
                    <td>
                      <IconButtonComponent icon={<Trash2 size={14} />} tooltip="Delete schedule" variant="destructive" onClick={() => void deleteSchedule(schedule)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
