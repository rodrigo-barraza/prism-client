import type { ApprovalPreview, SSEData } from "../types/types";

/**
 * Approval cards — one per pending tool call, decided on its own
 * (POST /agent/approve with its toolCallId). Pure state helpers shared by
 * the chat's SSE handlers, its conversation hydration and the cards.
 */

export type ApprovalCardStatus = "pending" | "approved" | "rejected";

export interface PendingApproval {
  /** The toolCallId the server decides this card by. */
  id: string;
  /** Cards of one model step share a batch; "allow the rest" reaches them all. */
  batchId?: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  tier?: 1 | 2 | 3;
  /** What a file write would change, when the server could compute it. */
  preview?: ApprovalPreview;
  /**
   * Set when a sub-agent asked: the conversation its loop is keyed by, where
   * the decision must be sent. Absent: the conversation on screen.
   */
  conversationId?: string;
  /** Which sub-agent asked, for the card's label. */
  subAgentDescription?: string;
  status: ApprovalCardStatus;
}

function normalizeTier(tier: unknown): 1 | 2 | 3 | undefined {
  const value = Number(tier);
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

/** A card from an `approval_required` event; null for an event without a call id. */
export function approvalFromEvent(data: SSEData): PendingApproval | null {
  const toolCallId =
    (typeof data.toolCallId === "string" && data.toolCallId) || data.toolCall?.id;
  if (!toolCallId) return null;
  return {
    id: toolCallId,
    ...(typeof data.batchId === "string" ? { batchId: data.batchId } : {}),
    toolName: data.toolCall?.name || "",
    toolArgs: data.toolCall?.args || {},
    tier: normalizeTier(data.tier),
    ...(data.preview ? { preview: data.preview } : {}),
    ...(typeof data.approvalConversationId === "string" && data.approvalConversationId
      ? { conversationId: data.approvalConversationId }
      : {}),
    ...(typeof data.subAgentDescription === "string" && data.approvalConversationId
      ? { subAgentDescription: data.subAgentDescription }
      : {}),
    status: "pending",
  };
}

/** Add a card, replacing one with the same id (a replayed event). */
export function addApproval(
  approvals: PendingApproval[],
  approval: PendingApproval,
): PendingApproval[] {
  return [...approvals.filter((existing) => existing.id !== approval.id), approval];
}

interface PendingApprovalSnapshotCall {
  id?: string | null;
  name?: string;
  args?: Record<string, unknown>;
  batchId?: string;
  preview?: ApprovalPreview;
  _approval?: { tier?: string | number };
}

/** Cards for the calls a conversation's running turn is still waiting on (GET /conversations/:id). */
export function approvalsFromPendingSnapshot(
  toolCalls: PendingApprovalSnapshotCall[],
  batchId?: string,
): PendingApproval[] {
  return toolCalls.flatMap((toolCall) =>
    toolCall.id
      ? [
          {
            id: toolCall.id,
            ...(toolCall.batchId || batchId ? { batchId: toolCall.batchId || batchId } : {}),
            toolName: toolCall.name || "",
            toolArgs: toolCall.args || {},
            tier: normalizeTier(toolCall._approval?.tier),
            ...(toolCall.preview ? { preview: toolCall.preview } : {}),
            status: "pending" as const,
          },
        ]
      : [],
  );
}

export function setApprovalStatus(
  approvals: PendingApproval[],
  toolCallIds: readonly string[],
  status: ApprovalCardStatus,
): PendingApproval[] {
  const ids = new Set(toolCallIds);
  return approvals.map((approval) =>
    ids.has(approval.id) && approval.status !== status ? { ...approval, status } : approval,
  );
}

/** Apply an `approval_decided` event — this tab, another tab, a scope, or a timeout. */
export function applyApprovalDecided(
  approvals: PendingApproval[],
  data: SSEData,
): PendingApproval[] {
  if (typeof data.toolCallId !== "string") return approvals;
  return setApprovalStatus(
    approvals,
    [data.toolCallId],
    data.decision === "allow" ? "approved" : "rejected",
  );
}
