"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileText,
  FolderOpen,
  Plug,
  Sparkles,
  Webhook,
} from "lucide-react";
import {
  ButtonComponent,
  InputComponent,
  SegmentedControlComponent,
} from "@rodrigo-barraza/components-library";
import ImportService, { fileToBase64 } from "../services/ImportService";
import WorkspaceService, { type WorkspaceItem } from "../services/WorkspaceService";
import { getErrorMessage } from "../utils/errorMessage";
import {
  PLUGIN_ARCHIVE_MAX_BYTES,
  type ClaudeConfigImportSummary,
  type McpImportItem,
  type McpImportSummary,
  type PluginImportSummary,
  type SkillImportItem,
  type SkillImportSummary,
} from "../types/imports";
import styles from "./ImportPanelComponent.module.css";

/**
 * Import panel — Claude Code config (CLAUDE.md, .claude/skills,
 * .claude/agents, MCP servers) from a workspace folder, and Agent Plugins
 * from a zip or a workspace folder. Preview first: the server runs the
 * import as a dry run and this panel shows every skill, file and server it
 * would write; Import sends the same request for real. Any change to the
 * inputs drops the preview, so what is imported is what was previewed.
 */

type ImportKind = "claude-config" | "plugin";
type PluginSourceKind = "zip" | "workspace";

type ImportOutcome =
  | { kind: "claude-config"; summary: ClaudeConfigImportSummary }
  | { kind: "plugin"; summary: PluginImportSummary };

interface ImportPanelProps {
  /** Called after a real import (not a preview) — e.g. to reload MCP servers. */
  onImported?: () => void;
}

const SKILL_STATUS_LABELS: Record<SkillImportItem["status"], { preview: string; done: string }> = {
  created: { preview: "New", done: "Added" },
  updated: { preview: "Update", done: "Updated" },
  unchanged: { preview: "Unchanged", done: "Unchanged" },
  skipped: { preview: "Skipped", done: "Skipped" },
};

