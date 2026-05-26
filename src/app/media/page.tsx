"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import MediaPageComponent from "../../components/MediaPageComponent";
import styles from "./page.module.css";

export default function UserMediaPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent />
        <div className={styles["page-content-area"]}>
          <MediaPageComponent mode="user" />
        </div>
      </div>
    </div>
  );
}
