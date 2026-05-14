"use client";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  AtSign,
  Check,
  File,
  FileCode2,
  FileJson2,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileType,
  FileKey,
  FileCog,
  FileTerminal,
  Braces,
  Database,
  Globe,
  Palette,
  Hash,
  Gem,
  Hexagon,
  Box,
  ScrollText,
  ShieldCheck,
  TestTubeDiagonal,
  BookOpen,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceContextComponent";
import WorkspaceService from "../services/WorkspaceService";
import styles from "./WorkspaceTreePanelComponent.module.css";

// ─── File Extension → Icon + Color Class Mapping ────────────
const EXTENSION_ICON_MAP = {
  // JavaScript / TypeScript
  js:       { icon: FileCode2,       cls: "iconJs" },
  jsx:      { icon: FileCode2,       cls: "iconJsx" },
  ts:       { icon: FileCode2,       cls: "iconTs" },
  tsx:      { icon: FileCode2,       cls: "iconTsx" },
  mjs:      { icon: FileCode2,       cls: "iconJs" },
  cjs:      { icon: FileCode2,       cls: "iconJs" },
  // Web
  html:     { icon: Globe,           cls: "iconHtml" },
  htm:      { icon: Globe,           cls: "iconHtml" },
  css:      { icon: Palette,         cls: "iconCss" },
  scss:     { icon: Palette,         cls: "iconScss" },
  sass:     { icon: Palette,         cls: "iconScss" },
  less:     { icon: Palette,         cls: "iconCss" },
  svg:      { icon: FileImage,       cls: "iconSvg" },
  // Data / Config
  json:     { icon: FileJson2,       cls: "iconJson" },
  jsonc:    { icon: FileJson2,       cls: "iconJson" },
  yaml:     { icon: FileCog,         cls: "iconYaml" },
  yml:      { icon: FileCog,         cls: "iconYaml" },
  toml:     { icon: FileCog,         cls: "iconToml" },
  ini:      { icon: FileCog,         cls: "iconConfig" },
  xml:      { icon: FileCode2,       cls: "iconXml" },
  csv:      { icon: FileSpreadsheet, cls: "iconCsv" },
  // Python
  py:       { icon: FileCode2,       cls: "iconPython" },
  pyw:      { icon: FileCode2,       cls: "iconPython" },
  ipynb:    { icon: BookOpen,        cls: "iconNotebook" },
  // Ruby
  rb:       { icon: Gem,             cls: "iconRuby" },
  // Rust
  rs:       { icon: Hexagon,         cls: "iconRust" },
  // Go
  go:       { icon: FileCode2,       cls: "iconGo" },
  // C / C++ / C#
  c:        { icon: Hash,            cls: "iconC" },
  h:        { icon: Hash,            cls: "iconC" },
  cpp:      { icon: Hash,            cls: "iconCpp" },
  hpp:      { icon: Hash,            cls: "iconCpp" },
  cs:       { icon: Hash,            cls: "iconCsharp" },
  // Java / Kotlin
  java:     { icon: FileCode2,       cls: "iconJava" },
  kt:       { icon: FileCode2,       cls: "iconKotlin" },
  kts:      { icon: FileCode2,       cls: "iconKotlin" },
  // Swift
  swift:    { icon: FileCode2,       cls: "iconSwift" },
  // PHP
  php:      { icon: FileCode2,       cls: "iconPhp" },
  // Shell
  sh:       { icon: FileTerminal,    cls: "iconShell" },
  bash:     { icon: FileTerminal,    cls: "iconShell" },
  zsh:      { icon: FileTerminal,    cls: "iconShell" },
  fish:     { icon: FileTerminal,    cls: "iconShell" },
  bat:      { icon: FileTerminal,    cls: "iconShell" },
  cmd:      { icon: FileTerminal,    cls: "iconShell" },
  ps1:      { icon: FileTerminal,    cls: "iconShell" },
  // Markdown / Docs
  md:       { icon: BookOpen,        cls: "iconMarkdown" },
  mdx:      { icon: BookOpen,        cls: "iconMarkdown" },
  txt:      { icon: FileText,        cls: "iconText" },
  rst:      { icon: FileText,        cls: "iconText" },
  log:      { icon: ScrollText,      cls: "iconLog" },
  // Images
  png:      { icon: FileImage,       cls: "iconImage" },
  jpg:      { icon: FileImage,       cls: "iconImage" },
  jpeg:     { icon: FileImage,       cls: "iconImage" },
  gif:      { icon: FileImage,       cls: "iconImage" },
  webp:     { icon: FileImage,       cls: "iconImage" },
  ico:      { icon: FileImage,       cls: "iconImage" },
  bmp:      { icon: FileImage,       cls: "iconImage" },
  // Video
  mp4:      { icon: FileVideo,       cls: "iconVideo" },
  webm:     { icon: FileVideo,       cls: "iconVideo" },
  mkv:      { icon: FileVideo,       cls: "iconVideo" },
  avi:      { icon: FileVideo,       cls: "iconVideo" },
  mov:      { icon: FileVideo,       cls: "iconVideo" },
  // Audio
  mp3:      { icon: FileAudio,       cls: "iconAudio" },
  wav:      { icon: FileAudio,       cls: "iconAudio" },
  flac:     { icon: FileAudio,       cls: "iconAudio" },
  ogg:      { icon: FileAudio,       cls: "iconAudio" },
  aac:      { icon: FileAudio,       cls: "iconAudio" },
  // Archives
  zip:      { icon: FileArchive,     cls: "iconArchive" },
  tar:      { icon: FileArchive,     cls: "iconArchive" },
  gz:       { icon: FileArchive,     cls: "iconArchive" },
  bz2:      { icon: FileArchive,     cls: "iconArchive" },
  "7z":     { icon: FileArchive,     cls: "iconArchive" },
  rar:      { icon: FileArchive,     cls: "iconArchive" },
  // Fonts
  woff:     { icon: FileType,        cls: "iconFont" },
  woff2:    { icon: FileType,        cls: "iconFont" },
  ttf:      { icon: FileType,        cls: "iconFont" },
  otf:      { icon: FileType,        cls: "iconFont" },
  eot:      { icon: FileType,        cls: "iconFont" },
  // Database
  sql:      { icon: Database,        cls: "iconDatabase" },
  sqlite:   { icon: Database,        cls: "iconDatabase" },
  db:       { icon: Database,        cls: "iconDatabase" },
  // Security / Env
  env:      { icon: FileKey,         cls: "iconEnv" },
  pem:      { icon: ShieldCheck,     cls: "iconCert" },
  crt:      { icon: ShieldCheck,     cls: "iconCert" },
  key:      { icon: FileKey,         cls: "iconEnv" },
  // Docker
  dockerfile: { icon: Box,           cls: "iconDocker" },
  // Test files (matched by name pattern, not extension)
  test:     { icon: TestTubeDiagonal, cls: "iconTest" },
  spec:     { icon: TestTubeDiagonal, cls: "iconTest" },
  // Package / Lock
  lock:     { icon: FileKey,         cls: "iconLock" },
  // TypeScript declaration
  "d.ts":   { icon: Braces,          cls: "iconDts" },
  // Map files
  map:      { icon: Braces,          cls: "iconMap" },
};

