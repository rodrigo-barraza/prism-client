"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
} from "lucide-react";
import styles from "./ThreePanelLayoutComponent.module.css";
import { LS_PANEL_LEFT, LS_PANEL_RIGHT } from "../constants";

/**
 * Reusable 3-panel layout with a full-width header spanning all panels.
 * The header sits above the sidebars, matching the workflow page pattern.
 *
 * Props:
 *   leftPanel      — React node for the left sidebar content (e.g. SettingsPanel)
 *   leftTitle      — Title for the left sidebar (default: "Settings")
 *   rightPanel     — React node for the right sidebar content (e.g. HistoryPanel)
 *   rightTitle     — Title for the right sidebar (default: "History")
 *   headerMeta     — React node for meta info in the header (badges, counts)
 *   headerControls — React node for extra controls in the header (theme toggle, etc.)
 *   headerCenter   — React node absolutely centered in the header (over the chat area)
 *   children       — Main content area (chat, viewer, etc.)
 */
export interface ThreePanelLayoutProps {
  navSidebar?: React.ReactNode;
  leftPanel: React.ReactNode;
  leftTitle?: string;
  rightPanel?: React.ReactNode;
  rightTitle?: string;
  sessionType?: string;
  headerMeta?: React.ReactNode;
  headerControls?: React.ReactNode;
  headerCenter?: React.ReactNode;
  fileViewerPanel?: React.ReactNode;
  children: React.ReactNode;
}

