"use client";

import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { X, FileCode, ChevronRight, WrapText, XCircle, Music } from "lucide-react";
import FileTypeIconComponent from "./FileTypeIconComponent";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import ToolsApiService from "../services/ToolsApiService.js";
import styles from "./FileViewerPanelComponent.module.css";

// ─── Binary file type detection ─────────────────────────────
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif", "tiff", "tif"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "webm", "opus"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov", "mkv", "wmv", "flv"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

/** Determine the media type from a file extension. */
function getMediaType(ext) {
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return null;
}

// ─── Extension → Prism language key mapping ─────────────────
// Keys must match Prism language identifiers for syntax highlighting
const EXT_TO_PRISM = {
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "tsx",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java", kt: "kotlin",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
  swift: "swift", m: "objectivec", php: "php", pl: "perl",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml",
  md: "markdown", mdx: "markdown", txt: "text", csv: "text",
  sql: "sql", graphql: "graphql", gql: "graphql",
  dockerfile: "docker",
  env: "text", gitignore: "text",
  lua: "lua", r: "r", dart: "dart", scala: "scala", ex: "elixir",
  vue: "markup", svelte: "markup",
  proto: "protobuf", prisma: "text",
  tf: "hcl", hcl: "hcl",
};

// Extension → display label (for the meta bar)
const EXT_TO_LABEL = {
  js: "JavaScript", jsx: "JSX", mjs: "ES Module", cjs: "CommonJS",
  ts: "TypeScript", tsx: "TSX",
  py: "Python", rb: "Ruby", rs: "Rust", go: "Go", java: "Java", kt: "Kotlin",
  c: "C", h: "C Header", cpp: "C++", hpp: "C++ Header", cs: "C#",
  swift: "Swift", m: "Objective-C", php: "PHP", pl: "Perl",
  sh: "Shell", bash: "Bash", zsh: "Zsh", fish: "Fish",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", less: "LESS",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", mdx: "MDX", txt: "Plain Text", csv: "CSV",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL",
  dockerfile: "Dockerfile",
  env: "Environment", gitignore: "Git Ignore",
  lua: "Lua", r: "R", dart: "Dart", scala: "Scala", ex: "Elixir",
  vue: "Vue", svelte: "Svelte",
  proto: "Protocol Buffers", prisma: "Prisma",
  tf: "Terraform", hcl: "HCL",
};

function getFileExt(filepath) {
  if (!filepath) return null;
  const basename = filepath.split("/").pop();
  if (basename === "Dockerfile" || basename.startsWith("Dockerfile.")) return "dockerfile";
  if (basename.startsWith(".")) return basename.slice(1).toLowerCase();
  const ext = basename.split(".").pop()?.toLowerCase();
  return ext || null;
}

function getPrismLanguage(filepath) {
  const ext = getFileExt(filepath);
  return ext ? (EXT_TO_PRISM[ext] || "text") : "text";
}

function getLanguageLabel(filepath) {
  const ext = getFileExt(filepath);
  return ext ? (EXT_TO_LABEL[ext] || null) : null;
}

function getBasename(filepath) {
  return filepath?.split("/").pop() || filepath;
}

function getPathSegments(filepath) {
  if (!filepath) return [];
  return filepath.split("/").filter(Boolean);
}

/**
 * Strip line-number prefixes added by the agentic file service.
 * The API returns content in the format: "1: line content\n2: line content\n..."
 * We strip the "N: " prefix from each line to get clean source code.
 */
function stripLineNumberPrefixes(content) {
  if (!content) return content;
  const lines = content.split("\n");
  // Verify the first line matches the pattern — if not, return as-is
  if (!/^\d+: /.test(lines[0]) && !/^\d+:$/.test(lines[0])) return content;
  return lines.map((line) => line.replace(/^\d+: ?/, "")).join("\n");
}

// ─── VS Code Dark+ with true black background ──────────────
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
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: "transparent",
    fontSize: "12px",
    lineHeight: "1.55",
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
  },
};

// ─── Single file tab ────────────────────────────────────────
const FileTab = memo(function FileTab({ file, isActive, onSelect, onClose }) {
  const basename = getBasename(file.path);
  return (
    <button
      type="button"
      className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
      onClick={() => onSelect(file.id)}
      title={file.path}
    >
      <FileTypeIconComponent filename={basename} size={11} className={styles.tabIcon} />
      <span className={styles.tabName}>{basename}</span>
      <span
        className={styles.tabClose}
        onClick={(e) => { e.stopPropagation(); onClose(file.id); }}
        role="button"
        tabIndex={-1}
      >
        <X size={9} />
      </span>
    </button>
  );
});

