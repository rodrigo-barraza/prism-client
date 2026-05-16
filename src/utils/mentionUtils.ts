// @ts-nocheck
/**
 * Mention Utilities — Pure functions for the @-mention system.
 *
 * Extracted from AgentComponent so they can be unit-tested without
 * rendering the full component tree.
 */

import badgeStyles from "../components/MentionBadgeComponent.module.css";

// ── DOM Serialization ─────────────────────────────────────────────
// Walks a contentEditable element's DOM and produces the text that
// will be sent to the model. Mention badge spans are replaced with
// their full `@path` representation.

/**
 * Serialize a contentEditable element's DOM to plain text.
 * Mention badges (spans with data-mention-path) become `@full/path`.
 *
 * @param {HTMLElement} el — root contentEditable element
 * @returns {string}
 */
export function serializeEditable(el: any) {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.dataset?.mentionPath) {
      // Include line range suffix if present (e.g. @path#L10 or @path#L10-25)
      let ref = `@${node.dataset.mentionPath}`;
      const ls = node.dataset.mentionLineStart;
      const le = node.dataset.mentionLineEnd;
      if (ls) {
        ref += le && le !== ls ? `#L${ls}-${le}` : `#L${ls}`;
      }
      text += ref;
    } else if (node.tagName === "BR") {
      text += "\n";
    } else {
      // Block wrappers created by Enter in contentEditable (div, p)
      if (text.length > 0 && !text.endsWith("\n")) text += "\n";
      text += serializeEditable(node);
    }
  }
  return text;
}

// ── Tree Flattening ───────────────────────────────────────────────

/**
 * Flatten a workspace tree node array into a flat list of entries.
 * Each entry has { path, name, type }.
 *
 * @param {Array} nodes — tree children (from WorkspaceService.tree)
 * @param {string} prefix — accumulated path prefix
 * @returns {{ path: string, name: string, type: string }[]}
 */
export function flattenTree(nodes: any, prefix = "") {
  const out = [];
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.push({ path: p, name: n.name, type: n.type });
    if (n.type === "directory" && n.children?.length) {
      out.push(...flattenTree(n.children, p));
    }
  }
  return out;
}

// ── Mention Query Detection ───────────────────────────────────────

/**
 * Given a text string and a cursor position, detect if the cursor is
 * inside a `@query` token. Returns the query and the anchor offset,
 * or null if not in a mention.
 *
 * @param {string} text — the text content of the text node
 * @param {number} cursorOffset — cursor position within the text
 * @returns {{ query: string, anchorOffset: number } | null}
 */
export function detectMentionToken(text: any, cursorOffset: any) {
  let i = cursorOffset - 1;
  while (i >= 0 && text[i] !== "@" && text[i] !== " " && text[i] !== "\n") i--;
  if (i >= 0 && text[i] === "@" && (i === 0 || text[i - 1] === " " || text[i - 1] === "\n")) {
    return { query: text.slice(i + 1, cursorOffset), anchorOffset: i };
  }
  return null;
}

// ── Mention Filtering ─────────────────────────────────────────────

/**
 * Filter a flat entries list by a query string.
 * Matches against both path and name (case-insensitive).
 *
 * @param {Array} entries — flat list from flattenTree
 * @param {string} query — search string (may be empty)
 * @param {number} limit — max results to return
 * @returns {Array}
 */
