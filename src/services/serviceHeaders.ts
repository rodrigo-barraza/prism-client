/**
 * Shared base headers for all Prism-backed service requests.
 * Centralises Content-Type, Authorization, x-project, x-workspace-root and
 * x-profile-id so PrismService, IrisService, and any future services stay
 * in sync.
 *
 * Who the user is travels only in the Authorization header: the signed-in
 * user's Prism token, whose subject prism-service takes as the username.
 */

import { PROJECT_NAME } from "@/config";
import {
  LOCAL_STORAGE_KEY_WORKSPACE_ROOT,
  LOCAL_STORAGE_KEY_ACTIVE_PROFILE,
  HEADER_AUTHORIZATION,
  HEADER_PROFILE_ID,
  DEFAULT_PROFILE_ID,
} from "@/constants";
import { IDENTITY_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { bearer } from "./prismFetch";
import { currentPrismToken } from "./prismTokenManager";

export function getBaseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [IDENTITY_HEADERS.project]: PROJECT_NAME,
  };

  if (typeof window !== "undefined") {
    // The token in hand (prismTokenManager keeps it renewed); prismFetch
    // makes sure a request never leaves without a current one.
    const token = currentPrismToken();
    if (token) {
      headers[HEADER_AUTHORIZATION] = bearer(token);
    }

    // Include the active workspace root path if one is selected (client-side only)
    const workspaceRoot = localStorage.getItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT);
    if (workspaceRoot) {
      headers[IDENTITY_HEADERS.workspaceRoot] = workspaceRoot;
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
