"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  Bot,
  Brain,
  Network,
  Palette,
  Volume2,
  Lock,
} from "lucide-react";
import styles from "./SettingsSidebarNavigationComponent.module.css";

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "workspaces", label: "Workspaces", icon: FolderOpen },
  { id: "custom-agents", label: "Custom Agents", icon: Bot },
  { id: "memory-models", label: "Memory Models", icon: Brain },
  { id: "agent-defaults", label: "Agent Defaults", icon: Network },
  { id: "creative-tools", label: "Creative Tools", icon: Palette },
  { id: "audio-tools", label: "Audio Tools", icon: Volume2 },
  { id: "security-sandboxing", label: "Security & Sandboxing", icon: Lock },
  { id: "custom-themes", label: "Custom Themes", icon: Palette },
];

interface SettingsSidebarNavigationProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

export default function SettingsSidebarNavigationComponent({
  scrollContainerRef,
}: SettingsSidebarNavigationProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>(
    SETTINGS_SECTIONS[0].id,
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isUserScrolling = useRef(true);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const sectionElements = SETTINGS_SECTIONS.map((section) =>
      scrollContainer.querySelector(`[data-settings-section="${section.id}"]`),
    ).filter(Boolean) as Element[];

    if (sectionElements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (!isUserScrolling.current) return;

        const visibleEntries = entries.filter(
          (entry) => entry.isIntersecting,
        );

        if (visibleEntries.length > 0) {
          const topMostEntry = visibleEntries.reduce(
            (topEntry, currentEntry) =>
              currentEntry.boundingClientRect.top <
              topEntry.boundingClientRect.top
                ? currentEntry
                : topEntry,
          );

          const sectionId = (topMostEntry.target as HTMLElement).dataset
            .settingsSection;
          if (sectionId) {
            setActiveSectionId(sectionId);
          }
        }
      },
      {
        root: scrollContainer,
        rootMargin: "-10% 0px -70% 0px",
        threshold: 0,
      },
    );

    for (const element of sectionElements) {
      observerRef.current.observe(element);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [scrollContainerRef]);

  const handleSectionClick = useCallback(
    (sectionId: string) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const targetElement = scrollContainer.querySelector(
        `[data-settings-section="${sectionId}"]`,
      );
      if (!targetElement) return;

      isUserScrolling.current = false;
      setActiveSectionId(sectionId);

      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });

      setTimeout(() => {
        isUserScrolling.current = true;
      }, 800);
    },
    [scrollContainerRef],
  );

  return (
    <nav
      className={styles["settings-sidebar-navigation"]}
      aria-label="Settings sections"
    >
      <div className={styles["navigation-header"]}>
        <span className={styles["navigation-title"]}>Settings</span>
      </div>
      <ul className={styles["navigation-list"]}>
        {SETTINGS_SECTIONS.map((section) => {
          const IconComponent = section.icon;
          const isActive = activeSectionId === section.id;
          return (
            <li key={section.id}>
              <button
                className={`${styles["navigation-item"]} ${isActive ? styles["is-active-state"] : ""}`}
                onClick={() => handleSectionClick(section.id)}
                aria-current={isActive ? "true" : undefined}
              >
                <IconComponent size={15} />
                <span className={styles["navigation-item-label"]}>
                  {section.label}
                </span>
                {isActive && (
                  <span className={styles["active-indicator"]} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { SETTINGS_SECTIONS };
