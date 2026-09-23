/**
 * The five side-channel events, replayed from a recorded transcript through
 * PrismService's dispatcher into the chat's turn-activity state, render as
 * a checklist, a brief, a sources list and a code block with its output.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import PrismService from "../../services/PrismService";
import useTurnActivity from "../../hooks/useTurnActivity";
import TurnActivityPanelComponent from "../TurnActivityPanelComponent";
import { EMPTY_TURN_ACTIVITY } from "../../utils/turnActivity";
import type { TurnEvent } from "../../types/types";

function loadTranscript(name: string): TurnEvent[] {
  return readFileSync(resolve(__dirname, "../../__fixtures__/sse-transcripts", name), "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TurnEvent);
}

function replayIntoActivity(conversationId: string, events: TurnEvent[]) {
  const { result } = renderHook(() => useTurnActivity(conversationId));
  act(() => {
    const callbacks = result.current.callbacksFor(conversationId);
    for (const event of events) {
      PrismService._dispatchSSE(PrismService._normalizeSSEData(event), callbacks);
    }
  });
  return result;
}

describe("turn activity from a recorded transcript", () => {
  it("renders the checklist, brief, sources and code run", () => {
    const result = replayIntoActivity("conv-1", loadTranscript("turn-side-channels.jsonl"));
    const { container } = render(<TurnActivityPanelComponent activity={result.current.activity} />);

    const checklist = screen.getByRole("list", { name: "Checklist" });
    expect(within(checklist).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Read the config",
      "Check the port",
      "Write the summary",
    ]);
    expect(within(checklist).getAllByRole("img").map((icon) => icon.getAttribute("aria-label"))).toEqual([
      "Done",
      "In progress",
      "To do",
    ]);
    expect(screen.getByText("1/3 done")).toBeInTheDocument();

    expect(screen.getByText("Confirmed the dev server listens on 3000.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Key files" })).getByText("app/config.json")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Open questions" })).getByText("Should production use 443?")).toBeInTheDocument();

    // The repeated result is listed once.
    const sources = within(screen.getByRole("list", { name: "Sources" })).getAllByRole("link");
    expect(sources.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Configuring the dev server port", "https://docs.example.dev/config/port"],
      ["Environment variables", "https://docs.example.dev/config/env"],
    ]);
    expect(sources[0]).toHaveAttribute("rel", "noopener noreferrer");

    const codeBlocks = [...container.querySelectorAll("code")].map((code) => code.textContent);
    expect(codeBlocks.some((text) => text?.includes("print(sum(range(10)))"))).toBe(true);
    expect(screen.getByText("Output").nextElementSibling).toHaveTextContent("45");
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders nothing for a turn without side-channel events", () => {
    const result = replayIntoActivity("conv-1", loadTranscript("agent-turn-with-tools.jsonl"));
    expect(result.current.activity).toEqual(EMPTY_TURN_ACTIVITY);
    const { container } = render(<TurnActivityPanelComponent activity={result.current.activity} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps each conversation's activity to itself and a new turn clears its sources", () => {
    const { result, rerender } = renderHook(({ id }) => useTurnActivity(id), {
      initialProps: { id: "conv-1" },
    });
    act(() => {
      result.current.callbacksFor("conv-1").onWebSearchResult?.([
        { title: "A", url: "https://a.example" },
      ]);
      result.current.callbacksFor("conv-1").onTodoUpdate?.({
        type: "todo_update",
        items: [{ id: 1, content: "step", status: "pending", priority: "medium" }],
        stats: { total: 1, pending: 1, in_progress: 0, completed: 0 },
      });
    });
    rerender({ id: "conv-2" });
    expect(result.current.activity).toEqual(EMPTY_TURN_ACTIVITY);
    rerender({ id: "conv-1" });
    expect(result.current.activity.sources).toHaveLength(1);

    act(() => result.current.startTurn("conv-1"));
    expect(result.current.activity.sources).toEqual([]);
    expect(result.current.activity.todos).toEqual([{ content: "step", status: "pending", priority: "medium" }]);
  });

  it("shows a code run as running until its output arrives", () => {
    const { result } = renderHook(() => useTurnActivity("conv-1"));
    act(() => result.current.callbacksFor("conv-1").onExecutableCode?.("1/0", "PYTHON"));
    const { rerender } = render(<TurnActivityPanelComponent activity={result.current.activity} />);
    expect(screen.getByText("Running…")).toBeInTheDocument();
    act(() =>
      result.current.callbacksFor("conv-1").onCodeExecutionResult?.(
        "ZeroDivisionError: division by zero",
        "OUTCOME_FAILED",
      ),
    );
    rerender(<TurnActivityPanelComponent activity={result.current.activity} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("ZeroDivisionError: division by zero")).toBeInTheDocument();
  });
});
