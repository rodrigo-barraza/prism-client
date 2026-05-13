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
 * @param {boolean} [props.stale]    — True when the file/directory no longer exists
 * @param {Set}     [props.knownPaths] — Set of currently known workspace paths for staleness detection
 */
function MentionBadge({ path, name, type, stale, knownPaths }) {
  const displayName = name || path.split("/").pop() || path;
  const resolvedType = type || (displayName.includes(".") ? "file" : "directory");
  const icon = resolvedType === "directory" ? "📁" : "📄";

  // Determine staleness: explicit prop wins, otherwise check against known paths
  const isStale = stale ?? (knownPaths ? !knownPaths.has(path) : false);

  const className = [
    styles.mentionBadge,
    isStale && styles.mentionBadgeStale,
  ].filter(Boolean).join(" ");

  return (
    <span
      className={className}
      data-mention-path={path}
      data-mention-type={resolvedType}
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
