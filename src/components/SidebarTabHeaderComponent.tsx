import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./SidebarTabHeaderComponent.module.css";

function isLucideIcon(icon: LucideIcon | ReactNode): icon is LucideIcon {
  return typeof icon === "function";
}

interface SidebarTabHeaderProps {
  icon: LucideIcon | ReactNode;
  title: string;
  count?: number | string | null;
  countSuffix?: string;
  actions?: ReactNode;
  hasOnlyCoreToolsActive?: boolean;
}

export default function SidebarTabHeaderComponent({
  icon,
  title,
  count,
  countSuffix,
  actions,
  hasOnlyCoreToolsActive,
}: SidebarTabHeaderProps) {
  return (
    <div className={`sidebar-tab-header-component ${styles["sidebar-tab-header"]}`}>
      {isLucideIcon(icon) ? (
        (() => { const IconComponent = icon; return <IconComponent size={11} className={styles["sidebar-tab-header-icon"]} />; })()
      ) : (
        <span className={styles["sidebar-tab-header-emoji-icon"]}>{icon}</span>
      )}
      <span className={styles["sidebar-tab-header-label"]}>{title}</span>
      {actions && (
        <div className={styles["sidebar-tab-header-actions"]}>{actions}</div>
      )}
      {count != null &&
        count !== "" &&
        count !== 0 &&
        (() => {
          const countString = String(count);
          if (countString.includes(" / ") && hasOnlyCoreToolsActive) {
            const [enabledPart, totalPart] = countString.split(" / ");
            return (
              <span className={styles["sidebar-tab-header-count"]}>
                <span className={styles["sidebar-tab-header-count-blue"]}>
                  {enabledPart}
                </span>
                {" / "}
                {totalPart}
                {countSuffix ?? ""}
              </span>
            );
          }
          return (
            <span className={styles["sidebar-tab-header-count"]}>
              {count}
              {countSuffix ?? ""}
            </span>
          );
        })()}
    </div>
  );
}
