"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import VisionPageComponent from "../../components/VisionPageComponent";
import styles from "./page.module.css";

export default function VisionPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Vision" />
        <div className={styles["page-content-area"]}>
          <VisionPageComponent />
        </div>
      </div>
    </div>
  );
}
