"use client";

import { Lightbulb, Check, X, Pencil } from "lucide-react";
import type { ConversationGoal } from "../types/types";
import styles from "./GoalPanelComponent.module.css";

interface GoalProposalCardComponentProps {
  proposal: ConversationGoal;
  onApprove?: () => void;
  onDecline?: () => void;
  /** Edit before approving: the form opens prefilled with the proposal. */
  onEdit?: () => void;
  isBusy?: boolean;
  /** Viewer-only surface (admin): no actions. */
  readOnly?: boolean;
}

function budgetSummary(proposal: ConversationGoal): string | null {
  const parts: string[] = [];
  const budget = proposal.budget;
  if (typeof budget?.maxCostDollars === "number") parts.push(`up to $${budget.maxCostDollars}`);
  if (typeof budget?.maxTurns === "number") parts.push(`${budget.maxTurns} turns`);
  if (budget?.deadline) {
    const time = Date.parse(budget.deadline);
    if (!Number.isNaN(time)) {
      parts.push(
        `by ${new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      );
    }
  }
  if (typeof proposal.maxIterations === "number") {
    parts.push(`${proposal.maxIterations} revision${proposal.maxIterations === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * A goal the agent proposed (`propose_goal`). It is not the goal — the
 * agent is not held to it and nothing runs on its own — until the user
 * approves it here.
 */
export default function GoalProposalCardComponent({
  proposal,
  onApprove,
  onDecline,
  onEdit,
  isBusy = false,
  readOnly = false,
}: GoalProposalCardComponentProps) {
  const budget = budgetSummary(proposal);
  return (
    <section
      className={`goal-proposal-card-component ${styles["panel"]} ${styles["proposal"]}`}
      aria-label="Proposed goal"
    >
      <div className={styles["header"]}>
        <Lightbulb size={14} className={styles["icon"]} />
        <span className={styles["label"]}>Proposed goal</span>
        <span className={styles["proposal-hint"]}>The agent suggests holding itself to this</span>
      </div>
      <div className={styles["objective"]}>{proposal.objective}</div>
      {proposal.rubric && proposal.rubric.length > 0 && (
        <ol className={styles["proposal-criteria"]} aria-label="Proposed rubric">
          {proposal.rubric.map((criterion) => (
            <li key={criterion.id}>{criterion.criterion}</li>
          ))}
        </ol>
      )}
      {budget && <div className={styles["meta-row"]}>{budget}</div>}
      {!readOnly && (
        <div className={styles["proposal-actions"]}>
          <button
            type="button"
            className={`${styles["action-button"]} ${styles["action-primary"]}`}
            onClick={onApprove}
            disabled={isBusy}
          >
            <Check size={12} />
            Approve
          </button>
          {onEdit && (
            <button type="button" className={styles["action-button"]} onClick={onEdit} disabled={isBusy}>
              <Pencil size={12} />
              Edit
            </button>
          )}
          <button
            type="button"
            className={`${styles["action-button"]} ${styles["action-danger"]}`}
            onClick={onDecline}
            disabled={isBusy}
          >
            <X size={12} />
            Decline
          </button>
        </div>
      )}
    </section>
  );
}
