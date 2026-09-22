import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import HooksPanel from "../HooksPanelComponent";
import PrismService from "../../services/PrismService";
import type { Hook } from "../../types/types";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock CSS modules — returns the class name itself
vi.mock("../HooksPanelComponent.module.css", () => ({
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
  ToggleComponent: ({ checked, onChange }: any) => (
    <input
      type="checkbox"
      data-testid="mock-toggle"
      checked={Boolean(checked)}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  ),
  InputComponent: ({ value, onChange, placeholder, disabled, type }: any) => (
    <input
      data-testid="mock-input"
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={onChange}
    />
  ),
  TextAreaComponent: ({ value, onChange, placeholder }: any) => (
    <textarea
      data-testid="mock-textarea"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={onChange}
    />
  ),
  SearchInputComponent: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="search-input"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  SelectComponent: ({ value, onChange, options }: any) => (
    <select
      data-testid="mock-select"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {(options ?? []).map((option: { value: string; label: string }) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  SegmentedControlComponent: ({ value, onChange, segments }: any) => (
    <div data-testid="segmented-control">
      {(segments ?? []).map((segment: { value: string; label: string }) => (
        <button
          key={segment.value}
          data-testid={`segment-${segment.value}`}
          data-active={value === segment.value}
          onClick={() => onChange?.(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../services/PrismService", () => ({
  default: {
    getHooks: vi.fn(),
    createHook: vi.fn(),
    updateHook: vi.fn(),
    deleteHook: vi.fn(),
    testHook: vi.fn(),
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────

const mockHooks: Hook[] = [
  {
    id: "hook-1",
    name: "block-rm-rf",
    description: "Deny destructive shell commands",
    event: "PreToolUse",
    matcher: "Bash",
    handler: { type: "prompt", prompt: "Is this safe?" },
    enabled: true,
    timeoutMilliseconds: 5000,
  },
  {
    id: "hook-2",
    name: "session-greeting",
    event: "SessionStart",
    handler: { type: "http", url: "https://example.com/greet" },
    enabled: false,
    timeoutMilliseconds: 3000,
  },
];

/** The form has no htmlFor wiring — reach the control through its group. */
function inputForLabel(labelText: string): HTMLInputElement {
  const labelElement = screen.getByText(labelText);
  const group = labelElement.parentElement as HTMLElement;
  return group.querySelector("input") as HTMLInputElement;
}

function openEditorForFirstHook() {
  fireEvent.click(screen.getAllByTitle("Edit hook")[0]);
}

describe("HooksPanelComponent — list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders every hook with its event, handler type and matcher", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);

    expect(screen.getByText("block-rm-rf")).toBeTruthy();
    expect(screen.getByText("session-greeting")).toBeTruthy();

    // Event badges
    expect(screen.getByText("PreToolUse")).toBeTruthy();
    expect(screen.getByText("SessionStart")).toBeTruthy();

    // Handler types
    expect(screen.getByText("Prompt")).toBeTruthy();
    expect(screen.getByText("HTTP")).toBeTruthy();

    // Matcher only shows on the hook that has one
    expect(screen.getByText("matcher: Bash")).toBeTruthy();
  });

  it("renders the empty state explaining which events can block", () => {
    render(<HooksPanel hooks={[]} onHooksChange={vi.fn()} />);

    expect(screen.getByText("No hooks yet")).toBeTruthy();
    expect(
      screen.getByText("PreToolUse, UserPromptSubmit, PermissionRequest, PreModelSwitch, Stop"),
    ).toBeTruthy();
  });

  it("filters the list by the search query", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "greeting" },
    });

    expect(screen.queryByText("block-rm-rf")).toBeNull();
    expect(screen.getByText("session-greeting")).toBeTruthy();
  });
});

describe("HooksPanelComponent — matcher gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enables the matcher input on PreToolUse", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    expect(inputForLabel("Matcher").disabled).toBe(false);
  });

  it("disables the matcher input with a hint on an event with nothing to narrow", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    fireEvent.change(screen.getByTestId("mock-select"), {
      target: { value: "TurnStart" },
    });

    expect(inputForLabel("Matcher").disabled).toBe(true);
    expect(
      screen.getByText(/TurnStart has nothing to narrow — the server rejects a matcher on it/),
    ).toBeTruthy();
  });

  it("offers a field matcher on the events that have one, and says what it matches", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    fireEvent.change(screen.getByTestId("mock-select"), {
      target: { value: "StopFailure" },
    });

    expect(inputForLabel("Matcher").disabled).toBe(false);
    expect(inputForLabel("Matcher").value).toBe("");
    expect(screen.getByText(/Matches error_type/)).toBeTruthy();
  });

  it("explains the Tool(argPattern) form on tool events", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();
    expect(inputForLabel("Matcher").placeholder).toBe("execute_shell(git *)");
    expect(screen.getByText("Tool(argPattern)")).toBeTruthy();
  });

  it("re-enables the matcher when switching back to a tool event", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    fireEvent.change(screen.getByTestId("mock-select"), {
      target: { value: "Stop" },
    });
    expect(inputForLabel("Matcher").disabled).toBe(true);

    fireEvent.change(screen.getByTestId("mock-select"), {
      target: { value: "PostToolUse" },
    });
    expect(inputForLabel("Matcher").disabled).toBe(false);
  });
});

