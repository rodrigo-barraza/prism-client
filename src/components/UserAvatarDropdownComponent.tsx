"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { CircleUser, LogOut, LogIn, UserPlus } from "lucide-react";
import styles from "./UserAvatarDropdownComponent.module.css";

export default function UserAvatarDropdownComponent() {
  const { data: userSession, status: authStatus } = useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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

  const isAuthenticated = authStatus === "authenticated";
  const userProfile = userSession?.user;

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
            // eslint-disable-next-line @next/next/no-img-element
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
