"use client";

import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import ModelsPageComponent from "../../components/ModelsPageComponent";
import styles from "./page.module.css";

export default function UserModelsPage() {
  return (
    <div className="page-wrapper">
      {/* @ts-ignore */}
      <NavigationSidebarComponent mode="user" />
      <div className={styles.page}>
        {/* @ts-ignore */}
        <ModelsPageComponent mode="user" />
      </div>
    </div>
  );
}
