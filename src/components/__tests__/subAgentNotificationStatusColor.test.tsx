import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

import SubAgentNotificationComponent from "../SubAgentNotificationComponent";
import { EXECUTION_STATUS } from "../../constants";

// Mock CSS modules — returns the class name itself
vi.mock(
  "../SubAgentNotificationComponent.module.css",
  () => ({
    default: new Proxy(
      {},
      {
        get: (_target, property: string) => property,
      },
    ),
  }),
);

// ── Status icon coloring ────────────────────────────────────────────
// The ✓/✗/■ status glyph must visually communicate the outcome:
// green for completed, red for failed, muted for anything in-flight.

function renderStatusIcon(status: string) {
  const { container } = render(
    <SubAgentNotificationComponent
      taskNotif={{ status, summary: "Ran 3 subagents" }}
      readOnly
    />,
  );
  const icon = container.querySelector(".status-icon");
  expect(icon).not.toBeNull();
  return icon as HTMLElement;
}

describe("SubAgentNotificationComponent — status icon color", () => {
  it("colors the icon with the success color when completed", () => {
    const icon = renderStatusIcon(EXECUTION_STATUS.COMPLETED);
    expect(icon.textContent).toBe("✓");
    expect(icon.style.color).toContain("--color-success");
  });

  it("colors the icon with the danger color when failed", () => {
    const icon = renderStatusIcon(EXECUTION_STATUS.FAILED);
    expect(icon.textContent).toBe("✗");
    expect(icon.style.color).toContain("--color-danger");
  });

  it("colors the icon with the muted color for in-flight statuses", () => {
    const icon = renderStatusIcon(EXECUTION_STATUS.GENERATING);
    expect(icon.textContent).toBe("■");
    expect(icon.style.color).toContain("--text-muted");
  });
});
