"use client";

/**
 * The conversation's long-running goal (`/conversations/:id/goal`), and the
 * goal its model proposed (waiting for the user's approval).
 *
 * The goal is hydrated from the conversation document on load; the
 * proposal is fetched when the conversation changes. Both are kept current
 * by `goal_update` stream events and driven by the panel: create / edit
 * (the goal form), Pause / Resume / Clear, Approve / Decline. The server is
 * the source of truth: an action's response (or the `goal_update` it emits)
 * replaces local state; nothing is optimistic beyond the busy flag.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import type {
  ConversationGoal,
  ConversationGoalInput,
  GoalUpdateEvent,
} from "../types/types";

export interface ConversationGoalApi {
  goal: ConversationGoal | null;
  /** A goal the model proposed — not the goal until approved. */
  proposal: ConversationGoal | null;
  isBusy: boolean;
  error: string | null;
  /** Replace from a conversation document (`conversation.goal`). */
  hydrate: (_goal: ConversationGoal | null | undefined) => void;
  /** Apply a `goal_update` event. */
  applyEvent: (_event: GoalUpdateEvent) => void;
  /** The goal form: create the goal (PUT), or edit the current one in place (PATCH). */
  save: (_input: ConversationGoalInput) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  clear: () => Promise<void>;
  approveProposal: () => Promise<void>;
  declineProposal: () => Promise<void>;
}

export default function useConversationGoal(
  conversationId: string | null | undefined,
): ConversationGoalApi {
  const [goal, setGoal] = useState<ConversationGoal | null>(null);
  // The proposal is kept with the conversation it belongs to, so a switch
  // shows none until that conversation's arrives.
  const [proposalState, setProposalState] = useState<{
    conversationId: string;
    proposal: ConversationGoal | null;
  } | null>(null);
  const proposal =
    proposalState && proposalState.conversationId === conversationId ? proposalState.proposal : null;
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Actions read the CURRENT conversation at call time, not the one they
  // closed over — kept in a ref, synced outside render.
  const conversationIdRef = useRef(conversationId);
  const goalRef = useRef(goal);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  // The document carries the goal (hydrate); the proposal is asked for.
  // Only `proposal` is read from the answer, so it can never overwrite a
  // goal the document already hydrated.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    PrismService.getConversationGoalState(conversationId)
      .then((state) => {
        if (!cancelled) setProposalState({ conversationId, proposal: state.proposal });
      })
      .catch(() => {
        /* no proposal to show — the goal panel still works */
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  /** Set (or drop) the proposal of the conversation on screen. */
  const setProposal = useCallback((next: ConversationGoal | null) => {
    const id = conversationIdRef.current;
    if (id) setProposalState({ conversationId: id, proposal: next });
  }, []);

  const hydrate = useCallback((nextGoal: ConversationGoal | null | undefined) => {
    setGoal(nextGoal ?? null);
    setError(null);
  }, []);

  const applyEvent = useCallback((event: GoalUpdateEvent) => {
    switch (event.change) {
      case "cleared":
        setGoal(null);
        return;
      case "proposed":
        setProposal(event.goal as ConversationGoal);
        return;
      case "proposal_declined":
        setProposal(null);
        return;
      case "set":
        // A new goal — set by the user or an approved proposal — drops
        // whatever proposal was waiting (the service drops it too).
        setProposal(null);
        break;
      default:
        break;
    }
    if (event.goal && typeof event.goal === "object") {
      setGoal(event.goal as ConversationGoal);
    }
  }, [setProposal]);

  const run = useCallback(
    async (action: (_id: string) => Promise<void>): Promise<boolean> => {
      const id = conversationIdRef.current;
      if (!id) return false;
      setIsBusy(true);
      setError(null);
      try {
        await action(id);
        return true;
      } catch (actionError: unknown) {
        if (conversationIdRef.current === id) setError(getErrorMessage(actionError));
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  /** Only this conversation's answer may land — a switch mid-flight would paint another's goal. */
  const landGoal = useCallback((id: string, nextGoal: ConversationGoal | null) => {
    if (conversationIdRef.current === id) setGoal(nextGoal);
  }, []);

  const save = useCallback(
    (input: ConversationGoalInput) =>
      run(async (id) => {
        if (goalRef.current) {
          landGoal(
            id,
            await PrismService.patchConversationGoal(id, {
              objective: input.objective,
              rubric: input.rubric,
              verifier: input.verifier ?? null,
              ...(input.maxIterations !== undefined && { maxIterations: input.maxIterations }),
              budget: input.budget ?? null,
            }),
          );
          return;
        }
        landGoal(
          id,
          await PrismService.setConversationGoal(id, {
            objective: input.objective,
            rubric: input.rubric,
            ...(input.verifier && { verifier: input.verifier }),
            ...(input.maxIterations !== undefined && { maxIterations: input.maxIterations }),
            ...(input.budget && { budget: input.budget }),
          }),
        );
        if (conversationIdRef.current === id) setProposal(null);
      }),
    [run, landGoal, setProposal],
  );

  const pause = useCallback(async () => {
    await run(async (id) => landGoal(id, await PrismService.patchConversationGoal(id, { status: "paused" })));
  }, [run, landGoal]);
  const resume = useCallback(async () => {
    await run(async (id) => landGoal(id, await PrismService.patchConversationGoal(id, { status: "active" })));
  }, [run, landGoal]);
  const clear = useCallback(async () => {
    await run(async (id) => {
      await PrismService.clearConversationGoal(id);
      landGoal(id, null);
    });
  }, [run, landGoal]);

  const approveProposal = useCallback(async () => {
    await run(async (id) => {
      const approved = await PrismService.approveGoalProposal(id);
      landGoal(id, approved);
      if (conversationIdRef.current === id) setProposal(null);
    });
  }, [run, landGoal, setProposal]);
  const declineProposal = useCallback(async () => {
    await run(async (id) => {
      await PrismService.declineGoalProposal(id);
      if (conversationIdRef.current === id) setProposal(null);
    });
  }, [run, setProposal]);

  return {
    goal,
    proposal,
    isBusy,
    error,
    hydrate,
    applyEvent,
    save,
    pause,
    resume,
    clear,
    approveProposal,
    declineProposal,
  };
}
