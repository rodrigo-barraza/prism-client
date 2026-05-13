import { PRISM_SERVICE_URL } from "../../config.js";
import { getBaseHeaders } from "./serviceHeaders.js";

const API_BASE = PRISM_SERVICE_URL;

/**
 * WorkspaceService — fetches and manages configured workspace roots via Prism.
 *
 * Workspaces are config-defined filesystem paths (from tools-api WORKSPACE_ROOTS
 * and user-configured roots). Operations: list, update, validate.
 */
export default class WorkspaceService {
  static async list() {
    const res = await fetch(`${API_BASE}/workspaces`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`WorkspaceService.list failed: ${res.status}`);
    return res.json();
  }

  /**
   * Full workspace config including connected workspace-service agent metadata.
   * Used by the Settings page for the richer workspace management UI.
   * @returns {Promise<{ workspaces: object[], agents: object[], staticRoots: string[] }>}
   */
  static async listFull() {
    const res = await fetch(`${API_BASE}/workspaces/full`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`WorkspaceService.listFull failed: ${res.status}`);
    return res.json();
  }

  /**
   * Update user-configured workspace roots.
   * @param {string[]} roots - Array of absolute paths to set as user roots
   * @returns {Promise<object>} Updated workspace config with workspaceRoots, staticRoots, userRoots
   */
  static async update(roots) {
    const res = await fetch(`${API_BASE}/workspaces`, {
      method: "PUT",
      headers: { ...getBaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ roots }),
    });
    if (!res.ok) throw new Error(`WorkspaceService.update failed: ${res.status}`);
    return res.json();
  }

  /**
   * Validate a single workspace path without persisting.
   * @param {string} path - Path to validate (Windows or WSL)
   * @returns {Promise<object>} Validation result with resolvedPath, isWsl, exists, etc.
   */
  static async validate(path) {
    const res = await fetch(`${API_BASE}/workspaces/validate`, {
      method: "POST",
      headers: { ...getBaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error(`WorkspaceService.validate failed: ${res.status}`);
    return res.json();
  }

  /**
   * Fetch the directory tree for a workspace path.
   * @param {string} path - Workspace root path
   * @param {number} [maxDepth=3] - Max depth for tree traversal
   * @returns {Promise<object>} Project summary with tree structure
   */
  static async tree(path, maxDepth = 3) {
    const params = new URLSearchParams({ path });
    if (maxDepth !== 3) params.set("maxDepth", String(maxDepth));
    const res = await fetch(`${API_BASE}/workspaces/tree?${params}`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`WorkspaceService.tree failed: ${res.status}`);
    return res.json();
  }
}

