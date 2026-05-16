import { User } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./UserBadgeComponent.module.css";

/**
 * UserBadgeComponent — amber-colored user/username badge with icon.
 *
 * @param {string} username — username to display
 * @param {string} [className]
 */
// @ts-ignore
export default function UserBadgeComponent({ username: any, className = "" }) {
  // @ts-ignore
  // @ts-ignore
  if (!username || username === "unknown") return null;
  return (
    // @ts-ignore
    <TooltipComponent label={`User: ${username}`} position="top">
      <span className={`${styles.badge} ${className}`}>
        <User size={10} />
        {/* @ts-ignore */}
        {username}
      </span>
    </TooltipComponent>
  );
}
