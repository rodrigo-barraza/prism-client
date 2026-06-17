import { PRISM_SERVICE_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";

const API_BASE = PRISM_SERVICE_URL;

// --- Response Interfaces ------------------------------------

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  isPinned: boolean;
  isAgentServed?: boolean;
  agentId?: string | null;
  agentName?: string | null;
  hostname?: string | null;
  platform?: string | null;
  arch?: string | null;
  clientIp?: string | null;
}

export interface WorkspaceListResponse {
  workspaceRoots: string[];
}

export interface WorkspaceFullResponse {
  workspaces: WorkspaceItem[];
  agents: Array<{ id: string; name: string; project?: string; path?: string }>;
  staticRoots: string[];
}

export interface WorkspaceUpdateResponse {
  workspaceRoots: string[];
  staticRoots: string[];
  userRoots: string[];
}

export interface WorkspaceValidateResponse {
  valid: boolean;
  resolvedPath: string;
  originalPath: string;
  isWsl: boolean;
  exists: boolean;
  isDirectory: boolean;
  alreadyRegistered: boolean;
  error?: string;
}

export interface WorkspaceTreeNode {
  name: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
  path?: string;
  size?: number;
}

export interface WorkspaceTreeResponse {
  path: string;
  tree: WorkspaceTreeNode[];
  totalEntries?: number;
  truncated?: boolean;
}

// --- Service ------------------------------------------------

/**
 * WorkspaceService — fetches and manages configured workspace roots via Prism.
 *
 * Workspaces are config-defined filesystem paths (from tools-api WORKSPACE_ROOTS
 * and user-configured roots). Operations: list, update, validate.
 */
export default class WorkspaceService {
  static async list(): Promise<WorkspaceItem[]> {
    const response = await fetch(`${API_BASE}/workspaces`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`WorkspaceService.list failed: ${response.status}`);
    return response.json();
  }

  /**
   * Full workspace config including connected workspace-service agent metadata.
   * Used by the Settings page for the richer workspace management UI.
   */
  static async listFull(): Promise<WorkspaceFullResponse> {
    const response = await fetch(`${API_BASE}/workspaces/full`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`WorkspaceService.listFull failed: ${response.status}`);
    return response.json();
  }

  /**
   * Update user-configured workspace roots.
   */
  static async update(roots: string[]): Promise<WorkspaceUpdateResponse> {
    const response = await fetch(`${API_BASE}/workspaces`, {
      method: "PUT",
      headers: { ...getBaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ roots }),
    });
    if (!response.ok)
      throw new Error(`WorkspaceService.update failed: ${response.status}`);
    return response.json();
  }

  /**
   * Validate a single workspace path without persisting.
   */
  static async validate(path: string): Promise<WorkspaceValidateResponse> {
    const response = await fetch(`${API_BASE}/workspaces/validate`, {
      method: "POST",
      headers: { ...getBaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!response.ok)
      throw new Error(`WorkspaceService.validate failed: ${response.status}`);
    return response.json();
  }

  /**
   * Fetch the directory tree for a workspace path.
   */
  static async tree(
    path: string,
    maxDepth = 3,
  ): Promise<WorkspaceTreeResponse> {
    const params = new URLSearchParams({ path });
    if (maxDepth !== 3) params.set("maxDepth", String(maxDepth));
    const response = await fetch(`${API_BASE}/workspaces/tree?${params}`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`WorkspaceService.tree failed: ${response.status}`);
    return response.json();
  }
}
