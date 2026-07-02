/**
 * Canonical agent conversation state color palette.
 *
 * Colors are sourced from StatusBarComponent's `--phase-pulse` CSS tokens
 * (the ambient glow / highlight color per phase), NOT the gradient fill stops.
 * This is intentional — the gradient is the bar animation; --phase-pulse is the
 * semantic "color signature" of each phase, used for glow, text, and background.
 *
 * StatusBar phase → our persisted state mapping:
 *   generating  (--phase-pulse: oklch 0.807 0.2181 h:150.3)  → "generating"
 *   delegating  (--phase-pulse: oklch 0.794 0.1289 h:216.3)  → "orchestrating" + "sub-agents-running"
 *   executing   (--phase-pulse: oklch 0.783 0.178  h:41)      → "completed-with-errors"
 *   starting    (--phase-pulse: oklch 0.709 0.0389 h:269.2)   → "active"
 *   (synthesizing has no CSS pulse → use thinking green h:145) → "background-tasks"
 *   (no phase)  → "completed" (achromatic)
 *
 * This ensures visual consistency across:
 *   - HistoryItemComponent sidebar dot  (--generating-dot-phase-color)
 *   - activeStatusColumn table dot      (style override on StatusDotComponent)
 *   - Any future surface that needs to express conversation activity state
 *
 * States are derived from PERSISTED MongoDB fields only (isActive, isGenerating,
 * pendingBackgroundTasks, hasSubAgents, requestErrorCount).
 * Fine-grained live phases (thinking, executing, prefilling…) require a live
 * SSE connection and cannot appear here.
 */

export type AgentConversationState =
  | "completed"
  | "completed-with-errors"
  | "generating"
  | "orchestrating"
  | "background-tasks"
  | "sub-agents-running"
  | "active";

export interface ConversationStateColors {
  /** Primary dot / fill color — matches StatusBarComponent --phase-pulse for the nearest live phase */
  primary: string;
  /** Glow / box-shadow color (same hue, alpha reduced) */
  glow: string;
  /** Human-readable label for tooltips and aria */
  label: string;
  /** Whether the dot should pulse */
  pulse: boolean;
}

/**
 * Derive the persisted conversation state from document fields.
 * Evaluates in priority order: done → error → generating → orchestrating →
 * sub-agents → background-tasks → active.
 */
export function deriveAgentConversationState({
  isActive,
  isGenerating,
  pendingBackgroundTasks,
  hasSubAgents,
  requestErrorCount,
}: {
  isActive?: boolean;
  isGenerating?: boolean;
  pendingBackgroundTasks?: number;
  hasSubAgents?: boolean;
  requestErrorCount?: number;
}): AgentConversationState {
  if (isActive === false) {
    return (requestErrorCount ?? 0) > 0 ? "completed-with-errors" : "completed";
  }
  if (isGenerating) {
    return hasSubAgents ? "orchestrating" : "generating";
  }
  const taskCount = pendingBackgroundTasks ?? 0;
  if (taskCount > 0) {
    return hasSubAgents ? "sub-agents-running" : "background-tasks";
  }
  return "active";
}

/**
 * oklch color tokens per conversation state.
 * Primary = StatusBarComponent --phase-pulse for the nearest phase.
 * Glow = same oklch values with alpha applied for box-shadow.
 */
export const AGENT_CONVERSATION_STATE_COLORS: Record<AgentConversationState, ConversationStateColors> = {
  // No phase — achromatic, no glow
  "completed": {
    primary: "oklch(0.42 0 0)",
    glow:    "oklch(0.42 0 0 / 0)",
    label:   "Completed",
    pulse:   false,
  },
  // Nearest phase: executing — orange (--phase-pulse: oklch 0.783 0.178 41)
  "completed-with-errors": {
    primary: "oklch(0.783 0.178 41)",
    glow:    "oklch(0.783 0.178 41 / 0.45)",
    label:   "Completed with errors",
    pulse:   false,
  },
  // Nearest phase: generating — green (--phase-pulse: oklch 0.807 0.2181 150.3)
  "generating": {
    primary: "oklch(0.807 0.2181 150.3)",
    glow:    "oklch(0.807 0.2181 150.3 / 0.5)",
    label:   "Generating...",
    pulse:   true,
  },
  // Nearest phase: delegating — cyan (--phase-pulse: oklch 0.794 0.1289 216.3), brighter for orchestrator distinction
  "orchestrating": {
    primary: "oklch(0.794 0.1289 216.3)",
    glow:    "oklch(0.794 0.1289 216.3 / 0.55)",
    label:   "Orchestrator generating",
    pulse:   true,
  },
  // Nearest phase: delegating — cyan (--phase-pulse: oklch 0.794 0.1289 216.3), slightly dimmed
  "sub-agents-running": {
    primary: "oklch(0.712 0.1208 221.2)",
    glow:    "oklch(0.712 0.1208 221.2 / 0.45)",
    label:   "Sub-agents running",
    pulse:   true,
  },
  // Nearest phase: thinking/synthesizing — green (--phase-pulse: oklch 0.709 0.2255 311.3 for thinking,
  // or green h:145 from synthesizing gradient). Using synthesizing green for "tasks" semantic.
  "background-tasks": {
    primary: "oklch(0.723 0.191 145)",
    glow:    "oklch(0.723 0.191 145 / 0.5)",
    label:   "Tasks running",
    pulse:   true,
  },
  // Nearest phase: starting — muted blue (--phase-pulse: oklch 0.709 0.0389 269.2)
  "active": {
    primary: "oklch(0.709 0.0389 269.2)",
    glow:    "oklch(0.709 0.0389 269.2 / 0.35)",
    label:   "Active",
    pulse:   false,
  },
};
