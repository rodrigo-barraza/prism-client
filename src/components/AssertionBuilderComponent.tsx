"use client";

import { useMemo, useId } from "react";
import { Plus, Trash2, ListChecks, Activity } from "lucide-react";

import {
  BadgeComponent,
  ButtonComponent,
  FormGroupComponent,
  IconButtonComponent,
  InputComponent,
  SelectComponent,
  TextAreaComponent,
  CheckboxComponent,
  MenuComponent,
  MenuItem,
  MenuGroupLabel,
} from "@rodrigo-barraza/components-library";

import {
  AGENT_ASSERTION_TYPES,
  ASSERTION_TYPE_MAP,
  ASSERTION_GROUP_LABELS,
  COUNT_OPERATORS,
  MATCH_MODE_OPTIONS,
  type AssertionGroup,
} from "../utils/benchmarkAssertions";
import type {
  AgentBenchmarkAssertion,
  BenchmarkAssertion,
  ToolSchema,
} from "../types/types";
import styles from "./AssertionBuilderComponent.module.css";

/**
 * AssertionBuilderComponent — the unified assertion editor for benchmarks.
 *
 * Two sections, mirroring the server's two evaluation groups:
 *   Output Assertions   — text/JSON/regex/numeric checks on the response
 *   Behavior Assertions — tool usage, sequencing, turns, thinking, LLM judge
 *
 * Both groups must pass for a result to pass; within a group the AND/OR
 * toggle picks conjunction vs disjunction.
 */

const TEXT_MATCH_ONLY = MATCH_MODE_OPTIONS.filter((mode) =>
  ["contains", "notContains", "exact", "startsWith", "regex"].includes(
    mode.value,
  ),
);

interface AssertionBuilderComponentProps {
  textAssertions: BenchmarkAssertion[];
  textOperator: string;
  agentAssertions: AgentBenchmarkAssertion[];
  agentOperator: string;
  onTextAssertionsChange: (_assertions: BenchmarkAssertion[]) => void;
  onTextOperatorChange: (_operator: string) => void;
  onAgentAssertionsChange: (_assertions: AgentBenchmarkAssertion[]) => void;
  onAgentOperatorChange: (_operator: string) => void;
  /** Available tools for the tool-name pickers (from /config/tools). */
  toolSchemas?: ToolSchema[];
  /** "provider:model" options for the judge override select. */
  judgeModelOptions?: Array<{ value: string; label: string }>;
}

