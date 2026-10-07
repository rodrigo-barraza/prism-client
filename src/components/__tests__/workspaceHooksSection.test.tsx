/**
 * Settings → Hooks: the repository hooks files (`.prism/hooks.json`) that
 * apply to the conversation's workspace — the user's own and the nearest
 * one in the repository — each with its scope, path, short sha256, whether
 * this user trusted it, and its hooks (event, matcher, command); Trust
 * records the file at that sha256, Revoke takes it back. A user who is not
 * a command-hook owner is told their command hooks are disabled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import WorkspaceHooksSectionComponent from "../WorkspaceHooksSectionComponent";
import HooksPanel from "../HooksPanelComponent";
import PrismService from "../../services/PrismService";
import type { WorkspaceHooks } from "../../types/types";

vi.mock("../../services/PrismService", () => ({
  default: {
    getWorkspaceHooks: vi.fn(),
    trustWorkspaceHooks: vi.fn(),
    revokeWorkspaceHooks: vi.fn(),
    updateHook: vi.fn(),
    testHook: vi.fn(),
  },
}));

const ROOT = "/home/rodrigo/development/paper-tiles";
const PROJECT_SHA = "9f2c4e1ab37d5c8e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70";
const USER_SHA = "0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6";

const hooksFor = (overrides: Partial<WorkspaceHooks> = {}): WorkspaceHooks => ({
  ownerAllowed: true,
  files: [
    {
      scope: "user",
      path: "/home/rodrigo/.prism/hooks.json",
      dir: "/home/rodrigo",
      sha256: USER_SHA,
      trusted: true,
      summary: [{ event: "Stop", matcher: null, command: "~/.prism/stop-check.sh" }],
    },
    {
      scope: "project",
      path: `${ROOT}/.prism/hooks.json`,
      dir: ROOT,
      sha256: PROJECT_SHA,
      trusted: false,
      summary: [
        { event: "PreToolUse", matcher: "^(execute_command)$", command: ".claude/hooks/prism-hook.sh pre" },
        { event: "SessionEnd", command: ".claude/hooks/prism-hook.sh end" },
      ],
    },
  ],
  ...overrides,
});

const fileRow = (path: string) => document.querySelector(`[data-hooks-file="${path}"]`) as HTMLElement;

describe("WorkspaceHooksSectionComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists each hooks file with its scope, path, short sha, trust and hooks", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue(hooksFor());
    render(<WorkspaceHooksSectionComponent root={ROOT} />);
    expect(PrismService.getWorkspaceHooks).toHaveBeenCalledWith(ROOT);

    await screen.findByText("Not trusted");
    const project = fileRow(`${ROOT}/.prism/hooks.json`);
    expect(within(project).getByText("Project")).toBeTruthy();
    expect(within(project).getByText(PROJECT_SHA.slice(0, 12)).getAttribute("title")).toBe(`sha256 ${PROJECT_SHA}`);
    expect(within(project).getByText("Not trusted")).toBeTruthy();
    const rows = within(project)
      .getAllByRole("row")
      .slice(1)
      .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["PreToolUse", "^(execute_command)$", ".claude/hooks/prism-hook.sh pre"],
      ["SessionEnd", "all", ".claude/hooks/prism-hook.sh end"],
    ]);

    const user = fileRow("/home/rodrigo/.prism/hooks.json");
    expect(within(user).getByText("User")).toBeTruthy();
    expect(within(user).getByText("Trusted")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("trusts a file at its sha256, and revokes one, then lists again", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue(hooksFor());
    vi.mocked(PrismService.trustWorkspaceHooks).mockResolvedValue({ ok: true });
    vi.mocked(PrismService.revokeWorkspaceHooks).mockResolvedValue({ ok: true });
    render(<WorkspaceHooksSectionComponent root={ROOT} />);

    fireEvent.click(await screen.findByRole("button", { name: `Trust ${ROOT}/.prism/hooks.json` }));
    await waitFor(() => expect(PrismService.getWorkspaceHooks).toHaveBeenCalledTimes(2));
    expect(PrismService.trustWorkspaceHooks).toHaveBeenCalledWith(`${ROOT}/.prism/hooks.json`, PROJECT_SHA);

    fireEvent.click(screen.getByRole("button", { name: "Revoke trust in /home/rodrigo/.prism/hooks.json" }));
    await waitFor(() => expect(PrismService.getWorkspaceHooks).toHaveBeenCalledTimes(3));
    expect(PrismService.revokeWorkspaceHooks).toHaveBeenCalledWith("/home/rodrigo/.prism/hooks.json");
  });

  it("says why a trust failed", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue(hooksFor());
    vi.mocked(PrismService.trustWorkspaceHooks).mockRejectedValue(new Error("The file changed: its sha256 is no longer 9f2c4e1ab37d"));
    render(<WorkspaceHooksSectionComponent root={ROOT} />);
    fireEvent.click(await screen.findByRole("button", { name: `Trust ${ROOT}/.prism/hooks.json` }));
    expect((await screen.findByRole("alert")).textContent).toContain("The file changed");
  });

  it("tells a user who is not an owner that command hooks are disabled for them", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue(hooksFor({ ownerAllowed: false }));
    render(<WorkspaceHooksSectionComponent root={ROOT} />);
    const note = await screen.findByRole("note");
    expect(note.textContent).toContain("Command hooks are disabled for your account");
    expect(note.textContent).toContain("PRISM_HOOK_COMMAND_OWNERS");
    // Trusting would change nothing; revoking still can.
    expect((screen.getByRole("button", { name: `Trust ${ROOT}/.prism/hooks.json` }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Revoke trust in /home/rodrigo/.prism/hooks.json" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("says when a file could not be read, and what in it was skipped", async () => {
    const [user, project] = hooksFor().files;
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue({
      ownerAllowed: true,
      files: [
        { ...user, summary: [], error: "not valid JSON (Unexpected token } in JSON at position 41)" },
        { ...project, skipped: ['Notification: an event Prism does not have', 'PreToolUse: a "prompt" hook (only "command" hooks run)'] },
      ],
    });
    render(<WorkspaceHooksSectionComponent root={ROOT} />);
    await screen.findByText("Not trusted");
    const broken = fileRow("/home/rodrigo/.prism/hooks.json");
    expect(within(broken).getByText(/Not read: not valid JSON/).textContent).toContain("none of its hooks run");
    expect(within(broken).queryByText("No command hooks in this file.")).toBeNull();
    const skipped = within(fileRow(`${ROOT}/.prism/hooks.json`)).getByText("2 skipped").closest("details")!;
    expect([...skipped.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Notification: an event Prism does not have",
      'PreToolUse: a "prompt" hook (only "command" hooks run)',
    ]);
  });

  it("says when no hooks file applies, and when the list failed", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValueOnce({ ownerAllowed: true, files: [] });
    const { unmount } = render(<WorkspaceHooksSectionComponent root={ROOT} />);
    expect(await screen.findByText("No hooks file applies to this workspace.")).toBeTruthy();
    unmount();

    vi.mocked(PrismService.getWorkspaceHooks).mockRejectedValueOnce(new Error("workspace agent rodrigo-wsl is offline"));
    render(<WorkspaceHooksSectionComponent root={ROOT} />);
    expect((await screen.findByRole("alert")).textContent).toBe("workspace agent rodrigo-wsl is offline");
  });

  it("offers no trust to a read-only viewer", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue(hooksFor());
    render(<WorkspaceHooksSectionComponent root={ROOT} readOnly />);
    await screen.findByText("Not trusted");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the Hooks panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the workspace's hooks files under the hooks, given a workspace root", async () => {
    vi.mocked(PrismService.getWorkspaceHooks).mockResolvedValue(hooksFor());
    render(<HooksPanel hooks={[]} onHooksChange={vi.fn()} workspaceRoot={ROOT} />);
    expect(screen.getByText("No hooks yet")).toBeTruthy();
    const section = await screen.findByRole("region", { name: "Workspace hooks" });
    expect(within(section).getByText(ROOT)).toBeTruthy();
    await within(section).findByText("Not trusted");
  });

  it("lists nothing of a workspace without one", () => {
    render(<HooksPanel hooks={[]} onHooksChange={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Workspace hooks" })).toBeNull();
    expect(PrismService.getWorkspaceHooks).not.toHaveBeenCalled();
  });
});
