"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import ModelsPageComponent from "../../components/ModelsPageComponent";
import styles from "./page.module.css";

export default function UserModelsPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent />
        <div className={styles["page-content-area"]}>
          <ModelsPageComponent mode="user" />
        </div>
      </div>
    </div>
  );
}
