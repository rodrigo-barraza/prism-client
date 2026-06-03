"use client";

import { useRef, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import ThreePanelLayout from "../../components/ThreePanelLayoutComponent";
import SettingsPageComponent from "../../components/SettingsPageComponent";
import SettingsSidebarNavigationComponent from "../../components/SettingsSidebarNavigationComponent";
import styles from "./page.module.css";

export default function SettingsPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const searchParameters = useSearchParams();
  const pathname = usePathname();
  const initialSectionId = searchParameters.get("section") ?? undefined;

  const handleActiveSectionChange = useCallback(
    (sectionId: string) => {
      const nextUrl = `${pathname}?section=${encodeURIComponent(sectionId)}`;
      window.history.replaceState(null, "", nextUrl);
    },
    [pathname],
  );

  return (
    <ThreePanelLayout
      navSidebar={<NavigationSidebarComponent mode="user" />}
      leftPanel={
        <SettingsSidebarNavigationComponent
          scrollContainerRef={scrollContainerRef}
          initialSectionId={initialSectionId}
          onActiveSectionChange={handleActiveSectionChange}
        />
      }
      leftTitle="Settings"
      title="Settings"
    >
      <div
        className={styles["page-content-area"]}
        ref={scrollContainerRef}
      >
        <SettingsPageComponent />
      </div>
    </ThreePanelLayout>
  );
}
