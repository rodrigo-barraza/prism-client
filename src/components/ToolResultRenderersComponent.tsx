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
  Volume2,
  RotateCcw,
  ExternalLink,
} from "lucide-react";

import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";

import MarkdownContent from "./MarkdownContentComponent";
const LazyMessageList = lazy(() => import("./MessageListComponent"));
import {
  prepareDisplayMessages,
  type SubAgentToolActivityItem,
} from "./MessageListComponent";
import { ToolBadgeRow } from "./ToolBadgeComponent";
import StatusBarComponent from "./StatusBarComponent";
import ToolCallsBlockComponent from "./ToolCallsBlockComponent";
import PrismService from "../services/PrismService";
import { formatLatency, renderToolName } from "@rodrigo-barraza/utilities-library";
import styles from "./ToolResultRenderersComponent.module.css";
import TimerBadgeComponent from "./TimerBadgeComponent";
import JsonViewerComponent from "./JsonViewerComponent";

// --- Types & Interfaces ------------------------------------------------

export interface SubAgentActivity {
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
  conversationId?: string;
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
  conversationId?: string;
  turtleId?: string;
  executionTimeMs?: number;
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
  layerCount?: number;
  totalKeyframes?: number;
  isAppend?: boolean;
  voice?: string;
  durationEstimate?: number;
  // Schedule renderer
  timer?: {
    id: string;
    firesAt: string;
    prompt: string;
    mode: "one_shot" | "recurring";
  };
  // 3D mesh / voxel / model / scene renderer
  vertexCount?: number;
  faceCount?: number;
  totalVertices?: number;
  totalFaces?: number;
  sceneEmbedUrl?: string;
  voxelCount?: number;
  totalVoxels?: number;
  objectCount?: number;
  totalObjects?: number;
  // QR code renderer
  qrImageUrl?: string;
  qrId?: string;
  dataLength?: number;
  // LaTeX renderer
  latexEmbedUrl?: string;
  latexId?: string;
  // Diagram renderer
  diagramEmbedUrl?: string;
  diagramId?: string;
  // Image manipulation renderer
  imageUrl?: string;
  imageId?: string;
  metadata?: Record<string, unknown>;
  // Emoji Kitchen renderer
  leftEmoji?: string;
  leftEmojiCodepoint?: string;
  rightEmoji?: string;
  rightEmojiCodepoint?: string;
  gStaticUrl?: string;
  alt?: string;
  date?: string;
  isLatest?: boolean;
  gBoardOrder?: string;
  emoji?: string;
  combinations?: Array<{
    emoji: string;
    combination: {
      gStaticUrl: string;
      alt: string;
    };
  }>;
  // Vector animation renderer
  animation?: {
    layers?: Array<unknown>;
    duration?: number;
  };
}

export interface RendererProps {
  result: unknown;
  args?: ToolArgs;
  streamingOutput?: string;
  language?: string;
  subAgentToolActivity?: Record<
    string,
    SubAgentActivity | SubAgentToolActivityItem
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
  subAgentToolActivity?: Record<
    string,
    SubAgentActivity | SubAgentToolActivityItem
  > | null;
  hideToggles?: boolean;
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
      className={`${styles['status-badge']} ${success ? styles['status-success'] : styles['status-error']}`}
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
    <span className={styles['path-pill']}>
      <Icon size={11} />
      <span className={styles['path-full']}>{path}</span>
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
    <div className={styles['raw-toggle']}>
      <button
        className={styles['raw-toggle-button']}
        onClick={() => setShow((previousState) => !previousState)}
      >
        <ChevronRight size={11} className={show ? styles['chevron-open'] : ""} />
        <span>Raw Response</span>
      </button>
      {show && (
        <div className={styles['raw-content']}>
          <MarkdownContent content={formatted} />
        </div>
      )}
    </div>
  );
}

/**
 * Formats and renders any parameter/argument value based on its type.
 * Renders JSON objects/arrays with JsonViewerComponent, and primitives with class-specific colors.
 */
interface ArgValueViewerProps {
  valueToRender: unknown;
}

function ArgValueViewerComponent({ valueToRender }: ArgValueViewerProps) {
  const parsedData = useMemo(() => {
    if (valueToRender === null || valueToRender === undefined) {
      return { valueType: "null", parsedValue: null };
    }
    if (typeof valueToRender === "string") {
      const trimmedString = valueToRender.trim();
      if (
        (trimmedString.startsWith("{") && trimmedString.endsWith("}")) ||
        (trimmedString.startsWith("[") && trimmedString.endsWith("]"))
      ) {
        try {
          const parsedObject = JSON.parse(valueToRender);
          if (parsedObject && typeof parsedObject === "object") {
            return { valueType: "json", parsedValue: parsedObject };
          }
        } catch {
          // Treat as a regular string
        }
      }
      if (trimmedString === "true" || trimmedString === "false") {
        return { valueType: "boolean", parsedValue: trimmedString === "true" };
      }
      if (trimmedString === "null") {
        return { valueType: "null", parsedValue: null };
      }
      if (trimmedString !== "" && !isNaN(Number(trimmedString))) {
        return { valueType: "number", parsedValue: Number(trimmedString) };
      }
      return { valueType: "string", parsedValue: valueToRender };
    }
    if (typeof valueToRender === "object") {
      return { valueType: "json", parsedValue: valueToRender };
    }
    if (typeof valueToRender === "boolean") {
      return { valueType: "boolean", parsedValue: valueToRender };
    }
    if (typeof valueToRender === "number") {
      return { valueType: "number", parsedValue: valueToRender };
    }
    return { valueType: typeof valueToRender, parsedValue: valueToRender };
  }, [valueToRender]);

  if (parsedData.valueType === "json") {
    return (
      <div className={styles['json-value-wrapper']}>
        <JsonViewerComponent data={parsedData.parsedValue as import("../types/types").JsonValue} collapsed={1} />
      </div>
    );
  }

  if (parsedData.valueType === "string") {
    const isLongContent = typeof parsedData.parsedValue === "string" && parsedData.parsedValue.length > 80;
    return (
      <span
        className={`${styles['value-string']} ${isLongContent ? styles['value-string-long'] : ""}`}
      >
        {String(parsedData.parsedValue)}
      </span>
    );
  }

  if (parsedData.valueType === "number") {
    return <span className={styles['value-number']}>{String(parsedData.parsedValue)}</span>;
  }

  if (parsedData.valueType === "boolean") {
    return (
      <span className={styles['value-boolean']}>
        {parsedData.parsedValue ? "true" : "false"}
      </span>
    );
  }

  if (parsedData.valueType === "null") {
    return <span className={styles['value-null']}>null</span>;
  }

  return <span className={styles['value-other']}>{String(parsedData.parsedValue)}</span>;
}

/**
 * Collapsible panel that shows all input arguments passed to a tool call.
 * Renders key-value pairs in a clean, readable format.
 */
