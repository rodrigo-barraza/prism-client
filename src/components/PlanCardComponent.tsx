"use client";

import { useState, useMemo } from "react";
import { ClipboardList, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./PlanCardComponent.module.css";

export interface PlanCardProps {
  planText: string;
  steps?: string[];
  completedSteps?: number[];
  onApprove?: () => void;
  onReject?: () => void;
  status?: "pending" | "approved" | "rejected" | "executing";
}

/**
 * Plan approval card — shows the structured plan output with
 * approve/reject actions and step progress tracking.
 */
export default function PlanCardComponent({
  planText,
  steps = [],
  completedSteps = [],
  onApprove,
  onReject,
  status = "pending", // "pending" | "approved" | "rejected" | "executing"
}: PlanCardProps) {
  const [expanded, setExpanded] = useState(true);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "executing":
        return `Executing (${completedSteps.length}/${steps.length})`;
      default:
        return "Awaiting Approval";
    }
  }, [status, completedSteps.length, steps.length]);

  const statusColor = useMemo(() => {
    switch (status) {
      case "approved":
      case "executing":
        return "var(--color-success)";
      case "rejected":
        return "var(--color-danger)";
      default:
        return "var(--color-warning)";
    }
  }, [status]);

  return (
    <div className={`plan-card-component ${styles['card']} ${styles[status] || ""}`}>
      <button
        className={styles['header']}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <div className={styles['header-left']}>
          <ClipboardList size={16} style={{ color: statusColor }} />
          <span className={styles['title']}>Implementation Plan</span>
          <span
            className={styles['status-badge']}
            style={{
              color: statusColor,
              borderColor: `color-mix(in srgb, ${statusColor} 30%, transparent)`,
            }}
          >
            {statusLabel}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <>
          {status === "pending" && (
            <div className={styles['actions']}>
              <ButtonComponent
                variant="primary"
                icon={Check}
                className={styles['approve-button']}
                onClick={onApprove}
              >
                Execute Plan
              </ButtonComponent>
              <ButtonComponent
                variant="destructive"
                icon={X}
                className={styles['reject-button']}
                onClick={onReject}
              >
                Cancel
              </ButtonComponent>
            </div>
          )}

          <div className={styles['plan-content']}>
            <MarkdownContent content={planText} />
          </div>

          {steps.length > 0 && status === "executing" && (
            <div className={styles['steps-progress']}>
              {steps.map((step, i) => {
                const isDone = completedSteps.includes(i);
                return (
                  <div
                    key={i}
                    className={`${styles['step']} ${isDone ? styles['step-done'] : ""}`}
                  >
                    <span className={styles['step-check']}>
                      {isDone ? (
                        <Check size={12} />
                      ) : (
                        <span className={styles['step-dot']} />
                      )}
                    </span>
                    <span className={styles['step-text']}>{step}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
