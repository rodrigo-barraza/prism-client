"use client";

import { Plus, Trash2 } from "lucide-react";

import {
  BadgeComponent,
  ButtonComponent,
  FormGroupComponent,
  IconButtonComponent,
  InputComponent,
  SelectComponent,
  TextAreaComponent,
} from "@rodrigo-barraza/components-library";

import BenchmarkModeSelector from "./BenchmarkModeSelectorComponent";
import AgentAssertionsComponent from "./AgentAssertionsComponent";
import { benchmarkPresets } from "../utils/benchmarkPresets";
import { AgentBenchmarkAssertion } from "../types/types";
import styles from "./BenchmarkFormComponent.module.css";

/**
 * BenchmarkFormComponent — Shared form body for creating/cloning benchmarks.
 *
 * Supports three benchmark modes:
 *   - "model"    → Model Benchmark — text match assertions only
 *   - "agent"    → Agent Benchmark — behavioral assertions (replied, tools, thinking, turns)
 *   - "combined" → Combined — both text match + behavioral assertions
 *
 * Used by both BenchmarkPageComponent (New) and BenchmarkDetailPageComponent (Clone)
 * to eliminate the duplicated form field markup.
 */
export interface BenchmarkFormState {
  name: string;
  systemPrompt: string;
  prompt: string;
  assertions: Array<{
    expectedValue: string;
    matchMode: string;
  }>;
  assertionOperator: string;
  agentAssertions: AgentBenchmarkAssertion[];
  agentAssertionOperator: string;
  benchmarkMode: string;
  expectedValue?: string;
  matchMode?: string;
}

export interface MatchModeOption {
  value: string;
  label: string;
}

interface BenchmarkFormComponentProps {
  form: BenchmarkFormState;
  onChange: (fn: (prev: BenchmarkFormState) => BenchmarkFormState) => void;
  matchModes: MatchModeOption[];
}

