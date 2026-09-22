"use client";

import { useEffect } from "react";
import { titleWithNeedsYouCount } from "../utils/conversationAttention";

/**
 * Prefix the tab title with how many conversations are waiting on the
 * user — "(2) Prism Playground" — and restore it once none are. Next.js
 * rewrites <title> on navigation, so the prefix is re-applied whenever the
 * element changes.
 */
export function useNeedsYouTabTitle(count: number, isEnabled: boolean = true): void {
  useEffect(() => {
    if (!isEnabled || typeof document === "undefined") return;
    const apply = () => {
      const next = titleWithNeedsYouCount(document.title, count);
      if (document.title !== next) document.title = next;
    };
    apply();
    const titleElement = document.querySelector("title");
    const observer = titleElement ? new MutationObserver(apply) : null;
    if (titleElement && observer) {
      observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
    }
    return () => {
      observer?.disconnect();
      document.title = titleWithNeedsYouCount(document.title, 0);
    };
  }, [count, isEnabled]);
}
