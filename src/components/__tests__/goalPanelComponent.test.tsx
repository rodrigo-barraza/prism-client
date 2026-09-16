import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import GoalPanelComponent from "../GoalPanelComponent";
import type { ConversationGoal } from "../../types/types";

const GOAL: ConversationGoal = {
  objective: "Ship the harness-next client",
  completionCriteria: "tsc clean and tests green",
  budget: { maxCostDollars: 20, maxTurns: 40, deadline: "2099-01-01T12:00:00Z" },
  progress: { summary: "Types and service wired", percent: 42, updatedAt: "2026-09-15T10:00:00Z" },
  blockedOn: null,
  status: "active",
  spentDollars: 3.5,
  turnsUsed: 7,
  createdAt: "2026-09-15T09:00:00Z",
  updatedAt: "2026-09-15T10:00:00Z",
};

describe("GoalPanelComponent", () => {
  it("renders nothing without a goal", () => {
    const { container } = render(<GoalPanelComponent goal={null} />);
    expect(container.querySelector(".goal-panel-component")).toBeNull();
  });

  it("shows objective, status, progress, budget, turns and deadline", () => {
    render(<GoalPanelComponent goal={GOAL} />);
    expect(screen.getByText("Ship the harness-next client")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Types and service wired")).toBeInTheDocument();
    expect(screen.getByTitle("Spent / budget")).toHaveTextContent("$3.50 / $20.00");
    expect(screen.getByTitle("Turns used / max")).toHaveTextContent("7 / 40 turns");
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pauses an active goal and resumes a paused one", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const { rerender } = render(
      <GoalPanelComponent goal={GOAL} onPause={onPause} onResume={onResume} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause goal" }));
    expect(onPause).toHaveBeenCalledTimes(1);

    rerender(
      <GoalPanelComponent goal={{ ...GOAL, status: "paused" }} onPause={onPause} onResume={onResume} />,
    );
    expect(screen.getByText("Paused")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume goal" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("clears only after an inline confirm", () => {
    const onClear = vi.fn();
    render(<GoalPanelComponent goal={GOAL} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear goal" }));
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel clear goal" }));
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear goal" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear goal" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("highlights the obstacle when blocked and flags an overspent budget", () => {
    render(
      <GoalPanelComponent
        goal={{
          ...GOAL,
          status: "blocked",
          blockedOn: "Waiting on API credentials",
          spentDollars: 25,
          progress: { summary: "", percent: null, updatedAt: "" },
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Waiting on API credentials");
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByTitle("Spent / budget").className).toContain("meta-over");
    // A blocked / completed goal has no pause toggle
    expect(screen.queryByRole("button", { name: /Pause goal|Resume goal/ })).toBeNull();
  });
});