/**
 * FileViewerPanelComponent — VS Code-style read-only file viewer.
 *
 * Opens between the left sidebar and the main content area.
 * Supports multiple files as tabs, read-only viewing with syntax highlighting.
 *
 * Props:
 *   openFiles    — Array of { id, path } objects
 *   activeFileId — Currently visible file ID
 *   onSelectFile — (id) => void — switch active tab
 *   onCloseFile  — (id) => void — close a tab
 *   isOpen       — Whether the panel is expanded
 *   width        — Panel width in px (default 500)
 *   onWidthChange — (newWidth) => void — resize callback
 *   onMentionLines — (path, startLine, endLine) => void — reference lines in chat input
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
}) {
  const [fileContents, setFileContents] = useState({}); // { [id]: { content, totalLines, language, languageLabel, error, loading, isBinary?, mediaType?, rawUrl? } }
  const [wordWrap, setWordWrap] = useState(true);
  const codeScrollRef = useRef(null);
  const tabBarRef = useRef(null);
  const resizeRef = useRef(null);

  const activeFile = openFiles.find((f) => f.id === activeFileId) || null;
  const cached = activeFile ? fileContents[activeFile.id] : null;

  // Track in-flight fetches outside of React state to avoid cascading renders
  const inflightRef = useRef(new Set());

  // Fetch file content when active file changes
  const fetchFileContent = useCallback((id, path) => {
    if (inflightRef.current.has(id)) return;
    inflightRef.current.add(id);

    // Set loading state immediately
    setFileContents((prev) => ({
      ...prev,
      [id]: { loading: true, content: prev[id]?.content ?? null, totalLines: prev[id]?.totalLines ?? 0, language: prev[id]?.language ?? null, languageLabel: prev[id]?.languageLabel ?? null, error: null, isBinary: prev[id]?.isBinary ?? false },
    }));

    ToolsApiService.readFile(path)
      .then((result) => {
        // File not found / deleted — notify parent so it can close the tab
        if (result.error) {
          const isNotFound = /not found|no such file|ENOENT|does not exist/i.test(result.error);
          if (isNotFound) {
            onFileNotFound?.(id, path);
          }
          setFileContents((prev) => ({
            ...prev,
            [id]: { loading: false, content: null, totalLines: 0, language: null, languageLabel: null, error: result.error, isBinary: false },
          }));
          return;
        }

        // Binary file — render via raw URL instead of text content
        if (result.isBinary) {
          const ext = result.extension?.replace(".", "") || getFileExt(path);
          const mediaType = getMediaType(ext);
          const rawUrl = ToolsApiService.getFileRawUrl(path);
          setFileContents((prev) => ({
            ...prev,
            [id]: {
              loading: false,
              content: null,
              totalLines: 0,
              language: null,
              languageLabel: ext?.toUpperCase() || null,
              error: null,
              isBinary: true,
              mediaType,
              rawUrl,
              sizeBytes: result.sizeBytes || 0,
            },
          }));
          return;
        }

        const language = getPrismLanguage(path);
        const languageLabel = getLanguageLabel(path) || result.language || null;
        // Strip the "N: " line-number prefixes from the API response
        const cleanContent = stripLineNumberPrefixes(result.content ?? "");
        setFileContents((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            content: cleanContent,
            totalLines: result.totalLines || 0,
            language,
            languageLabel,
            error: null,
            isBinary: false,
          },
        }));
      })
      .catch((err) => {
        const isNotFound = /not found|no such file|ENOENT|does not exist/i.test(err.message);
        if (isNotFound) {
          onFileNotFound?.(id, path);
        }
        setFileContents((prev) => ({
          ...prev,
          [id]: { loading: false, content: null, totalLines: 0, language: null, languageLabel: null, error: err.message },
        }));
      })
      .finally(() => {
        inflightRef.current.delete(id);
      });
  }, [onFileNotFound]);

  useEffect(() => {
    if (!activeFile) return;
    const { id, path } = activeFile;
    if (fileContents[id]?.content != null || fileContents[id]?.isBinary || fileContents[id]?.loading) return;
    fetchFileContent(id, path);
  }, [activeFile, fileContents, fetchFileContent]);

  // ── Live refresh: re-fetch all open files when refreshKey changes ─
  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === prevRefreshKeyRef.current) return;
    prevRefreshKeyRef.current = refreshKey;
    // Clear all inflight tracking so re-fetches are not blocked
    inflightRef.current.clear();
    // Re-fetch every open file
    for (const file of openFiles) {
      fetchFileContent(file.id, file.path);
    }
  }, [refreshKey, openFiles, fetchFileContent]);

  // Clean up cache for closed files — use a ref to diff against previous openFiles
  const prevOpenIdsRef = useRef(new Set());
  useEffect(() => {
    const currentIds = new Set(openFiles.map((f) => f.id));
    const prevIds = prevOpenIdsRef.current;
    prevOpenIdsRef.current = currentIds;

    // Find removed IDs
    const removed = [...prevIds].filter((id) => !currentIds.has(id));
    if (removed.length === 0) return;

    setFileContents((prev) => {
      const next = { ...prev };
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

  // ── Resize handle drag ──────────────────────────────────────
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
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
  }, [width, onWidthChange]);

  // ── Wheel-to-horizontal-scroll on tab bar ───────────────────
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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

  // ── Line selection state ──────────────────────────────────────
  // No hover state — all hover effects use pure CSS via .codeLine:hover
  const [selectedLines, setSelectedLines] = useState(new Set());
  const lastClickedLineRef = useRef(null);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedLines(new Set());
    lastClickedLineRef.current = null;
  }, [activeFileId]);

  // Derived range from selection
  const selectionRange = useMemo(() => {
    if (selectedLines.size === 0) return null;
    const sorted = [...selectedLines].sort((a, b) => a - b);
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
  const linePropsBuilder = useCallback((lineNumber) => {
    const isSelected = selectedLines.has(lineNumber);
    return {
      style: {
        display: "block",
        backgroundColor: isSelected ? "rgba(99,102,241,0.12)" : undefined,
        borderLeft: isSelected ? "2px solid var(--accent-color)" : "2px solid transparent",
        position: "relative",
      },
      "data-line-number": lineNumber,
      className: `${styles.codeLine} ${isSelected ? styles.codeLineSelected : ""}`,
    };
  }, [selectedLines]);

  // Event delegation — handles line number clicks, inline @ button, and clears selection
  const handleCodeAreaClick = useCallback((e) => {
    // ── Inline @ mention button click ──
    const mentionBtn = e.target.closest(`.${styles.lineMentionBtn}`);
    if (mentionBtn) {
      e.stopPropagation();
      const lineEl = mentionBtn.closest("[data-line-number]");
      if (lineEl && activeFile && onMentionLines) {
        const lineNum = parseInt(lineEl.dataset.lineNumber, 10);
        if (!isNaN(lineNum)) {
          // If lines are selected, mention the full range; otherwise mention the hovered line
          if (selectedLines.size > 0) {
            handleMentionSelection();
          } else {
            onMentionLines(activeFile.path, lineNum, lineNum);
          }
        }
      }
      return;
    }

    // Detect click on a line number span (react-syntax-highlighter uses this class)
    const lineNumEl = e.target.closest(".react-syntax-highlighter-line-number");
    if (lineNumEl) {
      const lineEl = lineNumEl.closest("[data-line-number]");
      if (!lineEl) return;
      const lineNum = parseInt(lineEl.dataset.lineNumber, 10);
      if (isNaN(lineNum)) return;

      if (e.shiftKey && lastClickedLineRef.current != null) {
        // Shift+click: select range
        const from = Math.min(lastClickedLineRef.current, lineNum);
        const to = Math.max(lastClickedLineRef.current, lineNum);
        const newSet = new Set();
        for (let i = from; i <= to; i++) newSet.add(i);
        setSelectedLines(newSet);
      } else if (e.altKey && onMentionLines && activeFile) {
        // Alt+click line number: instant single-line @ mention
        e.stopPropagation();
        onMentionLines(activeFile.path, lineNum, lineNum);
      } else {
        // Regular click: toggle single line
        setSelectedLines((prev) => {
          const next = new Set(prev);
          if (next.has(lineNum)) next.delete(lineNum);
          else next.add(lineNum);
          return next;
        });
        lastClickedLineRef.current = lineNum;
      }
      return;
    }

    // Click on code content — clear selection
    setSelectedLines(new Set());
    lastClickedLineRef.current = null;
  }, [activeFile, selectedLines, onMentionLines, handleMentionSelection]);

  // ── Inject inline @ buttons into every code line (DOM-level) ───
  // Buttons are hidden by default and revealed on .codeLine:hover via CSS.
  // Uses direct DOM manipulation post-render to avoid re-rendering
  // the entire SyntaxHighlighter tree.
  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container || !onMentionLines) return;

    const lineEls = container.querySelectorAll("[data-line-number]");
    const injected = [];
    for (const el of lineEls) {
      // Skip if already injected
      if (el.querySelector(`.${styles.lineMentionBtn}`)) continue;
      const btn = document.createElement("button");
      btn.className = styles.lineMentionBtn;
      btn.type = "button";
      btn.title = "Reference this line in chat";
      btn.textContent = "@";
      el.appendChild(btn);
      injected.push(btn);
    }

    return () => {
      for (const btn of injected) btn.remove();
    };
  }, [cached?.content, onMentionLines]);

  return (
    <div
      className={`${styles.container} ${isCollapsed ? styles.containerCollapsed : ""}`}
      style={isCollapsed ? undefined : { width: `${width}px`, minWidth: `${width}px` }}
    >
      {/* Title bar — VSCode-style header */}
      <div className={styles.titleBar}>
        <span className={styles.titleBarLabel}>File Viewer</span>
        <div className={styles.titleBarActions}>
          <button
            type="button"
            className={`${styles.titleBarBtn} ${wordWrap ? styles.titleBarBtnActive : ""}`}
            onClick={() => setWordWrap((v) => !v)}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText size={14} />
          </button>
          <button
            type="button"
            className={styles.titleBarBtn}
            onClick={handleCloseAll}
            title="Close all tabs"
          >
            <XCircle size={14} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar} ref={tabBarRef}>
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
      <div className={styles.contentArea}>
        {/* Breadcrumb path */}
        {activeFile && (
          <div className={styles.breadcrumb}>
            {getPathSegments(activeFile.path).map((seg, i, arr) => (
              <span key={i}>
                {i > 0 && <ChevronRight size={8} className={styles.breadcrumbSep} />}
                <span style={i === arr.length - 1 ? { color: "var(--text-primary)", opacity: 1 } : undefined}>
                  {seg}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Loading state — only show full spinner for initial loads (no cached content) */}
        {cached?.loading && cached?.content == null && !cached?.isBinary && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Loading…
          </div>
        )}

        {/* Error state */}
        {cached?.error && !cached?.content && !cached?.isBinary && (
          <div className={styles.error}>{cached.error}</div>
        )}

        {/* Binary media viewer — image / audio / video / PDF */}
        {cached?.isBinary && cached?.rawUrl && (
          <div className={styles.mediaViewer}>
            {cached.mediaType === "image" && (
              <div className={styles.mediaImageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cached.rawUrl}
                  alt={getBasename(activeFile?.path)}
                  className={styles.mediaImage}
                  draggable={false}
                />
              </div>
            )}
            {cached.mediaType === "audio" && (
              <div className={styles.mediaAudioWrap}>
                <Music size={48} className={styles.mediaAudioIcon} />
                <AudioPlayerRecorderComponent src={cached.rawUrl} />
              </div>
            )}
            {cached.mediaType === "video" && (
              <div className={styles.mediaVideoWrap}>
                <video
                  src={cached.rawUrl}
                  controls
                  className={styles.mediaVideo}
                  preload="metadata"
                />
              </div>
            )}
            {cached.mediaType === "pdf" && (
              <iframe
                src={cached.rawUrl}
                className={styles.mediaPdf}
                title={getBasename(activeFile?.path)}
              />
            )}
            {!cached.mediaType && (
              <div className={styles.emptyState}>
                <FileCode size={24} />
                <span>Binary file — preview not available</span>
              </div>
            )}
          </div>
        )}

        {/* Syntax-highlighted content — stay visible during refresh (stale-while-revalidate) */}
        {cached?.content != null && !cached?.isBinary && (
          <div className={`${styles.codeScroll} ${!wordWrap ? styles.codeScrollNoWrap : ""}`} ref={codeScrollRef} onClick={handleCodeAreaClick}>
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
                  fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
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
          <div className={styles.emptyState}>
            <FileCode size={24} />
            <span>Select a file from the workspace</span>
          </div>
        )}

        {/* Resize handle */}
        <div
          className={styles.resizeHandle}
          ref={resizeRef}
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Meta bar */}
      {activeFile && (cached?.content != null || cached?.isBinary) && (
        <div className={styles.metaBar}>
          {cached.loading && (
            <>
              <span className={styles.spinner} style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              <span className={styles.metaDot} />
            </>
          )}
          {cached.isBinary ? (
            <>
              <span>{cached.mediaType || "Binary"}</span>
              {cached.sizeBytes > 0 && (
                <>
                  <span className={styles.metaDot} />
                  <span>{cached.sizeBytes >= 1048576 ? `${(cached.sizeBytes / 1048576).toFixed(1)} MB` : `${(cached.sizeBytes / 1024).toFixed(1)} KB`}</span>
                </>
              )}
            </>
          ) : (
            <>
              <span>{cached.totalLines || cached.content.split("\n").length} lines</span>
              {cached.languageLabel && (
                <>
                  <span className={styles.metaDot} />
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
