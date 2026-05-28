"use client";

import styles from "./SectionHeaderComponent.module.css";

/**
 * SectionHeaderComponent — A panel section divider with optional icon and action.
 */
export default function SectionHeaderComponent({
  icon,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${styles.sectionHeader}${className ? ` ${className}` : ""}`}
    >
      {icon}
      {children}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
