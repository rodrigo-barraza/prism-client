"use client";

/**
 * Deliver the user's answer to an agent question exactly once.
 *
 *  - `POST /agent/answer` carries the conversation id AND the card's
 *    `questionId`, so the server resolves that card — not whichever question
 *    happens to be oldest.
 *  - A 404 means no open question took it (the turn ended, or the card was
 *    already answered elsewhere): the answer then goes out as a normal
 *    message through `sendAsMessage` — the composer's own routing, i.e.
 *    `/agent/input` while the turn runs, the next turn otherwise — once.
 *  - A card whose answer is in flight or delivered is claimed: a second
 *    click sends nothing (`"duplicate"`). A failed send releases the claim
 *    so the user can retry.
 */
import { useCallback, useEffect, useRef } from "react";
import PrismService from "../services/PrismService";
import { answersToMessageText } from "../utils/turnInputRouting";
import { getErrorMessage } from "../utils/errorMessage";
import type { QuestionAnswerData } from "./useNonBlockingQuestions";

export type QuestionAnswerVia = "answer" | "message" | "failed" | "duplicate";

export interface QuestionAnswerSenderOptions {
  /** The id the running turn is addressed by (the root conversation, or the viewed sub-agent's). */
  getConversationId: () => string;
  /** Send the answer text as a normal user message (the 404 fallback). */
  sendAsMessage: (_text: string) => void;
  notify: (_message: string, _kind: "info" | "error") => void;
}

export default function useQuestionAnswerSender(
  options: QuestionAnswerSenderOptions,
): (_answers: QuestionAnswerData[], _questionId?: string) => Promise<QuestionAnswerVia> {
  // The latest callbacks, without re-creating the sender on every render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  // questionIds whose answer is in flight or delivered.
  const claimedRef = useRef(new Set<string>());

  return useCallback(async (answers: QuestionAnswerData[], questionId?: string) => {
    const { getConversationId, sendAsMessage, notify } = optionsRef.current;
    const claimed = claimedRef.current;
    if (questionId) {
      if (claimed.has(questionId)) return "duplicate";
      claimed.add(questionId);
    }
    try {
      await PrismService.sendUserQuestionAnswer(getConversationId(), answers, { questionId });
      return "answer";
    } catch (answerError: unknown) {
      if ((answerError as { status?: number })?.status === 404) {
        const text = answersToMessageText(answers);
        if (text) {
          sendAsMessage(text);
          notify("The question was no longer open — sent your answer as a message", "info");
          return "message";
        }
      }
      if (questionId) claimed.delete(questionId);
      console.error("[useQuestionAnswerSender] failed:", answerError);
      notify(`Could not send the answer — ${getErrorMessage(answerError)}`, "error");
      return "failed";
    }
  }, []);
}
