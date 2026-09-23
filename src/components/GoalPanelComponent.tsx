"use client";

import { useState } from "react";
import {
  Target,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  Check,
  X,
  CalendarClock,
  Loader,
  Pencil,
  CircleCheck,
  CircleX,
  Circle,
  ShieldCheck,
} from "lucide-react";
import type {
  ConversationGoal,
  ConversationGoalInput,
  GoalCriterion,
  GoalPauseReason,
  ModelsMap,
} from "../types/types";
import GoalFormComponent from "./GoalFormComponent";
import GoalProposalCardComponent from "./GoalProposalCardComponent";
import styles from "./GoalPanelComponent.module.css";

interface GoalPanelComponentProps {
  goal: ConversationGoal | null | undefined;
  /** A goal the agent proposed, waiting for approval. */
  proposal?: ConversationGoal | null;
  onPause?: () => void;
  onResume?: () => void;
  onClear?: () => void;
  /** The goal form: create (no goal yet) or edit in place. Resolves true when saved. */
  onSave?: (_input: ConversationGoalInput) => Promise<boolean> | boolean;
  onApproveProposal?: () => void;
  onDeclineProposal?: () => void;
  /** Text models for the form's verifier picker. */
  models?: ModelsMap | null;
  /** Offer "Set goal" when there is none (a persisted conversation). */
  canCreate?: boolean;
  isBusy?: boolean;
  error?: string | null;
  /** Viewer-only surface (admin): no Pause / Resume / Clear / Edit. */
  readOnly?: boolean;
}

const STATUS_LABEL: Record<ConversationGoal["status"], string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  blocked: "Blocked",
  proposed: "Proposed",
};

/** Why a goal stopped, in the user's terms. */
export const PAUSE_REASON_LABEL: Record<GoalPauseReason, string> = {
  budget: "Budget reached",
  max_iterations: "Revision limit reached",
  empty_continuations: "Stopped making progress",
  user_message: "You sent a message",
  restart: "Interrupted by a restart",
  failed: "The verifier needs you",
  user: "Paused by you",
};

const VERDICT_LABEL = {
  satisfied: "Satisfied",
  needs_revision: "Needs revision",
  failed: "Rubric contradicts the task",
} as const;

