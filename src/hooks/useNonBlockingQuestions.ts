"use client";

/**
 * Open non-blocking agent questions (`user_question` with `blocking:false`).
 *
 * The agent keeps working while these are open, so — unlike the single
 * blocking `pendingUserQuestion` — several can be open at once, keyed by
 * `questionId`, and answering one never touches the composer. Answered
 * cards stay in the list collapsed to "Answered" until the conversation
 * changes (`clear`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SSEData, UserQuestionItem } from "../types/types";

export interface QuestionAnswerData {
  answer: string | string[];
  annotations?: string;
}

export interface NonBlockingQuestionCard {
  questionId: string;
  questions: UserQuestionItem[];
  context: string | null;
  status: "open" | "answered";
  answers?: QuestionAnswerData[];
  /** How the answer reached the agent (404 on /agent/answer → sent as a message). */
  answeredVia?: "answer" | "message";
  receivedAt: number;
}

export interface NonBlockingQuestionsApi {
  cards: NonBlockingQuestionCard[];
  openCards: NonBlockingQuestionCard[];
  openCount: number;
  /** Upsert from a `user_question` event; ignored without a questionId or when already known. */
  open: (_event: SSEData) => void;
  markAnswered: (
    _questionId: string,
    _answers: QuestionAnswerData[],
    _via?: "answer" | "message",
  ) => void;
  dismiss: (_questionId: string) => void;
  clear: () => void;
}

export default function useNonBlockingQuestions(
  conversationId?: string | null,
): NonBlockingQuestionsApi {
  const [cards, setCards] = useState<NonBlockingQuestionCard[]>([]);

  // Cards belong to one conversation — switching away drops them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on conversation change
    setCards([]);
  }, [conversationId]);

  const open = useCallback((event: SSEData) => {
    const questionId = typeof event.questionId === "string" ? event.questionId : "";
    if (!questionId) return;
    const questions = Array.isArray(event.questions) ? event.questions : [];
    if (questions.length === 0) return;
    setCards((previous) => {
      if (previous.some((card) => card.questionId === questionId)) return previous;
      return [
        ...previous,
        {
          questionId,
          questions,
          context: typeof event.context === "string" ? event.context : null,
          status: "open",
          receivedAt: Date.now(),
        },
      ];
    });
  }, []);

  const markAnswered = useCallback(
    (questionId: string, answers: QuestionAnswerData[], via: "answer" | "message" = "answer") => {
      setCards((previous) =>
        previous.map((card) =>
          card.questionId === questionId
            ? { ...card, status: "answered", answers, answeredVia: via }
            : card,
        ),
      );
    },
    [],
  );

  const dismiss = useCallback((questionId: string) => {
    setCards((previous) => previous.filter((card) => card.questionId !== questionId));
  }, []);

  const clear = useCallback(() => setCards([]), []);

  const openCards = useMemo(() => cards.filter((card) => card.status === "open"), [cards]);

  return {
    cards,
    openCards,
    openCount: openCards.length,
    open,
    markAnswered,
    dismiss,
    clear,
  };
}
