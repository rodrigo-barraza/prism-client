"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import SettingsPageComponent from "../../components/SettingsPageComponent";
import styles from "./page.module.css";

export default function SettingsPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent />
        <div className={styles["page-content-area"]}>
          <SettingsPageComponent />
        </div>
      </div>
    </div>
  );
}
