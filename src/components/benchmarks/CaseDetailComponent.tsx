"use client";

/**
 * One case of a run, every contestant's answers to it: the input and the
 * reference, then per contestant and epoch the answer, the thinking, the
 * tool trace, each scorer's verdict (with the judges' reasoning), the
 * cost and timing — and a pass/fail you can set by hand.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import {
  BadgeComponent,
  ButtonComponent,
  CollapsibleBlockComponent,
  LoadingStateComponent,
  MarkdownContentComponent,
  SegmentedControlComponent,
} from "@rodrigo-barraza/components-library";
import BenchmarkApi from "../../services/BenchmarkApi";
import type { BenchmarkRun, BenchmarkSample, ScoreResult, SuiteCase } from "../../types/benchmarks";
import { compact, duration, ERROR_KIND_LABELS, money, percent, seriesColor } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import styles from "./Benchmarks.module.css";

const stringify = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

function ScoreRow({ score }: { score: ScoreResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBlock: 6, borderBlockEnd: "1px solid var(--calculated-border-subtle)" }}>
      <div className={styles["row"]}>
        {score.skipped ? (
          <span className={styles["chip"]}>skipped</span>
        ) : score.passed ? (
          <Check size={14} aria-label="passed" style={{ color: "var(--bench-good)" }} />
        ) : (
          <X size={14} aria-label="failed" style={{ color: "var(--bench-bad)" }} />
        )}
        <span style={{ fontWeight: 500 }}>{score.label}</span>
        {!score.required && <span className={styles["chip"]}>optional</span>}
        {score.value > 0 && score.value < 1 && <span className={styles["chip"]}>{percent(score.value)}</span>}
        {score.cost ? <span className={`${styles["small"]} ${styles["muted"]}`}>{money(score.cost)}</span> : null}
      </div>
      {(score.answer || score.expected) && (
        <div className={styles["small"]}>
          {score.answer && (
            <span>
              read <span className={styles["mono"]}>{score.answer}</span>
            </span>
          )}
          {score.expected && (
            <span className={styles["muted"]}>
              {" "}
              · expected <span className={styles["mono"]}>{score.expected}</span>
            </span>
          )}
        </div>
      )}
      {score.explanation && <div className={`${styles["small"]} ${styles["muted"]}`}>{score.explanation}</div>}
      {score.error && <div className={styles["error-text"]}>{score.error}</div>}
      {score.judges?.map((vote, index) => (
        <div key={index} className={styles["small"]} style={{ paddingInlineStart: 20 }}>
          <span className={styles["muted"]}>{vote.model}:</span> <strong>{vote.verdict ?? (vote.passed ? "pass" : "fail")}</strong>
          {vote.reasoning ? ` — ${vote.reasoning}` : ""}
          {vote.error && <span className={styles["error-text"]}> {vote.error}</span>}
        </div>
      ))}
    </div>
  );
}

function SampleView({ sample, onOverride }: { sample: BenchmarkSample; onOverride: (passed: boolean | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const override = async (passed: boolean | null) => {
    setBusy(true);
    try {
      await onOverride(passed);
    } finally {
      setBusy(false);
    }
  };
  const passed = sample.override ? sample.override.passed : sample.passed;
  return (
    <div className={styles["section"]} style={{ gap: 10 }}>
      <div className={styles["row"]}>
        {sample.status === "done" ? (
          <BadgeComponent variant={passed ? "success" : "error"}>{passed ? "passed" : "failed"}</BadgeComponent>
        ) : (
          <BadgeComponent variant={sample.status === "error" ? "warning" : "info"}>{sample.status === "error" && sample.error ? ERROR_KIND_LABELS[sample.error.kind] : sample.status}</BadgeComponent>
        )}
        {sample.override && <span className={styles["chip"]}>graded by {sample.override.by}</span>}
        {typeof sample.score === "number" && <span className={styles["chip"]}>score {percent(sample.score)}</span>}
        <span className={`${styles["small"]} ${styles["muted"]}`}>
          {duration(sample.latencyMs)}
          {sample.ttftMs !== null ? ` (first token ${duration(sample.ttftMs)})` : ""} · {money(sample.cost)}
          {sample.judgeCost > 0 ? ` + ${money(sample.judgeCost)} judges` : ""}
          {sample.usage ? ` · ${compact(sample.usage.inputTokens)} in / ${compact(sample.usage.outputTokens)} out` : ""}
          {sample.output && sample.output.turns > 1 ? ` · ${sample.output.turns} turns` : ""}
          {sample.attempts > 1 ? ` · ${sample.attempts} attempts` : ""}
        </span>
        <span className={styles["spacer"]} />
        {sample.status === "done" || sample.status === "error" ? (
          <span className={styles["row"]}>
            <ButtonComponent variant="secondary" size="small" icon={Check} disabled={busy} onClick={() => void override(true)}>
              Mark pass
            </ButtonComponent>
            <ButtonComponent variant="secondary" size="small" icon={X} disabled={busy} onClick={() => void override(false)}>
              Mark fail
            </ButtonComponent>
            {sample.override && (
              <ButtonComponent variant="text" size="small" icon={RotateCcw} disabled={busy} onClick={() => void override(null)}>
                Clear
              </ButtonComponent>
            )}
          </span>
        ) : null}
      </div>
      {sample.error && <p className={styles["error-text"]}>{sample.error.message}</p>}
      {sample.output?.thinking && (
        <CollapsibleBlockComponent label="Thinking" defaultCollapsed>
          <pre className={styles["code-block"]}>{sample.output.thinking}</pre>
        </CollapsibleBlockComponent>
      )}
      {sample.output && sample.output.toolCalls.length > 0 && (
        <CollapsibleBlockComponent label={`Tool calls (${sample.output.toolCalls.length})`} defaultCollapsed>
          <div className={styles["section"]} style={{ gap: 8 }}>
            {sample.output.toolCalls.map((call, index) => (
              <div key={call.id ?? index}>
                <div className={styles["small"]}>
                  <strong>{call.name ?? "tool"}</strong> <span className={call.status === "error" ? styles["chip-bad"] : styles["muted"]}>{call.status}</span>
                </div>
                {call.args !== undefined && <pre className={styles["code-block"]}>{stringify(call.args)}</pre>}
                {call.result !== undefined && <pre className={styles["code-block"]} style={{ maxBlockSize: 180 }}>{stringify(call.result)}</pre>}
              </div>
            ))}
          </div>
        </CollapsibleBlockComponent>
      )}
      {sample.output?.text ? (
        <div className={styles["card"]} style={{ padding: 12, background: "var(--background-base)" }}>
          <MarkdownContentComponent content={sample.output.text} />
        </div>
      ) : (
        sample.status === "done" && <p className={styles["muted"]}>(empty answer)</p>
      )}
      {sample.scores.length > 0 && (
        <div>
          {sample.scores.map((score) => (
            <ScoreRow key={score.index} score={score} />
          ))}
        </div>
      )}
      {sample.override?.note && <p className={styles["section-hint"]}>Note: {sample.override.note}</p>}
    </div>
  );
}

export default function CaseDetailComponent({
  run,
  suiteId,
  caseId,
  onChanged,
}: {
  run: BenchmarkRun;
  suiteId: string;
  caseId: string;
  onChanged: () => void;
}) {
  const [samples, setSamples] = useState<BenchmarkSample[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState("1");
  const suite = run.suites.find((candidate) => candidate.id === suiteId);
  const datasetCase: SuiteCase | undefined = suite?.cases.find((candidate) => candidate.id === caseId);

  const load = useCallback(() => {
    BenchmarkApi.samples(run.id, { suiteId, caseId, full: true })
      .then(setSamples)
      .catch((caught) => setError(getErrorMessage(caught)));
  }, [run.id, suiteId, caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const byContestant = useMemo(() => {
    const map = new Map<string, BenchmarkSample>();
    for (const sample of samples ?? []) if (String(sample.epoch) === epoch) map.set(sample.contestantKey, sample);
    return map;
  }, [samples, epoch]);

  const overrideSample = async (sample: BenchmarkSample, passed: boolean | null) => {
    const note = passed === null ? undefined : window.prompt("A note on your verdict (optional)") ?? undefined;
    await BenchmarkApi.overrideSample(run.id, sample.id, passed === null ? null : { passed, note });
    load();
    onChanged();
  };

  if (error) return <p className={styles["error-text"]}>{error}</p>;
  if (!datasetCase) return <p className={styles["muted"]}>This case is not in the run.</p>;
  const messages = typeof datasetCase.input === "string" ? [{ role: "user", content: datasetCase.input }] : datasetCase.input;
  const targets = datasetCase.target === undefined || datasetCase.target === null ? [] : Array.isArray(datasetCase.target) ? datasetCase.target : [datasetCase.target];

  return (
    <div className={styles["section"]} style={{ gap: 16 }}>
      <div className={styles["card"]}>
        <div className={`${styles["small"]} ${styles["muted"]}`}>
          {suite?.name} · {caseId}
          {datasetCase.tags?.length ? ` · ${datasetCase.tags.join(", ")}` : ""}
        </div>
        {(datasetCase.systemPrompt ?? suite?.systemPrompt) && (
          <CollapsibleBlockComponent label="System prompt" defaultCollapsed>
            <pre className={styles["code-block"]}>{datasetCase.systemPrompt ?? suite?.systemPrompt}</pre>
          </CollapsibleBlockComponent>
        )}
        {messages.map((message, index) => (
          <div key={index} style={{ marginBlockStart: 8 }}>
            {messages.length > 1 && <div className={`${styles["small"]} ${styles["muted"]}`}>{message.role}</div>}
            <MarkdownContentComponent content={message.content} />
          </div>
        ))}
        {targets.length > 0 && (
          <div className={styles["small"]} style={{ marginBlockStart: 8 }}>
            <span className={styles["muted"]}>Reference:</span> <span className={styles["mono"]}>{targets.join(" | ")}</span>
          </div>
        )}
      </div>
      {run.settings.epochs > 1 && (
        <SegmentedControlComponent
          value={epoch}
          onChange={setEpoch}
          segments={Array.from({ length: run.settings.epochs }, (_, index) => ({ value: String(index + 1), label: `Epoch ${index + 1}` }))}
          compact
        />
      )}
      {!samples ? (
        <LoadingStateComponent message="Loading answers…" />
      ) : (
        run.contestants.map((contestant, index) => {
          const sample = byContestant.get(contestant.key);
          return (
            <section key={contestant.key} className={styles["card"]}>
              <div className={styles["row"]} style={{ marginBlockEnd: 8 }}>
                <span className={styles["swatch"]} style={{ background: seriesColor(index) }} aria-hidden />
                <strong>{contestant.label}</strong>
              </div>
              {sample ? <SampleView sample={sample} onOverride={(passed) => overrideSample(sample, passed)} /> : <p className={styles["muted"]}>No sample for this epoch.</p>}
            </section>
          );
        })
      )}
    </div>
  );
}
