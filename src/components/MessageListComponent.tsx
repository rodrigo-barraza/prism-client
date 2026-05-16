"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Check,
  FileText,
  Trash2,
  Pencil,
  RotateCcw,
  X as XIcon,
  RefreshCw,
  Zap,
  Undo2,
  AlertTriangle,
  Loader,
  User,
  Bot,
  Terminal,
} from "lucide-react";
import { resolveToolVisuals } from "./WorkflowNodeConstantsComponent";
import MarkdownContent from "./MarkdownContentComponent";
import StreamingCursorComponent from "./StreamingCursorComponent";

import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import { ToolResultView } from "./ToolResultRenderersComponent";
import { ToolBadgeRow } from "./ToolBadgeComponent";
import ProvidersBadgeComponent from "./ProvidersBadgeComponent";
import ModelBadgeComponent from "./ModelBadgeComponent";
import TokenCountBadgeComponent from "./TokenCountBadgeComponent";
import CostBadgeComponent from "./CostBadgeComponent";
import StopwatchBadgeComponent from "./StopwatchBadgeComponent";

import { BadgeComponent, CopyButtonComponent, IconButtonComponent, DateTimeBadgeComponent,
} from "@rodrigo-barraza/components-library";
import WordBadgeComponent from "./WordBadgeComponent";
import WorkerNotificationComponent from "./WorkerNotificationComponent";
import PlanCardComponent from "./PlanCardComponent.js";
import styles from "./MessageListComponent.module.css";
import PrismService from "../services/PrismService";
import SoundService from "@/services/SoundService";
import { getTotalInputTokens, renderToolName } from "../utils/utilities";
import { parseMentionTokens } from "../utils/mentionUtils";
import MentionBadge from "./MentionBadgeComponent";

/* -- Task notification detection (Claude Code pattern) -------
 * Worker results arrive as user-role messages containing
 * <task-notification> XML. Detect by content so it works for
 * both live messages and already-persisted history.            */

function parseTaskNotification(content: any) {
  if (!content || !content.includes("<task-notification>")) return null;
  const tag = (name: any) => {
    const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
    const m = content.match(re);
    return m ? m[1].trim() : null;
  };
  return {
    taskId: tag("task-id"),
    status: tag("status"),
    summary: tag("summary"),
    result: tag("result"),
    toolUses: tag("tool_uses"),
    durationMs: tag("duration_ms"),
  };
}

/* -- Render @path mentions as inline badges -------------------
 * When a user sends a message with file/dir mentions, the
 * contentEditable serializer stores them as `@path/to/file`
 * strings. This function parses them back into styled badges
 * for display in the message list.                             */

