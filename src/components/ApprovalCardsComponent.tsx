"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import ApprovalCardComponent, { type ApprovalCardDecision } from "./ApprovalCardComponent";
import PrismService from "../services/PrismService";
import { setApprovalStatus, type PendingApproval } from "../utils/approvalCards";
import { getErrorMessage } from "../utils/errorMessage";

interface ApprovalCardsProps {
  /** The conversation whose running turn these calls belong to. */
  conversationId: string;
  approvals: PendingApproval[];
  setApprovals: Dispatch<SetStateAction<PendingApproval[]>>;
  /** Toast for outcomes a card cannot show itself. */
  onNotify: (_message: string, _type: "error" | "warning" | "info") => void;
  /** Where "Always allow…" rules apply; omitted, the cards don't offer it. */
  alwaysAllow?: { conversationId?: string | null; workspaceRoot?: string | null };
}

/**
 * The pending approval cards of a conversation — one per tool call, each
 * decided on its own. A card shows "Sending…" while its decision is in
 * flight and only leaves once the server confirms; a failed request puts it
 * back as it was and raises a toast. The server's `decidedToolCallIds` say
 * which cards a batch- or conversation-wide allow settled.
 *
 * Nothing here touches the tab-wide auto-approve toggle: "Auto-approve this
 * conversation" is stored on the conversation by the server.
 */
export default function ApprovalCardsComponent({
  conversationId,
  approvals,
  setApprovals,
  onNotify,
  alwaysAllow,
}: ApprovalCardsProps) {
  const [submitting, setSubmitting] = useState<ReadonlySet<string>>(() => new Set());
  const pending = approvals.filter((approval) => approval.status === "pending");

  const decide = useCallback(
    async (approval: PendingApproval, decision: ApprovalCardDecision): Promise<string | null> => {
      setSubmitting((current) => new Set(current).add(approval.id));
      const settledStatus = decision.decision === "allow" ? "approved" : "rejected";
      try {
        // A sub-agent's card is decided on the sub-agent's own loop.
        const response = await PrismService.sendApprovalDecision(approval.conversationId || conversationId, {
          toolCallId: approval.id,
          ...(approval.batchId ? { batchId: approval.batchId } : {}),
          ...decision,
        });
        const decided = response.decidedToolCallIds?.length ? response.decidedToolCallIds : [approval.id];
        setApprovals((current) => setApprovalStatus(current, decided, settledStatus));
        if (decision.scope === "conversation" && response.persisted === false) {
          onNotify("Allowed — but auto-approve could not be saved, so later turns will ask again", "warning");
        }
        return null;
      } catch (error) {
        const status = (error as { status?: number }).status;
        const message = getErrorMessage(error);
        if (status === 404 || status === 409) {
          // Decided elsewhere, timed out, or its turn ended — nothing to decide.
          setApprovals((current) => setApprovalStatus(current, [approval.id], "rejected"));
          onNotify(`That call is no longer waiting for approval — ${message}`, "info");
          return null;
        }
        // An edit the server refused is shown next to the editor.
        if (status === 400 && decision.editedArgs) return message;
        onNotify(`Could not send your decision — ${message}`, "error");
        return null;
      } finally {
        setSubmitting((current) => {
          const next = new Set(current);
          next.delete(approval.id);
          return next;
        });
      }
    },
    [conversationId, setApprovals, onNotify],
  );

  return (
    <>
      {pending.map((approval) => (
        <ApprovalCardComponent
          key={approval.id}
          toolName={approval.toolName}
          toolArgs={approval.toolArgs}
          tier={approval.tier}
          preview={approval.preview}
          retryAfterRestart={approval.retryAfterRestart}
          retryReason={approval.reason}
          otherPendingInBatch={
            approval.batchId
              ? pending.filter((other) => other.batchId === approval.batchId && other.id !== approval.id).length
              : 0
          }
          isSubmitting={submitting.has(approval.id)}
          subAgentDescription={approval.subAgentDescription}
          onDecide={(decision) => decide(approval, decision)}
          alwaysAllow={approval.retryAfterRestart ? undefined : alwaysAllow}
        />
      ))}
    </>
  );
}
