"use client";

import { useParams } from "next/navigation";
import NavigationSidebarComponent from "../../../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../../../components/ThreePanelLayoutComponent";
import SuiteDetailComponent from "../../../../components/benchmarks/SuiteDetailComponent";
import styles from "../../page.module.css";

export default function BenchmarkSuitePage() {
  const params = useParams();
  const raw = params?.id;
  const id = decodeURIComponent(Array.isArray(raw) ? raw[0] : (raw ?? ""));
  return (
    <ThreePanelLayout navSidebar={<NavigationSidebarComponent mode="user" />} leftPanel={null} title="Benchmarks">
      <main className={styles["page-content-area"]}>{id && <SuiteDetailComponent key={id} suiteId={id} />}</main>
    </ThreePanelLayout>
  );
}
