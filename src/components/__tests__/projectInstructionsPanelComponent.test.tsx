import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import ProjectInstructionsPanel from "../ProjectInstructionsPanelComponent";
import PrismService from "../../services/PrismService";
import type { ProjectInstructions } from "../../types/types";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock CSS modules — returns the class name itself
vi.mock("../ProjectInstructionsPanelComponent.module.css", () => ({
  default: new Proxy(
    {},
    {
      get: (_target, property: string) => property,
    },
  ),
}));

// Mock components-library — lightweight stubs that expose the relevant props
vi.mock("@rodrigo-barraza/components-library", () => ({
  ButtonComponent: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  TextAreaComponent: ({ value, onChange, placeholder, minRows }: any) => (
    <textarea
      data-testid="mock-textarea"
      data-min-rows={minRows}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={onChange}
    />
  ),
  EmptyStateComponent: ({ title, subtitle, children }: any) => (
    <div data-testid="mock-empty-state">
      <div>{title}</div>
      <div>{subtitle}</div>
      {children}
    </div>
  ),
  MarkdownContentComponent: ({ content }: any) => (
    <div data-testid="mock-markdown">{content}</div>
  ),
}));

vi.mock("../../services/PrismService", () => ({
  default: {
    getProjectInstructions: vi.fn(),
    updateProjectInstructions: vi.fn(),
    getProjectInstructionsVersions: vi.fn(),
    rollbackProjectInstructions: vi.fn(),
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────

const mockInstructions: ProjectInstructions = {
  id: "instructions-1",
  content: "# Conventions\n\nAlways use absolute paths.",
  version: 3,
  updatedBy: "agent",
  updatedAt: "2026-07-30T10:00:00.000Z",
};

const emptyInstructions: ProjectInstructions = {
  content: "",
  version: 0,
};

describe("ProjectInstructionsPanelComponent — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state at version 0", () => {
    render(
      <ProjectInstructionsPanel
        instructions={emptyInstructions}
        onInstructionsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mock-empty-state")).toBeTruthy();
    expect(screen.getByText("No project instructions yet")).toBeTruthy();
    expect(
      screen.getByText(/injected into every conversation in this project/),
    ).toBeTruthy();
    expect(screen.getByText(/The agent can also update it itself/)).toBeTruthy();
  });

  it("renders the empty state when no document has loaded", () => {
    render(
      <ProjectInstructionsPanel
        instructions={null}
        onInstructionsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mock-empty-state")).toBeTruthy();
  });

  it("opens the editor straight from the empty state", () => {
    render(
      <ProjectInstructionsPanel
        instructions={emptyInstructions}
        onInstructionsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Write instructions"));

    expect(screen.getByTestId("mock-textarea")).toBeTruthy();
    expect(screen.queryByTestId("mock-empty-state")).toBeNull();
  });

  it("hides the write affordance when read only", () => {
    render(
      <ProjectInstructionsPanel
        instructions={emptyInstructions}
        onInstructionsChange={vi.fn()}
        readOnly
      />,
    );

    expect(screen.queryByText("Write instructions")).toBeNull();
  });
});

describe("ProjectInstructionsPanelComponent — header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the version and attributes the last edit to the agent", () => {
    render(
      <ProjectInstructionsPanel
        instructions={mockInstructions}
        onInstructionsChange={vi.fn()}
      />,
    );

    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText("PRISM.md")).toBeTruthy();
    expect(screen.getByText(/Last updated by the agent/)).toBeTruthy();
  });

  it("attributes a user edit to 'you'", () => {
    render(
      <ProjectInstructionsPanel
        instructions={{ ...mockInstructions, updatedBy: "user" }}
        onInstructionsChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Last updated by you/)).toBeTruthy();
  });
});

describe("ProjectInstructionsPanelComponent — view / edit toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders markdown in read mode and a textarea in edit mode", () => {
    render(
      <ProjectInstructionsPanel
        instructions={mockInstructions}
        onInstructionsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mock-markdown").textContent).toContain(
      "Always use absolute paths.",
    );
    expect(screen.queryByTestId("mock-textarea")).toBeNull();

    fireEvent.click(screen.getByText("Edit"));

    const textarea = screen.getByTestId("mock-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe(mockInstructions.content);
    expect(textarea.getAttribute("data-min-rows")).toBe("20");
    expect(screen.queryByTestId("mock-markdown")).toBeNull();
  });

  it("discards the draft on cancel", () => {
    render(
      <ProjectInstructionsPanel
        instructions={mockInstructions}
        onInstructionsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByTestId("mock-textarea"), {
      target: { value: "throwaway" },
    });
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.getByTestId("mock-markdown").textContent).toContain(
      "Always use absolute paths.",
    );
    expect(PrismService.updateProjectInstructions).not.toHaveBeenCalled();
  });
});

describe("ProjectInstructionsPanelComponent — save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the edited content through the service", async () => {
    vi.mocked(PrismService.updateProjectInstructions).mockResolvedValue({
      ...mockInstructions,
      version: 4,
      content: "# Updated",
    });
    const onInstructionsChange = vi.fn();

    render(
      <ProjectInstructionsPanel
        instructions={mockInstructions}
        onInstructionsChange={onInstructionsChange}
        agent="agent-7"
      />,
    );

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByTestId("mock-textarea"), {
      target: { value: "# Updated" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(PrismService.updateProjectInstructions).toHaveBeenCalledWith(
        "# Updated",
        "agent-7",
      );
    });
    await waitFor(() => {
      expect(onInstructionsChange).toHaveBeenCalled();
    });
  });

  it("surfaces a save failure instead of silently dropping it", async () => {
    vi.mocked(PrismService.updateProjectInstructions).mockRejectedValue(
      new Error("write rejected"),
    );

    render(
      <ProjectInstructionsPanel
        instructions={mockInstructions}
        onInstructionsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("write rejected")).toBeTruthy();
    });
  });
});

describe("ProjectInstructionsPanelComponent — version history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads prior versions on disclosure and restores one", async () => {
    vi.mocked(PrismService.getProjectInstructionsVersions).mockResolvedValue([
      {
        version: 2,
        content: "# Older",
        updatedBy: "user",
        updatedAt: "2026-07-29T10:00:00.000Z",
      },
    ]);
    vi.mocked(PrismService.rollbackProjectInstructions).mockResolvedValue({
      ...mockInstructions,
      version: 4,
    });
    const onInstructionsChange = vi.fn();

    render(
      <ProjectInstructionsPanel
        instructions={mockInstructions}
        onInstructionsChange={onInstructionsChange}
      />,
    );

    fireEvent.click(screen.getByText("Version history"));

    await waitFor(() => {
      expect(screen.getByText("v2")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Restore"));

    await waitFor(() => {
      expect(PrismService.rollbackProjectInstructions).toHaveBeenCalledWith(
        2,
        undefined,
      );
    });
    await waitFor(() => {
      expect(onInstructionsChange).toHaveBeenCalled();
    });
  });
});
