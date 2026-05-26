"use client";

import { useState, useCallback } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";
import { FEEDBACK_BRIEF_MS } from "@rodrigo-barraza/utilities-library";
import { copyToClipboard } from "../utils/utilities";
import styles from "./JsonViewerComponent.module.css";

/**
 * JsonViewerComponent — interactive, collapsible JSON tree viewer.
 *
 * Props:
 *   data      — any JSON-serializable value
 *   label     — optional top-level label (e.g. "Request Payload")
 *   collapsed — default collapse depth (0 = all collapsed, Infinity = expanded)
 *   maxHeight — optional max-height with scroll (e.g. "400px")
 *   className — extra root class
 */
export interface JsonViewerProps {
  data: any;
  label?: string;
  collapsed?: number;
  maxHeight?: string;
  className?: string;
}

export default function JsonViewerComponent({
  data,
  label,
  collapsed = Infinity,
  maxHeight,
  className,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(JSON.stringify(data, null, 2));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), FEEDBACK_BRIEF_MS);
    }
  }, [data]);

  return (
    <div
      className={`${styles.viewer} ${className || ""}`}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      <div className={styles.toolbar}>
        {label && <span className={styles.label}>{label}</span>}
        <button
          className={styles.copyButton}
          onClick={handleCopy}
          title="Copy JSON"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className={styles.tree}>
        <JsonNode value={data} depth={0} defaultCollapsed={collapsed} />
      </div>
    </div>
  );
}

interface JsonNodeProps {
  keyName?: string | number;
  value: any;
  depth: number;
  defaultCollapsed: number;
  isLast?: boolean;
}

function JsonNode({
  keyName,
  value,
  depth,
  defaultCollapsed,
  isLast = true,
}: JsonNodeProps) {
  const type = getType(value);
  const isExpandable = type === "object" || type === "array";
  const [expanded, setExpanded] = useState(depth < defaultCollapsed);

  if (isExpandable) {
    const entries = (
      type === "array"
        ? (value as any[]).map((v, i) => [i, v])
        : Object.entries(value)
    ) as [any, any][];
    const bracket = type === "array" ? ["[", "]"] : ["{", "}"];
    const isEmpty = entries.length === 0;

    return (
      <div className={styles.node}>
        <div
          className={styles.jsonRow}
          onClick={() => !isEmpty && setExpanded((prev) => !prev)}
          style={{ cursor: isEmpty ? "default" : "pointer" }}
        >
          {!isEmpty && (
            <span
              className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
            >
              <ChevronRight size={12} />
            </span>
          )}
          {keyName !== undefined && (
            <span className={styles.key}>
              {JSON.stringify(String(keyName))}:{" "}
            </span>
          )}
          {isEmpty ? (
            <span className={styles.bracket}>
              {bracket[0]}
              {bracket[1]}
            </span>
          ) : expanded ? (
            <span className={styles.bracket}>{bracket[0]}</span>
          ) : (
            <span className={styles.isCollapsedState}>
              {bracket[0]}
              <span className={styles.ellipsis}>
                {entries.length} {type === "array" ? "items" : "keys"}
              </span>
              {bracket[1]}
            </span>
          )}
          {!expanded && !isLast && <span className={styles.comma}>,</span>}
        </div>
        {expanded && (
          <>
            <div className={styles.children}>
              {entries.map(([k, v]: [any, any], i: number) => (
                <JsonNode
                  key={k}
                  keyName={type === "array" ? undefined : k}
                  value={v}
                  depth={depth + 1}
                  defaultCollapsed={defaultCollapsed}
                  isLast={i === entries.length - 1}
                />
              ))}
            </div>
            <div className={styles.jsonRow}>
              <span className={styles.bracket}>{bracket[1]}</span>
              {!isLast && <span className={styles.comma}>,</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // Primitive value
  return (
    <div className={styles.node}>
      <div className={styles.jsonRow}>
        {keyName !== undefined && (
          <span className={styles.key}>
            {JSON.stringify(String(keyName))}:{" "}
          </span>
        )}
        <span className={styles[`val_${type}`] || styles.val_null}>
          {formatValue(value, type)}
        </span>
        {!isLast && <span className={styles.comma}>,</span>}
      </div>
    </div>
  );
}

function getType(value: any) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "string", "number", "boolean", "object"
}

function formatValue(value: any, type: string) {
  if (type === "string") return JSON.stringify(value);
  if (type === "null") return "null";
  if (type === "boolean") return value ? "true" : "false";
  return String(value);
}