export default function ThreePanelLayout({
  navSidebar = null,
  leftPanel,
  leftTitle = "Settings",
  rightPanel,
  rightTitle,
  sessionType = "conversation",
  headerMeta = null,
  headerControls = null,
  headerCenter = null,
  fileViewerPanel = null,
  children,
}: ThreePanelLayoutProps) {
  const resolvedRightTitle =
    rightTitle ?? (sessionType === "agent" ? "Sessions" : "Conversations");
  // Start with panels hidden to prevent FOUC on mobile; mount effect opens them on desktop
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mobile = window.innerWidth <= 1200;
    if (mobile) {
      // On mobile / narrow viewports, always start with panels closed
      setShowLeft(false);
      setShowRight(false);
    } else {
      // On desktop, restore from localStorage (default open)
      const storedLeft = localStorage.getItem(LS_PANEL_LEFT);
      const storedRight = localStorage.getItem(LS_PANEL_RIGHT);
      setShowLeft(storedLeft !== null ? storedLeft === "true" : true);
      setShowRight(storedRight !== null ? storedRight === "true" : true);
    }
    // eslint-disable-next-line react-compiler/react-compiler
    setHydrated(true);
  }, []);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setIsNarrow(window.innerWidth <= 1400);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const sidebarStateRef = useRef({ showLeft, showRight });
  useEffect(() => {
    sidebarStateRef.current = { showLeft, showRight };
  }, [showLeft, showRight]);

  /* Narrow ↔ wide transitions: enforce exclusivity or restore both.
     Skip on initial mount — the mount effect handles initial panel state. */
  const isNarrowMountRef = useRef<boolean>(true);
  useEffect(() => {
    if (isNarrowMountRef.current) {
      isNarrowMountRef.current = false;
      return;
    }
    const { showLeft: currentLeft, showRight: currentRight } = sidebarStateRef.current;
    if (isNarrow) {
      // Entering narrow: if both are open, close the right
      if (currentLeft && currentRight) {
        setShowRight(false);
        localStorage.setItem(LS_PANEL_RIGHT, "false");
      }
    } else {
      // Leaving narrow (back to wide): restore both panels
      setShowLeft(true);
      setShowRight(true);
      localStorage.setItem(LS_PANEL_LEFT, "true");
      localStorage.setItem(LS_PANEL_RIGHT, "true");
    }
  }, [isNarrow]);

  const toggleLeft = useCallback(() => {
    setShowLeft((prev) => {
      const next = !prev;
      localStorage.setItem(LS_PANEL_LEFT, String(next));
      if (next && window.innerWidth <= 1400) {
        setShowRight(false);
        localStorage.setItem(LS_PANEL_RIGHT, "false");
      }
      return next;
    });
  }, []);

  const toggleRight = useCallback(() => {
    setShowRight((prev) => {
      const next = !prev;
      localStorage.setItem(LS_PANEL_RIGHT, String(next));
      if (next && window.innerWidth <= 1400) {
        setShowLeft(false);
        localStorage.setItem(LS_PANEL_LEFT, "false");
      }
      return next;
    });
  }, []);

  /* -- Mobile: auto-close sidebar when a [data-panel-close] element is clicked -- */
  const handleSidebarClick = useCallback(
    (closeFn: () => void) => (e: React.MouseEvent<HTMLElement>) => {
      if (!isMobile) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-panel-close]")) {
        closeFn();
      }
    },
    [isMobile],
  );

  /* -- Mobile: dismiss all open sidebars -- */
  const dismissSidebars = useCallback(() => {
    if (!isMobile) return;
    if (showLeft) {
      setShowLeft(false);
      localStorage.setItem(LS_PANEL_LEFT, "false");
    }
    if (showRight) {
      setShowRight(false);
      localStorage.setItem(LS_PANEL_RIGHT, "false");
    }
  }, [isMobile, showLeft, showRight]);

  /* Backdrop dismiss — tap main area to close any open sidebar */
  const handleMainClick = dismissSidebars;

  /* Listen for programmatic dismiss from child components (pickers, etc.) */
  useEffect(() => {
    const handler = () => dismissSidebars();
    document.addEventListener("panel:dismiss-sidebars", handler);
    return () =>
      document.removeEventListener("panel:dismiss-sidebars", handler);
  }, [dismissSidebars]);

  // Suppress the CSS transition on first paint so panels don't animate from open→closed
  const transitionStyle = hydrated ? undefined : { transition: "none" };

  return (
    <div className={styles.container}>
      {navSidebar}
      <div className={styles.page}>
        {/* Full-width header */}
        <header className={styles.pageHeader}>
          <button
            className={`${styles.headerToggle} ${!showLeft ? styles.panelHidden : ""}`}
            onClick={toggleLeft}
            title={
              showLeft
                ? `Hide ${(leftTitle || "panel").toLowerCase()}`
                : `Show ${(leftTitle || "panel").toLowerCase()}`
            }
          >
            {showLeft ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
          {!isMobile && headerMeta}
          {headerCenter && (
            <div className={styles.headerCenter}>{headerCenter}</div>
          )}
          {headerControls}
          {rightPanel && (
            <button
              className={`${styles.headerToggle} ${!showRight ? styles.panelHidden : ""}`}
              onClick={toggleRight}
              title={
                showRight
                  ? `Hide ${resolvedRightTitle.toLowerCase()}`
                  : `Show ${resolvedRightTitle.toLowerCase()}`
              }
            >
              {showRight ? (
                <PanelRightClose size={16} />
              ) : (
                <PanelRight size={16} />
              )}
            </button>
          )}
        </header>
        {/* Mobile: meta info row below the header */}
        {isMobile && headerMeta && (
          <div className={styles.mobileMetaBar}>{headerMeta}</div>
        )}

        {/* Body: sidebars + main content */}
        <div className={styles.body}>
          {/* Left Sidebar */}
          <aside
            className={`${styles.leftSidebar} ${!showLeft ? styles.sidebarHidden : ""}`}
            style={transitionStyle}
            onClick={handleSidebarClick(toggleLeft)}
          >
            {leftPanel}
          </aside>

          {/* File Viewer Pane (VS Code-style, between sidebar and chat) */}
          {fileViewerPanel}

          {/* Main Center */}
          <section
            className={`${styles.main} ${isMobile && (showLeft || showRight) ? styles.scrimActive : ""}`}
            data-chat-area
            onClick={handleMainClick}
          >
            {children}
          </section>

          {/* Right Sidebar */}
          {rightPanel && (
            <aside
              className={`${styles.rightSidebar} ${!showRight ? styles.sidebarHidden : ""}`}
              style={transitionStyle}
              onClick={handleSidebarClick(toggleRight)}
            >
              {rightPanel}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export { styles as layoutStyles };
