"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import ProfileService, { ProfileItem } from "../services/ProfileService";
import {
  LOCAL_STORAGE_KEY_ACTIVE_PROFILE,
  DEFAULT_PROFILE_ID,
  EVENT_NAME_PROFILE_SWITCH,
} from "../constants";

export interface ProfileContextType {
  profiles: ProfileItem[];
  activeProfileId: string;
  activeProfile: ProfileItem | null;
  /** Switch the active profile — persists and remounts the app subtree. */
  switchProfile: (_profileId: string) => void;
  createProfile: (_name: string) => Promise<ProfileItem>;
  deleteProfile: (_profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<ProfileItem[]>;
}

const DEFAULT_PROFILE: ProfileItem = {
  profileId: DEFAULT_PROFILE_ID,
  name: "Default",
  builtIn: true,
};

const ProfileContext = createContext<ProfileContextType>({
  profiles: [DEFAULT_PROFILE],
  activeProfileId: DEFAULT_PROFILE_ID,
  activeProfile: DEFAULT_PROFILE,
  switchProfile: () => {},
  createProfile: async () => DEFAULT_PROFILE,
  deleteProfile: async () => {},
  refreshProfiles: async () => [],
});

/**
 * ProfileProvider — manages the active profile.
 *
 * A profile is a switchable identity: prism-service partitions settings,
 * memories, skills, rules, hooks, conversations, etc. by the profile id
 * sent in the x-profile-id header (see serviceHeaders.ts), so each profile
 * behaves like a separate user. The active id is stored in localStorage and
 * read synchronously by every outgoing request.
 *
 * Switching profiles remounts the entire subtree (children are keyed on the
 * active id): the client holds all fetched state in component state, so a
 * remount is what re-issues every request under the new identity.
 */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileItem[]>([DEFAULT_PROFILE]);
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID);
  const [mounted, setMounted] = useState(false);

  const refreshProfiles = useCallback(async (): Promise<ProfileItem[]> => {
    try {
      const list = await ProfileService.list();
      if (list.length > 0) {
        setProfiles(list);
      }
      return list;
    } catch {
      return [];
    }
  }, []);

  const switchProfile = useCallback((profileId: string) => {
    if (typeof window === "undefined") return;
    if (profileId === DEFAULT_PROFILE_ID) {
      localStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE_PROFILE);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_PROFILE, profileId);
    }
    // State update after the write: outgoing requests read localStorage at
    // call time, so the remounted subtree fetches under the new identity.
    setActiveProfileId(profileId);
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME_PROFILE_SWITCH, { detail: { profileId } }),
    );
  }, []);

  const createProfile = useCallback(
    async (name: string): Promise<ProfileItem> => {
      const profile = await ProfileService.create({ name });
      await refreshProfiles();
      return profile;
    },
    [refreshProfiles],
  );

  const deleteProfile = useCallback(
    async (profileId: string): Promise<void> => {
      await ProfileService.remove(profileId);
      await refreshProfiles();
    },
    [refreshProfiles],
  );

  // On mount: restore the persisted selection, then load the roster.
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_PROFILE);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setMounted(true);
    if (stored) {
      setActiveProfileId(stored);
    }
    refreshProfiles();
  }, [refreshProfiles]);

  const activeProfile =
    profiles.find((profile) => profile.profileId === activeProfileId) ||
    (activeProfileId === DEFAULT_PROFILE_ID
      ? DEFAULT_PROFILE
      : // Selected profile not in the roster (deleted elsewhere / stale
        // localStorage) — still honor it; its data is intact server-side.
        { profileId: activeProfileId, name: activeProfileId });

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfileId,
        activeProfile,
        switchProfile,
        createProfile,
        deleteProfile,
        refreshProfiles,
      }}
    >
      {/* Keyed remount: profile switch re-issues every fetch in the tree.
          SSR renders with the default key; when a non-default profile is
          restored from localStorage the subtree remounts once after
          hydration (unavoidable — the server cannot see localStorage). */}
      <ProfileSubtree key={mounted ? activeProfileId : DEFAULT_PROFILE_ID}>
        {children}
      </ProfileSubtree>
    </ProfileContext.Provider>
  );
}

function ProfileSubtree({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useProfile(): ProfileContextType {
  return useContext(ProfileContext);
}
