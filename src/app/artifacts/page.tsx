"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import ArtifactsPageComponent from "../../components/ArtifactsPageComponent";
import styles from "./page.module.css";

export default function UserArtifactsPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Artifacts" />
        <div className={styles["page-content-area"]}>
          <ArtifactsPageComponent mode="user" />
        </div>
      </div>
    </div>
  );
}
