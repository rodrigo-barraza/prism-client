"use client";

import { useState, useEffect, useMemo } from "react";
import { Sparkles, Wrench, SlidersHorizontal, ChevronDown } from "lucide-react";

import {
  FormGroupComponent,
  InputComponent,
  SelectComponent,
  TextAreaComponent,
} from "@rodrigo-barraza/components-library";

import AssertionBuilderComponent from "./AssertionBuilderComponent";
import PrismService from "../services/PrismService";
import { resolveToolEmoji } from "./WorkflowNodeConstantsComponent";
import type {
  AgentBenchmarkAssertion,
  BenchmarkAssertion,
  BenchmarkPreset,
  ToolSchema,
} from "../types/types";
import styles from "./BenchmarkFormComponent.module.css";

/**
 * BenchmarkFormComponent — shared form body for creating/editing/cloning
 * benchmarks.
 *
 * Sections: preset browser (grouped by category) → name/prompts → unified
 * assertion builder (output + behavior/tool/judge) → tool enablement →
 * advanced execution settings (temperature, max tokens, trials).
 */
export interface BenchmarkFormState {
  name: string;
  systemPrompt: string;
  prompt: string;
  assertions: BenchmarkAssertion[];
  assertionOperator: string;
  agentAssertions: AgentBenchmarkAssertion[];
  agentAssertionOperator: string;
  enabledTools: string[];
  trials: number;
  temperature?: number;
  maxTokens?: number;
  /** Legacy fields kept for payload compatibility */
  benchmarkMode?: string;
  expectedValue?: string;
  matchMode?: string;
}

export const INITIAL_BENCHMARK_FORM: BenchmarkFormState = {
  name: "",
  prompt: "",
  systemPrompt: "",
  assertions: [{ expectedValue: "", matchMode: "contains" }],
  assertionOperator: "AND",
  agentAssertions: [],
  agentAssertionOperator: "AND",
  enabledTools: [],
  trials: 1,
  temperature: 0,
};

/** Build a benchmark form state from an existing benchmark document. */
export function benchmarkToFormState(benchmark: {
  name?: string;
  prompt?: string;
  systemPrompt?: string | null;
  expectedValue?: string;
  matchMode?: string;
  assertions?: BenchmarkAssertion[];
  assertionOperator?: string;
  agentAssertions?: AgentBenchmarkAssertion[];
  agentAssertionOperator?: string;
  enabledTools?: string[];
  trials?: number;
  temperature?: number;
  maxTokens?: number;
}): BenchmarkFormState {
  const assertions = benchmark.assertions?.length
    ? benchmark.assertions
    : [
        {
          expectedValue: benchmark.expectedValue || "",
          matchMode: benchmark.matchMode || "contains",
        },
      ];
  return {
    name: benchmark.name || "",
    prompt: benchmark.prompt || "",
    systemPrompt: benchmark.systemPrompt || "",
    assertions: assertions.map((assertion) => ({ ...assertion })),
    assertionOperator: benchmark.assertionOperator || "AND",
    agentAssertions: (benchmark.agentAssertions || []).map((assertion) => ({
      ...assertion,
    })),
    agentAssertionOperator: benchmark.agentAssertionOperator || "AND",
    enabledTools: [...(benchmark.enabledTools || [])],
    trials: benchmark.trials || 1,
    temperature: benchmark.temperature ?? 0,
    maxTokens: benchmark.maxTokens,
  };
}

interface BenchmarkFormComponentProps {
  form: BenchmarkFormState;
  onChange: (
    _updater: (_prev: BenchmarkFormState) => BenchmarkFormState,
  ) => void;
  /** Hide the preset browser (e.g. when editing an existing benchmark). */
  hidePresets?: boolean;
}

