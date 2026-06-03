"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import PromptsPageComponent from "../../components/PromptsPageComponent";
import styles from "./page.module.css";

export default function UserPromptsPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Prompts" />
        <div className={styles["page-content-area"]}>
          <PromptsPageComponent />
        </div>
      </div>
    </div>
  );
}
