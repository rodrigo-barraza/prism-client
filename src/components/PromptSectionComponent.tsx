"use client";

import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import styles from "./PromptSectionComponent.module.css";

/**
 * PromptSectionComponent — A labeled textarea section with icon header.
 *
 * Encapsulates the repeated pattern of icon + label + optional badge + textarea
 * used for system prompts, personas, and other multi-line text inputs.
 *
 * @param {React.ReactNode} icon        — Lucide icon or element for the header
 * @param {string}          label       — Header label text
 * @param {string}          [badge]     — Optional badge text (e.g. "Optional")
 * @param {string}          value       — Textarea value
 * @param {Function}        onChange     — (newValue) => void
 * @param {string}          [placeholder] — Textarea placeholder
 * @param {number}          [rows=2]    — Textarea rows
 * @param {string}          [className] — Additional class on the wrapper
 */
export default function PromptSectionComponent({
  // @ts-ignore
  // @ts-ignore
  icon: any,
  // @ts-ignore
  // @ts-ignore
  label: any,
  // @ts-ignore
  // @ts-ignore
  badge: any,
  // @ts-ignore
  // @ts-ignore
  value: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  // @ts-ignore
  // @ts-ignore
  placeholder: any,
  rows = 2,
  // @ts-ignore
  // @ts-ignore
  className: any,
}) {
  return (
    // @ts-ignore
    <div className={`${styles.section} ${className || ""}`}>
      <div className={styles.header}>
        {/* @ts-ignore */}
        {icon}
        {/* @ts-ignore */}
        <span>{label}</span>
        // @ts-ignore
        {/* @ts-ignore */}
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <TextAreaComponent
        className={styles.textarea}
        // @ts-ignore
        value={value}
        // @ts-ignore
        onChange={(e: any) => onChange(e.target.value)}
        // @ts-ignore
        placeholder={placeholder}
        minRows={rows}
        maxRows={8}
      />
    </div>
  );
}

