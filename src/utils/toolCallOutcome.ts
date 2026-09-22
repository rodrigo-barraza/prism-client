/**
 * What a finished tool call's result says about how it went — so a chip
 * never reads "Wrote notes.txt" for a write that was denied or failed.
 * The display summary (utilities-library resolveToolDisplaySummary) only
 * knows the call's name and arguments; the result is read here.
 */

/** A call that never ran: why, as the chip's leading label. */
const NOT_RUN_LABELS: Record<string, string> = {
  USER_REJECTED: "Denied",
  APPROVAL_TIMED_OUT: "Not approved in time",
  POLICY_DENIED: "Blocked by policy",
  BLOCKED_BY_SAFETY_HOOK: "Blocked by a hook",
};

export type ToolCallOutcome =
  | { kind: "ok" }
  /** Never ran — refused at the approval gate. */
  | { kind: "not_run"; label: string }
  /** Ran and reported `success: false`. */
  | { kind: "failed" };

function parseResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export function toolCallOutcome(result: unknown): ToolCallOutcome {
  const parsed = parseResult(result);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "ok" };
  const { success, error } = parsed as { success?: unknown; error?: unknown };
  if (success !== false) return { kind: "ok" };
  const label = typeof error === "string" ? NOT_RUN_LABELS[error] : undefined;
  return label ? { kind: "not_run", label } : { kind: "failed" };
}
