/**
 * A turn parked on its user shows "Waiting for you", never a spinner.
 *
 * Since prism-service prompt 13 a wait on the user has no timeout and
 * survives a server restart: the turn parks until the user decides. So the
 * status bar keys off the pending cards themselves — an approval card, a plan
 * proposal, a question, a budget pause — and not off `isGenerating`. After a reload (or a
 * restart of the server) nothing streams to this tab any more, but the cards
 * come back with the conversation and the turn is still waiting on them.
 */
import { APPROVAL_STATUS } from "../constants";

export const AWAITING_USER_LABEL = "Waiting for you";

export interface AwaitingUserInputs {
  /** The user pressed Stop: the turn is over, whatever cards remain. */
  isUserExplicitlyStopped: boolean;
  planProposal: { status?: string } | null | undefined;
  pendingApprovals: ReadonlyArray<{ status?: string }>;
  pendingUserQuestion: unknown;
  /** A turn paused at its cost cap (prompt 13 Landing 3) waits on a raise. */
  budgetPause?: unknown;
}

/** Is anything on screen waiting for the user's decision? */
export function isAwaitingUser({
  planProposal,
  pendingApprovals,
  pendingUserQuestion,
  budgetPause,
}: Omit<AwaitingUserInputs, "isUserExplicitlyStopped">): boolean {
  return (
    planProposal?.status === APPROVAL_STATUS.PENDING ||
    pendingApprovals.some((approval) => approval.status === APPROVAL_STATUS.PENDING) ||
    (pendingUserQuestion !== null && pendingUserQuestion !== undefined) ||
    (budgetPause !== null && budgetPause !== undefined)
  );
}

/** The status bar's phase and label while the turn waits on its user; null otherwise. */
export function awaitingUserStatus(
  inputs: AwaitingUserInputs,
): { phase: "awaiting"; label: string } | null {
  if (inputs.isUserExplicitlyStopped || !isAwaitingUser(inputs)) return null;
  return { phase: "awaiting", label: AWAITING_USER_LABEL };
}
