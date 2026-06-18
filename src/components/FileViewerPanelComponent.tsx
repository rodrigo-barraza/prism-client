"use client";

import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import {
  X,
  FileCode,
  ChevronRight,
  WrapText,
  XCircle,
  Music,
  Eye,
  Code2,
} from "lucide-react";
import FileTypeIconComponent from "./FileTypeIconComponent";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import ToolsApiService from "../services/ToolsApiService";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./FileViewerPanelComponent.module.css";

// --- Binary file type detection -----------------------------
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "avif",
  "tiff",
  "tif",
]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  "wma",
  "webm",
  "opus",
]);
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov", "mkv", "wmv", "flv"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const SVG_EXTENSION = "svg";

/** Determine the media type from a file extension. */
function getMediaType(
  fileExtension: string | null | undefined,
): "image" | "audio" | "video" | "pdf" | null {
  if (!fileExtension) return null;
  if (IMAGE_EXTENSIONS.has(fileExtension)) return "image";
  if (AUDIO_EXTENSIONS.has(fileExtension)) return "audio";
  if (VIDEO_EXTENSIONS.has(fileExtension)) return "video";
  if (PDF_EXTENSIONS.has(fileExtension)) return "pdf";
  return null;
}

/** Map extension → MIME type for building data URIs from base64 content. */
const EXT_TO_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  tiff: "image/tiff",
  tif: "image/tiff",
};

// --- Extension → Prism language key mapping -----------------
// Keys must match Prism language identifiers for syntax highlighting
const EXT_TO_PRISM = {
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  m: "objectivec",
  php: "php",
  pl: "perl",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  mdx: "markdown",
  txt: "text",
  csv: "text",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "docker",
  env: "text",
  gitignore: "text",
  lua: "lua",
  r: "r",
  dart: "dart",
  scala: "scala",
  ex: "elixir",
  vue: "markup",
  svelte: "markup",
  proto: "protobuf",
  prisma: "text",
  tf: "hcl",
  hcl: "hcl",
};

// Extension → display label (for the meta bar)
const EXT_TO_LABEL = {
  js: "JavaScript",
  jsx: "JSX",
  mjs: "ES Module",
  cjs: "CommonJS",
  ts: "TypeScript",
  tsx: "TSX",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  c: "C",
  h: "C Header",
  cpp: "C++",
  hpp: "C++ Header",
  cs: "C#",
  swift: "Swift",
  m: "Objective-C",
  php: "PHP",
  pl: "Perl",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  fish: "Fish",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "LESS",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  svg: "SVG",
  md: "Markdown",
  mdx: "MDX",
  txt: "Plain Text",
  csv: "CSV",
  sql: "SQL",
  graphql: "GraphQL",
  gql: "GraphQL",
  dockerfile: "Dockerfile",
  env: "Environment",
  gitignore: "Git Ignore",
  lua: "Lua",
  r: "R",
  dart: "Dart",
  scala: "Scala",
  ex: "Elixir",
  vue: "Vue",
  svelte: "Svelte",
  proto: "Protocol Buffers",
  prisma: "Prisma",
  tf: "Terraform",
  hcl: "HCL",
};

function getFileExt(filepath: string | null | undefined): string | null {
  if (!filepath) return null;
  const basename = filepath.split("/").pop();
  if (!basename) return null;
  if (basename === "Dockerfile" || basename.startsWith("Dockerfile."))
    return "dockerfile";
  if (basename.startsWith(".")) return basename.slice(1).toLowerCase();
  const fileExtension = basename.split(".").pop()?.toLowerCase();
  return fileExtension || null;
}

function getPrismLanguage(filepath: string | null | undefined): string {
  const fileExtension = getFileExt(filepath);
  return fileExtension
    ? (EXT_TO_PRISM as Record<string, string>)[fileExtension] || "text"
    : "text";
}

function getLanguageLabel(filepath: string | null | undefined): string | null {
  const fileExtension = getFileExt(filepath);
  return fileExtension
    ? (EXT_TO_LABEL as Record<string, string>)[fileExtension] || null
    : null;
}

function getBasename(filepath: string | null | undefined): string {
  return filepath?.split("/").pop() || filepath || "";
}

function getPathSegments(filepath: string | null | undefined): string[] {
  if (!filepath) return [];
  return filepath.split("/").filter(Boolean);
}

/**
 * Strip line-number prefixes added by the agentic file service.
 * The API returns content in the format: "1: line content\n2: line content\n..."
 * We strip the "N: " prefix from each line to get clean source code.
 */
