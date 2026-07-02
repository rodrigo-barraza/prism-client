/**
 * Canonical agent conversation state color palette.
 *
 * All colors derive from the same curated oklch values used by StatusBarComponent's
 * PHASE_GRADIENT_STOPS — establishing a single visual language across:
 *   - HistoryItemComponent sidebar dot  (--generating-dot-phase-color)
 *   - activeStatusColumn table dot      (style override on StatusDotComponent)
 *   - ChatConversationGraphComponent    (phaseColor state)
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
  /** Primary dot / fill color (full-strength oklch) */
  primary: string;
  /** Lighter glow / shadow color (same hue, reduced chroma) */
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
 *
 * Color derivation rationale (aligned with StatusBarComponent):
 *   completed-with-errors  → executing palette orange->red  (h≈22-41)
 *   completed              → neutral muted                  (achromatic)
 *   generating             → generating palette violet      (h≈275-303)
 *   orchestrating          → delegating palette cyan-blue   (h≈252-300)
 *   sub-agents-running     → delegating palette cyan        (h≈215-254)
 *   background-tasks       → synthesizing palette green     (h≈145)
 *   active                 → starting/loading palette blue  (h≈257-262)
 */
export const AGENT_CONVERSATION_STATE_COLORS: Record<AgentConversationState, ConversationStateColors> = {
  "completed": {
    primary: "oklch(0.42 0 0)",
    glow:    "oklch(0.42 0 0 / 0.35)",
    label:   "Completed",
    pulse:   false,
  },
  "completed-with-errors": {
    primary: "oklch(0.646 0.222 22)",
    glow:    "oklch(0.646 0.222 22 / 0.45)",
    label:   "Completed with errors",
    pulse:   false,
  },
  "generating": {
    primary: "oklch(0.553 0.223 303)",
    glow:    "oklch(0.553 0.223 303 / 0.55)",
    label:   "Generating...",
    pulse:   true,
  },
  "orchestrating": {
    primary: "oklch(0.714 0.168 300)",
    glow:    "oklch(0.714 0.168 300 / 0.5)",
    label:   "Orchestrator generating",
    pulse:   true,
  },
  "sub-agents-running": {
    primary: "oklch(0.790 0.090 252)",
    glow:    "oklch(0.790 0.090 252 / 0.45)",
    label:   "Sub-agents running",
    pulse:   true,
  },
  "background-tasks": {
    primary: "oklch(0.723 0.191 145)",
    glow:    "oklch(0.723 0.191 145 / 0.5)",
    label:   "Tasks running",
    pulse:   true,
  },
  "active": {
    primary: "oklch(0.588 0.158 262)",
    glow:    "oklch(0.588 0.158 262 / 0.4)",
    label:   "Active",
    pulse:   false,
  },
};
