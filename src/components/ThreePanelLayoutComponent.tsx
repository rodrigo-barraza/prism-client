"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import { useSwipeToReveal } from "../hooks/useSwipeToReveal";
import {
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
} from "lucide-react";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import { resolvePageIcon } from "../utils/PageIconMap";
import styles from "./ThreePanelLayoutComponent.module.css";
import {
  LS_PANEL_LEFT,
  LS_PANEL_RIGHT,
  LS_LEFT_SIDEBAR_SPLIT_RATIO,
  EV_PANEL_DISMISS_SIDEBARS,
} from "../constants";

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
  leftPanelBottom?: React.ReactNode;
  leftTitle?: string;
  rightPanel?: React.ReactNode;
  rightTitle?: string;
  conversationType?: string;
  title?: string;
  hideHeader?: boolean;

  headerMeta?: React.ReactNode;
  headerControls?: React.ReactNode;
  headerCenter?: React.ReactNode;
  fileViewerPanel?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const DEFAULT_SPLIT_RATIO = 0.5;
const MINIMUM_PANEL_RATIO = 0.2;
const MAXIMUM_PANEL_RATIO = 0.8;

export default function ThreePanelLayout({
  navSidebar = null,
  leftPanel,
  leftPanelBottom = null,
  leftTitle = "Settings",
  rightPanel,
  rightTitle,
  conversationType = "conversation",
  title,

  headerMeta = null,
  headerControls = null,
  headerCenter = null,
  fileViewerPanel = null,
  hideHeader = false,
  children,
  className,
}: ThreePanelLayoutProps) {
  const resolvedRightTitle =
    rightTitle ?? (conversationType === "agent" ? "Conversations" : "Conversations");
  // Start with panels hidden to prevent FOUC on mobile; mount effect opens them on desktop
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // -- Left sidebar split panel drag-resize state --
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);
  const isDraggingSplitRef = useRef(false);
  const splitContainerRef = useRef<HTMLElement>(null);
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

    const storedRatio = localStorage.getItem(LS_LEFT_SIDEBAR_SPLIT_RATIO);
    if (storedRatio) {
      const parsedRatio = parseFloat(storedRatio);
      if (
        !isNaN(parsedRatio) &&
        parsedRatio >= MINIMUM_PANEL_RATIO &&
        parsedRatio <= MAXIMUM_PANEL_RATIO
      ) {
        setSplitRatio(parsedRatio);
      }
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
    const { showLeft: currentLeft, showRight: currentRight } =
      sidebarStateRef.current;
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

  /* -- Mobile: auto-close sidebar when a [data-panel-close-trigger] element is clicked -- */
  const handleSidebarClick = useCallback(
    (closeFn: () => void) => (clickEvent: React.MouseEvent<HTMLElement>) => {
      if (!isMobile) return;
      const target = clickEvent.target as HTMLElement | null;
      if (target && target.closest("[data-panel-close-trigger]")) {
        closeFn();
      }
    },
    [isMobile],
  );

  /* -- Mobile: close individual sidebars -- */
  const closeLeftSidebar = useCallback(() => {
    setShowLeft(false);
    localStorage.setItem(LS_PANEL_LEFT, "false");
  }, []);

  const closeRightSidebar = useCallback(() => {
    setShowRight(false);
    localStorage.setItem(LS_PANEL_RIGHT, "false");
  }, []);

  /* -- Mobile: dismiss all open sidebars -- */
  const dismissSidebars = useCallback(() => {
    if (!isMobile) return;
    if (showLeft) closeLeftSidebar();
    if (showRight) closeRightSidebar();
  }, [isMobile, showLeft, showRight, closeLeftSidebar, closeRightSidebar]);

  /* -- Mobile: swipe-to-dismiss gestures -- */
  const leftSwipeReference = useSwipeToDismiss({
    direction: "left",
    onDismiss: closeLeftSidebar,
    isEnabled: isMobile && showLeft,
  });

  const rightSwipeReference = useSwipeToDismiss({
    direction: "right",
    onDismiss: closeRightSidebar,
    isEnabled: isMobile && showRight,
  });

  /* -- Mobile: swipe-to-reveal gestures on main content -- */
  const openLeftSidebar = useCallback(() => {
    setShowLeft(true);
    localStorage.setItem(LS_PANEL_LEFT, "true");
    setShowRight(false);
    localStorage.setItem(LS_PANEL_RIGHT, "false");
  }, []);

  const openRightSidebar = useCallback(() => {
    setShowRight(true);
    localStorage.setItem(LS_PANEL_RIGHT, "true");
    setShowLeft(false);
    localStorage.setItem(LS_PANEL_LEFT, "false");
  }, []);

  const mainContentSwipeReference = useSwipeToReveal({
    onSwipeRight: openLeftSidebar,
    onSwipeLeft: rightPanel ? openRightSidebar : undefined,
    isEnabled: isMobile && !showLeft && !showRight,
  });

  /* Backdrop dismiss — tap main area to close any open sidebar */
  const handleMainClick = dismissSidebars;

  /* Listen for programmatic dismiss from child components (pickers, etc.) */
  useEffect(() => {
    const handler = () => dismissSidebars();
    document.addEventListener(EV_PANEL_DISMISS_SIDEBARS, handler);
    return () =>
      document.removeEventListener(EV_PANEL_DISMISS_SIDEBARS, handler);
  }, [dismissSidebars]);

  // -- Left sidebar split panel drag handler --
  const handleSplitDragStart = useCallback((dragEvent: React.MouseEvent) => {
    dragEvent.preventDefault();
    isDraggingSplitRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitRef.current || !splitContainerRef.current) return;
      const containerRectangle = splitContainerRef.current.getBoundingClientRect();
      const relativePosition =
        (moveEvent.clientY - containerRectangle.top) / containerRectangle.height;
      const clampedRatio = Math.min(
        MAXIMUM_PANEL_RATIO,
        Math.max(MINIMUM_PANEL_RATIO, relativePosition),
      );
      setSplitRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      isDraggingSplitRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      // Persist final ratio
      setSplitRatio((currentRatio) => {
        localStorage.setItem(LS_LEFT_SIDEBAR_SPLIT_RATIO, String(currentRatio));
        return currentRatio;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleSplitTouchStart = useCallback((dragEvent: React.TouchEvent) => {
    dragEvent.preventDefault();
    isDraggingSplitRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (!isDraggingSplitRef.current || !splitContainerRef.current) return;
      const containerRectangle = splitContainerRef.current.getBoundingClientRect();
      const touchPoint = moveEvent.touches[0];
      if (!touchPoint) return;

      const relativePosition =
        (touchPoint.clientY - containerRectangle.top) / containerRectangle.height;
      const clampedRatio = Math.min(
        MAXIMUM_PANEL_RATIO,
        Math.max(MINIMUM_PANEL_RATIO, relativePosition),
      );
      setSplitRatio(clampedRatio);
    };

    const handleTouchEnd = () => {
      isDraggingSplitRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      // Persist final ratio
      setSplitRatio((currentRatio) => {
        localStorage.setItem(LS_LEFT_SIDEBAR_SPLIT_RATIO, String(currentRatio));
        return currentRatio;
      });
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, []);

  // Suppress the CSS transition on first paint so panels don't animate from open→closed
  const transitionStyle = hydrated ? undefined : { transition: "none" };

  const hasSplitPanels = leftPanelBottom != null;

  const resolvedTitleIcon = typeof title === "string" ? resolvePageIcon(title) : null;

  return (
    <div className={`three-panel-layout-component ${styles["three-panel-layout-container"]} ${className || ""}`}>
      {navSidebar}
      <div className={styles["layout-page-column"]}>
        {/* Full-width header */}
        {!hideHeader && (
          <LayoutHeaderComponent
            title={title}
            titleIcon={resolvedTitleIcon ?? undefined}
            isMobile={isMobile}
            metaContent={headerMeta}
            centerContent={headerCenter}
            controls={headerControls}
            leadingToggle={{
              isVisible: showLeft,
              onToggle: toggleLeft,
              visibleIcon: <PanelLeftClose size={16} />,
              hiddenIcon: <PanelLeft size={16} />,
              label: (leftTitle || "panel").toLowerCase(),
            }}
            trailingToggle={
              rightPanel
                ? {
                    isVisible: showRight,
                    onToggle: toggleRight,
                    visibleIcon: <PanelRightClose size={16} />,
                    hiddenIcon: <PanelRight size={16} />,
                    label: resolvedRightTitle.toLowerCase(),
                  }
                : undefined
            }
          />
        )}

        {/* Body: sidebars + main content */}
        <div className={styles["layout-body-layout-row"]}>
          {/* Left Sidebar */}
          <aside
            className={`${styles["left-sidebar-panel"]} ${!showLeft ? styles["is-sidebar-hidden"] : ""} ${hasSplitPanels ? styles["has-split-panels"] : ""}`}
            style={transitionStyle}
            onClick={handleSidebarClick(toggleLeft)}
            ref={(node) => {
              (splitContainerRef as React.MutableRefObject<HTMLElement | null>).current = node;
              (leftSwipeReference as React.MutableRefObject<HTMLElement | null>).current = node;
            }}
          >
            {hasSplitPanels ? (
              <>
                <div
                  className={styles["split-panel-top-group"]}
                  style={{ flex: `0 0 ${splitRatio * 100}%` }}
                >
                  {leftPanel}
                </div>
                <div
                  className={styles["split-panel-resize-handle"]}
                  onMouseDown={handleSplitDragStart}
                  onTouchStart={handleSplitTouchStart}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize sidebar panels"
                >
                  <div className={styles["split-panel-resize-grip"]} />
                </div>
                <div
                  className={styles["split-panel-bottom-group"]}
                  style={{ flex: `0 0 ${(1 - splitRatio) * 100}%` }}
                >
                  {leftPanelBottom}
                </div>
              </>
            ) : (
              leftPanel
            )}
          </aside>

          {/* File Viewer Pane (VS Code-style, between sidebar and chat) */}
          {fileViewerPanel}

          {/* Main Center */}
          <section
            className={`${styles["main-content-section"]} ${isMobile && (showLeft || showRight) ? styles["is-scrim-active-state"] : ""}`}
            data-chat-area-region
            onClick={handleMainClick}
            ref={mainContentSwipeReference}
          >
            {children}
          </section>

          {/* Right Sidebar */}
          {rightPanel && (
            <aside
              className={`${styles["right-sidebar-panel"]} ${!showRight ? styles["is-sidebar-hidden"] : ""}`}
              style={transitionStyle}
              onClick={handleSidebarClick(toggleRight)}
              ref={rightSwipeReference}
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