export default function BenchmarkFormComponent({
  form,
  onChange,
  matchModes,
}: BenchmarkFormComponentProps) {
  const update =
    (field: keyof BenchmarkFormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange((f) => ({ ...f, [field]: e.target.value }));

  const updateTextArea =
    (field: keyof BenchmarkFormState) =>
    (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      onChange((f) => ({ ...f, [field]: e.target.value }));

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const index = parseInt(e.target.value, 10);
    if (!isNaN(index) && benchmarkPresets[index]) {
      const preset = benchmarkPresets[index];
      onChange((f) => ({
        ...f,
        name: preset.name,
        systemPrompt: preset.systemPrompt,
        prompt: preset.prompt,
        assertions: preset.assertions.map((a) => ({ ...a })), // deep copy
        assertionOperator: preset.assertionOperator || "AND",
        // Presets are model benchmarks by default
        benchmarkMode: "model",
      }));
      // Reset the select back to default so it can be used again if needed
      e.target.value = "";
    }
  };

  const handleModeChange = (mode: string) => {
    onChange((f) => ({
      ...f,
      benchmarkMode: mode as "model" | "agent" | "combined",
    }));
  };

  const mode = form.benchmarkMode || "model";

  // -- Model Assertion helpers ---------------------------------
  const assertions = form.assertions || [
    {
      expectedValue: form.expectedValue || "",
      matchMode: form.matchMode || "contains",
    },
  ];

  const addAssertion = () => {
    onChange((f) => ({
      ...f,
      assertions: [
        ...(f.assertions || [
          {
            expectedValue: f.expectedValue || "",
            matchMode: f.matchMode || "contains",
          },
        ]),
        { expectedValue: "", matchMode: "contains" },
      ],
    }));
  };

  const removeAssertion = (index: number) => {
    onChange((f) => {
      const next = [...(f.assertions || [])];
      next.splice(index, 1);
      return {
        ...f,
        assertions:
          next.length > 0
            ? next
            : [{ expectedValue: "", matchMode: "contains" }],
      };
    });
  };

  const updateAssertion =
    (index: number, field: "expectedValue" | "matchMode") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onChange((f) => {
        const next = [
          ...(f.assertions || [
            {
              expectedValue: f.expectedValue || "",
              matchMode: f.matchMode || "contains",
            },
          ]),
        ];
        next[index] = { ...next[index], [field]: e.target.value };
        return { ...f, assertions: next };
      });
    };

  const toggleOperator = () => {
    onChange((f) => ({
      ...f,
      assertionOperator: f.assertionOperator === "OR" ? "AND" : "OR",
    }));
  };

  const operator = form.assertionOperator || "AND";

  // -- Agent Assertion helpers ---------------------------------
  const agentAssertions = form.agentAssertions || [];

  const handleAgentAssertionsChange = (next: AgentBenchmarkAssertion[]) => {
    onChange((f) => ({ ...f, agentAssertions: next }));
  };

  const handleAgentOperatorChange = (next: string) => {
    onChange((f) => ({ ...f, agentAssertionOperator: next }));
  };

  // Whether to show model assertions section
  const showModelAssertions = mode === "model" || mode === "combined";
  // Whether to show agent assertions section
  const showAgentAssertions = mode === "agent" || mode === "combined";

  return (
    <>
      {/* -- Benchmark Mode -- */}
      <BenchmarkModeSelector value={mode} onChange={handleModeChange} />

      {mode !== "agent" && (
        <FormGroupComponent label="Load Preset (Optional)">
          <SelectComponent
            value=""
            options={[
              { value: "", label: "-- Select an industry standard benchmark --" },
              ...benchmarkPresets.map((p, index: number) => ({
                value: String(index),
                label: p.name,
              })),
            ]}
            onChange={(val: string) => {
              const index = parseInt(val, 10);
              if (!isNaN(index) && benchmarkPresets[index]) {
                const preset = benchmarkPresets[index];
                onChange((f) => ({
                  ...f,
                  name: preset.name,
                  systemPrompt: preset.systemPrompt,
                  prompt: preset.prompt,
                  assertions: preset.assertions.map((a) => ({ ...a })),
                  assertionOperator: preset.assertionOperator || "AND",
                  benchmarkMode: "model",
                }));
              }
            }}
          />
        </FormGroupComponent>
      )}

      <FormGroupComponent label="Name">
        <InputComponent
          type="text"
          value={form.name}
          onChange={update("name")}
          placeholder="e.g. Capital of France"
        />
      </FormGroupComponent>

      {mode !== "agent" && (
        <FormGroupComponent label="System Prompt (optional)">
          <TextAreaComponent
            value={form.systemPrompt}
            onChange={updateTextArea("systemPrompt")}
            placeholder="You are a geography expert. Answer concisely."
            minRows={5}
            maxRows={12}
          />
        </FormGroupComponent>
      )}

      <FormGroupComponent label="User Prompt">
        <TextAreaComponent
          value={form.prompt}
          onChange={updateTextArea("prompt")}
          placeholder="What is the capital of France? Reply with just the city name."
          minRows={7}
          maxRows={14}
        />
      </FormGroupComponent>

      {/* -- Model Assertions (text match) -- */}
      {showModelAssertions && (
        <div className={styles['assertions-section']}>
          <div className={styles['assertions-header']}>
            <span className={styles['assertions-label']}>
              {mode === "combined" ? "Output Assertions" : "Assertions"}
            </span>
            {assertions.length > 1 && (
              <button
                type="button"
                className={`${styles['operator-toggle']} ${operator === "OR" ? styles['operator-or'] : ""}`}
                onClick={toggleOperator}
                title={`Switch to ${operator === "AND" ? "OR" : "AND"} — currently requires ${operator === "AND" ? "ALL" : "ANY"} to pass`}
              >
                {operator}
              </button>
            )}
            <ButtonComponent
              variant="disabled"
              icon={Plus}
              onClick={addAssertion}
            >
              Add
            </ButtonComponent>
          </div>

          <div className={styles['assertions-list']}>
            {assertions.map((a, i: number) => (
              <div key={i} className={styles['assertion-row']}>
                {/* Operator divider between assertions */}
                {i > 0 && (
                  <div className={styles['operator-divider']}>
                    <span className={styles['operator-divider-line']} />
                    <BadgeComponent
                      variant={operator === "OR" ? "warning" : "accent"}
                      mini
                    >
                      {operator}
                    </BadgeComponent>
                    <span className={styles['operator-divider-line']} />
                  </div>
                )}
                <div className={styles['assertion-fields']}>
                  <FormGroupComponent
                    label={
                      i === 0 ? "Expected Value" : `Expected Value ${i + 1}`
                    }
                  >
                    <InputComponent
                      type="text"
                      value={a.expectedValue}
                      onChange={updateAssertion(i, "expectedValue")}
                      placeholder="Paris"
                    />
                  </FormGroupComponent>

                  <FormGroupComponent label="Match Mode">
                    <SelectComponent
                      value={a.matchMode}
                      options={matchModes}
                      onChange={(val: string) => {
                        onChange((f) => {
                          const next = [
                            ...(f.assertions || [
                              {
                                expectedValue: f.expectedValue || "",
                                matchMode: f.matchMode || "contains",
                              },
                            ]),
                          ];
                          next[i] = { ...next[i], matchMode: val };
                          return { ...f, assertions: next };
                        });
                      }}
                    />
                  </FormGroupComponent>

                  {assertions.length > 1 && (
                    <div className={styles['assertion-remove']}>
                      <IconButtonComponent
                        icon={<Trash2 size={14} />}
                        onClick={() => removeAssertion(i)}
                        variant="destructive"
                        tooltip="Remove assertion"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -- Agent Assertions (behavioral) -- */}
      {showAgentAssertions && (
        <AgentAssertionsComponent
          assertions={agentAssertions}
          assertionOperator={form.agentAssertionOperator || "AND"}
          onAssertionsChange={handleAgentAssertionsChange}
          onOperatorChange={handleAgentOperatorChange}
        />
      )}
    </>
  );
}
