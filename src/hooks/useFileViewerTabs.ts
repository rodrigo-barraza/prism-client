"use client";

/**
 * The chat's read-only file viewer (VS Code-style tabs beside the chat):
 * which files are open, the active tab, the pane's width, and keeping the
 * tabs current while the agent edits, moves or deletes those files.
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import { LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH } from "../constants";

export interface ViewerOpenFile {
  id: string;
  path: string;
}

/** Remove the tab `id`; when it was active, its neighbour becomes active. */
function withoutTab(
  files: ViewerOpenFile[],
  id: string,
  activeFileId: string | null,
): { files: ViewerOpenFile[]; activeFileId: string | null } {
  const next = files.filter((file) => file.id !== id);
  if (activeFileId !== id) return { files: next, activeFileId };
  const closedTabIndex = files.findIndex((file) => file.id === id);
  return { files: next, activeFileId: next[Math.min(closedTabIndex, next.length - 1)]?.id || null };
}

export default function useFileViewerTabs() {
  const [openFiles, setOpenFiles] = useState<ViewerOpenFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  // Bumped when the agent changed an open file: the viewer refetches it.
  const [refreshKey, setRefreshKey] = useState(0);
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return 500;
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH);
    return stored ? Math.max(300, Math.min(Number(stored), 1200)) : 500;
  });
  const openFilesRef = useRef<ViewerOpenFile[]>(openFiles);
  useLayoutEffect(() => {
    openFilesRef.current = openFiles;
  });

  /** Open `absolutePath` in a tab (the existing one, if it is open). */
  const openFile = useCallback(
    (absolutePath: string) => {
      const existingTab = openFiles.find((file) => file.path === absolutePath);
      if (existingTab) {
        setActiveFileId(existingTab.id);
      } else {
        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setOpenFiles((previousOpenFiles) => [...previousOpenFiles, { id, path: absolutePath }]);
        setActiveFileId(id);
      }
    },
    [openFiles],
  );

  const closeFile = useCallback(
    (id: string) => {
      setOpenFiles((previousOpenFiles) => {
        const next = withoutTab(previousOpenFiles, id, activeFileId);
        if (id === activeFileId) setActiveFileId(next.activeFileId);
        return next.files;
      });
    },
    [activeFileId],
  );

  /** The file is gone from the workspace: close its tab. */
  const dropMissingFile = useCallback((id: string) => {
    setOpenFiles((previousOpenFiles) => {
      setActiveFileId((currentActiveId) => withoutTab(previousOpenFiles, id, currentActiveId).activeFileId);
      return previousOpenFiles.filter((file) => file.id !== id);
    });
  }, []);

  const changeWidth = useCallback((nextWidth: number) => {
    setWidth(nextWidth);
    localStorage.setItem(LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH, String(nextWidth));
  }, []);

  /** A tool touched `path`: a deleted or moved file's tab closes, a changed one reloads. */
  const onFileTouched = useCallback((toolName: string, path: string | null | undefined) => {
    const files = openFilesRef.current;
    if (!path || files.length === 0) return;
    // delete_file and move_file both remove the source path
    if (toolName === TOOL_NAMES.DELETE_FILE || toolName === TOOL_NAMES.MOVE_FILE) {
      const deleted = files.find((file) => file.path === path);
      if (!deleted) return;
      setOpenFiles((previousOpenFiles) => {
        setActiveFileId((currentActiveId) => withoutTab(previousOpenFiles, deleted.id, currentActiveId).activeFileId);
        return previousOpenFiles.filter((file) => file.path !== path);
      });
    } else if (files.some((file) => file.path === path)) {
      // Re-fetch the modified file's content
      setRefreshKey((key) => key + 1);
    }
  }, []);

  return {
    openFiles,
    activeFileId,
    setActiveFileId,
    refreshKey,
    width,
    openFile,
    closeFile,
    dropMissingFile,
    changeWidth,
    onFileTouched,
  };
}

export type FileViewerTabs = ReturnType<typeof useFileViewerTabs>;
