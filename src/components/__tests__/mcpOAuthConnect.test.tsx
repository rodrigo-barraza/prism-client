import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import MCPServersPanel from "../MCPServersPanelComponent";
import { McpPromptSlashItems } from "../McpComposerMenuItemsComponent";
import PrismService from "../../services/PrismService";
import type { MCPServer } from "../../types/types";

vi.mock("../MCPServersPanelComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));
vi.mock("../McpComposerMenuItemsComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));
vi.mock("@rodrigo-barraza/components-library", () => ({
  ButtonComponent: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  CloseButtonComponent: ({ onClick }: any) => <button onClick={onClick}>close</button>,
  IconButtonComponent: ({ onClick, tooltip }: any) => (
    <button onClick={onClick} aria-label={tooltip}>
      {tooltip}
    </button>
  ),
  InputComponent: ({ value, onChange, placeholder, type }: any) => (
    <input type={type} value={value ?? ""} placeholder={placeholder} onChange={onChange} />
  ),
  SwitchComponent: ({ checked, onChange, label }: any) => (
    <label>
      {label}
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange?.(event.target.checked)} />
    </label>
  ),
}));
vi.mock("../../services/PrismService", () => ({
  default: {
    connectMCPServer: vi.fn(),
    getMCPServerOAuth: vi.fn(),
    signOutMCPServer: vi.fn(),
    updateMCPServer: vi.fn(),
    approveMCPServerTools: vi.fn(),
    getMCPPrompt: vi.fn(),
  },
}));

const LINEAR: MCPServer = {
  id: "server-9",
  name: "linear",
  url: "https://mcp.linear.app/mcp",
  transport: "streamable-http",
  auth: { type: "oauth" },
  oauth: { status: "none", authorized: false },
  connected: false,
};

describe("MCP OAuth Connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the authorization page, waits, and refreshes once the server reports it connected", async () => {
    const popup = { closed: false } as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    vi.mocked(PrismService.connectMCPServer).mockResolvedValue({
      success: false,
      authorizationRequired: true,
      authorizationUrl: "https://auth.linear.app/authorize?client_id=x",
    });
    vi.mocked(PrismService.getMCPServerOAuth).mockResolvedValue({
      status: "authorized",
      authorized: true,
      connected: true,
    });
    const onServersChange = vi.fn();
    render(<MCPServersPanel servers={[LINEAR]} onServersChange={onServersChange} />);

    fireEvent.click(screen.getByText("Connect"));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://auth.linear.app/authorize?client_id=x",
        "prism-mcp-oauth-server-9",
        expect.stringContaining("popup"),
      ),
    );
    expect(screen.getByRole("status").textContent).toMatch(/sign in in the other window/);
    expect(onServersChange).not.toHaveBeenCalled();

    // The callback page posts a message; the panel re-checks with the server.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: { type: "prism-mcp-oauth", serverId: "server-9", status: "connected" } }),
      );
    });
    await waitFor(() => expect(onServersChange).toHaveBeenCalled());
    expect(PrismService.getMCPServerOAuth).toHaveBeenCalledWith("server-9");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the failure the server recorded", async () => {
    vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
    vi.mocked(PrismService.connectMCPServer).mockResolvedValue({
      success: false,
      authorizationRequired: true,
      authorizationUrl: "https://auth.linear.app/authorize",
    });
    vi.mocked(PrismService.getMCPServerOAuth).mockResolvedValue({
      status: "failed",
      authorized: false,
      connected: false,
      error: "authorization server returned \"access_denied\"",
    });
    render(<MCPServersPanel servers={[LINEAR]} onServersChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Connect"));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "prism-mcp-oauth", serverId: "server-9" } }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("access_denied"));
  });

  it("offers Sign out for a signed-in server", async () => {
    vi.mocked(PrismService.signOutMCPServer).mockResolvedValue({ success: true });
    const onServersChange = vi.fn();
    render(
      <MCPServersPanel
        servers={[{ ...LINEAR, connected: true, oauth: { status: "authorized", authorized: true } }]}
        onServersChange={onServersChange}
      />,
    );
    expect(screen.getByText(/signed in/)).toBeTruthy();
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() => expect(PrismService.signOutMCPServer).toHaveBeenCalledWith("server-9"));
    await waitFor(() => expect(onServersChange).toHaveBeenCalled());
  });

  it("saves the OAuth switch on an HTTP server", async () => {
    vi.mocked(PrismService.updateMCPServer).mockResolvedValue({} as MCPServer);
    render(<MCPServersPanel servers={[{ ...LINEAR, auth: null }]} onServersChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Edit server"));
    fireEvent.click(screen.getByLabelText("Sign in with OAuth"));
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() =>
      expect(PrismService.updateMCPServer).toHaveBeenCalledWith(
        "server-9",
        expect.objectContaining({ auth: { type: "oauth" } }),
      ),
    );
  });
});

describe("MCP prompts in the / menu", () => {
  const PROMPTS = [
    { server: "trust", name: "daily", title: "Daily summary", description: null, arguments: [] },
    {
      server: "trust",
      name: "summarize_topic",
      title: null,
      description: "Summarize a topic.",
      arguments: [
        { name: "topic", description: "What to summarize", required: true },
        { name: "tone", description: null, required: false },
      ],
    },
  ];

  it("inserts a prompt without arguments straight away", async () => {
    vi.mocked(PrismService.getMCPPrompt).mockResolvedValue({ text: "Summarize today.", description: null });
    const onInsert = vi.fn();
    render(<McpPromptSlashItems prompts={PROMPTS} itemClassName="item" onInsert={onInsert} />);
    fireEvent.mouseDown(screen.getByText("/trust:daily"));
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("Summarize today."));
    expect(PrismService.getMCPPrompt).toHaveBeenCalledWith("trust", "daily", {});
  });

  it("asks for arguments first, required ones before Insert", async () => {
    vi.mocked(PrismService.getMCPPrompt).mockResolvedValue({ text: "Summarize MCP.", description: null });
    const onInsert = vi.fn();
    render(<McpPromptSlashItems prompts={PROMPTS} itemClassName="item" onInsert={onInsert} />);
    fireEvent.mouseDown(screen.getByText("/trust:summarize_topic"));
    const insert = screen.getByText("Insert") as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("What to summarize"), { target: { value: "MCP" } });
    fireEvent.click(insert);
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("Summarize MCP."));
    expect(PrismService.getMCPPrompt).toHaveBeenCalledWith("trust", "summarize_topic", { topic: "MCP" });
  });

  it("never submits the composer form it sits in (Insert or Enter)", async () => {
    vi.mocked(PrismService.getMCPPrompt).mockResolvedValue({ text: "Summarize MCP.", description: null });
    const onInsert = vi.fn();
    const onComposerSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onComposerSubmit}>
        <McpPromptSlashItems prompts={PROMPTS} itemClassName="item" onInsert={onInsert} />
      </form>,
    );
    fireEvent.mouseDown(screen.getByText("/trust:summarize_topic"));
    const topic = screen.getByPlaceholderText("What to summarize");
    fireEvent.change(topic, { target: { value: "MCP" } });
    fireEvent.keyDown(topic, { key: "Enter" });
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("Summarize MCP."));
    fireEvent.mouseDown(screen.getByText("/trust:summarize_topic"));
    fireEvent.change(screen.getByPlaceholderText("What to summarize"), { target: { value: "MCP" } });
    fireEvent.click(screen.getByText("Insert"));
    await waitFor(() => expect(onInsert).toHaveBeenCalledTimes(2));
    expect(onComposerSubmit).not.toHaveBeenCalled();
  });
});
