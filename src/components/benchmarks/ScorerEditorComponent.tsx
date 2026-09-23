"use client";

/**
 * Edit a list of scorers: pick a type, fill in what it needs. The service
 * validates again on save (a bad regex, an empty checklist).
 */
import { Plus, Trash2 } from "lucide-react";
import { ButtonComponent, IconButtonComponent, SwitchComponent } from "@rodrigo-barraza/components-library";
import type { ScorerSpec, ScorerType } from "../../types/benchmarks";
import { SCORER_TYPE_LABELS } from "../../utils/benchmarkFormat";
import styles from "./Benchmarks.module.css";

const DEFAULTS: Record<ScorerType, ScorerSpec> = {
  exact: { type: "exact" },
  includes: { type: "includes" },
  regex: { type: "regex", pattern: "" },
  numeric: { type: "numeric" },
  choice: { type: "choice" },
  math: { type: "math", judgeFallback: true },
  json: { type: "json" },
  ifeval: { type: "ifeval", mode: "strict" },
  length: { type: "length", unit: "words", max: 200 },
  tool_called: { type: "tool_called", tool: "" },
  tool_sequence: { type: "tool_sequence", tools: [] },
  no_tool_errors: { type: "no_tool_errors" },
  file: { type: "file", path: "" },
  command: { type: "command", command: "" },
  code_tests: { type: "code_tests", language: "python" },
  efficiency: { type: "efficiency", maxToolCalls: 5 },
  rubric: { type: "rubric", rubric: "" },
  checklist: { type: "checklist", items: [{ criterion: "", points: 1 }] },
  reference: { type: "reference" },
  pairwise_reference: { type: "pairwise_reference" },
};

const GROUPS: Array<{ label: string; types: ScorerType[] }> = [
  { label: "The answer", types: ["exact", "includes", "regex", "numeric", "choice", "math", "json", "ifeval", "length"] },
  { label: "The trajectory", types: ["tool_called", "tool_sequence", "no_tool_errors", "efficiency"] },
  { label: "The workspace", types: ["file", "command", "code_tests"] },
  { label: "A judge", types: ["rubric", "checklist", "reference", "pairwise_reference"] },
];

const numberOrNull = (text: string) => (text.trim() === "" ? null : Number.isFinite(Number(text)) ? Number(text) : null);

