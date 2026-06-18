"use client";

import { useState, useCallback } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";
import { FEEDBACK_BRIEF_MILLISECONDS } from "@rodrigo-barraza/utilities-library";
import { copyToClipboard } from "../utils/utilities";
import styles from "./JsonViewerComponent.module.css";

import type { JsonValue } from "../types/types";

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
  data: JsonValue;
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
      setTimeout(() => setCopied(false), FEEDBACK_BRIEF_MILLISECONDS);
    }
  }, [data]);

  return (
    <div
      className={`${styles['viewer']} ${className || ""}`}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      <div className={styles['toolbar']}>
        {label && <span className={styles['label']}>{label}</span>}
        <button
          className={styles['copy-button']}
          onClick={handleCopy}
          title="Copy JSON"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className={styles['tree']}>
        <JsonNode value={data} depth={0} defaultCollapsed={collapsed} />
      </div>
    </div>
  );
}

interface JsonNodeProps {
  keyName?: string | number;
  value: JsonValue;
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
    const entries: [string | number, JsonValue][] =
      type === "array"
        ? (value as JsonValue[]).map((itemValue, index) => [index, itemValue])
        : Object.entries(value as Record<string, JsonValue>);
    const bracket = type === "array" ? ["[", "]"] : ["{", "}"];
    const isEmpty = entries.length === 0;

    return (
      <div className={styles['node']}>
        <div
          className={styles['json-layout-row']}
          onClick={() => !isEmpty && setExpanded((previousExpandedState) => !previousExpandedState)}
          style={{ cursor: isEmpty ? "default" : "pointer" }}
        >
          {!isEmpty && (
            <span
              className={`${styles['chevron']} ${expanded ? styles['chevron-open'] : ""}`}
            >
              <ChevronRight size={12} />
            </span>
          )}
          {keyName !== undefined && (
            <span className={styles['key']}>
              {JSON.stringify(String(keyName))}:{" "}
            </span>
          )}
          {isEmpty ? (
            <span className={styles['bracket']}>
              {bracket[0]}
              {bracket[1]}
            </span>
          ) : expanded ? (
            <span className={styles['bracket']}>{bracket[0]}</span>
          ) : (
            <span className={styles['is-collapsed-state']}>
              {bracket[0]}
              <span className={styles['ellipsis']}>
                {entries.length} {type === "array" ? "items" : "keys"}
              </span>
              {bracket[1]}
            </span>
          )}
          {!expanded && !isLast && <span className={styles['comma']}>,</span>}
        </div>
        {expanded && (
          <>
            <div className={styles['children']}>
              {entries.map(([nodeKey, nodeValue], entryIndex: number) => (
                <JsonNode
                  key={nodeKey}
                  keyName={type === "array" ? undefined : nodeKey}
                  value={nodeValue}
                  depth={depth + 1}
                  defaultCollapsed={defaultCollapsed}
                  isLast={entryIndex === entries.length - 1}
                />
              ))}
            </div>
            <div className={styles['json-layout-row']}>
              <span className={styles['bracket']}>{bracket[1]}</span>
              {!isLast && <span className={styles['comma']}>,</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // Primitive value
  return (
    <div className={`json-viewer-component ${styles['node']}`}>
      <div className={styles['json-layout-row']}>
        {keyName !== undefined && (
          <span className={styles['key']}>
            {JSON.stringify(String(keyName))}:{" "}
          </span>
        )}
        <span className={styles[`value-${type}`] || styles['value-null']}>
          {formatValue(value, type)}
        </span>
        {!isLast && <span className={styles['comma']}>,</span>}
      </div>
    </div>
  );
}

function getType(value: JsonValue): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function formatValue(value: JsonValue, type: string): string {
  if (type === "string") return JSON.stringify(value);
  if (type === "null") return "null";
  if (type === "boolean") return value ? "true" : "false";
  return String(value);
}
