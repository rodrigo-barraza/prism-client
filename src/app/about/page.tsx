"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../components/ThreePanelLayoutComponent";
import AboutPageComponent from "../../components/AboutPageComponent";
import styles from "./page.module.css";

export default function AboutPage() {
  return (
    <ThreePanelLayout
      navSidebar={<NavigationSidebarComponent mode="user" />}
      leftPanel={null}
      title="About"
    >
      <div className={styles["page-content-area"]}>
        <AboutPageComponent />
      </div>
    </ThreePanelLayout>
  );
}
