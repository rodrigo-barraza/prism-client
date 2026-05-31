"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  lazy,
} from "react";
import {
  ChevronRight,
  ChevronDown,
  Check,
  XCircle,
  FileText,
  FolderTree,
  Terminal,
  Globe,
  Search,
  GitBranch,
  Trash2,
  ArrowRight,
  File,
  Folder,
  Monitor,
  Users,
  MessageSquare,
  StopCircle,
  Zap,
  Download,
  Music,
} from "lucide-react";

import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";

import MarkdownContent from "./MarkdownContentComponent";
const LazyMessageList = lazy(() => import("./MessageListComponent"));
import {
  prepareDisplayMessages,
  type WorkerToolActivityItem,
} from "./MessageListComponent";
import { ToolBadgeRow } from "./ToolBadgeComponent";
import StatusBarComponent from "./StatusBarComponent";
import ToolCallsBlockComponent from "./ToolCallsBlockComponent";
import PrismService from "../services/PrismService";
import { formatLatency, renderToolName } from "@rodrigo-barraza/utilities-library";
import styles from "./ToolResultRenderersComponent.module.css";
import TimerBadgeComponent from "./TimerBadgeComponent";

// --- Types & Interfaces ------------------------------------------------

export interface WorkerActivity {
  phase?: string | null;
  currentTool?: string | null;
  toolCount?: number;
  iteration?: number;
  maxIterations?: number;
  phaseLabel?: string;
  phaseProgress?: number | null;
  tokPerSec?: number | null;
  toolNames?: string[] | Record<string, number> | Record<string, string>;
  description?: string;
  toolCalls?: import("../types/types").ToolCallEvent[];
}

export interface ToolArgs {
  path?: string;
  oldStr?: string;
  newStr?: string;
  pattern?: string;
  query?: string;
  url?: string;
  command?: string;
  code?: string;
  cwd?: string;
  source?: string;
  destination?: string;
  action?: string;
  commands?: string[];
  name?: string;
  members?: Array<{
    description?: string;
    [key: string]: unknown;
  }>;
  to?: string;
  agent_id?: string;
  [key: string]: unknown;
}

export interface ParsedToolResult {
  path?: string;
  content?: string;
  error?: string;
  created?: boolean;
  replacements?: number;
  count?: number;
  totalMatches?: number;
  matches?: Array<{
    file?: string;
    path?: string;
    line?: number | null;
    content?: string;
    text?: string;
    match?: string;
  }>;
  results?: Array<{
    title?: string;
    url?: string;
    link?: string;
    snippet?: string;
    name?: string;
  }>;
  entries?: Array<
    | string
    | {
        name: string;
        path?: string;
        type?: string;
        isDirectory?: boolean;
      }
  >;
  items?: Array<unknown>;
  files?: Array<
    | string
    | {
        path?: string;
        name?: string;
      }
  >;
  url?: string;
  title?: string;
  text?: string;
  markdown?: string;
  exitCode?: number;
  exit_code?: number;
  success?: boolean;
  stdout?: string;
  stderr?: string;
  branch?: string;
  clean?: boolean;
  status?:
    | string
    | Array<{
        path?: string;
        file?: string;
        status?: string;
        state?: string;
      }>;
  diff?: string;
  output?: string;
  commits?: Array<{
    hash?: string;
    sha?: string;
    message?: string;
    subject?: string;
    author?: string;
  }>;
  log?: Array<unknown>;
  source?: string;
  destination?: string;
  action?: string;
  screenshotRef?: string;
  screenshot?: string;
  mimeType?: string;
  elements?: Array<{
    selector: string;
    text?: string;
  }>;
  commandCount?: number;
  canvasSize?: string;
  succeeded?: number;
  failed?: number;
  members?: Array<{
    agent_id?: string;
    description?: string;
    status?: string;
    durationMs?: number;
    toolUses?: number;
    iterations?: number;
    summary?: string;
    result?: string;
    error?: string;
    toolNames?: string[] | Record<string, string>;
    messages?: Array<unknown>;
  }>;
  team?: string;
  agent_id?: string;
  result?: unknown;
  turtleEmbedUrl?: string;
  embedUrl?: string;
  sessionId?: string;
  turtleId?: string;
  width?: number;
  height?: number;
  asciiEmbedUrl?: string;
  ascii?: string;
  audio?: {
    data: string;
    mimeType?: string;
  };
  audioRef?: string;
  duration?: number;
  sampleCount?: number;
}

export interface RendererProps {
  result: unknown;
  args?: ToolArgs;
  streamingOutput?: string;
  language?: string;
  workerToolActivity?: Record<
    string,
    WorkerActivity | WorkerToolActivityItem
  > | null;
}

export interface ToolResultViewProps {
  toolCall: {
    id?: string;
    name: string;
    args?: ToolArgs;
    result?: unknown;
    status?: string;
  };
  streamingOutput?: string;
  workerToolActivity?: Record<
    string,
    WorkerActivity | WorkerToolActivityItem
  > | null;
}

// --- Helpers ----------------------------------------------------------

function basename(filePath: string | null | undefined): string {
  if (!filePath) return "";
  return filePath.split("/").pop() || filePath;
}

function extensionOf(filePath: string | null | undefined): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.substring(dot + 1).toLowerCase() : "";
}

function tryParse(result: unknown): ParsedToolResult | null {
  if (typeof result === "object" && result !== null) {
    return result as ParsedToolResult;
  }
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as ParsedToolResult;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Language hint for syntax highlighting based on file extension.
 */
const EXT_LANG = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  xml: "xml",
  toml: "toml",
  lua: "lua",
  c: "c",
  cpp: "cpp",
  h: "c",
};

// --- Status Badge -----------------------------------------------------

interface StatusBadgeProps {
  success: boolean;
  label: string;
}

function StatusBadge({ success, label }: StatusBadgeProps) {
  return (
    <span
      className={`${styles.statusBadge} ${success ? styles.statusSuccess : styles.statusError}`}
    >
      {success ? <Check size={10} /> : <XCircle size={10} />}
      {label}
    </span>
  );
}

// --- File Path Pill ---------------------------------------------------

interface PathPillProps {
  path: string;
  icon?: React.ComponentType<{ size?: number }>;
}

function PathPill({ path, icon }: PathPillProps) {
  const Icon = icon || FileText;
  return (
    <span className={styles.pathPill}>
      <Icon size={11} />
      <span className={styles.pathFull}>{path}</span>
    </span>
  );
}

// --- Collapsible Raw Result -------------------------------------------

