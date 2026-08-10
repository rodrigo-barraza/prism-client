import {
  LOCAL_STORAGE_KEY_ACTIVE_PROFILE,
  DEFAULT_PROFILE_ID,
} from "@/constants";

/**
 * Scope a localStorage key to the active profile.
 *
 * The default profile keeps the unscoped key, so all pre-profile values are
 * untouched; other profiles get their own `profile:<id>:`-prefixed copy.
 * Callers re-read after a profile switch because the switch remounts the
 * subtree (see ProfileContextComponent), re-running hook initializers.
 */
export function profileScopedKey(storageKey: string): string {
  if (typeof window === "undefined") return storageKey;
  const profileId = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_PROFILE);
  if (!profileId || profileId === DEFAULT_PROFILE_ID) return storageKey;
  return `profile:${profileId}:${storageKey}`;
}
