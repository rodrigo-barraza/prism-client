/**
 * A turn parked on its user shows "Waiting for you", never a spinner — and it
 * does so from the pending cards alone, so a reloaded tab (nothing streaming,
 * `isGenerating` false after a server restart) still shows it.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import StatusBarComponent from "../../components/StatusBarComponent";
import { PHASE_TOKENS } from "../statusBarPhaseTokens";
import { APPROVAL_STATUS } from "../../constants";
import { AWAITING_USER_LABEL, awaitingUserStatus, isAwaitingUser } from "../awaitingUserStatus";

const NOTHING_PENDING = {
  isUserExplicitlyStopped: false,
  planProposal: null,
  pendingApprovals: [],
  pendingUserQuestion: null,
};

describe("awaitingUserStatus", () => {
  it("is 'awaiting' while an approval card is pending — whether or not anything streams", () => {
    expect(
      awaitingUserStatus({
        ...NOTHING_PENDING,
        pendingApprovals: [{ status: APPROVAL_STATUS.APPROVED }, { status: APPROVAL_STATUS.PENDING }],
      }),
    ).toEqual({ phase: "awaiting", label: AWAITING_USER_LABEL });
  });

  it("covers a pending plan proposal and an open question too", () => {
    expect(isAwaitingUser({ ...NOTHING_PENDING, planProposal: { status: APPROVAL_STATUS.PENDING } })).toBe(true);
    expect(isAwaitingUser({ ...NOTHING_PENDING, pendingUserQuestion: { questionId: "q-1" } })).toBe(true);
  });

  it("covers a turn paused at its cost cap (prompt 13 Landing 3)", () => {
    expect(
      awaitingUserStatus({ ...NOTHING_PENDING, budgetPause: { pauseId: "pause-1", spentDollars: 2, maxCostDollars: 1.5 } }),
    ).toEqual({ phase: "awaiting", label: AWAITING_USER_LABEL });
    expect(isAwaitingUser({ ...NOTHING_PENDING, budgetPause: null })).toBe(false);
  });

  it("is null when every card is decided, and once the user pressed Stop", () => {
    expect(
      awaitingUserStatus({ ...NOTHING_PENDING, pendingApprovals: [{ status: APPROVAL_STATUS.APPROVED }] }),
    ).toBeNull();
    expect(
      awaitingUserStatus({
        ...NOTHING_PENDING,
        isUserExplicitlyStopped: true,
        pendingApprovals: [{ status: APPROVAL_STATUS.PENDING }],
      }),
    ).toBeNull();
  });

  it("renders as 'Waiting for you' without the pulsing spinner", () => {
    const status = awaitingUserStatus({ ...NOTHING_PENDING, pendingUserQuestion: { questionId: "q-1" } })!;
    const { container } = render(<StatusBarComponent active phase={status.phase} label={status.label} />);
    expect(screen.getByText(/Waiting for you/)).toBeTruthy();
    expect(container.querySelector("[class*='status-bar-pulse']")).toBeNull();
    // Nor a creeping percentage: nothing is progressing while it waits.
    expect(container.querySelector("[class*='status-bar-progress']")).toBeNull();
    expect(PHASE_TOKENS.awaiting.label).toBe(AWAITING_USER_LABEL);

    const generating = render(<StatusBarComponent active phase="generating" label="Generating..." />);
    expect(generating.container.querySelector("[class*='status-bar-pulse']")).not.toBeNull();
    expect(generating.container.querySelector("[class*='status-bar-progress']")).not.toBeNull();
  });
});
