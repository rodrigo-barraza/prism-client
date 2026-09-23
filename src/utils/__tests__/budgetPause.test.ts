/**
 * The budget card's numbers (prism-service prompt 13, Landing 3): the lowest
 * cap that lets the turn go on, and the one the card proposes.
 */
import { describe, it, expect } from "vitest";
import { formatDollars, minimumCapDollars, suggestedCapDollars, type BudgetPause } from "../budgetPause";

const TURN_PAUSE: BudgetPause = {
  pauseId: "pause-1",
  spentDollars: 2,
  maxCostDollars: 1.5,
  limitedBy: "turn",
  turnCapDollars: 1.5,
  goalMaxCostDollars: null,
};

describe("budget pause numbers", () => {
  it("the turn's own cap must pass the spend; the proposal doubles it", () => {
    expect(minimumCapDollars(TURN_PAUSE)).toBe(2);
    expect(suggestedCapDollars(TURN_PAUSE)).toBe(3);
    expect(suggestedCapDollars({ ...TURN_PAUSE, turnCapDollars: 0.01, maxCostDollars: 0.01, spentDollars: 0.0104 })).toBe(0.02);
  });

  it("the goal's budget must cover what it spent before the turn plus the turn's spend", () => {
    // $2.5 goal, $1 spent before the turn ($1.5 left), the turn spent $2.
    const goalPause: BudgetPause = { ...TURN_PAUSE, limitedBy: "goal", turnCapDollars: null, goalMaxCostDollars: 2.5 };
    expect(minimumCapDollars(goalPause)).toBe(3);
    expect(suggestedCapDollars(goalPause)).toBe(5);
  });

  it("formats cents, or four places under a cent", () => {
    expect(formatDollars(2)).toBe("$2.00");
    expect(formatDollars(0.0042)).toBe("$0.0042");
  });
});
