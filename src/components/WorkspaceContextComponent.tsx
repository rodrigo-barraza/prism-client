"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import WorkspaceService, { WorkspaceItem } from "../services/WorkspaceService";
import { LS_WORKSPACE_ROOT } from "../constants";

export interface WorkspaceContextType {
  workspaces: WorkspaceItem[];
  currentWorkspace: WorkspaceItem | null;
  setCurrentWorkspace: (workspace: WorkspaceItem | null) => void;
  refreshWorkspaces: () => Promise<WorkspaceItem[]>;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  currentWorkspace: null,
  setCurrentWorkspace: () => {},
  refreshWorkspaces: async () => [],
});

/**
 * WorkspaceProvider — manages workspace selection state.
 *
 * Workspaces are config-defined filesystem paths (from tools-api WORKSPACE_ROOTS).
 * The selected workspace root is stored in localStorage and sent to Prism
 * via the x-workspace-root header (see serviceHeaders.js).
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [currentWorkspace, _setCurrentWorkspace] =
    useState<WorkspaceItem | null>(null);
  const [mounted, setMounted] = useState(false);

  /** Set the active workspace and persist to localStorage. */
  const setCurrentWorkspace = useCallback((workspace: WorkspaceItem | null) => {
    _setCurrentWorkspace(workspace);
    if (typeof window !== "undefined") {
      if (workspace?.path) {
        localStorage.setItem(LS_WORKSPACE_ROOT, workspace.path);
      } else {
        localStorage.removeItem(LS_WORKSPACE_ROOT);
      }
    }
  }, []);

  const refreshWorkspaces = useCallback(async (): Promise<WorkspaceItem[]> => {
    try {
      const list = await WorkspaceService.list();
      setWorkspaces(list);

      // If the persisted workspace is in the list, restore it
      const storedPath = localStorage.getItem(LS_WORKSPACE_ROOT);
      if (storedPath && list.length > 0) {
        const match = list.find((workspace) => workspace.path === storedPath);
        if (match) {
          _setCurrentWorkspace(match);
        } else {
          // Persisted path no longer in config — fall back to first
          _setCurrentWorkspace(list[0]);
          localStorage.setItem(LS_WORKSPACE_ROOT, list[0].path);
        }
      } else if (list.length > 0 && !storedPath) {
        // No previous selection — default to first workspace
        _setCurrentWorkspace(list[0]);
        localStorage.setItem(LS_WORKSPACE_ROOT, list[0].path);
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

  if (!mounted) {
    return (
      <WorkspaceContext.Provider
        value={{
          workspaces: [],
          currentWorkspace: null,
          setCurrentWorkspace,
          refreshWorkspaces,
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
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextType {
  return useContext(WorkspaceContext);
}
