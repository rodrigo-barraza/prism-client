import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./SidebarTabHeaderComponent.module.css";

interface SidebarTabHeaderProps {
  icon: LucideIcon;
  title: string;
  count?: number | string | null;
  countSuffix?: string;
  actions?: ReactNode;
}

export default function SidebarTabHeaderComponent({
  icon: IconComponent,
  title,
  count,
  countSuffix,
  actions,
}: SidebarTabHeaderProps) {
  return (
    <div className={styles["sidebar-tab-header"]}>
      <IconComponent size={11} className={styles["sidebar-tab-header-icon"]} />
      <span className={styles["sidebar-tab-header-label"]}>{title}</span>
      {actions && (
        <div className={styles["sidebar-tab-header-actions"]}>{actions}</div>
      )}
      {count != null && count !== "" && count !== 0 && (
        <span className={styles["sidebar-tab-header-count"]}>
          {count}{countSuffix ?? ""}
        </span>
      )}
    </div>
  );
}
