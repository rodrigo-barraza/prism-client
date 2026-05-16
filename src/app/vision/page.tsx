"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import VisionPageComponent from "../../components/VisionPageComponent";
import styles from "./page.module.css";

export default function VisionPage() {
  return (
    <div className="page-wrapper">
      {/* @ts-ignore */}
      <NavigationSidebarComponent mode="user" />
      <div className={styles.page}>
        <VisionPageComponent />
      </div>
    </div>
  );
}