// Special filename matches (case-insensitive)
const FILENAME_ICON_MAP = {
  dockerfile:       { icon: Box,           cls: "iconDocker" },
  "docker-compose.yml":  { icon: Box,      cls: "iconDocker" },
  "docker-compose.yaml": { icon: Box,      cls: "iconDocker" },
  ".gitignore":     { icon: FileCog,       cls: "iconGit" },
  ".gitattributes": { icon: FileCog,       cls: "iconGit" },
  ".prettierrc":    { icon: FileCog,       cls: "iconConfig" },
  ".eslintrc":      { icon: FileCog,       cls: "iconConfig" },
  ".editorconfig":  { icon: FileCog,       cls: "iconConfig" },
  "makefile":       { icon: FileTerminal,  cls: "iconShell" },
  "license":        { icon: ScrollText,    cls: "iconLicense" },
  "readme.md":      { icon: BookOpen,      cls: "iconMarkdown" },
};

const DEFAULT_FILE_ICON = { icon: File, cls: "iconDefault" };

function getFileIcon(filename) {
  const lower = filename.toLowerCase();

  // 1. Exact filename match
  if (FILENAME_ICON_MAP[lower]) return FILENAME_ICON_MAP[lower];

  // 2. Check for compound extensions (e.g., ".d.ts", ".test.js")
  const parts = lower.split(".");
  if (parts.length >= 3) {
    const compoundExt = parts.slice(-2).join(".");
    if (EXTENSION_ICON_MAP[compoundExt]) return EXTENSION_ICON_MAP[compoundExt];
    // Test/spec detection
    const secondLast = parts[parts.length - 2];
    if (secondLast === "test" || secondLast === "spec") {
      return EXTENSION_ICON_MAP.test;
    }
  }

  // 3. Simple extension match
  const ext = parts.length > 1 ? parts.pop() : "";
  if (ext && EXTENSION_ICON_MAP[ext]) return EXTENSION_ICON_MAP[ext];

  return DEFAULT_FILE_ICON;
}

