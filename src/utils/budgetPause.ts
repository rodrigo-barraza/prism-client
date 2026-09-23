/**
 * A turn paused at its cost cap (prism-service prompt 13, Landing 3).
 *
 * When a turn's delegation tree reaches its cost cap it no longer ends: it
 * parks on its user, like an approval, until the cap is raised. The stream
 * says so with a `status` event (`budget_reached`, then `budget_resolved`);
 * a loaded conversation carries it as `pendingBudget`. The cap that binds is
 * the turn's own (raised with PATCH /conversations/:id/budget) or what is
 * left of the conversation goal's dollar budget (raised on the goal).
 */
import type { KnownStatusEvent } from "../types/protocol/events";

export const BUDGET_STATUS_MESSAGES = {
  REACHED: "budget_reached",
  RESOLVED: "budget_resolved",
} as const;

export interface BudgetPause {
  pauseId: string;
  spentDollars: number;
  /** The cap it reached: the lower of the turn's own and what is left of the goal's. */
  maxCostDollars: number;
  limitedBy: "turn" | "goal";
  turnCapDollars: number | null;
  goalMaxCostDollars: number | null;
}

/** `pendingBudget` as prism-service serves it with a conversation. */
export interface ServedPendingBudget {
  isPending?: boolean;
  pauseId?: string;
  spentDollars?: number;
  maxCostDollars?: number;
  limitedBy?: string;
  turnCapDollars?: number | null;
  goalMaxCostDollars?: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pauseOf(fields: ServedPendingBudget): BudgetPause | null {
  const spentDollars = numberOrNull(fields.spentDollars);
  const maxCostDollars = numberOrNull(fields.maxCostDollars);
  if (!fields.pauseId || spentDollars === null || maxCostDollars === null) return null;
  return {
    pauseId: fields.pauseId,
    spentDollars,
    maxCostDollars,
    limitedBy: fields.limitedBy === "goal" ? "goal" : "turn",
    turnCapDollars: numberOrNull(fields.turnCapDollars),
    goalMaxCostDollars: numberOrNull(fields.goalMaxCostDollars),
  };
}

/** The pause a loaded conversation is still waiting on, if any. */
export function budgetPauseFromServed(served: ServedPendingBudget | null | undefined): BudgetPause | null {
  return served?.isPending ? pauseOf(served) : null;
}

/** A `budget_reached` status as a pause; null for any other status. */
export function budgetPauseFromStatus(event: KnownStatusEvent): BudgetPause | null {
  return event.message === BUDGET_STATUS_MESSAGES.REACHED ? pauseOf(event) : null;
}

/**
 * The lowest cap that lets the turn go on (exclusive): for the turn's own
 * cap, the spend; for the goal's budget, what the goal had spent before
 * this turn plus the turn's spend.
 */
export function minimumCapDollars(pause: BudgetPause): number {
  if (pause.limitedBy === "goal" && pause.goalMaxCostDollars !== null) {
    const goalSpentBeforeTurn = pause.goalMaxCostDollars - pause.maxCostDollars;
    return goalSpentBeforeTurn + pause.spentDollars;
  }
  return pause.spentDollars;
}

/** The cap the card proposes: double the one reached, and at least half again the minimum, to the cent. */
export function suggestedCapDollars(pause: BudgetPause): number {
  const current =
    pause.limitedBy === "goal" && pause.goalMaxCostDollars !== null
      ? pause.goalMaxCostDollars
      : (pause.turnCapDollars ?? pause.maxCostDollars);
  const suggestion = Math.max(current * 2, minimumCapDollars(pause) * 1.5);
  return Math.ceil(suggestion * 100) / 100;
}

/** Dollars as the card shows them: cents, or four places under a cent. */
export function formatDollars(dollars: number): string {
  return `$${dollars < 0.01 && dollars > 0 ? dollars.toFixed(4) : dollars.toFixed(2)}`;
}
