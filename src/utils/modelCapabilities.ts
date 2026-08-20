import type { ModelOption } from "@/types/types";

/**
 * Can this model's thinking be switched off?
 *
 * The server answers directly via `canDisableThinking` when the model's level
 * list doesn't settle it. Where it says nothing we fall back to the original
 * heuristic — "declares a minimal rung" — which is still correct for the
 * providers it was written for (Anthropic's adaptive models list low..max and
 * genuinely think on every turn).
 *
 * The heuristic alone is wrong in both directions on current Gemini models,
 * which is why the explicit field exists:
 *   • 3.7 Flash has no "minimal" rung but switches off via thinkingBudget: 0.
 *   • 3.1 Pro has no "minimal" rung and cannot switch off at all.
 * Reading the absence of "minimal" as "always on" would hide the No Thinking
 * option on the default model.
 */
export function canDisableThinking(
  model: Pick<ModelOption, "thinkingLevels" | "canDisableThinking"> | null | undefined,
): boolean {
  if (!model) return true;
  if (typeof model.canDisableThinking === "boolean") return model.canDisableThinking;
  return !model.thinkingLevels || model.thinkingLevels.includes("minimal");
}

/** A thinking model the user is not allowed to turn thinking off for. */
export function isThinkingAlwaysOn(
  model: Pick<ModelOption, "thinkingLevels" | "canDisableThinking"> | null | undefined,
): boolean {
  return !!model?.thinkingLevels && !canDisableThinking(model);
}

/**
 * Pick the level to show for a model, given the user's saved preference.
 *
 * Thinking level is a single global setting but the vocabulary is per-model,
 * so a saved "minimal" follows the user onto 3.7 Flash, which has no such rung
 * — leaving the dropdown displaying a value that isn't one of its options. Fall
 * back to "high" when it is offered, else the model's top rung.
 */
export function resolveThinkingLevel(
  model: Pick<ModelOption, "thinkingLevels"> | null | undefined,
  saved: string | undefined,
): string {
  const levels = model?.thinkingLevels;
  if (!levels || levels.length === 0) return saved || "high";
  if (saved && levels.includes(saved)) return saved;
  return levels.includes("high") ? "high" : levels[levels.length - 1];
}
