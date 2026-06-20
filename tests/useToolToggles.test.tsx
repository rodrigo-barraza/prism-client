import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import useToolToggles from "../src/hooks/useToolToggles";

import type { ToolSchema } from "../src/types/types";

// Simple test helper component
function TestToolTogglesComponent({
  builtInTools,
  coreToolsLocked,
}: {
  builtInTools: ToolSchema[];
  coreToolsLocked?: boolean;
}) {
  const { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn, resetToAllDisabled, restoreDisabledTools } =
    useToolToggles(builtInTools, coreToolsLocked);

  return (
    <div>
      <div data-testid="disabled-tools">
        {Array.from(disabledTools).join(",")}
      </div>
      <button
        data-testid="toggle-btn"
        onClick={() => handleToggleBuiltIn("search_web")}
      >
        Toggle search_web
      </button>
      <button
        data-testid="toggle-system-btn"
        onClick={() => handleToggleBuiltIn("read_file")}
      >
        Toggle read_file
      </button>
      <button
        data-testid="disable-all-btn"
        onClick={() => handleToggleAllBuiltIn(false)}
      >
        Disable All
      </button>
      <button
        data-testid="enable-all-btn"
        onClick={() => handleToggleAllBuiltIn(true)}
      >
        Enable All
      </button>
      <button
        data-testid="reset-to-all-disabled-btn"
        onClick={() => resetToAllDisabled()}
      >
        Reset To All Disabled
      </button>
      <button
        data-testid="restore-disabled-btn"
        onClick={() => restoreDisabledTools(["search_web", "get_weather"])}
      >
        Restore Disabled
      </button>
      <button
        data-testid="restore-empty-btn"
        onClick={() => restoreDisabledTools([])}
      >
        Restore Empty
      </button>
    </div>
  );
}

describe("useToolToggles Hook", () => {
  const mockTools: ToolSchema[] = [
    { name: "read_file", description: "Read file", system: true },
    { name: "write_file", description: "Write file", system: true },
    { name: "search_web", description: "Search web", system: false },
    { name: "get_weather", description: "Get weather", system: false },
  ];

  it("should initialize with configurable tools disabled when builtInTools is provided", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).not.toContain("read_file");
    expect(disabledList).not.toContain("write_file");
  });

  it("should toggle configurable tools correctly", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleBtn = screen.getByTestId("toggle-btn");

    // Initially search_web and get_weather are disabled
    let disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");

    // Toggle search_web (enables it -> removes from disabled list)
    fireEvent.click(toggleBtn);
    disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).not.toContain("search_web");
    expect(disabledList).toContain("get_weather");

    // Toggle search_web back (disables it -> adds to disabled list)
    fireEvent.click(toggleBtn);
    disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
  });

  it("should NOT toggle system tools when coreToolsLocked is true", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleSystemBtn = screen.getByTestId("toggle-system-btn");

    // Attempt to toggle system tool
    fireEvent.click(toggleSystemBtn);
    // Should remain only configurable tools disabled
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).not.toContain("read_file");
    expect(disabledList).not.toContain("write_file");
  });

  it("should toggle system tools when coreToolsLocked is false", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={false} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleSystemBtn = screen.getByTestId("toggle-system-btn");

    // Initially all tools disabled
    let disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("read_file");
    expect(disabledList).toContain("write_file");
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");

    // Attempt to toggle system tool when unlocked (enables it -> removes from disabled list)
    fireEvent.click(toggleSystemBtn);
    disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).not.toContain("read_file");
    expect(disabledList).toContain("write_file");
  });

  it("should disable only configurable tools on bulk disable (Disable All) when coreToolsLocked is true", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const disableAllBtn = screen.getByTestId("disable-all-btn");

    fireEvent.click(disableAllBtn);
    // Should disable only search_web and get_weather, keeping system tools enabled
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).not.toContain("read_file");
    expect(disabledList).not.toContain("write_file");
  });

  it("should disable all tools including system tools on bulk disable when coreToolsLocked is false", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={false} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const disableAllBtn = screen.getByTestId("disable-all-btn");

    fireEvent.click(disableAllBtn);
    // Should disable all tools
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).toContain("read_file");
    expect(disabledList).toContain("write_file");
  });

  it("should enable all tools on bulk enable (Enable All)", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleBtn = screen.getByTestId("toggle-btn");
    const enableAllBtn = screen.getByTestId("enable-all-btn");

    // Enable search_web first (removes from disabled set)
    fireEvent.click(toggleBtn);
    let disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).not.toContain("search_web");
    expect(disabledList).toContain("get_weather");

    // Enable all
    fireEvent.click(enableAllBtn);
    expect(disabledToolsDiv.textContent).toBe("");
  });

  it("should disable all configurable tools on resetToAllDisabled when coreToolsLocked is true", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const resetButton = screen.getByTestId("reset-to-all-disabled-btn");

    fireEvent.click(resetButton);
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).not.toContain("read_file");
    expect(disabledList).not.toContain("write_file");
  });

  it("should disable all tools including system on resetToAllDisabled when coreToolsLocked is false", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={false} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const resetButton = screen.getByTestId("reset-to-all-disabled-btn");

    fireEvent.click(resetButton);
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).toContain("read_file");
    expect(disabledList).toContain("write_file");
  });

  it("should replace the disabled set with restoreDisabledTools", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const restoreButton = screen.getByTestId("restore-disabled-btn");

    // Initially configurable tools disabled
    let disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).toHaveLength(2);

    // Restore specific disabled tools (same ones in this case, but verifies no crash and correct state)
    fireEvent.click(restoreButton);
    disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).toHaveLength(2);
  });

  it("should clear all disabled tools when restoreDisabledTools receives empty array", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const resetButton = screen.getByTestId("reset-to-all-disabled-btn");
    const restoreEmptyButton = screen.getByTestId("restore-empty-btn");

    // First disable some tools
    fireEvent.click(resetButton);
    expect(disabledToolsDiv.textContent).not.toBe("");

    // Restore empty — all tools become enabled
    fireEvent.click(restoreEmptyButton);
    expect(disabledToolsDiv.textContent).toBe("");
  });

  it("should automatically disable configurable tools when builtInTools loads", () => {
    const { rerender } = render(<TestToolTogglesComponent builtInTools={[]} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    expect(disabledToolsDiv.textContent).toBe("");

    rerender(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).not.toContain("read_file");
    expect(disabledList).not.toContain("write_file");
  });

  it("should NOT automatically disable tools if restoreDisabledTools was already called (e.g. session load)", () => {
    const { rerender } = render(<TestToolTogglesComponent builtInTools={[]} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const restoreButton = screen.getByTestId("restore-disabled-btn");

    // Simulate session load before tools list arrives
    fireEvent.click(restoreButton);

    // Now tools list loads
    rerender(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);

    // It should preserve the restored tools, not trigger resetToAllDisabled
    const disabledList = disabledToolsDiv.textContent?.split(",") || [];
    expect(disabledList).toContain("search_web");
    expect(disabledList).toContain("get_weather");
    expect(disabledList).toHaveLength(2);
  });
});

