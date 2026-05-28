"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import ToolsPageComponent from "../../components/ToolsPageComponent";
import styles from "./page.module.css";

export default function ToolsPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Tools" />
        <div className={styles["page-content-area"]}>
          <ToolsPageComponent />
        </div>
      </div>
    </div>
  );
}
