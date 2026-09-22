/**
 * The cards a loaded conversation is still waiting on, from the
 * `pendingApproval` / `pendingQuestion` prism-service serves with it.
 *
 * Those waits are durable (prism-service prompt 13): a turn parked on its
 * user survives a server restart and has no timeout, so a conversation may be
 * opened hours later — from the sidebar, a reload, or a `?conversation=` link
 * in a push notification — and every one of those load paths must bring the
 * cards back. They all go through this.
 */
import { EXECUTION_STATUS } from "../constants";
import { approvalsFromPendingSnapshot, type PendingApproval } from "./approvalCards";
import type { UserQuestionItem } from "../types/types";

type SnapshotCalls = Parameters<typeof approvalsFromPendingSnapshot>[0];

export interface ServedPendingDecisions {
  pendingApproval?: {
    isPending?: boolean;
    type?: string;
    batchId?: string;
    toolCalls?: SnapshotCalls;
  };
  pendingQuestion?: {
    isPending?: boolean;
    questionId?: string;
    questions?: UserQuestionItem[];
  };
}

export interface PendingDecisionCards {
  approvals: PendingApproval[];
  planProposal: { plan: string; steps: string[]; status: "pending" } | null;
  question: { questionId?: string; questions: UserQuestionItem[] } | null;
}

function planSteps(planText: string): string[] {
  return planText
    .split("\n")
    .filter((line) => line.trim().startsWith("-") || /^\d+\./.test(line.trim()));
}

export function pendingDecisionCards(
  conversation: ServedPendingDecisions,
  displayMessages: ReadonlyArray<{ role?: string; content?: unknown }>,
): PendingDecisionCards {
  const cards: PendingDecisionCards = { approvals: [], planProposal: null, question: null };

  const approval = conversation.pendingApproval;
  if (approval?.isPending) {
    if (approval.type === "plan") {
      // The plan as recorded with its decision; else the last assistant text
      // (a parked turn restored after a restart may have none).
      const recorded = approval.toolCalls?.[0]?.args?.plan;
      const lastAssistantContent = [...displayMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.content;
      const planText =
        typeof recorded === "string" && recorded
          ? recorded
          : typeof lastAssistantContent === "string"
            ? lastAssistantContent
            : "";
      if (planText) {
        cards.planProposal = {
          plan: planText,
          steps: planSteps(planText),
          status: EXECUTION_STATUS.PENDING as "pending",
        };
      }
    } else if (approval.toolCalls) {
      cards.approvals = approvalsFromPendingSnapshot(approval.toolCalls, approval.batchId);
    }
  }

  const question = conversation.pendingQuestion;
  if (question?.isPending) {
    cards.question = { questionId: question.questionId, questions: question.questions || [] };
  }
  return cards;
}
