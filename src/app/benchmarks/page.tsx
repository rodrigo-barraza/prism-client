"use client";

import { Suspense } from "react";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../components/ThreePanelLayoutComponent";
import BenchmarksHubComponent from "../../components/benchmarks/BenchmarksHubComponent";
import styles from "./page.module.css";

export default function BenchmarksPage() {
  return (
    <ThreePanelLayout navSidebar={<NavigationSidebarComponent mode="user" />} leftPanel={null} title="Benchmarks">
      <main className={styles["page-content-area"]}>
        <Suspense>
          <BenchmarksHubComponent />
        </Suspense>
      </main>
    </ThreePanelLayout>
  );
}
