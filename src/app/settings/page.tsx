"use client";

import { useRef, useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import SettingsPageComponent from "../../components/SettingsPageComponent";
import SettingsSidebarNavigationComponent from "../../components/SettingsSidebarNavigationComponent";
import styles from "./page.module.css";

const LS_SETTINGS_SIDEBAR = "prism_settings_sidebar_visible";

export default function SettingsPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      setShowSidebar(false);
    } else {
      const storedVisibility = localStorage.getItem(LS_SETTINGS_SIDEBAR);
      setShowSidebar(storedVisibility !== null ? storedVisibility === "true" : true);
    }
    setHydrated(true);
  }, []);

  const handleToggleSidebar = () => {
    setShowSidebar((prev) => {
      const next = !prev;
      localStorage.setItem(LS_SETTINGS_SIDEBAR, String(next));
      return next;
    });
  };

  const transitionStyle = hydrated ? undefined : { transition: "none" };

  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent
          title="Settings"
          leadingToggle={{
            isVisible: showSidebar,
            onToggle: handleToggleSidebar,
            visibleIcon: <PanelLeftClose size={16} />,
            hiddenIcon: <PanelLeft size={16} />,
            label: "settings sidebar",
          }}
        />
        <div className={styles["settings-body-row"]}>
          <aside
            className={`${styles["settings-sidebar-panel"]} ${!showSidebar ? styles["is-sidebar-hidden"] : ""}`}
            style={transitionStyle}
          >
            <SettingsSidebarNavigationComponent
              scrollContainerRef={scrollContainerRef}
            />
          </aside>
          <div
            className={styles["page-content-area"]}
            ref={scrollContainerRef}
          >
            <SettingsPageComponent />
          </div>
        </div>
      </div>
    </div>
  );
}