function Fields({ scorer, onChange }: { scorer: ScorerSpec; onChange: (scorer: ScorerSpec) => void }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...scorer, ...patch } as ScorerSpec);
  const text = (label: string, key: string, value: string | null | undefined, placeholder?: string, wide = false) => (
    <label className={styles["field"]} style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span className={styles["field-label"]}>{label}</span>
      <input className={styles["native-input"]} value={value ?? ""} placeholder={placeholder} onChange={(event) => set({ [key]: event.target.value })} />
    </label>
  );
  const number = (label: string, key: string, value: number | null | undefined, placeholder?: string) => (
    <label className={styles["field"]}>
      <span className={styles["field-label"]}>{label}</span>
      <input className={styles["native-input"]} type="number" value={value ?? ""} placeholder={placeholder} onChange={(event) => set({ [key]: numberOrNull(event.target.value) })} />
    </label>
  );
  switch (scorer.type) {
    case "exact":
    case "includes":
      return (
        <div className={styles["field"]}>
          <SwitchComponent checked={scorer.ignoreCase !== false} onChange={(checked) => set({ ignoreCase: checked })} label="Ignore case and punctuation" />
          {scorer.type === "includes" && <SwitchComponent checked={!!scorer.all} onChange={(checked) => set({ all: checked })} label="Every target must appear" />}
          <span className={styles["field-hint"]}>Compares with the case&apos;s target(s).</span>
        </div>
      );
    case "regex":
      return (
        <>
          {text("Pattern", "pattern", scorer.pattern, "\\b42\\b", true)}
          {text("Flags", "flags", scorer.flags, "i")}
          <div className={styles["field"]}>
            <SwitchComponent checked={!!scorer.negate} onChange={(checked) => set({ negate: checked })} label="Pass when it does NOT match" />
            <SwitchComponent checked={scorer.source === "thinking"} onChange={(checked) => set({ source: checked ? "thinking" : "output" })} label="Match the thinking" />
          </div>
        </>
      );
    case "numeric":
      return number("Relative tolerance", "tolerance", scorer.tolerance, "0.000001");
    case "math":
      return <SwitchComponent checked={!!scorer.judgeFallback} onChange={(checked) => set({ judgeFallback: checked })} label="Ask a judge when the normaliser can't tell" />;
    case "json":
      return (
        <label className={styles["field"]} style={{ gridColumn: "1 / -1" }}>
          <span className={styles["field-label"]}>Required keys (comma-separated)</span>
          <input
            className={styles["native-input"]}
            value={(scorer.requiredKeys ?? []).join(", ")}
            onChange={(event) => set({ requiredKeys: event.target.value.split(",").map((key) => key.trim()).filter(Boolean) })}
          />
        </label>
      );
    case "ifeval":
      return (
        <div className={styles["field"]}>
          <SwitchComponent checked={scorer.mode === "loose"} onChange={(checked) => set({ mode: checked ? "loose" : "strict" })} label="Loose (forgive a preamble line and markdown)" />
          <span className={styles["field-hint"]}>Reads the case&apos;s metadata.ifeval instructions.</span>
        </div>
      );
    case "length":
      return (
        <>
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Unit</span>
            <select className={styles["native-select"]} value={scorer.unit} onChange={(event) => set({ unit: event.target.value })}>
              <option value="words">words</option>
              <option value="characters">characters</option>
              <option value="sentences">sentences</option>
              <option value="paragraphs">paragraphs</option>
            </select>
          </label>
          {number("At least", "min", scorer.min)}
          {number("At most", "max", scorer.max)}
        </>
      );
    case "tool_called":
      return (
        <>
          {text("Tool", "tool", scorer.tool, "evaluate_expression")}
          {number("At least (times)", "min", scorer.min, "1")}
          {number("At most (0 = never)", "max", scorer.max)}
          {text("Arguments match (regex)", "argsMatch", scorer.argsMatch, "paris")}
        </>
      );
    case "tool_sequence":
      return (
        <>
          <label className={styles["field"]} style={{ gridColumn: "1 / -1" }}>
            <span className={styles["field-label"]}>Tools in order (comma-separated)</span>
            <input
              className={styles["native-input"]}
              value={scorer.tools.join(", ")}
              onChange={(event) => set({ tools: event.target.value.split(",").map((tool) => tool.trim()).filter(Boolean) })}
            />
          </label>
          <SwitchComponent checked={!!scorer.exactOrder} onChange={(checked) => set({ exactOrder: checked })} label="Exactly this trace (no other calls)" />
        </>
      );
    case "efficiency":
      return (
        <>
          {number("Max turns", "maxTurns", scorer.maxTurns)}
          {number("Max tool calls", "maxToolCalls", scorer.maxToolCalls)}
          {number("Max cost (USD)", "maxCostUsd", scorer.maxCostUsd)}
          {number("Max seconds", "maxSeconds", scorer.maxSeconds)}
        </>
      );
    case "file":
      return (
        <>
          {text("Path (globs allowed)", "path", scorer.path, "src/**/*.ts")}
          {text("Content matches (regex, multiline)", "contentMatch", scorer.contentMatch)}
          <SwitchComponent checked={!!scorer.absent} onChange={(checked) => set({ absent: checked })} label="Pass when no such file exists" />
        </>
      );
    case "command":
      return (
        <>
          {text("Command (run in the workspace after the answer)", "command", scorer.command, "node test.mjs", true)}
          {number("Expected exit code", "expectExitCode", scorer.expectExitCode, "0")}
          {number("Timeout (s)", "timeoutSeconds", scorer.timeoutSeconds, "60")}
          {text("Output matches (regex)", "outputMatch", scorer.outputMatch)}
        </>
      );
    case "code_tests":
      return (
        <>
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Language</span>
            <select className={styles["native-select"]} value={scorer.language ?? "python"} onChange={(event) => set({ language: event.target.value })}>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
            </select>
          </label>
          <label className={styles["field"]} style={{ gridColumn: "1 / -1" }}>
            <span className={styles["field-label"]}>Tests (appended after the answer&apos;s code; empty: the case&apos;s metadata.testProgram)</span>
            <textarea className={styles["native-textarea"]} value={scorer.tests ?? ""} onChange={(event) => set({ tests: event.target.value || null })} />
          </label>
        </>
      );
    case "rubric":
      return (
        <>
          <label className={styles["field"]} style={{ gridColumn: "1 / -1" }}>
            <span className={styles["field-label"]}>Rubric</span>
            <textarea className={styles["native-textarea"]} value={scorer.rubric} placeholder="What a good answer must do." onChange={(event) => set({ rubric: event.target.value })} />
          </label>
          {number("Pass at (0–10)", "passThreshold", scorer.passThreshold, "7")}
        </>
      );
    case "checklist":
      return (
        <div className={styles["field"]} style={{ gridColumn: "1 / -1" }}>
          <span className={styles["field-label"]}>Criteria (negative points: a mistake the answer should not make)</span>
          {scorer.items.map((item, index) => (
            <div key={index} className={styles["row"]} style={{ flexWrap: "nowrap" }}>
              <input
                className={styles["native-input"]}
                value={item.criterion}
                placeholder="Mentions the base case"
                onChange={(event) => set({ items: scorer.items.map((entry, position) => (position === index ? { ...entry, criterion: event.target.value } : entry)) })}
              />
              <input
                className={styles["native-input"]}
                style={{ inlineSize: 80 }}
                type="number"
                value={item.points}
                aria-label="Points"
                onChange={(event) => set({ items: scorer.items.map((entry, position) => (position === index ? { ...entry, points: Number(event.target.value) } : entry)) })}
              />
              <IconButtonComponent icon={<Trash2 size={13} />} tooltip="Remove criterion" onClick={() => set({ items: scorer.items.filter((_, position) => position !== index) })} />
            </div>
          ))}
          <ButtonComponent variant="text" size="small" icon={Plus} onClick={() => set({ items: [...scorer.items, { criterion: "", points: 1 }] })}>
            Criterion
          </ButtonComponent>
        </div>
      );
    case "pairwise_reference":
      return text("What \"better\" means", "criteria", scorer.criteria, "Correctness, then completeness", true);
    default:
      return <span className={styles["field-hint"]}>Nothing to set.</span>;
  }
}

