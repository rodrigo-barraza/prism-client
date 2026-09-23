"use client";

/**
 * The chat's status bar (the rainbow canvas above the composer) and the
 * announcement of the same status to screen readers.
 *
 * The bar is `deriveChatStatusBar`'s result (utils/chatStatusBar), which the
 * chat memoizes. The live region is always mounted — a region added with its
 * text is not read — and says the phase when it changes, not every token, and
 * that the reply finished when the bar goes down.
 */

import { useEffect, useRef, useState } from "react";
import StatusBarComponent, { type StatusBarPhase } from "./StatusBarComponent";
import type { ChatStatusBar } from "../utils/chatStatusBar";
import chatStyles from "./ChatAreaComponent.module.css";

export const REPLY_FINISHED_ANNOUNCEMENT = "Reply finished.";

interface ChatStatusBarComponentProps {
  statusBar: ChatStatusBar;
  iteration: number;
  maxIterations: number | undefined;
  initialElapsedMilliseconds: number | null;
}

export default function ChatStatusBarComponent({
  statusBar,
  iteration,
  maxIterations,
  initialElapsedMilliseconds,
}: ChatStatusBarComponentProps) {
  const announcement = useStatusAnnouncement(statusBar);
  return (
    <>
      <div className={chatStyles['live-status']} role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {statusBar.isActive && (
        <StatusBarComponent
          active
          phase={statusBar.phase as StatusBarPhase | undefined}
          label={statusBar.label}
          progress={statusBar.progress}
          tokensPerSecond={statusBar.tokensPerSecond}
          iteration={iteration}
          maxIterations={maxIterations}
          initialElapsedMilliseconds={initialElapsedMilliseconds}
        />
      )}
    </>
  );
}

/** The bar's label while it is up; "Reply finished." once it goes down after being up. */
function useStatusAnnouncement(statusBar: ChatStatusBar): string {
  const [announcement, setAnnouncement] = useState("");
  const wasActiveRef = useRef(false);
  const label = statusBar.isActive ? statusBar.label || statusBar.phase || "Working…" : null;
  useEffect(() => {
    if (label !== null) {
      wasActiveRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the live region trails the bar by a commit on purpose: screen readers read a change, not a mount
      setAnnouncement(label);
    } else if (wasActiveRef.current) {
      wasActiveRef.current = false;
      setAnnouncement(REPLY_FINISHED_ANNOUNCEMENT);
    }
  }, [label]);
  return announcement;
}
