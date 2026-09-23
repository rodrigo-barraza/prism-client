/**
 * What prism-service's importers report — POST /claude-config-import and
 * POST /plugins/import. A dry run returns the same shape with the status
 * each item WOULD get; the Import panel renders both.
 */

export interface ImportSkipped {
  name: string;
  reason: string;
}

export type SkillImportStatus = "created" | "updated" | "unchanged" | "skipped";

export interface SkillImportItem {
  name: string;
  description: string;
  allowedTools: string[] | null;
  /** The skill folder's files, SKILL.md included. */
  files: string[];
  status: SkillImportStatus;
  reason?: string;
}

export interface SkillImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  skipped: ImportSkipped[];
  items: SkillImportItem[];
}

export type McpImportStatus = "imported" | "unchanged" | "skipped";

export interface McpImportItem {
  name: string;
  transport: string | null;
  /** The command line or URL, as it will be stored. */
  target: string;
  status: McpImportStatus;
  reason?: string;
}

export interface McpImportSummary {
  imported: number;
  unchanged: number;
  skipped: ImportSkipped[];
  items: McpImportItem[];
}

export interface ClaudeConfigImportSummary {
  workspaceRoot: string;
  dryRun: boolean;
  projectInstructions: {
    imported: boolean;
    unchanged: boolean;
    bytes: number;
    skipped: string | null;
    preview?: string;
  };
  skills: SkillImportSummary;
  mcpServers: McpImportSummary;
  hooks: { skippedCount: number; note: string | null };
  agents: {
    found: Array<{ name: string; path: string; error?: string }>;
    note: string | null;
  };
  warnings: string[];
}

export interface PluginImportSummary {
  dryRun: boolean;
  source: "zip" | "workspace";
  plugin: { name: string; version: string | null; description: string | null };
  pluginRoot: string | null;
  pluginData: string | null;
  warnings: string[];
  skills: SkillImportSummary;
  mcpServers: McpImportSummary;
}

/** Where a plugin comes from: an uploaded zip or a workspace folder. */
export type PluginImportSource =
  | { workspacePath: string }
  | { archiveBase64: string; archiveName?: string };

/** prism-service refuses a plugin zip larger than this. */
export const PLUGIN_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024;
