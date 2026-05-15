"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Monitor, Lock, FolderOpen } from "lucide-react";
import { useWorkspace } from "./WorkspaceContextComponent";
import styles from "./WorkspaceSelectorComponent.module.css";

/**
 * WorkspaceSelectorComponent — reusable workspace picker dropdown.
 *
 * Renders the active workspace as a pill button; when clicked, opens a
 * dropdown listing all workspaces plus an inline "Add new workspace" input
 * with real-time path validation (mirroring the Settings page UX).
 *
 * Props:
 *   locked  — if true, renders a non-interactive locked state (e.g. mid-conversation)
 *   className — optional wrapper className for layout integration
 */
export default function WorkspaceSelectorComponent({ locked = false, className }) {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // -- Close on outside click ---------------------------------
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // -- Locked state (mid-conversation) ------------------------
  if (locked) {
    return (
      <div className={`${styles.wrapper} ${className || ""}`}>
        <div className={styles.button} data-locked>
          <Monitor className={styles.buttonIcon} />
          <span>{currentWorkspace?.name ?? "Workspace"}</span>
          <Lock className={styles.lockIcon} />
        </div>
      </div>
    );
  }

  // -- Interactive state --------------------------------------
  return (
    <div className={`${styles.wrapper} ${className || ""}`} ref={menuRef}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setOpen((v) => !v)}
        title={currentWorkspace?.path ?? "Switch workspace"}
      >
        <Monitor className={styles.buttonIcon} />
        <span>{currentWorkspace?.name ?? "Workspace"}</span>
        {(workspaces.length > 1 || true) && <ChevronDown size={12} className={open ? styles.chevronOpen : ""} />}
      </button>

      {open && (
        <div className={styles.menu}>
          {/* Workspace list */}
          {workspaces.map((w) => (
            <button
              key={w.id}
              className={`${styles.menuItem} ${currentWorkspace?.path === w.path ? styles.menuItemActive : ""}`}
              onClick={() => { setCurrentWorkspace(w); setOpen(false); }}
              title={w.path}
            >
              <FolderOpen size={12} className={styles.menuItemIcon} />
              <span className={styles.menuItemName}>{w.name}</span>
              {w.isPinned && <Lock size={9} className={styles.menuItemPinned} />}
            </button>
          ))}


        </div>
      )}
    </div>
  );
}
