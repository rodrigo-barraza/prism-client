/**
 * agentUiMap — Single source of truth for built-in agent visual identity
 * (gradients and accent colors) shared by badges, pickers, and detail views.
 *
 * Custom agents carry their own `color` from the backend; these entries
 * cover the built-in agent ids only.
 */

export const AGENT_GRADIENTS: Record<string, [string, string]> = {
  NONE: ["oklch(0.5 0.03 260)", "oklch(0.65 0.03 260)"],
  CODING: ["oklch(0.585 0.233 277.117)", "oklch(0.65 0.2 277)"],
  OMNI: ["oklch(0.4 0.2 25)", "oklch(0.5 0.22 25)"],
  BENDER: ["oklch(0.5 0.04 240)", "oklch(0.68 0.05 240)"],
  LUPOS: ["oklch(0.5 0.25 290)", "oklch(0.6 0.23 290)"],
  STICKERS: ["oklch(0.705 0.191 165.574)", "oklch(0.8 0.15 165)"],
  DIGEST: ["oklch(0.769 0.188 70.08)", "oklch(0.585 0.22 25)"],
  LIGHTS: ["oklch(0.769 0.177 90.046)", "oklch(0.769 0.188 70.08)"],
  OOG: ["oklch(0.5 0.02 60)", "oklch(0.65 0.02 60)"],
  IMAGE: ["oklch(0.627 0.231 348.347)", "oklch(0.606 0.25 293.528)"],
};

export const FALLBACK_AGENT_GRADIENT: [string, string] = [
  "oklch(0.606 0.25 293.528)",
  "oklch(0.7 0.15 195)",
];

/** Resolves a built-in agent id to its two-stop gradient. */
export function resolveAgentGradient(agentId?: string | null): [string, string] {
  if (!agentId) return FALLBACK_AGENT_GRADIENT;
  return AGENT_GRADIENTS[agentId] || FALLBACK_AGENT_GRADIENT;
}

/** Resolves a built-in agent id to a single accent color (gradient start). */
export function resolveAgentAccentColor(agentId?: string | null): string {
  return resolveAgentGradient(agentId)[0];
}
