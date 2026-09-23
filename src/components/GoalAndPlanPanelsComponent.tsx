"use client";

/**
 * The panels above the composer that say where the turn is going: the
 * conversation's goal (set, progress, a proposal to approve) and the turn's
 * plan activity (checklist, brief, sources, code runs).
 *
 * A read-only viewer (admin) sees the goal without its controls and the
 * context budget beside it — the composer's slot, without the composer.
 */

import GoalPanelComponent from "./GoalPanelComponent";
import TurnActivityPanelComponent from "./TurnActivityPanelComponent";
import ContextBudgetIndicatorComponent from "./ContextBudgetIndicatorComponent";
import chatStyles from "./ChatAreaComponent.module.css";
import type { ConversationGoalApi } from "../hooks/useConversationGoal";
import type { PrismConfig } from "../types/types";
import type { AgentConversationState } from "../utils/agentConversationReducer";
import type { TurnActivity } from "../utils/turnActivity";

interface GoalAndPlanPanelsComponentProps {
  goal: ConversationGoalApi;
  turnActivity: TurnActivity;
  /** Text models for the goal form's verifier picker. */
  models: NonNullable<PrismConfig["textToText"]>["models"] | undefined;
  /** Offer "Set goal": a conversation that can have one (an agent's). */
  canCreateGoal: boolean;
}

export default function GoalAndPlanPanelsComponent({
  goal,
  turnActivity,
  models,
  canCreateGoal,
}: GoalAndPlanPanelsComponentProps) {
  return (
    <>
      <GoalPanelComponent
        goal={goal.goal}
        onPause={() => void goal.pause()}
        onResume={() => void goal.resume()}
        onClear={() => void goal.clear()}
        isBusy={goal.isBusy}
        error={goal.error}
        proposal={goal.proposal}
        onSave={goal.save}
        onApproveProposal={() => void goal.approveProposal()}
        onDeclineProposal={() => void goal.declineProposal()}
        models={models}
        canCreate={canCreateGoal}
      />
      <TurnActivityPanelComponent activity={turnActivity} />
    </>
  );
}

/** The admin viewer's read-only goal and context budget, in the composer's slot. */
export function ReadOnlyGoalAndBudgetComponent({
  goal,
  contextBudget,
}: {
  goal: ConversationGoalApi["goal"];
  contextBudget: AgentConversationState["contextBudget"];
}) {
  if (!contextBudget && !goal) return null;
  return (
    <div className={chatStyles['input-wrapper']}>
      <GoalPanelComponent goal={goal} readOnly />
      {contextBudget && <ContextBudgetIndicatorComponent contextBudget={contextBudget} />}
    </div>
  );
}
