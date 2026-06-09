import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import useToolToggles from "../src/hooks/useToolToggles";

interface ToolSchema {
  name: string;
  description: string;
  system?: boolean;
}

// Simple test helper component
function TestToolTogglesComponent({
  builtInTools,
  coreToolsLocked,
}: {
  builtInTools: ToolSchema[];
  coreToolsLocked?: boolean;
}) {
  const { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn } =
    useToolToggles(builtInTools as any, coreToolsLocked);

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

  it("should initialize with an empty set of disabled tools", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    expect(disabledToolsDiv.textContent).toBe("");
  });

  it("should toggle configurable tools correctly", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleBtn = screen.getByTestId("toggle-btn");

    // Toggle off (disable)
    fireEvent.click(toggleBtn);
    expect(disabledToolsDiv.textContent).toBe("search_web");

    // Toggle back on (enable)
    fireEvent.click(toggleBtn);
    expect(disabledToolsDiv.textContent).toBe("");
  });

  it("should NOT toggle system tools when coreToolsLocked is true", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={true} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleSystemBtn = screen.getByTestId("toggle-system-btn");

    // Attempt to toggle system tool
    fireEvent.click(toggleSystemBtn);
    // Should remain empty because system tool toggle is guarded/ignored
    expect(disabledToolsDiv.textContent).toBe("");
  });

  it("should toggle system tools when coreToolsLocked is false", () => {
    render(<TestToolTogglesComponent builtInTools={mockTools} coreToolsLocked={false} />);
    const disabledToolsDiv = screen.getByTestId("disabled-tools");
    const toggleSystemBtn = screen.getByTestId("toggle-system-btn");

    // Attempt to toggle system tool when unlocked
    fireEvent.click(toggleSystemBtn);
    // Should disable it
    expect(disabledToolsDiv.textContent).toBe("read_file");
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

    // Disable search_web first
    fireEvent.click(toggleBtn);
    expect(disabledToolsDiv.textContent).toBe("search_web");

    // Enable all
    fireEvent.click(enableAllBtn);
    expect(disabledToolsDiv.textContent).toBe("");
  });
});
