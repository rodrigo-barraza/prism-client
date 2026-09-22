"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ToggleComponent } from "@rodrigo-barraza/components-library";
import {
  currentPushSubscription,
  disablePushNotifications,
  enablePushNotifications,
  pushAvailability,
  type PushAvailability,
} from "../services/PushNotificationService";
import { getErrorMessage } from "../utils/errorMessage";
import styles from "./PushNotificationsPanelComponent.module.css";

type PanelStatus = "loading" | "on" | "off";

const UNAVAILABLE_MESSAGES: Record<Exclude<PushAvailability, "supported">, string> = {
  "insecure-context":
    "Browser notifications need a secure page — open Prism over https (or on localhost).",
  unsupported: "This browser does not support push notifications.",
};

/**
 * Settings → Notifications: opt this browser in to "needs you" pushes — an
 * agent waiting for an approval or an answer, or a turn that finished,
 * while no visible tab is watching that conversation.
 */
export default function PushNotificationsPanelComponent() {
  const [availability] = useState<PushAvailability>(() => pushAvailability());
  const [status, setStatus] = useState<PanelStatus>(() =>
    availability === "supported" ? "loading" : "off",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (availability !== "supported") return;
    let isCancelled = false;
    currentPushSubscription()
      .then((subscription) => {
        if (!isCancelled) setStatus(subscription ? "on" : "off");
      })
      .catch(() => {
        if (!isCancelled) setStatus("off");
      });
    return () => {
      isCancelled = true;
    };
  }, [availability]);

  const handleToggle = useCallback(async (isChecked: boolean) => {
    setIsBusy(true);
    setMessage(null);
    try {
      if (!isChecked) {
        await disablePushNotifications();
        setStatus("off");
        return;
      }
      const result = await enablePushNotifications();
      switch (result.status) {
        case "enabled":
          setStatus("on");
          break;
        case "permission-denied":
          setStatus("off");
          setMessage("Notifications are blocked for this site — allow them in the browser's site settings.");
          break;
        case "server-disabled":
          setStatus("off");
          setMessage("Prism service has no push keys configured, so it cannot send notifications.");
          break;
        case "unsupported":
          setStatus("off");
          setMessage(UNAVAILABLE_MESSAGES[result.availability as Exclude<PushAvailability, "supported">]);
          break;
      }
    } catch (error: unknown) {
      setMessage(`Could not change notifications: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const unavailableMessage =
    availability === "supported" ? null : UNAVAILABLE_MESSAGES[availability];

  return (
    <div className={styles["container"]}>
      <div className={styles["row"]}>
        <div className={styles["label"]}>
          <span className={styles["title"]}>Notify me when an agent needs me</span>
          <span className={styles["description"]}>
            A browser notification when a conversation waits for your approval or your
            answer, or when a turn finishes — only while no visible Prism tab is showing
            it. A single tool call can be approved or denied from the notification itself.
          </span>
        </div>
        <div className={styles["control"]}>
          <ToggleComponent
            checked={status === "on"}
            onChange={handleToggle}
            disabled={isBusy || status === "loading" || availability !== "supported"}
            size="mini"
          />
        </div>
      </div>
      {(unavailableMessage || message) && (
        <p className={styles["message"]} role="status">
          {unavailableMessage || message}
        </p>
      )}
      <p className={styles["trust-note"]}>
        <ShieldAlert size={13} aria-hidden />
        <span>
          Approve and Deny in a notification are exactly as trusted as this browser: anyone
          who can use it can act on your agents&apos; tool calls. The Prism API does not
          authenticate these requests yet.
        </span>
      </p>
    </div>
  );
}
