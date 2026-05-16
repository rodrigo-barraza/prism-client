"use client";

import { Plus, Trash2 } from "lucide-react";

import { BadgeComponent, ButtonComponent, FormGroupComponent, IconButtonComponent, TextAreaComponent } from "@rodrigo-barraza/components-library";

import BenchmarkModeSelector from "./BenchmarkModeSelectorComponent";
import AgentAssertionsComponent from "./AgentAssertionsComponent";
import { benchmarkPresets } from "../utils/benchmarkPresets";
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
 *
 * @param {object}   form       — { name, systemPrompt, prompt, benchmarkMode, assertions, assertionOperator, agentAssertions, agentAssertionOperator }
 * @param {Function} onChange   — (updater) => void — receives a state updater fn
 * @param {Array}    matchModes — Array of { value, label } for match mode dropdown
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function BenchmarkFormComponent({ form: any, onChange: any, matchModes: any }) {
  const update = (field: any) => (e: any) =>
    // @ts-ignore
    onChange((f: any) => ({ ...f, [field]: e.target.value }));

  const updateTextArea = (field: any) => (e: any) =>
    // @ts-ignore
    onChange((f: any) => ({ ...f, [field]: e.target.value }));

  const handlePresetChange = (e: any) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && benchmarkPresets[idx]) {
      const preset = benchmarkPresets[idx];
      // @ts-ignore
      onChange((f: any) => ({
        ...f,
        name: preset.name,
        systemPrompt: preset.systemPrompt,
        prompt: preset.prompt,
        assertions: preset.assertions.map(a => ({ ...a })), // deep copy
        assertionOperator: preset.assertionOperator || "AND",
        // Presets are model benchmarks by default
        benchmarkMode: "model",
      }));
      // Reset the select back to default so it can be used again if needed
      e.target.value = "";
    }
  };

  const handleModeChange = (mode: any) => {
    // @ts-ignore
    onChange((f: any) => ({ ...f, benchmarkMode: mode }));
  };

  // @ts-ignore
  const mode = form.benchmarkMode || "model";

  // -- Model Assertion helpers ---------------------------------
  // @ts-ignore
  const assertions = form.assertions || [
    // @ts-ignore
    // @ts-ignore
    { expectedValue: form.expectedValue || "", matchMode: form.matchMode || "contains" },
  ];

  const addAssertion = () => {
    // @ts-ignore
    onChange((f: any) => ({
      ...f,
      assertions: [...(f.assertions || [{ expectedValue: f.expectedValue || "", matchMode: f.matchMode || "contains" }]), { expectedValue: "", matchMode: "contains" }],
    }));
  };

  const removeAssertion = (idx: any) => {
    // @ts-ignore
    onChange((f: any) => {
      const next = [...(f.assertions || [])];
      next.splice(idx, 1);
      return { ...f, assertions: next.length > 0 ? next : [{ expectedValue: "", matchMode: "contains" }] };
    });
  };

  const updateAssertion = (idx: any, field: any) => (e: any) => {
    // @ts-ignore
    onChange((f: any) => {
      const next = [...(f.assertions || [{ expectedValue: f.expectedValue || "", matchMode: f.matchMode || "contains" }])];
      next[idx] = { ...next[idx], [field]: e.target.value };
      return { ...f, assertions: next };
    });
  };

  const toggleOperator = () => {
    // @ts-ignore
    onChange((f: any) => ({
      ...f,
      assertionOperator: f.assertionOperator === "OR" ? "AND" : "OR",
    }));
  };

  // @ts-ignore
  const operator = form.assertionOperator || "AND";

  // -- Agent Assertion helpers ---------------------------------
  // @ts-ignore
  const agentAssertions = form.agentAssertions || [];

  const handleAgentAssertionsChange = (next: any) => {
    // @ts-ignore
    onChange((f: any) => ({ ...f, agentAssertions: next }));
  };

  const handleAgentOperatorChange = (next: any) => {
    // @ts-ignore
    onChange((f: any) => ({ ...f, agentAssertionOperator: next }));
  };

  // Whether to show model assertions section
  const showModelAssertions = mode === "model" || mode === "combined";
  // Whether to show agent assertions section
  const showAgentAssertions = mode === "agent" || mode === "combined";

  return (
    <>
      {/* -- Benchmark Mode -- */}
      <BenchmarkModeSelector
        value={mode}
        onChange={handleModeChange}
      />

      {mode !== "agent" && (
        <FormGroupComponent label="Load Preset (Optional)">
          <select onChange={handlePresetChange} defaultValue="">
            <option value="" disabled>-- Select an industry standard benchmark --</option>
            {benchmarkPresets.map((p, idx) => (
              <option key={idx} value={idx}>
                {p.name}
              </option>
            ))}
          </select>
        </FormGroupComponent>
      )}

      <FormGroupComponent label="Name">
        <input
          type="text"
          // @ts-ignore
          value={form.name}
          onChange={update("name")}
          placeholder="e.g. Capital of France"
        />
      </FormGroupComponent>

      {mode !== "agent" && (
        <FormGroupComponent label="System Prompt (optional)">
          <TextAreaComponent
            // @ts-ignore
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
          // @ts-ignore
          value={form.prompt}
          onChange={updateTextArea("prompt")}
          placeholder="What is the capital of France? Reply with just the city name."
          minRows={7}
          maxRows={14}
        />
      </FormGroupComponent>

      {/* -- Model Assertions (text match) -- */}
      {showModelAssertions && (
        <div className={styles.assertionsSection}>
          <div className={styles.assertionsHeader}>
            <span className={styles.assertionsLabel}>
              {mode === "combined" ? "Output Assertions" : "Assertions"}
            </span>
            {assertions.length > 1 && (
              <button
                type="button"
                className={`${styles.operatorToggle} ${operator === "OR" ? styles.operatorOr : ""}`}
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

          <div className={styles.assertionsList}>
            {assertions.map((a: any, i: any) => (
              <div key={i} className={styles.assertionRow}>
                {/* Operator divider between assertions */}
                {i > 0 && (
                  <div className={styles.operatorDivider}>
                    <span className={styles.operatorDividerLine} />
                    <BadgeComponent variant={operator === "OR" ? "warning" : "accent"} mini>
                      {operator}
                    </BadgeComponent>
                    <span className={styles.operatorDividerLine} />
                  </div>
                )}
                <div className={styles.assertionFields}>
                  <FormGroupComponent label={i === 0 ? "Expected Value" : `Expected Value ${i + 1}`}>
                    <input
                      type="text"
                      value={a.expectedValue}
                      onChange={updateAssertion(i, "expectedValue")}
                      placeholder="Paris"
                    />
                  </FormGroupComponent>

                  <FormGroupComponent label="Match Mode">
                    <select value={a.matchMode} onChange={updateAssertion(i, "matchMode")}>
                      {/* @ts-ignore */}
                      {matchModes.map((m: any) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </FormGroupComponent>

                  {assertions.length > 1 && (
                    <div className={styles.assertionRemove}>
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
          // @ts-ignore
          assertionOperator={form.agentAssertionOperator || "AND"}
          onAssertionsChange={handleAgentAssertionsChange}
          onOperatorChange={handleAgentOperatorChange}
        />
      )}
    </>
  );
}
