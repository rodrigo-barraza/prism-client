/**
 * Canonical agent conversation state color palette.
 *
 * Colors are derived from PHASE_TOKENS (statusBarPhaseTokens.ts) — the single
 * source of truth for all phase visual tokens. The `overlay.pulse` value is used
 * as the dot color because it is the phase's ambient "signature" hue (used for
 * glow, text color, and box-shadow in StatusBarComponent), as opposed to the
 * gradientStops which only serve the animated bar fill.
 *
 * State → nearest StatusBar phase mapping:
 *   awaiting-approval → PHASE_TOKENS.awaiting     (dot: amber,  h≈75)
 *   awaiting-answer   → PHASE_TOKENS.awaiting     (dot: violet, h≈300)
 *   generating        → PHASE_TOKENS.generating   (green,  h≈150)
 *   orchestrating     → PHASE_TOKENS.delegating   (cyan,   h≈216)
 *   sub-agents-running→ PHASE_TOKENS.delegating   (cyan,   h≈221, dimmed)
 *   background-tasks  → PHASE_TOKENS.synthesizing  (green,  h≈145)
 *   active            → PHASE_TOKENS.starting      (muted blue, h≈269)
 *   completed-with-errors → PHASE_TOKENS.executing (orange, h≈41)
 *   completed         → (no phase — achromatic)
 *
 * States are derived from PERSISTED MongoDB fields (isActive, isGenerating,
 * pendingBackgroundTasks, hasSubAgents, requestErrorCount) plus the server's
 * in-memory attention counts (pendingApprovalCount, pendingQuestionCount),
 * which the list endpoint serves and the change stream patches live.
 * Fine-grained live phases (thinking, executing, prefilling…) require a live
 * SSE connection and cannot appear here.
 */

import { PHASE_TOKENS } from "./statusBarPhaseTokens";

export type AgentConversationState =
  | "awaiting-approval"
  | "awaiting-answer"
  | "completed"
  | "completed-with-errors"
  | "generating"
  | "orchestrating"
  | "background-tasks"
  | "sub-agents-running"
  | "active";

export interface ConversationStateColors {
  /** Primary dot color — overlay.pulse from the nearest StatusBar phase */
  primary: string;
  /** Glow color — same hue with alpha applied for box-shadow */
  glow: string;
  /** Human-readable label for tooltips and aria */
  label: string;
  /** Whether the dot should pulse */
  pulse: boolean;
}

/**
 * Derive the persisted conversation state from document fields.
 * Evaluates in priority order: awaiting-approval → awaiting-answer →
 * generating → orchestrating → done → error → sub-agents →
 * background-tasks → active. A turn waiting on its user is still
 * generating, so the waits outrank it.
 *
 * When the server already computed `state` (mirrored ladder in
 * prism-service/src/services/conversation/utils.ts — keep the two in sync),
 * pass it through and it wins. Only do this for SNAPSHOT data fetched from
 * the API (e.g. the admin table). LIVE surfaces (HistoryItemComponent) must
 * keep deriving from SSE-patched props — a server snapshot goes stale there.
 *
 * isGenerating takes priority over isActive === false because the client-side
 * SSE streaming state is always more authoritative than the persisted isActive
 * flag, which may be stale during the window between handleSend() and the
 * backend's markGenerating(true) propagating via change stream.
 */
export function deriveAgentConversationState({
  state,
  isActive,
  isGenerating,
  pendingBackgroundTasks,
  hasSubAgents,
  requestErrorCount,
  pendingApprovalCount,
  pendingQuestionCount,
}: {
  /** Server-computed state — returned as-is when present */
  state?: AgentConversationState;
  isActive?: boolean;
  isGenerating?: boolean;
  pendingBackgroundTasks?: number;
  hasSubAgents?: boolean;
  requestErrorCount?: number;
  /** Tool calls waiting for the user's approval */
  pendingApprovalCount?: number;
  /** Questions waiting for the user's answer */
  pendingQuestionCount?: number;
}): AgentConversationState {
  if (state) {
    return state;
  }
  if ((pendingApprovalCount ?? 0) > 0) return "awaiting-approval";
  if ((pendingQuestionCount ?? 0) > 0) return "awaiting-answer";
  if (isGenerating) {
    return hasSubAgents ? "orchestrating" : "generating";
  }
  if (isActive === false) {
    return (requestErrorCount ?? 0) > 0 ? "completed-with-errors" : "completed";
  }
  const taskCount = pendingBackgroundTasks ?? 0;
  if (taskCount > 0) {
    return hasSubAgents ? "sub-agents-running" : "background-tasks";
  }
  return "active";
}

/**
 * Color tokens per conversation state, derived from PHASE_TOKENS.
 * Each primary color is `PHASE_TOKENS[nearestPhase].overlay.pulse`.
 */
export const AGENT_CONVERSATION_STATE_COLORS: Record<AgentConversationState, ConversationStateColors> = {
  "awaiting-approval": {
    primary: "oklch(0.82 0.165 75)",
    glow:    "oklch(0.82 0.165 75 / 0.55)",
    label:   "Waiting for your approval",
    pulse:   true,
  },
  "awaiting-answer": {
    primary: "oklch(0.74 0.16 300)",
    glow:    "oklch(0.74 0.16 300 / 0.5)",
    label:   "Waiting for your answer",
    pulse:   true,
  },
  "completed": {
    primary: "oklch(0.42 0 0)",
    glow:    "oklch(0.42 0 0 / 0)",
    label:   "Completed",
    pulse:   false,
  },
  "completed-with-errors": {
    primary: PHASE_TOKENS.executing.overlay.pulse,
    glow:    "oklch(0.783 0.178 41 / 0.45)",
    label:   "Completed with errors",
    pulse:   false,
  },
  "generating": {
    primary: PHASE_TOKENS.generating.overlay.pulse,
    glow:    "oklch(0.807 0.2181 150.3 / 0.5)",
    label:   "Generating...",
    pulse:   true,
  },
  "orchestrating": {
    primary: PHASE_TOKENS.delegating.overlay.pulse,
    glow:    "oklch(0.794 0.1289 216.3 / 0.55)",
    label:   "Orchestrator generating",
    pulse:   true,
  },
  "sub-agents-running": {
    primary: "oklch(0.712 0.1208 221.2)",
    glow:    "oklch(0.712 0.1208 221.2 / 0.45)",
    label:   "Sub-agents running",
    pulse:   true,
  },
  "background-tasks": {
    primary: PHASE_TOKENS.synthesizing.overlay.pulse,
    glow:    "oklch(0.723 0.191 145 / 0.5)",
    label:   "Tasks running",
    pulse:   true,
  },
  "active": {
    primary: PHASE_TOKENS.starting.overlay.pulse,
    glow:    "oklch(0.709 0.0389 269.2 / 0.35)",
    label:   "Active",
    pulse:   false,
  },
};
