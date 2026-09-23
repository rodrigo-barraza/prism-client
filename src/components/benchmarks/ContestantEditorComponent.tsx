"use client";

/**
 * One contestant: a model (with its sampling, effort, prompt variant and
 * tools) or a Prism agent (a persona on a model, with its harness knobs).
 * Emits a ContestantSpec; the service keys and labels it.
 */
import { useEffect, useMemo, useState } from "react";
import { SegmentedControlComponent, SwitchComponent } from "@rodrigo-barraza/components-library";
import ModelPickerPopoverComponent from "../ModelPickerPopoverComponent";
import PrismService from "../../services/PrismService";
import type { ContestantSpec, HarnessKnobs } from "../../types/benchmarks";
import type { ModelOption, PrismConfig } from "../../types/types";
import { canDisableThinking } from "../../utils/modelCapabilities";
import styles from "./Benchmarks.module.css";

export interface AgentOption {
  id: string;
  name: string;
  description?: string;
  custom?: boolean;
}

interface NamedOption {
  id: string;
  displayName?: string;
  name?: string;
}

/** The catalog entry of a model, when the config knows it. */
export function findModel(config: PrismConfig | null, provider: string, model: string): ModelOption | null {
  return config?.textToText?.models?.[provider]?.find((option) => option.name === model) ?? null;
}

export function modelLabel(config: PrismConfig | null, provider: string, model: string): string {
  const option = findModel(config, provider, model);
  return option?.label || option?.display_name || model;
}

/** Topologies and thought structures, loaded once per page. */
function useHarnessOptions(enabled: boolean) {
  const [options, setOptions] = useState<{ topologies: NamedOption[]; structures: NamedOption[] }>({ topologies: [], structures: [] });
  useEffect(() => {
    if (!enabled) return;
    const load = (path: string) =>
      (PrismService._request as (path: string, init: { method: string }) => Promise<unknown>)(path, { method: "GET" })
        .then((result) => (Array.isArray(result) ? (result as NamedOption[]) : []))
        .catch(() => []);
    void Promise.all([load("/topologies"), load("/thought-structures")]).then(([topologies, structures]) => setOptions({ topologies, structures }));
  }, [enabled]);
  return options;
}

