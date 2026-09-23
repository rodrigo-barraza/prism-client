import type { ApprovalDecidedEvent, ApprovalPreview, ApprovalRequiredEvent } from "../types/types";

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
   * The server restarted while this call was running: it may have partly
   * run, and the card asks whether to run it again (`reason` says so).
   */
  retryAfterRestart?: boolean;
  reason?: string;
  /**
   * Auto mode put this call to the user instead of deciding: its classifier
   * asked, could not decide, or is paused after repeated denials. The
   * server's words for which, and the classifier's category when it named one.
   */
  autoModeReason?: string;
  autoModeCategory?: string;
  /**
   * An external ACP agent asked for its own call (a sub-agent on the `acp`
   * runtime): the server's words naming the agent and the call. Its
   * arguments are the agent's own — the card offers no edit and no
   * "Always allow" rule (Prism's rules do not reach the agent's tools).
   */
  externalAgentReason?: string;
  /**
   * Set when a sub-agent asked: the conversation its loop is keyed by, where
   * the decision must be sent. Absent: the conversation on screen.
   */
  conversationId?: string;
  /** Which sub-agent asked, for the card's label. */
  subAgentDescription?: string;
  /**
   * A write to a protected path (.git, .env*, Prism configuration): it asks
   * in every mode, and no "Always allow" rule can stop it asking.
   */
  protectedPath?: string;
  status: ApprovalCardStatus;
}

function normalizeTier(tier: unknown): 1 | 2 | 3 | undefined {
  const value = Number(tier);
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

/** A card from an `approval_required` event; null for an event without a call id. */
export function approvalFromEvent(data: ApprovalRequiredEvent): PendingApproval | null {
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
    ...retryFields(data.requestedBy, data.reason),
    ...autoModeFields(data.requestedBy, data.reason, data.category),
    ...externalAgentFields(data.requestedBy, data.reason),
    ...(typeof data.approvalConversationId === "string" && data.approvalConversationId
      ? { conversationId: data.approvalConversationId }
      : {}),
    ...(typeof data.subAgentDescription === "string" && data.approvalConversationId
      ? { subAgentDescription: data.subAgentDescription }
      : {}),
    ...(typeof data.protectedPath === "string" && data.protectedPath
      ? { protectedPath: data.protectedPath }
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
  requestedBy?: string;
  reason?: string | null;
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
            ...retryFields(toolCall.requestedBy, toolCall.reason),
            ...autoModeFields(toolCall.requestedBy, toolCall.reason),
            ...externalAgentFields(toolCall.requestedBy, toolCall.reason),
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
  data: ApprovalDecidedEvent,
): PendingApproval[] {
  if (typeof data.toolCallId !== "string") return approvals;
  return setApprovalStatus(
    approvals,
    [data.toolCallId],
    data.decision === "allow" ? "approved" : "rejected",
  );
}

/** `requestedBy` of a "run it again?" card (prism-service TURN_RESUME.RETRY_REQUESTED_BY). */
const RETRY_AFTER_RESTART = "restart";

/** `requestedBy` of a card auto mode put out (prism-service AutoModeGate). */
const ASKED_BY_AUTO_MODE = "classifier";

/** `requestedBy` of an external ACP agent's own request (prism-service APPROVALS.EXTERNAL_AGENT_REQUESTED_BY). */
const ASKED_BY_EXTERNAL_AGENT = "external_agent";

function externalAgentFields(
  requestedBy: unknown,
  reason: unknown,
): Pick<PendingApproval, "externalAgentReason"> {
  if (requestedBy !== ASKED_BY_EXTERNAL_AGENT) return {};
  return {
    externalAgentReason:
      typeof reason === "string" && reason ? reason : "An external agent asks permission for its own call.",
  };
}

function autoModeFields(
  requestedBy: unknown,
  reason: unknown,
  category?: unknown,
): Pick<PendingApproval, "autoModeReason" | "autoModeCategory"> {
  if (requestedBy !== ASKED_BY_AUTO_MODE) return {};
  return {
    autoModeReason: typeof reason === "string" && reason ? reason : "Auto mode asks you to decide this call.",
    ...(typeof category === "string" && category ? { autoModeCategory: category } : {}),
  };
}

function retryFields(
  requestedBy: unknown,
  reason: unknown,
): Pick<PendingApproval, "retryAfterRestart" | "reason"> {
  if (requestedBy !== RETRY_AFTER_RESTART) return {};
  return { retryAfterRestart: true, ...(typeof reason === "string" && reason ? { reason } : {}) };
}
