"use client";

import { Radio, RefreshCw, Loader2 } from "lucide-react";
import InfoBannerComponent from "./InfoBannerComponent";
import type { LiveSocketState } from "../services/liveViewerSocket";
import styles from "./LiveConnectionIndicatorComponent.module.css";

const BADGES: Partial<
  Record<LiveSocketState, { label: string; title: string; Icon: typeof Radio; tone: string }>
> = {
  connecting: {
    label: "Connecting",
    title: "Opening the live event stream",
    Icon: Loader2,
    tone: "tone-pending",
  },
  live: {
    label: "Live",
    title: "Streaming this conversation's events",
    Icon: Radio,
    tone: "tone-live",
  },
  reconnecting: {
    label: "Reconnecting",
    title: "The live stream dropped — reconnecting and resuming from the last event seen",
    Icon: RefreshCw,
    tone: "tone-warning",
  },
};

/**
 * The live event stream's state: a small badge while a stream is open or
 * reconnecting, and a banner when no WebSocket URL is configured at all.
 */
export default function LiveConnectionIndicatorComponent({
  state,
}: {
  state: LiveSocketState;
}) {
  if (state === "unconfigured") {
    return (
      <InfoBannerComponent variant="warning" className={styles['banner']}>
        Live updates are off — no WebSocket URL (<code>PRISM_WS_URL</code>) is configured.
        Turns running in another tab or device won&apos;t stream here, and a dropped
        stream can only be recovered by polling.
      </InfoBannerComponent>
    );
  }
  const badge = BADGES[state];
  if (!badge) return null;
  const { label, title, Icon, tone } = badge;
  return (
    <div className={`live-connection-indicator-component ${styles['row']}`}>
      <span
        className={`${styles['badge']} ${styles[tone]}`}
        role="status"
        aria-label={`Live stream: ${label}`}
        title={title}
      >
        <Icon size={11} className={state === "live" ? undefined : styles['spin']} />
        {label}
      </span>
    </div>
  );
}
