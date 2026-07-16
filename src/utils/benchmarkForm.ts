/**
 * benchmarkForm — validation + payload assembly shared by the create page,
 * the edit modal, and the clone modal.
 */
import type { BenchmarkFormState } from "../components/BenchmarkFormComponent";
import type { Benchmark } from "../types/types";
import { ASSERTION_TYPE_MAP, deriveBenchmarkMode } from "./benchmarkAssertions";

/** An output assertion counts when it has a value (or is valueless jsonValid). */
function hasEffectiveTextAssertion(form: BenchmarkFormState): boolean {
  return (form.assertions || []).some(
    (assertion) =>
      assertion.expectedValue?.trim() || assertion.matchMode === "jsonValid",
  );
}

/** Per-assertion completeness: required fields present for its type. */
function agentAssertionIsComplete(assertion: {
  type?: string;
  toolName?: string;
  expectedValue?: string;
  rubric?: string;
}): boolean {
  const typeDef = ASSERTION_TYPE_MAP[assertion.type || ""];
  if (!typeDef) return false;
  if (typeDef.needsToolName && !assertion.toolName?.trim()) return false;
  if (typeDef.needsExpectedValue && !assertion.expectedValue?.trim())
    return false;
  if (typeDef.needsRubric && !assertion.rubric?.trim()) return false;
  return true;
}

export function isBenchmarkFormValid(form: BenchmarkFormState): boolean {
  if (!form.name?.trim() || !form.prompt?.trim()) return false;
  const agentAssertions = form.agentAssertions || [];
  if (agentAssertions.length > 0 && !agentAssertions.every(agentAssertionIsComplete)) {
    return false;
  }
  return hasEffectiveTextAssertion(form) || agentAssertions.length > 0;
}

/**
 * Assemble the API payload from form state. Blank output assertions are
 * dropped; the legacy expectedValue/matchMode pair mirrors the first
 * assertion for backward compatibility; benchmarkMode is derived.
 */
export function buildBenchmarkPayload(
  form: BenchmarkFormState,
): Omit<Benchmark, "_id" | "createdAt"> {
  const assertions = (form.assertions || []).filter(
    (assertion) =>
      assertion.expectedValue?.trim() || assertion.matchMode === "jsonValid",
  );
  const agentAssertions = (form.agentAssertions || []).filter(
    agentAssertionIsComplete,
  );
  return {
    name: form.name.trim(),
    prompt: form.prompt,
    systemPrompt: form.systemPrompt || "",
    benchmarkMode: deriveBenchmarkMode({ assertions, agentAssertions }),
    expectedValue: assertions[0]?.expectedValue || "",
    matchMode: assertions[0]?.matchMode || "contains",
    assertions,
    assertionOperator: form.assertionOperator || "AND",
    agentAssertions,
    agentAssertionOperator: form.agentAssertionOperator || "AND",
    enabledTools: form.enabledTools || [],
    trials: form.trials || 1,
    ...(form.temperature !== undefined && { temperature: form.temperature }),
    ...(form.maxTokens !== undefined && { maxTokens: form.maxTokens }),
  } as Omit<Benchmark, "_id" | "createdAt">;
}
