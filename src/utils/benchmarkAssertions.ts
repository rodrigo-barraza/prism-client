/**
 * benchmarkAssertions — shared metadata + label helpers for the benchmark
 * assertion system. Mirrors the server-side evaluator's semantics
 * (prism-service/src/services/benchmark/BenchmarkEvaluator.ts) so chips and
 * builders describe assertions exactly the way the server grades them.
 */
import {
  MessageSquare,
  Wrench,
  Brain,
  RotateCcw,
  Hammer,
  Ban,
  Play,
  ListOrdered,
  Braces,
  FileSearch,
  ShieldCheck,
  Scale,
} from "lucide-react";
import type {
  AgentBenchmarkAssertion,
  BenchmarkAssertion,
} from "../types/types";

// ── Match modes (text assertions) ────────────────────────────

export interface MatchModeOption {
  value: string;
  label: string;
  description: string;
  /** false for modes that need no expected value (jsonValid) */
  needsValue: boolean;
}

export const MATCH_MODE_OPTIONS: MatchModeOption[] = [
  {
    value: "contains",
    label: "Contains",
    description: "Response includes the expected text (case-insensitive)",
    needsValue: true,
  },
  {
    value: "notContains",
    label: "Not Contains",
    description: "Response must NOT include the expected text",
    needsValue: true,
  },
  {
    value: "exact",
    label: "Exact",
    description: "Response equals the expected text exactly (trimmed, case-insensitive)",
    needsValue: true,
  },
  {
    value: "startsWith",
    label: "Starts With",
    description: "Response begins with the expected text",
    needsValue: true,
  },
  {
    value: "regex",
    label: "Regex",
    description: "Response matches the regular expression (case-insensitive)",
    needsValue: true,
  },
  {
    value: "jsonValid",
    label: "Valid JSON",
    description: "Response contains parseable JSON (object or array)",
    needsValue: false,
  },
  {
    value: "jsonMatch",
    label: "JSON Match",
    description:
      "Response JSON deep-includes the expected JSON (subset match)",
    needsValue: true,
  },
  {
    value: "numericEquals",
    label: "Number Equals",
    description: "Any number in the response equals the expected number",
    needsValue: true,
  },
];

export const MATCH_MODE_MAP: Record<string, MatchModeOption> =
  Object.fromEntries(MATCH_MODE_OPTIONS.map((mode) => [mode.value, mode]));

// ── Comparison operators ─────────────────────────────────────

export interface OperatorOption {
  value: string;
  label: string;
}

export const COUNT_OPERATORS: OperatorOption[] = [
  { value: "gte", label: "At least (≥)" },
  { value: "lte", label: "At most (≤)" },
  { value: "eq", label: "Exactly (=)" },
  { value: "gt", label: "More than (>)" },
  { value: "lt", label: "Less than (<)" },
];

const OPERATOR_SYMBOLS: Record<string, string> = {
  gte: "≥",
  lte: "≤",
  gt: ">",
  lt: "<",
  eq: "=",
};

// ── Behavioral assertion types ───────────────────────────────

export type AssertionGroup = "behavior" | "tools" | "quality";

export interface AgentAssertionTypeDefinition {
  value: string;
  label: string;
  icon: React.ElementType;
  group: AssertionGroup;
  description: string;
  hasOperand?: boolean;
  defaultOperator?: string;
  needsToolName?: boolean;
  /** toolName holds a comma-separated ordered list */
  isSequence?: boolean;
  needsExpectedValue?: boolean;
  needsRubric?: boolean;
  placeholder?: string;
}

export const AGENT_ASSERTION_TYPES: AgentAssertionTypeDefinition[] = [
  // -- Behavior ------------------------------------------------
  {
    value: "replied",
    label: "Replied",
    icon: MessageSquare,
    group: "behavior",
    description: "Produced a non-empty text response",
  },
  {
    value: "thought",
    label: "Thought",
    icon: Brain,
    group: "behavior",
    description: "Used extended thinking / chain-of-thought",
  },
  {
    value: "max_turns",
    label: "Turn Count",
    icon: RotateCcw,
    group: "behavior",
    description: "Agentic loop turn count comparison",
    hasOperand: true,
    defaultOperator: "lte",
    placeholder: "e.g. 5",
  },
  {
    value: "used_tool_calls",
    label: "Tool Call Count",
    icon: Wrench,
    group: "behavior",
    description: "Total number of tool calls made",
    hasOperand: true,
    defaultOperator: "gte",
    placeholder: "e.g. 3",
  },
  // -- Tools ---------------------------------------------------
  {
    value: "used_tool",
    label: "Used Tool",
    icon: Hammer,
    group: "tools",
    description: "A specific tool was called (with optional count)",
    needsToolName: true,
    hasOperand: true,
    defaultOperator: "gte",
    placeholder: "e.g. 1",
  },
  {
    value: "not_used_tool",
    label: "Did Not Use Tool",
    icon: Ban,
    group: "tools",
    description:
      "A specific tool was never called — leave the tool empty to require NO tools at all",
  },
  {
    value: "first_tool",
    label: "First Tool",
    icon: Play,
    group: "tools",
    description: "The first tool invoked is the named one (routing check)",
    needsToolName: true,
  },
  {
    value: "tool_sequence",
    label: "Tool Sequence",
    icon: ListOrdered,
    group: "tools",
    description:
      "Tools were called in this order (comma-separated names; gaps allowed unless exact)",
    needsToolName: true,
    isSequence: true,
  },
  {
    value: "tool_args_match",
    label: "Tool Args Match",
    icon: Braces,
    group: "tools",
    description: "A call's arguments (JSON) match the expected value",
    needsExpectedValue: true,
  },
  {
    value: "tool_result_match",
    label: "Tool Result Match",
    icon: FileSearch,
    group: "tools",
    description: "A call's result matches the expected value",
    needsExpectedValue: true,
  },
  {
    value: "tool_calls_ok",
    label: "No Tool Errors",
    icon: ShieldCheck,
    group: "tools",
    description: "Every tool call completed without an error",
  },
  // -- Quality -------------------------------------------------
  {
    value: "llm_judge",
    label: "LLM Judge",
    icon: Scale,
    group: "quality",
    description:
      "A judge model grades the response against your rubric (pass at score ≥ 7)",
    needsRubric: true,
  },
];

