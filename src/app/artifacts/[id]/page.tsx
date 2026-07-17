"use client";

import { useParams } from "next/navigation";
import NavigationSidebarComponent from "../../../components/NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import ArtifactDetailPageComponent from "../../../components/ArtifactDetailPageComponent";
import styles from "../page.module.css";

export default function ArtifactDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Artifacts" />
        <div className={styles["page-content-area"]}>
          <ArtifactDetailPageComponent artifactId={id} />
        </div>
      </div>
    </div>
  );
}