function renderContentWithMentions(text: any, knownPaths: any, onMentionFileOpen: any) {
  const segments = parseMentionTokens(text);
  // Fast path: no mentions found, return plain string
  if (segments.length === 1 && segments[0].type === "text") return text;

  return segments.map((seg, i) => {
    if (seg.type === "text") return seg.value;
    // Strip the #Lstart-Lend suffix from the value to get a clean path
    const cleanPath = seg.value.replace(/#L\d+(-L\d+)?$/, "");
    return (
      // @ts-ignore
      <MentionBadge
        key={i}
        path={cleanPath}
        // @ts-ignore
        lineStart={seg.lineStart}
        // @ts-ignore
        lineEnd={seg.lineEnd}
        knownPaths={knownPaths}
        onFileOpen={onMentionFileOpen}
      />
    );
  });
}

function getMimeCategory(ref: any) {
  if (!ref) return "file";
  if (ref.startsWith("minio://")) {
    const ext = ref.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
      return "image";
    if (["wav", "mp3", "webm", "ogg"].includes(ext)) return "audio";
    if (["mp4", "mov", "avi"].includes(ext)) return "video";
    if (ext === "pdf") return "pdf";
    if (ext === "txt") return "text";
    return "file";
  }
  // Handle HTTP/HTTPS URLs (e.g. Discord CDN images)
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    try {
      const pathname = new URL(ref).pathname;
      const ext = pathname.split(".").pop()?.toLowerCase();
      // @ts-ignore
      if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
        return "image";
      // @ts-ignore
      if (["wav", "mp3", "webm", "ogg"].includes(ext)) return "audio";
      // @ts-ignore
      if (["mp4", "mov", "avi"].includes(ext)) return "video";
      if (ext === "pdf") return "pdf";
      if (ext === "txt") return "text";
    } catch {
      // URL parse failed, fall through
    }
    return "image"; // Default assumption for HTTP URLs in images array
  }
  const match = ref.match(/^data:([\w-]+)\//);
  if (!match) return "file";
  const type = match[1];
  if (type === "application") return "pdf";
  if (type === "text") return "text";
  return type;
}

/* -- Sub-components -------------------------------------------- */

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function ThinkingBlock({ thinking: any, isStreaming: any, children: any }) {
  // User can manually toggle after streaming has finished
  const [manualOpen, setManualOpen] = useState<any>(false);
  // User can temporarily close during streaming
  const [streamClosed, setStreamClosed] = useState<any>(false);
  const contentRef = useRef<any>(null);

  // Derive collapsed state:
  // - Streaming: expanded unless user explicitly closed it
  // - Not streaming: collapsed unless user explicitly opened it
  // @ts-ignore
  const collapsed = isStreaming ? streamClosed : !manualOpen;

  // Auto-scroll to bottom of thinking content while streaming (smooth)
  useEffect(() => {
    // @ts-ignore
    if (isStreaming && !streamClosed && contentRef.current) {
      const el = contentRef.current;
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
  // @ts-ignore
  // @ts-ignore
  }, [thinking, isStreaming, streamClosed]);

  const handleToggle = () => {
    // @ts-ignore
    if (isStreaming) {
      setStreamClosed((v: any) => !v);
    } else {
      setManualOpen((v: any) => !v);
    }
  };

  // @ts-ignore
  // @ts-ignore
  if (!thinking && !children) return null;

  return (
    <div
      // @ts-ignore
      className={`${styles.thinkingBlock}${isStreaming ? ` ${styles.thinkingStreaming}` : ""}`}
    >
      <button className={styles.thinkingToggle} onClick={handleToggle}>
        <Brain size={14} />
        <span>Thoughts</span>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed && (
        <div className={styles.thinkingContent} ref={contentRef}>
          // @ts-ignore
          // @ts-ignore
          {/* @ts-ignore */}
          {thinking && <MarkdownContent content={thinking} />}
          {/* @ts-ignore */}
          {children}
        </div>
      )}
    </div>
  );
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function ToolCallsBlock({ toolCalls: any, streamingOutputs: any, workerToolActivity: any }) {
  const [headerCollapsed, setHeaderCollapsed] = useState<any>(false);
  // @ts-ignore
  // @ts-ignore
  if (!toolCalls || toolCalls.length === 0) return null;

  // @ts-ignore
  const hasActiveCalls = toolCalls.some((tc: any) => tc.status === "calling");
  // @ts-ignore
  const doneCount = toolCalls.filter((tc: any) => tc.status === "done" || tc.status === "error").length;

  // Build header text with active tense awareness
  const headerText = (() => {
    // @ts-ignore
    if (toolCalls.length === 1) {
      // @ts-ignore
      // @ts-ignore
      const name = toolCalls[0].name === "googleSearch" ? "Google Search" : renderToolName(toolCalls[0].name);
      if (hasActiveCalls) return `Calling ${name}…`;
      return `Used tool: ${name}`;
    }
    if (hasActiveCalls) {
      // @ts-ignore
      const progress = doneCount > 0 ? ` (${doneCount}/${toolCalls.length} done)` : "";
      // @ts-ignore
      return `Running ${toolCalls.length} tools${progress}…`;
    }
    // @ts-ignore
    return `Used ${toolCalls.length} tools`;
  })();

  return (
    <div className={`${styles.toolCallsBlock}${hasActiveCalls ? ` ${styles.toolCallsStreaming}` : ""}`}>
      {/* -- Header toggle -- */}
      <button
        className={styles.toolCallsToggle}
        onClick={() => setHeaderCollapsed((c: any) => !c)}
      >
        <Zap size={13} />
        <span>{headerText}</span>
        {headerCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* -- Always-visible tool cards -- */}
      {!headerCollapsed && (
        <div className={styles.toolCallsContent}>
          {/* @ts-ignore */}
          {toolCalls.map((tc: any, j: any) => {
            const name = tc.name === "googleSearch" ? "Google Search" : renderToolName(tc.name);
            const { Icon, color } = resolveToolVisuals(tc.name);

            const isCalling = tc.status === "calling";
            const isError = tc.status === "error";

            return (
              <div key={j} className={styles.toolCallItem}>
                {/* Status indicator */}
                <span className={`${styles.toolCallStatusIcon}${isCalling ? ` ${styles.toolCallStatusCalling}` : ""}${isError ? ` ${styles.toolCallStatusError}` : ""}`}>
                  {isCalling
                    ? <Loader size={12} className={styles.toolCallSpinner} />
                    : isError
                      ? <AlertTriangle size={12} />
                      : <Check size={12} />}
                </span>

                <span className={styles.toolCallIcon} style={{ color }}>
                  <Icon size={13} />
                </span>
                <span className={styles.toolCallName}>{name}</span>

                {/* Worker tool badges — show which tools a spawned agent used */}
                {tc.name === "team_create" && (() => {
                  const parsed = tc.result ? (typeof tc.result === "string" ? (() => { try { return JSON.parse(tc.result); } catch { return null; } })() : tc.result) : null;
                  const members = parsed?.members || [];
                  // Aggregate tool activity from all team members
                  const allToolNames = {};
                  let activeTool = null;
                  for (const member of members) {
                    // @ts-ignore
                    // @ts-ignore
                    const activity = member.agent_id && workerToolActivity ? workerToolActivity[member.agent_id] : null;
                    if (activity?.toolNames) {
                      for (const [name, count] of Object.entries(activity.toolNames)) {
                        // @ts-ignore
                        // @ts-ignore
                        allToolNames[name] = (allToolNames[name] || 0) + count;
                      }
                      if (activity.currentTool) activeTool = activity.currentTool;
                    }
                  }
                  // Fallback: match by description during calling state (before result arrives)
                  // createTeam prefixes descriptions as "[teamName] description"
                  // @ts-ignore
                  if (Object.keys(allToolNames).length === 0 && workerToolActivity && Array.isArray(tc.args?.members)) {
                    for (const argMember of tc.args.members) {
                      // @ts-ignore
                      const match = Object.values(workerToolActivity).find((v) =>
                        // @ts-ignore
                        // @ts-ignore
                        v.description && v.description.includes(argMember.description),
                      );
                      // @ts-ignore
                      if (match?.toolNames) {
                        // @ts-ignore
                        for (const [name, count] of Object.entries(match.toolNames)) {
                          // @ts-ignore
                          // @ts-ignore
                          allToolNames[name] = (allToolNames[name] || 0) + count;
                        }
                        // @ts-ignore
                        // @ts-ignore
                        if (match.currentTool) activeTool = match.currentTool;
                      }
                    }
                  }
                  // @ts-ignore
                  if (Object.keys(allToolNames).length > 0) return <ToolBadgeRow tools={allToolNames} activeTool={activeTool} />;
                  // Static badge from completed result
                  const totalToolUses = members.reduce((sum: any, m: any) => sum + (m.toolUses || 0), 0);
                  // @ts-ignore
                  if (totalToolUses > 0) return <ToolBadgeRow tools={{ "Tool Calling": totalToolUses }} />;
                  return null;
                })()}

                {/* Tool-specific result renderer (registry pattern) */}
                <ToolResultView
                  toolCall={tc}
                  // @ts-ignore
                  streamingOutput={streamingOutputs?.get(tc.id)}
                  // @ts-ignore
                  workerToolActivity={workerToolActivity}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Prepare messages for display — filters out tool/system messages
 * and merges tool results into the preceding assistant's toolCalls.
 * Soft-deleted messages are always included (with their `deleted` flag)
 * so they render in-place as ghostly apparitions.
 * Use this in both /chat and /admin/conversations for consistency.
 */
export function prepareDisplayMessages(rawMessages: any) {
  if (!rawMessages || rawMessages.length === 0) return [];

  // First pass: collect tool results keyed by tool_call_id
  // Support both snake_case (API) and camelCase (normalized) property names
  const toolResults = {};
  for (const m of rawMessages) {
    if (m.role === "tool") {
      const id = m.tool_call_id || m.toolCallId;
      // @ts-ignore
      if (id) toolResults[id] = m.content;
    }
  }

  // Second pass: filter and enrich
  const filtered = rawMessages
    .filter(
      (m: any) =>
        m.role !== "tool" &&
        m.role !== "system" &&
        !(
          m.role === "assistant" &&
          !m.content?.trim() &&
          !m.toolCalls?.length &&
          !m.images?.length &&
          !m.audio &&
          !m.error
        ),
    )
    .map((m: any) => {
      // Merge tool results into toolCalls
      if (m.toolCalls?.length > 0 && Object.keys(toolResults).length > 0) {
        const enrichedCalls = m.toolCalls.map((tc: any) => ({
          ...tc,
          result:
            tc.result ||
            // @ts-ignore
            toolResults[tc.id] ||
            // @ts-ignore
            toolResults[tc.tool_call_id] ||
            null,
        }));
        return { ...m, toolCalls: enrichedCalls };
      }
      return m;
    });
  return filtered;
}

function MediaPreview({ dataUrl: rawUrl, onClick }: any) {
  const src = PrismService.getFileUrl(rawUrl);
  const cat = getMimeCategory(rawUrl);

  if (cat === "image") {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt="Attached"
        className={styles.messageImage}
        onClick={onClick}
      />
    );
  }
  if (cat === "audio") {
    return (
      <div className={styles.audioCard}>
        {/* @ts-ignore */}
        <AudioPlayerRecorderComponent src={src} compact />
      </div>
    );
  }
  if (cat === "video") {
    return (
      <div className={styles.videoCard}>
        <video
          controls
          src={src}
          preload="metadata"
          className={styles.videoPreview}
        />
      </div>
    );
  }
  if (cat === "pdf") {
    return (
      <div className={styles.pdfViewer}>
        <div className={styles.pdfHeader}>
          <FileText size={14} className={styles.pdfHeaderIcon} />
          <span className={styles.pdfHeaderLabel}>PDF Document</span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.pdfOpenLink}
          >
            Open ↗
          </a>
        </div>
        <iframe src={src} className={styles.pdfFrame} title="PDF preview" />
      </div>
    );
  }
  if (cat === "text") {
    return (
      <div
        className={styles.mediaCard}
        onClick={onClick}
        style={onClick ? { cursor: "pointer" } : undefined}
      >
        <FileText size={22} className={styles.mediaCardIcon} />
        <span className={styles.mediaCardLabel}>{cat.toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className={styles.mediaCard}>
      <FileText size={22} className={styles.mediaCardIcon} />
      <span className={styles.mediaCardLabel}>{cat.toUpperCase()}</span>
    </div>
  );
}

/* -- Inline edit for messages ---------------------------------- */

function EditableMessage({
  // @ts-ignore
  // @ts-ignore
  content: any,
  // @ts-ignore
  // @ts-ignore
  index: any,
  // @ts-ignore
  // @ts-ignore
  role: any,
  // @ts-ignore
  // @ts-ignore
  onEdit: any,
  // @ts-ignore
  // @ts-ignore
  editing: any,
  // @ts-ignore
  // @ts-ignore
  onCancelEdit: any,
  // @ts-ignore
  // @ts-ignore
  knownPaths: any,
  // @ts-ignore
  // @ts-ignore
  onMentionFileOpen: any,
}) {
  // @ts-ignore
  const [editValue, setEditValue] = useState<any>(content);
  const textareaRef = useRef<any>(null);
  // @ts-ignore
  const isAssistant = role === "assistant";

  // Auto-resize textarea to fit content on open
  useEffect(() => {
    // @ts-ignore
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 600) + "px";
    }
  // @ts-ignore
  }, [editing]);

  const cancel = () => {
    // @ts-ignore
    onCancelEdit();
    // @ts-ignore
    setEditValue(content);
  };
  const save = () => {
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    if (editValue.trim() && editValue !== content) onEdit(index, editValue);
    // @ts-ignore
    onCancelEdit();
  };
  const handleKey = (e: any) => {
    if (e.key === "Escape") cancel();
    // Only user messages submit on plain Enter; assistant messages
    // always use Shift+Enter or the Save button (since content is long)
    else if (e.key === "Enter" && !e.shiftKey && !isAssistant) {
      e.preventDefault();
      save();
    }
  };

  // @ts-ignore
  if (editing) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
        }}
      >
        <textarea
          ref={textareaRef}
          autoFocus
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            // Auto-resize as content changes
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 600) + "px";
          }}
          onKeyDown={handleKey}
          rows={isAssistant ? 8 : 3}
          style={{
            width: "100%",
            minHeight: isAssistant ? 120 : 60,
            maxHeight: 600,
            padding: "10px 12px",
            fontSize: isAssistant ? 13 : 14,
            lineHeight: 1.55,
            color: "var(--text-primary)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--accent-color)",
            borderRadius: 8,
            resize: "vertical",
            fontFamily: isAssistant ? "var(--font-mono, monospace)" : "inherit",
            boxShadow: "0 0 0 2px var(--accent-glow)",
            tabSize: 2,
          }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={save}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              background: "var(--accent-color)",
              color: "#fff",
            }}
          >
            <Check size={14} /> Save
          </button>
          <button
            onClick={cancel}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              cursor: "pointer",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <XIcon size={14} /> Cancel
          </button>
          {isAssistant && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Raw markdown • Esc to cancel
            </span>
          )}
        </div>
      </div>
    );
  }

  // Non-editing: user messages show plain text, assistant uses caller's rendering
  if (!isAssistant) {
    // @ts-ignore
    // @ts-ignore
    // @ts-ignore
    return <div className={styles.text}>{renderContentWithMentions(content, knownPaths, onMentionFileOpen)}</div>;
  }
  return null; // Assistant non-editing rendering is handled by the caller
}

