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
}: any) {
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