describe("HooksPanelComponent — handler sub-form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("swaps the handler fields when the handler type changes", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    // Starts on the prompt handler — Provider/Model are unique to it
    // ("Prompt" itself is ambiguous: it is both a label and a segment).
    expect(screen.getByTestId("segment-prompt").dataset.active).toBe("true");
    expect(screen.getByText("Provider")).toBeTruthy();
    expect(screen.getByText("Model")).toBeTruthy();
    expect(screen.queryByText("URL")).toBeNull();
    expect(screen.queryByText("Server")).toBeNull();

    fireEvent.click(screen.getByTestId("segment-http"));
    expect(screen.getByText("URL")).toBeTruthy();
    expect(screen.getByText("Headers")).toBeTruthy();
    expect(screen.queryByText("Server")).toBeNull();

    fireEvent.click(screen.getByTestId("segment-mcp_tool"));
    expect(screen.getByText("Server")).toBeTruthy();
    expect(screen.getByText("Tool")).toBeTruthy();
    expect(screen.getByText("Input (JSON)")).toBeTruthy();
    expect(screen.queryByText("URL")).toBeNull();
  });

  it("restores a previously typed handler when switching back", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    fireEvent.click(screen.getByTestId("segment-http"));
    fireEvent.click(screen.getByTestId("segment-prompt"));

    expect(
      (screen.getByTestId("mock-textarea") as HTMLTextAreaElement).value,
    ).toBe("Is this safe?");
  });
});

describe("HooksPanelComponent — test run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the returned decision and duration inline", async () => {
    vi.mocked(PrismService.testHook).mockResolvedValue({
      decision: { decision: "deny", reason: "destructive" },
      durationMilliseconds: 42,
    });

    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Test")[0]);

    // With a sample payload shaped like the hook's event.
    expect(PrismService.testHook).toHaveBeenCalledWith(
      "hook-1",
      expect.objectContaining({ tool_name: "execute_shell" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Test decision")).toBeTruthy();
    });
    expect(screen.getByText("42 ms")).toBeTruthy();
    expect(screen.getByText(/"decision": "deny"/)).toBeTruthy();
  });

  it("renders a readable failure when the test throws", async () => {
    vi.mocked(PrismService.testHook).mockRejectedValue(
      new Error("handler timed out"),
    );

    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Test")[0]);

    await waitFor(() => {
      expect(screen.getByText("Test failed")).toBeTruthy();
    });
    expect(screen.getByText("handler timed out")).toBeTruthy();
  });
});

describe("HooksPanelComponent — persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strips the matcher when saving a hook on a non-tool event", async () => {
    vi.mocked(PrismService.updateHook).mockResolvedValue(mockHooks[0]);
    const onHooksChange = vi.fn();

    render(<HooksPanel hooks={mockHooks} onHooksChange={onHooksChange} />);
    openEditorForFirstHook();

    fireEvent.change(screen.getByTestId("mock-select"), {
      target: { value: "SessionStart" },
    });
    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(PrismService.updateHook).toHaveBeenCalled();
    });
    const [, payload] = vi.mocked(PrismService.updateHook).mock.calls[0];
    expect(payload.event).toBe("SessionStart");
    expect(payload.matcher).toBe("");
  });

  it("toggles a hook enabled through the service", async () => {
    vi.mocked(PrismService.updateHook).mockResolvedValue(mockHooks[1]);
    const onHooksChange = vi.fn();

    render(<HooksPanel hooks={mockHooks} onHooksChange={onHooksChange} />);
    // Second row's toggle — hook-2 is disabled, so this turns it on
    fireEvent.click(screen.getAllByTestId("mock-toggle")[1]);

    await waitFor(() => {
      expect(PrismService.updateHook).toHaveBeenCalledWith("hook-2", {
        enabled: true,
      });
    });
  });
});