function InputArgsToggle({ args }: { args?: ToolArgs }) {
  const [showInput, setShowInput] = useState(false);

  const entries = useMemo(() => {
    if (!args || typeof args !== "object") return [];
    return Object.entries(args).filter(
      ([, value]) => value !== undefined && value !== null,
    );
  }, [args]);

  if (entries.length === 0) return null;

  return (
    <div className={styles['input-args-toggle']}>
      <button
        className={styles['raw-toggle-button']}
        onClick={() => setShowInput((previousState) => !previousState)}
      >
        <ChevronRight size={11} className={showInput ? styles['chevron-open'] : ""} />
        <span>Input</span>
        <span className={styles['input-args-count']}>{entries.length}</span>
      </button>
      {showInput && (
        <div className={styles['input-args-content']}>
          {entries.map(([key, value]) => {
            const isComplexObject = typeof value === "object" && value !== null;
            let isJsonValue = isComplexObject;
            if (typeof value === "string") {
              const trimmedString = value.trim();
              isJsonValue =
                (trimmedString.startsWith("{") && trimmedString.endsWith("}")) ||
                (trimmedString.startsWith("[") && trimmedString.endsWith("]"));
            }

            return (
              <div
                key={key}
                className={`${isJsonValue ? styles['input-arg-layout-row-complex'] : styles['input-arg-layout-row']}`}
              >
                <span className={styles['input-arg-key']}>{key}</span>
                <div className={styles['input-arg-value-wrapper']}>
                  <ArgValueViewerComponent valueToRender={value} />
                </div>
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
  const [showOutput, setShowOutput] = useState(false);

  const displayData = useMemo(() => {
    if (result === undefined || result === null) return null;
    if (typeof result === "string") {
      try {
        const parsedObject = JSON.parse(result);
        return {
          dataType: "object",
          dataValue: parsedObject,
          rawString: JSON.stringify(parsedObject, null, 2),
        };
      } catch {
        return { dataType: "string", dataValue: result, rawString: result };
      }
    }
    if (typeof result === "object") {
      return {
        dataType: "object",
        dataValue: result,
        rawString: JSON.stringify(result, null, 2),
      };
    }
    return { dataType: "string", dataValue: result, rawString: String(result) };
  }, [result]);

  if (!displayData) return null;

  // Count meaningful entries for the badge
  const entryCount =
    displayData.dataType === "object" && !Array.isArray(displayData.dataValue)
      ? Object.keys(displayData.dataValue).length
      : null;

  return (
    <div className={styles['output-result-toggle']}>
      <button
        className={styles['raw-toggle-button']}
        onClick={() => setShowOutput((previousState) => !previousState)}
      >
        <ChevronRight size={11} className={showOutput ? styles['chevron-open'] : ""} />
        <span>Output</span>
        {entryCount != null && (
          <span className={styles['output-result-count']}>{entryCount}</span>
        )}
      </button>
      {showOutput && (
        <div className={styles['output-result-content']}>
          {displayData.dataType === "object" && !Array.isArray(displayData.dataValue) ? (
            Object.entries(displayData.dataValue)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([key, value]) => {
                const isComplexObject = typeof value === "object" && value !== null;
                let isJsonValue = isComplexObject;
                if (typeof value === "string") {
                  const trimmedString = value.trim();
                  isJsonValue =
                    (trimmedString.startsWith("{") && trimmedString.endsWith("}")) ||
                    (trimmedString.startsWith("[") && trimmedString.endsWith("]"));
                }

                return (
                  <div
                    key={key}
                    className={`${isJsonValue ? styles['output-arg-layout-row-complex'] : styles['output-arg-layout-row']}`}
                  >
                    <span className={styles['output-arg-key']}>{key}</span>
                    <div className={styles['output-arg-value-wrapper']}>
                      <ArgValueViewerComponent valueToRender={value} />
                    </div>
                  </div>
                );
              })
          ) : (
            <div className={styles['output-arg-layout-row-single']}>
              <ArgValueViewerComponent valueToRender={result} />
            </div>
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <PathPill path={filePath} icon={FileText} />
      </div>
      {content && (
        <pre className={styles['code-block']}>
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <PathPill path={filePath} icon={FileText} />
        <StatusBadge
          success={success}
          label={created ? "Created" : "Written"}
        />
      </div>
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <PathPill path={filePath} icon={FileText} />
        <StatusBadge
          success={success}
          label={`${replacements} replacement${replacements !== 1 ? "s" : ""}`}
        />
      </div>
      {args?.oldStr && args?.newStr && (
        <pre className={styles['diff-block']}>
          <code>
            <span className={styles['diff-removed']}>
              -{" "}
              {args.oldStr.length > 200
                ? args.oldStr.slice(0, 200) + "…"
                : args.oldStr}
            </span>
            {"\n"}
            <span className={styles['diff-added']}>
              +{" "}
              {args.newStr.length > 200
                ? args.newStr.slice(0, 200) + "…"
                : args.newStr}
            </span>
          </code>
        </pre>
      )}
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
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
  for (const matchItem of matches.slice(0, 30)) {
    const file = matchItem.file || matchItem.path || "unknown";
    if (!grouped[file]) grouped[file] = [];
    grouped[file].push(matchItem);
  }

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Search size={13} />
        <span className={styles['renderer-title']}>
          {totalMatches} match{totalMatches !== 1 ? "es" : ""} for{" "}
          <code className={styles['inline-code']}>{pattern}</code>
        </span>
      </div>
      <div className={styles['grep-list']}>
        {Object.entries(grouped).map(([file, fileMatches]) => (
          <div key={file} className={styles['grep-file']}>
            <span className={styles['grep-file-path']}>{file}</span>
            {fileMatches.map((matchItem, i) => (
              <div key={i} className={styles['grep-line']}>
                {matchItem.line != null && (
                  <span className={styles['grep-line-num']}>{matchItem.line}</span>
                )}
                <span className={styles['grep-line-content']}>
                  {matchItem.content || matchItem.text || matchItem.match || ""}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <FolderTree size={13} />
        <span className={styles['renderer-title']}>
          {basename(dirPath) || "Directory"}
        </span>
      </div>
      <div className={styles['directory-list']}>
        {entries.slice(0, 40).map((entry, i) => {
          const name =
            typeof entry === "string" ? entry : entry.name || entry.path || "";
          const isDir =
            typeof entry === "object" &&
            (entry.type === "directory" || entry.isDirectory);
          return (
            <div key={i} className={styles['directory-entry']}>
              {isDir ? (
                <Folder size={11} className={styles['directory-icon']} />
              ) : (
                <File size={11} className={styles['file-icon']} />
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Search size={13} />
        <span className={styles['renderer-title']}>
          {files.length} file{files.length !== 1 ? "s" : ""} matching{" "}
          <code className={styles['inline-code']}>{pattern}</code>
        </span>
      </div>
      <div className={styles['directory-list']}>
        {files.slice(0, 40).map((fileEntry, i) => {
          const path = typeof fileEntry === "string" ? fileEntry : fileEntry.path || fileEntry.name || "";
          return (
            <div key={i} className={styles['directory-entry']}>
              <File size={11} className={styles['file-icon']} />
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Globe size={13} />
        <span className={styles['renderer-title']}>
          {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;
          {query}&rdquo;
        </span>
      </div>
      <div className={styles['search-results']}>
        {results.slice(0, 8).map((result, i) => (
          <div key={i} className={styles['search-result']}>
            <a
              href={result.url || result.link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles['search-link']}
            >
              {result.title || result.name || result.url}
            </a>
            {result.snippet && <p className={styles['search-snippet']}>{result.snippet}</p>}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Globe size={13} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles['search-link']}
        >
          {title || url}
        </a>
      </div>
      {content && (
        <pre className={styles['code-block']}>
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Music size={13} />
        <span className={styles['renderer-title']}>
          {args?.presetEffect
            ? `Sound Preset: '${args.presetEffect}'`
            : `Synth (${args?.waveform || "sine"} · ${totalDuration.toFixed(2)}s · ${sampleCount.toLocaleString()} samples)`}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : `${totalDuration.toFixed(2)}s`}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {audioSource && <AudioPlayerRecorderComponent sourceUrl={audioSource} />}
    </div>
  );
}

// -- 8.6. Text-to-Speech Renderer --------------------------------------

function TextToSpeechRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />

  const audioSource = useMemo(() => {
    if (parsed.audioRef) {
      return PrismService.getFileUrl(parsed.audioRef);
    }
    if (!parsed.audio?.data) return null;
    const mimeType = parsed.audio.mimeType || "audio/wav";
    return `data:${mimeType};base64,${parsed.audio.data}`;
  }, [parsed]);

  const hasError = !!parsed.error;
  const voiceLabel = parsed.voice ? String(parsed.voice) : null;
  const durationEstimate =
    typeof parsed.durationEstimate === "number" ? parsed.durationEstimate : null;
  const inputText =
    typeof args?.text === "string" ? args.text : null;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Volume2 size={13} />
        <span className={styles['renderer-title']}>
          {voiceLabel ? `Voice: ${voiceLabel}` : "Text-to-Speech"}
        </span>
        {durationEstimate != null && (
          <StatusBadge
            success={!hasError}
            label={hasError ? "Error" : `~${durationEstimate.toFixed(1)}s`}
          />
        )}
        {!hasError && !durationEstimate && (
          <StatusBadge success={true} label="Generated" />
        )}
      </div>
      {inputText && (
        <div className={styles['input-arg-layout-row']}>
          <span className={styles['input-arg-key']}>text</span>
          <span className={styles['input-arg-value']}>
            {inputText.length > 120 ? inputText.slice(0, 120) + "…" : inputText}
          </span>
        </div>
      )}
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {audioSource && <AudioPlayerRecorderComponent sourceUrl={audioSource} />}
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

// -- ANSI escape-code → React span parser ----------------------
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

function ansi256ToHex(colorCode: number): string | null | undefined {
  if (colorCode < 8) return ANSI_COLORS[colorCode];
  if (colorCode < 16) return ANSI_BRIGHT_COLORS[colorCode - 8];
  if (colorCode < 232) {
    const index = colorCode - 16;
    const result = Math.floor(index / 36) * 51;
    const group = (Math.floor(index / 6) % 6) * 51;
    const current = (index % 6) * 51;
    return `#${result.toString(16).padStart(2, "0")}${group.toString(16).padStart(2, "0")}${current.toString(16).padStart(2, "0")}`;
  }
  const grayscaleValue = (colorCode - 232) * 10 + 8;
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
  error: styles['term-line-error'],
  warn: styles['term-line-warn'],
  success: styles['term-line-success'],
};

const TERM_CONTENT_LEVEL_CLASS = {
  error: styles['term-content-error'],
  warn: styles['term-content-warn'],
  info: styles['term-content-info'],
  success: styles['term-content-success'],
  debug: styles['term-content-debug'],
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
    <div className={styles['terminal-block']}>
      <div className={styles['terminal-header']}>
        <Terminal size={11} />
        <span>{language || "terminal"}</span>
        {isStreaming && <span className={styles['terminal-live']}>● live</span>}
        {exitCode != null && (
          <StatusBadge success={exitCode === 0} label={`exit ${exitCode}`} />
        )}
        {exitCode == null && success === false && (
          <StatusBadge success={false} label="error" />
        )}
        {totalLines > 0 && (
          <span className={styles['terminal-line-count']}>
            {totalLines.toLocaleString()}
          </span>
        )}
      </div>
      <div
        ref={bodyRef}
        className={styles['terminal-body']}
        onScroll={handleScroll}
      >
        {/* Input command lines */}
        {inputLines.map((line: string, i: number) => (
          <div key={`in-${i}`} className={styles['term-line']}>
            <span className={styles['term-line-num']}>{i + 1}</span>
            <span
              className={`${styles['term-line-content']} ${styles['terminal-input']}`}
            >
              {line}
            </span>
          </div>
        ))}
        {/* Output lines */}
        {outputLines.map((line: string, i: number) => {
          const level = detectTerminalLevel(line);
          const lineNumber = inputLines.length + i + 1;
          return (
            <div
              key={`out-${i}`}
              className={`${styles['term-line']} ${level ? (TERM_LEVEL_CLASS as Record<string, string>)[level] || "" : ""}`}
            >
              <span className={styles['term-line-num']}>{lineNumber}</span>
              <span
                className={`${styles['term-line-content']} ${level ? (TERM_CONTENT_LEVEL_CLASS as Record<string, string>)[level] || "" : ""}`}
              >
                {parseAnsi(line)}
              </span>
            </div>
          );
        })}
        {isStreaming && (
          <div className={styles['term-line']}>
            <span className={styles['term-line-num']} />
            <span className={styles['term-line-content']}>
              <span className={styles['terminal-cursor']}>▊</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed || !parsed.success || !parsed.timer) {
    return <RawResultToggle result={result} />;
  }

  const timer = parsed.timer;
  return (
    <div className={styles['renderer-block']}>
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <GitBranch size={13} />
        <span className={styles['renderer-title']}>{branch || "git status"}</span>
        <StatusBadge
          success={clean}
          label={clean ? "Clean" : `${files.length} changed`}
        />
      </div>
      {!clean && (
        <div className={styles['directory-list']}>
          {files.slice(0, 30).map((fileEntry, i) => {
            const name = typeof fileEntry === "string" ? fileEntry : fileEntry.path || fileEntry.file || "";
            const status =
              typeof fileEntry === "object" && fileEntry !== null
                ? fileEntry.status || fileEntry.state || ""
                : "";
            return (
              <div key={i} className={styles['directory-entry']}>
                {status && <span className={styles['git-status']}>{status}</span>}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <GitBranch size={13} />
        <span className={styles['renderer-title']}>git diff</span>
      </div>
      {diff && (
        <pre className={styles['diff-block']}>
          <code>
            {diff
              .split("\n")
              .slice(0, 80)
              .map((line: string, i: number) => {
                let cls = "";
                if (line.startsWith("+") && !line.startsWith("+++"))
                  cls = styles['diff-added'];
                else if (line.startsWith("-") && !line.startsWith("---"))
                  cls = styles['diff-removed'];
                else if (line.startsWith("@@")) cls = styles['diff-hunk'];
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <GitBranch size={13} />
        <span className={styles['renderer-title']}>
          {commits.length} commit{commits.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className={styles['git-log']}>
        {commits.slice(0, 15).map((commitEntry, i) => (
          <div key={i} className={styles['git-commit']}>
            <span className={styles['git-hash']}>
              {(commitEntry.hash || commitEntry.sha || "").slice(0, 7)}
            </span>
            <span className={styles['git-message']}>
              {commitEntry.message || commitEntry.subject || ""}
            </span>
            {commitEntry.author && <span className={styles['git-author']}>{commitEntry.author}</span>}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Trash2 size={13} />
        <PathPill path={filePath} />
        <StatusBadge success={success} label={success ? "Deleted" : "Failed"} />
      </div>
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <ArrowRight size={13} />
        <PathPill path={source} />
        <ArrowRight size={10} className={styles['move-arrow']} />
        <PathPill path={destination} />
        <StatusBadge success={success} label={success ? "Moved" : "Failed"} />
      </div>
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
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
  let screenshotSource = null;
  if (parsed.screenshotRef) {
    screenshotSource = PrismService.getFileUrl(parsed.screenshotRef);
  } else if (parsed.screenshot) {
    screenshotSource = `data:${parsed.mimeType || "image/png"};base64,${parsed.screenshot}`;
  }

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Monitor size={13} />
        <span className={styles['renderer-title']}>{label}</span>
        {parsed.url && (
          <a
            href={parsed.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles['search-link']}
          >
            {parsed.title || parsed.url}
          </a>
        )}

        {hasError && <StatusBadge success={false} label="Error" />}
      </div>

      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}

      {screenshotSource && (
        <div className={styles['browser-screenshot']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotSource}
            alt={`Screenshot of ${parsed.url || "page"}`}
            className={styles['browser-screenshot-img']}
          />
        </div>
      )}

      {parsed.content && (
        <pre className={styles['code-block']}>
          <code>
            {parsed.content.length > 3000
              ? parsed.content.slice(0, 3000) + "\n\u2026"
              : parsed.content}
          </code>
        </pre>
      )}

      {parsed.result !== undefined && action === "evaluate" && (
        <pre className={styles['code-block']}>
          <code>{String(parsed.result)}</code>
        </pre>
      )}

      {action === "get_elements" && parsed.elements && (
        <div className={styles['directory-list']}>
          {parsed.elements
            .slice(0, 30)
            .map((element: { selector: string; text?: string }, i: number) => (
              <div key={i} className={styles['directory-entry']}>
                <code className={styles['inline-code']}>{element.selector}</code>

                {element.text && <span>{element.text}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// -- 13. Turtle Graphics -----------------------------------------------------

function TurtleDrawEmbed({ sourceUrl, title }: { sourceUrl: string; title: string }) {
  const iframeReference = useRef<HTMLIFrameElement>(null);

  const handleReplay = useCallback(() => {
    iframeReference.current?.contentWindow?.postMessage({ type: "turtle-replay" }, "*");
  }, []);

  return (
    <div className={styles['turtle-embed-wrapper']}>
      <iframe
        ref={iframeReference}
        src={sourceUrl}
        className={styles['turtle-embed-frame']}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <button
        type="button"
        className={styles['turtle-replay-button']}
        onClick={handleReplay}
        title="Replay animation"
        aria-label="Replay turtle drawing animation"
      >
        <RotateCcw size={14} />
      </button>
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
  const executionTimeMs = parsed.executionTimeMs;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🐢</span>
        <span className={styles['renderer-title']}>
          Turtle Drawing — {commandCount} command{commandCount !== 1 ? "s" : ""}
          {executionTimeMs ? ` · ${executionTimeMs}ms` : ""}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : canvasSize}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <TurtleDrawEmbed sourceUrl={embedUrl} title="Turtle Drawing" />
      )}
    </div>
  );
}

// -- 13.25 Vector Animation Player -------------------------------------------

function VectorAnimationEmbed({ sourceUrl, title }: { sourceUrl: string; title: string }) {
  return (
    <div className={styles['turtle-embed-wrapper']}>
      <iframe
        src={sourceUrl}
        className={styles['turtle-embed-frame']}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function VectorAnimationRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const layerCount = parsed.layerCount || (args?.animation as { layers?: unknown[] })?.layers?.length || 0;
  const totalKeyframes = parsed.totalKeyframes || 0;
  const duration = parsed.duration || (args?.animation as { duration?: number })?.duration || 0;
  const canvasSize = parsed.canvasSize || "800x600";
  const embedUrl = parsed.embedUrl || "";
  const isAppend = !!parsed.isAppend;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎬</span>
        <span className={styles['renderer-title']}>
          Vector Animation — {isAppend ? "Updated" : "Created"} {layerCount} layer{layerCount !== 1 ? "s" : ""}{totalKeyframes > 0 ? ` (${totalKeyframes} total keyframes)` : ""} ({duration.toFixed(1)}s)
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : canvasSize}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <VectorAnimationEmbed sourceUrl={embedUrl} title="Vector Animation" />
      )}
    </div>
  );
}

/**
 * Auto-resizing iframe for tool result embeds (LaTeX, Diagram, Map).
 * Listens for postMessage `embed-resize` events from the embed page
 * and dynamically adjusts iframe height to fit content — avoids
 * fixed-height clipping for tall equations or complex diagrams.
 */
function AutoResizeToolEmbed({
  sourceUrl,
  title,
  fallbackHeight = 360,
  className,
  wrapperClassName,
}: {
  sourceUrl: string;
  title: string;
  fallbackHeight?: number;
  className?: string;
  wrapperClassName?: string;
}) {
  const iframeReference = useRef<HTMLIFrameElement | null>(null);
  const [dynamicHeight, setDynamicHeight] = useState(fallbackHeight);

  const handleResizeMessage = useCallback((event: MessageEvent) => {
    if (
      event.data?.type === "embed-resize" &&
      iframeReference.current &&
      event.source === iframeReference.current.contentWindow
    ) {
      setDynamicHeight(event.data.height);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleResizeMessage);
    return () => window.removeEventListener("message", handleResizeMessage);
  }, [handleResizeMessage]);

  return (
    <div className={wrapperClassName || styles['visual-tool-embed-wrapper']}>
      <iframe
        ref={iframeReference}
        src={sourceUrl}
        className={className || styles['visual-tool-embed-frame']}
        title={title}
        style={{ height: `${dynamicHeight}px` }}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

// -- 13.5 3D Mesh Rendering --------------------------------------------------

function ThreeDimensionalSceneEmbed({ sourceUrl, title }: { sourceUrl: string; title: string }) {
  return (
    <div className={styles["three-dimensional-mesh-embed-wrapper"]}>
      <iframe
        src={sourceUrl}
        className={styles["three-dimensional-mesh-embed-frame"]}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function ThreeMeshRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const vertexCount = parsed.vertexCount || (args as { vertices?: unknown[] })?.vertices?.length || 0;
  const faceCount = parsed.faceCount || (args as { faces?: unknown[] })?.faces?.length || 0;
  const totalVertices = parsed.totalVertices || vertexCount;
  const totalFaces = parsed.totalFaces || faceCount;
  const isAppend = !!parsed.isAppend;
  const embedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🔺</span>
        <span className={styles['renderer-title']}>
          3D Mesh — {isAppend ? `Added ${vertexCount} vertices, ${faceCount} faces` : `Created ${vertexCount} vertices, ${faceCount} faces`}
          {isAppend && ` (Total: ${totalVertices} vertices, ${totalFaces} faces)`}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={embedUrl} title="3D Mesh Renderer" />
      )}
    </div>
  );
}

function ThreeVoxelRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const voxelCount = parsed.voxelCount || 0;
  const totalVoxels = parsed.totalVoxels || voxelCount;
  const isAppend = !!parsed.isAppend;
  const embedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🧊</span>
        <span className={styles['renderer-title']}>
          3D Voxel Grid — {isAppend ? `Added ${voxelCount} voxels` : `Created ${voxelCount} voxels`}
          {isAppend && ` (Total: ${totalVoxels} voxels)`}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={embedUrl} title="3D Voxel Grid" />
      )}
    </div>
  );
}

function ThreeModelRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const objectCount = parsed.objectCount || (args as { objects?: unknown[] })?.objects?.length || 0;
  const totalObjects = parsed.totalObjects || objectCount;
  const isAppend = !!parsed.isAppend;
  const embedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎨</span>
        <span className={styles['renderer-title']}>
          3D Model — {isAppend ? `Added ${objectCount} objects` : `Created ${objectCount} objects`}
          {isAppend && ` (Total: ${totalObjects} objects)`}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={embedUrl} title="3D Model" />
      )}
    </div>
  );
}

function ThreeSceneRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const objectCount = parsed.objectCount || parsed.totalObjects || 0;
  const isAppend = !!parsed.isAppend;
  const embedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🌐</span>
        <span className={styles['renderer-title']}>
          3D Scene — {isAppend ? `Updated (${objectCount} objects)` : `Created (${objectCount} objects)`}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={embedUrl} title="3D Scene" />
      )}
    </div>
  );
}

// -- 13.6 QR Code Rendering --------------------------------------------------

function QrCodeRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const qrImageUrl = parsed.qrImageUrl || "";
  const dataLength = parsed.dataLength || 0;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📱</span>
        <span className={styles['renderer-title']}>
          QR Code{!hasError && dataLength > 0 ? ` — ${dataLength} chars encoded` : ""}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Generated"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && qrImageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt="Generated QR Code"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

// -- 13.7 LaTeX Rendering ----------------------------------------------------

function LatexRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const embedUrl = parsed.latexEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📐</span>
        <span className={styles['renderer-title']}>LaTeX Equation</span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Rendered"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <AutoResizeToolEmbed
          sourceUrl={embedUrl}
          title="LaTeX Equation"
          fallbackHeight={160}
        />
      )}
    </div>
  );
}

// -- 13.8 Diagram Rendering --------------------------------------------------

function DiagramRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const embedUrl = parsed.diagramEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📊</span>
        <span className={styles['renderer-title']}>Mermaid Diagram</span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Rendered"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <AutoResizeToolEmbed
          sourceUrl={embedUrl}
          title="Mermaid Diagram"
          fallbackHeight={420}
        />
      )}
    </div>
  );
}

// -- 13.9 Image Manipulation Rendering ---------------------------------------

function ImageManipulationRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const imageUrl = parsed.imageUrl || "";
  const hasMetadataOnly = !imageUrl && parsed.metadata && parsed.success;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🖼️</span>
        <span className={styles['renderer-title']}>
          {hasMetadataOnly ? "Image Metadata" : "Image Processing"}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : hasMetadataOnly ? "Inspected" : "Processed"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && imageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Processed image"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
      )}
      {hasMetadataOnly && parsed.metadata && (
        <div className={styles['visual-tool-metadata']}>
          {Object.entries(parsed.metadata).map(([key, value]) => (
            <span key={key} className={styles['meta-item']}>
              <strong>{key}:</strong> {String(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// -- 13.10 Video to GIF Rendering --------------------------------------------

function VideoToGifRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const imageUrl = parsed.imageUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎞️</span>
        <span className={styles['renderer-title']}>Video → GIF Conversion</span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Converted"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && imageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Converted GIF"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

// -- 13.11 Map Rendering -----------------------------------------------------

function MapRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const embedUrl = (parsed as Record<string, unknown>).mapEmbedUrl as string || parsed.embedUrl || "";
  const markerCount = (parsed as Record<string, unknown>).markerCount as number || 0;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🗺️</span>
        <span className={styles['renderer-title']}>
          Interactive Map{markerCount > 0 ? ` — ${markerCount} marker${markerCount !== 1 ? "s" : ""}` : ""}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Generated"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && embedUrl && (
        <AutoResizeToolEmbed
          sourceUrl={embedUrl}
          title="Interactive Map"
          fallbackHeight={360}
        />
      )}
    </div>
  );
}

// -- 13.12 Chart Rendering ----------------------------------------------------

function ChartRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const chartImageUrl = (parsed as Record<string, unknown>).chartImageUrl as string || parsed.imageUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📈</span>
        <span className={styles['renderer-title']}>Chart</span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Generated"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && chartImageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={chartImageUrl}
            alt="Generated chart"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎨</span>
        <span className={styles['renderer-title']}>
          ASCII Art — {String(width)}×{String(height)}
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Error" : "Rendered"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasError && parsed.ascii ? (
        <div className={styles['ascii-art-container']}>
          <pre className={styles['ascii-art-pre']}>
            <code>{parsed.ascii}</code>
          </pre>
        </div>
      ) : (
        !hasError &&
        embedUrl && <TurtleDrawEmbed sourceUrl={embedUrl} title="ASCII Art" />
      )}
    </div>
  );
}

function EmojiCombinationRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🍳</span>
        <span className={styles['renderer-title']}>Emoji Mashup</span>
        {isLatest && (
          <StatusBadge success={true} label="Latest GBoard Design" />
        )}
      </div>
      <div className={styles['emoji-combine-container']}>
        <div className={styles['emoji-left-right-grid']}>
          <div
            className={styles['emoji-bubble']}
            title={`Codepoint: ${leftEmojiCodepoint}`}
          >
            <span className={styles['bubble-emoji-char']}>{leftEmoji}</span>
          </div>
          <span className={styles['combine-plus']}>+</span>
          <div
            className={styles['emoji-bubble']}
            title={`Codepoint: ${rightEmojiCodepoint}`}
          >
            <span className={styles['bubble-emoji-char']}>{rightEmoji}</span>
          </div>
          <span className={styles['combine-equals']}>=</span>
        </div>
        <div className={styles['emoji-merged-container']}>
          <div className={styles['merged-backdrop-glow']} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gStaticUrl}
            alt={alt || "Emoji Kitchen mashup"}
            className={styles['merged-emoji-image']}
            title={alt}
          />
        </div>
      </div>
      <div className={styles['emoji-meta-layout-row']}>
        <span className={styles['meta-item']}>Order: {gBoardOrder || "N/A"}</span>
        <span className={styles['meta-separator']}>·</span>
        <span className={styles['meta-item']}>Date: {date || "N/A"}</span>
        <span className={styles['meta-separator']}>·</span>
        <a
          href={gStaticUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={`mashup_${leftEmojiCodepoint}_${rightEmojiCodepoint}.png`}
          className={styles['download-link']}
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
  const parsed = tryParse(result);
  if (!parsed || !parsed.success) return <RawResultToggle result={result} />;

  const baseEmoji = parsed.emoji || (args?.emoji as string) || "";
  const count = parsed.count || 0;
  const combinations = parsed.combinations || [];

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🧑‍🍳</span>
        <span className={styles['renderer-title']}>
          {baseEmoji} Mashup Kitchen — {count} Options
        </span>
      </div>
      <div className={styles['emoji-grid-scroll-container']}>
        <div className={styles['emoji-combos-grid']}>
          {(parsed.combinations || []).map((option: { emoji: string; combination: { gStaticUrl: string; alt: string } }, index: number) => {
            const combo = option.combination;
            return (
              <div key={index} className={styles['combo-option-card']}>
                <div className={styles['option-card-header']}>
                  <span className={styles['mini-emoji']}>{baseEmoji}</span>
                  <span className={styles['mini-plus']}>+</span>
                  <span className={styles['mini-emoji']}>{option.emoji}</span>
                </div>
                <div className={styles['option-card-image-container']}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={combo.gStaticUrl}
                    alt={combo.alt}
                    className={styles['mini-merged-image']}
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
 * Mini status bar for an individual spawned sub-agent.
 * Uses the shared StatusBarComponent.
 */
function SubAgentStatusBar({ activity }: { activity: SubAgentActivity | null }) {
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

  // Detect sub-sub-agent delegation: the sub-agent's LLM is "complete" but it
  // spawned a nested team whose create_team tool call is still in-flight.
  const hasActiveSubSubAgents =
    isTerminal &&
    phase !== "failed" &&
    Array.isArray(activity.toolCalls) &&
    activity.toolCalls.some(
      (toolCall) =>
        toolCall.name === "create_team" &&
        (toolCall.status === "calling" || toolCall.status === "streaming"),
    );

  const hasPhase = !!phase && !isTerminal;
  const isActive = isToolActive || hasPhase || hasActiveSubSubAgents;
  const toolLabel = currentTool ? renderToolName(currentTool) : null;

  // Derive the effective phase for StatusBarComponent:
  // - Sub-sub-agents still running → "delegating" (teal — awaiting nested team)
  // - Tool executing → "executing" (orange — actively running a tool)
  // - Terminal → null (idle)
  // - Otherwise → actual model phase (generating, thinking, prefilling, etc.)
  const effectivePhase = hasActiveSubSubAgents
    ? "delegating"
    : isToolActive
      ? "executing"
      : isTerminal
        ? null
        : phase;
  // Show delegation label, tool name, or phase progress label
  const label = hasActiveSubSubAgents
    ? "Awaiting Sub-Agents…"
    : isToolActive
      ? toolLabel
      : activity.phaseLabel || undefined;
  // Delegation shows the team icon, tool calls show a wrench emoji, phase uses default icons
  const icon = hasActiveSubSubAgents ? "👥" : isToolActive ? "🔧" : undefined;
  // Progress (0-1) from LM Studio prompt processing / model loading
  const progress =
    effectivePhase === "prefilling" || effectivePhase === "loading"
      ? (activity.phaseProgress ?? null)
      : null;

  // Idle label reflects terminal state or tool count
  const idleLabel = isTerminal
    ? phase === "failed"
      ? "Sub-agent failed"
      : `Done · ${toolCount} tool${toolCount !== 1 ? "s" : ""} used`
    : toolCount > 0
      ? `${toolCount} tools used`
      : "Sub-agent idle";

  // Per-sub-agent tok/s from the backend's burst-scoped generation progress.
  // Use the pre-computed value directly — it's authoritative from the
  // CoordinatorService which tracks per-sub-agent burst counters independently.
  let tokPerSec = null;
  if (!isToolActive && (phase === "generating" || phase === "thinking")) {
    tokPerSec = activity.tokPerSec ?? null;
  }

  return (
    <StatusBarComponent
      active={isActive}
      variant="subAgent"
      phase={(effectivePhase ?? undefined) as import("./StatusBarComponent").StatusBarPhase | undefined}
      label={label ?? undefined}
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

/**
 * Renders live status bars for sub-sub-agents spawned by a sub-agent's
 * nested create_team tool call. Extracts agent_ids from the in-flight
 * create_team and looks them up in subAgentToolActivity.
 */
function SubSubAgentStatusBars({
  toolCalls,
  subAgentToolActivity,
}: {
  toolCalls: import("../types/types").ToolCallEvent[];
  subAgentToolActivity?: Record<string, SubAgentActivity | SubAgentToolActivityItem> | null;
}) {
  if (!subAgentToolActivity) return null;

  const activeCreateTeamCalls = toolCalls.filter(
    (toolCall) =>
      toolCall.name === "create_team" &&
      (toolCall.status === "calling" || toolCall.status === "streaming"),
  );

  if (activeCreateTeamCalls.length === 0) return null;

  const subSubAgentEntries: Array<{
    agentId: string;
    description: string;
    activity: SubAgentActivity | SubAgentToolActivityItem;
  }> = [];

  for (const createTeamCall of activeCreateTeamCalls) {
    const parsedResult = createTeamCall.result
      ? typeof createTeamCall.result === "string"
        ? (() => { try { return JSON.parse(createTeamCall.result); } catch { return null; } })()
        : createTeamCall.result
      : null;

    const resultMembers: Array<{ agent_id?: string; description?: string }> =
      Array.isArray(parsedResult)
        ? parsedResult
        : (parsedResult as Record<string, unknown>)?.members as Array<{ agent_id?: string; description?: string }> ?? [];

    const argMembers: Array<{ description?: string }> =
      Array.isArray((createTeamCall.args as ToolArgs)?.members)
        ? (createTeamCall.args as ToolArgs).members!
        : [];

    // Match by agent_id from result members first
    for (const resultMember of resultMembers) {
      if (resultMember.agent_id && subAgentToolActivity[resultMember.agent_id]) {
        subSubAgentEntries.push({
          agentId: resultMember.agent_id,
          description: resultMember.description || `Sub-Agent`,
          activity: subAgentToolActivity[resultMember.agent_id],
        });
      }
    }

    // Fallback: match by description from args if no result members were found
    if (subSubAgentEntries.length === 0 && argMembers.length > 0) {
      for (const argMember of argMembers) {
        if (!argMember.description) continue;
        const matchedActivity = Object.entries(subAgentToolActivity).find(
          ([, value]) =>
            value.description &&
            argMember.description &&
            value.description.includes(argMember.description),
        );
        if (matchedActivity) {
          subSubAgentEntries.push({
            agentId: matchedActivity[0],
            description: argMember.description,
            activity: matchedActivity[1],
          });
        }
      }
    }
  }

  if (subSubAgentEntries.length === 0) return null;

  return (
    <div className={styles['sub-sub-agent-status-bars']}>
      {subSubAgentEntries.map((entry) => {
        const activityData = entry.activity as SubAgentActivity;
        const isEntryTerminal =
          activityData.phase === "complete" || activityData.phase === "failed";
        const isEntryActive =
          !isEntryTerminal || !!activityData.currentTool;

        if (!isEntryActive) return null;

        return (
          <div key={entry.agentId} className={styles['sub-sub-agent-status-entry']}>
            <span className={styles['sub-sub-agent-label']}>
              {entry.description}
            </span>
            <SubAgentStatusBar activity={activityData} />
          </div>
        );
      })}
    </div>
  );
}

function TeamCreateRenderer({
  result,
  args,
  subAgentToolActivity,
}: RendererProps) {
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(
    new Set(),
  );
  const parsed = tryParse(result);

  const rawArgMembers = args?.members;
  const argMembers = Array.isArray(rawArgMembers) ? rawArgMembers : [];
  // create_team returns a raw array of SubAgentResult objects, not { members: [...] }
  const rawResultMembers = Array.isArray(parsed)
    ? parsed
    : (parsed?.members ?? []);
  const allResultMembers = Array.isArray(rawResultMembers) ? rawResultMembers : [];
  const isSynthesisAgent = (member: Record<string, unknown>) =>
    typeof member.agent_id === "string" && member.agent_id.startsWith("synthesis-");
  const resultMembers = allResultMembers.filter((member) => !isSynthesisAgent(member));
  const parsedIsComplete = Array.isArray(parsed)
    ? parsed.length > 0
    : !!parsed;
  const teamName = args?.name || (Array.isArray(parsed) ? "" : parsed?.team) || "";

  const hasActiveSubAgents = useMemo(() => {
    if (!subAgentToolActivity) return false;
    return Object.values(subAgentToolActivity).some(
      (activity) =>
        activity.phase === "generating" || activity.phase === "thinking",
    );
  }, [subAgentToolActivity]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasActiveSubAgents) return;
    const intervalId = setInterval(() => setTick((tick) => tick + 1), 500);
    return () => clearInterval(intervalId);
  }, [hasActiveSubAgents]);

  const getSubAgentTokPerSec = (activity: SubAgentActivity | null) => {
    if (!activity?.tokPerSec) return null;
    if (activity.phase !== "generating" && activity.phase !== "thinking")
      return null;
    return activity.tokPerSec;
  };

  const orderedSubAgentIds = useMemo(() => {
    if (!subAgentToolActivity) return [];
    return Object.keys(subAgentToolActivity);
  }, [subAgentToolActivity]);

  const getActivity = (
    member: { agent_id?: string; description?: string; [key: string]: unknown },
    memberIndex: number,
  ) => {
    if (!subAgentToolActivity) return null;
    if (member.agent_id) return subAgentToolActivity[member.agent_id] || null;
    if (memberIndex != null && orderedSubAgentIds[memberIndex]) {
      return subAgentToolActivity[orderedSubAgentIds[memberIndex]] || null;
    }
    if (member.description) {
      return (
        Object.values(subAgentToolActivity).find(
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
  const allDone = parsedIsComplete
    ? resultMembers.every(
        (member: Record<string, unknown>) =>
          member.status === "completed" ||
          member.status === "failed" ||
          member.status === "stopped",
      )
    : false;
  const teamSuccess = failed === 0 && !hasError;

  const membersList = (parsedIsComplete && resultMembers.length > 0)
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Users size={13} />
        <span className={styles['renderer-title']}>
          Team <strong>{teamName}</strong> — {membersList.length} sub-agent
          {membersList.length !== 1 ? "s" : ""}
        </span>
        <StatusBadge
          success={!parsedIsComplete ? true : teamSuccess}
          label={
            !parsedIsComplete
              ? "running"
              : allDone
                ? `${succeeded} done${failed ? `, ${failed} failed` : ""}`
                : "running"
          }
        />
      </div>

      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}

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
        const tokPerSec = !isTerminal ? getSubAgentTokPerSec(activity) : null;

        const toolNames = activity?.toolNames || member.toolNames;
        const toolUsesCount = !isTerminal
          ? (activity?.toolCount ?? 0)
          : (member.toolUses ?? 0);
        const iterationsCount = !isTerminal
          ? (activity?.iteration ?? 0)
          : (member.iterations ?? 0);

        // Detect when this sub-agent is "completed" but still has
        // in-flight create_team tool calls (sub-sub-agents still running)
        const memberHasActiveSubSubAgents =
          isCompleted &&
          Array.isArray(activity?.toolCalls) &&
          activity!.toolCalls.some(
            (toolCall) =>
              toolCall.name === "create_team" &&
              (toolCall.status === "calling" || toolCall.status === "streaming"),
          );

        return (
          <div
            key={index}
            className={styles['renderer-block']}
            style={{ marginTop: 4 }}
          >
            <div className={styles['renderer-header']}>
              <span className={styles['renderer-title']}>
                Sub-Agent {index + 1}: <strong>{member.description}</strong>
              </span>
              {tokPerSec !== null && (
                <span className={styles['sub-agent-speed-badge']}>
                  ⚡ {tokPerSec.toFixed(1)} tok/s
                </span>
              )}
              <StatusBadge
                success={!isTerminal ? true : memberHasActiveSubSubAgents ? true : isCompleted}
                label={
                  memberHasActiveSubSubAgents
                    ? "delegating"
                    : !isTerminal
                      ? activity?.phase || member.status || "running"
                      : member.status || "unknown"
                }
              />
              {(() => {
                const subAgentConversationId =
                  (activity as SubAgentActivity | null)?.conversationId ||
                  (member.agent_id && subAgentToolActivity?.[member.agent_id] &&
                    (subAgentToolActivity[member.agent_id] as SubAgentActivity)?.conversationId);
                if (!subAgentConversationId) return null;
                return (
                  <button
                    className={styles['sub-agent-navigate-button']}
                    onClick={(event) => {
                      event.stopPropagation();
                      const currentUrl = new URL(window.location.href);
                      currentUrl.searchParams.set("conversation", subAgentConversationId);
                      window.open(currentUrl.toString(), "_blank", "noopener");
                    }}
                    title="Open sub-agent conversation"
                    aria-label={`Open conversation for sub-agent ${index + 1}`}
                  >
                    <ExternalLink size={11} />
                  </button>
                );
              })()}
            </div>

            {toolNames && Object.keys(toolNames).length > 0 && (
              <ToolBadgeRow
                tools={normalizeToolCounts(toolNames)}
                activeTool={!isTerminal ? activity?.currentTool : null}
                variant="compact"
              />
            )}

            {member.error && (
              <div className={styles['error-text']}>{member.error}</div>
            )}

            {activity && <SubAgentStatusBar activity={activity} />}

            <div className={styles['sub-agent-result-card']}>
              {activity?.toolCalls &&
                activity.toolCalls.some(
                  (toolCall) =>
                    toolCall.name === "create_team" &&
                    (toolCall.status === "calling" || toolCall.status === "streaming"),
                ) && (
                <SubSubAgentStatusBars
                  toolCalls={activity.toolCalls}
                  subAgentToolActivity={subAgentToolActivity}
                />
              )}
              <button
                className={styles['sub-agent-result-toggle']}
                onClick={() => toggleMember(index)}
              >
                <Zap size={12} />
                <span className={styles['sub-agent-result-summary']}>
                  {member.summary ||
                    (!isTerminal
                      ? activity?.currentTool
                        ? `Executing ${renderToolName(activity.currentTool)}...`
                        : "Sub-agent running..."
                      : isCompleted
                        ? "Sub-agent completed"
                        : isFailed
                          ? "Sub-agent failed"
                          : "Sub-agent finished")}
                </span>
                {durationLabel && (
                  <span className={styles['sub-agent-result-meta']}>
                    {durationLabel}
                  </span>
                )}
                {toolUsesCount > 0 && (
                  <span className={styles['sub-agent-result-meta']}>
                    {toolUsesCount} tools
                  </span>
                )}
                {iterationsCount > 0 && (
                  <span className={styles['sub-agent-result-meta']}>
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
                <div className={styles['sub-agent-result-body']}>
                  {/* Live or completed tool calls — always render when present
                      so nested create_team sub-agents are visible at any depth */}
                  {activity?.toolCalls &&
                    activity.toolCalls.length > 0 && (
                    <div style={{ padding: "4px 0" }}>
                      <ToolCallsBlockComponent
                        toolCalls={activity.toolCalls}
                        subAgentToolActivity={subAgentToolActivity}
                      />
                    </div>
                  )}
                  {/* Terminal sub-agents with full message history */}
                  {isTerminal && (member.messages?.length ?? 0) > 0 ? (
                    <Suspense fallback={null}>
                      <LazyMessageList
                        messages={prepareDisplayMessages(
                          member.messages as import("../types/types").Message[],
                        )}
                        readOnly
                      />
                    </Suspense>
                  ) : /* Result text (only when no tool calls were already rendered) */
                  !(activity?.toolCalls && activity.toolCalls.length > 0) ? (
                    member.result ? (
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
                    )
                  ) : null}
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
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <MessageSquare size={13} />
        <span className={styles['renderer-title']}>
          Message → <code className={styles['inline-code']}>{agentId}</code>
        </span>
        <StatusBadge success={!hasError} label={status} />
      </div>

      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
    </div>
  );
}

function StopAgentRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const agentId = args?.agent_id || parsed.agent_id || "";
  const hasError = !!parsed.error;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <StopCircle size={13} />
        <span className={styles['renderer-title']}>
          Stopped: <code className={styles['inline-code']}>{agentId}</code>
        </span>
        <StatusBadge
          success={!hasError}
          label={hasError ? "Failed" : "Stopped"}
        />
      </div>
      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}
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
  replace_in_file: { Renderer: StrReplaceRenderer },
  patch_file: { Renderer: FileWriteRenderer },
  read_multi_file: { Renderer: GenericRenderer },
  get_file_info: { Renderer: GenericRenderer },
  diff_files: { Renderer: GitDiffRenderer }, // reuses diff renderer
  move_file: { Renderer: FileMoveRenderer },
  delete_file: { Renderer: FileDeleteRenderer },

  // Search
  search_file_contents: { Renderer: GrepSearchRenderer },
  find_files: { Renderer: GlobFilesRenderer },
  list_directory: { Renderer: DirectoryListRenderer },

  // Web
  search_web: { Renderer: WebSearchRenderer },
  read_web_page: { Renderer: FetchUrlRenderer },

  // Execution
  execute_shell: { Renderer: TerminalRenderer, language: "bash" },
  execute_python: { Renderer: TerminalRenderer, language: "python" },
  execute_javascript: { Renderer: TerminalRenderer, language: "javascript" },
  execute_command: { Renderer: TerminalRenderer, language: "bash" },
  schedule: { Renderer: ScheduleRenderer },

  // Git
  git_status: { Renderer: GitStatusRenderer },
  git_diff: { Renderer: GitDiffRenderer },
  git_log: { Renderer: GitLogRenderer },

  // Project
  summarize_project: { Renderer: GenericRenderer },

  // Browser
  control_browser: { Renderer: BrowserActionRenderer },

  // Turtle Graphics
  draw_turtle_graphics: { Renderer: TurtleDrawRenderer },
  create_vector_animation: { Renderer: VectorAnimationRenderer },

  // 3D Tools
  create_3d_mesh: { Renderer: ThreeMeshRenderer },
  create_3d_voxel: { Renderer: ThreeVoxelRenderer },
  create_3d_model: { Renderer: ThreeModelRenderer },
  create_3d_scene: { Renderer: ThreeSceneRenderer },

  // Visual Compute Tools
  generate_qr_code: { Renderer: QrCodeRenderer },
  render_latex: { Renderer: LatexRenderer },
  generate_diagram: { Renderer: DiagramRenderer },
  manipulate_image: { Renderer: ImageManipulationRenderer },
  convert_video_to_gif: { Renderer: VideoToGifRenderer },
  generate_map: { Renderer: MapRenderer },
  generate_chart: { Renderer: ChartRenderer },

  // Image to ASCII Art
  convert_image_to_ascii: { Renderer: AsciiImageRenderer },

  // Emoji Kitchen
  get_emoji_combination: { Renderer: EmojiCombinationRenderer },
  get_emoji_combinations: { Renderer: EmojiCombinationsRenderer },

  // Audio Generation
  generate_audio: { Renderer: AudioGeneratorRenderer },

  // Text-to-Speech
  synthesize_speech: { Renderer: TextToSpeechRenderer },
  synthesize_speech_local: { Renderer: TextToSpeechRenderer },

  // Coordinator
  create_team: { Renderer: TeamCreateRenderer },
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
  subAgentToolActivity,
  hideToggles = false,
}: ToolResultViewProps) {
  const { Renderer, language } = resolveToolResultRenderer(toolCall.name);

  return (
    <>
      {!hideToggles && <InputArgsToggle args={toolCall.args} />}
      <Renderer
        result={toolCall.result}
        args={toolCall.args}
        streamingOutput={streamingOutput}
        language={language}
        subAgentToolActivity={subAgentToolActivity}
      />
      {!hideToggles && <OutputResultToggle result={toolCall.result} />}
    </>
  );
}
