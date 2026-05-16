"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";
import { formatElapsedTime } from "../utils/utilities";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./StopwatchBadgeComponent.module.css";

/**
 * StopwatchBadgeComponent — displays an elapsed duration badge.
 *
 * Can operate in two modes:
 *   1. Static: pass `seconds` for a fixed duration display.
 *   2. Live: pass `startTime` (ISO or epoch ms) for a ticking timer.
 *
 * Props:
 *   seconds    — elapsed time in seconds (static mode)
 *   startTime  — ISO string or epoch ms to start ticking from (live mode)
 *   live       — force the live pulsing style (e.g. external ticker)
 *   className  — additional class
 */
export default function StopwatchBadgeComponent({
  // @ts-ignore
  // @ts-ignore
  seconds: any,
  // @ts-ignore
  // @ts-ignore
  startTime: any,
  // @ts-ignore
  live: externalLive,
  className = "",
}) {
  const [nowMs, setNowMs] = useState<any>(() => Date.now());

  // @ts-ignore
  // @ts-ignore
  const isLive = !!startTime && seconds == null;

  useEffect(() => {
    if (!isLive) return;
    const immediate = setTimeout(() => setNowMs(Date.now()), 0);
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { clearTimeout(immediate); clearInterval(id); };
  // @ts-ignore
  }, [isLive, startTime]);

  let displaySeconds;
  if (isLive) {
    // @ts-ignore
    const start = typeof startTime === "number"
      // @ts-ignore
      ? startTime
      // @ts-ignore
      : new Date(startTime).getTime();
    displaySeconds = Math.max(0, (nowMs - start) / 1000);
  } else {
    // @ts-ignore
    displaySeconds = seconds || 0;
  }

  if (displaySeconds <= 0 && !isLive) return null;

  const showPulse = isLive || externalLive;
  const tooltipLabel = `Elapsed: ${formatElapsedTime(displaySeconds)}`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <span
        className={`${styles.badge} ${showPulse ? styles.live : ""} ${className}`}
      >
        <Timer size={11} />
        {formatElapsedTime(displaySeconds)}
      </span>
    </TooltipComponent>
  );
}