function stripLineNumberPrefixes(
  content: string | null | undefined,
): string | null | undefined {
  if (!content) return content;
  const lines = content.split("\n");
  // Verify the first line matches the pattern — if not, return as-is
  if (!/^\d+: /.test(lines[0] as string) && !/^\d+:$/.test(lines[0] as string))
    return content;
  return lines.map((line: string) => line.replace(/^\d+: ?/, "")).join("\n");
}

// --- VS Code Dark+ with true black background --------------
const codeTheme = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: "#000000",
    margin: 0,
    padding: "8px 0",
    borderRadius: 0,
    fontSize: "12px",
    lineHeight: "1.55",
    fontFamily:
      '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: "transparent",
    fontSize: "12px",
    lineHeight: "1.55",
    fontFamily:
      '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
  },
};

// --- Single file tab ----------------------------------------
interface FileTabProps {
  file: { id: string; path: string };
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const FileTab = memo(function FileTab({
  file,
  isActive,
  onSelect,
  onClose,
}: FileTabProps) {
  const basename = getBasename(file.path);
  return (
    <button
      type="button"
      className={`${styles['tab']} ${isActive ? styles['tab-is-active-state'] : ""}`}
      onClick={() => onSelect(file.id)}
      title={file.path}
    >
      <FileTypeIconComponent
        filename={basename}
        size={11}
        className={styles['tab-icon']}
      />
      <span className={styles['tab-name']}>{basename}</span>
      <span
        className={styles['tab-close']}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onClose(file.id);
        }}
        role="button"
        tabIndex={-1}
      >
        <X size={9} />
      </span>
    </button>
  );
});

export interface OpenFile {
  id: string;
  path: string;
}

export interface FileViewerPanelProps {
  openFiles?: OpenFile[];
  activeFileId?: string | null;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
  onFileNotFound?: (id: string, path: string) => void;
  isOpen?: boolean;
  width?: number;
  onWidthChange?: (width: number) => void;
  refreshKey?: number;
  onMentionLines?: (path: string, startLine: number, endLine: number) => void;
}

interface CachedFile {
  loading: boolean;
  content: string | null;
  totalLines: number;
  language: string | null;
  languageLabel: string | null;
  error: string | null;
  isBinary: boolean;
  mediaType?: "image" | "audio" | "video" | "pdf" | null;
  rawUrl?: string | null;
  sizeBytes?: number;
  isSvg?: boolean;
}

interface ReadFileResult {
  content?: string;
  contentBase64?: string;
  isBinary?: boolean;
  extension?: string;
  totalLines?: number;
  sizeBytes?: number;
  error?: string;
}

/**
 * FileViewerPanelComponent — VS Code-style read-only file viewer.
 *
 * Opens between the left sidebar and the main content area.
 * Supports multiple files as tabs, read-only viewing with syntax highlighting.
 */
