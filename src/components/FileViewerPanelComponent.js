"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { File, X, FileCode, ChevronRight } from "lucide-react";
import ToolsApiService from "../services/ToolsApiService.js";
import styles from "./FileViewerPanelComponent.module.css";

// ─── Language detection from file extension ─────────────────
const EXT_LANGUAGE_MAP = {
  js: "JavaScript", jsx: "JavaScript (JSX)", ts: "TypeScript", tsx: "TypeScript (TSX)",
  py: "Python", rb: "Ruby", rs: "Rust", go: "Go", java: "Java", kt: "Kotlin",
  c: "C", h: "C Header", cpp: "C++", hpp: "C++ Header", cs: "C#",
  swift: "Swift", m: "Objective-C", php: "PHP", pl: "Perl",
  sh: "Shell", bash: "Bash", zsh: "Zsh", fish: "Fish",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", less: "LESS",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", mdx: "MDX", txt: "Plain Text", csv: "CSV",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL",
  dockerfile: "Dockerfile", Dockerfile: "Dockerfile",
  env: "Environment", gitignore: "Git Ignore",
  lua: "Lua", r: "R", dart: "Dart", scala: "Scala", ex: "Elixir",
  vue: "Vue", svelte: "Svelte",
  proto: "Protocol Buffers", prisma: "Prisma",
  tf: "Terraform", hcl: "HCL",
  cjs: "CommonJS", mjs: "ES Module",
};

function detectLanguage(filename) {
  if (!filename) return null;
  const basename = filename.split("/").pop();
  // Handle dotfiles
  if (basename.startsWith(".")) {
    const name = basename.slice(1).toLowerCase();
    return EXT_LANGUAGE_MAP[name] || null;
  }
  // Dockerfile special case
  if (basename === "Dockerfile" || basename.startsWith("Dockerfile.")) return "Dockerfile";
  const ext = basename.split(".").pop()?.toLowerCase();
  return ext ? (EXT_LANGUAGE_MAP[ext] || null) : null;
}

function getBasename(filepath) {
  return filepath?.split("/").pop() || filepath;
}

function getPathSegments(filepath) {
  if (!filepath) return [];
  return filepath.split("/").filter(Boolean);
}

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
      <File size={11} className={styles.tabIcon} />
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
 * Supports multiple files as tabs, read-only viewing with line numbers.
 *
 * Props:
 *   openFiles    — Array of { id, path } objects
 *   activeFileId — Currently visible file ID
 *   onSelectFile — (id) => void — switch active tab
 *   onCloseFile  — (id) => void — close a tab
 *   isOpen       — Whether the panel is expanded
 *   width        — Panel width in px (default 500)
 *   onWidthChange — (newWidth) => void — resize callback
 */
export default function FileViewerPanelComponent({
  openFiles = [],
  activeFileId = null,
  onSelectFile,
  onCloseFile,
  isOpen = false,
  width = 500,
  onWidthChange,
}) {
  const [fileContents, setFileContents] = useState({}); // { [id]: { content, totalLines, language, error, loading } }
  const codeScrollRef = useRef(null);
  const resizeRef = useRef(null);

  const activeFile = openFiles.find((f) => f.id === activeFileId) || null;
  const cached = activeFile ? fileContents[activeFile.id] : null;

  // Track in-flight fetches outside of React state to avoid cascading renders
  const inflightRef = useRef(new Set());

  // Fetch file content when active file changes
  const fetchFileContent = useCallback((id, path) => {
    if (inflightRef.current.has(id)) return;
    inflightRef.current.add(id);

    // Set loading state immediately (sync — before the async gap)
    setFileContents((prev) => ({
      ...prev,
      [id]: { loading: true, content: null, totalLines: 0, language: null, error: null },
    }));

    ToolsApiService.readFile(path)
      .then((result) => {
        const language = detectLanguage(path) || result.language || null;
        setFileContents((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            content: result.content ?? "",
            totalLines: result.totalLines || 0,
            language,
            error: result.error || null,
          },
        }));
      })
      .catch((err) => {
        setFileContents((prev) => ({
          ...prev,
          [id]: { loading: false, content: null, totalLines: 0, language: null, error: err.message },
        }));
      })
      .finally(() => {
        inflightRef.current.delete(id);
      });
  }, []);

  useEffect(() => {
    if (!activeFile) return;
    const { id, path } = activeFile;
    if (fileContents[id]?.content != null || fileContents[id]?.loading) return;
    fetchFileContent(id, path);
  }, [activeFile, fileContents, fetchFileContent]);

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

  const isCollapsed = !isOpen || openFiles.length === 0;

  // ── Render lines ────────────────────────────────────────────
  const renderLines = () => {
    if (!cached?.content) return null;
    const lines = cached.content.split("\n");
    // For very large files, we might want to virtualize —
    // but for now, slice to a sensible limit
    const MAX_LINES = 10000;
    const displayLines = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;

    return (
      <table className={styles.codeTable}>
        <tbody>
          {displayLines.map((line, i) => (
            <tr key={i}>
              <td className={styles.lineNumber}>{i + 1}</td>
              <td className={styles.lineContent}>{line || "\u00A0"}</td>
            </tr>
          ))}
          {lines.length > MAX_LINES && (
            <tr>
              <td className={styles.lineNumber}>…</td>
              <td className={styles.lineContent} style={{ opacity: 0.5, fontStyle: "italic" }}>
                {`${lines.length - MAX_LINES} more lines not shown`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div
      className={`${styles.container} ${isCollapsed ? styles.containerCollapsed : ""}`}
      style={isCollapsed ? undefined : { width: `${width}px`, minWidth: `${width}px` }}
    >
      {/* Tab bar */}
      <div className={styles.tabBar}>
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

        {/* Loading state */}
        {cached?.loading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Loading…
          </div>
        )}

        {/* Error state */}
        {cached?.error && (
          <div className={styles.error}>{cached.error}</div>
        )}

        {/* Content */}
        {cached?.content != null && !cached.loading && (
          <div className={styles.codeScroll} ref={codeScrollRef}>
            {renderLines()}
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
      {activeFile && cached?.content != null && !cached.loading && (
        <div className={styles.metaBar}>
          <span>{cached.totalLines || cached.content.split("\n").length} lines</span>
          {cached.language && (
            <>
              <span className={styles.metaDot} />
              <span>{cached.language}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
