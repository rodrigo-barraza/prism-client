"use client";

import { useRef } from "react";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import SettingsPageComponent from "../../components/SettingsPageComponent";
import SettingsSidebarNavigationComponent from "../../components/SettingsSidebarNavigationComponent";
import styles from "./page.module.css";

export default function SettingsPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Settings" />
        <div className={styles["settings-body-row"]}>
          <aside className={styles["settings-sidebar-panel"]}>
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