describe("HooksPanelComponent — new events, handlers and fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every new event in the picker", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();
    const options = Array.from(
      (screen.getByTestId("mock-select") as HTMLSelectElement).options,
    ).map((option) => option.value);
    for (const event of [
      "TurnStart",
      "TurnEnd",
      "PermissionRequest",
      "PermissionDenied",
      "PostToolBatch",
      "StopFailure",
      "PreModelSwitch",
      "PostModelSwitch",
      "Interrupt",
      "InstructionsLoaded",
    ]) {
      expect(options).toContain(event);
    }
  });

  it("marks Stop as blocking and says a block keeps the agent going", () => {
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();
    fireEvent.change(screen.getByTestId("mock-select"), { target: { value: "Stop" } });
    expect(screen.getByText(/Block keeps it going/)).toBeTruthy();
  });

  it("builds and saves a command hook", async () => {
    vi.mocked(PrismService.createHook).mockResolvedValue(mockHooks[0]);
    render(<HooksPanel hooks={[]} onHooksChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Create your first hook"));

    fireEvent.change(inputForLabel("Hook Name"), { target: { value: "no-force-push" } });
    fireEvent.click(screen.getByTestId("segment-command"));
    expect(screen.getByText(/PRISM_HOOK_COMMAND_OWNERS/)).toBeTruthy();

    fireEvent.change(inputForLabel("Shell command"), { target: { value: "./block-force-push.sh" } });
    const [, timeoutSelect] = screen.getAllByTestId("mock-select");
    fireEvent.change(timeoutSelect, { target: { value: "fail_closed" } });
    fireEvent.click(screen.getByText("Create Hook"));

    await waitFor(() => expect(PrismService.createHook).toHaveBeenCalled());
    const [payload] = vi.mocked(PrismService.createHook).mock.calls[0];
    expect(payload.handler).toEqual({
      type: "command",
      command: "./block-force-push.sh",
      timeoutBehavior: "fail_closed",
    });
  });

  it("shows the agent handler as experimental and saves its prompt", async () => {
    vi.mocked(PrismService.createHook).mockResolvedValue(mockHooks[0]);
    render(<HooksPanel hooks={[]} onHooksChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Create your first hook"));
    fireEvent.change(inputForLabel("Hook Name"), { target: { value: "verify-done" } });

    fireEvent.click(screen.getByTestId("segment-agent"));
    expect(screen.getByText("Experimental.")).toBeTruthy();
    fireEvent.change(screen.getByTestId("mock-textarea"), {
      target: { value: "Did the agent run the tests? $ARGUMENTS" },
    });
    fireEvent.click(screen.getByText("Create Hook"));

    await waitFor(() => expect(PrismService.createHook).toHaveBeenCalled());
    const [payload] = vi.mocked(PrismService.createHook).mock.calls[0];
    expect(payload.handler).toEqual({ type: "agent", prompt: "Did the agent run the tests? $ARGUMENTS" });
  });

  it("saves the async flag", async () => {
    vi.mocked(PrismService.updateHook).mockResolvedValue(mockHooks[0]);
    render(<HooksPanel hooks={mockHooks} onHooksChange={vi.fn()} />);
    openEditorForFirstHook();

    const [asyncToggle] = screen.getAllByTestId("mock-toggle");
    fireEvent.click(asyncToggle);
    expect(screen.getByText(/cannot block or rewrite/)).toBeTruthy();
    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => expect(PrismService.updateHook).toHaveBeenCalled());
    const [, payload] = vi.mocked(PrismService.updateHook).mock.calls[0];
    expect(payload.async).toBe(true);
  });

  it("shows why the server refused a save instead of failing silently", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(PrismService.createHook).mockRejectedValue(
      new Error("command hooks are owner-only: they run shell commands with tools-service's privileges"),
    );
    render(<HooksPanel hooks={[]} onHooksChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Create your first hook"));
    fireEvent.change(inputForLabel("Hook Name"), { target: { value: "gate" } });
    fireEvent.click(screen.getByTestId("segment-command"));
    fireEvent.change(inputForLabel("Shell command"), { target: { value: "./gate.sh" } });
    fireEvent.click(screen.getByText("Create Hook"));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("owner-only"));
  });

  it("tests a Stop hook with a Stop-shaped sample payload", async () => {
    vi.mocked(PrismService.testHook).mockResolvedValue({ decision: {}, durationMilliseconds: 3 });
    const stopHook: Hook = { ...mockHooks[1], id: "hook-stop", event: "Stop", enabled: true };
    render(<HooksPanel hooks={[stopHook]} onHooksChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Test"));
    expect(PrismService.testHook).toHaveBeenCalledWith(
      "hook-stop",
      expect.objectContaining({ last_assistant_message: expect.any(String), stop_hook_active: false }),
    );
  });

  it("marks an async hook in the list", () => {
    render(<HooksPanel hooks={[{ ...mockHooks[0], async: true }]} onHooksChange={vi.fn()} />);
    expect(screen.getByText("async")).toBeTruthy();
  });
});

