"use client";
import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  AtSign,
  Check,
  Lock,
  WifiOff,
} from "lucide-react";
import FileTypeIconComponent from "./FileTypeIconComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import WorkspaceService from "../services/WorkspaceService";
import type {
  WorkspaceTreeResponse,
  WorkspaceTreeNode,
  WorkspaceItem,
} from "../services/WorkspaceService";
import { SearchInputComponent } from "@rodrigo-barraza/components-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./WorkspaceTreePanelComponent.module.css";

// -- Type Definitions ------------------------------------------

interface TreeNodeProps {
  node: WorkspaceTreeNode;
  depth?: number;
  parentPath?: string;
  expandedPaths: Set<string>;
  expandedTick: number;
  onToggleExpand: (path: string) => void;
  onMentionFile?: ((path: string) => void) | null;
  onOpenFile?: ((path: string) => void) | null;
}

interface WorkspaceTreePanelProps {
  workspaceTreeRefreshKey?: number;
  onMentionFile?: ((path: string) => void) | null;
  onOpenFile?: ((path: string) => void) | null;
  locked?: boolean;
  unavailableWorkspace?: string | null;
  hideHeader?: boolean;
  onTreeStats?: (
    stats: { totalEntries: number; truncated: boolean } | null,
  ) => void;
}

