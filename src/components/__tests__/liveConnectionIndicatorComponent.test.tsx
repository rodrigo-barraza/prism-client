import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import LiveConnectionIndicatorComponent from "../LiveConnectionIndicatorComponent";

describe("LiveConnectionIndicatorComponent", () => {
  it("shows a banner when no WebSocket URL is configured", () => {
    render(<LiveConnectionIndicatorComponent state="unconfigured" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Live updates are off — no WebSocket URL (PRISM_WS_URL) is configured.",
    );
  });

  it("badges each live-stream state and hides when closed", () => {
    const { rerender, container } = render(<LiveConnectionIndicatorComponent state="connecting" />);
    expect(screen.getByRole("status", { name: "Live stream: Connecting" })).toBeInTheDocument();
    rerender(<LiveConnectionIndicatorComponent state="live" />);
    expect(screen.getByRole("status", { name: "Live stream: Live" })).toBeInTheDocument();
    rerender(<LiveConnectionIndicatorComponent state="reconnecting" />);
    expect(screen.getByRole("status", { name: "Live stream: Reconnecting" })).toBeInTheDocument();
    rerender(<LiveConnectionIndicatorComponent state="closed" />);
    expect(container).toBeEmptyDOMElement();
  });
});
