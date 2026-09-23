"use client";

/**
 * /benchmarks/new — build a run: which suites (and how many of their
 * cases), which contestants (models, agents, variants of either), how
 * many epochs, which judges, what budget. The estimate beside it says
 * what the run will cost, how long it may take, and the smallest
 * difference between two contestants it can detect.
 *
 * Prefill: ?suites=a,b · ?preset=quick · ?fromRun=<id>
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Bot, ChevronDown, ChevronUp, Copy, Cpu, Play, Save, Trash2 } from "lucide-react";
import {
  ButtonComponent,
  CheckboxComponent,
  IconButtonComponent,
  LoadingStateComponent,
  PageHeroComponent,
  SegmentedControlComponent,
} from "@rodrigo-barraza/components-library";
import ModelPickerPopoverComponent, { type ExtendedModelOption } from "../ModelPickerPopoverComponent";
import BenchmarkApi, { type BenchmarkOptions, type EstimateResponse, type RunRequest } from "../../services/BenchmarkApi";
import PrismService from "../../services/PrismService";
import type { ContestantLineup, ContestantSpec, PairwiseMode, SuiteSummary } from "../../types/benchmarks";
import type { PrismConfig } from "../../types/types";
import { contestantChips, duration, money, moneyRange, percent, seriesColor } from "../../utils/benchmarkFormat";
import { getErrorMessage } from "../../utils/errorMessage";
import ContestantEditorComponent, { modelLabel } from "./ContestantEditorComponent";
import styles from "./Benchmarks.module.css";
import builder from "./RunBuilder.module.css";

interface Entry {
  id: string;
  spec: ContestantSpec;
  open: boolean;
}

const QUICK_SUITES = ["builtin.smoke", "builtin.reasoning", "builtin.instructions"];
const EPOCH_CHOICES = ["1", "2", "3", "5", "8"];
const SAMPLE_CHOICES = ["all", "10", "25", "50", "100", "200"];

let entryCounter = 0;
const newEntry = (spec: ContestantSpec, open = false): Entry => ({ id: `entry-${++entryCounter}`, spec, open });

/** The config's recommended model (the agentic one for an agent), as a model contestant. */
function defaultModelOf(config: PrismConfig | null, agentic = false): ContestantSpec {
  const recommended = (agentic ? config?.textToText?.recommendedAgenticDefault : null) ?? config?.textToText?.recommendedDefault;
  return { kind: "model", provider: recommended?.provider ?? "google", model: recommended?.model ?? "" };
}

function decodeContestants(raw: string | null): ContestantSpec[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(parsed) ? (parsed as ContestantSpec[]) : [];
  } catch {
    return [];
  }
}

