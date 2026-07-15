"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import WorkspaceService, { WorkspaceItem } from "../services/WorkspaceService";
import { LOCAL_STORAGE_KEY_WORKSPACE_ROOT } from "../constants";

export interface WorkspaceContextType {
  workspaces: WorkspaceItem[];
  currentWorkspace: WorkspaceItem | null;
  setCurrentWorkspace: (_workspace: WorkspaceItem | null) => void;
  refreshWorkspaces: () => Promise<WorkspaceItem[]>;
  /** True once the workspace list has been fetched successfully at least once. */
  workspacesLoaded: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  currentWorkspace: null,
  setCurrentWorkspace: () => {},
  refreshWorkspaces: async () => [],
  workspacesLoaded: false,
});

/**
 * WorkspaceProvider — manages workspace selection state.
 *
 * Workspaces are filesystem paths served dynamically by workspace agents.
 * The selected workspace root is stored in localStorage and sent to Prism
 * via the x-workspace-root header (see serviceHeaders.js).
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [currentWorkspace, _setCurrentWorkspace] =
    useState<WorkspaceItem | null>(null);
  const [mounted, setMounted] = useState(false);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);

  /** Set the active workspace and persist to localStorage. */
  const setCurrentWorkspace = useCallback((workspace: WorkspaceItem | null) => {
    _setCurrentWorkspace(workspace);
    if (typeof window !== "undefined") {
      if (workspace?.path) {
        localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT, workspace.path);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT);
      }
    }
  }, []);

  const refreshWorkspaces = useCallback(async (): Promise<WorkspaceItem[]> => {
    try {
      const list = await WorkspaceService.list();
      setWorkspaces(list);
      setWorkspacesLoaded(true);

      // If the persisted workspace is in the list, restore it
      const storedPath = localStorage.getItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT);
      if (storedPath && list.length > 0) {
        const match = list.find((workspace) => workspace.path === storedPath);
        if (match) {
          _setCurrentWorkspace(match);
        } else {
          // Persisted path no longer in config — fall back to first
          _setCurrentWorkspace(list[0]);
          localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT, list[0].path);
        }
      } else if (list.length > 0 && !storedPath) {
        // No previous selection — default to first workspace
        _setCurrentWorkspace(list[0]);
        localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT, list[0].path);
      } else if (list.length === 0) {
        // All workspace agents disconnected — clear the selection so
        // dependent UI (workspace tab, tree) hides. Keep the persisted
        // path so the same workspace is restored on reconnect.
        _setCurrentWorkspace(null);
      }

      return list;
    } catch {
      return [];
    }
  }, []);

  // On mount: load workspaces from Prism (which proxies tools-api config)
  useEffect(() => {
    setMounted(true);
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  // Poll to detect connects/disconnects — same cadence as the Settings
  // page so the workspace tab and toggles react just as quickly.
  useEffect(() => {
    if (!mounted) return;
    const WORKSPACE_POLL_INTERVAL_MILLISECONDS = 10_000;
    const pollTimer = setInterval(
      refreshWorkspaces,
      WORKSPACE_POLL_INTERVAL_MILLISECONDS,
    );
    return () => clearInterval(pollTimer);
  }, [mounted, refreshWorkspaces]);

  if (!mounted) {
    return (
      <WorkspaceContext.Provider
        value={{
          workspaces: [],
          currentWorkspace: null,
          setCurrentWorkspace,
          refreshWorkspaces,
          workspacesLoaded: false,
        }}
      >
        {children}
      </WorkspaceContext.Provider>
    );
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        setCurrentWorkspace,
        refreshWorkspaces,
        workspacesLoaded,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextType {
  return useContext(WorkspaceContext);
}