function RawResultToggle({ result }: { result: unknown }) {
  const [show, setShow] = useState(false);
  if (!result) return null;

  const formatted =
    typeof result === "string"
      ? (() => {
          try {
            return (
              "```json\n" +
              JSON.stringify(JSON.parse(result), null, 2) +
              "\n```"
            );
          } catch {
            return "```\n" + result + "\n```";
          }
        })()
      : "```json\n" + JSON.stringify(result, null, 2) + "\n```";

  return (
    <div className={styles.rawToggle}>
      <button
        className={styles.rawToggleButton}
        onClick={() => setShow((v) => !v)}
      >
        <ChevronRight size={11} className={show ? styles.chevronOpen : ""} />
        <span>Raw Response</span>
      </button>
      {show && (
        <div className={styles.rawContent}>
          <MarkdownContent content={formatted} />
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible panel that shows all input arguments passed to a tool call.
 * Renders key-value pairs in a clean, readable format.
 */
function InputArgsToggle({ args }: { args?: ToolArgs }) {
  const [show, setShow] = useState(false);

  const entries = useMemo(() => {
    if (!args || typeof args !== "object") return [];
    return Object.entries(args).filter(
      ([, v]) => v !== undefined && v !== null,
    );
  }, [args]);

  if (entries.length === 0) return null;

  return (
    <div className={styles.inputArgsToggle}>
      <button
        className={styles.rawToggleButton}
        onClick={() => setShow((v) => !v)}
      >
        <ChevronRight size={11} className={show ? styles.chevronOpen : ""} />
        <span>Input</span>
        <span className={styles.inputArgsCount}>{entries.length}</span>
      </button>
      {show && (
        <div className={styles.inputArgsContent}>
          {entries.map(([key, value]) => {
            const isLong = typeof value === "string" && value.length > 80;
            const display =
              typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2);

            return (
              <div key={key} className={styles.inputArgRow}>
                <span className={styles.inputArgKey}>{key}</span>
                <span
                  className={`${styles.inputArgValue} ${isLong ? styles.inputArgValueLong : ""}`}
                >
                  {display}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Collapsible Output Result (what the model sees) -----------------

/**
 * Collapsible panel that shows the raw result returned to the model.
 * Helps users understand exactly what the agent receives back.
 */
function OutputResultToggle({ result }: { result: unknown }) {
  const [show, setShow] = useState(false);

  const display = useMemo(() => {
    if (result === undefined || result === null) return null;
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        return {
          type: "object",
          data: parsed,
          raw: JSON.stringify(parsed, null, 2),
        };
      } catch {
        return { type: "string", data: result, raw: result };
      }
    }
    if (typeof result === "object") {
      return {
        type: "object",
        data: result,
        raw: JSON.stringify(result, null, 2),
      };
    }
    return { type: "string", data: result, raw: String(result) };
  }, [result]);

  if (!display) return null;

  // Count meaningful entries for the badge
  const entryCount =
    display.type === "object" && !Array.isArray(display.data)
      ? Object.keys(display.data).length
      : null;

  return (
    <div className={styles.outputResultToggle}>
      <button
        className={styles.rawToggleButton}
        onClick={() => setShow((v) => !v)}
      >
        <ChevronRight size={11} className={show ? styles.chevronOpen : ""} />
        <span>Output</span>
        {entryCount != null && (
          <span className={styles.outputResultCount}>{entryCount}</span>
        )}
      </button>
      {show && (
        <div className={styles.outputResultContent}>
          {display.type === "object" && !Array.isArray(display.data) ? (
            Object.entries(display.data)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([key, value]) => {
                const isComplex = typeof value === "object" && value !== null;
                const valStr = isComplex
                  ? JSON.stringify(value, null, 2)
                  : String(value);
                const isLong = valStr.length > 80;

                return (
                  <div key={key} className={styles.outputArgRow}>
                    <span className={styles.outputArgKey}>{key}</span>
                    <span
                      className={`${styles.outputArgValue} ${isLong ? styles.outputArgValueLong : ""}`}
                    >
                      {valStr}
                    </span>
                  </div>
                );
              })
          ) : (
            <pre className={styles.outputRawPre}>{display.raw}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Normalize toolNames variants into a Record<string, number> for ToolBadgeRow.
 * Handles: string[] → { name: 1 }, Record<string, string> → { name: 1 },
 * Record<string, number> → pass through.
 */
function normalizeToolCounts(
  toolNames:
    | string[]
    | Record<string, number>
    | Record<string, string>
    | undefined,
): Record<string, number> | undefined {
  if (!toolNames) return undefined;
  if (Array.isArray(toolNames)) {
    const counts: Record<string, number> = {};
    for (const name of toolNames) {
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }
  // Record<string, number | string> — coerce string values to 1
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(toolNames)) {
    counts[key] = typeof value === "number" ? value : 1;
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDERERS
// ═══════════════════════════════════════════════════════════════════════

// -- 1. File Read ------------------------------------------------------

function FileReadRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const content = parsed.content || "";
  const _lang =
    (EXT_LANG as Record<string, string>)[extensionOf(filePath)] || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <PathPill path={filePath} icon={FileText} />
      </div>
      {content && (
        <pre className={styles.codeBlock}>
          <code>
            {content.length > 3000 ? content.slice(0, 3000) + "\n…" : content}
          </code>
        </pre>
      )}
    </div>
  );
}

// -- 2. File Write -----------------------------------------------------

function FileWriteRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const success = !parsed.error;

  const created = parsed.created;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <PathPill path={filePath} icon={FileText} />
        <StatusBadge
          success={success}
          label={created ? "Created" : "Written"}
        />
      </div>
      {parsed.error && <div className={styles.errorText}>{parsed.error}</div>}
    </div>
  );
}

// -- 3. String Replace -------------------------------------------------

function StrReplaceRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const success = !parsed.error;
  const replacements = parsed.replacements || parsed.count || 1;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <PathPill path={filePath} icon={FileText} />
        <StatusBadge
          success={success}
          label={`${replacements} replacement${replacements !== 1 ? "s" : ""}`}
        />
      </div>
      {args?.oldStr && args?.newStr && (
        <pre className={styles.diffBlock}>
          <code>
            <span className={styles.diffRemoved}>
              -{" "}
              {args.oldStr.length > 200
                ? args.oldStr.slice(0, 200) + "…"
                : args.oldStr}
            </span>
            {"\n"}
            <span className={styles.diffAdded}>
              +{" "}
              {args.newStr.length > 200
                ? args.newStr.slice(0, 200) + "…"
                : args.newStr}
            </span>
          </code>
        </pre>
      )}
      {parsed.error && <div className={styles.errorText}>{parsed.error}</div>}
    </div>
  );
}

// -- 4. Grep Search ----------------------------------------------------

function GrepSearchRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const matches = (parsed.matches || parsed.results || []) as Array<{
    file?: string;
    path?: string;
    line?: number | null;
    content?: string;
    text?: string;
    match?: string;
  }>;
  const totalMatches = parsed.totalMatches ?? parsed.count ?? matches.length;
  const pattern = args?.pattern || "";

  // Group by file
  const grouped: Record<
    string,
    Array<{
      file?: string;
      path?: string;
      line?: number | null;
      content?: string;
      text?: string;
      match?: string;
    }>
  > = {};
  for (const m of matches.slice(0, 30)) {
    const file = m.file || m.path || "unknown";
    if (!grouped[file]) grouped[file] = [];
    grouped[file].push(m);
  }

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Search size={13} />
        <span className={styles.rendererTitle}>
          {totalMatches} match{totalMatches !== 1 ? "es" : ""} for{" "}
          <code className={styles.inlineCode}>{pattern}</code>
        </span>
      </div>
      <div className={styles.grepList}>
        {Object.entries(grouped).map(([file, fileMatches]) => (
          <div key={file} className={styles.grepFile}>
            <span className={styles.grepFilePath}>{file}</span>
            {fileMatches.map((m, i) => (
              <div key={i} className={styles.grepLine}>
                {m.line != null && (
                  <span className={styles.grepLineNum}>{m.line}</span>
                )}
                <span className={styles.grepLineContent}>
                  {m.content || m.text || m.match || ""}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- 5. Directory List -------------------------------------------------

function DirectoryListRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const rawEntries = parsed.entries || parsed.items || parsed.files || [];
  type DirEntry =
    | string
    | { name?: string; path?: string; type?: string; isDirectory?: boolean };
  const entries: DirEntry[] = (
    Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries)
  ) as DirEntry[];
  const dirPath = parsed.path || args?.path || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <FolderTree size={13} />
        <span className={styles.rendererTitle}>
          {basename(dirPath) || "Directory"}
        </span>
      </div>
      <div className={styles.dirList}>
        {entries.slice(0, 40).map((entry, i) => {
          const name =
            typeof entry === "string" ? entry : entry.name || entry.path || "";
          const isDir =
            typeof entry === "object" &&
            (entry.type === "directory" || entry.isDirectory);
          return (
            <div key={i} className={styles.dirEntry}>
              {isDir ? (
                <Folder size={11} className={styles.dirIcon} />
              ) : (
                <File size={11} className={styles.fileIcon} />
              )}
              <span>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- 6. Glob Files -----------------------------------------------------

function GlobFilesRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  type FileEntry = string | { path?: string; name?: string };
  const files = (parsed.files || parsed.matches || []) as FileEntry[];
  const pattern = args?.pattern || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Search size={13} />
        <span className={styles.rendererTitle}>
          {files.length} file{files.length !== 1 ? "s" : ""} matching{" "}
          <code className={styles.inlineCode}>{pattern}</code>
        </span>
      </div>
      <div className={styles.dirList}>
        {files.slice(0, 40).map((f, i) => {
          const path = typeof f === "string" ? f : f.path || f.name || "";
          return (
            <div key={i} className={styles.dirEntry}>
              <File size={11} className={styles.fileIcon} />
              <span>{path}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- 7. Web Search -----------------------------------------------------

function WebSearchRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  type SearchResult = {
    title?: string;
    url?: string;
    link?: string;
    snippet?: string;
    name?: string;
  };
  const results = (parsed.results || parsed.items || []) as SearchResult[];
  const query = args?.query || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Globe size={13} />
        <span className={styles.rendererTitle}>
          {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;
          {query}&rdquo;
        </span>
      </div>
      <div className={styles.searchResults}>
        {results.slice(0, 8).map((r, i) => (
          <div key={i} className={styles.searchResult}>
            <a
              href={r.url || r.link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.searchLink}
            >
              {r.title || r.name || r.url}
            </a>
            {r.snippet && <p className={styles.searchSnippet}>{r.snippet}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- 8. Fetch URL ------------------------------------------------------

function FetchUrlRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const url = parsed.url || args?.url || "";
  const title = parsed.title || "";
  const content = parsed.content || parsed.text || parsed.markdown || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Globe size={13} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.searchLink}
        >
          {title || url}
        </a>
      </div>
      {content && (
        <pre className={styles.codeBlock}>
          <code>
            {content.length > 2000 ? content.slice(0, 2000) + "\n…" : content}
          </code>
        </pre>
      )}
    </div>
  );
}

// -- 8.5. Audio Generator Renderer --------------------------------------

function AudioGeneratorRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const audioSource = useMemo(() => {
    if (parsed.audioRef) {
      return PrismService.getFileUrl(parsed.audioRef);
    }
    if (!parsed.audio?.data) return null;
    const mimeType = parsed.audio.mimeType || "audio/wav";
    return `data:${mimeType};base64,${parsed.audio.data}`;
  }, [parsed]);

  const totalDuration = parsed.duration || 0;
  const sampleCount = parsed.sampleCount || 0;
  const hasError = !!parsed.error;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Music size={13} />
        <span className={styles.rendererTitle}>
          {args?.presetEffect
            ? `Sound Preset: '${args.presetEffect}'`
            : `Synth (${args?.waveform || "sine"} · ${totalDuration.toFixed(2)}s · ${sampleCount.toLocaleString()} samples)`}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : `${totalDuration.toFixed(2)}s`}
        />
      </div>
      {hasError && <div className={styles.errorText}>{parsed.error}</div>}
      {audioSource && <AudioPlayerRecorderComponent src={audioSource} />}
    </div>
  );
}

// -- 9. Terminal (Shell/Python/JS) -------------------------------------

const PROMPT_PREFIXES = { bash: "$ ", python: ">>> ", javascript: "> " };
const CONTINUATION_PREFIXES = { python: "... ", javascript: ".. " };
const DEFAULT_CWD = { bash: "/tmp", python: "python3", javascript: "node" };

function formatInputPrompt(
  input: string | null,
  language: string | undefined,
  cwd: string | null,
) {
  if (!input) return "";
  const prompt =
    (PROMPT_PREFIXES as Record<string, string>)[language || ""] || "$ ";
  const contPrompt =
    (CONTINUATION_PREFIXES as Record<string, string>)[language || ""] || "  ";
  const lines = input.split("\n");
  const resolvedCwd =
    cwd || (DEFAULT_CWD as Record<string, string>)[language || ""] || "";
  const pathPrefix = resolvedCwd ? `${resolvedCwd} ` : "";
  return lines
    .map(
      (line: string, i: number) =>
        `${i === 0 ? pathPrefix + prompt : contPrompt}${line}`,
    )
    .join("\n");
}

// ── ANSI escape-code → React span parser ──────────────────────
const ANSI_RE = /\x1b\[([0-9;]*)m/g;

const ANSI_COLORS = [
  null, // 0 – default
  "#ef4444", // 1 – red
  "#22c55e", // 2 – green
  "#eab308", // 3 – yellow
  "#3b82f6", // 4 – blue
  "#a855f7", // 5 – magenta
  "#06b6d4", // 6 – cyan
  "#d4d4d8", // 7 – white
];

const ANSI_BRIGHT_COLORS = [
  "#71717a", // 0 – bright black (gray)
  "#f87171", // 1 – bright red
  "#4ade80", // 2 – bright green
  "#fde047", // 3 – bright yellow
  "#60a5fa", // 4 – bright blue
  "#c084fc", // 5 – bright magenta
  "#22d3ee", // 6 – bright cyan
  "#ffffff", // 7 – bright white
];

function ansi256ToHex(n: number): string | null | undefined {
  if (n < 8) return ANSI_COLORS[n];
  if (n < 16) return ANSI_BRIGHT_COLORS[n - 8];
  if (n < 232) {
    const index = n - 16;
    const r = Math.floor(index / 36) * 51;
    const g = (Math.floor(index / 6) % 6) * 51;
    const b = (index % 6) * 51;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  const grayscaleValue = (n - 232) * 10 + 8;
  return `#${grayscaleValue.toString(16).padStart(2, "0")}${grayscaleValue.toString(16).padStart(2, "0")}${grayscaleValue.toString(16).padStart(2, "0")}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function parseAnsi(text: string): string | React.ReactNode | React.ReactNode[] {
  if (!text.includes("\x1b")) return text;
  const parts = [];
  let lastIndex = 0;
  let key = 0;
  let color = null,
    bgColor = null,
    bold = false,
    dim = false,
    italic = false,
    underline = false;
  let match;
  ANSI_RE.lastIndex = 0;
  while ((match = ANSI_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (color || bgColor || bold || dim || italic || underline) {
        const style: React.CSSProperties = {};
        if (color) style.color = color;
        if (bgColor) style.backgroundColor = bgColor;
        if (bold) style.fontWeight = 700;
        if (dim) style.opacity = 0.6;
        if (italic) style.fontStyle = "italic";
        if (underline) style.textDecoration = "underline";
        parts.push(
          <span key={key++} style={style}>
            {chunk}
          </span>,
        );
      } else {
        parts.push(chunk);
      }
    }
    lastIndex = match.index + match[0].length;
    const codes = match[1] ? match[1].split(";").map(Number) : [0];
    for (let i = 0; i < codes.length; i++) {
      const colorCode = codes[i];
      if (colorCode === 0) {
        color = null;
        bgColor = null;
        bold = false;
        dim = false;
        italic = false;
        underline = false;
      } else if (colorCode === 1) bold = true;
      else if (colorCode === 2) dim = true;
      else if (colorCode === 3) italic = true;
      else if (colorCode === 4) underline = true;
      else if (colorCode === 22) {
        bold = false;
        dim = false;
      } else if (colorCode === 23) italic = false;
      else if (colorCode === 24) underline = false;
      else if (colorCode === 39) color = null;
      else if (colorCode === 49) bgColor = null;
      else if (colorCode >= 30 && colorCode <= 37)
        color = ANSI_COLORS[colorCode - 30];
      else if (colorCode >= 40 && colorCode <= 47)
        bgColor = ANSI_COLORS[colorCode - 40];
      else if (colorCode >= 90 && colorCode <= 97)
        color = ANSI_BRIGHT_COLORS[colorCode - 90];
      else if (colorCode >= 100 && colorCode <= 107)
        bgColor = ANSI_BRIGHT_COLORS[colorCode - 100];
      else if (colorCode === 38 && codes[i + 1] === 5 && codes[i + 2] != null) {
        color = ansi256ToHex(codes[i + 2]);
        i += 2;
      } else if (
        colorCode === 48 &&
        codes[i + 1] === 5 &&
        codes[i + 2] != null
      ) {
        bgColor = ansi256ToHex(codes[i + 2]);
        i += 2;
      }
    }
  }
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (color || bgColor || bold || dim || italic || underline) {
      const style: React.CSSProperties = {};
      if (color) style.color = color;
      if (bgColor) style.backgroundColor = bgColor;
      if (bold) style.fontWeight = 700;
      if (dim) style.opacity = 0.6;
      if (italic) style.fontStyle = "italic";
      if (underline) style.textDecoration = "underline";
      parts.push(
        <span key={key++} style={style}>
          {chunk}
        </span>,
      );
    } else {
      parts.push(chunk);
    }
  }
  return parts.length === 1 ? parts[0] : parts;
}

function detectTerminalLevel(text: string): string | null {
  const clean = stripAnsi(text);
  if (/\bERR(?:OR)?\b/i.test(clean)) return "error";
  if (/\bWARN(?:ING)?\b/i.test(clean)) return "warn";
  if (/\bINFO\b/i.test(clean)) return "info";
  if (/\b(?:OK|SUCCESS|PASS(?:ED)?)\b/i.test(clean)) return "success";
  if (/\bDBG|DEBUG\b/i.test(clean)) return "debug";
  return null;
}

const TERM_LEVEL_CLASS = {
  error: styles.termLineError,
  warn: styles.termLineWarn,
  success: styles.termLineSuccess,
};

const TERM_CONTENT_LEVEL_CLASS = {
  error: styles.termContentError,
  warn: styles.termContentWarn,
  info: styles.termContentInfo,
  success: styles.termContentSuccess,
  debug: styles.termContentDebug,
};

function TerminalRenderer({
  result,
  args,
  streamingOutput,
  language,
}: RendererProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const input = args?.command || args?.code || null;
  const cwd = args?.cwd || null;
  const isStreaming = !result;
  const output = streamingOutput || "";

  // Parse final result for exit code
  const parsed = tryParse(result);
  const exitCode = parsed?.exitCode ?? parsed?.exit_code;
  const success = parsed?.success;
  const stdout = parsed?.stdout || parsed?.output || "";
  const stderr = parsed?.stderr || "";
  const parsedError = parsed?.error || "";
  const displayOutput = isStreaming
    ? output
    : stdout || stderr || parsedError || output;

  const formattedInput = formatInputPrompt(input, language, cwd);

  // Split output into lines for per-line rendering
  const outputLines = useMemo(() => {
    if (!displayOutput) return [];
    return displayOutput.split("\n");
  }, [displayOutput]);

  const inputLines = useMemo(() => {
    if (!formattedInput) return [];
    return formattedInput.split("\n");
  }, [formattedInput]);

  const totalLines = inputLines.length + outputLines.length;

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      (bodyRef.current as HTMLElement).scrollTop = (
        bodyRef.current as HTMLElement
      ).scrollHeight;
    }
  }, [displayOutput, autoScroll]);

  // Detect user scroll position
  const handleScroll = useCallback(() => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  if (!displayOutput && !formattedInput)
    return <RawResultToggle result={result} />;

  return (
    <div className={styles.terminalBlock}>
      <div className={styles.terminalHeader}>
        <Terminal size={11} />
        <span>{language || "terminal"}</span>
        {isStreaming && <span className={styles.terminalLive}>● live</span>}
        {exitCode != null && (
          <StatusBadge success={exitCode === 0} label={`exit ${exitCode}`} />
        )}
        {exitCode == null && success === false && (
          <StatusBadge success={false} label="error" />
        )}
        {totalLines > 0 && (
          <span className={styles.terminalLineCount}>
            {totalLines.toLocaleString()}
          </span>
        )}
      </div>
      <div
        ref={bodyRef}
        className={styles.terminalBody}
        onScroll={handleScroll}
      >
        {/* Input command lines */}
        {inputLines.map((line: string, i: number) => (
          <div key={`in-${i}`} className={styles.termLine}>
            <span className={styles.termLineNum}>{i + 1}</span>
            <span
              className={`${styles.termLineContent} ${styles.terminalInput}`}
            >
              {line}
            </span>
          </div>
        ))}
        {/* Output lines */}
        {outputLines.map((line: string, i: number) => {
          const level = detectTerminalLevel(line);
          const lineNum = inputLines.length + i + 1;
          return (
            <div
              key={`out-${i}`}
              className={`${styles.termLine} ${level ? (TERM_LEVEL_CLASS as Record<string, string>)[level] || "" : ""}`}
            >
              <span className={styles.termLineNum}>{lineNum}</span>
              <span
                className={`${styles.termLineContent} ${level ? (TERM_CONTENT_LEVEL_CLASS as Record<string, string>)[level] || "" : ""}`}
              >
                {parseAnsi(line)}
              </span>
            </div>
          );
        })}
        {isStreaming && (
          <div className={styles.termLine}>
            <span className={styles.termLineNum} />
            <span className={styles.termLineContent}>
              <span className={styles.terminalCursor}>▊</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed || !parsed.success || !(parsed as any).timer) {
    return <RawResultToggle result={result} />;
  }

  const timer = (parsed as any).timer;
  return (
    <div className={styles.rendererBlock}>
      <TimerBadgeComponent
        timerId={timer.id}
        firesAt={timer.firesAt}
        prompt={timer.prompt}
        mode={timer.mode}
        status="active"
        readOnly={true}
      />
    </div>
  );
}

function GitStatusRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const files = (parsed.files || parsed.status || []) as Array<{
    path?: string;
    file?: string;
    status?: string;
    state?: string;
  }>;
  const branch = parsed.branch || "";
  const clean = parsed.clean || files.length === 0;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <GitBranch size={13} />
        <span className={styles.rendererTitle}>{branch || "git status"}</span>
        <StatusBadge
          success={clean}
          label={clean ? "Clean" : `${files.length} changed`}
        />
      </div>
      {!clean && (
        <div className={styles.dirList}>
          {files.slice(0, 30).map((f, i) => {
            const name = typeof f === "string" ? f : f.path || f.file || "";
            const status =
              typeof f === "object" && f !== null
                ? f.status || f.state || ""
                : "";
            return (
              <div key={i} className={styles.dirEntry}>
                {status && <span className={styles.gitStatus}>{status}</span>}
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GitDiffRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const diff =
    parsed.diff || parsed.output || (typeof result === "string" ? result : "");

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <GitBranch size={13} />
        <span className={styles.rendererTitle}>git diff</span>
      </div>
      {diff && (
        <pre className={styles.diffBlock}>
          <code>
            {diff
              .split("\n")
              .slice(0, 80)
              .map((line: string, i: number) => {
                let cls = "";
                if (line.startsWith("+") && !line.startsWith("+++"))
                  cls = styles.diffAdded;
                else if (line.startsWith("-") && !line.startsWith("---"))
                  cls = styles.diffRemoved;
                else if (line.startsWith("@@")) cls = styles.diffHunk;
                return (
                  <span key={i} className={cls}>
                    {line}
                    {"\n"}
                  </span>
                );
              })}
          </code>
        </pre>
      )}
    </div>
  );
}

function GitLogRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;
  type CommitEntry = {
    hash?: string;
    sha?: string;
    message?: string;
    subject?: string;
    author?: string;
  };
  const commits = (parsed.commits || parsed.log || []) as CommitEntry[];

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <GitBranch size={13} />
        <span className={styles.rendererTitle}>
          {commits.length} commit{commits.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className={styles.gitLog}>
        {commits.slice(0, 15).map((c, i) => (
          <div key={i} className={styles.gitCommit}>
            <span className={styles.gitHash}>
              {(c.hash || c.sha || "").slice(0, 7)}
            </span>
            <span className={styles.gitMsg}>
              {c.message || c.subject || ""}
            </span>
            {c.author && <span className={styles.gitAuthor}>{c.author}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- 11. File Delete / Move --------------------------------------------

function FileDeleteRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;
  const filePath = parsed.path || args?.path || "";
  const success = !parsed.error;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Trash2 size={13} />
        <PathPill path={filePath} />
        <StatusBadge success={success} label={success ? "Deleted" : "Failed"} />
      </div>
      {parsed.error && <div className={styles.errorText}>{parsed.error}</div>}
    </div>
  );
}

function FileMoveRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;
  const source = parsed.source || args?.source || "";
  const destination = parsed.destination || args?.destination || "";
  const success = !parsed.error;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <ArrowRight size={13} />
        <PathPill path={source} />
        <ArrowRight size={10} className={styles.moveArrow} />
        <PathPill path={destination} />
        <StatusBadge success={success} label={success ? "Moved" : "Failed"} />
      </div>
      {parsed.error && <div className={styles.errorText}>{parsed.error}</div>}
    </div>
  );
}

// -- 12. Browser Action ------------------------------------------------------

const BROWSER_ACTION_LABELS = {
  navigate: "Navigate",
  screenshot: "Screenshot",
  click: "Click",
  type: "Type",
  scroll: "Scroll",
  evaluate: "Evaluate JS",
  get_content: "Get Content",
  get_elements: "Get Elements",
  wait: "Wait",
  close: "Close",
};

function BrowserActionRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const action = parsed.action || args?.action || "";
  const label =
    (BROWSER_ACTION_LABELS as Record<string, string>)[action] || action;
  const hasError = !!parsed.error;

  // Resolve screenshot ref (minio:// or base64 fallback)
  let screenshotSrc = null;
  if (parsed.screenshotRef) {
    screenshotSrc = PrismService.getFileUrl(parsed.screenshotRef);
  } else if (parsed.screenshot) {
    screenshotSrc = `data:${parsed.mimeType || "image/png"};base64,${parsed.screenshot}`;
  }

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Monitor size={13} />
        <span className={styles.rendererTitle}>{label}</span>
        {parsed.url && (
          <a
            href={parsed.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.searchLink}
          >
            {parsed.title || parsed.url}
          </a>
        )}

        {hasError && <StatusBadge success={false} label="Error" />}
      </div>

      {hasError && <div className={styles.errorText}>{parsed.error}</div>}

      {screenshotSrc && (
        <div className={styles.browserScreenshot}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotSrc}
            alt={`Screenshot of ${parsed.url || "page"}`}
            className={styles.browserScreenshotImg}
          />
        </div>
      )}

      {parsed.content && (
        <pre className={styles.codeBlock}>
          <code>
            {parsed.content.length > 3000
              ? parsed.content.slice(0, 3000) + "\n\u2026"
              : parsed.content}
          </code>
        </pre>
      )}

      {parsed.result !== undefined && action === "evaluate" && (
        <pre className={styles.codeBlock}>
          <code>{String(parsed.result)}</code>
        </pre>
      )}

      {action === "get_elements" && parsed.elements && (
        <div className={styles.dirList}>
          {parsed.elements
            .slice(0, 30)
            .map((element: { selector: string; text?: string }, i: number) => (
              <div key={i} className={styles.dirEntry}>
                <code className={styles.inlineCode}>{element.selector}</code>

                {element.text && <span>{element.text}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// -- 13. Turtle Graphics -----------------------------------------------------

function TurtleDrawEmbed({ src, title }: { src: string; title: string }) {
  return (
    <div className={styles.turtleEmbedWrapper}>
      <iframe
        src={src}
        className={styles.turtleEmbedFrame}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function TurtleDrawRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const commandCount = parsed.commandCount || args?.commands?.length || 0;
  const canvasSize = parsed.canvasSize || "800x600";
  const embedUrl = parsed.turtleEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <span style={{ fontSize: 13 }}>🐢</span>
        <span className={styles.rendererTitle}>
          Turtle Drawing — {commandCount} command{commandCount !== 1 ? "s" : ""}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : canvasSize}
        />
      </div>
      {hasError && <div className={styles.errorText}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <TurtleDrawEmbed src={embedUrl} title="Turtle Drawing" />
      )}
    </div>
  );
}

function AsciiImageRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const width = parsed.width || (args?.width ? Number(args.width) : 100);
  const height = parsed.height || 0;
  const embedUrl = parsed.asciiEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <span style={{ fontSize: 13 }}>🎨</span>
        <span className={styles.rendererTitle}>
          ASCII Art — {String(width)}×{String(height)}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Rendered"}
        />
      </div>
      {hasError && <div className={styles.errorText}>{parsed.error}</div>}
      {!hasError && parsed.ascii ? (
        <div className={styles.asciiArtContainer}>
          <pre className={styles.asciiArtPre}>
            <code>{parsed.ascii}</code>
          </pre>
        </div>
      ) : (
        !hasError &&
        embedUrl && <TurtleDrawEmbed src={embedUrl} title="ASCII Art" />
      )}
    </div>
  );
}

function EmojiCombinationRenderer({ result }: RendererProps) {
  const parsed = tryParse(result) as any;
  if (!parsed || !parsed.success) return <RawResultToggle result={result} />;

  const {
    leftEmoji,
    leftEmojiCodepoint,
    rightEmoji,
    rightEmojiCodepoint,
    gStaticUrl,
    alt,
    date,
    isLatest,
    gBoardOrder,
  } = parsed;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <span style={{ fontSize: 13 }}>🍳</span>
        <span className={styles.rendererTitle}>Emoji Mashup</span>
        {isLatest && (
          <StatusBadge success={true} label="Latest GBoard Design" />
        )}
      </div>
      <div className={styles.emojiCombineContainer}>
        <div className={styles.emojiLeftRightGrid}>
          <div
            className={styles.emojiBubble}
            title={`Codepoint: ${leftEmojiCodepoint}`}
          >
            <span className={styles.bubbleEmojiChar}>{leftEmoji}</span>
          </div>
          <span className={styles.combinePlus}>+</span>
          <div
            className={styles.emojiBubble}
            title={`Codepoint: ${rightEmojiCodepoint}`}
          >
            <span className={styles.bubbleEmojiChar}>{rightEmoji}</span>
          </div>
          <span className={styles.combineEquals}>=</span>
        </div>
        <div className={styles.emojiMergedContainer}>
          <div className={styles.mergedBackdropGlow} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gStaticUrl}
            alt={alt || "Emoji Kitchen mashup"}
            className={styles.mergedEmojiImage}
            title={alt}
          />
        </div>
      </div>
      <div className={styles.emojiMetaRow}>
        <span className={styles.metaItem}>Order: {gBoardOrder || "N/A"}</span>
        <span className={styles.metaSeparator}>·</span>
        <span className={styles.metaItem}>Date: {date || "N/A"}</span>
        <span className={styles.metaSeparator}>·</span>
        <a
          href={gStaticUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={`mashup_${leftEmojiCodepoint}_${rightEmojiCodepoint}.png`}
          className={styles.downloadLink}
          style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          <Download size={11} />
          Download PNG
        </a>
      </div>
    </div>
  );
}

function EmojiCombinationsRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result) as any;
  if (!parsed || !parsed.success) return <RawResultToggle result={result} />;

  const baseEmoji = parsed.emoji || args?.emoji || "";
  const count = parsed.count || 0;
  const combinations = parsed.combinations || [];

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <span style={{ fontSize: 13 }}>🧑‍🍳</span>
        <span className={styles.rendererTitle}>
          {baseEmoji} Mashup Kitchen — {count} Options
        </span>
      </div>
      <div className={styles.emojiGridScrollContainer}>
        <div className={styles.emojiCombosGrid}>
          {combinations.map((option: any, index: number) => {
            const combo = option.combination;
            return (
              <div key={index} className={styles.comboOptionCard}>
                <div className={styles.optionCardHeader}>
                  <span className={styles.miniEmoji}>{baseEmoji}</span>
                  <span className={styles.miniPlus}>+</span>
                  <span className={styles.miniEmoji}>{option.emoji}</span>
                </div>
                <div className={styles.optionCardImageContainer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={combo.gStaticUrl}
                    alt={combo.alt}
                    className={styles.miniMergedImage}
                    loading="lazy"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -- 14. Coordinator Tools ---------------------------------------------------

/**
 * Mini status bar for an individual spawned worker agent.
 * Uses the shared StatusBarComponent.
 */
function WorkerStatusBar({ activity }: { activity: WorkerActivity | null }) {
  if (!activity) return null;
  const {
    currentTool,
    toolCount = 0,
    iteration = 0,
    maxIterations,
    phase,
  } = activity;
  const isTerminal = phase === "complete" || phase === "failed";
  const isToolActive = !!currentTool;
  const hasPhase = !!phase && !isTerminal;
  const isActive = isToolActive || hasPhase;
  const toolLabel = currentTool ? renderToolName(currentTool) : null;

  // Derive the effective phase for StatusBarComponent:
  // - Tool executing → "processing" (amber — actively running a tool)
  // - Terminal → null (idle)
  // - Otherwise → actual model phase (generating, thinking, processing, etc.)
  const effectivePhase = isToolActive
    ? "processing"
    : isTerminal
      ? null
      : phase;
  // Show tool name when executing tools, phase progress label for processing/loading
  const label = isToolActive ? toolLabel : activity.phaseLabel || undefined;
  // Tool calls show a wrench emoji, phase uses default icons
  const icon = isToolActive ? "🔧" : undefined;
  // Progress (0-1) from LM Studio prompt processing / model loading
  const progress =
    effectivePhase === "processing" || effectivePhase === "loading"
      ? (activity.phaseProgress ?? null)
      : null;

  // Idle label reflects terminal state or tool count
  const idleLabel = isTerminal
    ? phase === "failed"
      ? "Worker failed"
      : `Done · ${toolCount} tool${toolCount !== 1 ? "s" : ""} used`
    : toolCount > 0
      ? `${toolCount} tools used`
      : "Worker idle";

  // Per-worker tok/s from the backend's burst-scoped generation progress.
  // Use the pre-computed value directly — it's authoritative from the
  // CoordinatorService which tracks per-worker burst counters independently.
  let tokPerSec = null;
  if (!isToolActive && (phase === "generating" || phase === "thinking")) {
    tokPerSec = activity.tokPerSec ?? null;
  }

  return (
    <StatusBarComponent
      active={isActive}
      variant="worker"
      phase={effectivePhase}
      label={label}
      icon={icon}
      progress={progress}
      tokPerSec={tokPerSec}
      iteration={iteration}
      maxIterations={maxIterations}
      idleIcon={<Users size={10} />}
      idleLabel={idleLabel}
    />
  );
}

function TeamCreateRenderer({
  result,
  args,
  workerToolActivity,
}: RendererProps) {
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(
    new Set(),
  );
  const parsed = tryParse(result);

  const rawArgMembers = args?.members;
  const argMembers = Array.isArray(rawArgMembers) ? rawArgMembers : [];
  const rawResultMembers = parsed?.members;
  const resultMembers = Array.isArray(rawResultMembers) ? rawResultMembers : [];
  const teamName = args?.name || parsed?.team || "";

  const hasActiveWorkers = useMemo(() => {
    if (!workerToolActivity) return false;
    return Object.values(workerToolActivity).some(
      (activity) =>
        activity.phase === "generating" || activity.phase === "thinking",
    );
  }, [workerToolActivity]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasActiveWorkers) return;
    const intervalId = setInterval(() => setTick((tick) => tick + 1), 500);
    return () => clearInterval(intervalId);
  }, [hasActiveWorkers]);

  const getWorkerTokPerSec = (activity: WorkerActivity | null) => {
    if (!activity?.tokPerSec) return null;
    if (activity.phase !== "generating" && activity.phase !== "thinking")
      return null;
    return activity.tokPerSec;
  };

  const orderedWorkerIds = useMemo(() => {
    if (!workerToolActivity) return [];
    return Object.keys(workerToolActivity);
  }, [workerToolActivity]);

  const getActivity = (
    member: { agent_id?: string; description?: string; [key: string]: unknown },
    memberIndex: number,
  ) => {
    if (!workerToolActivity) return null;
    if (member.agent_id) return workerToolActivity[member.agent_id] || null;
    if (memberIndex != null && orderedWorkerIds[memberIndex]) {
      return workerToolActivity[orderedWorkerIds[memberIndex]] || null;
    }
    if (member.description) {
      return (
        Object.values(workerToolActivity).find(
          (activity) =>
            activity.description &&
            member.description &&
            activity.description.includes(member.description),
        ) || null
      );
    }
    return null;
  };

  const toggleMember = (index: number) => {
    setExpandedMembers((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const hasError = !!parsed?.error;
  const succeeded =
    parsed?.succeeded ??
    resultMembers.filter((member) => member.status === "completed").length;
  const failed =
    parsed?.failed ??
    resultMembers.filter((member) => member.status === "failed").length;
  const allDone = parsed
    ? resultMembers.every(
        (member) =>
          member.status === "completed" ||
          member.status === "failed" ||
          member.status === "stopped",
      )
    : false;
  const teamSuccess = failed === 0 && !hasError;

  const membersList = parsed
    ? resultMembers
    : argMembers.map((member) => ({
        agent_id: undefined,
        description: member.description || "",
        status: "running",
        durationMs: 0,
        toolUses: 0,
        iterations: 0,
        toolNames: undefined,
        messages: undefined,
        result: undefined,
        error: undefined,
        summary: "",
      }));

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Users size={13} />
        <span className={styles.rendererTitle}>
          Team <strong>{teamName}</strong> — {membersList.length} worker
          {membersList.length !== 1 ? "s" : ""}
        </span>
        <StatusBadge
          success={!parsed ? true : teamSuccess}
          label={
            !parsed
              ? "running"
              : allDone
                ? `${succeeded} done${failed ? `, ${failed} failed` : ""}`
                : "running"
          }
        />
      </div>

      {hasError && <div className={styles.errorText}>{parsed.error}</div>}

      {membersList.map((member, index) => {
        const activity = getActivity(member, index);
        const isTerminal =
          member.status === "completed" ||
          member.status === "failed" ||
          member.status === "stopped";
        const isCompleted = member.status === "completed";
        const isFailed = member.status === "failed";
        const memberExpanded = expandedMembers.has(index);
        const durationLabel = member.durationMs
          ? formatLatency(Number(member.durationMs) / 1000)
          : null;
        const tokPerSec = !isTerminal ? getWorkerTokPerSec(activity) : null;

        const toolNames = activity?.toolNames || member.toolNames;
        const toolUsesCount = !isTerminal
          ? (activity?.toolCount ?? 0)
          : (member.toolUses ?? 0);
        const iterationsCount = !isTerminal
          ? (activity?.iteration ?? 0)
          : (member.iterations ?? 0);

        return (
          <div
            key={index}
            className={styles.rendererBlock}
            style={{ marginTop: 4 }}
          >
            <div className={styles.rendererHeader}>
              <span className={styles.rendererTitle}>
                Worker {index + 1}: <strong>{member.description}</strong>
              </span>
              {tokPerSec !== null && (
                <span className={styles.workerSpeedBadge}>
                  ⚡ {tokPerSec.toFixed(1)} tok/s
                </span>
              )}
              <StatusBadge
                success={!isTerminal ? true : isCompleted}
                label={
                  !isTerminal
                    ? activity?.phase || member.status || "running"
                    : member.status || "unknown"
                }
              />
            </div>

            {toolNames && Object.keys(toolNames).length > 0 && (
              <ToolBadgeRow
                tools={normalizeToolCounts(toolNames)}
                activeTool={!isTerminal ? activity?.currentTool : null}
                variant="compact"
              />
            )}

            {member.error && (
              <div className={styles.errorText}>{member.error}</div>
            )}

            {activity && !isTerminal && <WorkerStatusBar activity={activity} />}

            <div className={styles.workerResultCard}>
              <button
                className={styles.workerResultToggle}
                onClick={() => toggleMember(index)}
              >
                <Zap size={12} />
                <span className={styles.workerResultSummary}>
                  {member.summary ||
                    (!isTerminal
                      ? activity?.currentTool
                        ? `Executing ${renderToolName(activity.currentTool)}...`
                        : "Worker running..."
                      : isCompleted
                        ? "Worker completed"
                        : isFailed
                          ? "Worker failed"
                          : "Worker finished")}
                </span>
                {durationLabel && (
                  <span className={styles.workerResultMeta}>
                    {durationLabel}
                  </span>
                )}
                {toolUsesCount > 0 && (
                  <span className={styles.workerResultMeta}>
                    {toolUsesCount} tools
                  </span>
                )}
                {iterationsCount > 0 && (
                  <span className={styles.workerResultMeta}>
                    {iterationsCount} iteration
                    {iterationsCount !== 1 ? "s" : ""}
                  </span>
                )}
                {memberExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </button>
              {memberExpanded && (
                <div className={styles.workerResultBody}>
                  {isTerminal && (member.messages?.length ?? 0) > 0 ? (
                    <Suspense fallback={null}>
                      <LazyMessageList
                        messages={prepareDisplayMessages(
                          member.messages as import("../types/types").Message[],
                        )}
                        readOnly
                      />
                    </Suspense>
                  ) : !isTerminal &&
                    activity?.toolCalls &&
                    activity.toolCalls.length > 0 ? (
                    <div style={{ padding: "4px 0" }}>
                      <ToolCallsBlockComponent
                        toolCalls={activity.toolCalls}
                        workerToolActivity={workerToolActivity}
                      />
                    </div>
                  ) : member.result ? (
                    <MarkdownContent content={String(member.result)} />
                  ) : (
                    <div
                      style={{
                        fontStyle: "italic",
                        opacity: 0.5,
                        fontSize: "0.85rem",
                        padding: "4px 8px",
                      }}
                    >
                      No messages or tool calls yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SendMessageRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const agentId = args?.to || parsed.agent_id || "";
  const status =
    (typeof parsed.status === "string" ? parsed.status : null) || "unknown";
  const hasError = !!parsed.error;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <MessageSquare size={13} />
        <span className={styles.rendererTitle}>
          Message → <code className={styles.inlineCode}>{agentId}</code>
        </span>
        <StatusBadge success={!hasError} label={status} />
      </div>

      {hasError && <div className={styles.errorText}>{parsed.error}</div>}
    </div>
  );
}

function StopAgentRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const agentId = args?.agent_id || parsed.agent_id || "";
  const hasError = !!parsed.error;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <StopCircle size={13} />
        <span className={styles.rendererTitle}>
          Stopped: <code className={styles.inlineCode}>{agentId}</code>
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Failed" : "Stopped"}
        />
      </div>
      {hasError && <div className={styles.errorText}>{parsed.error}</div>}
    </div>
  );
}

// -- 14. Generic Fallback ----------------------------------------------------

function GenericRenderer({ result }: RendererProps) {
  return <RawResultToggle result={result} />;
}

// ═══════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════

const TOOL_RESULT_REGISTRY = {
  // File operations
  read_file: { Renderer: FileReadRenderer },
  write_file: { Renderer: FileWriteRenderer },
  str_replace_file: { Renderer: StrReplaceRenderer },
  patch_file: { Renderer: FileWriteRenderer },
  read_multi_file: { Renderer: GenericRenderer },
  file_info: { Renderer: GenericRenderer },
  file_diff: { Renderer: GitDiffRenderer }, // reuses diff renderer
  move_file: { Renderer: FileMoveRenderer },
  delete_file: { Renderer: FileDeleteRenderer },

  // Search
  grep_search: { Renderer: GrepSearchRenderer },
  glob_files: { Renderer: GlobFilesRenderer },
  list_directory: { Renderer: DirectoryListRenderer },

  // Web
  search_web: { Renderer: WebSearchRenderer },
  // TODO(cleanup): Remove legacy name once historical sessions have aged out
  web_search: { Renderer: WebSearchRenderer },
  read_web_page: { Renderer: FetchUrlRenderer },

  // Execution
  execute_shell: { Renderer: TerminalRenderer, language: "bash" },
  execute_python: { Renderer: TerminalRenderer, language: "python" },
  execute_javascript: { Renderer: TerminalRenderer, language: "javascript" },
  run_command: { Renderer: TerminalRenderer, language: "bash" },
  schedule: { Renderer: ScheduleRenderer },

  // Git
  git_status: { Renderer: GitStatusRenderer },
  git_diff: { Renderer: GitDiffRenderer },
  git_log: { Renderer: GitLogRenderer },

  // Project
  project_summary: { Renderer: GenericRenderer },

  // Browser
  browser_action: { Renderer: BrowserActionRenderer },

  // Turtle Graphics
  draw_turtle: { Renderer: TurtleDrawRenderer },

  // Image to ASCII Art
  convert_image_to_ascii: { Renderer: AsciiImageRenderer },

  // Emoji Kitchen
  get_emoji_combination: { Renderer: EmojiCombinationRenderer },
  get_emoji_combinations: { Renderer: EmojiCombinationsRenderer },

  // Audio Generation
  generate_audio: { Renderer: AudioGeneratorRenderer },

  // Coordinator
  create_team: { Renderer: TeamCreateRenderer },
  // TODO(cleanup): Remove legacy name once historical sessions have aged out
  team_create: { Renderer: TeamCreateRenderer },
  send_message: { Renderer: SendMessageRenderer },
  stop_agent: { Renderer: StopAgentRenderer },
};

/**
 * Resolve the appropriate result renderer for a tool call.
 */
export function resolveToolResultRenderer(toolName: string): {
  Renderer: React.ComponentType<RendererProps>;
  language?: string;
} {
  return (
    (
      TOOL_RESULT_REGISTRY as Record<
        string,
        { Renderer: React.ComponentType<RendererProps>; language?: string }
      >
    )[toolName] || { Renderer: GenericRenderer }
  );
}

/**
 * Render a tool call's result using the registry.
 */
export function ToolResultView({
  toolCall,
  streamingOutput,
  workerToolActivity,
}: ToolResultViewProps) {
  const { Renderer, language } = resolveToolResultRenderer(toolCall.name);

  return (
    <>
      <InputArgsToggle args={toolCall.args} />
      <Renderer
        result={toolCall.result}
        args={toolCall.args}
        streamingOutput={streamingOutput}
        language={language}
        workerToolActivity={workerToolActivity}
      />
      <OutputResultToggle result={toolCall.result} />
    </>
  );
}
