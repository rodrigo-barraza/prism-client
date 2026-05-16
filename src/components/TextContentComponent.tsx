"use client";

import { useState } from "react";
import { Code, BookOpen } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";
import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import styles from "./TextContentComponent.module.css";

/**
 * Reusable text content block with Raw / Preview toggle.
 *
 * @param {string}   label       – Section heading (e.g. "Text Content")
 * @param {string}   value       – The text to display / edit
 * @param {function} [onChange]  – If provided, the textarea is editable
 * @param {boolean}  [readOnly]  – Force read-only even when onChange is provided
 * @param {string}   [placeholder] – Textarea placeholder
 * @param {string}   [className] – Extra wrapper class
 */
export default function TextContentComponent({
  // @ts-ignore
  // @ts-ignore
  label: any,
  value = "",
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  readOnly = false,
  placeholder = "Enter text...",
  // @ts-ignore
  // @ts-ignore
  className: any,
}) {
  const [preview, setPreview] = useState<any>(false);

  // @ts-ignore
  const isEditable = !!onChange && !readOnly;

  return (
    // @ts-ignore
    <div className={`${styles.wrapper} ${className || ""}`}>
      <div className={styles.headerRow}>
        {/* @ts-ignore */}
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
            // @ts-ignore
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
            isEditable
              // @ts-ignore
              ? (e: any) => onChange(e.target.value)
              : undefined
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

