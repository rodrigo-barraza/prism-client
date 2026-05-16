"use client";

import styles from "./SectionHeaderComponent.module.css";

/**
 * SectionHeaderComponent — A panel section divider with optional icon and action.
 *
 * @param {React.ReactNode} [icon] — Leading icon element
 * @param {React.ReactNode} children — Section title text
 * @param {React.ReactNode} [action] — Right-aligned action element
 * @param {string} [className] — Additional class
 */
export default function SectionHeaderComponent({
  // @ts-ignore
  // @ts-ignore
  icon: any,
  // @ts-ignore
  // @ts-ignore
  children: any,
  // @ts-ignore
  // @ts-ignore
  action: any,
  // @ts-ignore
  // @ts-ignore
  className: any,
}) {
  return (
    <div
      // @ts-ignore
      // @ts-ignore
      className={`${styles.sectionHeader}${className ? ` ${className}` : ""}`}
    >
      {/* @ts-ignore */}
      {icon}
      {/* @ts-ignore */}
      {children}
      // @ts-ignore
      {/* @ts-ignore */}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