export const ASSERTION_TYPE_MAP: Record<string, AgentAssertionTypeDefinition> =
  Object.fromEntries(AGENT_ASSERTION_TYPES.map((type) => [type.value, type]));

export const ASSERTION_GROUP_LABELS: Record<AssertionGroup, string> = {
  behavior: "Behavior",
  tools: "Tool Usage",
  quality: "Quality (LLM Judge)",
};

// ── Label helpers (mirror server describe* output) ──────────

function shorten(value: string, limit = 42): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

export function describeTextAssertion(assertion: BenchmarkAssertion): string {
  const mode = assertion.matchMode || "contains";
  const value = shorten(assertion.expectedValue || "");
  switch (mode) {
    case "notContains":
      return `not contains "${value}"`;
    case "exact":
      return `equals "${value}"`;
    case "startsWith":
      return `starts with "${value}"`;
    case "regex":
      return `matches /${value}/i`;
    case "jsonValid":
      return "is valid JSON";
    case "jsonMatch":
      return `JSON includes ${value}`;
    case "numericEquals":
      return `number = ${value}`;
    case "contains":
    default:
      return `contains "${value}"`;
  }
}

export function describeAgentAssertion(
  assertion: AgentBenchmarkAssertion,
): string {
  const symbol = OPERATOR_SYMBOLS[assertion.operator || ""] || "≥";
  switch (assertion.type) {
    case "replied":
      return "replied";
    case "thought":
      return "thought";
    case "max_turns":
      return `turns ${OPERATOR_SYMBOLS[assertion.operator || "lte"] || "≤"} ${assertion.operand ?? "?"}`;
    case "used_tool_calls":
      return `tool calls ${symbol} ${assertion.operand ?? 1}`;
    case "used_tool":
      return `used ${assertion.toolName || "?"}${assertion.operand ? ` ${symbol} ${assertion.operand}` : ""}`;
    case "not_used_tool":
      return assertion.toolName
        ? `never used ${assertion.toolName}`
        : "used no tools";
    case "first_tool":
      return `first tool is ${assertion.toolName || "?"}`;
    case "tool_sequence": {
      const sequence = (assertion.toolName || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .join(" → ");
      return `${assertion.exactOrder ? "exact sequence" : "sequence"}: ${sequence || "?"}`;
    }
    case "tool_args_match":
      return `args${assertion.toolName ? `[${assertion.toolName}]` : ""} ~ "${shorten(assertion.expectedValue || "")}"`;
    case "tool_result_match":
      return `result${assertion.toolName ? `[${assertion.toolName}]` : ""} ~ "${shorten(assertion.expectedValue || "")}"`;
    case "tool_calls_ok":
      return "all tool calls succeeded";
    case "llm_judge":
      return `judge: ${shorten(assertion.rubric || "rubric")}`;
    default:
      return String(assertion.type || "?");
  }
}

/**
 * Derive the stored benchmarkMode from assertion content — kept for
 * backward compatibility with mode-aware consumers (badges, old clients).
 */
export function deriveBenchmarkMode(form: {
  assertions?: BenchmarkAssertion[];
  agentAssertions?: AgentBenchmarkAssertion[];
}): "model" | "agent" | "combined" {
  const hasText = (form.assertions || []).some(
    (assertion) =>
      assertion.expectedValue?.trim() || assertion.matchMode === "jsonValid",
  );
  const hasBehavior = (form.agentAssertions || []).length > 0;
  if (hasText && hasBehavior) return "combined";
  if (hasBehavior) return "agent";
  return "model";
}

/** Does this benchmark exercise tools (tool assertions or a tool set)? */
export function benchmarkUsesTools(benchmark: {
  agentAssertions?: AgentBenchmarkAssertion[];
  enabledTools?: string[];
}): boolean {
  if (benchmark.enabledTools?.length) return true;
  return (benchmark.agentAssertions || []).some(
    (assertion) => ASSERTION_TYPE_MAP[assertion.type || ""]?.group === "tools",
  );
}
