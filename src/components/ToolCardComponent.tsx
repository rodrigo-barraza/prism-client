"use client";

import { CircleCheck, Circle, Lock } from "lucide-react";
import styles from "./ToolCardComponent.module.css";
import SoundService from "@/services/SoundService";

/**
 * ToolCardComponent — A compact card showing a tool's icon, name, and description.
 * Used in the empty state to display which tools are actively enabled.
 */
export default function ToolCardComponent({
  icon,
  title,
  subtitle,
  color,
  count,
  enabled = true,
  onClick,
  glowing = false,
  onHover,
  locked = false,
  enabledLabel = "Enabled",
  disabledLabel = "Disabled",
}: any) {
  return (
    <div
      className={`${styles.card}${!enabled ? ` ${styles.cardDisabled}` : ""}${glowing ? ` ${styles.cardGlow}` : ""}${locked ? ` ${styles.cardLocked}` : ""}`}
      style={{ "--tool-color": color } as any}
      onClick={
        locked
          ? undefined
          : (e: any) => {
              SoundService.playClickButton({ event: e });
              onClick?.();
            }
      }
      role={onClick && !locked ? "button" : undefined}
      tabIndex={onClick && !locked ? 0 : undefined}
      onKeyDown={
        onClick && !locked
          ? (e: any) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onMouseEnter={(e: any) => {
        SoundService.playHoverButton({ event: e });
        onHover?.(true);
      }}
      onMouseLeave={() => onHover?.(false)}
    >
      <div className={styles.icon}>{icon}</div>
      <div className={styles.info}>
        <span className={styles.title}>
          {title}
          {count != null && <span className={styles.count}>{count}</span>}
        </span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>
      {locked ? (
        <div className={styles.badgeLocked}>
          <Lock size={10} />
          Always On
        </div>
      ) : (
        <div
          className={`${styles.badge}${!enabled ? ` ${styles.badgeDisabled}` : ""}`}
        >
          {enabled ? <CircleCheck size={12} /> : <Circle size={12} />}
          {enabled ? enabledLabel : disabledLabel}
        </div>
      )}
    </div>
  );
}