// ─── Recursive Directory Tree Node ──────────────────────────
const TreeNode = memo(function TreeNode({ node, depth = 0, parentPath = "", expandedPaths, onToggleExpand, onMentionFile, onOpenFile }) {
  const isDir = node.type === "directory";
  const hasChildren = isDir && node.children?.length > 0;
  const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const expanded = expandedPaths.has(nodePath);

  const handleMention = (e) => {
    e.stopPropagation();
    onMentionFile?.(nodePath);
  };

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.treeRow} ${isDir ? styles.treeRowDir : styles.treeRowFile}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (isDir) {
            onToggleExpand(nodePath);
          } else {
            onOpenFile?.(nodePath);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown size={10} className={styles.treeChevron} />
            ) : (
              <ChevronRight size={10} className={styles.treeChevron} />
            )}
            <FolderOpen size={11} className={styles.treeFolderIcon} />
          </>
        ) : (
          <>
            <span className={styles.treeChevronSpacer} />
            {(() => {
              const { icon: Icon, cls } = getFileIcon(node.name);
              return <Icon size={10} className={`${styles.treeFileIcon} ${styles[cls] || ""}`} />;
            })()}
          </>
        )}
        <span className={styles.treeName}>{node.name}</span>
        {onMentionFile && (
          <button
            type="button"
            className={styles.treeMentionBtn}
            onClick={handleMention}
            title={`Mention @${nodePath}`}
          >
            <AtSign size={10} />
          </button>
        )}
        {isDir && hasChildren && (
          <span className={styles.treeCount}>{node.children.length}</span>
        )}
      </div>
      {isDir && expanded && hasChildren && (
        <div className={styles.treeChildren}>
          {node.children.map((child) => (
            <TreeNode key={child.name} node={child} depth={depth + 1} parentPath={nodePath} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onMentionFile={onMentionFile} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * Full-panel workspace directory tree — used as a standalone tab
 * in the left sidebar of ThreePanelLayout.
 *
 * When multiple workspaces exist, the header becomes a clickable switcher
 * that stays in sync with WorkspaceContext (same state as "New conversation in").
 */
export default function WorkspaceTreePanelComponent({
  workspaceTreeRefreshKey = 0,
  onMentionFile,
  onOpenFile,
}) {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const [treeData, setTreeData] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  // ── Lifted expanded-state: persists across data refreshes ──
  const expandedPathsRef = useRef(new Set());
  // Counter to force re-render when the Set mutates (avoids converting to state)
  const [, setExpandedTick] = useState(0);

  const onToggleExpand = useCallback((path) => {
    const set = expandedPathsRef.current;
    if (set.has(path)) {
      set.delete(path);
    } else {
      set.add(path);
    }
    setExpandedTick((t) => t + 1);
  }, []);

  const hasMultiple = workspaces.length > 1;

  // Close switcher on outside click
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  // ── Auto-expand root-level directories on initial load ──
  const autoExpandedRef = useRef(false);
  const autoExpandRoots = useCallback((tree) => {
    if (autoExpandedRef.current || !tree?.length) return;
    autoExpandedRef.current = true;
    const set = expandedPathsRef.current;
    for (const node of tree) {
      if (node.type === "directory") {
        set.add(node.name);
      }
    }
    setExpandedTick((t) => t + 1);
  }, []);

  // ── Initial fetch (shows loading indicator) ──
  const fetchTree = useCallback(async () => {
    if (!currentWorkspace?.path) return;
    setTreeLoading(true);
    try {
      const data = await WorkspaceService.tree(currentWorkspace.path);
      setTreeData(data);
      autoExpandRoots(data?.tree);
    } catch {
      setTreeData(null);
    } finally {
      setTreeLoading(false);
    }
  }, [currentWorkspace?.path, autoExpandRoots]);

  // ── Silent background refresh (no loading indicator, tree stays mounted) ──
  const silentRefresh = useCallback(async () => {
    if (!currentWorkspace?.path) return;
    try {
      const data = await WorkspaceService.tree(currentWorkspace.path);
      setTreeData(data);
    } catch {
      // Keep existing tree on transient failure
    }
  }, [currentWorkspace?.path]);

  // Fetch on mount
  useEffect(() => {
    if (!treeData && !treeLoading) {
      fetchTree();
    }
  }, [treeData, treeLoading, fetchTree]);

  // Reset tree + expanded state when workspace changes
  useEffect(() => {
    setTreeData(null);
    expandedPathsRef.current = new Set();
    autoExpandedRef.current = false;
  }, [currentWorkspace?.path]);

  // Live-refresh: debounced silent re-fetch when workspaceTreeRefreshKey changes
  const treeRefreshTimerRef = useRef(null);
  useEffect(() => {
    if (workspaceTreeRefreshKey === 0) return;
    if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    treeRefreshTimerRef.current = setTimeout(() => {
      treeRefreshTimerRef.current = null;
      silentRefresh();
    }, 1500);
    return () => {
      if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    };
  }, [workspaceTreeRefreshKey, silentRefresh]);

  if (!currentWorkspace) return null;

  // Snapshot the Set into a stable reference for this render
  const expandedPaths = expandedPathsRef.current;

  return (
    <div className={styles.container}>
      {/* ── Header — static label or workspace switcher ── */}
      <div className={styles.headerWrapper} ref={switcherRef}>
        <div
          className={`${styles.header} ${hasMultiple ? styles.headerClickable : ""}`}
          onClick={hasMultiple ? () => setSwitcherOpen((v) => !v) : undefined}
          role={hasMultiple ? "button" : undefined}
          tabIndex={hasMultiple ? 0 : undefined}
          title={hasMultiple ? `Switch workspace — ${currentWorkspace.path}` : currentWorkspace.path}
        >
          <FolderOpen size={11} className={styles.headerIcon} />
          <span className={styles.headerLabel}>{currentWorkspace.name}</span>
          {hasMultiple && (
            <ChevronDown size={10} className={`${styles.headerChevron} ${switcherOpen ? styles.headerChevronOpen : ""}`} />
          )}
          {treeData?.totalEntries > 0 && (
            <span className={styles.headerCount}>
              {treeData.totalEntries}{treeData.truncated ? "+" : ""}
            </span>
          )}
        </div>

        {/* ── Workspace switcher dropdown ── */}
        {switcherOpen && (
          <div className={styles.switcherDropdown}>
            {workspaces.map((w) => {
              const isActive = currentWorkspace?.path === w.path;
              return (
                <button
                  key={w.id}
                  type="button"
                  className={`${styles.switcherItem} ${isActive ? styles.switcherItemActive : ""}`}
                  onClick={() => {
                    setCurrentWorkspace(w);
                    setSwitcherOpen(false);
                  }}
                  title={w.path}
                >
                  <FolderOpen size={10} className={styles.switcherItemIcon} />
                  <span className={styles.switcherItemName}>{w.name}</span>
                  {isActive && <Check size={10} className={styles.switcherItemCheck} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.treeScroll}>
        {treeLoading && (
          <div className={styles.treeLoading}>Loading…</div>
        )}
        {!treeLoading && treeData?.tree && treeData.tree.length > 0 && (
          <div className={styles.treeRoot}>
            {treeData.tree.map((node) => (
              <TreeNode key={node.name} node={node} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onMentionFile={onMentionFile} onOpenFile={onOpenFile} />
            ))}
          </div>
        )}
        {!treeLoading && treeData && (!treeData.tree || treeData.tree.length === 0) && (
          <div className={styles.treeLoading}>Empty directory</div>
        )}
        {!treeLoading && !treeData && (
          <div className={styles.treeLoading}>Unable to load tree</div>
        )}
      </div>
    </div>
  );
}
