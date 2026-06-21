"use client";

import {
  Plus,
  Trash2,
  MessageSquare,
  Wrench,
  Brain,
  RotateCcw,
} from "lucide-react";

import {
  BadgeComponent,
  ButtonComponent,
  FormGroupComponent,
  IconButtonComponent,
  InputComponent,
  SelectComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./AgentAssertionsComponent.module.css";

interface AssertionOperatorOption {
  value: string;
  label: string;
}

export interface AgentAssertionTypeDefinition {
  value: string;
  label: string;
  icon: React.ElementType;
  hasOperand: boolean;
  operators?: AssertionOperatorOption[];
  placeholder?: string;
  description: string;
}

export interface AgentAssertion {
  type: string;
  operator?: string;
  operand?: string | number;
  expectedValue?: string;
  matchMode?: string;
}

interface AgentAssertionsComponentProps {
  assertions: AgentAssertion[];
  assertionOperator?: string;
  onAssertionsChange: (assertions: AgentAssertion[]) => void;
  onOperatorChange: (operator: string) => void;
}

/**
 * Agent Assertion Types — behavioral assertions for agent benchmarks.
 *
 * These differ from model assertions (text match) because they verify
 * agentic behavior: whether the agent replied, used tools, thought, etc.
 *
 * Each type has:
 *   - value:       Unique key stored in the assertion object
 *   - label:       Human-readable name
 *   - icon:        Lucide icon component
 *   - hasOperand:  Whether it accepts a numeric operand (e.g. "at least 3")
 *   - operators:   Available comparison operators (if hasOperand)
 *   - placeholder: Input placeholder text
 *   - description: Tooltip / help text
 */
export const AGENT_ASSERTION_TYPES = [
  {
    value: "replied",
    label: "Replied",
    icon: MessageSquare,
    hasOperand: false,
    description: "Agent produced a non-empty text response",
  },
  {
    value: "used_tool_calls",
    label: "Used Tool Calls",
    icon: Wrench,
    hasOperand: true,
    operators: [
      { value: "gte", label: "At least (≥)" },
      { value: "lte", label: "At most (≤)" },
      { value: "eq", label: "Exactly (=)" },
      { value: "gt", label: "More than (>)" },
      { value: "lt", label: "Less than (<)" },
    ],
    placeholder: "e.g. 3",
    description: "Number of tool calls the agent made",
  },
  {
    value: "thought",
    label: "Thought",
    icon: Brain,
    hasOperand: false,
    description: "Agent used extended thinking / chain-of-thought",
  },
  {
    value: "max_turns",
    label: "Max Turns",
    icon: RotateCcw,
    hasOperand: true,
    operators: [
      { value: "gte", label: "At least (≥)" },
      { value: "lte", label: "At most (≤)" },
      { value: "eq", label: "Exactly (=)" },
      { value: "gt", label: "More than (>)" },
      { value: "lt", label: "Less than (<)" },
    ],
    placeholder: "e.g. 5",
    description: "Maximum number of agentic loop turns",
  },
];

const ASSERTION_TYPE_MAP: Record<string, AgentAssertionTypeDefinition> = Object.fromEntries(
  AGENT_ASSERTION_TYPES.map((assertionType) => [assertionType.value, assertionType]),
);

/**
 * AgentAssertionsComponent — assertion editor for agent benchmarks.
 *
 * Renders a list of behavioral assertions (replied, tool calls, thought, max turns)
 * with AND/OR combinators between them.
 */
export default function AgentAssertionsComponent({
  assertions,
  assertionOperator,
  onAssertionsChange,
  onOperatorChange,
}: AgentAssertionsComponentProps) {
  const operator = assertionOperator || "AND";

  // Which assertion types are already used (for the "Add" dropdown)
  const usedTypes = new Set(assertions.map((assertion: AgentAssertion) => assertion.type));

  const addAssertion = (type: string) => {
    const typeDef = ASSERTION_TYPE_MAP[type];
    const newAssertion = {
      type,
      ...(typeDef?.hasOperand && typeDef.operators && {
        operator: typeDef.operators![0].value,
        operand: "",
      }),
    };
    onAssertionsChange([...assertions, newAssertion]);
  };

  const removeAssertion = (index: number) => {
    const next = assertions.filter((_: AgentAssertion, filterIndex: number) => filterIndex !== index);
    onAssertionsChange(next.length > 0 ? next : []);
  };

  const updateAssertion = (index: number, field: string, value: string) => {
    const next = assertions.map((assertion: AgentAssertion, assertionIndex: number) =>
      assertionIndex === index ? { ...assertion, [field]: value } : assertion,
    );
    onAssertionsChange(next);
  };

  const toggleOperator = () => {
    onOperatorChange(operator === "OR" ? "AND" : "OR");
  };

  // Available types that haven't been added yet
  const availableTypes = AGENT_ASSERTION_TYPES.filter(
    (assertionType) => !usedTypes.has(assertionType.value),
  );

  return (
    <div className={`agent-assertions-component ${styles['section']}`}>
      <div className={styles['header']}>
        <span className={styles['label']}>Agent Assertions</span>
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
        {availableTypes.length > 0 && (
          <div className={styles['add-dropdown']}>
            <ButtonComponent
              variant="disabled"
              icon={Plus}
              onClick={() => addAssertion(availableTypes[0].value)}
            >
              Add
            </ButtonComponent>
          </div>
        )}
      </div>

      {assertions.length === 0 && (
        <div className={styles['empty-state']}>
          <p>
            No assertions configured. Add at least one to evaluate agent
            behavior.
          </p>
          <div className={styles['quick-add']}>
            {AGENT_ASSERTION_TYPES.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.value}
                  type="button"
                  className={styles['quick-add-button']}
                  onClick={() => addAssertion(tool.value)}
                  title={tool.description}
                >
                  <Icon size={12} />
                  {tool.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {assertions.length > 0 && (
        <div className={styles['list']}>
          {assertions.map((assertion: AgentAssertion, assertionIndex: number) => {
            const typeDef = ASSERTION_TYPE_MAP[assertion.type];
            if (!typeDef) return null;
            const Icon = typeDef.icon;
            return (
              <div key={`${assertion.type}-${assertionIndex}`} className={styles['assertion-layout-row']}>
                {/* Operator divider between assertions */}
                {assertionIndex > 0 && (
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
                <div className={styles['fields']}>
                  <div className={styles['type-label']}>
                    <Icon size={13} />
                    <span>{typeDef.label}</span>
                  </div>
                  {typeDef.hasOperand && (
                    <div className={styles['operand-group']}>
                      <FormGroupComponent label="Condition">
                        <SelectComponent
                          value={assertion.operator || typeDef.operators![0].value}
                          options={typeDef.operators!.map((operatorOption: AssertionOperatorOption) => ({
                            value: operatorOption.value,
                            label: operatorOption.label,
                          }))}
                          onChange={(value: string) =>
                            updateAssertion(assertionIndex, "operator", value)
                          }
                        />
                      </FormGroupComponent>
                      <FormGroupComponent label="Value">
                        <InputComponent
                          type="number"
                          min={0}
                          value={assertion.operand ?? ""}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement>,
                          ) => updateAssertion(assertionIndex, "operand", e.target.value)}
                          placeholder={typeDef.placeholder}
                        />
                      </FormGroupComponent>
                    </div>
                  )}
                  {!typeDef.hasOperand && (
                    <div className={styles['no-operand']}>
                      <span className={styles['no-operand-hint']}>
                        {typeDef.description}
                      </span>
                    </div>
                  )}
                  <div className={styles['remove-button']}>
                    <IconButtonComponent
                      icon={<Trash2 size={14} />}
                      onClick={() => removeAssertion(assertionIndex)}
                      variant="destructive"
                      tooltip="Remove assertion"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
