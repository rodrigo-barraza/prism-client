import { User } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./UserBadgeComponent.module.css";

/**
 * UserBadgeComponent — amber-colored user/username badge with icon.
 */
export default function UserBadgeComponent({ username, className = "" }: any) {
  if (!username || username === "unknown") return null;
  return (
    <TooltipComponent label={`User: ${username}`} position="top">
      <span className={`${styles.badge} ${className}`}>
        <User size={10} />
        {username}
      </span>
    </TooltipComponent>
  );
}
