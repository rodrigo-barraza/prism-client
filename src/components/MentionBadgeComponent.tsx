"use client";

import React, { memo } from "react";
import styles from "./MentionBadgeComponent.module.css";

/**
 * MentionBadge — Shared inline badge for @file and @directory mentions.
 *
 * Used in:
 * - MessageListComponent (read-only rendered messages)
 * - ChatAreaComponent input (via createMentionBadgeElement for contentEditable)
 *
 * @param {object}  props
 * @param {string}  props.path       — Full file/directory path
 * @param {string}  [props.name]     — Display name (defaults to basename of path)
 * @param {string}  [props.type]     — "file" or "directory" (auto-detected from name if omitted)
 * @param {number}  [props.lineStart] — Start line for file-line mentions
 * @param {number}  [props.lineEnd]   — End line for file-line range mentions
 * @param {boolean} [props.stale]    — True when the file/directory no longer exists
 * @param {Set}     [props.knownPaths] — Set of currently known workspace paths for staleness detection
 * @param {Function} [props.onFileOpen] — (path) => void — Callback to open a file in the file viewer
 */
function MentionBadge({ path, name, type, lineStart, lineEnd, stale, knownPaths, onFileOpen }: any) {
  const baseName = name || path.split("/").pop() || path;
  // Build display name with optional line suffix (#L format — GitHub convention)
  let displayName = baseName;
  if (lineStart != null) {
    displayName += lineEnd != null && lineEnd !== lineStart
      ? `#L${lineStart}-${lineEnd}`
      : `#L${lineStart}`;
  }
  const resolvedType = type || (baseName.includes(".") ? "file" : "directory");
  const icon = resolvedType === "directory" ? "📁" : "📄";

  // Determine staleness: explicit prop wins, otherwise check against known paths
  const isStale = stale ?? (knownPaths ? !knownPaths.has(path) : false);

  // Only file badges (not directories, not stale) are clickable
  const isClickable = resolvedType === "file" && !isStale && typeof onFileOpen === "function";

  const className = [
    styles.mentionBadge,
    isStale && styles.mentionBadgeStale,
    isClickable && styles.mentionBadgeClickable,
  ].filter(Boolean).join(" ");

  const handleClick = isClickable
    ? (e: any) => { e.stopPropagation(); onFileOpen(path); }
    : undefined;

  // Build tooltip text with optional line range
  let tooltipPath = path;
  if (lineStart != null) {
    tooltipPath += lineEnd != null && lineEnd !== lineStart
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
