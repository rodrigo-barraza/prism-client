"use client";

import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import styles from "./PromptSectionComponent.module.css";

/**
 * PromptSectionComponent — A labeled textarea section with icon header.
 *
 * Encapsulates the repeated pattern of icon + label + optional badge + textarea
 * used for system prompts, personas, and other multi-line text inputs.
 */
export default function PromptSectionComponent({
  icon,
  label,
  badge,
  value,
  onChange,
  placeholder,
  rows = 2,
  className,
}: any) {
  return (
    <div className={`${styles.section} ${className || ""}`}>
      <div className={styles.header}>
        {icon}
        <span>{label}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <TextAreaComponent
        className={styles.textarea}
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        minRows={rows}
        maxRows={8}
      />
    </div>
  );
}
