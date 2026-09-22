/**
 * The sidebar row of a conversation that waits on its user: a badge with
 * the approval and question counts and how long the oldest has waited.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("../HistoryItemComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));

import HistoryItemComponent from "../HistoryItemComponent";

describe("HistoryItemComponent — needs-you badge", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-22T12:00:00.000Z"), toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows approval and question counts with the wait's age", () => {
    render(
      <HistoryItemComponent
        item={{
          id: "c-1",
          title: "Refactor the parser",
          updatedAt: "2026-09-22T11:50:00.000Z",
          pendingApprovalCount: 2,
          pendingQuestionCount: 1,
          awaitingSince: "2026-09-22T11:56:00.000Z",
        }}
        isGenerating
      />,
    );

    const badge = screen.getByTestId("needs-you-badge");
    expect(badge).toHaveAttribute("aria-label", "Waiting for you: 2 approvals · 1 question (4m)");
    expect(badge.querySelector(".needs-you-approvals")).toHaveTextContent("2");
    expect(badge.querySelector(".needs-you-questions")).toHaveTextContent("1");
    expect(badge.querySelector(".needs-you-age")).toHaveTextContent("4m");
  });

  it("shows only the kind that waits", () => {
    render(
      <HistoryItemComponent
        item={{
          id: "c-2",
          title: "Pick a colour",
          pendingApprovalCount: 0,
          pendingQuestionCount: 1,
          awaitingSince: "2026-09-22T11:59:50.000Z",
        }}
      />,
    );
    const badge = screen.getByTestId("needs-you-badge");
    expect(badge.querySelector(".needs-you-approvals")).toBeNull();
    expect(badge.querySelector(".needs-you-age")).toHaveTextContent("now");
  });

  it("renders no badge when nothing waits", () => {
    render(
      <HistoryItemComponent
        item={{ id: "c-3", title: "Done", pendingApprovalCount: 0, pendingQuestionCount: 0 }}
      />,
    );
    expect(screen.queryByTestId("needs-you-badge")).toBeNull();
  });
});
