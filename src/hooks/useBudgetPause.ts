"use client";

/**
 * The turn paused at its cost cap, if any (prism-service prompt 13,
 * Landing 3), and the card's one action: raise the cap.
 *
 * Set by a `budget_reached` status, cleared by `budget_resolved` (or the end
 * of the turn), hydrated from a loaded conversation's `pendingBudget` — the
 * pause is durable, so a reload or a push-notification link brings it back.
 * The raise goes to whichever cap binds: the turn's own
 * (PATCH /conversations/:id/budget) or the goal's dollar budget (the goal's
 * PATCH, merged into the goal's other budget lines). A raise the server
 * accepts clears the card at once — the stream may not be this tab's.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import {
  BUDGET_STATUS_MESSAGES,
  budgetPauseFromStatus,
  type BudgetPause,
} from "../utils/budgetPause";
import type { KnownStatusEvent } from "../types/protocol/events";
import type { ConversationGoal, ConversationGoalBudget } from "../types/types";

export interface BudgetPauseApi {
  pause: BudgetPause | null;
  isBusy: boolean;
  error: string | null;
  /** Replace from a loaded conversation (`pendingDecisionCards(...).budget`). */
  hydrate: (_pause: BudgetPause | null) => void;
  /** Apply a status event; true when it was a budget one (nothing else to do with it). */
  applyStatus: (_event: KnownStatusEvent) => boolean;
  clear: () => void;
  /**
   * Raise the binding cap to `maxCostDollars`. For the goal's budget, the
   * goal's other budget lines are kept, and `onGoal` receives the updated goal.
   */
  raise: (
    _maxCostDollars: number,
    _options?: { goalBudget?: ConversationGoalBudget | null; onGoal?: (_goal: ConversationGoal | null) => void },
  ) => Promise<void>;
}

export default function useBudgetPause(conversationId: string | null | undefined): BudgetPauseApi {
  const [pause, setPause] = useState<BudgetPause | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Actions read the CURRENT conversation and pause at call time.
  const conversationIdRef = useRef(conversationId);
  const pauseRef = useRef<BudgetPause | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  const hydrate = useCallback((nextPause: BudgetPause | null) => {
    setPause(nextPause);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    setPause(null);
    setError(null);
  }, []);

  const applyStatus = useCallback((event: KnownStatusEvent): boolean => {
    if (event.message === BUDGET_STATUS_MESSAGES.REACHED) {
      setPause(budgetPauseFromStatus(event));
      setError(null);
      return true;
    }
    if (event.message === BUDGET_STATUS_MESSAGES.RESOLVED) {
      setPause((current) => (current && current.pauseId !== event.pauseId ? current : null));
      return true;
    }
    return false;
  }, []);

  const raise = useCallback<BudgetPauseApi["raise"]>(async (maxCostDollars, options = {}) => {
    const id = conversationIdRef.current;
    const current = pauseRef.current;
    if (!id || !current) return;
    setIsBusy(true);
    setError(null);
    try {
      if (current.limitedBy === "goal") {
        const result = await PrismService.raiseGoalBudget(id, {
          ...(options.goalBudget ?? {}),
          maxCostDollars,
        });
        options.onGoal?.(result.goal);
        if (result.budgetPause && result.budgetPause.status !== "raised") {
          throw new Error(result.budgetPause.error || "The goal's budget still leaves the turn at its cap");
        }
      } else {
        await PrismService.raiseConversationBudget(id, maxCostDollars);
      }
      if (conversationIdRef.current === id) setPause(null);
    } catch (raiseError: unknown) {
      if (conversationIdRef.current === id) setError(getErrorMessage(raiseError));
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { pause, isBusy, error, hydrate, applyStatus, clear, raise };
}
