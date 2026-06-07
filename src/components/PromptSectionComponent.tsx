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
}: {
  icon?: React.ReactNode;
  label?: string;
  badge?: React.ReactNode;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`prompt-section-component ${styles['section']} ${className || ""}`}>
      <div className={styles['header']}>
        {icon}
        <span>{label}</span>
        {badge && <span className={styles['badge']}>{badge}</span>}
      </div>
      <TextAreaComponent
        className={styles['textarea']}
        value={value ?? ""}
        onChange={(
          e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >,
        ) => onChange(e.target.value)}
        placeholder={placeholder}
        minRows={rows}
        maxRows={8}
      />
    </div>
  );
}
