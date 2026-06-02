"use client";

import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import AgentsPageComponent from "../../components/AgentsPageComponent";
import styles from "./page.module.css";

const STORAGE_KEY_SIDEBAR_VISIBLE = "prism_agents_sidebar_visible";

export default function AgentsPage() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const isMobileViewport = window.innerWidth <= 900;
    if (isMobileViewport) {
      setShowSidebar(false);
    } else {
      const storedVisibility = localStorage.getItem(STORAGE_KEY_SIDEBAR_VISIBLE);
      setShowSidebar(storedVisibility !== null ? storedVisibility === "true" : true);
    }
    setIsHydrated(true);
  }, []);

  const handleToggleSidebar = () => {
    setShowSidebar((previousVisibilityState) => {
      const nextVisibilityState = !previousVisibilityState;
      localStorage.setItem(STORAGE_KEY_SIDEBAR_VISIBLE, String(nextVisibilityState));
      return nextVisibilityState;
    });
  };

  const transitionStyle = isHydrated ? undefined : { transition: "none" };

  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent
          title="Agents"
          leadingToggle={{
            isVisible: showSidebar,
            onToggle: handleToggleSidebar,
            visibleIcon: <PanelLeftClose size={16} />,
            hiddenIcon: <PanelLeft size={16} />,
            label: "agents sidebar",
          }}
        />
        <div className={styles["agents-body-row"]}>
          <AgentsPageComponent
            showSidebar={showSidebar}
            transitionStyle={transitionStyle}
          />
        </div>
      </div>
    </div>
  );
}
