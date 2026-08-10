"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  CircleUser,
  LogOut,
  LogIn,
  UserPlus,
  Check,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useProfile } from "./ProfileContextComponent";
import styles from "./UserAvatarDropdownComponent.module.css";

export default function UserAvatarDropdownComponent() {
  const { data: userSession, status: authStatus } = useSession();
  const {
    profiles,
    activeProfileId,
    switchProfile,
    createProfile,
    deleteProfile,
  } = useProfile();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const containerReference = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerReference.current &&
        !containerReference.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsDropdownOpen((previousState) => !previousState);
  };

  const handleDropdownItemClick = () => {
    setIsDropdownOpen(false);
  };

  const handleSignOutClick = async () => {
    setIsDropdownOpen(false);
    await signOut({ callbackUrl: "/login" });
  };

  const handleProfileSwitchClick = (profileId: string) => {
    setIsDropdownOpen(false);
    if (profileId !== activeProfileId) {
      switchProfile(profileId);
    }
  };

  const handleProfileCreateSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const name = newProfileName.trim();
    if (!name) return;
    try {
      const profile = await createProfile(name);
      setNewProfileName("");
      setIsCreatingProfile(false);
      setIsDropdownOpen(false);
      switchProfile(profile.profileId);
    } catch (error: unknown) {
      console.error("[Profiles] Failed to create profile:", error);
    }
  };

  const handleProfileDeleteClick = async (profileId: string) => {
    if (
      !window.confirm(
        "Remove this profile? Its data is kept and can be recovered by recreating a profile with the same name.",
      )
    ) {
      return;
    }
    try {
      await deleteProfile(profileId);
      if (profileId === activeProfileId) {
        switchProfile("default");
      }
    } catch (error: unknown) {
      console.error("[Profiles] Failed to delete profile:", error);
    }
  };

  const isAuthenticated = authStatus === "authenticated";
  const userProfile = userSession?.user;

  const profilesSection = (
    <>
      <div className={styles["profile-section-label"]}>Profiles</div>
      <div className={styles["dropdown-action-list"]}>
        {profiles.map((profile) => (
          <div className={styles["profile-row-wrapper"]} key={profile.profileId}>
            <button
              className={`${styles["dropdown-action-button"]} ${styles["profile-row-button"]} ${
                profile.profileId === activeProfileId
                  ? styles["profile-active-row"]
                  : ""
              }`}
              onClick={() => handleProfileSwitchClick(profile.profileId)}
              role="menuitem"
              title={`Switch to profile ${profile.name}`}
            >
              {profile.profileId === activeProfileId ? (
                <Check size={14} className={styles["dropdown-icon-element"]} />
              ) : (
                <Users size={14} className={styles["dropdown-icon-element"]} />
              )}
              <span className={styles["profile-name-text"]}>
                {profile.emoji ? `${profile.emoji} ` : ""}
                {profile.name}
              </span>
            </button>
            {!profile.builtIn && (
              <button
                className={styles["profile-delete-button"]}
                onClick={() => handleProfileDeleteClick(profile.profileId)}
                title={`Remove profile ${profile.name}`}
                aria-label={`Remove profile ${profile.name}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {isCreatingProfile ? (
          <form
            className={styles["profile-create-form"]}
            onSubmit={handleProfileCreateSubmit}
          >
            <input
              className={styles["profile-create-input"]}
              value={newProfileName}
              onChange={(event) => setNewProfileName(event.target.value)}
              placeholder="Profile name"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- form appears on explicit user action
              autoFocus
              maxLength={64}
            />
            <button
              className={styles["dropdown-action-button"]}
              type="submit"
              title="Create profile"
            >
              <Plus size={14} className={styles["dropdown-icon-element"]} />
            </button>
          </form>
        ) : (
          <button
            className={styles["dropdown-action-button"]}
            onClick={() => setIsCreatingProfile(true)}
            role="menuitem"
          >
            <Plus size={14} className={styles["dropdown-icon-element"]} />
            <span>New Profile</span>
          </button>
        )}
      </div>
    </>
  );

  // Retrieve user initials for placeholder
  const getUserInitials = () => {
    if (!userProfile?.name) return "?";
    const nameParts = userProfile.name.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const firstInitial = nameParts[0]?.charAt(0) || "";
      const secondInitial = nameParts[nameParts.length - 1]?.charAt(0) || "";
      return (firstInitial + secondInitial).toUpperCase();
    }
    return (userProfile.name.charAt(0) || "?").toUpperCase();
  };

  return (
    <div className={`user-avatar-dropdown-component ${styles["avatar-container-wrapper"]}`} ref={containerReference}>
      {/* Trigger Button */}
      <button
        className={`${styles["avatar-trigger-button"]} ${isDropdownOpen ? styles["is-active-state"] : ""}`}
        onClick={toggleDropdown}
        aria-expanded={isDropdownOpen}
        aria-haspopup="menu"
        title={isAuthenticated ? `Logged in as ${userProfile?.name || userProfile?.email}` : "Account Access"}
      >
        {isAuthenticated ? (
          userProfile?.image ? (
             
            <img
              className={styles["avatar-image-element"]}
              src={userProfile.image}
              alt={userProfile.name || "User profile photo"}
            />
          ) : (
            <div className={styles["avatar-initials-badge"]}>
              <span>{getUserInitials()}</span>
            </div>
          )
        ) : (
          <CircleUser className={styles["avatar-placeholder-icon"]} size={18} />
        )}
      </button>

      {/* Dropdown Menu Popover */}
      {isDropdownOpen && (
        <div className={styles["dropdown-menu-card"]} role="menu">
          {isAuthenticated ? (
            <>
              {/* Authenticated Header */}
              <header className={styles["dropdown-header-section"]}>
                <div className={styles["dropdown-user-display-name"]}>
                  {userProfile?.name || "Workspace User"}
                </div>
                {userProfile?.email && (
                  <div className={styles["dropdown-user-email"]}>
                    {userProfile.email}
                  </div>
                )}
              </header>

              <hr className={styles["dropdown-menu-divider"]} />

              {profilesSection}

              <hr className={styles["dropdown-menu-divider"]} />

              {/* Action List */}
              <div className={styles["dropdown-action-list"]}>
                <button
                  className={`${styles["dropdown-action-button"]} ${styles["dropdown-logout-action"]}`}
                  onClick={handleSignOutClick}
                  role="menuitem"
                >
                  <LogOut size={14} className={styles["dropdown-icon-element"]} />
                  <span>Log Out</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Unauthenticated Options */}
              <header className={styles["dropdown-header-section"]}>
                <div className={styles["dropdown-user-display-name"]}>
                  Welcome to Prism
                </div>
                <div className={styles["dropdown-user-email"]}>
                  Sign in or create a new account
                </div>
              </header>

              <hr className={styles["dropdown-menu-divider"]} />

              {profilesSection}

              <hr className={styles["dropdown-menu-divider"]} />

              <div className={styles["dropdown-action-list"]}>
                <Link
                  href="/login?mode=login"
                  className={styles["dropdown-primary-action-button"]}
                  onClick={handleDropdownItemClick}
                  role="menuitem"
                >
                  <LogIn size={14} className={styles["dropdown-icon-element"]} />
                  <span>Log In</span>
                </Link>
                <Link
                  href="/login?mode=signup"
                  className={styles["dropdown-secondary-action-button"]}
                  onClick={handleDropdownItemClick}
                  role="menuitem"
                >
                  <UserPlus size={14} className={styles["dropdown-icon-element"]} />
                  <span>Sign Up</span>
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
