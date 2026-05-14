"use client";

import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { File, X, FileCode, ChevronRight } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import ToolsApiService from "../services/ToolsApiService.js";
import styles from "./FileViewerPanelComponent.module.css";

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
  const [fileContents, setFileContents] = useState({}); // { [id]: { content, totalLines, language, languageLabel, error, loading } }
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

    // Set loading state immediately
    setFileContents((prev) => ({
      ...prev,
      [id]: { loading: true, content: null, totalLines: 0, language: null, languageLabel: null, error: null },
    }));

    ToolsApiService.readFile(path)
      .then((result) => {
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
            error: result.error || null,
          },
        }));
      })
      .catch((err) => {
        setFileContents((prev) => ({
          ...prev,
          [id]: { loading: false, content: null, totalLines: 0, language: null, languageLabel: null, error: err.message },
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

  // Memoize the start line offset from the API response
  const startLineNumber = useMemo(() => {
    if (!cached) return 1;
    // The API can return startLine if partial reads were used
    return 1;
  }, [cached]);

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

        {/* Syntax-highlighted content */}
        {cached?.content != null && !cached.loading && (
          <div className={styles.codeScroll} ref={codeScrollRef}>
            <SyntaxHighlighter
              style={codeTheme}
              language={cached.language || "text"}
              showLineNumbers
              startingLineNumber={startLineNumber}
              wrapLongLines
              lineNumberStyle={{
                minWidth: "3em",
                paddingRight: "12px",
                color: "rgba(255,255,255,0.2)",
                userSelect: "none",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
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
          {cached.languageLabel && (
            <>
              <span className={styles.metaDot} />
              <span>{cached.languageLabel}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
