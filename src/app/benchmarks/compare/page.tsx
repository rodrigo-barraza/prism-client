"use client";

import { Suspense } from "react";
import NavigationSidebarComponent from "../../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../../components/ThreePanelLayoutComponent";
import CompareRunsComponent from "../../../components/benchmarks/CompareRunsComponent";
import styles from "../page.module.css";

export default function CompareBenchmarkRunsPage() {
  return (
    <ThreePanelLayout navSidebar={<NavigationSidebarComponent mode="user" />} leftPanel={null} title="Benchmarks">
      <main className={styles["page-content-area"]}>
        <Suspense>
          <CompareRunsComponent />
        </Suspense>
      </main>
    </ThreePanelLayout>
  );
}
