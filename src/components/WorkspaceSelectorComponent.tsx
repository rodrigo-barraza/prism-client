"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Monitor, Lock, FolderOpen, WifiOff } from "lucide-react";
import { useWorkspace } from "./WorkspaceContextComponent";
import styles from "./WorkspaceSelectorComponent.module.css";

interface WorkspaceSelectorProps {
  locked?: boolean;
  className?: string;
  unavailableWorkspace?: string | null;
}

export default function WorkspaceSelectorComponent({
  locked = false,
  className,
  unavailableWorkspace = null,
}: WorkspaceSelectorProps) {
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (locked) {
    if (unavailableWorkspace) {
      const label =
        unavailableWorkspace.split("/").filter(Boolean).pop() ||
        unavailableWorkspace;
      return (
        <div className={`${styles['wrapper']} ${className || ""}`}>
          <div
            className={styles['button']}
            data-is-locked
            data-is-unavailable
            title={`Workspace not available: ${unavailableWorkspace}`}
          >
            <WifiOff className={styles['button-icon']} />
            <span className={styles['unavailable-label']}>{label}</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`${styles['wrapper']} ${className || ""}`}>
        <div className={styles['button']} data-is-locked>
          <Monitor className={styles['button-icon']} />
          <span>{currentWorkspace?.name ?? "Workspace"}</span>
          <Lock className={styles['lock-icon']} />
        </div>
      </div>
    );
  }

  return (
    <div className={`workspace-selector-component ${styles['wrapper']} ${className || ""}`} ref={menuRef}>
      <button
        type="button"
        className={styles['button']}
        onClick={() => setIsOpen((previous) => !previous)}
        title={currentWorkspace?.path ?? "Switch workspace"}
      >
        <Monitor className={styles['button-icon']} />
        <span>{currentWorkspace?.name ?? "Workspace"}</span>
        {(workspaces.length > 1 || true) && (
          <ChevronDown size={12} className={isOpen ? styles['chevron-open'] : ""} />
        )}
      </button>

      {isOpen && (
        <div className={styles['menu']}>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              className={`${styles['menu-item']} ${currentWorkspace?.path === workspace.path ? styles['menu-item-is-active-state'] : ""}`}
              onClick={() => {
                setCurrentWorkspace(workspace);
                setIsOpen(false);
              }}
              title={workspace.path}
            >
              <FolderOpen size={12} className={styles['menu-item-icon']} />
              <div className={styles['menu-item-details']}>
                <span className={styles['menu-item-name']}>{workspace.name}</span>
                <span className={styles['menu-item-path']}>{workspace.path}</span>
              </div>
              {workspace.isAgentServed && (
                <span className={styles['menu-item-agent-badge']}>remote</span>
              )}
              {workspace.isPinned && (
                <Lock size={9} className={styles['menu-item-pinned']} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
