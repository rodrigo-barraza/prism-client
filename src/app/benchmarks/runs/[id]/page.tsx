"use client";

import { useParams } from "next/navigation";
import NavigationSidebarComponent from "../../../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../../../components/ThreePanelLayoutComponent";
import RunReportComponent from "../../../../components/benchmarks/RunReportComponent";
import styles from "../../page.module.css";

export default function BenchmarkRunPage() {
  const params = useParams();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return (
    <ThreePanelLayout navSidebar={<NavigationSidebarComponent mode="user" />} leftPanel={null} title="Benchmarks">
      <main className={styles["page-content-area"]}>{id && <RunReportComponent key={id} runId={id} />}</main>
    </ThreePanelLayout>
  );
}
