/**
 * benchmarkFormat — how benchmark numbers read on screen, and the colors
 * that carry contestant identity and score magnitude.
 */
import type {
  ContestantSpec,
  Interval,
  PairwiseComparison,
  RunStatus,
  SampleErrorKind,
  ScorerSpec,
} from "../types/benchmarks";

/** 0.734 → "73.4%" (0 and 1 print without the decimal). */
export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const scaled = value * 100;
  if (scaled === 0 || scaled === 100) return `${scaled}%`;
  return `${scaled.toFixed(digits)}%`;
}

/** A difference of two scores in percentage points, signed: +5.2 pts. */
export function points(diff: number | null | undefined, digits = 1): string {
  if (diff === null || diff === undefined || !Number.isFinite(diff)) return "—";
  const scaled = diff * 100;
  const rounded = Number(scaled.toFixed(digits));
  if (rounded === 0) return "±0 pts";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)} pts`;
}

/** A 95 % interval as "68–79%". */
export function interval(ci: Interval | null | undefined, digits = 0): string {
  if (!ci) return "—";
  return `${(ci.low * 100).toFixed(digits)}–${(ci.high * 100).toFixed(digits)}%`;
}

/** A difference's interval as "+3.1 to +14.9 pts". */
export function diffInterval(ci: Interval | null | undefined): string {
  if (!ci) return "—";
  const format = (value: number) => {
    const scaled = Number((value * 100).toFixed(1));
    return `${scaled > 0 ? "+" : scaled < 0 ? "−" : "±"}${Math.abs(scaled).toFixed(1)}`;
  };
  return `${format(ci.low)} to ${format(ci.high)} pts`;
}

/** US dollars with the precision the amount needs: $0.0042, $0.31, $12.40. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  const absolute = Math.abs(value);
  if (absolute < 0.0001) return "<$0.0001";
  if (absolute < 0.01) return `$${value.toFixed(4)}`;
  if (absolute < 1) return `$${value.toFixed(3)}`;
  if (absolute < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** A cost band: "$0.12–$0.40". */
export function moneyRange(low: number, high: number): string {
  if (high <= 0) return "$0";
  return `${money(low)}–${money(high)}`;
}

/** Milliseconds as "840 ms", "3.2 s", "2m 05s". */
export function duration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** 12_345 → "12.3K". */
export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute < 1000) return String(Math.round(value));
  if (absolute < 1_000_000) return `${(value / 1000).toFixed(absolute < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/** A p-value for humans: "p < 0.001", "p = 0.04". */
export function pValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value < 0.001) return "p < 0.001";
  return `p = ${value < 0.01 ? value.toFixed(3) : value.toFixed(2)}`;
}

/** "3 minutes ago", "yesterday". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Colors ──────────────────────────────────────────────────

const SERIES_SLOTS = 8;

/**
 * A contestant's color: its position in the run, in the palette's fixed
 * order. Past eight, the rest share the "other" gray (and lean on labels).
 */
export function seriesColor(index: number): string {
  if (index < 0 || index >= SERIES_SLOTS) return "var(--bench-series-other)";
  return `var(--bench-series-${index + 1})`;
}

/**
 * A score in [0, 1] as a one-hue fill that recedes toward the surface near 0.
 * It stops at 56 %: the cell's number and its interval sit on it, and past
 * that the secondary text drops below a readable contrast in either theme.
 */
export function heatFill(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "transparent";
  const weight = Math.round(8 + Math.max(0, Math.min(1, score)) * 48);
  return `color-mix(in srgb, var(--bench-sequential) ${weight}%, transparent)`;
}

/** A difference in [-1, 1]: blue above zero, red below, gray near it. */
export function divergingFill(diff: number | null | undefined): string {
  if (diff === null || diff === undefined || !Number.isFinite(diff) || Math.abs(diff) < 0.005) {
    return "color-mix(in srgb, var(--bench-diverge-neutral) 60%, transparent)";
  }
  const weight = Math.round(12 + Math.min(1, Math.abs(diff) / 0.5) * 60);
  const pole = diff > 0 ? "var(--bench-diverge-positive)" : "var(--bench-diverge-negative)";
  return `color-mix(in srgb, ${pole} ${weight}%, transparent)`;
}

// ── Words ───────────────────────────────────────────────────

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  judging: "Judging",
  completed: "Completed",
  cancelled: "Stopped",
  failed: "Failed",
  interrupted: "Interrupted",
};

export function runStatusVariant(status: RunStatus): "success" | "info" | "warning" | "error" | "accent" {
  switch (status) {
    case "completed":
      return "success";
    case "running":
    case "judging":
    case "queued":
      return "info";
    case "cancelled":
    case "interrupted":
      return "warning";
    case "failed":
      return "error";
  }
}

export const isLiveStatus = (status: RunStatus) => status === "running" || status === "judging" || status === "queued";

export const ERROR_KIND_LABELS: Record<SampleErrorKind, string> = {
  refusal: "refused",
  timeout: "timed out",
  provider: "provider error",
  harness: "harness error",
  workspace: "workspace error",
  cancelled: "not run (stopped)",
  budget: "not run (budget)",
};

/** A short description of what a contestant is: "Agent · Coding" / "Model". */
export function contestantKindLabel(spec: Pick<ContestantSpec, "kind" | "agent">): string {
  return spec.kind === "agent" ? `Agent${spec.agent ? ` · ${spec.agent}` : ""}` : "Model";
}