function OperatorToggle({
  operator,
  onToggle,
}: {
  operator: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles["operator-toggle"]} ${operator === "OR" ? styles["operator-toggle-or"] : ""}`}
      onClick={onToggle}
      title={`Switch to ${operator === "AND" ? "OR" : "AND"} — currently requires ${operator === "AND" ? "ALL" : "ANY"} to pass`}
    >
      {operator}
    </button>
  );
}

function OperatorDivider({ operator }: { operator: string }) {
  return (
    <div className={styles["operator-divider"]}>
      <span className={styles["operator-divider-line"]} />
      <BadgeComponent variant={operator === "OR" ? "warning" : "accent"} mini>
        {operator}
      </BadgeComponent>
      <span className={styles["operator-divider-line"]} />
    </div>
  );
}

export default function AssertionBuilderComponent({
  textAssertions,
  textOperator,
  agentAssertions,
  agentOperator,
  onTextAssertionsChange,
  onTextOperatorChange,
  onAgentAssertionsChange,
  onAgentOperatorChange,
  toolSchemas = [],
  judgeModelOptions = [],
}: AssertionBuilderComponentProps) {
  const toolDatalistId = useId();

  const sortedToolNames = useMemo(
    () => [...toolSchemas.map((tool) => tool.name)].sort(),
    [toolSchemas],
  );

  // -- Output (text) assertion helpers ------------------------
  const updateText = (
    index: number,
    patch: Partial<BenchmarkAssertion>,
  ) => {
    const next = textAssertions.map((assertion, assertionIndex) =>
      assertionIndex === index ? { ...assertion, ...patch } : assertion,
    );
    onTextAssertionsChange(next);
  };

  const addText = () => {
    onTextAssertionsChange([
      ...textAssertions,
      { expectedValue: "", matchMode: "contains" },
    ]);
  };

  const removeText = (index: number) => {
    const next = textAssertions.filter(
      (_assertion, assertionIndex) => assertionIndex !== index,
    );
    onTextAssertionsChange(
      next.length > 0 ? next : [{ expectedValue: "", matchMode: "contains" }],
    );
  };

  // -- Behavior assertion helpers ------------------------------
  const addAgent = (type: string) => {
    const typeDef = ASSERTION_TYPE_MAP[type];
    const assertion: AgentBenchmarkAssertion = { type };
    if (typeDef?.hasOperand) {
      assertion.operator = typeDef.defaultOperator || "gte";
      assertion.operand = "";
    }
    if (typeDef?.needsExpectedValue) {
      assertion.expectedValue = "";
      assertion.matchMode = "contains";
    }
    if (typeDef?.needsRubric) assertion.rubric = "";
    onAgentAssertionsChange([...agentAssertions, assertion]);
  };

  const updateAgent = (
    index: number,
    patch: Partial<AgentBenchmarkAssertion>,
  ) => {
    const next = agentAssertions.map((assertion, assertionIndex) =>
      assertionIndex === index ? { ...assertion, ...patch } : assertion,
    );
    onAgentAssertionsChange(next);
  };

  const removeAgent = (index: number) => {
    onAgentAssertionsChange(
      agentAssertions.filter(
        (_assertion, assertionIndex) => assertionIndex !== index,
      ),
    );
  };

  // Grouped menu entries for the add-assertion dropdown
  const menuGroups = useMemo(() => {
    const groups: Array<{ group: AssertionGroup; types: typeof AGENT_ASSERTION_TYPES }> = [];
    for (const group of ["behavior", "tools", "quality"] as AssertionGroup[]) {
      groups.push({
        group,
        types: AGENT_ASSERTION_TYPES.filter((type) => type.group === group),
      });
    }
    return groups;
  }, []);

  const visibleTextAssertions = textAssertions.length
    ? textAssertions
    : [{ expectedValue: "", matchMode: "contains" }];

  return (
    <div className={`assertion-builder-component ${styles["container"]}`}>
      {/* ── Output assertions ────────────────────────────────── */}
      <section className={styles["section"]}>
        <div className={styles["section-header"]}>
          <span className={styles["section-title"]}>
            <ListChecks size={14} />
            Output Assertions
          </span>
          <span className={styles["section-hint"]}>
            Checks on the response text
          </span>
          {visibleTextAssertions.length > 1 && (
            <OperatorToggle
              operator={textOperator}
              onToggle={() =>
                onTextOperatorChange(textOperator === "OR" ? "AND" : "OR")
              }
            />
          )}
          <ButtonComponent variant="disabled" icon={Plus} onClick={addText}>
            Add
          </ButtonComponent>
        </div>

        <div className={styles["list"]}>
          {visibleTextAssertions.map((assertion, index) => {
            const mode = MATCH_MODE_OPTIONS.find(
              (option) => option.value === (assertion.matchMode || "contains"),
            );
            return (
              <div key={index} className={styles["row"]}>
                {index > 0 && <OperatorDivider operator={textOperator} />}
                <div className={styles["fields"]}>
                  <FormGroupComponent label="Match Mode">
                    <SelectComponent
                      value={assertion.matchMode || "contains"}
                      options={MATCH_MODE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      onChange={(value: string) =>
                        updateText(index, { matchMode: value })
                      }
                    />
                  </FormGroupComponent>
                  {mode?.needsValue !== false && (
                    <FormGroupComponent
                      label={
                        assertion.matchMode === "jsonMatch"
                          ? "Expected JSON"
                          : assertion.matchMode === "regex"
                            ? "Pattern"
                            : assertion.matchMode === "numericEquals"
                              ? "Expected Number"
                              : "Expected Value"
                      }
                    >
                      <InputComponent
                        type="text"
                        value={assertion.expectedValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateText(index, { expectedValue: e.target.value })
                        }
                        placeholder={
                          assertion.matchMode === "jsonMatch"
                            ? '{"name": "Paris"}'
                            : assertion.matchMode === "regex"
                              ? "^ANSWER:\\s*C"
                              : assertion.matchMode === "numericEquals"
                                ? "42"
                                : "Paris"
                        }
                      />
                    </FormGroupComponent>
                  )}
                  {mode?.needsValue === false && (
                    <div className={styles["mode-hint"]}>
                      {mode.description}
                    </div>
                  )}
                  {visibleTextAssertions.length > 1 && (
                    <div className={styles["remove"]}>
                      <IconButtonComponent
                        icon={<Trash2 size={14} />}
                        onClick={() => removeText(index)}
                        variant="destructive"
                        tooltip="Remove assertion"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Behavior & tool assertions ───────────────────────── */}
      <section className={styles["section"]}>
        <div className={styles["section-header"]}>
          <span className={styles["section-title"]}>
            <Activity size={14} />
            Behavior Assertions
          </span>
          <span className={styles["section-hint"]}>
            Tool usage, turns, thinking, judged quality
          </span>
          {agentAssertions.length > 1 && (
            <OperatorToggle
              operator={agentOperator}
              onToggle={() =>
                onAgentOperatorChange(agentOperator === "OR" ? "AND" : "OR")
              }
            />
          )}
          <MenuComponent
            trigger={
              <ButtonComponent variant="disabled" icon={Plus}>
                Add
              </ButtonComponent>
            }
            position="bottom-end"
            ariaLabel="Add behavior assertion"
          >
            {menuGroups.map(({ group, types }) => (
              <div key={group} style={{ display: "contents" }}>
                <MenuGroupLabel>{ASSERTION_GROUP_LABELS[group]}</MenuGroupLabel>
                {types.map((type) => {
                  const Icon = type.icon;
                  return (
                    <MenuItem
                      key={type.value}
                      leadingIcon={<Icon size={14} />}
                      onClick={() => addAgent(type.value)}
                      title={type.description}
                    >
                      {type.label}
                    </MenuItem>
                  );
                })}
              </div>
            ))}
          </MenuComponent>
        </div>

        {agentAssertions.length === 0 ? (
          <div className={styles["empty-state"]}>
            <p>
              No behavior assertions. Add one to grade tool usage, turn
              efficiency, or judged output quality.
            </p>
            <div className={styles["quick-add"]}>
              {["used_tool", "tool_sequence", "not_used_tool", "llm_judge"].map(
                (typeValue) => {
                  const typeDef = ASSERTION_TYPE_MAP[typeValue];
                  const Icon = typeDef.icon;
                  return (
                    <button
                      key={typeValue}
                      type="button"
                      className={styles["quick-add-button"]}
                      onClick={() => addAgent(typeValue)}
                      title={typeDef.description}
                    >
                      <Icon size={12} />
                      {typeDef.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        ) : (
          <div className={styles["list"]}>
            {agentAssertions.map((assertion, index) => {
              const typeDef = ASSERTION_TYPE_MAP[assertion.type || ""];
              if (!typeDef) return null;
              const Icon = typeDef.icon;
              return (
                <div key={`${assertion.type}-${index}`} className={styles["row"]}>
                  {index > 0 && <OperatorDivider operator={agentOperator} />}
                  <div className={styles["fields"]}>
                    <div
                      className={styles["type-label"]}
                      title={typeDef.description}
                    >
                      <Icon size={13} />
                      <span>{typeDef.label}</span>
                    </div>

                    {/* Tool name (single or comma-separated sequence) */}
                    {(typeDef.needsToolName ||
                      typeDef.value === "not_used_tool" ||
                      typeDef.needsExpectedValue) && (
                      <FormGroupComponent
                        label={
                          typeDef.isSequence
                            ? "Tools In Order"
                            : typeDef.value === "not_used_tool" ||
                                typeDef.needsExpectedValue
                              ? "Tool (optional)"
                              : "Tool"
                        }
                      >
                        <input
                          className={styles["tool-input"]}
                          list={typeDef.isSequence ? undefined : toolDatalistId}
                          value={assertion.toolName || ""}
                          onChange={(e) =>
                            updateAgent(index, { toolName: e.target.value })
                          }
                          placeholder={
                            typeDef.isSequence
                              ? "search_web, read_url"
                              : "search_web"
                          }
                          spellCheck={false}
                        />
                      </FormGroupComponent>
                    )}

                    {/* Exact-order toggle for sequences */}
                    {typeDef.isSequence && (
                      <div className={styles["exact-order"]}>
                        <CheckboxComponent
                          checked={!!assertion.exactOrder}
                          onChange={() =>
                            updateAgent(index, {
                              exactOrder: !assertion.exactOrder,
                            })
                          }
                          label="Exact order"
                        />
                      </div>
                    )}

                    {/* Count comparison */}
                    {typeDef.hasOperand && (
                      <div className={styles["operand-group"]}>
                        <FormGroupComponent label="Condition">
                          <SelectComponent
                            value={
                              assertion.operator ||
                              typeDef.defaultOperator ||
                              "gte"
                            }
                            options={COUNT_OPERATORS}
                            onChange={(value: string) =>
                              updateAgent(index, { operator: value })
                            }
                          />
                        </FormGroupComponent>
                        <FormGroupComponent label="Count">
                          <InputComponent
                            type="number"
                            min={0}
                            value={assertion.operand ?? ""}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              updateAgent(index, { operand: e.target.value })
                            }
                            placeholder={typeDef.placeholder}
                          />
                        </FormGroupComponent>
                      </div>
                    )}

                    {/* Args / result matching */}
                    {typeDef.needsExpectedValue && (
                      <div className={styles["operand-group"]}>
                        <FormGroupComponent label="Match">
                          <SelectComponent
                            value={assertion.matchMode || "contains"}
                            options={TEXT_MATCH_ONLY.map((option) => ({
                              value: option.value,
                              label: option.label,
                            }))}
                            onChange={(value: string) =>
                              updateAgent(index, { matchMode: value })
                            }
                          />
                        </FormGroupComponent>
                        <FormGroupComponent label="Expected Value">
                          <InputComponent
                            type="text"
                            value={assertion.expectedValue || ""}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              updateAgent(index, {
                                expectedValue: e.target.value,
                              })
                            }
                            placeholder={
                              typeDef.value === "tool_args_match"
                                ? "eiffel tower"
                                : "expected output"
                            }
                          />
                        </FormGroupComponent>
                      </div>
                    )}

                    {/* Simple types: description hint */}
                    {!typeDef.hasOperand &&
                      !typeDef.needsToolName &&
                      !typeDef.needsExpectedValue &&
                      !typeDef.needsRubric &&
                      typeDef.value !== "not_used_tool" && (
                        <div className={styles["mode-hint"]}>
                          {typeDef.description}
                        </div>
                      )}

                    <div className={styles["remove"]}>
                      <IconButtonComponent
                        icon={<Trash2 size={14} />}
                        onClick={() => removeAgent(index)}
                        variant="destructive"
                        tooltip="Remove assertion"
                      />
                    </div>
                  </div>

                  {/* Judge rubric spans the full row */}
                  {typeDef.needsRubric && (
                    <div className={styles["rubric-block"]}>
                      <FormGroupComponent label="Rubric">
                        <TextAreaComponent
                          value={assertion.rubric || ""}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                          ) => updateAgent(index, { rubric: e.target.value })}
                          placeholder="The response must be exactly one sentence, mention X, and contain no factual errors."
                          minRows={3}
                          maxRows={8}
                        />
                      </FormGroupComponent>
                      {judgeModelOptions.length > 0 && (
                        <FormGroupComponent label="Judge Model (optional)">
                          <SelectComponent
                            value={assertion.judgeModel || ""}
                            options={[
                              { value: "", label: "Auto (recommended default)" },
                              ...judgeModelOptions,
                            ]}
                            onChange={(value: string) =>
                              updateAgent(index, {
                                judgeModel: value || undefined,
                              })
                            }
                          />
                        </FormGroupComponent>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Shared datalist for tool-name autocompletion */}
      <datalist id={toolDatalistId}>
        {sortedToolNames.map((toolName) => (
          <option key={toolName} value={toolName} />
        ))}
      </datalist>
    </div>
  );
}
