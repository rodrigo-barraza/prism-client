import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import AlwaysAllowControlComponent from "../AlwaysAllowControlComponent";
import ApprovalCardComponent from "../ApprovalCardComponent";
import PermissionRulesService from "../../services/PermissionRulesService";

vi.mock("../AlwaysAllowControlComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));
vi.mock("../ApprovalCardComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));

vi.mock("../../services/PermissionRulesService", () => ({
  default: { propose: vi.fn(), create: vi.fn() },
}));

const CALL = { toolName: "write_file", toolArgs: { path: "/ws/src/components/Card.tsx", content: "x" } };

function renderControl(overrides: Partial<React.ComponentProps<typeof AlwaysAllowControlComponent>> = {}) {
  const onAllowed = vi.fn();
  render(
    <AlwaysAllowControlComponent
      {...CALL}
      conversationId="conv-7"
      workspaceRoot="/ws"
      onAllowed={onAllowed}
      {...overrides}
    />,
  );
  return onAllowed;
}

describe("AlwaysAllowControl", () => {
  beforeEach(() => {
    vi.mocked(PermissionRulesService.propose).mockReset().mockResolvedValue({
      rule: "write_file(src/components/**)",
      coversCall: true,
      capabilities: ["fs_write"],
    });
    vi.mocked(PermissionRulesService.create).mockReset();
  });

  it("prefills the server's proposed rule, defaulting to this conversation", async () => {
    renderControl();
    fireEvent.click(screen.getByText("Always allow…"));
    await waitFor(() =>
      expect(PermissionRulesService.propose).toHaveBeenCalledWith({ toolName: "write_file", args: CALL.toolArgs, workspaceRoot: "/ws" }),
    );
    expect(await screen.findByDisplayValue("write_file(src/components/**)")).toBeInTheDocument();
    expect(screen.getByLabelText("This conversation", { exact: false })).toBeChecked();
  });

  it.each([
    ["This conversation", { scope: "conversation", conversationId: "conv-7" }],
    ["This project", { scope: "project", conversationId: null }],
    ["Everywhere", { scope: "profile", conversationId: null }],
  ])("'%s' writes the matching scope, then approves", async (label, expected) => {
    vi.mocked(PermissionRulesService.create).mockResolvedValue({} as never);
    const onAllowed = renderControl();
    fireEvent.click(screen.getByText("Always allow…"));
    await screen.findByTestId("always-allow-panel");
    fireEvent.click(screen.getByLabelText(label, { exact: false }));
    fireEvent.click(screen.getByText("Save rule & approve"));

    await waitFor(() => expect(onAllowed).toHaveBeenCalledTimes(1));
    expect(PermissionRulesService.create).toHaveBeenCalledWith({
      rule: "write_file(src/components/**)",
      decision: "allow",
      origin: "approval",
      ...expected,
    });
  });

  it("saves the user's edit of the rule", async () => {
    vi.mocked(PermissionRulesService.create).mockResolvedValue({} as never);
    renderControl();
    fireEvent.click(screen.getByText("Always allow…"));
    const input = await screen.findByDisplayValue("write_file(src/components/**)");
    fireEvent.change(input, { target: { value: "write_file(src/**)" } });
    fireEvent.click(screen.getByText("Save rule & approve"));
    await waitFor(() =>
      expect(PermissionRulesService.create).toHaveBeenCalledWith(expect.objectContaining({ rule: "write_file(src/**)" })),
    );
  });

  it("approves nothing when the rule fails to save, and says why", async () => {
    vi.mocked(PermissionRulesService.create).mockRejectedValue(new Error("rule: Invalid regular expression"));
    const onAllowed = renderControl();
    fireEvent.click(screen.getByText("Always allow…"));
    await screen.findByTestId("always-allow-panel");
    fireEvent.click(screen.getByText("Save rule & approve"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Invalid regular expression/);
    expect(onAllowed).not.toHaveBeenCalled();
  });

  it("warns when the proposed rule covers only part of a compound command", async () => {
    vi.mocked(PermissionRulesService.propose).mockResolvedValue({ rule: "execute_shell(git add:*)", coversCall: false, capabilities: ["shell"] });
    renderControl({ toolName: "execute_shell", toolArgs: { command: "git add . && npm test" } });
    fireEvent.click(screen.getByText("Always allow…"));
    expect(await screen.findByText(/covers only part of this call/)).toBeInTheDocument();
  });

  it("cannot scope to a conversation it doesn't know", async () => {
    renderControl({ conversationId: null });
    fireEvent.click(screen.getByText("Always allow…"));
    await screen.findByTestId("always-allow-panel");
    expect(screen.getByLabelText("This conversation", { exact: false })).toBeDisabled();
    expect(screen.getByLabelText("This project", { exact: false })).toBeChecked();
  });
});

describe("ApprovalCard offers Always allow only with a context", () => {
  it("renders the control when `alwaysAllow` is given, and it allows the call through onDecide", async () => {
    vi.mocked(PermissionRulesService.create).mockResolvedValue({} as never);
    const onDecide = vi.fn().mockResolvedValue(null);
    const { rerender } = render(<ApprovalCardComponent {...CALL} onDecide={onDecide} />);
    expect(screen.queryByText("Always allow…")).toBeNull();

    rerender(<ApprovalCardComponent {...CALL} onDecide={onDecide} alwaysAllow={{ conversationId: "conv-7", workspaceRoot: "/ws" }} />);
    fireEvent.click(screen.getByText("Always allow…"));
    await screen.findByTestId("always-allow-panel");
    fireEvent.click(screen.getByText("Save rule & approve"));
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
    expect(onDecide).toHaveBeenCalledWith({ decision: "allow" });
  });
});
