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
} from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";
// Lazy-load MessageList to break circular dependency:
// MessageList → ToolResultRenderers → MessageList
const LazyMessageList = lazy(() => import("./MessageListComponent"));
import { prepareDisplayMessages } from "./MessageListComponent";
import { ToolBadgeRow } from "./ToolBadgeComponent";
import StatusBarComponent from "./StatusBarComponent";
import PrismService from "../services/PrismService";
import { formatLatency, renderToolName } from "../utils/utilities";
import styles from "./ToolResultRenderersComponent.module.css";

// --- Helpers ----------------------------------------------------------

function basename(filePath: unknown) {
  if (!filePath) return "";
  return filePath.split("/").pop() || filePath;
}

function extensionOf(filePath: unknown) {
  const base = basename(filePath);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.substring(dot + 1).toLowerCase() : "";
}

function tryParse(result) {
  if (typeof result === "object" && result !== null) return result;
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
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

function StatusBadge({ success, label }: any) {
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

function PathPill({ path, icon }: any) {
  const Icon = icon || FileText;
  return (
    <span className={styles.pathPill}>
      <Icon size={11} />
      <span className={styles.pathFull}>{path}</span>
    </span>
  );
}

// --- Collapsible Raw Result -------------------------------------------

function RawResultToggle({ result }: any) {
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
        className={styles.rawToggleBtn}
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
function InputArgsToggle({ args }: any) {
  const [show, setShow] = useState(false);

  const entries = useMemo(() => {
    if (!args || typeof args !== "object") return [];
    return Object.entries(args).filter(
      ([, v]: [string, unknown]) => v !== undefined && v !== null,
    );
  }, [args]);

  if (entries.length === 0) return null;

  return (
    <div className={styles.inputArgsToggle}>
      <button
        className={styles.rawToggleBtn}
        onClick={() => setShow((v) => !v)}
      >
        <ChevronRight size={11} className={show ? styles.chevronOpen : ""} />
        <span>Input</span>
        <span className={styles.inputArgsCount}>{entries.length}</span>
      </button>
      {show && (
        <div className={styles.inputArgsContent}>
          {entries.map(([key, value]: [string, unknown]) => {
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
function OutputResultToggle({ result }: any) {
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
        className={styles.rawToggleBtn}
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
              .filter(([, v]: [string, unknown]) => v !== undefined && v !== null)
              .map(([key, value]: [string, unknown]) => {
                const isComplex = typeof value === "object";
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

// ═══════════════════════════════════════════════════════════════════════
// RENDERERS
// ═══════════════════════════════════════════════════════════════════════

// -- 1. File Read ------------------------------------------------------

function FileReadRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const content = parsed.content || "";
  const _lang = (EXT_LANG as Record<string, unknown>)[extensionOf(filePath)] || "";

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

function FileWriteRenderer({ result, args }: any) {
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

function StrReplaceRenderer({ result, args }: any) {
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

function GrepSearchRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const matches = parsed.matches || parsed.results || [];
  const totalMatches = parsed.totalMatches ?? parsed.count ?? matches.length;
  const pattern = args?.pattern || "";

  // Group by file
  const grouped = {};
  for (const m of matches.slice(0, 30)) {
    const file = m.file || m.path || "unknown";
    if (!(grouped as Record<string, unknown>)[file]) (grouped as Record<string, unknown>)[file] = [];
    (grouped as Record<string, unknown>)[file].push(m);
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
        {Object.entries(grouped).map(([file, fileMatches]: unknown) => (
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

function DirectoryListRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const rawEntries = parsed.entries || parsed.items || parsed.files || [];
  const entries = Array.isArray(rawEntries)
    ? rawEntries
    : Object.values(rawEntries);
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

function GlobFilesRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const files = parsed.files || parsed.matches || [];
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

function WebSearchRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const results = parsed.results || parsed.items || [];
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

function FetchUrlRenderer({ result, args }: any) {
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

// -- 9. Terminal (Shell/Python/JS) -------------------------------------

const PROMPT_PREFIXES = { bash: "$ ", python: ">>> ", javascript: "> " };
const CONTINUATION_PREFIXES = { python: "... ", javascript: ".. " };
const DEFAULT_CWD = { bash: "/tmp", python: "python3", javascript: "node" };

function formatInputPrompt(input: unknown, language: unknown, cwd: unknown) {
  if (!input) return "";
  const prompt = (PROMPT_PREFIXES as Record<string, unknown>)[language] || "$ ";
  const contPrompt = (CONTINUATION_PREFIXES as Record<string, unknown>)[language] || "  ";
  const lines = input.split("\n");
  const resolvedCwd = cwd || (DEFAULT_CWD as Record<string, unknown>)[language] || "";
  const pathPrefix = resolvedCwd ? `${resolvedCwd} ` : "";
  return lines
    .map(
      (line: unknown, i: unknown) =>
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

function ansi256ToHex(n) {
  if (n < 8) return ANSI_COLORS[n];
  if (n < 16) return ANSI_BRIGHT_COLORS[n - 8];
  if (n < 232) {
    const index = n - 16;
    const r = Math.floor(index / 36) * 51;
    const g = (Math.floor(index / 6) % 6) * 51;
    const b = (index % 6) * 51;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  const v = (n - 232) * 10 + 8;
  return `#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`;
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function parseAnsi(text) {
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
        const style = {};
        if (color) (style as unknown).color = color;
        if (bgColor) (style as unknown).backgroundColor = bgColor;
        if (bold) (style as unknown).fontWeight = 700;
        if (dim) (style as unknown).opacity = 0.6;
        if (italic) (style as unknown).fontStyle = "italic";
        if (underline) (style as unknown).textDecoration = "underline";
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
      const c = codes[i];
      if (c === 0) {
        color = null;
        bgColor = null;
        bold = false;
        dim = false;
        italic = false;
        underline = false;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 3) italic = true;
      else if (c === 4) underline = true;
      else if (c === 22) {
        bold = false;
        dim = false;
      } else if (c === 23) italic = false;
      else if (c === 24) underline = false;
      else if (c === 39) color = null;
      else if (c === 49) bgColor = null;
      else if (c >= 30 && c <= 37) color = ANSI_COLORS[c - 30];
      else if (c >= 40 && c <= 47) bgColor = ANSI_COLORS[c - 40];
      else if (c >= 90 && c <= 97) color = ANSI_BRIGHT_COLORS[c - 90];
      else if (c >= 100 && c <= 107) bgColor = ANSI_BRIGHT_COLORS[c - 100];
      else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] != null) {
        color = ansi256ToHex(codes[i + 2]);
        i += 2;
      } else if (c === 48 && codes[i + 1] === 5 && codes[i + 2] != null) {
        bgColor = ansi256ToHex(codes[i + 2]);
        i += 2;
      }
    }
  }
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (color || bgColor || bold || dim || italic || underline) {
      const style = {};
      if (color) (style as unknown).color = color;
      if (bgColor) (style as unknown).backgroundColor = bgColor;
      if (bold) (style as unknown).fontWeight = 700;
      if (dim) (style as unknown).opacity = 0.6;
      if (italic) (style as unknown).fontStyle = "italic";
      if (underline) (style as unknown).textDecoration = "underline";
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

function detectTerminalLevel(text) {
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

function TerminalRenderer({ result, args, streamingOutput, language }: any) {
  const bodyRef = useRef<any>(null);
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
        {inputLines.map((line, i) => (
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
        {outputLines.map((line, i) => {
          const level = detectTerminalLevel(line);
          const lineNum = inputLines.length + i + 1;
          return (
            <div
              key={`out-${i}`}
              className={`${styles.termLine} ${level ? (TERM_LEVEL_CLASS as Record<string, unknown>)[level] || "" : ""}`}
            >
              <span className={styles.termLineNum}>{lineNum}</span>
              <span
                className={`${styles.termLineContent} ${level ? TERM_CONTENT_LEVEL_CLASS[level] || "" : ""}`}
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

// -- 10. Git Operations ------------------------------------------------

function GitStatusRenderer({ result }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const files = parsed.files || parsed.status || [];
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
              typeof f === "object" ? f.status || f.state || "" : "";
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

function GitDiffRenderer({ result }: any) {
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
              .map((line, i) => {
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

function GitLogRenderer({ result }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const commits = parsed.commits || parsed.log || [];

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

function FileDeleteRenderer({ result, args }: any) {
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

function FileMoveRenderer({ result, args }: any) {
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

function BrowserActionRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const action = parsed.action || args?.action || "";
  const label = (BROWSER_ACTION_LABELS as Record<string, unknown>)[action] || action;
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
          {parsed.elements.slice(0, 30).map((element, i) => (
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

function TurtleDrawRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasError = !!parsed.error;
  const commandCount = parsed.commandCount || args?.commands?.length || 0;
  const canvasSize = parsed.canvasSize || "800x600";

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
    </div>
  );
}

// -- 14. Coordinator Tools ---------------------------------------------------

/**
 * Mini status bar for an individual spawned worker agent.
 * Uses the shared StatusBarComponent.
 */
function WorkerStatusBar({ activity }: any) {
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

function TeamCreateRenderer({ result, args, workerToolActivity }: any) {
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const parsed = tryParse(result);

  // Extract members from args (calling state) or result (done state)
  const rawArgMembers = args?.members;
  const argMembers = Array.isArray(rawArgMembers) ? rawArgMembers : [];
  const rawResultMembers = parsed?.members;
  const resultMembers = Array.isArray(rawResultMembers) ? rawResultMembers : [];
  const teamName = args?.name || parsed?.team || "";

  // -- Live tok/s ticker ----------------------------------------
  // Tick every 500ms while any worker is actively generating so
  // the per-worker speed badge stays current.
  const hasActiveWorkers = useMemo(() => {
    if (!workerToolActivity) return false;
    return Object.values(workerToolActivity).some(
      (a) => a.phase === "generating" || a.phase === "thinking",
    );
  }, [workerToolActivity]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasActiveWorkers) return;
    const id = setInterval(() => setTick((t: unknown) => t + 1), 500);
    return () => clearInterval(id);
  }, [hasActiveWorkers]);

  // Use backend-computed per-worker tok/s directly. Only show when the
  // worker is in an active generation phase.
  const getWorkerTokPerSec = (activity: unknown) => {
    if (!activity?.tokPerSec) return null;
    if (activity.phase !== "generating" && activity.phase !== "thinking")
      return null;
    return activity.tokPerSec;
  };

  // Build an ordered list of workerIds from workerToolActivity.
  // Keys arrive in insertion order (Map-like semantics of plain objects in V8),
  // which matches the spawn order from the coordinator.
  const orderedWorkerIds = useMemo(() => {
    if (!workerToolActivity) return [];
    return Object.keys(workerToolActivity);
  }, [workerToolActivity]);

  // Resolve live worker activity for a member — by agentId, positional
  // index, or description match.  Positional matching is the primary
  // strategy for the "calling" state (before tool result arrives and
  // agent_id is available), because workers with identical descriptions
  // would all resolve to the first match via description.includes().
  const getActivity = (member: unknown, memberIndex: unknown) => {
    if (!workerToolActivity) return null;
    // 1. Exact match by agent_id (available in result/done state)
    if (member.agent_id) return workerToolActivity[member.agent_id] || null;
    // 2. Positional match by spawn order (calling state — most reliable)
    if (memberIndex != null && orderedWorkerIds[memberIndex]) {
      return workerToolActivity[orderedWorkerIds[memberIndex]] || null;
    }
    // 3. Fallback: description match (only reliable when descriptions are unique)
    if (member.description) {
      return (
        Object.values(workerToolActivity).find(
          (v) =>
            v.description && v.description.includes(member.description),
        ) || null
      );
    }
    return null;
  };

  const toggleMember = (index) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // -- Calling state: no result yet, workers are running --
  if (!parsed) {
    return (
      <div className={styles.rendererBlock}>
        <div className={styles.rendererHeader}>
          <Users size={13} />
          <span className={styles.rendererTitle}>
            Team <strong>{teamName}</strong> — {argMembers.length} worker
            {argMembers.length !== 1 ? "s" : ""}
          </span>
          <StatusBadge success={true} label="running" />
        </div>
        {argMembers.map((member, i) => {
          const activity = getActivity(member, i);
          const tokPerSec = getWorkerTokPerSec(activity);
          return (
            <div
              key={i}
              className={styles.rendererBlock}
              style={{ marginTop: 4 }}
            >
              <div className={styles.rendererHeader}>
                <span className={styles.rendererTitle}>
                  Worker {i + 1}: <strong>{member.description}</strong>
                </span>
                {tokPerSec !== null && (
                  <span className={styles.workerSpeedBadge}>
                    ⚡ {tokPerSec.toFixed(1)} tok/s
                  </span>
                )}
                {activity?.phase && (
                  <StatusBadge success={true} label={activity.phase} />
                )}
              </div>
              {activity?.toolNames && (
                <ToolBadgeRow
                  tools={activity.toolNames}
                  activeTool={activity.currentTool}
                  variant="compact"
                />
              )}
              {activity && <WorkerStatusBar activity={activity} />}
            </div>
          );
        })}
      </div>
    );
  }

  // -- Done state: result available --
  const hasError = !!parsed.error;
  const succeeded =
    parsed.succeeded ??
    resultMembers.filter((m) => m.status === "completed").length;
  const failed =
    parsed.failed ??
    resultMembers.filter((m) => m.status === "failed").length;
  const allDone = resultMembers.every(
    (m) =>
      m.status === "completed" ||
      m.status === "failed" ||
      m.status === "stopped",
  );
  const teamSuccess = failed === 0 && !hasError;

  return (
    <div className={styles.rendererBlock}>
      <div className={styles.rendererHeader}>
        <Users size={13} />
        <span className={styles.rendererTitle}>
          Team <strong>{teamName}</strong> — {resultMembers.length} worker
          {resultMembers.length !== 1 ? "s" : ""}
        </span>
        <StatusBadge
          success={teamSuccess}
          label={
            allDone
              ? `${succeeded} done${failed ? `, ${failed} failed` : ""}`
              : "running"
          }
        />
      </div>

      {hasError && <div className={styles.errorText}>{parsed.error}</div>}

      {resultMembers.map((member, i) => {
        const activity = getActivity(member, i);
        const isTerminal =
          member.status === "completed" ||
          member.status === "failed" ||
          member.status === "stopped";
        const isCompleted = member.status === "completed";
        const isFailed = member.status === "failed";
        const memberExpanded = expandedMembers.has(i);
        const durationLabel = member.durationMs
          ? formatLatency(Number(member.durationMs) / 1000)
          : null;
        const tokPerSec = !isTerminal ? getWorkerTokPerSec(activity) : null;

        return (
          <div
            key={i}
            className={styles.rendererBlock}
            style={{ marginTop: 4 }}
          >
            <div className={styles.rendererHeader}>
              <span className={styles.rendererTitle}>
                Worker {i + 1}: <strong>{member.description}</strong>
              </span>
              {tokPerSec !== null && (
                <span className={styles.workerSpeedBadge}>
                  ⚡ {tokPerSec.toFixed(1)} tok/s
                </span>
              )}
              <StatusBadge
                success={isCompleted}
                label={member.status || "unknown"}
              />
            </div>

            {/* Per-worker tool badges — live from activity, static from result */}
            {(() => {
              const toolNames = activity?.toolNames || member.toolNames;
              if (!toolNames || Object.keys(toolNames).length === 0)
                return null;
              return (
                <ToolBadgeRow
                  tools={toolNames}
                  activeTool={!isTerminal ? activity?.currentTool : null}
                  variant="compact"
                />
              );
            })()}

            {member.error && (
              <div className={styles.errorText}>{member.error}</div>
            )}

            {/* Live status bar — shown while the worker is still running */}
            {activity && !isTerminal && <WorkerStatusBar activity={activity} />}

            {/* Inline completion card */}
            {isTerminal && (
              <div className={styles.workerResultCard}>
                <button
                  className={styles.workerResultToggle}
                  onClick={() => toggleMember(i)}
                >
                  <Zap size={12} />
                  <span className={styles.workerResultSummary}>
                    {member.summary ||
                      (isCompleted
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
                  {member.toolUses > 0 && (
                    <span className={styles.workerResultMeta}>
                      {member.toolUses} tools
                    </span>
                  )}
                  {member.iterations > 0 && (
                    <span className={styles.workerResultMeta}>
                      {member.iterations} iteration
                      {member.iterations !== 1 ? "s" : ""}
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
                    {member.messages?.length > 0 ? (
                      <Suspense fallback={null}>
                        <LazyMessageList
                          messages={prepareDisplayMessages(member.messages)}
                          readOnly
                        />
                      </Suspense>
                    ) : member.result ? (
                      <MarkdownContent content={member.result} />
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SendMessageRenderer({ result, args }: any) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const agentId = args?.to || parsed.agent_id || "";
  const status = parsed.status || "unknown";
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

function StopAgentRenderer({ result, args }: any) {
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

function GenericRenderer({ result }: any) {
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
  web_search: { Renderer: WebSearchRenderer },
  fetch_url: { Renderer: FetchUrlRenderer },

  // Execution
  execute_shell: { Renderer: TerminalRenderer, language: "bash" },
  execute_python: { Renderer: TerminalRenderer, language: "python" },
  execute_javascript: { Renderer: TerminalRenderer, language: "javascript" },
  run_command: { Renderer: TerminalRenderer, language: "bash" },

  // Git
  git_status: { Renderer: GitStatusRenderer },
  git_diff: { Renderer: GitDiffRenderer },
  git_log: { Renderer: GitLogRenderer },

  // Project
  project_summary: { Renderer: GenericRenderer },

  // Browser
  browser_action: { Renderer: BrowserActionRenderer },

  // Turtle Graphics
  turtle_draw: { Renderer: TurtleDrawRenderer },

  // Coordinator
  team_create: { Renderer: TeamCreateRenderer },
  send_message: { Renderer: SendMessageRenderer },
  stop_agent: { Renderer: StopAgentRenderer },
};

/**
 * Resolve the appropriate result renderer for a tool call.
 */
export function resolveToolResultRenderer(toolName: unknown) {
  return (
    (TOOL_RESULT_REGISTRY as Record<string, unknown>)[toolName] || { Renderer: GenericRenderer }
  );
}

/**
 * Render a tool call's result using the registry.
 */
export function ToolResultView({
  toolCall,
  streamingOutput,
  workerToolActivity,
}: any) {
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
