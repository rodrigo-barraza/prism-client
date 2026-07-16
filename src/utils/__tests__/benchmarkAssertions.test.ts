import { describe, it, expect } from "vitest";
import {
  describeAgentAssertion,
  describeTextAssertion,
  deriveBenchmarkMode,
  benchmarkUsesTools,
} from "../benchmarkAssertions";
import {
  buildBenchmarkPayload,
  isBenchmarkFormValid,
} from "../benchmarkForm";
import { INITIAL_BENCHMARK_FORM } from "../../components/BenchmarkFormComponent";

describe("benchmarkAssertions — describe helpers", () => {
  it("describes text assertions per match mode", () => {
    expect(
      describeTextAssertion({ expectedValue: "Paris", matchMode: "contains" }),
    ).toBe('contains "Paris"');
    expect(
      describeTextAssertion({ expectedValue: "", matchMode: "jsonValid" }),
    ).toBe("is valid JSON");
    expect(
      describeTextAssertion({ expectedValue: "42", matchMode: "numericEquals" }),
    ).toBe("number = 42");
  });

  it("describes behavioral assertions", () => {
    expect(
      describeAgentAssertion({
        type: "used_tool",
        toolName: "search_web",
        operator: "gte",
        operand: 2,
      }),
    ).toBe("used search_web ≥ 2");
    expect(
      describeAgentAssertion({
        type: "tool_sequence",
        toolName: "search_web, read_url",
      }),
    ).toBe("sequence: search_web → read_url");
    expect(describeAgentAssertion({ type: "not_used_tool" })).toBe(
      "used no tools",
    );
    expect(
      describeAgentAssertion({ type: "llm_judge", rubric: "Must be a haiku" }),
    ).toContain("judge:");
  });

  it("derives benchmarkMode from assertion content", () => {
    expect(
      deriveBenchmarkMode({
        assertions: [{ expectedValue: "x", matchMode: "contains" }],
        agentAssertions: [],
      }),
    ).toBe("model");
    expect(
      deriveBenchmarkMode({
        assertions: [],
        agentAssertions: [{ type: "replied" }],
      }),
    ).toBe("agent");
    expect(
      deriveBenchmarkMode({
        assertions: [{ expectedValue: "x", matchMode: "contains" }],
        agentAssertions: [{ type: "replied" }],
      }),
    ).toBe("combined");
  });

  it("detects tool usage from assertions or tool scope", () => {
    expect(benchmarkUsesTools({ enabledTools: ["search_web"] })).toBe(true);
    expect(
      benchmarkUsesTools({
        agentAssertions: [{ type: "used_tool", toolName: "search_web" }],
      }),
    ).toBe(true);
    expect(
      benchmarkUsesTools({ agentAssertions: [{ type: "replied" }] }),
    ).toBe(false);
  });
});

describe("benchmarkForm — validation + payload", () => {
  it("requires name, prompt, and at least one assertion", () => {
    expect(isBenchmarkFormValid(INITIAL_BENCHMARK_FORM)).toBe(false);
    expect(
      isBenchmarkFormValid({
        ...INITIAL_BENCHMARK_FORM,
        name: "Test",
        prompt: "Hi",
        assertions: [{ expectedValue: "yes", matchMode: "contains" }],
      }),
    ).toBe(true);
    expect(
      isBenchmarkFormValid({
        ...INITIAL_BENCHMARK_FORM,
        name: "Test",
        prompt: "Hi",
        assertions: [{ expectedValue: "", matchMode: "contains" }],
        agentAssertions: [{ type: "replied" }],
      }),
    ).toBe(true);
  });

  it("rejects incomplete behavioral assertions", () => {
    expect(
      isBenchmarkFormValid({
        ...INITIAL_BENCHMARK_FORM,
        name: "Test",
        prompt: "Hi",
        agentAssertions: [{ type: "used_tool", toolName: "" }],
      }),
    ).toBe(false);
    expect(
      isBenchmarkFormValid({
        ...INITIAL_BENCHMARK_FORM,
        name: "Test",
        prompt: "Hi",
        agentAssertions: [{ type: "llm_judge", rubric: "" }],
      }),
    ).toBe(false);
  });

  it("builds a payload with derived mode, filtered assertions, and legacy mirror", () => {
    const payload = buildBenchmarkPayload({
      ...INITIAL_BENCHMARK_FORM,
      name: "  Trimmed  ",
      prompt: "What is 2+2?",
      assertions: [
        { expectedValue: "4", matchMode: "contains" },
        { expectedValue: "", matchMode: "contains" },
      ],
      agentAssertions: [{ type: "not_used_tool" }],
      enabledTools: ["evaluate_expression"],
      trials: 3,
    });
    expect(payload.name).toBe("Trimmed");
    expect(payload.assertions).toHaveLength(1);
    expect(payload.expectedValue).toBe("4");
    expect(payload.matchMode).toBe("contains");
    expect(payload.benchmarkMode).toBe("combined");
    expect(payload.enabledTools).toEqual(["evaluate_expression"]);
    expect(payload.trials).toBe(3);
  });
});
