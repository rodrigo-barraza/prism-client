import { PRISM_SERVICE_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";

const API_BASE = PRISM_SERVICE_URL;

// --- Response Interfaces ------------------------------------

export interface ProfileItem {
  profileId: string;
  name: string;
  emoji?: string;
  color?: string;
  /** True for the implicit default profile (cannot be edited or deleted). */
  builtIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * ProfileService — CRUD against prism-service /profiles.
 *
 * A profile is a switchable identity: all profile-partitioned server data
 * (conversations, skills, rules, hooks, memories, MCP servers, …) is keyed
 * by the profile id the client sends in the x-profile-id header (see
 * serviceHeaders.ts). The roster always includes the built-in default
 * profile, which owns all pre-profile data.
 */
export default class ProfileService {
  static async list(): Promise<ProfileItem[]> {
    const response = await fetch(`${API_BASE}/profiles`, {
      method: "GET",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to list profiles: ${response.status}`);
    }
    return response.json();
  }

  static async create(profile: {
    name: string;
    profileId?: string;
    emoji?: string;
    color?: string;
  }): Promise<ProfileItem> {
    const response = await fetch(`${API_BASE}/profiles`, {
      method: "POST",
      headers: getBaseHeaders(),
      cache: "no-store",
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to create profile: ${response.status}`);
    }
    return response.json();
  }

  static async update(
    profileId: string,
    updates: { name?: string; emoji?: string; color?: string },
  ): Promise<ProfileItem> {
    const response = await fetch(`${API_BASE}/profiles/${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      headers: getBaseHeaders(),
      cache: "no-store",
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to update profile: ${response.status}`);
    }
    return response.json();
  }

  /** Removes the profile from the roster; its data is retained server-side. */
  static async remove(profileId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/profiles/${encodeURIComponent(profileId)}`, {
      method: "DELETE",
      headers: getBaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to delete profile: ${response.status}`);
    }
  }
}
