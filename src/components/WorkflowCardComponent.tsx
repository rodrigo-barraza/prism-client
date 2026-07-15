"use client";

import { useState } from "react";
import { Trash2, Zap, ChevronDown } from "lucide-react";
import type { WorkflowMemory } from "../types/types";
import BadgeComponent from "./BadgeComponent";
import styles from "./WorkflowCardComponent.module.css";

interface WorkflowCardComponentProps {
  workflow: WorkflowMemory;
  isConfirmingDelete?: boolean;
  onDeleteRequest: (_workflowId: string) => void;
  onDeleteConfirm: (_workflowId: string) => void;
  onDeleteCancel: () => void;
}

export default function WorkflowCardComponent({
  workflow,
  isConfirmingDelete = false,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: WorkflowCardComponentProps) {
  const workflowId = workflow._id;
  const [isStepsExpanded, setIsStepsExpanded] = useState(false);

  const successCount = workflow.steps.filter(
    (step) => step.isSuccess,
  ).length;
  const failureCount = workflow.steps.length - successCount;

  const requestPreview =
    workflow.userRequest.length > 120
      ? `${workflow.userRequest.slice(0, 120)}…`
      : workflow.userRequest;

  return (
    <div className={styles["workflow-card"]}>
      <div className={styles["workflow-card-header"]}>
        <div className={styles["workflow-icon"]}>
          <Zap size={14} />
        </div>
        <div className={styles["workflow-info"]}>
          <div className={styles["workflow-request-title"]}>
            {requestPreview}
          </div>
          <div className={styles["workflow-meta-row"]}>
            <span className={styles["step-count-badge"]}>
              {workflow.stepCount} step{workflow.stepCount !== 1 ? "s" : ""}
            </span>
            <span className={styles["success-ratio"]}>
              {successCount}✓ {failureCount > 0 ? `${failureCount}✗` : ""}
            </span>
            {workflow.createdAt && (
              <BadgeComponent type="dateTime" date={workflow.createdAt} />
            )}
          </div>
        </div>
        <button
          className={styles["delete-button"]}
          onClick={() =>
            onDeleteRequest(isConfirmingDelete ? "" : workflowId)
          }
          title="Delete workflow"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Steps toggle */}
      {workflow.steps.length > 0 && (
        <button
          className={styles["steps-toggle-button"]}
          onClick={() => setIsStepsExpanded((previous) => !previous)}
        >
          <ChevronDown
            size={10}
            className={`${styles["steps-toggle-chevron"]} ${isStepsExpanded ? styles["steps-toggle-chevron-expanded"] : ""}`}
          />
          {isStepsExpanded ? "Hide steps" : "Show steps"}
        </button>
      )}

      {/* Expanded step list */}
      {isStepsExpanded && (
        <div className={styles["steps-list-container"]}>
          {workflow.steps.map((step, index) => {
            const argumentSummary = Object.entries(step.keyArguments)
              .slice(0, 3)
              .map(([key, value]) => `${key}=${value}`)
              .join(", ");

            return (
              <div key={index} className={styles["step-entry"]}>
                <span
                  className={`${styles["step-status-marker"]} ${step.isSuccess ? styles["step-status-success"] : styles["step-status-failure"]}`}
                >
                  {step.isSuccess ? "✓" : "✗"}
                </span>
                <span className={styles["step-tool-name"]}>
                  {step.toolName}
                </span>
                {argumentSummary && (
                  <span className={styles["step-arguments"]}>
                    ({argumentSummary})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {isConfirmingDelete && (
        <div className={styles["confirm-layout-row"]}>
          <span className={styles["confirm-label"]}>
            Delete this workflow?
          </span>
          <button
            className={`${styles["confirm-button"]} ${styles["confirm-button-yes"]}`}
            onClick={() => onDeleteConfirm(workflowId)}
          >
            Delete
          </button>
          <button
            className={`${styles["confirm-button"]} ${styles["confirm-button-no"]}`}
            onClick={onDeleteCancel}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
