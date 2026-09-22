import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@rodrigo-barraza/components-library", () => ({
  TooltipComponent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BadgeComponent: ({ value, label, tooltip }: { value: number; label: string; tooltip: string }) => (
    <span data-testid="shared-badge" title={tooltip}>
      {value}
      {label}
    </span>
  ),
}));
vi.mock("../ThreeAnimationComponent", () => ({ default: () => null }));

import BadgeComponent from "../BadgeComponent";

describe("BadgeComponent — cacheShare", () => {
  it("shows the prompt-cache read share as a percentage, with the counts in the tooltip", () => {
    render(<BadgeComponent type="cacheShare" share={0.734} cacheRead={7340} input={10000} />);
    const badge = screen.getByTestId("shared-badge");
    expect(badge.textContent).toBe("73% cached");
    expect(badge.getAttribute("title")).toBe(
      "73% of input tokens were read from the prompt cache (7,340 of 10,000)",
    );
  });
});
