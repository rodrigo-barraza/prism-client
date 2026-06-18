"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { Code, BookOpen } from "lucide-react";
import MarkdownContent from "./MarkdownContentComponent";
import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import styles from "./TextContentComponent.module.css";

interface TextContentProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export default function TextContentComponent({
  label,
  value = "",
  onChange,
  readOnly = false,
  placeholder = "Enter text...",
  className,
}: TextContentProps) {
  const [preview, setPreview] = useState(false);

  const isEditable = !!onChange && !readOnly;

  return (
    <div className={`text-content-component ${styles['wrapper']} ${className || ""}`}>
      <div className={styles['header-layout-row']}>
        <label className={styles['label']}>{label}</label>
        <div className={styles['tabs']}>
          <button
            className={`${styles['tab']} ${!preview ? styles['tab-is-active-state'] : ""}`}
            onClick={() => setPreview(false)}
          >
            <Code size={10} />
            Raw
          </button>
          <button
            className={`${styles['tab']} ${preview ? styles['tab-is-active-state'] : ""}`}
            onClick={() => setPreview(true)}
          >
            <BookOpen size={10} />
            Preview
          </button>
        </div>
      </div>

      {preview ? (
        <div className={styles['markdown-preview']}>
          {value ? (
            <MarkdownContent content={value} />
          ) : (
            <span className={styles['preview-empty']}>Nothing to preview</span>
          )}
        </div>
      ) : (
        <TextAreaComponent
          className={`${styles['textarea']} ${!isEditable ? styles['textarea-read-only'] : ""}`}
          value={value}
          onChange={
            isEditable ? (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value) : undefined
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
