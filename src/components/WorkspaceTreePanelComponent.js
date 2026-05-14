"use client";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  FolderOpen,
  File,
  ChevronRight,
  ChevronDown,
  AtSign,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceContextComponent";
import WorkspaceService from "../services/WorkspaceService";
import styles from "./WorkspaceTreePanelComponent.module.css";

// ─── Recursive Directory Tree Node ──────────────────────────
const TreeNode = memo(function TreeNode({ node, depth = 0, parentPath = "", onMentionFile }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const hasChildren = isDir && node.children?.length > 0;
  const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleMention = (e) => {
    e.stopPropagation();
    onMentionFile?.(nodePath);
  };

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.treeRow} ${isDir ? styles.treeRowDir : ""}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => isDir && setExpanded((v) => !v)}
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
            <File size={10} className={styles.treeFileIcon} />
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
        {!isDir && node.sizeBytes != null && (
          <span className={styles.treeSize}>{formatSize(node.sizeBytes)}</span>
        )}
        {isDir && hasChildren && (
          <span className={styles.treeCount}>{node.children.length}</span>
        )}
      </div>
      {isDir && expanded && hasChildren && (
        <div className={styles.treeChildren}>
          {node.children.map((child) => (
            <TreeNode key={child.name} node={child} depth={depth + 1} parentPath={nodePath} onMentionFile={onMentionFile} />
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * Full-panel workspace directory tree — used as a standalone tab
 * in the left sidebar of ThreePanelLayout.
 */
export default function WorkspaceTreePanelComponent({
  workspaceTreeRefreshKey = 0,
  onMentionFile,
}) {
  const { currentWorkspace } = useWorkspace();
  const [treeData, setTreeData] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);

  const fetchTree = useCallback(async () => {
    if (!currentWorkspace?.path) return;
    setTreeLoading(true);
    try {
      const data = await WorkspaceService.tree(currentWorkspace.path);
      setTreeData(data);
    } catch {
      setTreeData(null);
    } finally {
      setTreeLoading(false);
    }
  }, [currentWorkspace?.path]);

  // Fetch on mount
  useEffect(() => {
    if (!treeData && !treeLoading) {
      fetchTree();
    }
  }, [treeData, treeLoading, fetchTree]);

  // Reset tree when workspace changes
  useEffect(() => {
    setTreeData(null);
  }, [currentWorkspace?.path]);

  // Live-refresh: debounced re-fetch when workspaceTreeRefreshKey changes
  const treeRefreshTimerRef = useRef(null);
  useEffect(() => {
    if (workspaceTreeRefreshKey === 0) return;
    if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    treeRefreshTimerRef.current = setTimeout(() => {
      treeRefreshTimerRef.current = null;
      fetchTree();
    }, 1500);
    return () => {
      if (treeRefreshTimerRef.current) clearTimeout(treeRefreshTimerRef.current);
    };
  }, [workspaceTreeRefreshKey, fetchTree]);

  if (!currentWorkspace) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <FolderOpen size={11} className={styles.headerIcon} />
        <span className={styles.headerLabel}>{currentWorkspace.name}</span>
        {treeData?.totalEntries > 0 && (
          <span className={styles.headerCount}>
            {treeData.totalEntries}{treeData.truncated ? "+" : ""}
          </span>
        )}
      </div>
      <div className={styles.treeScroll}>
        {treeLoading && (
          <div className={styles.treeLoading}>Loading…</div>
        )}
        {!treeLoading && treeData?.tree && treeData.tree.length > 0 && (
          <div className={styles.treeRoot}>
            {treeData.tree.map((node) => (
              <TreeNode key={node.name} node={node} onMentionFile={onMentionFile} />
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
