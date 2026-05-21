"use client";

import { useEffect } from "react";
import EventLibrary from "@/libraries/EventLibrary";

/**
 * SessionTrackerComponent — First-party analytics tracker.
 *
 * Lightweight client component that initializes session tracking,
 * records page views, captures navigation/external link clicks,
 * and sends heartbeat pings to sessions-service via the local
 * Next.js proxy at /api/sessions.
 *
 * Drop this component into any layout to enable tracking.
 * Analytics calls are fire-and-forget — they never throw or
 * block rendering.
 */
export default function SessionTrackerComponent() {
  useEffect(() => {
    // Initialize session tracking
    const { isNew } = EventLibrary.init();

    // Record session type (new vs returning)
    if (isNew) {
      EventLibrary.postEventSessionNew(document.referrer, window.location.href);
    } else {
      EventLibrary.postEventSessionReturning(
        document.referrer,
        window.location.href,
      );
    }

    // Record initial page view
    EventLibrary.postPageView(
      window.location.href,
      document.title,
      document.referrer || null,
    );

    // Track navigation and external link clicks
    const handleDocumentClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
      if (!target?.href) return;

      const isInternal =
        target.href.includes(window.location.hostname) ||
        target.href.startsWith("/");

      if (isInternal) {
        EventLibrary.postEventNavigationClick(target.href);
      } else {
        EventLibrary.postEventLinkClick(target.href);
      }
    };

    document.addEventListener("click", handleDocumentClick, false);

    // Session heartbeat — every 5 seconds
    const heartbeatInterval = setInterval(() => {
      EventLibrary.postSession(5000, window.screen.width, window.screen.height);
    }, 5000);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("click", handleDocumentClick, false);
    };
  }, []);

  return null;
}
