/**
 * The permission mode selector, its hook and the pieces around it:
 *   - the selector lists the server's modes, disables what the user may not
 *     pick (bypass without the owner flag), and shows a banner in bypass;
 *   - usePermissionMode loads a conversation's mode, stores a switch (a new
 *     chat's 404 keeps it local — the first send carries it), reverts a
 *     refused one, and follows `permission_mode` events for its conversation;
 *   - `permission_mode` reaches onPermissionMode;
 *   - a protected-path card says why it asks and offers no "Always allow";
 *   - Settings → Permissions sets the default, never bypass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, renderHook } from "@testing-library/react";
import React from "react";
import PermissionModeSelectorComponent from "../PermissionModeSelectorComponent";
import DefaultPermissionModeComponent from "../DefaultPermissionModeComponent";
import ApprovalCardComponent from "../ApprovalCardComponent";
import usePermissionMode from "../../hooks/usePermissionMode";
import PermissionRulesService from "../../services/PermissionRulesService";
import PrismService from "../../services/PrismService";
import { approvalFromEvent } from "../../utils/approvalCards";
import type { PermissionModeInfo, PermissionModeState } from "../../types/permissions";
import type { SSEData } from "../../types/types";

const { cssProxy } = vi.hoisted(() => ({
  cssProxy: () => ({ default: new Proxy({}, { get: (_target, property: string) => property }) }),
}));
vi.mock("../PermissionModeSelectorComponent.module.css", cssProxy);
vi.mock("../PermissionRulesPanelComponent.module.css", cssProxy);
vi.mock("../ApprovalCardComponent.module.css", cssProxy);
vi.mock("../AlwaysAllowControlComponent.module.css", cssProxy);
vi.mock("../InfoBannerComponent.module.css", cssProxy);

vi.mock("../../services/PermissionRulesService", () => ({
  default: { getMode: vi.fn(), setMode: vi.fn(), setDefaultMode: vi.fn(), propose: vi.fn(), create: vi.fn() },
}));

const MODES: PermissionModeInfo[] = [
  { id: "default", label: "Ask", description: "Writes ask.", available: true },
  { id: "plan", label: "Plan", description: "Read-only tools only.", available: true },
  { id: "acceptEdits", label: "Accept edits", description: "Workspace edits run.", available: true },
  { id: "auto", label: "Auto", description: "A classifier reviews.", available: true, note: "Asks until the classifier ships." },
  { id: "dontAsk", label: "Don't ask", description: "Asks are refused.", available: true },
  { id: "bypass", label: "Bypass", description: "Everything runs.", available: false, unavailableReason: "Owner only." },
];

function state(overrides: Partial<PermissionModeState> = {}): PermissionModeState {
  return {
    conversationId: "conv-1",
    mode: "default",
    source: "default",
    defaultMode: "default",
    bypassAllowed: false,
    modes: MODES,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(PermissionRulesService.getMode).mockReset().mockResolvedValue(state());
  vi.mocked(PermissionRulesService.setMode).mockReset().mockResolvedValue({
    conversationId: "conv-1",
    mode: "plan",
    stored: true,
    live: false,
  });
  vi.mocked(PermissionRulesService.setDefaultMode).mockReset().mockResolvedValue({ defaultMode: "plan" });
});

describe("PermissionModeSelector", () => {
  it("lists the modes, with bypass disabled for a non-owner", () => {
    const onChange = vi.fn();
    render(<PermissionModeSelectorComponent mode="default" modes={MODES} onChange={onChange} />);
    const select = screen.getByLabelText("Permission mode") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      "default",
      "plan",
      "acceptEdits",
      "auto",
      "dontAsk",
      "bypass",
    ]);
    const bypass = [...select.options].find((option) => option.value === "bypass")!;
    expect(bypass.disabled).toBe(true);
    expect(bypass.textContent).toContain("owner only");
    fireEvent.change(select, { target: { value: "plan" } });
    expect(onChange).toHaveBeenCalledWith("plan");
    expect(screen.getByText("Writes ask.")).toBeInTheDocument();
  });

  it("shows a banner while bypass is on", () => {
    const owner = MODES.map((mode) => (mode.id === "bypass" ? { ...mode, available: true } : mode));
    const { rerender } = render(<PermissionModeSelectorComponent mode="default" modes={owner} onChange={vi.fn()} />);
    expect(screen.queryByText(/Bypass mode/)).toBeNull();
    rerender(<PermissionModeSelectorComponent mode="bypass" modes={owner} onChange={vi.fn()} />);
    expect(screen.getByText("Bypass mode")).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toContain("protected paths");
  });

  it("renders nothing on a server without modes", () => {
    const { container } = render(<PermissionModeSelectorComponent mode="default" modes={[]} onChange={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("usePermissionMode", () => {
  it("loads the conversation's mode and stores a switch", async () => {
    vi.mocked(PermissionRulesService.getMode).mockResolvedValue(state({ mode: "acceptEdits", source: "conversation" }));
    const { result } = renderHook(() => usePermissionMode("conv-1"));
    await waitFor(() => expect(result.current.mode).toBe("acceptEdits"));
    expect(PermissionRulesService.getMode).toHaveBeenCalledWith("conv-1");

    await act(() => result.current.change("plan"));
    expect(PermissionRulesService.setMode).toHaveBeenCalledWith("conv-1", "plan");
    expect(result.current.mode).toBe("plan");
    expect(result.current.error).toBeNull();
  });

  it("a new chat's 404 keeps the choice local — the first send carries it", async () => {
    vi.mocked(PermissionRulesService.setMode).mockRejectedValue(Object.assign(new Error("No conversation"), { status: 404 }));
    const { result } = renderHook(() => usePermissionMode("new-chat"));
    await waitFor(() => expect(result.current.modes).toHaveLength(6));
    await act(() => result.current.change("dontAsk"));
    expect(result.current.mode).toBe("dontAsk");
    expect(result.current.error).toBeNull();
  });

  it("a refused switch reverts and says why", async () => {
    vi.mocked(PermissionRulesService.setMode).mockRejectedValue(
      Object.assign(new Error('bypass is owner-only: "rodrigo" is not in PRISM_PERMISSION_BYPASS_OWNERS.'), { status: 403 }),
    );
    const { result } = renderHook(() => usePermissionMode("conv-1"));
    await waitFor(() => expect(result.current.modes).toHaveLength(6));
    await act(() => result.current.change("bypass"));
    expect(result.current.mode).toBe("default");
    expect(result.current.error).toContain("owner-only");
  });

  it("follows permission_mode events for its conversation only", async () => {
    const { result } = renderHook(() => usePermissionMode("conv-1"));
    await waitFor(() => expect(result.current.modes).toHaveLength(6));

    act(() => result.current.applyEvent({ type: "permission_mode", conversationId: "other", mode: "plan" } as SSEData));
    expect(result.current.mode).toBe("default");

    act(() =>
      result.current.applyEvent({ type: "permission_mode", conversationId: "conv-1", mode: "plan", source: "user" } as SSEData),
    );
    expect(result.current.mode).toBe("plan");

    act(() =>
      result.current.applyEvent({
        type: "permission_mode",
        conversationId: "conv-1",
        mode: "default",
        refused: "bypass",
        reason: "bypass is owner-only",
      } as SSEData),
    );
    expect(result.current.mode).toBe("default");
    expect(result.current.notice).toContain("Bypass refused");
  });
});

describe("the stream", () => {
  it("routes permission_mode to onPermissionMode", () => {
    const onPermissionMode = vi.fn();
    const event: SSEData = { type: "permission_mode", conversationId: "conv-1", mode: "plan", source: "plan_approved" };
    PrismService._dispatchSSE(event, { onPermissionMode });
    expect(onPermissionMode).toHaveBeenCalledWith(event);
  });
});

describe("a protected-path card", () => {
  it("carries the path from the event, says why it asks, and offers no Always allow", () => {
    const approval = approvalFromEvent({
      type: "approval_required",
      toolCallId: "call-env",
      batchId: "b",
      toolCall: { id: "call-env", name: "write_file", args: { path: ".env", content: "KEY=1" } },
      tier: 2,
      protectedPath: ".env",
      alwaysAsks: true,
    } as SSEData)!;
    expect(approval.protectedPath).toBe(".env");

    render(
      <ApprovalCardComponent
        toolName={approval.toolName}
        toolArgs={approval.toolArgs}
        tier={approval.tier}
        protectedPath={approval.protectedPath}
        onDecide={vi.fn().mockResolvedValue(null)}
        alwaysAllow={{ conversationId: "conv-1", workspaceRoot: "/ws" }}
      />,
    );
    expect(screen.getByRole("note").textContent).toContain("always ask");
    expect(screen.queryByText("Always allow…")).toBeNull();
  });
});

describe("Settings → Permissions default mode", () => {
  it("offers every mode but bypass, and saves the choice", async () => {
    render(<DefaultPermissionModeComponent />);
    const select = (await screen.findByLabelText("Default permission mode")) as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).not.toContain("bypass");
    fireEvent.change(select, { target: { value: "plan" } });
    await waitFor(() => expect(PermissionRulesService.setDefaultMode).toHaveBeenCalledWith("plan"));
    expect(select.value).toBe("plan");
  });
});
