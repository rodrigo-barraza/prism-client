"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import VramBenchmarkComponent from "../../components/VramBenchmarkComponent";
import styles from "./page.module.css";

export default function VramBenchmarkPage() {
  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="VRAM Benchmark" />
        <div className={styles["page-content-area"]}>
          <VramBenchmarkComponent />
        </div>
      </div>
    </div>
  );
}