/** The settings a contestant pins, as short chips. */
export function contestantChips(spec: ContestantSpec): string[] {
  const chips: string[] = [];
  if (spec.effort) chips.push(spec.effort === "none" ? "no thinking" : `effort ${spec.effort}`);
  if (spec.temperature !== null && spec.temperature !== undefined) chips.push(`T=${spec.temperature}`);
  if (spec.maxTokens) chips.push(`max ${compact(spec.maxTokens)} tokens`);
  if (Array.isArray(spec.tools)) chips.push(spec.tools.length === 1 ? spec.tools[0] : `${spec.tools.length} tools`);
  if (spec.tools === "none") chips.push("no tools");
  if (spec.webSearch) chips.push("web search");
  if (spec.systemPrompt) chips.push("custom prompt");
  const harness = spec.harness ?? {};
  if (harness.maxIterations) chips.push(`≤${harness.maxIterations} steps`);
  if (harness.toolDiscovery) chips.push(`discovery ${harness.toolDiscovery}`);
  if (harness.compactionThreshold) chips.push(`window ${compact(harness.compactionThreshold)}`);
  if (harness.topology) chips.push(harness.topology);
  if (harness.thoughtStructure) chips.push(harness.thoughtStructure);
  return chips;
}

export const SCORER_TYPE_LABELS: Record<ScorerSpec["type"], string> = {
  exact: "Exact match",
  includes: "Contains",
  regex: "Regex",
  numeric: "Numeric answer",
  choice: "Multiple choice",
  math: "Math answer",
  json: "JSON",
  ifeval: "IFEval instructions",
  length: "Length",
  tool_called: "Tool called",
  tool_sequence: "Tool order",
  no_tool_errors: "No tool errors",
  file: "Workspace file",
  command: "Command (hidden tests)",
  code_tests: "Code tests",
  efficiency: "Efficiency limits",
  rubric: "Rubric (judge)",
  checklist: "Checklist (judge)",
  reference: "Reference (judge)",
  pairwise_reference: "Vs reference (judge)",
};

/** A scorer in a few words (the service's own labels are richer; this is for editors). */
export function scorerSummary(scorer: ScorerSpec): string {
  if (scorer.label) return scorer.label;
  switch (scorer.type) {
    case "regex":
      return `${scorer.negate ? "not " : ""}/${scorer.pattern}/${scorer.flags ?? ""}`;
    case "tool_called":
      return `${scorer.tool}${scorer.max === 0 ? " never" : ""}`;
    case "tool_sequence":
      return scorer.tools.join(" → ");
    case "file":
      return `${scorer.absent ? "no " : ""}${scorer.path}`;
    case "command":
      return scorer.command;
    case "rubric":
      return scorer.rubric.length > 48 ? `${scorer.rubric.slice(0, 48)}…` : scorer.rubric;
    case "checklist":
      return `${scorer.items.length} criteria`;
    case "length":
      return `${scorer.unit} ${scorer.min ?? 0}–${scorer.max ?? "∞"}`;
    default:
      return SCORER_TYPE_LABELS[scorer.type];
  }
}

/**
 * The one-sentence reading of a suite's comparisons: who leads, by how
 * much, and whether the data can tell — or what it would take.
 */
export function verdictOf(
  summaries: Array<{ key: string; label: string; mean: number; ci: Interval; cases: number; rankRange?: [number, number] }>,
  pairwise: PairwiseComparison[],
): { tone: "clear" | "tie" | "single" | "empty"; text: string } {
  const scored = summaries.filter((summary) => summary.cases > 0).sort((first, second) => second.mean - first.mean);
  if (scored.length === 0) return { tone: "empty", text: "No samples scored yet." };
  const [leader, runnerUp] = scored;
  if (!runnerUp) {
    return { tone: "single", text: `${leader.label} scores ${percent(leader.mean)} (95% CI ${interval(leader.ci)}) over ${leader.cases} cases.` };
  }
  const pair = pairwise.find(
    (comparison) => (comparison.a === leader.key && comparison.b === runnerUp.key) || (comparison.a === runnerUp.key && comparison.b === leader.key),
  );
  if (!pair) {
    // No paired test at this scope (the overall score averages suites): only
    // the intervals speak, through the rank each one allows.
    const couldLead = scored.filter((summary) => (summary.rankRange ? summary.rankRange[0] === 1 : summary.ci.high >= leader.ci.low));
    if (couldLead.length <= 1) {
      return {
        tone: "clear",
        text: `${leader.label} leads with ${percent(leader.mean)} (95% CI ${interval(leader.ci)}); no other contestant's interval reaches it.`,
      };
    }
    const rivals = couldLead.length === 2 ? runnerUp.label : `${couldLead.length - 1} others`;
    return {
      tone: "tie",
      text: `${leader.label} scores highest (${percent(leader.mean)}), but ${rivals} could rank first too: their intervals overlap.`,
    };
  }
  const sign = pair.a === leader.key ? 1 : -1;
  const diff = pair.diff * sign;
  const ci = sign === 1 ? pair.ci : { low: -pair.ci.high, high: -pair.ci.low };
  if (pair.significant) {
    return {
      tone: "clear",
      text: `${leader.label} leads with ${percent(leader.mean)}, ahead of ${runnerUp.label} by ${points(diff)} (95% CI ${diffInterval(ci)}, ${pValue(pair.pAdjusted)}) — a real difference.`,
    };
  }
  return {
    tone: "tie",
    text: `${leader.label} (${percent(leader.mean)}) and ${runnerUp.label} (${percent(runnerUp.mean)}) are not separated: the ${points(diff)} gap is within noise (95% CI ${diffInterval(ci)}). With ${pair.n} shared cases only gaps above ~${Math.round(pair.mde * 100)} pts are detectable.`,
  };
}