/* -- Main export ----------------------------------------------- */

/**
 * Shared message list component.
 *
 * @param {object} props
 * @param {Array}  props.messages          - array of message objects
 * @param {boolean} [props.readOnly=false] - hide edit/delete/rerun actions
 * @param {boolean} [props.isGenerating]   - show generating indicator
 * @param {Function} [props.onDelete]      - (index) => void
 * @param {Function} [props.onEdit]        - (index, newContent) => void
 * @param {Function} [props.onRerun]       - (index) => void
 * @param {Function} [props.onImageClick]  - (resolvedUrl) => void
 * @param {Function} [props.onDocClick]    - (resolvedUrl) => void
 * @param {Map}      [props.streamingOutputs] - toolCallId → accumulated output string
 * @param {object}   [props.workerToolActivity] - workerId → { currentTool, toolCount, iteration, maxIterations }
 * @param {Set}      [props.knownPaths] - Set of workspace paths that currently exist (for mention staleness)
 * @param {Function} [props.onMentionFileOpen] - (absolutePath) => void - open a mentioned file in file viewer
 */
export default function MessageList({
  messages = [],
  readOnly = false,
  isGenerating = false,
  // @ts-ignore
  // @ts-ignore
  streamingOutputs: any,
  // @ts-ignore
  // @ts-ignore
  workerToolActivity: any,
  // @ts-ignore
  // @ts-ignore
  headerContent: any,
  // @ts-ignore
  // @ts-ignore
  systemPrompt: any,
  // @ts-ignore
  // @ts-ignore
  onSystemPromptEdit: any,
  // @ts-ignore
  // @ts-ignore
  planProposal: any,
  // @ts-ignore
  // @ts-ignore
  onPlanApprove: any,
  // @ts-ignore
  // @ts-ignore
  onPlanReject: any,
  // @ts-ignore
  // @ts-ignore
  knownPaths: any,

  // @ts-ignore
  // @ts-ignore
  onDelete: any,
  // @ts-ignore
  // @ts-ignore
  onRestore: any,
  // @ts-ignore
  // @ts-ignore
  onEdit: any,
  // @ts-ignore
  // @ts-ignore
  onRerun: any,
  // @ts-ignore
  // @ts-ignore
  onImageClick: any,
  // @ts-ignore
  // @ts-ignore
  onDocClick: any,
  // @ts-ignore
  // @ts-ignore
  onMentionFileOpen: any,
}) {
  const [editingIndex, setEditingIndex] = useState<any>(null);
  const [expandedDeletedSet, setExpandedDeletedSet] = useState<any>(new Set());
  // @ts-ignore
  // @ts-ignore
  const hasSystemPrompt = !!(systemPrompt && systemPrompt.trim());

  // -- Sticky last user message (pinned header) -------------
  const [isUserMsgScrolledPast, setIsUserMsgScrolledPast] = useState<any>(false);
  const lastUserMsgRef = useRef<any>(null);
  const lastUserMsgIndexRef = useRef<any>(-1);
  const scrollingToUserMsgRef = useRef<any>(false);

  // Find the last user message
  const lastUserMsgIndex = useMemo<any>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      // @ts-ignore
      // @ts-ignore
      // @ts-ignore
      if (messages[i].role === "user" && !messages[i].deleted && !parseTaskNotification(messages[i].content)) return i;
    }
    return -1;
  }, [messages]);

  // IntersectionObserver for scroll-past detection
  useEffect(() => {
    lastUserMsgIndexRef.current = lastUserMsgIndex;
    const node = lastUserMsgRef.current;
    if (!node || lastUserMsgIndex < 0) {
      return;
    }

    // Find the scroll container — walk up to the nearest overflow-y ancestor
    let scrollParent = node.parentElement;
    while (scrollParent) {
      const overflow = getComputedStyle(scrollParent).overflowY;
      if (overflow === "auto" || overflow === "scroll") break;
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Suppress during programmatic scroll-to to prevent stutter
        if (scrollingToUserMsgRef.current) return;
        // Show sticky when user message is NOT intersecting
        // AND the element is above the viewport (scrolled past)
        const scrolledPast = !entry.isIntersecting &&
          // @ts-ignore
          entry.boundingClientRect.bottom < entry.rootBounds.top + 20;
        setIsUserMsgScrolledPast(scrolledPast);
      },
      {
        root: scrollParent,
        threshold: 0,
        rootMargin: "0px",
      },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      setIsUserMsgScrolledPast(false);
    };
  }, [lastUserMsgIndex]);

  // Derive sticky message data from the boolean flag
  const stickyUserMsg = useMemo<any>(() => {
    if (!isUserMsgScrolledPast || lastUserMsgIndex < 0) return null;
    const msg = messages[lastUserMsgIndex];
    if (!msg) return null;
    return {
      // @ts-ignore
      content: msg.content,
      // @ts-ignore
      images: msg.images,
      index: lastUserMsgIndex,
    };
  }, [isUserMsgScrolledPast, lastUserMsgIndex, messages]);

  const handleStickyClick = useCallback(() => {
    const node = lastUserMsgRef.current;
    if (!node) return;
    // Walk up to the nearest scrollable ancestor
    let scrollParent = node.parentElement;
    while (scrollParent) {
      const overflow = getComputedStyle(scrollParent).overflowY;
      if (overflow === "auto" || overflow === "scroll") break;
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent) return;

    // Suppress observer during scroll to prevent stutter from layout shifts
    scrollingToUserMsgRef.current = true;

    const nodeRect = node.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const offset = nodeRect.top - parentRect.top + scrollParent.scrollTop - 50;
    scrollParent.scrollTo({ top: offset, behavior: "smooth" });

    // Re-enable observer after scroll completes — it will naturally
    // detect the element is visible and dismiss the sticky header
    setTimeout(() => {
      scrollingToUserMsgRef.current = false;
      // Manually check if element is now visible and dismiss sticky
      const rect = node.getBoundingClientRect();
      const pRect = scrollParent.getBoundingClientRect();
      if (rect.top >= pRect.top) {
        setIsUserMsgScrolledPast(false);
      }
    }, 600);
  }, []);

  const toggleDeletedExpanded = (index: any) => {
    setExpandedDeletedSet((prev: any) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const swapBefore = useMemo<any>(() => {
    const arr = new Array(messages.length).fill(false);
    let lastModel = null;
    let prospectiveSwapIndex = null;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // @ts-ignore
      if (msg.role === "user") {
        if (prospectiveSwapIndex === null) {
          prospectiveSwapIndex = i; // The start of the user's turn
        }
      // @ts-ignore
      // @ts-ignore
      } else if (msg.role === "assistant" && msg.model) {
        // @ts-ignore
        if (lastModel && lastModel !== msg.model) {
          // Model changed! Show swap before the user's turn that led to this,
          // or before this assistant message if no user message preceded it.
          const swapIdx = prospectiveSwapIndex !== null ? prospectiveSwapIndex : i;
          arr[swapIdx] = true;
        }
        // @ts-ignore
        lastModel = msg.model;
        prospectiveSwapIndex = null;
      }
    }
    return arr;
  }, [messages]);

  // -- Coalesce consecutive deleted messages into groups ------
  // Each group is keyed by the index of the first deleted message
  // in the run (the "leader"). Non-leader deleted messages are
  // skipped during rendering.
  const deletedGroups = useMemo<any>(() => {
    const map = new Map(); // index → { isLeader, groupIndices }
    let i = 0;
    while (i < messages.length) {
      // @ts-ignore
      if (messages[i].deleted) {
        const start = i;
        const indices = [];
        // @ts-ignore
        while (i < messages.length && messages[i].deleted) {
          indices.push(i);
          i++;
        }
        // First in run is the leader
        map.set(start, { isLeader: true, groupIndices: indices });
        for (let k = 1; k < indices.length; k++) {
          map.set(indices[k], { isLeader: false });
        }
      } else {
        i++;
      }
    }
    return map;
  }, [messages]);

  // -- Coalesce consecutive assistant messages into groups ----
  // Each group shares a single avatar + header. Only the first
  // message in a run of assistant messages shows the avatar.
  // "isContinuation" means this assistant msg continues the
  // previous assistant msg's visual container.
  // "isLastInGroup" means metadata (tokens, cost) should render.
  const coalesceMeta = useMemo<any>(() => {
    const meta = new Array(messages.length).fill(null);
    for (let i = 0; i < messages.length; i++) {
      // @ts-ignore
      if (messages[i].role !== "assistant") continue;
      // Deleted messages always break the coalesce chain —
      // they render as their own standalone block.
      // @ts-ignore
      if (messages[i].deleted) {
        meta[i] = { isContinuation: false, isLastInGroup: true };
        continue;
      }
      const prevIsAssistant =
        // @ts-ignore
        // @ts-ignore
        i > 0 && messages[i - 1].role === "assistant" && !messages[i - 1].deleted;
      const nextIsAssistant =
        // @ts-ignore
        // @ts-ignore
        i < messages.length - 1 && messages[i + 1].role === "assistant" && !messages[i + 1].deleted;
      meta[i] = {
        isContinuation: prevIsAssistant && !swapBefore[i],
        isLastInGroup: !nextIsAssistant || (i < messages.length - 1 && swapBefore[i + 1]),
      };
    }
    return meta;
  }, [messages, swapBefore]);

  return (
    <div className={styles.messagesList}>
      {/* -- Sticky pinned user message -- */}
      <div
        className={styles.stickyUserMsg}
        onMouseEnter={(e) => stickyUserMsg && SoundService.playHoverButton({ event: e })}
        onClick={(e) => { if (stickyUserMsg) { SoundService.playClickButton({ event: e }); handleStickyClick(); } }}
        style={{
          visibility: stickyUserMsg ? "visible" : "hidden",
          opacity: stickyUserMsg ? 1 : 0,
          pointerEvents: stickyUserMsg ? "auto" : "none",
          transition: "opacity 0.2s ease, visibility 0.2s ease",
        }}
      >
        <div className={styles.stickyUserMsgInner}>
          <div className={styles.stickyUserMsgAvatar}>
            <User size={12} />
          </div>
          <div className={styles.stickyUserMsgContent}>
            {stickyUserMsg?.images && stickyUserMsg.images.length > 0 && (
              <span className={styles.stickyUserMsgBadge}>
                {stickyUserMsg.images.length} attachment{stickyUserMsg.images.length > 1 ? "s" : ""}
              </span>
            )}
            <span className={styles.stickyUserMsgText}>
              {stickyUserMsg?.content
                ? renderContentWithMentions(
                    stickyUserMsg.content.length > 200
                      ? stickyUserMsg.content.slice(0, 200) + "…"
                      : stickyUserMsg.content,
                    // @ts-ignore
                    knownPaths,
                    // @ts-ignore
                    onMentionFileOpen,
                  )
                : "(no text)"}
            </span>
          </div>
          <ChevronDown size={14} className={styles.stickyUserMsgChevron} />
        </div>
      </div>
      {hasSystemPrompt && (
        <div className={`${styles.message} ${styles.systemNode}`}>
          <div className={styles.avatar}>
            <Terminal size={16} />
          </div>
          <div className={styles.content}>
            <div className={styles.messageHeader}>
              <div className={styles.roleLabel}>System Prompt</div>
              {/* @ts-ignore */}
              {!readOnly && onSystemPromptEdit && (
                <div className={styles.messageActions}>
                  <IconButtonComponent
                    icon={<Pencil size={14} />}
                    // @ts-ignore
                    onClick={onSystemPromptEdit}
                    tooltip="Edit system prompt"
                    className={styles.actionBtn}
                  />
                </div>
              )}
            </div>
            // @ts-ignore
            {/* @ts-ignore */}
            <MarkdownContent content={systemPrompt} />
          </div>
        </div>
      )}
      {/* @ts-ignore */}
      {headerContent}
      {messages.map((msg, i) => {
        const roleClass =
          // @ts-ignore
          msg.role === "user"
            ? styles.userNode
            // @ts-ignore
            : msg.role === "system"
              ? styles.systemNode
              : styles.aiNode;
        const isStreaming =
          (isGenerating &&
            // @ts-ignore
            msg.role === "assistant" &&
            i === messages.length - 1) ||
          // @ts-ignore
          // @ts-ignore
          (msg.role === "assistant" && msg._liveStreaming === true);
        const coalesce = coalesceMeta[i];

        const showModelChange = swapBefore[i];
        // @ts-ignore
        // @ts-ignore
        const isFadedSwap = showModelChange && i > 0 && messages[i - 1].deleted && messages[i].deleted;
        const swapDividerClass = `${styles.modelChangeDivider} ${isFadedSwap ? styles.modelChangeDividerFaded : ""}`.trim();

        // If message is a non-leader deleted message, skip rendering the whole 
        // top-level block so we don't leak the model swap outside the group
        // @ts-ignore
        const deletedGroupInfo = msg.deleted ? deletedGroups.get(i) : null;
        // @ts-ignore
        if (msg.deleted && !deletedGroupInfo?.isLeader) {
          return null;
        }

        return (
          <React.Fragment key={i}>
            {showModelChange && (
              <div className={swapDividerClass}>
                <span className={styles.modelChangeLine} />
                <span className={styles.modelChangeLabel}>
                  <RefreshCw size={11} />
                  Model Swap
                </span>
                <span className={styles.modelChangeLine} />
              </div>
            )}
            {/* -- Deleted message group: coalesced into a single row -- */}
            {/* @ts-ignore */}
            {msg.deleted && (() => {
              const groupInfo = deletedGroups.get(i);
              // Non-leader deleted messages are rendered inside the leader block
              if (!groupInfo?.isLeader) return null;
              const groupIndices = groupInfo.groupIndices;
              const groupCount = groupIndices.length;
              const isExpanded = expandedDeletedSet.has(i);

              if (!isExpanded) {
                // -- Collapsed: single summary row --
                return (
                  <div className={styles.deletedRow}>
                    <button
                      className={styles.deletedToggle}
                      onClick={() => toggleDeletedExpanded(i)}
                    >
                      <ChevronRight size={13} />
                      <span className={styles.deletedBadge}>
                        Deleted{groupCount > 1 ? ` (${groupCount})` : ""}
                      </span>
                      {groupCount === 1 && (
                        <>
                          <BadgeComponent variant="info" mini tooltip="Message role">
                            {/* @ts-ignore */}
                            {msg.role === "user" ? "User" : "Model"}
                          </BadgeComponent>
                          {/* @ts-ignore */}
                          {msg.model && (
                            // @ts-ignore
                            // @ts-ignore
                            <ModelBadgeComponent models={[msg.model]} mini />
                          )}
                          {/* @ts-ignore */}
                          {msg.timestamp && (
                            // @ts-ignore
                            <DateTimeBadgeComponent date={msg.timestamp} mini />
                          )}
                          {/* @ts-ignore */}
                          {msg.content && (
                            <span className={styles.deletedPreview}>
                              {/* @ts-ignore */}
                              {msg.content.length > 80
                                // @ts-ignore
                                ? msg.content.slice(0, 80) + "…"
                                // @ts-ignore
                                : msg.content}
                            </span>
                          )}
                        </>
                      )}
                      {groupCount > 1 && (
                        <>
                          {/* @ts-ignore */}
                          <DateTimeBadgeComponent date={messages[groupIndices[0]].timestamp} mini />
                          <span style={{ opacity: 0.5 }}>—</span>
                          {/* @ts-ignore */}
                          <DateTimeBadgeComponent date={messages[groupIndices[groupCount - 1]].timestamp} mini />
                        </>
                      )}
                    </button>
                    {/* @ts-ignore */}
                    {groupCount === 1 && !readOnly && onRestore && (
                      <div className={styles.deletedActions}>
                        <IconButtonComponent
                          icon={<Undo2 size={14} />}
                          // @ts-ignore
                          onClick={() => onRestore?.(i)}
                          tooltip="Restore message"
                          className={styles.actionBtn}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              // -- Expanded: show all messages in the group --
              return (
                <div className={styles.deletedExpanded}>
                  <div className={styles.deletedRow}>
                    <button
                      className={styles.deletedToggle}
                      onClick={() => toggleDeletedExpanded(i)}
                    >
                      <ChevronDown size={13} />
                      <span className={styles.deletedBadge}>
                        Deleted{groupCount > 1 ? ` (${groupCount})` : ""}
                      </span>
                    </button>
                  </div>
                  {groupIndices.map((gi: any) => {
                    const gMsg = messages[gi];
                    const gRoleClass =
                      // @ts-ignore
                      gMsg.role === "user"
                        ? styles.userNode
                        // @ts-ignore
                        : gMsg.role === "system"
                          ? styles.systemNode
                          : styles.aiNode;

                    const gShowModelChange = swapBefore[gi];
                    // @ts-ignore
                    // @ts-ignore
                    const gIsFadedSwap = gShowModelChange && gi > 0 && messages[gi - 1].deleted && messages[gi].deleted;
                    const gSwapDividerClass = `${styles.modelChangeDivider} ${gIsFadedSwap ? styles.modelChangeDividerFaded : ""}`.trim();
                    const shouldRenderInnerSwap = gShowModelChange && gi !== groupIndices[0];

                    return (
                      <React.Fragment key={gi}>
                        {shouldRenderInnerSwap && (
                          <div className={gSwapDividerClass}>
                            <span className={styles.modelChangeLine} />
                            <span className={styles.modelChangeLabel}>
                              <RefreshCw size={11} />
                              Model Swap
                            </span>
                            <span className={styles.modelChangeLine} />
                          </div>
                        )}
                        <div className={styles.deletedGroupItem}>
                          <div className={styles.deletedGroupItemHeader}>
                            <BadgeComponent variant="info" mini tooltip="Message role">
                              {/* @ts-ignore */}
                              {gMsg.role === "user" ? "User" : "Model"}
                            </BadgeComponent>
                          {/* @ts-ignore */}
                          {gMsg.model && (
                            // @ts-ignore
                            // @ts-ignore
                            <ModelBadgeComponent models={[gMsg.model]} mini />
                          )}
                          {/* @ts-ignore */}
                          {gMsg.timestamp && (
                            // @ts-ignore
                            <DateTimeBadgeComponent date={gMsg.timestamp} mini />
                          )}
                          <div className={styles.deletedActions} style={{ opacity: 1 }}>
                            {/* @ts-ignore */}
                            {!readOnly && onRestore && (
                              <IconButtonComponent
                                icon={<Undo2 size={14} />}
                                // @ts-ignore
                                onClick={() => onRestore?.(gi)}
                                tooltip="Restore message"
                                className={styles.actionBtn}
                              />
                            )}
                            {/* @ts-ignore */}
                            {gMsg.content && (
                              <CopyButtonComponent
                                // @ts-ignore
                                text={gMsg.content}
                                tooltip="Copy raw text"
                                className={styles.actionBtn}
                              />
                            )}
                          </div>
                        </div>
                        <div className={styles.deletedMessageBody}>
                          <div className={`${styles.message} ${gRoleClass}`}>
                            <div className={`${styles.avatar} ${styles.deletedAvatar}`}>
                              // @ts-ignore
                              {/* @ts-ignore */}
                              {gMsg.role === "user" ? <User size={16} /> : gMsg.role === "system" ? "S" : <Bot size={16} />}
                            </div>
                            <div className={styles.content}>
                              {/* @ts-ignore */}
                              {gMsg.thinking && (
                                // @ts-ignore
                                // @ts-ignore
                                <ThinkingBlock thinking={gMsg.thinking} isStreaming={false} />
                              )}
                              // @ts-ignore
                              {/* @ts-ignore */}
                              {gMsg.toolCalls && gMsg.toolCalls.length > 0 && (
                                // @ts-ignore
                                // @ts-ignore
                                // @ts-ignore
                                <ToolCallsBlock toolCalls={gMsg.toolCalls} workerToolActivity={workerToolActivity} />
                              )}
                              // @ts-ignore
                              {/* @ts-ignore */}
                              {gMsg.images && gMsg.images.length > 0 && (
                                <div className={styles.imagePreviewRow}>
                                  {/* @ts-ignore */}
                                  {gMsg.images.map((rawUrl: any, j: any) => (
                                    <MediaPreview key={j} dataUrl={rawUrl} />
                                  ))}
                                </div>
                              )}
                              {/* @ts-ignore */}
                              {gMsg.content ? (
                                // @ts-ignore
                                // @ts-ignore
                                <MarkdownContent content={gMsg.content} />
                              ) : null}
                              // @ts-ignore
                              // @ts-ignore
                              {/* @ts-ignore */}
                              {gMsg.role === "assistant" && (gMsg.usage || gMsg.provider) && (
                                <div className={styles.metaBadges}>
                                  {/* @ts-ignore */}
                                  {gMsg.provider && (
                                    // @ts-ignore
                                    // @ts-ignore
                                    <ProvidersBadgeComponent providers={[gMsg.provider]} mini />
                                  )}
                                  {/* @ts-ignore */}
                                  {gMsg.model && (
                                    // @ts-ignore
                                    // @ts-ignore
                                    <ModelBadgeComponent models={[gMsg.model]} mini />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}
            {/* -- Normal (non-deleted) message -- */}
            {/* @ts-ignore */}
            {!msg.deleted && (() => {
              // -- Task notification card (replaces user bubble for worker results) --
              // Only renders for non-absorbed notifications (i.e. edge cases where
              // the matching team_create tool call isn't in the visible window).
              // @ts-ignore
              // @ts-ignore
              const taskNotif = msg.role === "user" ? parseTaskNotification(msg.content) : null;
              if (taskNotif) {
                return (
                  <WorkerNotificationComponent
                    taskNotif={taskNotif}
                    // @ts-ignore
                    timestamp={msg.timestamp}
                    readOnly={readOnly}
                    // @ts-ignore
                    onDelete={() => onDelete?.(i)}
                  />
                );
              }
              // -- Normal message rendering --
              return (
            <div
              // @ts-ignore
              ref={i === lastUserMsgIndex && msg.role === "user" ? lastUserMsgRef : undefined}
              className={`${styles.message} ${roleClass}${coalesce?.isContinuation ? ` ${styles.continuationMessage}` : ""}`}
            >
              {/* Avatar: hidden for continuation messages */}
              {!coalesce?.isContinuation && (
                <div
                  // @ts-ignore
                  className={`${styles.avatar}${msg.role === "assistant" && isGenerating && i === messages.length - 1 ? ` ${styles.prismAvatar}` : ""}`}
                >
                  // @ts-ignore
                  {/* @ts-ignore */}
                  {msg.role === "user" ? <User size={16} /> : msg.role === "system" ? "S" : <Bot size={16} />}
                </div>
              )}
              <div className={styles.content}>
                {/* Header: hidden for continuation messages */}
                {!coalesce?.isContinuation && (
                <div className={styles.messageHeader}>
                  <div className={styles.roleLabel}>
                    {/* @ts-ignore */}
                    {msg.role === "user"
                      ? "User"
                      // @ts-ignore
                      : msg.role === "system"
                        ? "System"
                        : "Model"}
                    {/* @ts-ignore */}
                    {msg.timestamp && (
                      // @ts-ignore
                      <DateTimeBadgeComponent date={msg.timestamp} mini />
                    )}
                  </div>
                  {!readOnly && (
                    <div className={styles.messageActions}>
                      {/* @ts-ignore */}
                      {msg.role === "user" && (
                        <>
                          <IconButtonComponent
                            icon={<Pencil size={14} />}
                            onClick={() =>
                              setEditingIndex(editingIndex === i ? null : i)
                            }
                            disabled={isGenerating}
                            tooltip="Edit message"
                            className={styles.actionBtn}
                          />
                          <IconButtonComponent
                            icon={<RotateCcw size={14} />}
                            // @ts-ignore
                            onClick={() => onRerun?.(i)}
                            disabled={isGenerating}
                            tooltip="Rerun this turn"
                            className={styles.actionBtn}
                          />
                        </>
                      )}
                      // @ts-ignore
                      {/* @ts-ignore */}
                      {msg.role === "assistant" && msg.content && (
                        <IconButtonComponent
                          icon={<Pencil size={14} />}
                          onClick={() =>
                            setEditingIndex(editingIndex === i ? null : i)
                          }
                          disabled={isGenerating}
                          tooltip="Edit response"
                          className={styles.actionBtn}
                        />
                      )}
                      {/* @ts-ignore */}
                      {msg.content && (
                        <CopyButtonComponent
                          // @ts-ignore
                          text={msg.content}
                          tooltip="Copy raw text"
                          className={styles.actionBtn}
                        />
                      )}
                      <IconButtonComponent
                        icon={<Trash2 size={14} />}
                        // @ts-ignore
                        onClick={() => onDelete?.(i)}
                        tooltip="Delete message"
                        variant="destructive"
                        className={styles.actionBtn}
                      />
                    </div>
                  )}
                  {/* @ts-ignore */}
                  {readOnly && msg.content && (
                    <div className={styles.messageActions}>
                      <CopyButtonComponent
                        // @ts-ignore
                        text={msg.content}
                        tooltip="Copy raw text"
                        className={styles.actionBtn}
                      />
                    </div>
                  )}
                </div>
                )}

                {/* -- Interleaved content: thinking + tool calls + text -- */}
                // @ts-ignore
                {/* @ts-ignore */}
                {msg.contentSegments && msg.contentSegments.length > 0 ? (
                  (() => {
                    // @ts-ignore
                    const segs = msg.contentSegments;
                    const hasThinking = segs.some((s: any) => s.type === "thinking");
                    // Dedup guard: track tool IDs already rendered to prevent
                    // the same tool call from appearing in multiple segments
                    const renderedToolIds = new Set();

                    // Helper: render a segment by type
                    const renderSeg = (seg: any, si: any, opts = {}) => {
                      if (seg.type === "thinking") {
                        // @ts-ignore
                        const fragment = msg.thinkingFragments?.[seg.fragmentIndex]?.trim();
                        if (!fragment) return null;
                        // @ts-ignore
                        return <MarkdownContent key={`seg-k-${si}`} content={fragment} />;
                      }
                      // @ts-ignore
                      if (seg.type === "tools" && msg.toolCalls?.length > 0) {
                        const toolIdSet = new Set(seg.toolIds || []);
                        // @ts-ignore
                        const segmentTools = msg.toolCalls.filter((tc: any) => {
                          if (!toolIdSet.has(tc.id)) return false;
                          if (renderedToolIds.has(tc.id)) return false;
                          renderedToolIds.add(tc.id);
                          return true;
                        });
                        if (segmentTools.length === 0) return null;
                        // @ts-ignore
                        // @ts-ignore
                        return <ToolCallsBlock key={`seg-t-${si}`} toolCalls={segmentTools} streamingOutputs={streamingOutputs} workerToolActivity={workerToolActivity} />;
                      }
                      if (seg.type === "text") {
                        // @ts-ignore
                        const fragmentText = msg.textFragments?.[seg.fragmentIndex]?.trim();
                        // @ts-ignore
                        const isLastTextSeg = !!opts.isLastText;
                        // @ts-ignore
                        // @ts-ignore
                        const showCursor = !opts.insideThinking && !opts.suppressCursor;
                        if (fragmentText) {
                          return (
                            <MarkdownContent
                              key={`seg-x-${si}`}
                              content={fragmentText}
                              className={isStreaming && isLastTextSeg && showCursor ? styles.streamingText : ""}
                            >
                              {/* @ts-ignore */}
                              {isLastTextSeg && showCursor && <StreamingCursorComponent active={isStreaming} />}
                            </MarkdownContent>
                          );
                        }
                        if (isStreaming && isLastTextSeg && showCursor) {
                          return <StreamingCursorComponent key={`seg-x-${si}`} active standalone />;
                        }
                        return null;
                      }
                      // @ts-ignore
                      if (seg.type === "plan" && planProposal) {
                        return (
                          <PlanCardComponent
                            key={`seg-p-${si}`}
                            // @ts-ignore
                            planText={planProposal.plan}
                            // @ts-ignore
                            steps={planProposal.steps}
                            // @ts-ignore
                            status={planProposal.status}
                            // @ts-ignore
                            onApprove={onPlanApprove}
                            // @ts-ignore
                            onReject={onPlanReject}
                          />
                        );
                      }
                      return null;
                    };

                    // Edit mode: show reasoning then editable text
                    // @ts-ignore
                    if (msg.role === "assistant" && !readOnly && editingIndex === i) {
                      const thinkingOnly = segs.filter((s: any) => s.type === "thinking");
                      const nonThinking = segs.filter((s: any) => s.type !== "thinking");
                      return (
                        <>
                          {hasThinking && thinkingOnly.length > 0 && (
                            // @ts-ignore
                            <ThinkingBlock isStreaming={false}>
                              {thinkingOnly.map((seg: any, si: any) => renderSeg(seg, si, { insideThinking: true }))}
                            </ThinkingBlock>
                          )}
                          {nonThinking.map((seg: any, si: any) => renderSeg(seg, si))}
                          <EditableMessage
                            key="seg-edit"
                            // @ts-ignore
                            content={msg.content}
                            index={i}
                            role="assistant"
                            // @ts-ignore
                            onEdit={onEdit}
                            editing={true}
                            onCancelEdit={() => setEditingIndex(null)}
                            // @ts-ignore
                            knownPaths={knownPaths}
                            // @ts-ignore
                            onMentionFileOpen={onMentionFileOpen}
                          />
                        </>
                      );
                    }

                    // -- Normal rendering --
                    // Only thinking segments go inside the ThinkingBlock.
                    // Tools and text segments render outside in their original
                    // interleaved order — this matches the post-refresh layout.
                    if (hasThinking) {
                      const thinkingOnly = segs.filter((s: any) => s.type === "thinking");
                      const visibleSegs = segs
                        .map((s: any, idx: any) => ({ seg: s, origIdx: idx }))
                        // @ts-ignore
                        // @ts-ignore
                        .filter(({ seg: any }) => seg.type !== "thinking");
                      // ThinkingBlock is streaming when thinking is the current
                      // activity (last segment is thinking)
                      const lastSeg = segs[segs.length - 1];
                      const thinkingIsStreaming = isStreaming && lastSeg?.type === "thinking";

                      // Find the last text segment among visible segs for cursor
                      const lastVisibleTextIdx = (() => {
                        for (let k = visibleSegs.length - 1; k >= 0; k--) {
                          if (visibleSegs[k].seg.type === "text") return k;
                        }
                        return -1;
                      })();

                      return (
                        <>
                          {thinkingOnly.length > 0 && (
                            // @ts-ignore
                            <ThinkingBlock isStreaming={thinkingIsStreaming}>
                              {thinkingOnly.map((seg: any, si: any) =>
                                renderSeg(seg, si, { insideThinking: true })
                              )}
                            </ThinkingBlock>
                          )}
                          {/* Tools and text segments render outside in original order */}
                          // @ts-ignore
                          // @ts-ignore
                          // @ts-ignore
                          {/* @ts-ignore */}
                          {visibleSegs.map(({ seg: any, origIdx: any }, vi: any) => {
                            const isLastText = vi === lastVisibleTextIdx;
                            return (
                              <React.Fragment key={`vis-${vi}`}>
                                // @ts-ignore
                                {/* @ts-ignore */}
                                {renderSeg(seg, origIdx, { isLastText })}
                              </React.Fragment>
                            );
                          })}
                          {/* Streaming cursor when no visible content yet */}
                          {isStreaming && visibleSegs.length === 0 && (
                            <StreamingCursorComponent active standalone />
                          )}
                        </>
                      );
                    }

                    // No thinking — render all segments inline (tools interleaved with text)
                    // Find the last text segment to place streaming cursor
                    const lastTextIdx = (() => {
                      for (let k = segs.length - 1; k >= 0; k--) {
                        if (segs[k].type === "text") return k;
                      }
                      return -1;
                    })();
                    return segs.map((seg: any, si: any) => renderSeg(seg, si, { isLastText: si === lastTextIdx }));
                  })()
                ) : (
                  <>
                    {/* Thinking block (persisted conversations without segments) */}
                    {/* @ts-ignore */}
                    {msg.thinking && (
                      // @ts-ignore
                      <ThinkingBlock
                        // @ts-ignore
                        thinking={msg.thinking}
                        // @ts-ignore
                        // @ts-ignore
                        isStreaming={isStreaming && !!msg.thinking && !msg.content}
                      />
                    )}

                    {/* Tool calls (persisted conversations without segments) */}
                    // @ts-ignore
                    {/* @ts-ignore */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      // @ts-ignore
                      // @ts-ignore
                      // @ts-ignore
                      <ToolCallsBlock toolCalls={msg.toolCalls} streamingOutputs={streamingOutputs} workerToolActivity={workerToolActivity} />
                    )}

                    {/* Text content */}
                    {/* @ts-ignore */}
                    {msg.role === "user" && !readOnly ? (
                      <EditableMessage
                        // @ts-ignore
                        content={msg.content}
                        index={i}
                        role="user"
                        // @ts-ignore
                        onEdit={onEdit}
                        editing={editingIndex === i}
                        onCancelEdit={() => setEditingIndex(null)}
                        // @ts-ignore
                        knownPaths={knownPaths}
                        // @ts-ignore
                        onMentionFileOpen={onMentionFileOpen}
                      />
                    // @ts-ignore
                    ) : msg.role === "assistant" && !readOnly && editingIndex === i ? (
                      <EditableMessage
                        // @ts-ignore
                        content={msg.content}
                        index={i}
                        role="assistant"
                        // @ts-ignore
                        onEdit={onEdit}
                        editing={true}
                        onCancelEdit={() => setEditingIndex(null)}
                        // @ts-ignore
                        knownPaths={knownPaths}
                        // @ts-ignore
                        onMentionFileOpen={onMentionFileOpen}
                      />
                    // @ts-ignore
                    ) : msg.content ? (
                      <MarkdownContent
                        // @ts-ignore
                        content={msg.content}
                        className={isStreaming ? styles.streamingText : ""}
                      >
                        {/* @ts-ignore */}
                        <StreamingCursorComponent active={isStreaming} />
                      </MarkdownContent>
                    ) : isStreaming ? (
                      <StreamingCursorComponent active standalone />
                    ) : null}
                  </>
                )}

                {/* Images / media */}
                // @ts-ignore
                {/* @ts-ignore */}
                {msg.images && msg.images.length > 0 && (
                  <div className={styles.imagePreviewRow}>
                    {/* @ts-ignore */}
                    {msg.images.map((rawUrl: any, j: any) => {
                      const resolvedUrl = PrismService.getFileUrl(rawUrl);
                      const cat = getMimeCategory(rawUrl);
                      let clickHandler;
                      if (cat === "image")
                        // @ts-ignore
                        clickHandler = () => onImageClick?.(resolvedUrl);
                      else if (cat === "pdf" || cat === "text")
                        // @ts-ignore
                        clickHandler = () => onDocClick?.(resolvedUrl);
                      return (
                        <MediaPreview
                          key={j}
                          dataUrl={rawUrl}
                          onClick={clickHandler}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Streaming audio (live session in progress) */}
                {!readOnly &&
                  // @ts-ignore
                  msg.role === "assistant" &&
                  // @ts-ignore
                  msg._liveStreaming &&
                  // @ts-ignore
                  !msg.audio && (
                    <div className={styles.audioCard}>
                      {/* @ts-ignore */}
                      <AudioPlayerRecorderComponent streaming compact />
                    </div>
                  )}

                {/* Audio */}
                {/* @ts-ignore */}
                {msg.audio && (
                  <div className={styles.imagePreviewRow}>
                    // @ts-ignore
                    // @ts-ignore
                    {/* @ts-ignore */}
                    {(Array.isArray(msg.audio) ? msg.audio : [msg.audio]).map(
                      (rawUrl: any, j: any) => (
                        <MediaPreview key={`aud-${j}`} dataUrl={rawUrl} />
                      ),
                    )}
                  </div>
                )}

                {/* Video */}
                {/* @ts-ignore */}
                {msg.video &&
                  // @ts-ignore
                  // @ts-ignore
                  // @ts-ignore
                  (Array.isArray(msg.video) ? msg.video : [msg.video]).length >
                    0 && (
                    <div className={styles.imagePreviewRow}>
                      // @ts-ignore
                      // @ts-ignore
                      {/* @ts-ignore */}
                      {(Array.isArray(msg.video) ? msg.video : [msg.video]).map(
                        (rawUrl: any, j: any) => (
                          <MediaPreview key={`vid-${j}`} dataUrl={rawUrl} />
                        ),
                      )}
                    </div>
                  )}

                {/* PDF */}
                {/* @ts-ignore */}
                {msg.pdf &&
                  // @ts-ignore
                  // @ts-ignore
                  // @ts-ignore
                  (Array.isArray(msg.pdf) ? msg.pdf : [msg.pdf]).length > 0 && (
                    <div className={styles.imagePreviewRow}>
                      // @ts-ignore
                      // @ts-ignore
                      {/* @ts-ignore */}
                      {(Array.isArray(msg.pdf) ? msg.pdf : [msg.pdf]).map(
                        (rawUrl: any, j: any) => {
                          const resolvedUrl = PrismService.getFileUrl(rawUrl);
                          return (
                            <MediaPreview
                              key={`pdf-${j}`}
                              dataUrl={rawUrl}
                              // @ts-ignore
                              onClick={() => onDocClick?.(resolvedUrl)}
                            />
                          );
                        },
                      )}
                    </div>
                  )}

                {/* Error block */}
                {/* @ts-ignore */}
                {msg.error && (
                  <div className={styles.errorBlock}>
                    <AlertTriangle size={14} className={styles.errorIcon} />
                    {/* @ts-ignore */}
                    <span>{msg.error}</span>
                  </div>
                )}

                {/* User metadata */}
                // @ts-ignore
                {/* @ts-ignore */}
                {msg.role === "user" && msg.content && (
                  <div className={styles.metaBadges}>
                    {/* @ts-ignore */}
                    <WordBadgeComponent count={msg.content.trim().split(/\s+/).filter(Boolean).length} mini />
                  </div>
                )}

                {/* Assistant metadata — only on the last message in a coalesced group */}
                {/* @ts-ignore */}
                {msg.role === "assistant" &&
                  (coalesce?.isLastInGroup !== false) &&
                  // @ts-ignore
                  // @ts-ignore
                  // @ts-ignore
                  (msg.usage || msg.audio || msg.provider) && (
                    <div className={styles.metaBadges}>
                      {/* @ts-ignore */}
                      {msg.provider && (
                        // @ts-ignore
                        // @ts-ignore
                        <ProvidersBadgeComponent providers={[msg.provider]} mini />
                      )}
                      {/* @ts-ignore */}
                      {msg.model && (
                        // @ts-ignore
                        // @ts-ignore
                        <ModelBadgeComponent models={[msg.model]} mini />
                      )}
                      {/* @ts-ignore */}
                      {msg.voice && (
                        // @ts-ignore
                        // @ts-ignore
                        <BadgeComponent variant="info" mini tooltip={`Voice: ${msg.voice}`}>🔊 {msg.voice}</BadgeComponent>
                      )}
                      {(() => {
                        // @ts-ignore
                        // @ts-ignore
                        if (msg.usage?.inputTokens != null && msg.usage?.outputTokens != null) {
                          // @ts-ignore
                          const cacheRead = msg.usage.cacheReadInputTokens || 0;
                          // @ts-ignore
                          const cacheWrite = msg.usage.cacheCreationInputTokens || 0;
                          const cached = cacheRead + cacheWrite;
                          // @ts-ignore
                          const totalIn = getTotalInputTokens(msg.usage);
                          let inLabel = "in";
                          if (cached) {
                            const parts = [];
                            // @ts-ignore
                            // @ts-ignore
                            if (msg.usage.inputTokens) parts.push(`${msg.usage.inputTokens.toLocaleString()} new`);
                            if (cacheRead) parts.push(`${cacheRead.toLocaleString()} read`);
                            if (cacheWrite) parts.push(`${cacheWrite.toLocaleString()} write`);
                            inLabel = `in (${parts.join(" · ")})`;
                          }
                          // @ts-ignore
                          const reasoning = msg.usage.reasoningOutputTokens || 0;
                          let outLabel = "out";
                          if (reasoning > 0) {
                            outLabel = `out (${reasoning.toLocaleString()} reasoning)`;
                          }
                          return (
                            <>
                              <TokenCountBadgeComponent value={totalIn} label={inLabel} mini />
                              {/* @ts-ignore */}
                              <TokenCountBadgeComponent value={msg.usage.outputTokens} label={outLabel} mini />
                            </>
                          );
                        }
                        // @ts-ignore
                        if (msg.usage?.outputTokens != null) {
                          // @ts-ignore
                          return <TokenCountBadgeComponent value={msg.usage.outputTokens} label="tokens" mini />;
                        }
                        return null;
                      })()}
                      {/* @ts-ignore */}
                      {msg.content && (
                        // @ts-ignore
                        <WordBadgeComponent count={msg.content.trim().split(/\s+/).filter(Boolean).length} mini />
                      )}
                      {/* @ts-ignore */}
                      {msg.totalTime != null && (
                        // @ts-ignore
                        // @ts-ignore
                        <StopwatchBadgeComponent seconds={msg.totalTime} className={styles.metaMini} />
                      )}
                      {/* @ts-ignore */}
                      {msg.tokensPerSec && (
                        // @ts-ignore
                        // @ts-ignore
                        <BadgeComponent variant="info" mini tooltip={`${msg.tokensPerSec} tokens per second`}>{msg.tokensPerSec} tok/s</BadgeComponent>
                      )}
                      // @ts-ignore
                      {/* @ts-ignore */}
                      {(msg.provider === "lm-studio" || msg.provider === "vllm")
                        ? <BadgeComponent variant="success" mini tooltip="Free (local model)">$0</BadgeComponent>
                        // @ts-ignore
                        : msg.estimatedCost
                          // @ts-ignore
                          ? <CostBadgeComponent cost={msg.estimatedCost} mini />
                          : null
                      }
                      {/* @ts-ignore */}
                      {msg.timestamp && (
                        // @ts-ignore
                        <DateTimeBadgeComponent date={msg.timestamp} mini />
                      )}
                    </div>
                  )}

                {/* Plan proposal card — fallback for non-segmented messages */}
                // @ts-ignore
                {/* @ts-ignore */}
                {planProposal && msg.role === "assistant" && i === messages.length - 1 &&
                  // @ts-ignore
                  !(msg.contentSegments?.some((s: any) => s.type === "plan")) && (
                  <PlanCardComponent
                    // @ts-ignore
                    planText={planProposal.plan}
                    // @ts-ignore
                    steps={planProposal.steps}
                    // @ts-ignore
                    status={planProposal.status}
                    // @ts-ignore
                    onApprove={onPlanApprove}
                    // @ts-ignore
                    onReject={onPlanReject}
                  />
                )}
              </div>
            </div>
            );
            })()}
          </React.Fragment>
        );
      })}

    </div>
  );
}
