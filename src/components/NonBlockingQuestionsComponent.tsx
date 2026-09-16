"use client";

import { useState } from "react";
import { MessageCircleQuestion, ChevronDown, ChevronUp, Check } from "lucide-react";
import UserQuestionCardComponent from "./UserQuestionCardComponent";
import type {
  NonBlockingQuestionCard,
  QuestionAnswerData,
} from "../hooks/useNonBlockingQuestions";
import styles from "./NonBlockingQuestionsComponent.module.css";

interface NonBlockingQuestionsComponentProps {
  cards: NonBlockingQuestionCard[];
  onAnswer: (_questionId: string, _answers: QuestionAnswerData[]) => void;
  onDismiss?: (_questionId: string) => void;
}

/**
 * Pinned list of NON-blocking agent questions. The agent keeps working
 * while these are open, so the list sits above the composer (which stays
 * usable) instead of gating it. Open cards render the full question card;
 * answered ones collapse to a one-line "Answered" row.
 */
export default function NonBlockingQuestionsComponent({
  cards,
  onAnswer,
  onDismiss,
}: NonBlockingQuestionsComponentProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (cards.length === 0) return null;
  const openCount = cards.filter((card) => card.status === "open").length;

  return (
    <div className={`non-blocking-questions-component ${styles["list"]}`}>
      <button
        type="button"
        className={styles["summary"]}
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <MessageCircleQuestion size={14} className={styles["summary-icon"]} />
        <span className={styles["summary-label"]}>
          {openCount > 0
            ? `${openCount} question${openCount > 1 ? "s" : ""} from the agent — it keeps working while you answer`
            : `${cards.length} answered question${cards.length > 1 ? "s" : ""}`}
        </span>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed &&
        cards.map((card) =>
          card.status === "open" ? (
            <div key={card.questionId} className={styles["open-card"]}>
              <UserQuestionCardComponent
                questions={card.questions}
                context={card.context}
                onAnswer={(answers) => onAnswer(card.questionId, answers)}
              />
            </div>
          ) : (
            <div key={card.questionId} className={styles["answered-row"]}>
              <Check size={12} className={styles["answered-icon"]} />
              <span className={styles["answered-question"]}>
                {card.questions[0]?.question}
                {card.questions.length > 1 ? ` (+${card.questions.length - 1})` : ""}
              </span>
              <span className={styles["answered-badge"]}>
                Answered{card.answeredVia === "message" ? " · sent as message" : ""}
              </span>
              {onDismiss && (
                <button
                  type="button"
                  className={styles["dismiss"]}
                  onClick={() => onDismiss(card.questionId)}
                  aria-label="Dismiss answered question"
                >
                  ×
                </button>
              )}
            </div>
          ),
        )}
    </div>
  );
}
