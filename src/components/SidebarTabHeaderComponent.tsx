import styles from "./SidebarTabHeaderComponent.module.css";

interface SidebarTabHeaderProps {
  title: string;
  count?: number | null;
}

export default function SidebarTabHeaderComponent({
  title,
  count,
}: SidebarTabHeaderProps) {
  return (
    <div className={styles["sidebar-tab-header"]}>
      <span className={styles["sidebar-tab-header-label"]}>{title}</span>
      {count != null && count > 0 && (
        <span className={styles["sidebar-tab-header-count"]}>{count}</span>
      )}
    </div>
  );
}