export default function ScorerEditorComponent({ scorers, onChange, emptyHint }: { scorers: ScorerSpec[]; onChange: (scorers: ScorerSpec[]) => void; emptyHint?: string }) {
  const replace = (index: number, scorer: ScorerSpec) => onChange(scorers.map((entry, position) => (position === index ? scorer : entry)));
  return (
    <div className={styles["section"]}>
      {scorers.length === 0 && emptyHint && <p className={styles["section-hint"]}>{emptyHint}</p>}
      {scorers.map((scorer, index) => (
        <div key={index} className={styles["card"]} style={{ padding: 12 }}>
          <div className={styles["row"]} style={{ marginBlockEnd: 10 }}>
            <select className={styles["native-select"]} style={{ inlineSize: "auto" }} value={scorer.type} onChange={(event) => replace(index, { ...DEFAULTS[event.target.value as ScorerType], label: scorer.label, weight: scorer.weight, required: scorer.required })} aria-label="Scorer type">
              {GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((type) => (
                    <option key={type} value={type}>
                      {SCORER_TYPE_LABELS[type]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <SwitchComponent checked={scorer.required !== false} onChange={(checked) => replace(index, { ...scorer, required: checked })} label="Required to pass" />
            <label className={styles["row"]}>
              <span className={`${styles["small"]} ${styles["muted"]}`}>weight</span>
              <input
                className={styles["native-input"]}
                style={{ inlineSize: 64 }}
                type="number"
                min={0}
                step={0.5}
                value={scorer.weight ?? 1}
                onChange={(event) => replace(index, { ...scorer, weight: Number(event.target.value) })}
                aria-label="Weight"
              />
            </label>
            <span className={styles["spacer"]} />
            <IconButtonComponent icon={<Trash2 size={14} />} tooltip="Remove scorer" variant="destructive" onClick={() => onChange(scorers.filter((_, position) => position !== index))} />
          </div>
          <div className={styles["field-grid"]}>
            <Fields scorer={scorer} onChange={(next) => replace(index, next)} />
          </div>
        </div>
      ))}
      <div>
        <ButtonComponent variant="secondary" size="small" icon={Plus} onClick={() => onChange([...scorers, { type: "exact" }])}>
          Add scorer
        </ButtonComponent>
      </div>
    </div>
  );
}
