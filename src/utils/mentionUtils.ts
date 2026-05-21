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
 */
export function serializeEditable(element: Node) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if ((node as HTMLElement).dataset?.mentionPath) {
      // Include line range suffix if present (e.g. @path#L10 or @path#L10-25)
      let ref = `@${(node as HTMLElement).dataset.mentionPath}`;
      const ls = (node as HTMLElement).dataset.mentionLineStart;
      const le = (node as HTMLElement).dataset.mentionLineEnd;
      if (ls) {
        ref += le && le !== ls ? `#L${ls}-${le}` : `#L${ls}`;
      }
      text += ref;
    } else if ((node as HTMLElement).tagName === "BR") {
      text += "\n";
    } else {
      // Block wrappers created by Enter in contentEditable (div, p)
      if (text.length > 0 && !text.endsWith("\n")) text += "\n";
      text += serializeEditable(node);
    }
  }
  return text;
}

export interface WorkspaceEntry {
  path?: string;
  name: string;
  type: string;
  children?: WorkspaceEntry[];
}

// ── Tree Flattening ───────────────────────────────────────────────

/**
 * Flatten a workspace tree node array into a flat list of entries.
 * Each entry has { path, name, type }.
 */
export function flattenTree(nodes: WorkspaceEntry[], prefix = ""): WorkspaceEntry[] {
  const out: WorkspaceEntry[] = [];
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.push({
      path: String(p || ""),
      name: String(n.name || ""),
      type: String(n.type || ""),
    });
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
 */
export function detectMentionToken(text: string, cursorOffset: number) {
  let i = cursorOffset - 1;
  while (i >= 0 && text[i] !== "@" && text[i] !== " " && text[i] !== "\n") i--;
  if (
    i >= 0 &&
    text[i] === "@" &&
    (i === 0 || text[i - 1] === " " || text[i - 1] === "\n")
  ) {
    return { query: text.slice(i + 1, cursorOffset), anchorOffset: i };
  }
  return null;
}

// ── Mention Filtering ─────────────────────────────────────────────

/**
 * Filter a flat entries list by a query string.
 * Matches against both path and name (case-insensitive).
 */
export function filterMentionResults(entries: WorkspaceEntry[] | null, query: string, limit = 20): WorkspaceEntry[] {
  if (!entries || !entries.length) return [];
  if (!query) return entries.slice(0, limit);
  const q = query.toLowerCase();
  return entries
    .filter(
      (e) =>
        (e.path || "").toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q),
    )
    .slice(0, limit);
}

// ── Text → Mention Parsing (for rendering) ───────────────────────
// Parse serialized `@path` tokens out of a plain text string so
// they can be rendered as styled badges in the message list.

/**
 * Parse a text string into segments of plain text and @-mention tokens.
 * Mention tokens match `@non-whitespace` sequences at word boundaries.
 */
export function parseMentionTokens(text: string) {
  if (!text) return [{ type: "text", value: "" }];

  // Match @path tokens — path must contain at least one `/` or `.` to
  // distinguish real file/dir mentions from casual "@someone" usage.
  // Optionally captures a trailing `#Lstart` or `#Lstart-end` suffix.
  const mentionRe =
    /(?:^|(?<=\s))@((?:[^\s]+\/[^\s]*|[^\s]+\.[^\s]+?)(?:#L(\d+)(?:-(\d+))?)?)(?=\s|$)/g;

  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRe.exec(text)) !== null) {
    // Text before this mention
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, match.index),
      });
    }
    const segment = { type: "mention", value: match[1] };
    // Extract line range if present
    if (match[2]) {
      (segment as Record<string, any>).lineStart = parseInt(match[2], 10);
      if (match[3]) (segment as Record<string, any>).lineEnd = parseInt(match[3], 10);
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
 */
export function createMentionBadge(path: string, name: string, type: string | undefined, opts: Record<string, any> = {}) {
  const badge = document.createElement("span");
  badge.contentEditable = "false";
  const classes = [badgeStyles.mentionBadge];
  if ((opts as Record<string, any>).stale) classes.push(badgeStyles.mentionBadgeStale);
  badge.className = classes.join(" ");
  badge.dataset.mentionPath = path;
  badge.dataset.mentionType = type || "file";
  // Store line range in data attributes for serialization
  if ((opts as Record<string, any>).lineStart != null) {
    badge.dataset.mentionLineStart = String((opts as Record<string, any>).lineStart);
    if (
      (opts as Record<string, any>).lineEnd != null &&
      (opts as Record<string, any>).lineEnd !== (opts as Record<string, any>).lineStart
    ) {
      badge.dataset.mentionLineEnd = String((opts as Record<string, any>).lineEnd);
    }
  }
  // Build display name with line suffix (#L format — GitHub convention)
  let displayName = name;
  if ((opts as Record<string, any>).lineStart != null) {
    displayName +=
      (opts as Record<string, any>).lineEnd != null &&
      (opts as Record<string, any>).lineEnd !== (opts as Record<string, any>).lineStart
        ? `#L${(opts as Record<string, any>).lineStart}-${(opts as Record<string, any>).lineEnd}`
        : `#L${(opts as Record<string, any>).lineStart}`;
  }
  // Native title attribute — used as tooltip fallback inside overflow-clipped
  // contentEditable containers where the ::after CSS tooltip gets cut off.
  let titleText = path;
  if ((opts as Record<string, any>).lineStart != null) {
    titleText +=
      (opts as Record<string, any>).lineEnd != null &&
      (opts as Record<string, any>).lineEnd !== (opts as Record<string, any>).lineStart
        ? `#L${(opts as Record<string, any>).lineStart}-${(opts as Record<string, any>).lineEnd}`
        : `#L${(opts as Record<string, any>).lineStart}`;
  }
  badge.title = titleText;
  const icon = type === "directory" ? "📁" : "📄";
  badge.textContent = `${icon} ${displayName}`;
  return badge;
}

// ── Caret Utilities ───────────────────────────────────────────────

/**
 * Place the caret (cursor) immediately after a given DOM node.
 */
export function placeCaretAfter(node: Node) {
  const sel = window.getSelection()!;
  const r = document.createRange();
  r.setStartAfter(node);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * Apply a mention by replacing the @query text in a text node with
 * a badge span element + trailing space.
 */
export function applyMentionToTextNode(
  textNode: Text,
  anchorOffset: number,
  cursorOffset: number,
  badge: HTMLElement,
) {
  const before = textNode.textContent || "";
  const slicedBefore = before.slice(0, anchorOffset);
  const after = before.slice(cursorOffset);
  textNode.textContent = slicedBefore;
  const space = document.createTextNode(" ");
  const parent = textNode.parentNode;
  if (!parent) return space;
  const next = textNode.nextSibling;
  parent.insertBefore(badge, next);
  parent.insertBefore(space, badge.nextSibling);
  if (after) {
    const afterNode = document.createTextNode(after);
    parent.insertBefore(afterNode, space.nextSibling);
  }
  return space;
}
