import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import QueuedTurnChipsComponent from "../QueuedTurnChipsComponent";
import type { QueuedTurn } from "../../hooks/useNextTurnQueue";

const turn = (id: string, text: string, extra: Partial<QueuedTurn> = {}): QueuedTurn => ({
  id,
  text,
  images: [],
  conversationId: "conv-1",
  ...extra,
});

describe("QueuedTurnChipsComponent", () => {
  it("renders nothing with an empty queue", () => {
    const { container } = render(<QueuedTurnChipsComponent items={[]} onRemove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one chip per queued message in send order, each removable", () => {
    const onRemove = vi.fn();
    render(
      <QueuedTurnChipsComponent
        items={[
          turn("a", "run the migration"),
          turn("b", "", {
            files: [{ name: "log.txt", mimeType: "text/plain", dataUrl: "data:,", modality: "document" }],
          }),
          turn("c", "then summarize", { images: ["data:image/png;base64,AA"] }),
        ]}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("3 queued — sent in order")).toBeInTheDocument();
    const chips = within(screen.getByRole("list", { name: "Queued messages" })).getAllByRole("listitem");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "run the migration",
      "1 attachment",
      "then summarize · 1 attachment",
    ]);

    fireEvent.click(within(chips[1]).getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("b");
  });
});
