/**
 * Every load path brings back the cards a parked turn waits on — including a
 * `?conversation=` link after a server restart, where the conversation holds
 * no assistant message yet (only the recovered checkpoint).
 */
import { describe, it, expect } from "vitest";
import { pendingDecisionCards } from "../pendingDecisionCards";

const USER_ONLY = [{ role: "system", content: "" }, { role: "user", content: "Write the file" }];

describe("pendingDecisionCards", () => {
  it("tool cards from the served snapshot, in its order, each pending", () => {
    const cards = pendingDecisionCards(
      {
        pendingApproval: {
          isPending: true,
          type: "tool",
          batchId: "batch-1",
          toolCalls: [
            { id: "call-1", name: "write_file", args: { path: "a.txt" }, _approval: { tier: "2" } },
            { id: "call-2", name: "write_file", args: { path: "b.txt" }, _approval: { tier: "2" } },
          ],
        },
      },
      USER_ONLY,
    );
    expect(cards.approvals.map((approval) => [approval.id, approval.batchId, approval.status])).toEqual([
      ["call-1", "batch-1", "pending"],
      ["call-2", "batch-1", "pending"],
    ]);
    expect(cards.planProposal).toBeNull();
    expect(cards.question).toBeNull();
  });

  it("a plan card from the plan recorded with its decision when no assistant message survived", () => {
    const cards = pendingDecisionCards(
      {
        pendingApproval: {
          isPending: true,
          type: "plan",
          batchId: "batch-p",
          toolCalls: [{ id: "exit-1", name: "exit_plan_mode", args: { plan: "1. Read\n2. Write" } }],
        },
      },
      USER_ONLY,
    );
    expect(cards.planProposal).toEqual({ plan: "1. Read\n2. Write", steps: ["1. Read", "2. Write"], status: "pending" });
    expect(cards.approvals).toEqual([]);
  });

  it("the open question, and nothing when nothing is pending", () => {
    expect(
      pendingDecisionCards(
        { pendingQuestion: { isPending: true, questionId: "q-1", questions: [{ question: "Port?" }] as never } },
        USER_ONLY,
      ).question,
    ).toEqual({ questionId: "q-1", questions: [{ question: "Port?" }] });
    expect(pendingDecisionCards({}, USER_ONLY)).toEqual({
      approvals: [],
      planProposal: null,
      question: null,
      budget: null,
    });
  });

  it("a turn paused at its cost cap (prompt 13 Landing 3): the budget card", () => {
    const cards = pendingDecisionCards(
      {
        pendingBudget: {
          isPending: true,
          pauseId: "pause-1",
          spentDollars: 2,
          maxCostDollars: 1.5,
          limitedBy: "turn",
          turnCapDollars: 1.5,
          goalMaxCostDollars: null,
        },
      },
      USER_ONLY,
    );
    expect(cards.budget).toEqual({
      pauseId: "pause-1",
      spentDollars: 2,
      maxCostDollars: 1.5,
      limitedBy: "turn",
      turnCapDollars: 1.5,
      goalMaxCostDollars: null,
    });
    expect(
      pendingDecisionCards({ pendingBudget: { isPending: false, pauseId: "pause-1" } }, USER_ONLY).budget,
    ).toBeNull();
  });
});
