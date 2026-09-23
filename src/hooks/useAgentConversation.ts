"use client";

/**
 * The agent chat's conversation state in ONE `useReducer`
 * (utils/agentConversationReducer.ts), and the single entry point for turn
 * events from every transport (services/agentStream.ts): `ingest`.
 *
 * `ingest` dispatches the event to the reducer and returns its side effects
 * (utils/agentConversationEffects.ts) for the chat to run. The effects are
 * worked out against the state the event applies to, so the hook keeps the
 * latest state alongside React's (`getState`): every change goes through
 * `dispatch`, which applies the same pure reducer to it.
 *
 * The setters change one field, the way `useState` setters did — for the
 * code that edits the transcript or the cards outside a stream.
 */

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { TurnEvent } from "../types/types";
import {
  agentConversationReducer,
  createAgentConversationState,
  eventClockNow,
  type AgentConversationAction,
  type AgentConversationState,
  type FieldUpdate,
  type SettableField,
} from "../utils/agentConversationReducer";
import { effectsOfEvent, type AgentConversationEffect } from "../utils/agentConversationEffects";

type Setter<Field extends SettableField> = (_value: FieldUpdate<Field>) => void;

export interface AgentConversationSetters {
  setMessages: Setter<"messages">;
  setIsGenerating: Setter<"isGenerating">;
  setToolActivity: Setter<"toolActivity">;
  setStreamingOutputs: Setter<"streamingOutputs">;
  setSubAgentToolActivity: Setter<"subAgentToolActivity">;
  setPendingApprovals: Setter<"pendingApprovals">;
  setPendingUserQuestion: Setter<"pendingUserQuestion">;
  setPlanProposal: Setter<"planProposal">;
  setAgenticProgress: Setter<"agenticProgress">;
  setStatusBarInitialElapsedMilliseconds: Setter<"statusBarInitialElapsedMilliseconds">;
  setContextBudget: Setter<"contextBudget">;
}

export interface AgentConversation extends AgentConversationSetters {
  state: AgentConversationState;
  dispatch: (_action: AgentConversationAction) => void;
  /** The state after the last dispatch — ahead of `state` until React renders it. */
  getState: () => AgentConversationState;
  /** Apply a turn event from the stream of `conversationId`; returns the effects to run. */
  ingest: (_event: TurnEvent, _conversationId: string) => AgentConversationEffect[];
}

export default function useAgentConversation(): AgentConversation {
  const [initialState] = useState(createAgentConversationState);
  const [state, reactDispatch] = useReducer(agentConversationReducer, initialState);
  const latestStateRef = useRef(initialState);

  const dispatch = useCallback((action: AgentConversationAction) => {
    latestStateRef.current = agentConversationReducer(latestStateRef.current, action);
    reactDispatch(action);
  }, []);

  const getState = useCallback(() => latestStateRef.current, []);

  const ingest = useCallback(
    (event: TurnEvent, conversationId: string) => {
      const before = latestStateRef.current;
      dispatch({ type: "event", event, conversationId, clock: eventClockNow() });
      return effectsOfEvent(event, before, conversationId);
    },
    [dispatch],
  );

  const setters = useMemo((): AgentConversationSetters => {
    const setterFor =
      <Field extends SettableField>(field: Field): Setter<Field> =>
      (value) =>
        dispatch({ type: "field/set", field, value } as AgentConversationAction);
    return {
      setMessages: setterFor("messages"),
      setIsGenerating: setterFor("isGenerating"),
      setToolActivity: setterFor("toolActivity"),
      setStreamingOutputs: setterFor("streamingOutputs"),
      setSubAgentToolActivity: setterFor("subAgentToolActivity"),
      setPendingApprovals: setterFor("pendingApprovals"),
      setPendingUserQuestion: setterFor("pendingUserQuestion"),
      setPlanProposal: setterFor("planProposal"),
      setAgenticProgress: setterFor("agenticProgress"),
      setStatusBarInitialElapsedMilliseconds: setterFor("statusBarInitialElapsedMilliseconds"),
      setContextBudget: setterFor("contextBudget"),
    };
  }, [dispatch]);

  return { state, dispatch, getState, ingest, ...setters };
}
