"use client";

/**
 * Per-conversation state for a turn's side-channel events (utils/turnActivity).
 * `callbacksFor(conversationId)` is spread into a stream's SSE callbacks;
 * both it and `startTurn` are stable, so effects can list them freely.
 */

import { useCallback, useState } from "react";
import {
  EMPTY_TURN_ACTIVITY,
  applyBriefUpdate,
  applyCodeExecutionResult,
  applyExecutableCode,
  applyTodoUpdate,
  applyWebSearchResults,
  startTurn as startTurnActivity,
  type TurnActivity,
} from "../utils/turnActivity";
import type { SSECallbacks } from "../types/types";

type TurnActivityCallbacks = Pick<
  SSECallbacks,
  | "onTodoUpdate"
  | "onBriefUpdate"
  | "onWebSearchResult"
  | "onExecutableCode"
  | "onCodeExecutionResult"
>;

export default function useTurnActivity(conversationId: string) {
  const [state, setState] = useState<{ conversationId: string; activity: TurnActivity }>({
    conversationId,
    activity: EMPTY_TURN_ACTIVITY,
  });

  const update = useCallback(
    (eventConversationId: string, change: (_activity: TurnActivity) => TurnActivity) => {
      setState((previous) => ({
        conversationId: eventConversationId,
        activity: change(
          previous.conversationId === eventConversationId
            ? previous.activity
            : EMPTY_TURN_ACTIVITY,
        ),
      }));
    },
    [],
  );

  const callbacksFor = useCallback(
    (eventConversationId: string): TurnActivityCallbacks => ({
      onTodoUpdate: (event) =>
        update(eventConversationId, (activity) => applyTodoUpdate(activity, event)),
      onBriefUpdate: (event) =>
        update(eventConversationId, (activity) => applyBriefUpdate(activity, event)),
      onWebSearchResult: (results) =>
        update(eventConversationId, (activity) => applyWebSearchResults(activity, results)),
      onExecutableCode: (code, language) =>
        update(eventConversationId, (activity) => applyExecutableCode(activity, code, language)),
      onCodeExecutionResult: (output, outcome) =>
        update(eventConversationId, (activity) =>
          applyCodeExecutionResult(activity, output, outcome),
        ),
    }),
    [update],
  );

  const startTurn = useCallback(
    (eventConversationId: string) => update(eventConversationId, startTurnActivity),
    [update],
  );

  const activity =
    state.conversationId === conversationId ? state.activity : EMPTY_TURN_ACTIVITY;

  return { activity, callbacksFor, startTurn };
}
