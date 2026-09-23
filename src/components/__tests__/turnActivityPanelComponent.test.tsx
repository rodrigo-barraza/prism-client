/**
 * The five side-channel events, replayed from a recorded transcript through
 * the chat's conversation reducer into its turn-activity state, render as a
 * checklist, a brief, a sources list and a code block with its output.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { normalizeStreamEvent } from "../../services/agentStream";
import TurnActivityPanelComponent from "../TurnActivityPanelComponent";
import { EMPTY_TURN_ACTIVITY } from "../../utils/turnActivity";
import {
  agentConversationReducer,
  createAgentConversationState,
  reduceEvent,
  turnActivityOf,
  type AgentConversationState,
} from "../../utils/agentConversationReducer";
import type { TurnEvent } from "../../types/types";

const CLOCK = { epochMilliseconds: 1_790_078_400_000, monotonicMilliseconds: 1_000, nonce: 0.5 };

function loadTranscript(name: string): TurnEvent[] {
  return readFileSync(resolve(__dirname, "../../__fixtures__/sse-transcripts", name), "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TurnEvent);
}

function replay(
  events: TurnEvent[],
  conversationId = "conv-1",
  state: AgentConversationState = createAgentConversationState(),
): AgentConversationState {
  return events.reduce(
    (current, event) => reduceEvent(current, normalizeStreamEvent(event), conversationId, CLOCK),
    state,
  );
}

function replayIntoActivity(conversationId: string, events: TurnEvent[]) {
  return turnActivityOf(replay(events, conversationId), conversationId);
}

describe("turn activity from a recorded transcript", () => {
  it("renders the checklist, brief, sources and code run", () => {
    const activity = replayIntoActivity("conv-1", loadTranscript("turn-side-channels.jsonl"));
    const { container } = render(<TurnActivityPanelComponent activity={activity} />);

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
    const activity = replayIntoActivity("conv-1", loadTranscript("agent-turn-with-tools.jsonl"));
    expect(activity).toEqual(EMPTY_TURN_ACTIVITY);
    const { container } = render(<TurnActivityPanelComponent activity={activity} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps each conversation's activity to itself and a new turn clears its sources", () => {
    let state = replay([
      { type: "webSearchResult", results: [{ title: "A", url: "https://a.example" }] },
      {
        type: "todo_update",
        items: [{ id: 1, content: "step", status: "pending", priority: "medium" }],
        stats: { total: 1, pending: 1, in_progress: 0, completed: 0 },
      },
    ] as TurnEvent[]);
    expect(turnActivityOf(state, "conv-2")).toEqual(EMPTY_TURN_ACTIVITY);
    expect(turnActivityOf(state, "conv-1").sources).toHaveLength(1);

    // Another tab's turn starts: its sources begin empty, the checklist carries over.
    state = replay([{ type: "user_message", content: "next", timestamp: 1 } as TurnEvent], "conv-1", state);
    expect(turnActivityOf(state, "conv-1").sources).toEqual([]);
    expect(turnActivityOf(state, "conv-1").todos).toEqual([{ content: "step", status: "pending", priority: "medium" }]);

    // A turn this chat sends does the same.
    state = replay([{ type: "webSearchResult", results: [{ title: "B", url: "https://b.example" }] } as TurnEvent], "conv-1", state);
    state = agentConversationReducer(state, {
      type: "turn/started",
      messages: [],
      conversationId: "conv-1",
      sentWith: {},
    });
    expect(turnActivityOf(state, "conv-1").sources).toEqual([]);
  });

  it("shows a code run as running until its output arrives", () => {
    let state = replay([{ type: "executableCode", code: "1/0", language: "PYTHON" } as TurnEvent]);
    const { rerender } = render(<TurnActivityPanelComponent activity={turnActivityOf(state, "conv-1")} />);
    expect(screen.getByText("Running…")).toBeInTheDocument();
    state = replay(
      [{ type: "codeExecutionResult", output: "ZeroDivisionError: division by zero", outcome: "OUTCOME_FAILED" } as TurnEvent],
      "conv-1",
      state,
    );
    rerender(<TurnActivityPanelComponent activity={turnActivityOf(state, "conv-1")} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("ZeroDivisionError: division by zero")).toBeInTheDocument();
  });
});
