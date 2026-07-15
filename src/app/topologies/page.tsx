"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../components/ThreePanelLayoutComponent";
import TopologiesPageComponent from "../../components/TopologiesPageComponent";
import styles from "./page.module.css";

export default function TopologiesPage() {
  return (
    <ThreePanelLayout
      navSidebar={<NavigationSidebarComponent mode="user" />}
      leftPanel={null}
      title="Topologies"
    >
      <main className={styles["page-content-area"]}>
        <TopologiesPageComponent />
      </main>
    </ThreePanelLayout>
  );
}