export default function FileViewerPanelComponent({
  openFiles = [],
  activeFileId = null,
  onSelectFile,
  onCloseFile,
  onFileNotFound,
  isOpen = false,
  width = 500,
  onWidthChange,
  refreshKey = 0,
  onMentionLines,
}: FileViewerPanelProps) {
  const [fileContents, setFileContents] = useState<Record<string, CachedFile>>(
    {},
  );
  const [svgViewMode, setSvgViewMode] = useState<
    Record<string, "preview" | "source">
  >({});
  const [wordWrap, setWordWrap] = useState(true);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<HTMLDivElement | null>(null);

  const activeFile = openFiles.find((file) => file.id === activeFileId) || null;
  const cached = activeFile ? fileContents[activeFile.id] : null;

  // Track in-flight fetches outside of React state to avoid cascading renders
  const inflightRef = useRef<Set<string>>(new Set());

  // Fetch file content when active file changes
  const fetchFileContent = useCallback(
    (id: string, path: string) => {
      if (inflightRef.current.has(id)) return;
      inflightRef.current.add(id);

      // Set loading state immediately
      setFileContents((previousContents) => ({
        ...previousContents,
        [id]: {
          loading: true,
          content: previousContents[id]?.content ?? null,
          totalLines: previousContents[id]?.totalLines ?? 0,
          language: previousContents[id]?.language ?? null,
          languageLabel: previousContents[id]?.languageLabel ?? null,
          error: null,
          isBinary: previousContents[id]?.isBinary ?? false,
        },
      }));

      ToolsApiService.readFile(path)
        .then((res: unknown) => {
          const result = res as ReadFileResult;
          // File not found / deleted — notify parent so it can close the tab
          if (result.error) {
            const isNotFound =
              /not found|no such file|ENOENT|does not exist/i.test(
                result.error,
              );
            if (isNotFound) {
              onFileNotFound?.(id, path);
            }
            setFileContents((previousContents) => ({
              ...previousContents,
              [id]: {
                loading: false,
                content: null,
                totalLines: 0,
                language: null,
                languageLabel: null,
                error: result.error!,
                isBinary: false,
              },
            }));
            return;
          }

          // Binary file — render via data URI (base64) or raw URL
          if (result.isBinary) {
            const fileExtension =
              result.extension?.replace(".", "") || getFileExt(path) || "";
            const mediaType = getMediaType(fileExtension);
            const rawUrl = ToolsApiService.getFileRawUrl(path);
            // Prefer inline base64 data URI when the backend provides it (works for remote workspaces)
            const dataUri =
              result.contentBase64 &&
              (EXT_TO_MIME as Record<string, string>)[fileExtension]
                ? `data:${(EXT_TO_MIME as Record<string, string>)[fileExtension]};base64,${result.contentBase64}`
                : null;
            setFileContents((previousContents) => ({
              ...previousContents,
              [id]: {
                loading: false,
                content: null,
                totalLines: 0,
                language: null,
                languageLabel: fileExtension?.toUpperCase() || null,
                error: null,
                isBinary: true,
                mediaType,
                rawUrl: dataUri || rawUrl,
                sizeBytes: result.sizeBytes || 0,
              },
            }));
            return;
          }

          const language = getPrismLanguage(path);
          const languageLabel = getLanguageLabel(path) || result.error || null;
          // Strip the "N: " line-number prefixes from the API response
          const cleanContent =
            stripLineNumberPrefixes(result.content ?? "") || "";

          // SVG files are text but also renderable — flag them for dual-view
          const fileExtension = getFileExt(path);
          const isSvg = fileExtension === SVG_EXTENSION;

          setFileContents((previousContents) => ({
            ...previousContents,
            [id]: {
              loading: false,
              content: cleanContent,
              totalLines: result.totalLines || 0,
              language,
              languageLabel,
              error: null,
              isBinary: false,
              isSvg,
            },
          }));

          // Default SVG view mode to preview
          if (isSvg) {
            setSvgViewMode((previousState) =>
              previousState[id] ? previousState : { ...previousState, [id]: "preview" },
            );
          }
        })
        .catch((error: { message?: string; toString?: () => string }) => {
          const errorMessage =
            error.message || error.toString?.() || "Failed to read file";
          const isNotFound =
            /not found|no such file|ENOENT|does not exist/i.test(errorMessage);
          if (isNotFound) {
            onFileNotFound?.(id, path);
          }
          setFileContents((previousContents) => ({
            ...previousContents,
            [id]: {
              loading: false,
              content: null,
              totalLines: 0,
              language: null,
              languageLabel: null,
              error: errorMessage,
              isBinary: false,
            },
          }));
        })
        .finally(() => {
          inflightRef.current.delete(id);
        });
    },
    [onFileNotFound],
  );

  useEffect(() => {
    if (!activeFile) return;
    const { id, path } = activeFile;
    if (
      fileContents[id]?.content != null ||
      fileContents[id]?.isBinary ||
      fileContents[id]?.loading
    )
      return;
    fetchFileContent(id, path);
  }, [activeFile, fileContents, fetchFileContent]);

  // -- Live refresh: re-fetch all open files when refreshKey changes -
  const previousRefreshKeyRef = useRef<number>(refreshKey);
  useEffect(() => {
    if (refreshKey === previousRefreshKeyRef.current) return;
    previousRefreshKeyRef.current = refreshKey;
    // Clear all inflight tracking so re-fetches are not blocked
    inflightRef.current.clear();
    // Re-fetch every open file
    for (const file of openFiles) {
      fetchFileContent(file.id, file.path);
    }
  }, [refreshKey, openFiles, fetchFileContent]);

  // Clean up cache for closed files — use a ref to diff against previous openFiles
  const previousOpenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(openFiles.map((file) => file.id));
    const previousFileIds = previousOpenIdsRef.current;
    previousOpenIdsRef.current = currentIds;

    // Find removed IDs
    const removed = [...previousFileIds].filter((id) => !currentIds.has(id));
    if (removed.length === 0) return;

    setFileContents((previousContents) => {
      const next = { ...previousContents };
      removed.forEach((k) => delete next[k]);
      return next;
    });
  }, [openFiles]);

  // Scroll to top on tab change
  useEffect(() => {
    if (codeScrollRef.current) {
      codeScrollRef.current.scrollTop = 0;
    }
  }, [activeFileId]);

  // -- Resize handle drag --------------------------------------
  const handleResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (mouseEvent: MouseEvent) => {
        const delta = mouseEvent.clientX - startX;
        const newWidth = Math.max(300, Math.min(startWidth + delta, 1200));
        onWidthChange?.(newWidth);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width, onWidthChange],
  );

  // -- Wheel-to-horizontal-scroll on tab bar -------------------
  useEffect(() => {
    const element = tabBarRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      element.scrollLeft += e.deltaY;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const isCollapsed = !isOpen || openFiles.length === 0;

  // Close all open tabs
  const handleCloseAll = useCallback(() => {
    for (const file of openFiles) {
      onCloseFile?.(file.id);
    }
  }, [openFiles, onCloseFile]);

  // Memoize the start line offset from the API response
  const startLineNumber = useMemo(() => {
    if (!cached) return 1;
    // The API can return startLine if partial reads were used
    return 1;
  }, [cached]);

  // -- Line selection state --------------------------------------
  // No hover state — all hover effects use pure CSS via .codeLine:hover
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const lastClickedLineRef = useRef<number | null>(null);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedLines(new Set());
    lastClickedLineRef.current = null;
  }, [activeFileId]);

  // Derived range from selection
  const selectionRange = useMemo(() => {
    if (selectedLines.size === 0) return null;
    const sorted = [...selectedLines].sort((firstLine, secondLine) => firstLine - secondLine);
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }, [selectedLines]);

  // Handle inline @ button click — mentions the full selected range
  const handleMentionSelection = useCallback(() => {
    if (!selectionRange || !activeFile || !onMentionLines) return;
    onMentionLines(activeFile.path, selectionRange.start, selectionRange.end);
    setSelectedLines(new Set());
    lastClickedLineRef.current = null;
  }, [selectionRange, activeFile, onMentionLines]);

  // lineProps — adds selection styles + data attribute + CSS class
  // Hover highlighting is handled by CSS .codeLine:hover (zero re-renders)
  const linePropsBuilder = useCallback(
    (lineNumber: number) => {
      const isSelected = selectedLines.has(lineNumber);
      return {
        style: {
          display: "block",
          backgroundColor: isSelected ? "rgba(99,102,241,0.12)" : undefined,
          borderLeft: isSelected
            ? "2px solid var(--accent-primary)"
            : "2px solid transparent",
          position: "relative" as const,
        },
        "data-line-number": lineNumber,
        className: `${styles['code-line']} ${isSelected ? styles['code-line-selected'] : ""}`,
      };
    },
    [selectedLines],
  );

  // Event delegation — handles line number clicks, inline @ button, and clears selection
  const handleCodeAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // -- Inline @ mention button click --
      const mentionButton = target.closest(`.${styles['line-mention-button']}`);
      if (mentionButton) {
        e.stopPropagation();
        const lineElement = mentionButton.closest(
          "[data-line-number]",
        ) as HTMLElement | null;
        if (lineElement && activeFile && onMentionLines) {
          const lineNumber = parseInt(lineElement.dataset.lineNumber || "", 10);
          if (!isNaN(lineNumber)) {
            // If lines are selected, mention the full range; otherwise mention the hovered line
            if (selectedLines.size > 0) {
              handleMentionSelection();
            } else {
              onMentionLines(activeFile.path, lineNumber, lineNumber);
            }
          }
        }
        return;
      }

      // Detect click on a line number span (react-syntax-highlighter uses this class)
      const lineNumberElement = target.closest(".react-syntax-highlighter-line-number");
      if (lineNumberElement) {
        const lineElement = lineNumberElement.closest(
          "[data-line-number]",
        ) as HTMLElement | null;
        if (!lineElement) return;
        const lineNumber = parseInt(lineElement.dataset.lineNumber || "", 10);
        if (isNaN(lineNumber)) return;

        if (e.shiftKey && lastClickedLineRef.current != null) {
          // Shift+click: select range
          const from = Math.min(lastClickedLineRef.current, lineNumber);
          const to = Math.max(lastClickedLineRef.current, lineNumber);
          const newSet = new Set<number>();
          for (let i = from; i <= to; i++) newSet.add(i);
          setSelectedLines(newSet);
        } else if (e.altKey && onMentionLines && activeFile) {
          // Alt+click line number: instant single-line @ mention
          e.stopPropagation();
          onMentionLines(activeFile.path, lineNumber, lineNumber);
        } else {
          // Regular click: toggle single line
          setSelectedLines((previousState) => {
            const next = new Set(previousState);
            if (next.has(lineNumber)) next.delete(lineNumber);
            else next.add(lineNumber);
            return next;
          });
          lastClickedLineRef.current = lineNumber;
        }
        return;
      }

      // Click on code content — clear selection
      setSelectedLines(new Set());
      lastClickedLineRef.current = null;
    },
    [activeFile, selectedLines, onMentionLines, handleMentionSelection],
  );

  // -- Inject inline @ buttons into every code line (DOM-level) ---
  // Buttons are hidden by default and revealed on .codeLine:hover via CSS.
  // Uses direct DOM manipulation post-render to avoid re-rendering
  // the entire SyntaxHighlighter tree.
  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container || !onMentionLines) return;

    const lineEls = container.querySelectorAll("[data-line-number]");
    const injected: HTMLButtonElement[] = [];
    for (const element of Array.from(lineEls)) {
      // Skip if already injected
      if (element.querySelector(`.${styles['line-mention-button']}`)) continue;
      const button = document.createElement("button");
      button.className = styles['line-mention-button'];
      button.type = "button";
      button.title = "Reference this line in chat";
      button.textContent = "@";
      element.appendChild(button);
      injected.push(button);
    }

    return () => {
      for (const button of injected) button.remove();
    };
  }, [cached?.content, onMentionLines]);

  return (
    <div
      className={`file-viewer-panel-component ${styles['container']} ${isCollapsed ? styles['container-collapsed'] : ""}`}
      style={
        isCollapsed
          ? undefined
          : { width: `${width}px`, minWidth: `${width}px` }
      }
    >
      {/* Title bar — VSCode-style header */}
      <div className={styles['title-bar']}>
        <span className={styles['title-bar-label']}>File Viewer</span>
        <div className={styles['title-bar-actions']}>
          {/* SVG preview / source toggle */}
          {cached?.isSvg && activeFileId && (
            <button
              type="button"
              className={`${styles['title-bar-button']} ${styles['title-bar-button-element-is-active-state']}`}
              onClick={() => {
                setSvgViewMode((previousState) => ({
                  ...previousState,
                  [activeFileId]:
                    previousState[activeFileId] === "preview" ? "source" : "preview",
                }));
              }}
              title={
                svgViewMode[activeFileId] === "preview"
                  ? "Show SVG source"
                  : "Show SVG preview"
              }
            >
              {svgViewMode[activeFileId] === "preview" ? (
                <Code2 size={14} />
              ) : (
                <Eye size={14} />
              )}
            </button>
          )}
          <button
            type="button"
            className={`${styles['title-bar-button']} ${wordWrap ? styles['title-bar-button-element-is-active-state'] : ""}`}
            onClick={() => setWordWrap((previousWordWrap) => !previousWordWrap)}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText size={14} />
          </button>
          <button
            type="button"
            className={styles['title-bar-button']}
            onClick={handleCloseAll}
            title="Close all tabs"
          >
            <XCircle size={14} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles['tab-bar']} ref={tabBarRef}>
        {openFiles.map((file) => (
          <FileTab
            key={file.id}
            file={file}
            isActive={file.id === activeFileId}
            onSelect={onSelectFile}
            onClose={onCloseFile}
          />
        ))}
      </div>

      {/* Content area */}
      <div className={styles['content-area']}>
        {/* Breadcrumb path */}
        {activeFile && (
          <div className={styles['breadcrumb']}>
            {getPathSegments(activeFile.path).map((seg, i, array) => (
              <span key={i}>
                {i > 0 && (
                  <ChevronRight size={8} className={styles['breadcrumb-sep']} />
                )}
                <span
                  style={
                    i === array.length - 1
                      ? { color: "var(--text-primary)", opacity: 1 }
                      : undefined
                  }
                >
                  {seg}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Loading state — only show full spinner for initial loads (no cached content) */}
        {cached?.loading && cached?.content == null && !cached?.isBinary && (
          <div className={styles['is-loading-state']}>
            <PanelLoadingSpinner size="small" inline />
            Loading…
          </div>
        )}

        {/* Error state */}
        {cached?.error && !cached?.content && !cached?.isBinary && (
          <div className={styles['error']}>{cached.error}</div>
        )}

        {/* Binary media viewer — image / audio / video / PDF */}
        {cached?.isBinary && cached?.rawUrl && (
          <div className={styles['media-viewer']}>
            {cached.mediaType === "image" && (
              <div className={styles['media-image-wrap']}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cached.rawUrl}
                  alt={getBasename(activeFile?.path)}
                  className={styles['media-image']}
                  draggable={false}
                />
              </div>
            )}
            {cached.mediaType === "audio" && (
              <div className={styles['media-audio-wrap']}>
                <Music size={48} className={styles['media-audio-icon']} />
                <AudioPlayerRecorderComponent sourceUrl={cached.rawUrl} />
              </div>
            )}
            {cached.mediaType === "video" && (
              <div className={styles['media-video-wrap']}>
                <video
                  src={cached.rawUrl}
                  controls
                  className={styles['media-video']}
                  preload="metadata"
                />
              </div>
            )}
            {cached.mediaType === "pdf" && (
              <iframe
                src={cached.rawUrl}
                className={styles['media-pdf']}
                title={getBasename(activeFile?.path)}
              />
            )}
            {!cached.mediaType && (
              <div className={styles['empty-state']}>
                <FileCode size={24} />
                <span>Binary file — preview not available</span>
              </div>
            )}
          </div>
        )}

        {/* SVG preview mode — rendered from content via data URI */}
        {cached?.isSvg &&
          cached?.content &&
          activeFileId &&
          svgViewMode[activeFileId] === "preview" && (
            <div className={styles['media-viewer']}>
              <div className={styles['media-image-wrap']}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cached.content)}`}
                  alt={getBasename(activeFile?.path)}
                  className={styles['media-svg']}
                  draggable={false}
                />
              </div>
            </div>
          )}

        {/* Syntax-highlighted content — stay visible during refresh (stale-while-revalidate) */}
        {cached?.content != null &&
          !cached?.isBinary &&
          activeFileId &&
          !(cached?.isSvg && svgViewMode[activeFileId] === "preview") && (
            <div
              className={`${styles['code-scroll']} ${!wordWrap ? styles['code-scroll-no-wrap'] : ""}`}
              ref={codeScrollRef}
              onClick={handleCodeAreaClick}
            >
              <SyntaxHighlighter
                style={codeTheme}
                language={cached.language || "text"}
                showLineNumbers
                startingLineNumber={startLineNumber}
                wrapLines
                wrapLongLines={wordWrap}
                lineProps={linePropsBuilder}
                lineNumberStyle={{
                  minWidth: "3em",
                  paddingRight: "12px",
                  color: "rgba(255,255,255,0.2)",
                  userSelect: "none",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  cursor: "pointer",
                }}
                customStyle={{
                  margin: 0,
                  padding: "8px 0",
                  background: "#000000",
                  borderRadius: 0,
                  overflow: "visible",
                }}
                codeTagProps={{
                  style: {
                    fontFamily:
                      '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
                    fontSize: "12px",
                    lineHeight: "1.55",
                  },
                }}
              >
                {cached.content}
              </SyntaxHighlighter>

              {/* Inline @ mention buttons are injected via useEffect below */}
            </div>
          )}

        {/* Empty — no file selected */}
        {!activeFile && openFiles.length === 0 && (
          <div className={styles['empty-state']}>
            <FileCode size={24} />
            <span>Select a file from the workspace</span>
          </div>
        )}

        {/* Resize handle */}
        <div
          className={styles['resize-handle']}
          ref={resizeRef}
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Meta bar */}
      {activeFile && (cached?.content != null || cached?.isBinary) && (
        <div className={styles['meta-bar']}>
          {cached.loading && (
            <>
              <PanelLoadingSpinner size="small" inline />
              <span className={styles['meta-dot']} />
            </>
          )}
          {cached.isBinary ? (
            <>
              <span>{cached.mediaType || "Binary"}</span>
              {cached.sizeBytes && cached.sizeBytes > 0 ? (
                <>
                  <span className={styles['meta-dot']} />
                  <span>
                    {cached.sizeBytes >= 1048576
                      ? `${(cached.sizeBytes / 1048576).toFixed(1)} MB`
                      : `${(cached.sizeBytes / 1024).toFixed(1)} KB`}
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <>
              <span>
                {cached.totalLines || cached.content?.split("\n").length} lines
              </span>
              {cached.languageLabel && (
                <>
                  <span className={styles['meta-dot']} />
                  <span>{cached.languageLabel}</span>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