export default function BenchmarkFormComponent({
  form,
  onChange,
  hidePresets = false,
}: BenchmarkFormComponentProps) {
  const [presets, setPresets] = useState<BenchmarkPreset[]>([]);
  const [presetCategory, setPresetCategory] = useState<string>("");
  const [toolSchemas, setToolSchemas] = useState<ToolSchema[]>([]);
  const [judgeModels, setJudgeModels] = useState<
    Array<{ provider?: string; model?: string; name?: string; label?: string }>
  >([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!hidePresets) {
      PrismService.getBenchmarkPresets().then(setPresets).catch(console.error);
    }
    PrismService.getBuiltInToolSchemas()
      .then((schemas) =>
        setToolSchemas(schemas.filter((schema) => !schema.system)),
      )
      .catch(() => {});
    PrismService.getBenchmarkModels()
      .then(({ models }) => setJudgeModels(models || []))
      .catch(() => {});
  }, [hidePresets]);

  // -- Preset browsing ----------------------------------------
  const presetCategories = useMemo(() => {
    const categories: string[] = [];
    for (const preset of presets) {
      const category = preset.category || "Other";
      if (!categories.includes(category)) categories.push(category);
    }
    return categories;
  }, [presets]);

  const presetsInCategory = useMemo(
    () =>
      presets.filter(
        (preset) => (preset.category || "Other") === presetCategory,
      ),
    [presets, presetCategory],
  );

  const applyPreset = (preset: BenchmarkPreset) => {
    onChange((previous) => ({
      ...previous,
      name: preset.name,
      systemPrompt: preset.systemPrompt,
      prompt: preset.prompt,
      assertions: preset.assertions?.length
        ? preset.assertions.map((assertion) => ({ ...assertion }))
        : [{ expectedValue: "", matchMode: "contains" }],
      assertionOperator: preset.assertionOperator || "AND",
      agentAssertions: (preset.agentAssertions || []).map((assertion) => ({
        ...assertion,
      })),
      agentAssertionOperator: preset.agentAssertionOperator || "AND",
      enabledTools: [...(preset.enabledTools || [])],
    }));
  };

  // -- Field helpers ------------------------------------------
  const update =
    (field: keyof BenchmarkFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange((previous) => ({ ...previous, [field]: e.target.value }));

  const updateTextArea =
    (field: keyof BenchmarkFormState) =>
    (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      onChange((previous) => ({ ...previous, [field]: e.target.value }));

  const toolOptions = useMemo(
    () =>
      [...toolSchemas]
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((schema) => ({
          value: schema.name,
          label: `${resolveToolEmoji(schema.name) || "🔧"} ${schema.name}`,
        })),
    [toolSchemas],
  );

  const judgeModelOptions = useMemo(
    () =>
      judgeModels
        .filter((model) => model.provider && (model.model || model.name))
        .map((model) => ({
          value: `${model.provider}:${model.model || model.name}`,
          label: `${model.label || model.model || model.name} (${model.provider})`,
        })),
    [judgeModels],
  );

  return (
    <div className={`benchmark-form-component ${styles["container"]}`}>
      {/* ── Preset browser ───────────────────────────────────── */}
      {!hidePresets && (
        <div className={styles["preset-section"]}>
          <div className={styles["preset-header"]}>
            <Sparkles size={13} />
            <span>Start from a preset</span>
            <span className={styles["preset-hint"]}>
              {presets.length > 0
                ? `${presets.length} industry-standard tests`
                : "Loading presets…"}
            </span>
          </div>
          <div className={styles["preset-pickers"]}>
            <SelectComponent
              value={presetCategory}
              placeholder="Category"
              options={[
                { value: "", label: "— Category —" },
                ...presetCategories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
              onChange={(value: string) => setPresetCategory(value)}
              compact
            />
            <SelectComponent
              value=""
              placeholder="Preset"
              disabled={!presetCategory}
              options={[
                {
                  value: "",
                  label: presetCategory
                    ? "— Choose a preset —"
                    : "Pick a category first",
                },
                ...presetsInCategory.map((preset, index) => ({
                  value: String(index),
                  label: preset.name,
                  tooltip: preset.description,
                })),
              ]}
              onChange={(value: string) => {
                const index = Number.parseInt(value, 10);
                if (!Number.isNaN(index) && presetsInCategory[index]) {
                  applyPreset(presetsInCategory[index]);
                }
              }}
              compact
            />
          </div>
        </div>
      )}

      {/* ── Identity & prompts ───────────────────────────────── */}
      <FormGroupComponent label="Name">
        <InputComponent
          type="text"
          value={form.name}
          onChange={update("name")}
          placeholder="e.g. Tool Routing: Weather vs Search"
        />
      </FormGroupComponent>

      <FormGroupComponent label="System Prompt (optional)">
        <TextAreaComponent
          value={form.systemPrompt}
          onChange={updateTextArea("systemPrompt")}
          placeholder="You are a helpful assistant. Use tools when they improve accuracy."
          minRows={3}
          maxRows={12}
        />
      </FormGroupComponent>

      <FormGroupComponent label="User Prompt">
        <TextAreaComponent
          value={form.prompt}
          onChange={updateTextArea("prompt")}
          placeholder="What's the current temperature in Tokyo, Japan?"
          minRows={5}
          maxRows={14}
        />
      </FormGroupComponent>

      {/* ── Assertions (unified builder) ─────────────────────── */}
      <AssertionBuilderComponent
        textAssertions={form.assertions}
        textOperator={form.assertionOperator || "AND"}
        agentAssertions={form.agentAssertions}
        agentOperator={form.agentAssertionOperator || "AND"}
        onTextAssertionsChange={(assertions) =>
          onChange((previous) => ({ ...previous, assertions }))
        }
        onTextOperatorChange={(assertionOperator) =>
          onChange((previous) => ({ ...previous, assertionOperator }))
        }
        onAgentAssertionsChange={(agentAssertions) =>
          onChange((previous) => ({ ...previous, agentAssertions }))
        }
        onAgentOperatorChange={(agentAssertionOperator) =>
          onChange((previous) => ({ ...previous, agentAssertionOperator }))
        }
        toolSchemas={toolSchemas}
        judgeModelOptions={judgeModelOptions}
      />

      {/* ── Tool enablement ──────────────────────────────────── */}
      <div className={styles["tools-section"]}>
        <div className={styles["tools-header"]}>
          <Wrench size={13} />
          <span>Available Tools</span>
          <span className={styles["tools-hint"]}>
            {form.enabledTools.length > 0
              ? `${form.enabledTools.length} tool${form.enabledTools.length === 1 ? "" : "s"} exposed to tool-enabled targets`
              : "Optional — scope which tools targets may call during this benchmark"}
          </span>
        </div>
        <SelectComponent<string[]>
          multiple
          searchable
          value={form.enabledTools}
          options={toolOptions}
          allLabel="All tools"
          placeholder={
            toolOptions.length > 0
              ? `Select from ${toolOptions.length} tools…`
              : "Loading tools…"
          }
          onChange={(enabledTools: string[]) =>
            onChange((previous) => ({ ...previous, enabledTools }))
          }
        />
      </div>

      {/* ── Advanced execution settings ──────────────────────── */}
      <div className={styles["advanced-section"]}>
        <button
          type="button"
          className={styles["advanced-toggle"]}
          onClick={() => setShowAdvanced((previous) => !previous)}
        >
          <SlidersHorizontal size={13} />
          Execution Settings
          <span className={styles["advanced-summary"]}>
            temp {form.temperature ?? 0}
            {form.maxTokens ? ` · ${form.maxTokens} tok` : ""}
            {form.trials > 1 ? ` · ${form.trials} trials` : ""}
          </span>
          <ChevronDown
            size={14}
            className={`${styles["advanced-chevron"]} ${showAdvanced ? styles["advanced-chevron-open"] : ""}`}
          />
        </button>
        {showAdvanced && (
          <div className={styles["advanced-fields"]}>
            <FormGroupComponent label="Temperature">
              <InputComponent
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature ?? 0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange((previous) => ({
                    ...previous,
                    temperature: Number.parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </FormGroupComponent>
            <FormGroupComponent label="Max Tokens">
              <InputComponent
                type="number"
                min={0}
                step={256}
                value={form.maxTokens ?? ""}
                placeholder="2048 (default)"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange((previous) => ({
                    ...previous,
                    maxTokens: e.target.value
                      ? Number.parseInt(e.target.value, 10)
                      : undefined,
                  }))
                }
              />
            </FormGroupComponent>
            <FormGroupComponent label="Trials per Target">
              <InputComponent
                type="number"
                min={1}
                max={10}
                value={form.trials || 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange((previous) => ({
                    ...previous,
                    trials: Math.max(
                      1,
                      Math.min(10, Number.parseInt(e.target.value, 10) || 1),
                    ),
                  }))
                }
              />
            </FormGroupComponent>
          </div>
        )}
      </div>
    </div>
  );
}
