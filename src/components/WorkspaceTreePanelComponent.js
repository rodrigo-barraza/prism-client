"use client";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  AtSign,
  Check,
  Lock,
} from "lucide-react";
import FileTypeIconComponent from "./FileTypeIconComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import WorkspaceService from "../services/WorkspaceService";
import styles from "./WorkspaceTreePanelComponent.module.css";

// ─── Recursive Directory Tree Node ──────────────────────────
const TreeNode = memo(function TreeNode({ node, depth = 0, parentPath = "", expandedPaths, expandedTick, onToggleExpand, onMentionFile, onOpenFile }) {
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
            <FileTypeIconComponent filename={node.name} size={10} className={styles.treeFileIcon} />
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
            <TreeNode key={child.name} node={child} depth={depth + 1} parentPath={nodePath} expandedPaths={expandedPaths} expandedTick={expandedTick} onToggleExpand={onToggleExpand} onMentionFile={onMentionFile} onOpenFile={onOpenFile} />
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
  locked = false,
}) {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const [treeData, setTreeData] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  // ── Lifted expanded-state: persists across data refreshes ──
  const expandedPathsRef = useRef(new Set());
  // Counter to force re-render when the Set mutates — also passed to TreeNode
  // so React.memo detects changes (the Set ref itself never changes)
  const [expandedTick, setExpandedTick] = useState(0);

  const onToggleExpand = useCallback((path) => {
    const set = expandedPathsRef.current;
    if (set.has(path)) {
      set.delete(path);
    } else {
      set.add(path);
    }
    setExpandedTick((t) => t + 1);
  }, []);

  const hasMultiple = workspaces.length > 1 && !locked;

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
          {locked && (
            <Lock size={9} className={styles.headerLock} />
          )}
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
              <TreeNode key={node.name} node={node} expandedPaths={expandedPaths} expandedTick={expandedTick} onToggleExpand={onToggleExpand} onMentionFile={onMentionFile} onOpenFile={onOpenFile} />
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
