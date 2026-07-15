"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SearchInputComponent } from "@rodrigo-barraza/components-library";
import { getDomainIcon } from "../utils/toolDomainIcons";
import styles from "./ToolsSidebarNavigationComponent.module.css";

interface ToolsSidebarNavigationProps {
  domains: string[];
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

export default function ToolsSidebarNavigationComponent({
  domains,
  scrollContainerRef,
}: ToolsSidebarNavigationProps) {
  const [activeDomainId, setActiveDomainId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isUserScrolling = useRef(true);

  const filteredDomains = useMemo(() => {
    if (!searchQuery.trim()) return domains;
    const normalizedQuery = searchQuery.toLowerCase().trim();
    return domains.filter((domain) =>
      domain.toLowerCase().includes(normalizedQuery),
    );
  }, [domains, searchQuery]);

  useEffect(() => {
    if (domains.length > 0 && !activeDomainId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setActiveDomainId(domains[0]);
    }
  }, [domains, activeDomainId]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const sectionElements = domains
      .map((domain) =>
        scrollContainer.querySelector(`[data-domain-section="${domain.replace(/"/g, '\\"')}"]`),
      )
      .filter(Boolean) as Element[];

    if (sectionElements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (!isUserScrolling.current) return;

        const visibleEntries = entries.filter((entry) => entry.isIntersecting);

        if (visibleEntries.length > 0) {
          const topMostEntry = visibleEntries.reduce((topEntry, currentEntry) =>
            currentEntry.boundingClientRect.top < topEntry.boundingClientRect.top
              ? currentEntry
              : topEntry,
          );

          const domainId = (topMostEntry.target as HTMLElement).dataset.domainSection;
          if (domainId) {
            setActiveDomainId(domainId);
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
  }, [scrollContainerRef, domains]);

  const handleDomainClick = useCallback(
    (domainId: string) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const targetElement = scrollContainer.querySelector(
        `[data-domain-section="${domainId.replace(/"/g, '\\"')}"]`,
      );
      if (!targetElement) return;

      isUserScrolling.current = false;
      setActiveDomainId(domainId);

      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });

      setTimeout(() => {
        isUserScrolling.current = true;
      }, 800);
    },
    [scrollContainerRef],
  );

  return (
    <nav
      className={`tools-sidebar-navigation-component ${styles["tools-sidebar-navigation"]}`}
      aria-label="Tools domains"
    >
      <div className={styles["sidebar-search-wrapper"]}>
        <SearchInputComponent
          id="input-tools-sidebar-domain-search"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search domains…"
          compact
        />
      </div>
      <ul className={styles["navigation-list"]}>
        {filteredDomains.length === 0 ? (
          <li className={styles["empty-search-message"]}>
            No domains match your search.
          </li>
        ) : (
          filteredDomains.map((domain) => {
            const IconComponent = getDomainIcon(domain);
            const isActive = activeDomainId === domain;
            return (
              <li key={domain}>
                <button
                  className={`${styles["navigation-item"]} ${isActive ? styles["is-active-state"] : ""}`}
                  onClick={() => handleDomainClick(domain)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <IconComponent size={15} />
                  <span className={styles["navigation-item-label"]}>
                    {domain}
                  </span>
                  {isActive && (
                    <span className={styles["is-active-indicator-state"]} />
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
}
