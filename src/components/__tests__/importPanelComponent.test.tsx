import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import ImportPanel from "../ImportPanelComponent";
import ImportService from "../../services/ImportService";
import type { ClaudeConfigImportSummary, PluginImportSummary } from "../../types/imports";

/**
 * The Import panel (prompt 19, Landing 2): Preview runs the import as a
 * dry run and lists every skill (its files and allowed tools), MCP server
 * (disabled), CLAUDE.md and agent file; Import is only offered for what
 * was previewed, and editing the input drops the preview.
 */

vi.mock("../ImportPanelComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));

vi.mock("@rodrigo-barraza/components-library", () => ({
  ButtonComponent: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  InputComponent: ({ value, onChange, placeholder, id, list }: any) => (
    <input id={id} list={list} value={value ?? ""} placeholder={placeholder} onChange={onChange} />
  ),
  SegmentedControlComponent: ({ value, onChange, segments }: any) => (
    <div>
      {(segments ?? []).map((segment: { value: string; label: string }) => (
        <button
          key={segment.value}
          data-active={value === segment.value}
          onClick={() => onChange?.(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../services/ImportService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/ImportService")>();
  return {
    ...actual,
    default: { claudeConfig: vi.fn(), plugin: vi.fn() },
  };
});

vi.mock("../../services/WorkspaceService", () => ({
  default: {
    list: vi.fn().mockResolvedValue([
      { id: "w1", name: "prism-service", path: "/home/rodrigo/development/prism-service" },
    ]),
  },
}));

function claudePreview(dryRun: boolean): ClaudeConfigImportSummary {
  return {
    workspaceRoot: "/home/rodrigo/development/prism-service",
    dryRun,
    projectInstructions: {
      imported: !dryRun,
      unchanged: false,
      bytes: 1200,
      skipped: null,
      preview: "# Prism\n\nNever push to main.",
    },
    skills: {
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: [{ name: "broken", reason: "invalid YAML frontmatter: bad indentation" }],
      items: [
        {
          name: "deploy-app",
          description: "Deploy the app to staging and smoke-test it.",
          allowedTools: ["Bash(./scripts/deploy.sh:*)", "Read"],
          files: ["SKILL.md", "scripts/smoke.sh"],
          status: "created",
        },
        {
          name: "broken",
          description: "",
          allowedTools: null,
          files: [],
          status: "skipped",
          reason: "invalid YAML frontmatter: bad indentation",
        },
      ],
    },
    mcpServers: {
      imported: 1,
      unchanged: 0,
      skipped: [],
      items: [
        {
          name: "filesystem",
          transport: "stdio",
          target: "npx -y @modelcontextprotocol/server-filesystem /tmp",
          status: "imported",
        },
      ],
    },
    hooks: { skippedCount: 2, note: "Hooks from .claude/settings.json are never imported." },
    agents: {
      found: [{ name: "reviewer", path: ".claude/agents/reviewer.md" }],
      note: "Agent files are read from the workspace at every turn.",
    },
    warnings: [".claude/skills/deploy-app/leak.md: symbolic link (not followed)"],
  };
}

function pluginPreview(): PluginImportSummary {
  return {
    dryRun: true,
    source: "zip",
    plugin: { name: "release-kit", version: "1.2.0", description: "Release notes" },
    pluginRoot: "/root/.prism/plugins/abc/release-kit/root",
    pluginData: "/root/.prism/plugins/abc/release-kit/data",
    warnings: ['plugin.json: unknown field "homepageUrl" ignored'],
    skills: {
      created: 2,
      updated: 0,
      unchanged: 0,
      skipped: [],
      items: [
        {
          name: "release-kit:release-notes",
          description: "Write release notes",
          allowedTools: ["read_file"],
          files: ["SKILL.md", "references/template.md"],
          status: "created",
        },
      ],
    },
    mcpServers: { imported: 0, unchanged: 0, skipped: [], items: [] },
  };
}

describe("ImportPanel", () => {
  beforeEach(() => {
    vi.mocked(ImportService.claudeConfig).mockReset();
    vi.mocked(ImportService.plugin).mockReset();
  });

  it("previews a Claude config: skills with files and tools, servers disabled, CLAUDE.md, agents, warnings", async () => {
    vi.mocked(ImportService.claudeConfig).mockResolvedValue(claudePreview(true));
    render(<ImportPanel />);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Folder"), {
      target: { value: "/home/rodrigo/development/prism-service" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const preview = await screen.findByTestId("import-preview");
    expect(ImportService.claudeConfig).toHaveBeenCalledWith("/home/rodrigo/development/prism-service", {
      dryRun: true,
    });

    const skills = within(preview).getByRole("list", { name: "Skills" });
    expect(within(skills).getByText("deploy-app")).toBeInTheDocument();
    expect(within(skills).getByText("New")).toBeInTheDocument();
    expect(within(skills).getByText("Bash(./scripts/deploy.sh:*)")).toBeInTheDocument();
    expect(within(skills).getByText("scripts/smoke.sh")).toBeInTheDocument();
    expect(within(skills).getByText("Skipped")).toBeInTheDocument();
    expect(within(skills).getByText("invalid YAML frontmatter: bad indentation")).toBeInTheDocument();

    const servers = within(preview).getByRole("list", { name: "MCP servers" });
    expect(within(servers).getByText("New · disabled")).toBeInTheDocument();
    expect(within(servers).getByText(/server-filesystem/)).toBeInTheDocument();
    expect(within(preview).getByText(/stay disabled until you enable/)).toBeInTheDocument();

    expect(within(preview).getByText(/Never push to main/)).toBeInTheDocument();
    expect(within(preview).getByText(".claude/agents/reviewer.md")).toBeInTheDocument();
    expect(within(preview).getByText(/symbolic link \(not followed\)/)).toBeInTheDocument();
    expect(within(preview).getByText("2 not imported")).toBeInTheDocument();
  });

  it("imports only after a preview, then reports what landed", async () => {
    vi.mocked(ImportService.claudeConfig)
      .mockResolvedValueOnce(claudePreview(true))
      .mockResolvedValueOnce(claudePreview(false));
    const onImported = vi.fn();
    render(<ImportPanel onImported={onImported} />);

    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/work" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTestId("import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    const result = await screen.findByTestId("import-result");
    expect(ImportService.claudeConfig).toHaveBeenLastCalledWith("/work", { dryRun: false });
    expect(within(result).getByText("Added")).toBeInTheDocument();
    expect(within(result).getByText("Added · disabled")).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("editing the folder drops a stale preview", async () => {
    vi.mocked(ImportService.claudeConfig).mockResolvedValue(claudePreview(true));
    render(<ImportPanel />);
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/work" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTestId("import-preview");

    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/elsewhere" } });
    expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("uploads a plugin zip as base64 for the preview", async () => {
    vi.mocked(ImportService.plugin).mockResolvedValue(pluginPreview());
    render(<ImportPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Agent plugin" }));

    const zip = new File([new Uint8Array([0x50, 0x4b, 0x05, 0x06])], "release-kit.zip", {
      type: "application/zip",
    });
    fireEvent.change(screen.getByLabelText("Plugin zip"), { target: { files: [zip] } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const preview = await screen.findByTestId("import-preview");
    expect(ImportService.plugin).toHaveBeenCalledWith(
      { archiveBase64: "UEsFBg==", archiveName: "release-kit.zip" },
      { dryRun: true },
    );
    expect(within(preview).getByText("release-kit")).toBeInTheDocument();
    expect(within(preview).getByText("release-kit:release-notes")).toBeInTheDocument();
    expect(within(preview).getByText(/homepageUrl/)).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    vi.mocked(ImportService.plugin).mockRejectedValue(
      new Error("/tmp is not inside a registered workspace (/work)."),
    );
    render(<ImportPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Agent plugin" }));
    fireEvent.click(screen.getByRole("button", { name: "Workspace folder" }));
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/tmp" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("not inside a registered workspace");
    expect(ImportService.plugin).toHaveBeenCalledWith({ workspacePath: "/tmp" }, { dryRun: true });
  });
});
