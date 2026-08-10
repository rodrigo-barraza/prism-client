/**
 * Shared base headers for all Prism-backed service requests.
 * Centralises Content-Type, x-project, and x-workspace-root injection
 * so PrismService, IrisService, and any future services stay in sync.
 */

import { PROJECT_NAME } from "@/config";
import {
  LOCAL_STORAGE_KEY_WORKSPACE_ROOT,
  LOCAL_STORAGE_KEY_USERNAME,
  LOCAL_STORAGE_KEY_ACTIVE_PROFILE,
  HEADER_PROFILE_ID,
  DEFAULT_PROFILE_ID,
} from "@/constants";
import { IDENTITY_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";

export function getBaseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [IDENTITY_HEADERS.project]: PROJECT_NAME,
  };

  // Include the active workspace root path if one is selected (client-side only)
  if (typeof window !== "undefined") {
    const workspaceRoot = localStorage.getItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT);
    if (workspaceRoot) {
      headers[IDENTITY_HEADERS.workspaceRoot] = workspaceRoot;
    }

    const username = localStorage.getItem(LOCAL_STORAGE_KEY_USERNAME);
    if (username) {
      headers[IDENTITY_HEADERS.username] = username;
    }

    // Active profile — partitions settings/memories/skills/conversations
    // server-side as if each profile were a separate user.
    const profileId = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_PROFILE);
    if (profileId && profileId !== DEFAULT_PROFILE_ID) {
      headers[HEADER_PROFILE_ID] = profileId;
    }
  }

  return headers;
}