// --- Recursive Directory Tree Node --------------------------
const TreeNode = memo(function TreeNode({
  node,
  depth = 0,
  parentPath = "",
  expandedPaths,
  expandedTick,
  onToggleExpand,
  onMentionFile,
  onOpenFile,
}: TreeNodeProps) {
  const isDir = node.type === "directory";
  const hasChildren = isDir && (node.children?.length ?? 0) > 0;
  const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const expanded = expandedPaths.has(nodePath);

  const handleMention = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onMentionFile?.(nodePath);
  };

  return (
    <div className={styles['tree-node']}>
      <div
        className={`${styles['tree-layout-row']} ${isDir ? styles['tree-layout-row-dir'] : styles['tree-layout-row-file']}`}
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
              <ChevronDown size={10} className={styles['tree-chevron']} />
            ) : (
              <ChevronRight size={10} className={styles['tree-chevron']} />
            )}
            <FolderOpen size={11} className={styles['tree-folder-icon']} />
          </>
        ) : (
          <>
            <span className={styles['tree-chevron-spacer']} />
            <FileTypeIconComponent
              filename={node.name}
              size={10}
              className={styles['tree-file-icon']}
            />
          </>
        )}
        <span className={styles['tree-name']}>{node.name}</span>
        {onMentionFile && (
          <button
            type="button"
            className={styles['tree-mention-button']}
            onClick={handleMention}
            title={`Mention @${nodePath}`}
          >
            <AtSign size={10} />
          </button>
        )}
        {isDir && hasChildren && (
          <span className={styles['tree-count']}>{node.children!.length}</span>
        )}
      </div>
      {isDir && expanded && hasChildren && (
        <div className={styles['tree-children']}>
          {node.children!.map((child: WorkspaceTreeNode) => (
            <TreeNode
              key={child.name}
              node={child}
              depth={depth + 1}
              parentPath={nodePath}
              expandedPaths={expandedPaths}
              expandedTick={expandedTick}
              onToggleExpand={onToggleExpand}
              onMentionFile={onMentionFile}
              onOpenFile={onOpenFile}
            />
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
  unavailableWorkspace = null,
  hideHeader = false,
  onTreeStats,
}: WorkspaceTreePanelProps) {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const [treeData, setTreeData] = useState<WorkspaceTreeResponse | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [hasTreeFetchFailed, setHasTreeFetchFailed] = useState<boolean>(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // -- Lifted expanded-state: persists across data refreshes --
  const expandedPathsRef = useRef<Set<string>>(new Set());
  // Counter to force re-render when the Set mutates — also passed to TreeNode
  // so React.memo detects changes (the Set ref itself never changes)
  const [expandedTick, setExpandedTick] = useState(0);

  const onToggleExpand = useCallback((path: string) => {
    const set = expandedPathsRef.current;
    if (set.has(path)) {
      set.delete(path);
    } else {
      set.add(path);
    }
    setExpandedTick((tool) => tool + 1);
  }, []);

  const hasMultiple = workspaces.length > 1 && !locked;

  // Close switcher on outside click
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  // -- Auto-expand root-level directories on initial load --
  const autoExpandedRef = useRef<boolean>(false);
  const autoExpandRoots = useCallback(
    (tree: WorkspaceTreeNode[] | undefined) => {
      if (autoExpandedRef.current || !tree?.length) return;
      autoExpandedRef.current = true;
      const set = expandedPathsRef.current;
      for (const node of tree) {
        if (node.type === "directory") {
          set.add(node.name);
        }
      }
      setExpandedTick((tool) => tool + 1);
    },
    [],
  );

  // -- Initial fetch (shows loading indicator) --
  const fetchTree = useCallback(async () => {
    if (!currentWorkspace?.path) return;
    setTreeLoading(true);
    setHasTreeFetchFailed(false);
    try {
      const data = await WorkspaceService.tree(currentWorkspace.path);
      setTreeData(data);
      autoExpandRoots(data?.tree);
    } catch {
      setTreeData(null);
      setHasTreeFetchFailed(true);
    } finally {
      setTreeLoading(false);
    }
  }, [currentWorkspace?.path, autoExpandRoots]);

  // -- Silent background refresh (no loading indicator, tree stays mounted) --
  const silentRefresh = useCallback(async () => {
    if (!currentWorkspace?.path) return;
    try {
      const data = await WorkspaceService.tree(currentWorkspace.path);
      setTreeData(data);
      setHasTreeFetchFailed(false);
    } catch {
      // Keep existing tree on transient failure
    }
  }, [currentWorkspace?.path]);

  // Fetch on mount
  useEffect(() => {
    if (!treeData && !treeLoading && !hasTreeFetchFailed) {
      fetchTree();
    }
  }, [treeData, treeLoading, hasTreeFetchFailed, fetchTree]);

  // Reset tree + expanded state when workspace changes
  useEffect(() => {
    setTreeData(null);
    setHasTreeFetchFailed(false);
    expandedPathsRef.current = new Set();
    autoExpandedRef.current = false;
    setSearchQuery("");
  }, [currentWorkspace?.path]);

  // Live-refresh: debounced silent re-fetch when workspaceTreeRefreshKey changes
  const treeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    if (workspaceTreeRefreshKey === 0) return;
    if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    treeRefreshTimerRef.current = setTimeout(() => {
      treeRefreshTimerRef.current = null;
      silentRefresh();
    }, 1500);
    return () => {
      if (treeRefreshTimerRef.current)
        clearTimeout(treeRefreshTimerRef.current);
    };
  }, [workspaceTreeRefreshKey, silentRefresh]);

  // Propagate tree stats to parent (for standardized tab header count)
  useEffect(() => {
    if (!onTreeStats) return;
    if (treeData?.totalEntries !== undefined) {
      onTreeStats({
        totalEntries: treeData.totalEntries,
        truncated: !!treeData.truncated,
      });
    } else {
      onTreeStats(null);
    }
  }, [treeData?.totalEntries, treeData?.truncated, onTreeStats]);

  // -- Substring Path Matching & Recursive Tree Filtering --
  const { filteredTree, autoExpandedPaths } = useMemo(() => {
    if (!searchQuery.trim() || !treeData?.tree) {
      return { filteredTree: treeData?.tree || [], autoExpandedPaths: null };
    }
    const lowerQuery = searchQuery.trim().toLowerCase();
    const autoPaths = new Set<string>();

    const process = (
      items: WorkspaceTreeNode[],
      currentParent: string,
    ): WorkspaceTreeNode[] => {
      const result: WorkspaceTreeNode[] = [];
      for (const node of items) {
        const nodePath = currentParent
          ? `${currentParent}/${node.name}`
          : node.name;
        const nameMatches = node.name.toLowerCase().includes(lowerQuery);

        if (node.type === "directory" && node.children) {
          const filteredChildren = process(node.children, nodePath);
          const hasMatchingChildren = filteredChildren.length > 0;

          if (nameMatches || hasMatchingChildren) {
            autoPaths.add(nodePath);
            result.push({
              ...node,
              children: filteredChildren,
            });
          }
        } else {
          if (nameMatches) {
            result.push(node);
          }
        }
      }
      return result;
    };

    const filtered = process(treeData.tree, "");
    return { filteredTree: filtered, autoExpandedPaths: autoPaths };
  }, [treeData?.tree, searchQuery]);

  if (!currentWorkspace && !unavailableWorkspace) return null;

  // -- Conversation workspace not currently connected --
  if (unavailableWorkspace) {
    // Extract the last path segment for a friendlier label
    const label =
      unavailableWorkspace.split("/").filter(Boolean).pop() ||
      unavailableWorkspace;
    return (
      <div className={styles['container']}>
        {!hideHeader && (
          <div className={styles['header-wrapper']}>
            <div className={styles['header']}>
              <FolderOpen size={11} className={styles['header-icon']} />
              <span className={styles['header-label']}>{label}</span>
            </div>
          </div>
        )}
        <div className={styles['tree-scroll']}>
          <div className={styles['unavailable-state']}>
            <WifiOff size={20} className={styles['unavailable-icon']} />
            <span className={styles['unavailable-title']}>
              Workspace Unavailable
            </span>
            <span className={styles['unavailable-path']}>
              {unavailableWorkspace}
            </span>
            <span className={styles['unavailable-hint']}>
              This conversation&apos;s workspace is not currently connected. Connect
              the workspace or switch to an available one to browse files.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Snapshot the Set into a stable reference for this render, merging auto-expanded paths if searching
  const expandedPaths = autoExpandedPaths || expandedPathsRef.current;

  return (
    <div className={`workspace-tree-panel-component ${styles['container']}`}>
      {/* -- Header — static label or workspace switcher -- */}
      {!hideHeader && (
        <div className={styles['header-wrapper']} ref={switcherRef}>
          <div
            className={`${styles['header']} ${hasMultiple ? styles['header-clickable'] : ""}`}
            onClick={hasMultiple ? () => setSwitcherOpen((value) => !value) : undefined}
            role={hasMultiple ? "button" : undefined}
            tabIndex={hasMultiple ? 0 : undefined}
            title={
              hasMultiple
                ? `Switch workspace — ${currentWorkspace!.path}`
                : currentWorkspace!.path
            }
          >
            <FolderOpen size={11} className={styles['header-icon']} />
            <span className={styles['header-label']}>{currentWorkspace!.name}</span>
            {locked && <Lock size={9} className={styles['header-lock']} />}
            {hasMultiple && (
              <ChevronDown
                size={10}
                className={`${styles['header-chevron']} ${switcherOpen ? styles['header-chevron-open'] : ""}`}
              />
            )}
            {treeData?.totalEntries !== undefined &&
              treeData.totalEntries > 0 && (
                <span className={styles['header-count']}>
                  {treeData.totalEntries}
                  {treeData.truncated ? "+" : ""}
                </span>
              )}
          </div>

          {/* -- Workspace switcher dropdown -- */}
          {switcherOpen && (
            <div className={styles['switcher-dropdown']}>
              {workspaces.map((workspace: WorkspaceItem) => {
                const isActive = currentWorkspace?.path === workspace.path;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    className={`${styles['switcher-item']} ${isActive ? styles['switcher-item-is-active-state'] : ""}`}
                    onClick={() => {
                      setCurrentWorkspace(workspace);
                      setSwitcherOpen(false);
                    }}
                    title={workspace.path}
                  >
                    <FolderOpen size={10} className={styles['switcher-item-icon']} />
                    <div className={styles['switcher-item-details']}>
                      <span className={styles['switcher-item-name']}>{workspace.name}</span>
                      <span className={styles['switcher-item-path']}>{workspace.path}</span>
                    </div>
                    {workspace.isAgentServed && (
                      <span className={styles['switcher-item-agent-badge']}>remote</span>
                    )}
                    {isActive && (
                      <Check size={10} className={styles['switcher-item-check']} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={styles['tree-scroll']}>
        {/* Search input is ALWAYS rendered here once the tree is loaded and not empty */}
        {!treeLoading && treeData?.tree && treeData.tree.length > 0 && (
          <div className={styles["search-input-container-section"]}>
            <SearchInputComponent
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Filter files…"
              compact
              className={styles["search-input-element-field"]}
            />
          </div>
        )}

        {treeLoading && <PanelLoadingSpinner />}
        {!treeLoading && treeData?.tree && filteredTree.length > 0 && (
          <div className={styles['tree-root']}>
            {filteredTree.map((node: WorkspaceTreeNode) => (
              <TreeNode
                key={node.name}
                node={node}
                expandedPaths={expandedPaths}
                expandedTick={expandedTick}
                onToggleExpand={onToggleExpand}
                onMentionFile={onMentionFile}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        )}
        {!treeLoading &&
          treeData?.tree &&
          treeData.tree.length > 0 &&
          filteredTree.length === 0 && (
            <div className={styles["search-no-results-state"]}>
              <span className={styles["search-no-results-title"]}>
                No matching files
              </span>
              <span className={styles["search-no-results-subtitle"]}>
                Try adjusting your filter query.
              </span>
            </div>
          )}
        {!treeLoading &&
          treeData &&
          (!treeData.tree || treeData.tree.length === 0) && (
            <div className={styles['tree-is-loading-state']}>Empty directory</div>
          )}
        {!treeLoading && hasTreeFetchFailed && (
          <div className={styles['tree-is-loading-state']}>Unable to load tree</div>
        )}
      </div>
    </div>
  );
}
