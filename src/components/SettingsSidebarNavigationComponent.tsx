"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  Brain,
  Network,
  Plug,
  Palette,
  Volume2,
  Lock,
} from "lucide-react";
import PrismService from "../services/PrismService";
import WorkspaceService from "../services/WorkspaceService";
import type { PrismSettings } from "../types/types";
import { EV_PRISM_SETTINGS_UPDATED } from "../constants";
import NavigationIndicatorComponent from "./NavigationIndicatorComponent";
import styles from "./SettingsSidebarNavigationComponent.module.css";

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "memory-models", label: "Memory Models", icon: Brain },
  { id: "agent-defaults", label: "Agent Defaults", icon: Network },
  { id: "creative-tools", label: "Creative Tools", icon: Palette },
  { id: "audio-tools", label: "Audio Tools", icon: Volume2 },
  { id: "workspaces", label: "Workspaces", icon: FolderOpen },
  { id: "security-sandboxing", label: "Security & Sandboxing", icon: Lock },
  { id: "mcp-servers", label: "MCP Servers", icon: Plug },
  { id: "custom-themes", label: "Custom Themes", icon: Palette },
];

interface SettingsSidebarNavigationProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  initialSectionId?: string;
  onActiveSectionChange?: (sectionId: string) => void;
}

function computeSectionWarnings(settings: PrismSettings | null): Record<string, number> {
  const warnings: Record<string, number> = {};
  if (!settings) return warnings;

  const memoryConfig = settings.memory || {};
  let memoryMissingCount = 0;
  if (!memoryConfig.extractionModel) {
    memoryMissingCount++;
  }
  if (!memoryConfig.consolidationModel) {
    memoryMissingCount++;
  }
  if (!memoryConfig.embeddingModel) {
    memoryMissingCount++;
  }
  if (memoryMissingCount > 0) {
    warnings["memory-models"] = memoryMissingCount;
  }

  const creativeConfig = settings.creative || {};
  let creativeMissingCount = 0;
  if (!creativeConfig.imageModel) {
    creativeMissingCount++;
  }
  if (!creativeConfig.visionModel) {
    creativeMissingCount++;
  }
  if (creativeMissingCount > 0) {
    warnings["creative-tools"] = creativeMissingCount;
  }

  let audioMissingCount = 0;
  if (!creativeConfig.textToSpeechModel) {
    audioMissingCount++;
  }
  if (!creativeConfig.speechToTextModel) {
    audioMissingCount++;
  }
  if (audioMissingCount > 0) {
    warnings["audio-tools"] = audioMissingCount;
  }

  return warnings;
}

export default function SettingsSidebarNavigationComponent({
  scrollContainerRef,
  initialSectionId,
  onActiveSectionChange,
}: SettingsSidebarNavigationProps) {
  const resolvedInitialSection =
    initialSectionId &&
    SETTINGS_SECTIONS.some((section) => section.id === initialSectionId)
      ? initialSectionId
      : SETTINGS_SECTIONS[0].id;

  const [activeSectionId, setActiveSectionId] = useState<string>(
    resolvedInitialSection,
  );
  const [sectionWarnings, setSectionWarnings] = useState<Record<string, number>>(
    {},
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isUserScrolling = useRef(true);

  useEffect(() => {
    const loadWarnings = async () => {
      try {
        const [loadedSettings, workspaceList] = await Promise.all([
          PrismService.getSettings(),
          WorkspaceService.list().catch(() => []),
        ]);
        const warnings = computeSectionWarnings(loadedSettings);
        if (!workspaceList || workspaceList.length === 0) {
          warnings["workspaces"] = 1;
        }
        setSectionWarnings(warnings);
      } catch (error) {
        console.error(error);
      }
    };
    loadWarnings();

    const handleSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<PrismSettings>;
      if (customEvent.detail) {
        setSectionWarnings((previousWarnings) => {
          const warnings = computeSectionWarnings(customEvent.detail);
          if (previousWarnings["workspaces"]) {
            warnings["workspaces"] = previousWarnings["workspaces"];
          }
          return warnings;
        });
      }
    };

    window.addEventListener(EV_PRISM_SETTINGS_UPDATED, handleSettingsUpdated);
    return () => {
      window.removeEventListener(EV_PRISM_SETTINGS_UPDATED, handleSettingsUpdated);
    };
  }, []);

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
            onActiveSectionChange?.(sectionId);
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
  }, [scrollContainerRef, onActiveSectionChange]);

  useEffect(() => {
    if (!initialSectionId || initialSectionId === SETTINGS_SECTIONS[0].id) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const scrollToInitialSection = () => {
      const targetElement = scrollContainer.querySelector(
        `[data-settings-section="${initialSectionId}"]`,
      );
      if (!targetElement) return;

      isUserScrolling.current = false;
      targetElement.scrollIntoView({ behavior: "instant", block: "start" });

      requestAnimationFrame(() => {
        isUserScrolling.current = true;
      });
    };

    requestAnimationFrame(scrollToInitialSection);
  }, [initialSectionId, scrollContainerRef]);

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
      onActiveSectionChange?.(sectionId);

      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });

      setTimeout(() => {
        isUserScrolling.current = true;
      }, 800);
    },
    [scrollContainerRef, onActiveSectionChange],
  );

  return (
    <nav
      className={`settings-sidebar-navigation-component ${styles["settings-sidebar-navigation"]}`}
      aria-label="Settings sections"
    >
      <div className={styles["navigation-header"]}>
        <span className={styles["navigation-title"]}>Settings</span>
      </div>
      <ul className={styles["navigation-list"]}>
        {SETTINGS_SECTIONS.map((section) => {
          const IconComponent = section.icon;
          const isActive = activeSectionId === section.id;
          const warningCount = sectionWarnings[section.id] || 0;
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
                <NavigationIndicatorComponent
                  count={warningCount}
                  variant="warning"
                  title={
                    section.id === "workspaces"
                      ? "No workspaces configured"
                      : `${warningCount} model${warningCount > 1 ? "s" : ""} still need to be set`
                  }
                />
                {isActive && (
                  <span className={styles["is-active-indicator-state"]} />
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
