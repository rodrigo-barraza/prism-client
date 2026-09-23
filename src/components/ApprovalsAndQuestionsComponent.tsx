"use client";

/**
 * What a turn waits on its user for.
 *
 * - In the transcript, under the rows (the default export): the approval
 *   cards (one per tool call), the blocking question, and a turn paused at
 *   its cost cap.
 * - Above the composer (`PinnedQuestionsComponent`): the non-blocking
 *   questions — the agent keeps working, so they never gate the composer.
 *
 * A read-only viewer (admin) answers nothing: the chat does not render these.
 */

import ApprovalCardsComponent from "./ApprovalCardsComponent";
import UserQuestionCardComponent from "./UserQuestionCardComponent";
import BudgetPauseCardComponent from "./BudgetPauseCardComponent";
import NonBlockingQuestionsComponent from "./NonBlockingQuestionsComponent";
import type { AgentConversationSetters } from "../hooks/useAgentConversation";
import type { BudgetPauseApi } from "../hooks/useBudgetPause";
import type { NonBlockingQuestionsApi, QuestionAnswerData } from "../hooks/useNonBlockingQuestions";
import type { QuestionAnswerVia } from "../hooks/useQuestionAnswerSender";
import type { ConversationGoal } from "../types/types";
import type { PendingApproval } from "../utils/approvalCards";
import type { PendingUserQuestion } from "../utils/agentConversationReducer";

/** Answer through `/agent/answer`, or as a new message once the turn has ended. */
export type SendQuestionAnswer = (
  _answers: QuestionAnswerData[],
  _questionId?: string,
) => Promise<QuestionAnswerVia>;

interface ApprovalsAndQuestionsComponentProps {
  conversationId: string;
  approvals: PendingApproval[];
  setApprovals: AgentConversationSetters["setPendingApprovals"];
  /** Where "Always allow…" rules apply. */
  workspaceRoot: string | null;
  question: PendingUserQuestion | null;
  /** The blocking question was answered: it leaves the screen as the answer goes out. */
  onQuestionAnswered: () => void;
  sendAnswer: SendQuestionAnswer;
  budgetPause: BudgetPauseApi;
  /** The goal whose budget a raise may be (see useBudgetPause.raise). */
  goal: ConversationGoal | null;
  onGoalChange: (_goal: ConversationGoal | null) => void;
  onStop: () => void;
  onNotify: (_message: string, _type: "error" | "warning" | "info") => void;
}

export default function ApprovalsAndQuestionsComponent({
  conversationId,
  approvals,
  setApprovals,
  workspaceRoot,
  question,
  onQuestionAnswered,
  sendAnswer,
  budgetPause,
  goal,
  onGoalChange,
  onStop,
  onNotify,
}: ApprovalsAndQuestionsComponentProps) {
  return (
    <>
      {/* Pending approval cards — one per tool call */}
      <ApprovalCardsComponent
        conversationId={conversationId}
        approvals={approvals}
        setApprovals={setApprovals}
        onNotify={onNotify}
        alwaysAllow={{ conversationId, workspaceRoot }}
      />

      {/* Pending user question card */}
      {question && (
        <UserQuestionCardComponent
          questions={question.questions}
          context={question.context}
          onAnswer={(answers: QuestionAnswerData[]) => {
            const { questionId } = question;
            onQuestionAnswered();
            void sendAnswer(answers, questionId);
          }}
        />
      )}

      {/* A turn paused at its cost cap: raise the cap, or stop */}
      {budgetPause.pause && (
        <BudgetPauseCardComponent
          key={budgetPause.pause.pauseId}
          pause={budgetPause.pause}
          isBusy={budgetPause.isBusy}
          error={budgetPause.error}
          onRaise={(maxCostDollars) =>
            void budgetPause.raise(maxCostDollars, {
              goalBudget: goal?.budget,
              onGoal: onGoalChange,
            })
          }
          onStop={onStop}
        />
      )}
    </>
  );
}

/** Non-blocking agent questions — pinned above the composer, which stays usable. */
export function PinnedQuestionsComponent({
  questions,
  sendAnswer,
}: {
  questions: NonBlockingQuestionsApi;
  sendAnswer: SendQuestionAnswer;
}) {
  return (
    <NonBlockingQuestionsComponent
      cards={questions.cards}
      onAnswer={(questionId, answers) => {
        void sendAnswer(answers, questionId).then((via) => {
          if (via === "failed" || via === "duplicate") return;
          questions.markAnswered(questionId, answers, via);
        });
      }}
      onDismiss={questions.dismiss}
    />
  );
}