const SERVER_STATUS_LABELS: Record<McpImportItem["status"], { preview: string; done: string }> = {
  imported: { preview: "New · disabled", done: "Added · disabled" },
  unchanged: { preview: "Exists", done: "Exists" },
  skipped: { preview: "Skipped", done: "Skipped" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function skillCounts(skills: SkillImportSummary, dryRun: boolean): string {
  const parts = [
    skills.created && `${skills.created} ${dryRun ? "new" : "added"}`,
    skills.updated && `${skills.updated} ${dryRun ? "to update" : "updated"}`,
    skills.unchanged && `${skills.unchanged} unchanged`,
    skills.skipped.length && `${skills.skipped.length} skipped`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "none found";
}

function serverCounts(servers: McpImportSummary, dryRun: boolean): string {
  const parts = [
    servers.imported && `${servers.imported} ${dryRun ? "new" : "added"}, disabled`,
    servers.unchanged && `${servers.unchanged} already configured`,
    servers.skipped.length && `${servers.skipped.length} skipped`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "none found";
}

function StatusChip({ status, label }: { status: string; label: string }) {
  return <span className={`${styles["status-chip"]} ${styles[`status-${status}`]}`}>{label}</span>;
}

function SkillRows({ items, dryRun }: { items: SkillImportItem[]; dryRun: boolean }) {
  return (
    <ul className={styles["item-list"]} aria-label="Skills">
      {items.map((item) => (
        <li key={item.name} className={styles["item-row"]}>
          <div className={styles["item-title-line"]}>
            <span className={styles["item-name"]}>{item.name}</span>
            <StatusChip
              status={item.status}
              label={SKILL_STATUS_LABELS[item.status][dryRun ? "preview" : "done"]}
            />
          </div>
          {item.description && <div className={styles["item-description"]}>{item.description}</div>}
          {item.reason && <div className={styles["item-reason"]}>{item.reason}</div>}
          {item.allowedTools && item.allowedTools.length > 0 && (
            <div className={styles["chip-line"]}>
              <span className={styles["chip-label"]}>Allowed tools</span>
              {item.allowedTools.map((tool) => (
                <span key={tool} className={styles["mono-chip"]}>
                  {tool}
                </span>
              ))}
            </div>
          )}
          {item.files.length > 0 && (
            <details className={styles["files"]}>
              <summary>{plural(item.files.length, "file")}</summary>
              <ul>
                {item.files.map((file) => (
                  <li key={file} className={styles["file-path"]}>
                    {file}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function ServerRows({ items, dryRun }: { items: McpImportItem[]; dryRun: boolean }) {
  return (
    <ul className={styles["item-list"]} aria-label="MCP servers">
      {items.map((item) => (
        <li key={item.name} className={styles["item-row"]}>
          <div className={styles["item-title-line"]}>
            <span className={styles["item-name"]}>{item.name}</span>
            {item.transport && <span className={styles["mono-chip"]}>{item.transport}</span>}
            <StatusChip
              status={item.status}
              label={SERVER_STATUS_LABELS[item.status][dryRun ? "preview" : "done"]}
            />
          </div>
          {item.target && <div className={styles["item-target"]}>{item.target}</div>}
          {item.reason && <div className={styles["item-reason"]}>{item.reason}</div>}
        </li>
      ))}
    </ul>
  );
}

function Section({
  icon: Icon,
  title,
  counts,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  counts?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles["section"]}>
      <h4 className={styles["section-title"]}>
        <Icon size={14} />
        {title}
        {counts && <span className={styles["section-counts"]}>{counts}</span>}
      </h4>
      {children}
    </section>
  );
}

export function ImportPreview({ outcome }: { outcome: ImportOutcome }) {
  const { summary } = outcome;
  const dryRun = summary.dryRun;
  const hasSkills = summary.skills.items.length > 0;
  const hasServers = summary.mcpServers.items.length > 0;

  return (
    <div className={styles["preview"]} data-testid={dryRun ? "import-preview" : "import-result"}>
      <div className={styles["preview-heading"]}>
        {dryRun ? <Eye size={14} /> : <CheckCircle2 size={14} />}
        {outcome.kind === "plugin" ? (
          <span>
            <strong>{outcome.summary.plugin.name}</strong>
            {outcome.summary.plugin.version && ` ${outcome.summary.plugin.version}`}
            {outcome.summary.plugin.description && ` — ${outcome.summary.plugin.description}`}
          </span>
        ) : (
          <span className={styles["mono"]}>{outcome.summary.workspaceRoot}</span>
        )}
        <span className={styles["preview-mode"]}>{dryRun ? "Preview — nothing written yet" : "Imported"}</span>
      </div>

      {summary.warnings.length > 0 && (
        <ul className={styles["warnings"]} aria-label="Warnings">
          {summary.warnings.map((warning) => (
            <li key={warning}>
              <AlertTriangle size={12} />
              {warning}
            </li>
          ))}
        </ul>
      )}

      {outcome.kind === "claude-config" && (
        <Section icon={FileText} title="CLAUDE.md">
          {outcome.summary.projectInstructions.skipped ? (
            <div className={styles["muted"]}>{outcome.summary.projectInstructions.skipped}</div>
          ) : (
            <>
              <div className={styles["muted"]}>
                {formatBytes(outcome.summary.projectInstructions.bytes)} —{" "}
                {outcome.summary.projectInstructions.unchanged
                  ? "already in the project instructions"
                  : dryRun
                    ? "will become the “Imported from CLAUDE.md” section of the project instructions"
                    : "now the “Imported from CLAUDE.md” section of the project instructions"}
              </div>
              {outcome.summary.projectInstructions.preview && (
                <details className={styles["files"]}>
                  <summary>Show CLAUDE.md</summary>
                  <pre className={styles["instructions-preview"]}>
                    {outcome.summary.projectInstructions.preview}
                  </pre>
                </details>
              )}
            </>
          )}
        </Section>
      )}

      <Section icon={Sparkles} title="Skills" counts={skillCounts(summary.skills, dryRun)}>
        {hasSkills && <SkillRows items={summary.skills.items} dryRun={dryRun} />}
      </Section>

      <Section icon={Plug} title="MCP servers" counts={serverCounts(summary.mcpServers, dryRun)}>
        {hasServers && (
          <>
            <ServerRows items={summary.mcpServers.items} dryRun={dryRun} />
            {summary.mcpServers.imported > 0 && (
              <div className={styles["muted"]}>
                Imported servers stay disabled until you enable each one under MCP Servers.
              </div>
            )}
          </>
        )}
      </Section>

      {outcome.kind === "plugin" && outcome.summary.pluginData && (
        <div className={styles["muted"]}>
          Plugin data directory: <span className={styles["mono"]}>{outcome.summary.pluginData}</span>
        </div>
      )}

      {outcome.kind === "claude-config" && outcome.summary.agents.found.length > 0 && (
        <Section icon={Bot} title="Agents" counts={plural(outcome.summary.agents.found.length, "file")}>
          <ul className={styles["item-list"]} aria-label="Agents">
            {outcome.summary.agents.found.map((agent) => (
              <li key={agent.path} className={styles["item-row"]}>
                <div className={styles["item-title-line"]}>
                  <span className={styles["item-name"]}>{agent.name}</span>
                  <span className={styles["file-path"]}>{agent.path}</span>
                </div>
                {agent.error && <div className={styles["item-reason"]}>{agent.error}</div>}
              </li>
            ))}
          </ul>
          {outcome.summary.agents.note && <div className={styles["muted"]}>{outcome.summary.agents.note}</div>}
        </Section>
      )}

      {outcome.kind === "claude-config" && outcome.summary.hooks.skippedCount > 0 && (
        <Section icon={Webhook} title="Hooks" counts={`${outcome.summary.hooks.skippedCount} not imported`}>
          {outcome.summary.hooks.note && <div className={styles["muted"]}>{outcome.summary.hooks.note}</div>}
        </Section>
      )}
    </div>
  );
}

export default function ImportPanel({ onImported }: ImportPanelProps) {
  const [kind, setKind] = useState<ImportKind>("claude-config");
  const [pluginSource, setPluginSource] = useState<PluginSourceKind>("zip");
  const [workspacePath, setWorkspacePath] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    WorkspaceService.list()
      .then((items) => {
        if (!cancelled) setWorkspaces(items);
      })
      .catch(() => {
        /* suggestions only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any input change makes a preview stale.
  const reset = () => {
    setOutcome(null);
    setError(null);
  };

  const usesPath = kind === "claude-config" || pluginSource === "workspace";
  const ready = usesPath ? workspacePath.trim().length > 0 : archive !== null;

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "import");
    setError(null);
    try {
      if (kind === "claude-config") {
        const summary = await ImportService.claudeConfig(workspacePath.trim(), { dryRun });
        setOutcome({ kind, summary });
      } else if (pluginSource === "workspace") {
        const summary = await ImportService.plugin({ workspacePath: workspacePath.trim() }, { dryRun });
        setOutcome({ kind, summary });
      } else if (archive) {
        if (archive.size > PLUGIN_ARCHIVE_MAX_BYTES) {
          throw new Error(`${archive.name} is ${formatBytes(archive.size)}; a plugin zip can be at most 25 MB.`);
        }
        const summary = await ImportService.plugin(
          { archiveBase64: await fileToBase64(archive), archiveName: archive.name },
          { dryRun },
        );
        setOutcome({ kind, summary });
      }
      if (!dryRun) onImported?.();
    } catch (caught: unknown) {
      setOutcome(null);
      setError(getErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const previewed = outcome?.summary.dryRun === true;

  return (
    <div className={styles["container"]}>
      <SegmentedControlComponent
        value={kind}
        onChange={(value: string) => {
          setKind(value as ImportKind);
          reset();
        }}
        fullWidth
        compact
        segments={[
          { value: "claude-config", label: "Claude config", icon: <FileText size={13} /> },
          { value: "plugin", label: "Agent plugin", icon: <FileArchive size={13} /> },
        ]}
      />

      <p className={styles["intro"]}>
        {kind === "claude-config"
          ? "CLAUDE.md, .claude/skills (each skill's whole folder), and the MCP servers in .mcp.json / .claude/settings.json. Hooks are never imported; .claude/agents are already read live."
          : "An Agent Plugins 1.0 plugin: plugin.json, skills/ (registered as plugin:skill, folders kept) and mcp.json (servers imported disabled)."}
      </p>

      {kind === "plugin" && (
        <SegmentedControlComponent
          value={pluginSource}
          onChange={(value: string) => {
            setPluginSource(value as PluginSourceKind);
            reset();
          }}
          compact
          segments={[
            { value: "zip", label: "Upload a zip", icon: <FileArchive size={13} /> },
            { value: "workspace", label: "Workspace folder", icon: <FolderOpen size={13} /> },
          ]}
        />
      )}

      {usesPath ? (
        <div className={styles["form-group"]}>
          <label htmlFor="import-workspace-path">Folder</label>
          <InputComponent
            id="import-workspace-path"
            type="text"
            list="import-workspace-suggestions"
            value={workspacePath}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setWorkspacePath(event.target.value);
              reset();
            }}
            placeholder={kind === "claude-config" ? "/path/to/project" : "/path/to/project/plugins/my-plugin"}
          />
          <datalist id="import-workspace-suggestions">
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.path}>
                {workspace.name}
              </option>
            ))}
          </datalist>
          <span className={styles["hint"]}>
            Read from prism-service&apos;s own disk, and only inside a registered workspace.
          </span>
        </div>
      ) : (
        <div className={styles["form-group"]}>
          <label htmlFor="import-archive">Plugin zip</label>
          <input
            id="import-archive"
            className={styles["file-input"]}
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              setArchive(event.target.files?.[0] ?? null);
              reset();
            }}
          />
          <span className={styles["hint"]}>Up to 25 MB. A zip wrapped in one folder is fine.</span>
        </div>
      )}

      <div className={styles["actions"]}>
        <ButtonComponent
          variant="secondary"
          icon={Eye}
          onClick={() => run(true)}
          disabled={!ready || busy !== null}
          loading={busy === "preview"}
        >
          Preview
        </ButtonComponent>
        <ButtonComponent
          variant="primary"
          icon={Download}
          onClick={() => run(false)}
          disabled={!previewed || busy !== null}
          loading={busy === "import"}
        >
          Import
        </ButtonComponent>
      </div>

      {error && (
        <div className={styles["error"]} role="alert">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {outcome && <ImportPreview outcome={outcome} />}
    </div>
  );
}