function formatDollars(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function formatDeadline(iso: string): { label: string; overdue: boolean } {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return { label: iso, overdue: false };
  const date = new Date(time);
  const label = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { label, overdue: time < Date.now() };
}

/** The rubric, each criterion with the verifier's last word on it. */
function RubricList({
  label,
  criteria,
  goal,
}: {
  label: string;
  criteria: GoalCriterion[];
  goal: ConversationGoal;
}) {
  const results = new Map((goal.verification?.criteria ?? []).map((result) => [result.id, result]));
  return (
    <ul className={styles["rubric"]} aria-label={label}>
      {criteria.map((criterion) => {
        const result = results.get(criterion.id);
        const state = !result ? "unchecked" : result.pass ? "met" : "unmet";
        return (
          <li
            key={criterion.id}
            className={`${styles["rubric-item"]} ${styles[`rubric-${state}`] || ""}`}
            data-state={state}
            title={result?.pass ? result.evidence : undefined}
          >
            {state === "met" ? (
              <CircleCheck size={13} aria-label="Met" role="img" />
            ) : state === "unmet" ? (
              <CircleX size={13} aria-label="Not met" role="img" />
            ) : (
              <Circle size={13} aria-label="Not checked yet" role="img" />
            )}
            <span className={styles["rubric-text"]}>
              {criterion.criterion}
              {result && !result.pass && result.evidence && (
                <span className={styles["rubric-evidence"]}>{result.evidence}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Compact panel for the conversation's long-running goal: objective,
 * status pill, the rubric with each criterion's last verdict, progress,
 * budget / turns / deadline, why it is paused or what blocks it, and
 * Edit / Pause / Resume / Clear. Above it, a goal the agent proposed waits
 * for Approve / Decline. With no goal, a "Set goal" button opens the form.
 */
export default function GoalPanelComponent({
  goal,
  proposal = null,
  onPause,
  onResume,
  onClear,
  onSave,
  onApproveProposal,
  onDeclineProposal,
  models,
  canCreate = false,
  isBusy = false,
  error = null,
  readOnly = false,
}: GoalPanelComponentProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  /** What the form is open for: a new goal, the current one, or the proposal. */
  const [editing, setEditing] = useState<null | "create" | "edit" | "proposal">(null);

  const submit = async (input: ConversationGoalInput) => {
    if (!onSave) return;
    if (await onSave(input)) setEditing(null);
  };

  if (editing && onSave && !readOnly) {
    const initial = editing === "edit" ? goal : editing === "proposal" ? proposal : null;
    return (
      <section className={`goal-panel-component ${styles["panel"]}`} aria-label="Goal form">
        <div className={styles["header"]}>
          <Target size={14} className={styles["icon"]} />
          <span className={styles["label"]}>{editing === "edit" ? "Edit goal" : "New goal"}</span>
          {isBusy && <Loader size={12} className={styles["spinner"]} aria-label="Working" />}
        </div>
        <GoalFormComponent
          mode={editing === "edit" ? "edit" : "create"}
          initial={initial}
          models={models}
          isBusy={isBusy}
          onSubmit={submit}
          onCancel={() => setEditing(null)}
        />
        {error && <div className={styles["error"]}>{error}</div>}
      </section>
    );
  }

  const proposalCard = proposal ? (
    <GoalProposalCardComponent
      proposal={proposal}
      onApprove={onApproveProposal}
      onDecline={onDeclineProposal}
      onEdit={onSave ? () => setEditing("proposal") : undefined}
      isBusy={isBusy}
      readOnly={readOnly}
    />
  ) : null;

  if (!goal) {
    if (proposalCard) return proposalCard;
    if (!canCreate || !onSave || readOnly) return null;
    return (
      <div className={`goal-entry-component ${styles["entry"]}`}>
        <button
          type="button"
          className={styles["entry-button"]}
          onClick={() => setEditing("create")}
          title="Give this conversation a goal an independent verifier checks"
        >
          <Target size={12} />
          Set goal
        </button>
      </div>
    );
  }

  const percent =
    typeof goal.progress?.percent === "number" && Number.isFinite(goal.progress.percent)
      ? Math.max(0, Math.min(100, goal.progress.percent))
      : null;
  const maxCost = goal.budget?.maxCostDollars;
  const maxTurns = goal.budget?.maxTurns;
  const deadline = goal.budget?.deadline ? formatDeadline(goal.budget.deadline) : null;
  const costOver = typeof maxCost === "number" && goal.spentDollars > maxCost;
  const turnsOver = typeof maxTurns === "number" && goal.turnsUsed > maxTurns;
  const isBlocked = goal.status === "blocked" || !!goal.blockedOn;
  const canToggle = goal.status === "active" || goal.status === "paused";
  const verification = goal.verification ?? null;
  const pause = goal.status === "paused" ? goal.pause : null;

  return (
    <>
      {proposalCard}
      <section
        className={`goal-panel-component ${styles["panel"]} ${styles[`status-${goal.status}`] || ""}`}
        aria-label="Conversation goal"
        data-status={goal.status}
      >
        <div className={styles["header"]}>
          <Target size={14} className={styles["icon"]} />
          <span className={styles["label"]}>Goal</span>
          <span className={`${styles["status-pill"]} ${styles[`pill-${goal.status}`] || ""}`}>
            {STATUS_LABEL[goal.status] ?? goal.status}
          </span>
          {isBusy && <Loader size={12} className={styles["spinner"]} aria-label="Working" />}
          {!readOnly && (
          <div className={styles["actions"]}>
            {onSave && (
              <button
                type="button"
                className={styles["action-button"]}
                onClick={() => setEditing("edit")}
                disabled={isBusy}
                aria-label="Edit goal"
                title="Edit goal"
              >
                <Pencil size={12} />
              </button>
            )}
            {canToggle && (
              <button
                type="button"
                className={styles["action-button"]}
                onClick={goal.status === "paused" ? onResume : onPause}
                disabled={isBusy}
                aria-label={goal.status === "paused" ? "Resume goal" : "Pause goal"}
              >
                {goal.status === "paused" ? <Play size={12} /> : <Pause size={12} />}
                {goal.status === "paused" ? "Resume" : "Pause"}
              </button>
            )}
            {!confirmingClear ? (
              <button
                type="button"
                className={`${styles["action-button"]} ${styles["action-danger"]}`}
                onClick={() => setConfirmingClear(true)}
                disabled={isBusy}
                aria-label="Clear goal"
              >
                <Trash2 size={12} />
                Clear
              </button>
            ) : (
              <span className={styles["confirm-row"]} role="group" aria-label="Confirm clear goal">
                <span className={styles["confirm-text"]}>Clear this goal?</span>
                <button
                  type="button"
                  className={`${styles["action-button"]} ${styles["action-danger"]}`}
                  onClick={() => {
                    setConfirmingClear(false);
                    onClear?.();
                  }}
                  disabled={isBusy}
                  aria-label="Confirm clear goal"
                >
                  <Check size={12} />
                  Confirm
                </button>
                <button
                  type="button"
                  className={styles["action-button"]}
                  onClick={() => setConfirmingClear(false)}
                  aria-label="Cancel clear goal"
                >
                  <X size={12} />
                  Cancel
                </button>
              </span>
            )}
          </div>
          )}
        </div>

        <div className={styles["objective"]} title={goal.completionCriteria || undefined}>
          {goal.objective}
        </div>
        {goal.rubric && goal.rubric.length > 0 ? (
          <RubricList label="Rubric" criteria={goal.rubric} goal={goal} />
        ) : (
          goal.completionCriteria && (
            <div className={styles["criteria"]}>Done when: {goal.completionCriteria}</div>
          )
        )}
        {goal.stepRubric && goal.stepRubric.length > 0 && (
          <RubricList label="Step rubric" criteria={goal.stepRubric} goal={goal} />
        )}

        {verification && (
          <div
            className={`${styles["verdict"]} ${styles[`verdict-${verification.verdict}`] || ""}`}
            aria-label="Last verification"
          >
            <ShieldCheck size={12} />
            <span>
              <strong>{VERDICT_LABEL[verification.verdict] ?? verification.verdict}</strong>
              {" · round "}
              {verification.iteration}
              {typeof goal.maxIterations === "number" ? ` of ${goal.maxIterations}` : ""}
              {" · "}
              {verification.verifier.model}
              {verification.costDollars > 0 ? ` · ${formatDollars(verification.costDollars)}` : ""}
              {verification.reason ? ` — ${verification.reason}` : ""}
            </span>
          </div>
        )}

        <div className={styles["progress-row"]}>
          <div
            className={`${styles["progress-track"]} ${percent === null ? styles["progress-indeterminate"] : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-label="Goal progress"
          >
            <div
              className={styles["progress-fill"]}
              style={{ width: percent === null ? "100%" : `${percent}%` }}
            />
          </div>
          {percent !== null && <span className={styles["progress-percent"]}>{Math.round(percent)}%</span>}
        </div>
        {goal.progress?.summary && (
          <div className={styles["progress-summary"]}>{goal.progress.summary}</div>
        )}

        {pause && (
          <div className={styles["paused"]} role="status">
            <Pause size={13} />
            <span>
              <strong>{PAUSE_REASON_LABEL[pause.reason] ?? pause.reason}</strong>
              {pause.detail ? ` — ${pause.detail}` : ""}
            </span>
          </div>
        )}

        {isBlocked && goal.blockedOn && (
          <div className={styles["blocked"]} role="alert">
            <AlertTriangle size={13} />
            <span>
              <strong>Blocked on:</strong> {goal.blockedOn}
            </span>
          </div>
        )}

        <div className={styles["meta-row"]}>
          <span
            className={`${styles["meta"]} ${costOver ? styles["meta-over"] : ""}`}
            title="Spent / budget (main loop, sub-agents and verifier)"
          >
            {formatDollars(goal.spentDollars)}
            {typeof maxCost === "number" ? ` / ${formatDollars(maxCost)}` : ""}
          </span>
          <span
            className={`${styles["meta"]} ${turnsOver ? styles["meta-over"] : ""}`}
            title="Turns used / max"
          >
            {goal.turnsUsed}
            {typeof maxTurns === "number" ? ` / ${maxTurns}` : ""} turn
            {goal.turnsUsed === 1 && typeof maxTurns !== "number" ? "" : "s"}
          </span>
          {deadline && (
            <span
              className={`${styles["meta"]} ${deadline.overdue ? styles["meta-over"] : ""}`}
              title={goal.budget?.deadline}
            >
              <CalendarClock size={11} />
              {deadline.overdue ? "Overdue · " : "Due "}
              {deadline.label}
            </span>
          )}
        </div>

        {error && <div className={styles["error"]}>{error}</div>}
      </section>
    </>
  );
}