export default function RunBuilderComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [options, setOptions] = useState<BenchmarkOptions | null>(null);
  const [suites, setSuites] = useState<SuiteSummary[] | null>(null);
  const [lineups, setLineups] = useState<ContestantLineup[]>([]);
  const [selectedSuites, setSelectedSuites] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [epochs, setEpochs] = useState("1");
  const [sampleLimit, setSampleLimit] = useState("all");
  const [customSample, setCustomSample] = useState("");
  const [sampleSeed, setSampleSeed] = useState("1");
  const [judges, setJudges] = useState<string[]>([]);
  const [pairwiseMode, setPairwiseMode] = useState<PairwiseMode>("off");
  const [baselineIndex, setBaselineIndex] = useState(0);
  const [budget, setBudget] = useState("");
  const [concurrency, setConcurrency] = useState("");
  const [providerConcurrency, setProviderConcurrency] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [name, setName] = useState("");
  const [estimateState, setEstimateState] = useState<{ key: string; estimate: EstimateResponse | null; error: string | null } | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialParams = useRef(searchParams);
  const defaultModel = useCallback((agentic = false) => defaultModelOf(config, agentic), [config]);

  // ── Load everything the form offers, then prefill from the URL ──
  useEffect(() => {
    const params = initialParams.current;
    const prefill = async (loadedConfig: PrismConfig, loadedSuites: SuiteSummary[]) => {
      const known = new Set(loadedSuites.map((suite) => suite.id));
      const fromRun = params.get("fromRun");
      if (fromRun) {
        const run = await BenchmarkApi.run(fromRun);
        setSelectedSuites(run.suites.map((suite) => suite.id).filter((id) => known.has(id)));
        setEntries(run.contestants.map(({ key: _key, ...spec }) => newEntry(spec)));
        setEpochs(String(run.settings.epochs));
        setJudges(run.settings.judges);
        setPairwiseMode(run.settings.pairwise.mode);
        if (run.settings.sampleLimit) {
          setSampleLimit(SAMPLE_CHOICES.includes(String(run.settings.sampleLimit)) ? String(run.settings.sampleLimit) : "custom");
          setCustomSample(String(run.settings.sampleLimit));
        }
        setSampleSeed(String(run.settings.sampleSeed ?? 1));
        if (run.settings.budgetUsd) setBudget(String(run.settings.budgetUsd));
        setName(`${run.name} (variant)`);
        return;
      }
      const suiteParam = params.get("suites");
      if (suiteParam) setSelectedSuites(suiteParam.split(",").filter((id) => known.has(id)));
      else if (params.get("preset") === "quick") setSelectedSuites(QUICK_SUITES.filter((id) => known.has(id)));
      const encoded = decodeContestants(params.get("contestants"));
      setEntries(encoded.length > 0 ? encoded.map((spec) => newEntry(spec)) : [newEntry(defaultModelOf(loadedConfig))]);
    };
    Promise.all([PrismService.getConfigWithLocalModels(), BenchmarkApi.options(), BenchmarkApi.suites(), BenchmarkApi.lineups().catch(() => [])])
      .then(async ([loadedConfig, loadedOptions, loadedSuites, loadedLineups]) => {
        setConfig(loadedConfig);
        setOptions(loadedOptions);
        setSuites(loadedSuites);
        setLineups(loadedLineups);
        await prefill(loadedConfig, loadedSuites).catch(() => {});
      })
      .catch((caught) => setLoadError(getErrorMessage(caught)));
  }, []);

  // ── The request the form describes ───────────────────────
  const requestBody = useMemo<RunRequest | null>(() => {
    const contestants = entries.map((entry) => entry.spec).filter((spec) => spec.provider && spec.model);
    if (selectedSuites.length === 0 || contestants.length === 0) return null;
    const limit = sampleLimit === "all" ? null : sampleLimit === "custom" ? Number(customSample) || null : Number(sampleLimit);
    const optionalNumber = (text: string) => (text.trim() && Number.isFinite(Number(text)) ? Number(text) : undefined);
    return {
      name: name.trim() || null,
      suiteIds: selectedSuites,
      contestants,
      settings: {
        epochs: Number(epochs),
        sampleLimit: limit,
        sampleSeed: Number(sampleSeed) || 1,
        judges,
        budgetUsd: optionalNumber(budget) ?? null,
        concurrency: optionalNumber(concurrency),
        providerConcurrency: optionalNumber(providerConcurrency),
        timeoutSeconds: optionalNumber(timeoutSeconds),
        maxAttempts: optionalNumber(maxAttempts),
        pairwise: { mode: pairwiseMode, baselineIndex: pairwiseMode === "vs_baseline" ? baselineIndex : null },
      },
    };
  }, [entries, selectedSuites, sampleLimit, customSample, sampleSeed, epochs, judges, budget, concurrency, providerConcurrency, timeoutSeconds, maxAttempts, pairwiseMode, baselineIndex, name]);

  // ── Estimate, debounced; keyed by the request it is about ──
  const requestKey = useMemo(() => (requestBody ? JSON.stringify(requestBody) : null), [requestBody]);
  useEffect(() => {
    if (!requestBody || !requestKey) return;
    const timer = setTimeout(() => {
      BenchmarkApi.estimate(requestBody)
        .then((result) => setEstimateState({ key: requestKey, estimate: result, error: null }))
        .catch((caught) => setEstimateState({ key: requestKey, estimate: null, error: getErrorMessage(caught) }));
    }, 500);
    return () => clearTimeout(timer);
  }, [requestBody, requestKey]);
  const currentEstimate = estimateState && estimateState.key === requestKey ? estimateState : null;
  // While a new estimate loads, the previous one stays on screen, dimmed.
  const estimate = requestKey ? (currentEstimate?.estimate ?? estimateState?.estimate ?? null) : null;
  const estimating = !!requestKey && !currentEstimate;
  const estimateError = currentEstimate?.error ?? launchError;

  // ── Contestant list edits ────────────────────────────────
  const modelKeys = useMemo(
    () => new Set(entries.filter((entry) => entry.spec.kind === "model").map((entry) => `${entry.spec.provider}:${entry.spec.model}`)),
    [entries],
  );
  const toggleModel = (model: ExtendedModelOption) => {
    const key = `${model.provider}:${model.name}`;
    setEntries((current) =>
      modelKeys.has(key)
        ? current.filter((entry) => !(entry.spec.kind === "model" && `${entry.spec.provider}:${entry.spec.model}` === key && !entry.spec.effort && !entry.spec.systemPrompt))
        : [...current, newEntry({ kind: "model", provider: model.provider, model: model.name })],
    );
  };
  const addAgent = () => {
    const agent = options?.agents.find((candidate) => candidate.id === "CODING") ?? options?.agents[0];
    setEntries((current) => [...current, newEntry({ ...defaultModel(true), kind: "agent", agent: agent?.id ?? "CODING" }, true)]);
  };
  const update = (id: string, patch: Partial<Entry>) => setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const duplicate = (entry: Entry) =>
    setEntries((current) => {
      const index = current.findIndex((candidate) => candidate.id === entry.id);
      const copy = newEntry({ ...structuredClone(entry.spec), label: null }, true);
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
  const removeEntry = (id: string) => setEntries((current) => current.filter((entry) => entry.id !== id));

  const judgeKeys = useMemo(() => new Set(judges), [judges]);
  const toggleJudge = (model: ExtendedModelOption) => {
    const key = `${model.provider}:${model.name}`;
    setJudges((current) => (current.includes(key) ? current.filter((judge) => judge !== key) : [...current, key]));
  };

  const saveLineup = async () => {
    const lineupName = window.prompt("Name this lineup");
    if (!lineupName?.trim()) return;
    const saved = await BenchmarkApi.saveLineup({ name: lineupName.trim(), contestants: entries.map((entry) => entry.spec) });
    setLineups((current) => [saved, ...current.filter((lineup) => lineup.id !== saved.id)]);
  };
  const loadLineup = (id: string) => {
    const lineup = lineups.find((candidate) => candidate.id === id);
    if (lineup) setEntries((current) => [...current, ...lineup.contestants.map((spec) => newEntry(spec))]);
  };

  const launch = async () => {
    if (!requestBody) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const run = await BenchmarkApi.startRun(requestBody);
      router.push(`/benchmarks/runs/${run.id}`);
    } catch (caught) {
      setLaunchError(getErrorMessage(caught));
      setLaunching(false);
    }
  };

  if (loadError) return <p className={styles["error-text"]}>Could not load: {loadError}</p>;
  if (!config || !options || !suites) return <LoadingStateComponent message="Loading models, agents and suites…" />;

  const labelOf = (spec: ContestantSpec) =>
    spec.label ||
    [spec.kind === "agent" ? options.agents.find((agent) => agent.id === spec.agent)?.name ?? spec.agent : null, modelLabel(config, spec.provider, spec.model) || "no model yet"]
      .filter(Boolean)
      .join(" · ");
  const selectedCount = suites.filter((suite) => selectedSuites.includes(suite.id)).reduce((sum, suite) => sum + suite.caseCount, 0);
  const blockers = [
    selectedSuites.length === 0 ? "pick at least one suite" : null,
    entries.filter((entry) => entry.spec.model).length === 0 ? "add a contestant" : null,
  ].filter(Boolean);

  return (
    <div className={`${styles["theme"]} ${styles["page"]}`}>
      <PageHeroComponent
        variant="row"
        icon={Play}
        title="New benchmark run"
        subtitle="Pick suites, pick contestants — models, agents or variants of either — and how carefully to measure. The run works in the background; you can close this page."
      />
      <div className={builder["layout"]}>
        <div className={builder["main"]}>
          {/* ── Suites ───────────────────────────────────── */}
          <section className={styles["section"]}>
            <div className={styles["section-header"]}>
              <h2 className={styles["section-title"]}>1 · What to test</h2>
              <button type="button" className={styles["link-button"]} onClick={() => router.push("/benchmarks?tab=suites")}>
                Import or create suites →
              </button>
            </div>
            <div className={builder["suite-list"]}>
              {suites.map((suite) => (
                <label key={suite.id} className={`${builder["suite-option"]} ${selectedSuites.includes(suite.id) ? builder["suite-option-selected"] : ""}`}>
                  <CheckboxComponent
                    checked={selectedSuites.includes(suite.id)}
                    onChange={(checked) => setSelectedSuites((current) => (checked ? [...current, suite.id] : current.filter((id) => id !== suite.id)))}
                  />
                  <span style={{ minInlineSize: 0 }}>
                    <span className={builder["suite-name"]}>{suite.name}</span>
                    <span className={`${styles["small"]} ${styles["muted"]}`}>
                      {suite.caseCount} cases · {suite.source.kind === "builtin" ? "built-in" : suite.source.kind === "import" ? suite.source.ref : "custom"}
                      {suite.tools.mode === "list" ? " · tools" : ""}
                      {suite.workspace ? " · workspace" : ""}
                      {suite.scorers.some((scorer) => ["rubric", "checklist", "reference", "pairwise_reference"].includes(scorer.type)) ? " · judged" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className={styles["row"]}>
              <span className={styles["field-label"]}>Cases per suite</span>
              <SegmentedControlComponent
                value={sampleLimit}
                onChange={setSampleLimit}
                segments={[...SAMPLE_CHOICES.map((choice) => ({ value: choice, label: choice === "all" ? "All" : choice })), { value: "custom", label: "…" }]}
                compact
              />
              {sampleLimit === "custom" && (
                <input className={styles["native-input"]} style={{ inlineSize: 90 }} type="number" min={1} value={customSample} onChange={(event) => setCustomSample(event.target.value)} aria-label="Cases per suite" />
              )}
              {sampleLimit !== "all" && (
                <label className={styles["row"]}>
                  <span className={`${styles["small"]} ${styles["muted"]}`}>seed</span>
                  <input className={styles["native-input"]} style={{ inlineSize: 70 }} type="number" value={sampleSeed} onChange={(event) => setSampleSeed(event.target.value)} aria-label="Sampling seed" />
                </label>
              )}
              <span className={`${styles["small"]} ${styles["muted"]}`}>{selectedCount} cases selected in total</span>
            </div>
          </section>

          {/* ── Contestants ──────────────────────────────── */}
          <section className={styles["section"]}>
            <div className={styles["section-header"]}>
              <h2 className={styles["section-title"]}>2 · Who competes</h2>
              <div className={styles["toolbar"]}>
                <ModelPickerPopoverComponent
                  config={config}
                  multiSelect
                  selectedKeys={modelKeys}
                  onSelectModel={toggleModel}
                  modelTypeFilter="conversation"
                  triggerLabel="Add models"
                  triggerIcon={<Cpu size={14} />}
                />
                <ButtonComponent variant="secondary" size="small" icon={Bot} onClick={addAgent}>
                  Add agent
                </ButtonComponent>
                {lineups.length > 0 && (
                  <select className={styles["native-select"]} style={{ inlineSize: "auto" }} value="" onChange={(event) => loadLineup(event.target.value)} aria-label="Load a lineup">
                    <option value="">Load lineup…</option>
                    {lineups.map((lineup) => (
                      <option key={lineup.id} value={lineup.id}>
                        {lineup.name} ({lineup.contestants.length})
                      </option>
                    ))}
                  </select>
                )}
                {entries.length > 0 && (
                  <IconButtonComponent icon={<Save size={14} />} tooltip="Save these contestants as a lineup" onClick={() => void saveLineup()} />
                )}
              </div>
            </div>
            <p className={styles["section-hint"]}>
              A variant is a contestant too: duplicate one and change a single setting (effort, prompt, iterations…) to measure what that setting is worth — on the same cases, with a paired test.
            </p>
            {entries.length === 0 && <div className={`${styles["card"]} ${styles["empty"]}`}>Add models or agents to compare.</div>}
            {entries.map((entry, index) => {
              const chips = contestantChips(entry.spec);
              return (
                <div key={entry.id} className={styles["card"]}>
                  <div className={styles["row"]} style={{ flexWrap: "nowrap" }}>
                    <span className={styles["swatch"]} style={{ background: seriesColor(index) }} aria-hidden />
                    {entry.spec.kind === "agent" ? <Bot size={14} aria-label="agent" /> : <Cpu size={14} aria-label="model" />}
                    <button type="button" className={builder["entry-title"]} onClick={() => update(entry.id, { open: !entry.open })} aria-expanded={entry.open}>
                      {labelOf(entry.spec)}
                    </button>
                    <span className={styles["row"]} style={{ flex: 1, minInlineSize: 0 }}>
                      {chips.slice(0, 5).map((chip) => (
                        <span key={chip} className={styles["chip"]}>
                          {chip}
                        </span>
                      ))}
                    </span>
                    <IconButtonComponent icon={entry.open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} tooltip={entry.open ? "Collapse" : "Settings"} onClick={() => update(entry.id, { open: !entry.open })} />
                    <IconButtonComponent icon={<Copy size={14} />} tooltip="Duplicate as a variant" onClick={() => duplicate(entry)} />
                    <IconButtonComponent icon={<Trash2 size={14} />} tooltip="Remove" variant="destructive" onClick={() => removeEntry(entry.id)} />
                  </div>
                  {entry.open && (
                    <div style={{ marginBlockStart: 12 }}>
                      <ContestantEditorComponent value={entry.spec} onChange={(spec) => update(entry.id, { spec })} config={config} agents={options.agents} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* ── Method ───────────────────────────────────── */}
          <section className={styles["section"]}>
            <h2 className={styles["section-title"]}>3 · How carefully</h2>
            <div className={styles["card"]}>
              <div className={styles["field"]}>
                <span className={styles["field-label"]}>Epochs — answers per case per contestant</span>
                <SegmentedControlComponent value={epochs} onChange={setEpochs} segments={EPOCH_CHOICES.map((choice) => ({ value: choice, label: choice }))} compact />
                <span className={styles["field-hint"]}>
                  More epochs shrink the noise in each case and give pass@k (solved at least once in k) and pass^k (solved every time — τ-bench&apos;s reliability number). Use 3+ for agents and small suites.
                </span>
              </div>
            </div>
            <div className={styles["card"]}>
              <div className={styles["field"]}>
                <span className={styles["field-label"]}>Judges for model-graded scorers</span>
                <div className={styles["row"]}>
                  <ModelPickerPopoverComponent
                    config={config}
                    multiSelect
                    selectedKeys={judgeKeys}
                    onSelectModel={toggleJudge}
                    modelTypeFilter="conversation"
                    triggerLabel={judges.length === 0 ? "Default judge" : `${judges.length} judge${judges.length === 1 ? "" : "s"}`}
                  />
                  {judges.map((judge) => (
                    <span key={judge} className={styles["chip"]}>
                      {judge.split(":").slice(1).join(":")}
                    </span>
                  ))}
                  {judges.length === 0 && options.defaultJudge && <span className={`${styles["small"]} ${styles["muted"]}`}>{options.defaultJudge.split(":").slice(1).join(":")}</span>}
                </div>
                <span className={styles["field-hint"]}>Several judges form a panel (majority vote) — use judges from another provider than your contestants: judges favour their own family.</span>
              </div>
              <div className={styles["field"]} style={{ marginBlockStart: 14 }}>
                <span className={styles["field-label"]}>Head-to-head judging after the run</span>
                <div className={styles["row"]}>
                  <SegmentedControlComponent
                    value={pairwiseMode}
                    onChange={(value) => setPairwiseMode(value as PairwiseMode)}
                    segments={[
                      { value: "off", label: "Off" },
                      { value: "all_pairs", label: "Every pair" },
                      { value: "vs_baseline", label: "Vs a baseline", disabled: entries.length < 2 },
                    ]}
                    compact
                  />
                  {pairwiseMode === "vs_baseline" && (
                    <select className={styles["native-select"]} style={{ inlineSize: "auto" }} value={baselineIndex} onChange={(event) => setBaselineIndex(Number(event.target.value))} aria-label="Baseline">
                      {entries.map((entry, index) => (
                        <option key={entry.id} value={index}>
                          {labelOf(entry.spec)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <span className={styles["field-hint"]}>The judge compares two answers to the same case, twice with the sides swapped; the battles fit arena ratings for the run (Bradley–Terry).</span>
              </div>
            </div>
            <details className={styles["card"]}>
              <summary className={styles["field-label"]} style={{ cursor: "pointer" }}>
                Budget, concurrency and limits
              </summary>
              <div className={styles["field-grid"]} style={{ marginBlockStart: 12 }}>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Budget (USD)</span>
                  <input className={styles["native-input"]} type="number" min={0} step={0.5} placeholder="no cap" value={budget} onChange={(event) => setBudget(event.target.value)} />
                  <span className={styles["field-hint"]}>The run stops starting samples at this spend.</span>
                </label>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Samples at once</span>
                  <input className={styles["native-input"]} type="number" min={1} max={options.limits.maxConcurrency} placeholder={String(options.limits.defaultConcurrency)} value={concurrency} onChange={(event) => setConcurrency(event.target.value)} />
                </label>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Per provider</span>
                  <input className={styles["native-input"]} type="number" min={1} placeholder={String(options.limits.defaultProviderConcurrency)} value={providerConcurrency} onChange={(event) => setProviderConcurrency(event.target.value)} />
                </label>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Timeout per sample (s)</span>
                  <input className={styles["native-input"]} type="number" min={10} placeholder="240 model / 600 agent" value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(event.target.value)} />
                </label>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Attempts on provider errors</span>
                  <input className={styles["native-input"]} type="number" min={1} max={5} placeholder="3" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} />
                </label>
                <label className={styles["field"]}>
                  <span className={styles["field-label"]}>Run name</span>
                  <input className={styles["native-input"]} placeholder="derived from the suites" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
              </div>
            </details>
          </section>
        </div>

        {/* ── Estimate ───────────────────────────────────── */}
        <aside className={builder["aside"]}>
          <div className={`${styles["card"]} ${builder["estimate"]}`} aria-live="polite">
            <h2 className={styles["section-title"]}>Estimate</h2>
            {!requestBody ? (
              <p className={styles["section-hint"]}>To estimate: {blockers.join(" and ")}.</p>
            ) : estimateError ? (
              <p className={styles["error-text"]}>{estimateError}</p>
            ) : !estimate ? (
              <LoadingStateComponent message="Estimating…" />
            ) : (
              <div className={styles["section"]} style={{ opacity: estimating ? 0.6 : 1 }}>
                <div className={builder["estimate-total"]}>{moneyRange(estimate.total.low, estimate.total.high)}</div>
                <div className={`${styles["small"]} ${styles["muted"]}`}>
                  {estimate.samples} samples ({estimate.cases} cases × {estimate.contestants.length} × {estimate.settings.epochs})
                  {estimate.battles > 0 ? ` + ${estimate.battles} judged battles` : ""}
                  {estimate.minutes ? ` · ~${duration(estimate.minutes.low * 60_000)}–${duration(estimate.minutes.high * 60_000)}` : ""}
                </div>
                <table className={styles["table"]}>
                  <tbody>
                    {estimate.contestants.map((contestant, index) => {
                      const cost = estimate.perContestant[contestant.key];
                      return (
                        <tr key={contestant.key}>
                          <td>
                            <span className={styles["contestant"]}>
                              <span className={styles["swatch"]} style={{ background: seriesColor(index) }} aria-hidden />
                              <span className={styles["contestant-label"]} style={{ maxInlineSize: 170 }} title={contestant.label}>
                                {contestant.label}
                              </span>
                            </span>
                          </td>
                          <td className={styles["numeric"]} title={cost?.basis === "history" ? "from this contestant's past samples" : cost?.basis === "pricing" ? "from catalog prices" : "no price known"}>
                            {cost ? (cost.basis === "unknown" ? "free?" : moneyRange(cost.low, cost.high)) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {estimate.judge.high > 0 && (
                      <tr>
                        <td className={styles["muted"]}>Judges</td>
                        <td className={styles["numeric"]}>{moneyRange(estimate.judge.low, estimate.judge.high)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {estimate.detectableDifference !== null && estimate.contestants.length > 1 && (
                  <p className={styles["section-hint"]}>
                    Can tell apart two contestants about <strong>{percent(estimate.detectableDifference, 0)}</strong> points apart (paired, 80% power). Smaller gaps will read as
                    &ldquo;not separated&rdquo;.
                  </p>
                )}
                {estimate.warnings.length > 0 && (
                  <ul className={styles["warning-list"]}>
                    {estimate.warnings.map((warning) => (
                      <li key={warning} className={styles["warning-item"]}>
                        <AlertTriangle size={13} className={styles["warning-icon"]} aria-hidden />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <ButtonComponent variant="primary" icon={Play} fullWidth loading={launching} disabled={!requestBody || !!currentEstimate?.error || launching} onClick={() => void launch()}>
              Start run{estimate ? ` · ${money(estimate.total.high)} max` : ""}
            </ButtonComponent>
          </div>
        </aside>
      </div>
    </div>
  );
}
