"use client";

import React, { memo } from "react";
import styles from "./MentionBadgeComponent.module.css";

/**
 * MentionBadge — Shared inline badge for @file and @directory mentions.
 *
 * Used in:
 * - MessageListComponent (read-only rendered messages)
 * - ChatAreaComponent input (via createMentionBadgeElement for contentEditable)
 */
export interface MentionBadgeProps {
  path: string;
  name?: string;
  type?: "file" | "directory";
  lineStart?: number | null;
  lineEnd?: number | null;
  stale?: boolean;
  knownPaths?: Set<string> | null | undefined;
  onFileOpen?: ((path: string) => void) | undefined;
}

function MentionBadge({
  path,
  name,
  type,
  lineStart,
  lineEnd,
  stale,
  knownPaths,
  onFileOpen,
}: MentionBadgeProps) {
  const baseName = name || path.split("/").pop() || path;
  // Build display name with optional line suffix (#L format — GitHub convention)
  let displayName = baseName;
  if (lineStart != null) {
    displayName +=
      lineEnd != null && lineEnd !== lineStart
        ? `#L${lineStart}-${lineEnd}`
        : `#L${lineStart}`;
  }
  const resolvedType = type || (baseName.includes(".") ? "file" : "directory");
  const icon = resolvedType === "directory" ? "📁" : "📄";

  // Determine staleness: explicit prop wins, otherwise check against known paths
  const isStale = stale ?? (knownPaths ? !knownPaths.has(path) : false);

  // Only file badges (not directories, not stale) are clickable
  const isClickable =
    resolvedType === "file" && !isStale && typeof onFileOpen === "function";

  const className = [
    styles.mentionBadge,
    isStale && styles.mentionBadgeStale,
    isClickable && styles.mentionBadgeClickable,
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = isClickable
    ? (e: React.SyntheticEvent) => {
        e.stopPropagation();
        onFileOpen(path);
      }
    : undefined;

  // Build tooltip text with optional line range
  let tooltipPath = path;
  if (lineStart != null) {
    tooltipPath +=
      lineEnd != null && lineEnd !== lineStart
        ? `#L${lineStart}-${lineEnd}`
        : `#L${lineStart}`;
  }

  return (
    <span
      className={className}
      data-mention-path={tooltipPath}
      data-mention-type={resolvedType}
      onClick={handleClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <span className={styles.mentionIcon}>{icon}</span>
      {displayName}
    </span>
  );
}

export default memo(MentionBadge);

/**
 * Export the CSS module styles so the DOM-based createMentionBadge
 * (used in contentEditable) can apply the same classes.
 */
export { styles as mentionBadgeStyles };