const numberOrNull = (text: string) => {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

export default function ContestantEditorComponent({
  value,
  onChange,
  config,
  agents,
  compact = false,
}: {
  value: ContestantSpec;
  onChange: (spec: ContestantSpec) => void;
  config: PrismConfig | null;
  agents: AgentOption[];
  /** Only kind, model and effort (the arena's live battle). */
  compact?: boolean;
}) {
  const model = findModel(config, value.provider, value.model);
  const harnessOptions = useHarnessOptions(!compact && value.kind === "agent");
  const set = (patch: Partial<ContestantSpec>) => onChange({ ...value, ...patch });
  const setHarness = (patch: Partial<HarnessKnobs>) => onChange({ ...value, harness: { ...(value.harness ?? {}), ...patch } });

  const effortOptions = useMemo(() => {
    const levels = model?.thinkingLevels ?? [];
    const options = [{ value: "", label: "Model default" }];
    if (levels.length > 0 && canDisableThinking(model)) options.push({ value: "none", label: "Off (no thinking)" });
    for (const level of levels) if (level !== "none") options.push({ value: level, label: level });
    if (levels.length === 0 && model?.thinking) options.push({ value: "none", label: "Off" }, { value: "low", label: "low" }, { value: "medium", label: "medium" }, { value: "high", label: "high" });
    return options;
  }, [model]);

  const toolsMode = Array.isArray(value.tools) ? "list" : value.tools === "none" ? "none" : "suite";

  return (
    <div className={styles["section"]}>
      <div className={styles["row"]}>
        <SegmentedControlComponent
          value={value.kind}
          onChange={(kind) =>
            set(
              kind === "agent"
                ? { kind: "agent", agent: value.agent || agents[0]?.id || "CODING", tools: value.tools === "none" ? null : value.tools }
                : { kind: "model", agent: null },
            )
          }
          segments={[
            { value: "model", label: "Model" },
            { value: "agent", label: "Agent" },
          ]}
          compact
        />
        {value.kind === "agent" && (
          <select className={styles["native-select"]} style={{ inlineSize: "auto", minInlineSize: 160 }} value={value.agent ?? ""} onChange={(event) => set({ agent: event.target.value })} aria-label="Agent">
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
                {agent.custom ? " (custom)" : ""}
              </option>
            ))}
          </select>
        )}
        <ModelPickerPopoverComponent
          config={config}
          settings={{ provider: value.provider, model: value.model }}
          onSelectModel={(provider: string, name: string) => set({ provider, model: name, effort: null })}
          modelTypeFilter="conversation"
          placeholderLabel="Pick a model"
        />
      </div>
      <div className={styles["field-grid"]}>
        {effortOptions.length > 1 && (
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>Reasoning effort</span>
            <select className={styles["native-select"]} value={value.effort ?? ""} onChange={(event) => set({ effort: event.target.value || null })}>
              {effortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!compact && (
          <>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Temperature</span>
              <input
                className={styles["native-input"]}
                type="number"
                step={0.1}
                min={0}
                max={2}
                placeholder="default"
                value={value.temperature ?? ""}
                onChange={(event) => set({ temperature: numberOrNull(event.target.value) })}
              />
            </label>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Max output tokens</span>
              <input
                className={styles["native-input"]}
                type="number"
                min={16}
                placeholder="default"
                value={value.maxTokens ?? ""}
                onChange={(event) => set({ maxTokens: numberOrNull(event.target.value) })}
              />
            </label>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Label</span>
              <input className={styles["native-input"]} placeholder="derived from the settings" value={value.label ?? ""} onChange={(event) => set({ label: event.target.value || null })} />
            </label>
          </>
        )}
      </div>
      {!compact && (
        <>
          <div className={styles["field-grid"]}>
            <label className={styles["field"]}>
              <span className={styles["field-label"]}>Tools</span>
              <select
                className={styles["native-select"]}
                value={toolsMode}
                onChange={(event) =>
                  set({ tools: event.target.value === "list" ? (Array.isArray(value.tools) ? value.tools : []) : event.target.value === "none" ? "none" : null })
                }
              >
                <option value="suite">{value.kind === "agent" ? "The persona's (or the suite's list)" : "The suite's (none unless it lists tools)"}</option>
                {value.kind === "model" && <option value="none">None</option>}
                <option value="list">Exactly these…</option>
              </select>
            </label>
            {toolsMode === "list" && (
              <label className={styles["field"]} style={{ gridColumn: "span 2" }}>
                <span className={styles["field-label"]}>Tool names (comma-separated)</span>
                <input
                  className={styles["native-input"]}
                  placeholder="evaluate_expression, search_web"
                  value={Array.isArray(value.tools) ? value.tools.join(", ") : ""}
                  onChange={(event) =>
                    set({
                      tools: event.target.value
                        .split(",")
                        .map((tool) => tool.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            )}
            <div className={styles["field"]}>
              <span className={styles["field-label"]}>Web search</span>
              <SwitchComponent checked={!!value.webSearch} onChange={(checked) => set({ webSearch: checked || null })} label={value.webSearch ? "On" : "Provider default"} />
            </div>
          </div>
          {value.kind === "agent" && (
            <div className={styles["field-grid"]}>
              <label className={styles["field"]}>
                <span className={styles["field-label"]}>Max iterations</span>
                <input
                  className={styles["native-input"]}
                  type="number"
                  min={1}
                  max={100}
                  placeholder="default"
                  value={value.harness?.maxIterations ?? ""}
                  onChange={(event) => setHarness({ maxIterations: numberOrNull(event.target.value) })}
                />
              </label>
              <label className={styles["field"]}>
                <span className={styles["field-label"]}>Tool discovery</span>
                <select
                  className={styles["native-select"]}
                  value={value.harness?.toolDiscovery ?? ""}
                  onChange={(event) => setHarness({ toolDiscovery: (event.target.value || null) as HarnessKnobs["toolDiscovery"] })}
                >
                  <option value="">Default</option>
                  <option value="preflight">Preflight</option>
                  <option value="on_demand">On demand</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label className={styles["field"]}>
                <span className={styles["field-label"]}>Compaction threshold (tokens)</span>
                <input
                  className={styles["native-input"]}
                  type="number"
                  min={8192}
                  step={1024}
                  placeholder="default"
                  value={value.harness?.compactionThreshold ?? ""}
                  onChange={(event) => setHarness({ compactionThreshold: numberOrNull(event.target.value) })}
                />
              </label>
              <label className={styles["field"]}>
                <span className={styles["field-label"]}>Topology</span>
                <select className={styles["native-select"]} value={value.harness?.topology ?? ""} onChange={(event) => setHarness({ topology: event.target.value || null })}>
                  <option value="">Default</option>
                  {harnessOptions.topologies.map((topology) => (
                    <option key={topology.id} value={topology.id}>
                      {topology.displayName || topology.name || topology.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles["field"]}>
                <span className={styles["field-label"]}>Thought structure</span>
                <select className={styles["native-select"]} value={value.harness?.thoughtStructure ?? ""} onChange={(event) => setHarness({ thoughtStructure: event.target.value || null })}>
                  <option value="">Default</option>
                  {harnessOptions.structures.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.displayName || structure.name || structure.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className={styles["field"]}>
            <span className={styles["field-label"]}>System prompt variant</span>
            <textarea
              className={styles["native-textarea"]}
              placeholder="Optional — put before every case's own system prompt (test a prompt against the same model without it)."
              value={value.systemPrompt ?? ""}
              onChange={(event) => set({ systemPrompt: event.target.value || null })}
            />
          </label>
        </>
      )}
    </div>
  );
}
