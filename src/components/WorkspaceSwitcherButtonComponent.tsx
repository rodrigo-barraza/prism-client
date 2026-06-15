"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, FolderOpen, Check } from "lucide-react";
import { useWorkspace } from "./WorkspaceContextComponent";
import type { WorkspaceItem } from "../services/WorkspaceService";
import styles from "./WorkspaceSwitcherButtonComponent.module.css";

/**
 * Compact workspace switcher button designed to sit inside
 * the `actions` slot of SidebarTabHeaderComponent.
 *
 * Only renders interactive UI when multiple workspaces exist;
 * returns null if there's a single workspace (no switching needed).
 */
export default function WorkspaceSwitcherButtonComponent() {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperReference = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperReference.current &&
        !wrapperReference.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (workspaces.length <= 1) return null;

  return (
    <div
      className={styles["workspace-switcher-wrapper"]}
      ref={wrapperReference}
    >
      <button
        type="button"
        className={`${styles["workspace-switcher-trigger"]} ${isOpen ? styles["workspace-switcher-trigger-open"] : ""}`}
        onClick={() => setIsOpen((previous) => !previous)}
        title={`Switch workspace — ${currentWorkspace?.path ?? ""}`}
      >
        <span className={styles["workspace-switcher-trigger-name"]}>
          {currentWorkspace?.name ?? "Workspace"}
        </span>
        <ChevronDown
          size={8}
          className={`${styles["workspace-switcher-trigger-chevron"]} ${isOpen ? styles["workspace-switcher-trigger-chevron-open"] : ""}`}
        />
      </button>

      {isOpen && (
        <div className={styles["workspace-switcher-menu"]}>
          {workspaces.map((workspace: WorkspaceItem) => {
            const isActive = currentWorkspace?.path === workspace.path;
            return (
              <button
                key={workspace.id}
                type="button"
                className={`${styles["workspace-switcher-menu-item"]} ${isActive ? styles["workspace-switcher-menu-item-active"] : ""}`}
                onClick={() => {
                  setCurrentWorkspace(workspace);
                  setIsOpen(false);
                }}
                title={workspace.path}
              >
                <FolderOpen
                  size={11}
                  className={styles["workspace-switcher-menu-item-icon"]}
                />
                <div className={styles["workspace-switcher-menu-item-details"]}>
                  <span className={styles["workspace-switcher-menu-item-name"]}>
                    {workspace.name}
                  </span>
                  <span className={styles["workspace-switcher-menu-item-path"]}>
                    {workspace.path}
                  </span>
                </div>
                {workspace.isAgentServed && (
                  <span className={styles["workspace-switcher-menu-item-agent-badge"]}>
                    remote
                  </span>
                )}
                {isActive && (
                  <Check
                    size={10}
                    className={styles["workspace-switcher-menu-item-check"]}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
