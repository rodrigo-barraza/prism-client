import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock CSS modules — returns the class name itself
vi.mock(
  "../src/components/ToolSelectionComponent.module.css",
  () => ({
    default: new Proxy(
      {},
      {
        get: (_target, property: string) => property,
      },
    ),
  }),
);

// Mock utilities-library taxonomy to return actual implementation details to align contracts
vi.mock("@rodrigo-barraza/utilities-library/taxonomy", async () => {
  const actual = await vi.importActual<typeof import("@rodrigo-barraza/utilities-library/taxonomy")>(
    "@rodrigo-barraza/utilities-library/taxonomy"
  );
  return {
    ...actual,
  };
});

import { DOMAINS, TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";

// Mock renderToolName — just title-case the snake_case name
vi.mock("@rodrigo-barraza/utilities-library", () => ({
  renderToolName: (name: string) =>
    name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character: string) => character.toUpperCase()),
}));

// Mock components-library — lightweight stubs that expose the relevant props
vi.mock("@rodrigo-barraza/components-library", () => ({
  TooltipComponent: ({ children, label }: { children: React.ReactNode; label: string }) => (
    <div data-testid="tooltip" data-tooltip-label={label}>
      {children}
    </div>
  ),
  SearchInputComponent: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
  SegmentedControlComponent: ({ value, onChange, segments }: { value: string; onChange: (value: string) => void; segments: Array<{ value: string; label: string }> }) => (
    <div data-testid="segmented-control">
      {segments.map((segment: { value: string; label: string }) => (
        <button
          key={segment.value}
          data-testid={`segment-${segment.value}`}
          data-active={value === segment.value}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  ),
  CheckboxComponent: ({
    checked,
    disabled,
    onChange,
    label,
    indeterminate,
  }: {
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
    label?: React.ReactNode;
    size?: string;
    className?: string;
    indeterminate?: boolean;
  }) => (
    <label data-testid="checkbox" data-checked={checked} data-disabled={disabled} data-indeterminate={indeterminate}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        data-testid="checkbox-input"
      />
      {label}
    </label>
  ),
  SelectComponent: ({
    value,
    onChange,
    options,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    label?: string;
  }) => (
    <select
      data-testid={label ? `select-${label.toLowerCase()}` : "select-component"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

// Import the component under test AFTER mocks are registered
import ToolSelectionComponent from "../src/components/ToolSelectionComponent";

// ── Fixtures ───────────────────────────────────────────────────────

import type { ToolSchema } from "../src/types/types";

function createCoreHarnessTools(): ToolSchema[] {
  return [
    { name: TOOL_NAMES.THINK, description: "Think step-by-step", domain: DOMAINS.CORE_HARNESS.displayName, system: true },
    { name: TOOL_NAMES.ASK_USER, description: "Ask the user a question", domain: DOMAINS.CORE_HARNESS.displayName, system: true },
  ];
}

function createCoreWorkspaceTools(): ToolSchema[] {
  return [
    { name: TOOL_NAMES.READ_FILE, description: "Read a file", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.WRITE_FILE, description: "Write a file", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.REPLACE_IN_FILE, description: "Replace in file", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.MOVE_FILE, description: "Move file", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.DELETE_FILE, description: "Delete file", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.PATCH_FILE, description: "Patch file", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.LIST_DIRECTORY, description: "List directory", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
    { name: TOOL_NAMES.SEARCH_FILE_CONTENTS, description: "Search file contents", domain: DOMAINS.CORE_WORKSPACE.displayName, system: true },
  ];
}

function createConfigurableTools(): ToolSchema[] {
  return [
    { name: TOOL_NAMES.SEARCH_WEB, description: "Search the web", domain: DOMAINS.WEB.displayName, system: false },
    { name: TOOL_NAMES.GET_WEATHER, description: "Get weather", domain: DOMAINS.WEATHER.displayName, system: false },
  ];
}

function buildWorkspaceLockedOffMap(workspaceTools: ToolSchema[]): Map<string, string> {
  const lockedToolsMap = new Map<string, string>();
  const reason = "No workspace set up — configure one in Settings to unlock";
  for (const tool of workspaceTools) {
    lockedToolsMap.set(tool.name, reason);
  }
  return lockedToolsMap;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("ToolSelectionComponent — workspace locked-off flow", () => {
  const coreHarnessTools = createCoreHarnessTools();
  const coreWorkspaceTools = createCoreWorkspaceTools();
  const configurableTools = createConfigurableTools();
  const allTools = [...coreHarnessTools, ...coreWorkspaceTools, ...configurableTools];

  describe("when all workspace tools are locked off (no workspace connected)", () => {
    const lockedOffTools = buildWorkspaceLockedOffMap(coreWorkspaceTools);

    it("renders 'Locked Off' badge for the Core Workspace Tools group", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const lockedOffBadges = container.querySelectorAll(".core-badge-locked-off");
      expect(lockedOffBadges.length).toBeGreaterThanOrEqual(1);

      const badgeTexts = Array.from(lockedOffBadges).map((badge) => badge.textContent);
      expect(badgeTexts).toContain("Locked Off");
    });

    it("still renders 'Locked On' badge for Core Harness Tools group", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const lockedOnBadges = container.querySelectorAll(".core-badge");
      const lockedOnBadgeTexts = Array.from(lockedOnBadges).map((badge) => badge.textContent);
      expect(lockedOnBadgeTexts).toContain("Locked On");
    });

    it("renders workspace tool checkboxes as unchecked and disabled", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const lockedToolRows = container.querySelectorAll(".locked-tool-layout-row");
      expect(lockedToolRows.length).toBe(coreWorkspaceTools.length);

      for (const row of lockedToolRows) {
        const checkboxInput = row.querySelector("input[type='checkbox']");
        expect(checkboxInput).toBeTruthy();
        expect((checkboxInput as HTMLInputElement).checked).toBe(false);
        expect((checkboxInput as HTMLInputElement).disabled).toBe(true);
      }
    });

    it("renders core harness tool checkboxes as checked and disabled (locked on)", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const coreToolRows = container.querySelectorAll(".core-tool-layout-row");
      expect(coreToolRows.length).toBe(coreHarnessTools.length);

      for (const row of coreToolRows) {
        const checkboxInput = row.querySelector("input[type='checkbox']");
        expect(checkboxInput).toBeTruthy();
        expect((checkboxInput as HTMLInputElement).checked).toBe(true);
        expect((checkboxInput as HTMLInputElement).disabled).toBe(true);
      }
    });

    it("shows tooltip with lock reason for each locked-off workspace tool", () => {
      render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const tooltips = screen.getAllByTestId("tooltip");
      const lockReasonTooltips = tooltips.filter(
        (tooltip) =>
          tooltip.getAttribute("data-tooltip-label")?.includes("No workspace set up"),
      );
      expect(lockReasonTooltips.length).toBe(coreWorkspaceTools.length);
    });

    it("applies the locked-off group styling class to the workspace group", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const lockedOffGroups = container.querySelectorAll(".core-group-locked-off");
      expect(lockedOffGroups.length).toBe(1);
    });

    it("does NOT apply locked-off group class to Core Harness Tools group", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const allCoreGroups = container.querySelectorAll(".core-group");
      const lockedOffGroups = container.querySelectorAll(".core-group-locked-off");

      // Two core groups total (harness + workspace), only one has locked-off
      expect(allCoreGroups.length).toBe(2);
      expect(lockedOffGroups.length).toBe(1);
    });
  });

  describe("tool count accuracy with locked-off tools", () => {
    const lockedOffTools = buildWorkspaceLockedOffMap(coreWorkspaceTools);

    it("excludes locked-off workspace tools from the total enabled count", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      // The enabled count should be: core harness (2, locked on) + configurable (2, enabled)
      // NOT including the 8 workspace tools since they're locked off
      const domainCounts = container.querySelectorAll(".domain-count");
      const bulkCountElement = domainCounts[0]; // First domain-count is in the bulk checkbox row
      const countText = bulkCountElement?.textContent || "";

      // Expected: 4/4 — 2 harness locked on + 2 configurable enabled = 4, total = 4
      expect(countText).toBe("4/4");
    });

    it("shows 0 enabled when no configurable tools are selected and workspace is locked off", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={[]}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const domainCounts = container.querySelectorAll(".domain-count");
      const bulkCountElement = domainCounts[0];
      const countText = bulkCountElement?.textContent || "";

      // 2 harness tools locked on + 0 configurable = 2/4
      expect(countText).toBe("2/4");
    });
  });

  describe("when workspace IS connected (no locked-off tools)", () => {
    const emptyLockedOffMap = new Map<string, string>();

    it("renders 'Locked On' badge for both Core Harness and Core Workspace groups", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={emptyLockedOffMap}
        />,
      );

      const lockedOnBadges = container.querySelectorAll(".core-badge");
      expect(lockedOnBadges.length).toBe(2);

      const badgeTexts = Array.from(lockedOnBadges).map((badge) => badge.textContent);
      expect(badgeTexts).toEqual(["Locked On", "Locked On"]);
    });

    it("renders all workspace tools as checked and disabled (locked on, not locked off)", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={emptyLockedOffMap}
        />,
      );

      const coreToolRows = container.querySelectorAll(".core-tool-layout-row");
      // All core tools (harness + workspace) should be core-tool-layout-row
      expect(coreToolRows.length).toBe(coreHarnessTools.length + coreWorkspaceTools.length);

      for (const row of coreToolRows) {
        const checkboxInput = row.querySelector("input[type='checkbox']");
        expect((checkboxInput as HTMLInputElement).checked).toBe(true);
        expect((checkboxInput as HTMLInputElement).disabled).toBe(true);
      }
    });

    it("does NOT render any locked-off badges", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={emptyLockedOffMap}
        />,
      );

      const lockedOffBadges = container.querySelectorAll(".core-badge-locked-off");
      expect(lockedOffBadges.length).toBe(0);
    });

    it("includes all core tools in the total enabled count", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={emptyLockedOffMap}
        />,
      );

      const domainCounts = container.querySelectorAll(".domain-count");
      const bulkCountElement = domainCounts[0];
      const countText = bulkCountElement?.textContent || "";

      // 2 harness + 8 workspace (all locked on) + 2 configurable = 12/12
      expect(countText).toBe("12/12");
    });
  });

  describe("selected tab — locked-off tools are excluded", () => {
    const lockedOffTools = buildWorkspaceLockedOffMap(coreWorkspaceTools);

    it("does not render locked-off workspace tools in the 'Selected' tab", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      // Switch to the "Selected" option
      const selectElement = screen.getByTestId("select-filter");
      fireEvent.change(selectElement, { target: { value: "selected" } });

      // Workspace tool names should NOT appear in the selected view
      for (const workspaceTool of coreWorkspaceTools) {
        const renderedName = workspaceTool.name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (character: string) => character.toUpperCase());

        const matchingElements = container.querySelectorAll(".tool-name");
        const foundWorkspaceTool = Array.from(matchingElements).some(
          (element) => element.textContent === renderedName,
        );

        // Locked-off tools in the "locked-tool-layout-row" pattern should not be in the selected tab
        const lockedRows = container.querySelectorAll(".locked-tool-layout-row");
        // In the selected tab, workspace tools should be completely absent
        // (they are filtered out at the memo level)
        const lockedRowNames = Array.from(lockedRows).map(
          (row) => row.querySelector(".tool-name")?.textContent,
        );
        expect(lockedRowNames).not.toContain(renderedName);
      }
    });

    it("still shows Core Harness tools in the 'Selected' tab", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      // Switch to "Selected" option
      const selectElement = screen.getByTestId("select-filter");
      fireEvent.change(selectElement, { target: { value: "selected" } });

      // Harness tools SHOULD appear as they're locked on (not locked off)
      const allToolNames = container.querySelectorAll(".tool-name, .core-tool-name");
      const renderedNames = Array.from(allToolNames).map((element) => element.textContent);

      for (const harnessTool of coreHarnessTools) {
        const expectedName = harnessTool.name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (character: string) => character.toUpperCase());
        expect(renderedNames).toContain(expectedName);
      }
    });
  });

  describe("partial workspace lock-off (mixed state)", () => {
    it("renders 'Locked On' badge when only SOME workspace tools are locked off", () => {
      // Only lock off 2 of 8 workspace tools — the group is NOT entirely locked off
      const partialLockedOff = new Map<string, string>();
      partialLockedOff.set("read_file", "Workspace agent is down");
      partialLockedOff.set("write_file", "Workspace agent is down");

      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={partialLockedOff}
        />,
      );

      // Should still show "Locked On" since not ALL tools are locked off
      const lockedOnBadges = container.querySelectorAll(".core-badge");
      const badgeTexts = Array.from(lockedOnBadges).map((badge) => badge.textContent);
      expect(badgeTexts).toContain("Locked On");

      // No "Locked Off" badge should appear
      const lockedOffBadges = container.querySelectorAll(".core-badge-locked-off");
      expect(lockedOffBadges.length).toBe(0);
    });

    it("renders locked-off tools as unchecked and remaining tools as checked within the same group", () => {
      const partialLockedOff = new Map<string, string>();
      partialLockedOff.set("read_file", "Workspace agent is down");
      partialLockedOff.set("write_file", "Workspace agent is down");

      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={partialLockedOff}
        />,
      );

      // 2 locked-off rows
      const lockedRows = container.querySelectorAll(".locked-tool-layout-row");
      expect(lockedRows.length).toBe(2);
      for (const row of lockedRows) {
        const checkboxInput = row.querySelector("input[type='checkbox']") as HTMLInputElement;
        expect(checkboxInput.checked).toBe(false);
        expect(checkboxInput.disabled).toBe(true);
      }

      // Remaining workspace tools + all harness tools should be core-tool-layout-row (checked, locked on)
      const coreRows = container.querySelectorAll(".core-tool-layout-row");
      expect(coreRows.length).toBe(coreHarnessTools.length + coreWorkspaceTools.length - 2);
      for (const row of coreRows) {
        const checkboxInput = row.querySelector("input[type='checkbox']") as HTMLInputElement;
        expect(checkboxInput.checked).toBe(true);
        expect(checkboxInput.disabled).toBe(true);
      }
    });
  });

  describe("coreToolsLocked = false (unlocked mode)", () => {
    it("does not render any Locked On or Locked Off badges", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={[...configurableTools.map((tool) => tool.name), "think"]}
          coreToolsLocked={false}
          lockedOffTools={new Map()}
        />,
      );

      const lockedOnBadges = container.querySelectorAll(".core-badge");
      const lockedOffBadges = container.querySelectorAll(".core-badge-locked-off");
      expect(lockedOnBadges.length).toBe(0);
      expect(lockedOffBadges.length).toBe(0);
    });

    it("renders core tools as toggleable checkboxes when unlocked", () => {
      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={["think", "search_web"]}
          coreToolsLocked={false}
          lockedOffTools={new Map()}
        />,
      );

      // No locked rows — all tools should be normal toggleable rows
      const coreToolRows = container.querySelectorAll(".core-tool-layout-row");
      expect(coreToolRows.length).toBe(0);

      const lockedRows = container.querySelectorAll(".locked-tool-layout-row");
      expect(lockedRows.length).toBe(0);
    });
  });

  describe("native thinking — think tool locked off", () => {
    function buildThinkingLockedOffMap(): Map<string, string> {
      const lockedToolsMap = new Map<string, string>();
      lockedToolsMap.set("think", "Disabled — this model has built-in thinking/reasoning");
      return lockedToolsMap;
    }

    it("renders think tool as locked off when it is in lockedOffTools", () => {
      const lockedOffTools = buildThinkingLockedOffMap();

      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const lockedRows = container.querySelectorAll(".locked-tool-layout-row");
      const lockedRowNames = Array.from(lockedRows).map(
        (row) => row.querySelector(".tool-name")?.textContent,
      );
      expect(lockedRowNames).toContain("Think");
    });

    it("renders the think locked-off checkbox as unchecked and disabled", () => {
      const lockedOffTools = buildThinkingLockedOffMap();

      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const lockedRows = container.querySelectorAll(".locked-tool-layout-row");
      expect(lockedRows.length).toBe(1);

      const checkboxInput = lockedRows[0].querySelector("input[type='checkbox']") as HTMLInputElement;
      expect(checkboxInput.checked).toBe(false);
      expect(checkboxInput.disabled).toBe(true);
    });

    it("shows the thinking lock reason in the tooltip", () => {
      const lockedOffTools = buildThinkingLockedOffMap();

      render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const tooltips = screen.getAllByTestId("tooltip");
      const thinkingTooltips = tooltips.filter(
        (tooltip) =>
          tooltip.getAttribute("data-tooltip-label")?.includes("built-in thinking"),
      );
      expect(thinkingTooltips.length).toBe(1);
    });

    it("still renders ask_user as locked on when only think is locked off", () => {
      const lockedOffTools = buildThinkingLockedOffMap();

      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const coreToolRows = container.querySelectorAll(".core-tool-layout-row");
      // ask_user should be in core-tool-layout-row (locked on), plus all workspace tools
      expect(coreToolRows.length).toBe(coreHarnessTools.length - 1 + coreWorkspaceTools.length);

      for (const row of coreToolRows) {
        const checkboxInput = row.querySelector("input[type='checkbox']") as HTMLInputElement;
        expect(checkboxInput.checked).toBe(true);
        expect(checkboxInput.disabled).toBe(true);
      }
    });

    it("excludes think from the total enabled count when locked off", () => {
      const lockedOffTools = buildThinkingLockedOffMap();

      const { container } = render(
        <ToolSelectionComponent
          availableTools={allTools}
          enabledTools={configurableTools.map((tool) => tool.name)}
          coreToolsLocked={true}
          lockedOffTools={lockedOffTools}
        />,
      );

      const domainCounts = container.querySelectorAll(".domain-count");
      const bulkCountElement = domainCounts[0];
      const countText = bulkCountElement?.textContent || "";

      // 1 harness (ask_user) locked on + 8 workspace locked on + 2 configurable = 11/11
      // think is excluded from both numerator and denominator
      expect(countText).toBe("11/11");
    });
  });
});
