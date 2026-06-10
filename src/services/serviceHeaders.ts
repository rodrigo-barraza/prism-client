/**
 * Shared base headers for all Prism-backed service requests.
 * Centralises Content-Type, x-project, and x-workspace-root injection
 * so PrismService, IrisService, and any future services stay in sync.
 */

import { PROJECT_NAME } from "@/config";
import { LS_WORKSPACE_ROOT, LS_USERNAME } from "@/constants";

export function getBaseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-project": PROJECT_NAME,
  };

  // Include the active workspace root path if one is selected (client-side only)
  if (typeof window !== "undefined") {
    const workspaceRoot = localStorage.getItem(LS_WORKSPACE_ROOT);
    if (workspaceRoot) {
      headers["x-workspace-root"] = workspaceRoot;
    }

    const username = localStorage.getItem(LS_USERNAME);
    if (username) {
      headers["x-username"] = username;
    }
  }

  return headers;
}