export function filterMentionResults(entries: any, query: any, limit = 20) {
  if (!entries || !entries.length) return [];
  if (!query) return entries.slice(0, limit);
  const q = query.toLowerCase();
  return entries
    .filter((e: any) => e.path.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
    .slice(0, limit);
}

// ── Text → Mention Parsing (for rendering) ───────────────────────
// Parse serialized `@path` tokens out of a plain text string so
// they can be rendered as styled badges in the message list.

/**
 * Parse a text string into segments of plain text and @-mention tokens.
 * Mention tokens match `@non-whitespace` sequences at word boundaries.
 *
 * @param {string} text — serialized message content
 * @returns {{ type: "text" | "mention", value: string }[]}
 */
export function parseMentionTokens(text: any) {
  if (!text) return [{ type: "text", value: "" }];

  // Match @path tokens — path must contain at least one `/` or `.` to
  // distinguish real file/dir mentions from casual "@someone" usage.
  // Optionally captures a trailing `#Lstart` or `#Lstart-end` suffix.
  const mentionRe = /(?:^|(?<=\s))@((?:[^\s]+\/[^\s]*|[^\s]+\.[^\s]+?)(?:#L(\d+)(?:-(\d+))?)?)(?=\s|$)/g;

  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRe.exec(text)) !== null) {
    // Text before this mention
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const segment = { type: "mention", value: match[1] };
    // Extract line range if present
    if (match[2]) {
      (segment as any).lineStart = parseInt(match[2], 10);
      if (match[3]) (segment as any).lineEnd = parseInt(match[3], 10);
    }
    segments.push(segment);
    lastIndex = mentionRe.lastIndex;
  }

  // Trailing text
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}

// ── Badge Creation ────────────────────────────────────────────
// Uses the shared MentionBadgeComponent CSS module so both the
// contentEditable input and the message list render identical badges.

/**
 * Create a mention badge DOM element for use in contentEditable.
 *
 * @param {string} path — full file/directory path
 * @param {string} name — display name (basename)
 * @param {string} type — "file" or "directory"
 * @param {object} [opts] — options
 * @param {boolean} [opts.stale] — true if the path no longer exists
 * @returns {HTMLSpanElement}
 */
export function createMentionBadge(path: any, name: any, type: any, opts = {}) {
  const badge = document.createElement("span");
  badge.contentEditable = "false";
  const classes = [badgeStyles.mentionBadge];
  if ((opts as any).stale) classes.push(badgeStyles.mentionBadgeStale);
  badge.className = classes.join(" ");
  badge.dataset.mentionPath = path;
  badge.dataset.mentionType = type || "file";
  // Store line range in data attributes for serialization
  if ((opts as any).lineStart != null) {
    badge.dataset.mentionLineStart = String((opts as any).lineStart);
    if ((opts as any).lineEnd != null && (opts as any).lineEnd !== (opts as any).lineStart) {
      badge.dataset.mentionLineEnd = String((opts as any).lineEnd);
    }
  }
  // Build display name with line suffix (#L format — GitHub convention)
  let displayName = name;
  if ((opts as any).lineStart != null) {
    displayName += (opts as any).lineEnd != null && (opts as any).lineEnd !== (opts as any).lineStart
      ? `#L${(opts as any).lineStart}-${(opts as any).lineEnd}`
      : `#L${(opts as any).lineStart}`;
  }
  // Native title attribute — used as tooltip fallback inside overflow-clipped
  // contentEditable containers where the ::after CSS tooltip gets cut off.
  let titleText = path;
  if ((opts as any).lineStart != null) {
    titleText += (opts as any).lineEnd != null && (opts as any).lineEnd !== (opts as any).lineStart
      ? `#L${(opts as any).lineStart}-${(opts as any).lineEnd}`
      : `#L${(opts as any).lineStart}`;
  }
  badge.title = titleText;
  const icon = type === "directory" ? "📁" : "📄";
  badge.textContent = `${icon} ${displayName}`;
  return badge;
}

// ── Caret Utilities ───────────────────────────────────────────────

/**
 * Place the caret (cursor) immediately after a given DOM node.
 *
 * @param {Node} node — the node to place the caret after
 */
export function placeCaretAfter(node: any) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStartAfter(node);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * Apply a mention by replacing the @query text in a text node with
 * a badge span element + trailing space.
 *
 * @param {Text} textNode — the text node containing the @query
 * @param {number} anchorOffset — offset of the `@` character in the text node
 * @param {number} cursorOffset — current cursor offset in the text node
 * @param {HTMLSpanElement} badge — the badge element to insert
 * @returns {Text} — the trailing space text node (for caret positioning)
 */
export function applyMentionToTextNode(textNode: any, anchorOffset: any, cursorOffset: any, badge: any) {
  const before = textNode.textContent.slice(0, anchorOffset);
  const after = textNode.textContent.slice(cursorOffset);
  textNode.textContent = before;
  const space = document.createTextNode(" ");
  const parent = textNode.parentNode;
  const next = textNode.nextSibling;
  parent.insertBefore(badge, next);
  parent.insertBefore(space, badge.nextSibling);
  if (after) {
    const afterNode = document.createTextNode(after);
    parent.insertBefore(afterNode, space.nextSibling);
  }
  return space;
}
