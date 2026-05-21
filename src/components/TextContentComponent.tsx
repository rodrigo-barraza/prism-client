"use client";

import { useState } from "react";
import { Code, BookOpen } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";
import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import styles from "./TextContentComponent.module.css";

/**
 * Reusable text content block with Raw / Preview toggle.
 */
export default function TextContentComponent({
  label,
  value = "",
  onChange,
  readOnly = false,
  placeholder = "Enter text...",
  className,
}: any) {
  const [preview, setPreview] = useState(false);

  const isEditable = !!onChange && !readOnly;

  return (
    <div className={`${styles.wrapper} ${className || ""}`}>
      <div className={styles.headerRow}>
        <label className={styles.label}>{label}</label>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${!preview ? styles.tabActive : ""}`}
            onClick={() => setPreview(false)}
          >
            <Code size={10} />
            Raw
          </button>
          <button
            className={`${styles.tab} ${preview ? styles.tabActive : ""}`}
            onClick={() => setPreview(true)}
          >
            <BookOpen size={10} />
            Preview
          </button>
        </div>
      </div>

      {preview ? (
        <div className={styles.markdownPreview}>
          {value ? (
            <MarkdownContent content={value} />
          ) : (
            <span className={styles.previewEmpty}>Nothing to preview</span>
          )}
        </div>
      ) : (
        <TextAreaComponent
          className={`${styles.textarea} ${!isEditable ? styles.textareaReadOnly : ""}`}
          value={value}
          onChange={
            isEditable ? (e: any) => onChange(e.target.value) : undefined
          }
          readOnly={!isEditable}
          placeholder={isEditable ? placeholder : undefined}
          minRows={4}
          maxRows={20}
        />
      )}
    </div>
  );
}
