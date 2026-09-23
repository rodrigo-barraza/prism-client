"use client";

/**
 * The conversation's long-running goal (`/conversations/:id/goal`).
 *
 * Hydrated from the conversation document on load, kept current by
 * `goal_update` stream events, and driven by the panel's Pause / Resume /
 * Clear actions. The server is the source of truth: an action's response
 * (or the `goal_update` it emits) replaces local state; nothing is
 * optimistic beyond the busy flag.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import type { ConversationGoal, GoalUpdateEvent } from "../types/types";

export interface ConversationGoalApi {
  goal: ConversationGoal | null;
  isBusy: boolean;
  error: string | null;
  /** Replace from a conversation document (`conversation.goal`). */
  hydrate: (_goal: ConversationGoal | null | undefined) => void;
  /** Apply a `goal_update` event. */
  applyEvent: (_event: GoalUpdateEvent) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  clear: () => Promise<void>;
}

export default function useConversationGoal(
  conversationId: string | null | undefined,
): ConversationGoalApi {
  const [goal, setGoal] = useState<ConversationGoal | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Actions read the CURRENT conversation at call time, not the one they
  // closed over — kept in a ref, synced outside render.
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const hydrate = useCallback((nextGoal: ConversationGoal | null | undefined) => {
    setGoal(nextGoal ?? null);
    setError(null);
  }, []);

  const applyEvent = useCallback((event: GoalUpdateEvent) => {
    if (event.change === "cleared") {
      setGoal(null);
      return;
    }
    if (event.goal && typeof event.goal === "object") {
      setGoal(event.goal as ConversationGoal);
    }
  }, []);

  const run = useCallback(async (action: (_id: string) => Promise<ConversationGoal | null>) => {
    const id = conversationIdRef.current;
    if (!id) return;
    setIsBusy(true);
    setError(null);
    try {
      const nextGoal = await action(id);
      // Only this conversation's answer may land — a switch mid-flight
      // would otherwise paint another conversation's goal.
      if (conversationIdRef.current === id) setGoal(nextGoal);
    } catch (actionError: unknown) {
      if (conversationIdRef.current === id) setError(getErrorMessage(actionError));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const pause = useCallback(
    () => run((id) => PrismService.patchConversationGoal(id, { status: "paused" })),
    [run],
  );
  const resume = useCallback(
    () => run((id) => PrismService.patchConversationGoal(id, { status: "active" })),
    [run],
  );
  const clear = useCallback(
    () =>
      run(async (id) => {
        await PrismService.clearConversationGoal(id);
        return null;
      }),
    [run],
  );

  return { goal, isBusy, error, hydrate, applyEvent, pause, resume, clear };
}
