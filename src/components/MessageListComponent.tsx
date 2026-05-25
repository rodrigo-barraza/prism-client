"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
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
  Undo2,
  AlertTriangle,
  User,
  Bot,
  Terminal,
} from "lucide-react";
import ToolCallsBlockComponent from "./ToolCallsBlockComponent";
import MarkdownContent from "./MarkdownContentComponent";
import StreamingCursorComponent from "./StreamingCursorComponent";

import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";

import ProvidersBadgeComponent from "./ProvidersBadgeComponent";
import ModelBadgeComponent from "./ModelBadgeComponent";
import TokenCountBadgeComponent from "./TokenCountBadgeComponent";
import CostBadgeComponent from "./CostBadgeComponent";
import StopwatchBadgeComponent from "./StopwatchBadgeComponent";

import {
  BadgeComponent,
  CopyButtonComponent,
  IconButtonComponent,
  DateTimeBadgeComponent,
} from "@rodrigo-barraza/components-library";
import WordBadgeComponent from "./WordBadgeComponent";
import WorkerNotificationComponent from "./WorkerNotificationComponent";
import PlanCardComponent from "./PlanCardComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";
import styles from "./MessageListComponent.module.css";
import PrismService from "../services/PrismService";
import SoundService from "@/services/SoundService";
import { getTotalInputTokens } from "../utils/utilities";
import { parseMentionTokens } from "../utils/mentionUtils";
import MentionBadge from "./MentionBadgeComponent";
import type { Message, ToolCallEvent, ContentSegment } from "../types/types";

export interface WorkerToolActivityItem {
  toolNames?: Record<string, number>;
  currentTool?: string | null;
  description?: string;
  tokPerSec?: number | null;
  phase?: string;
  phaseLabel?: string;
  phaseProgress?: number | null;
  toolCount?: number;
  iteration?: number;
  maxIterations?: number;
}

/* -- Task notification detection (Claude Code pattern) -------
 * Worker results arrive as user-role messages containing
 * <task-notification> XML. Detect by content so it works for
 * both live messages and already-persisted history.            */

function parseTaskNotification(content: string | undefined | null) {
  if (!content || !content.includes("<task-notification>")) return null;
  const tag = (name: string) => {
    const regex = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
    const m = content.match(regex);
    return m ? m[1].trim() : null;
  };
  return {
    taskId: tag("task-id"),
    status: tag("status"),
    summary: tag("summary"),
    result: tag("result"),
    toolUses: tag("tool_uses") ? parseInt(tag("tool_uses") || "0", 10) : 0,
    durationMs: tag("duration_ms"),
  };
}

/**
 * Splits a raw message content string into a system context prefix (if any) and the clean user message.
 */
function splitRawContent(raw: string | undefined | null): { prefix: string; rest: string } {
  if (!raw) return { prefix: "", rest: "" };
  if (raw.startsWith("[System Context]")) {
    const splitIdx = raw.indexOf("\n\n[User Message]\n");
    if (splitIdx !== -1) {
      const length = splitIdx + "\n\n[User Message]\n".length;
      return { prefix: raw.substring(0, length), rest: raw.substring(length) };
    }
    const altSplit = raw.indexOf("[User Message]\n");
    if (altSplit !== -1) {
      const length = altSplit + "[User Message]\n".length;
      return { prefix: raw.substring(0, length), rest: raw.substring(length) };
    }
  } else if (raw.startsWith("[System Context - Local Time:")) {
    const index = raw.indexOf("]\n\n");
    if (index !== -1) {
      const length = index + 3;
      return { prefix: raw.substring(0, length), rest: raw.substring(length) };
    }
  }
  return { prefix: "", rest: raw };
}

/* -- Render @path mentions as inline badges -------------------
 * When a user sends a message with file/dir mentions, the
 * contentEditable serializer stores them as `@path/to/file`
 * strings. This function parses them back into styled badges
 * for display in the message list.                             */

function renderContentWithMentions(
  text: string | undefined | null,
  knownPaths: Set<string> | null | undefined,
  onMentionFileOpen: ((path: string) => void) | undefined,
) {
  const segments = parseMentionTokens(text || "");
  // Fast path: no mentions found, return plain string
  if (segments.length === 1 && segments[0].type === "text") return text || "";

  return segments.map((seg, i) => {
    if (seg.type === "text") return seg.value;
    // Strip the #Lstart-Lend suffix from the value to get a clean path
    const cleanPath = seg.value.replace(/#L\d+(-L\d+)?$/, "");
    return (
      <MentionBadge
        key={i}
        path={cleanPath}
        lineStart={(seg as any).lineStart}
        lineEnd={(seg as any).lineEnd}
        knownPaths={knownPaths}
        onFileOpen={onMentionFileOpen}
      />
    );
  });
}

function getMimeCategory(ref: string | undefined | null) {
  if (!ref) return "file";
  if (ref.startsWith("minio://")) {
    const ext = ref.split(".").pop()?.toLowerCase();
    if (ext && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
      return "image";
    if (ext && ["wav", "mp3", "webm", "ogg"].includes(ext)) return "audio";
    if (ext && ["mp4", "mov", "avi"].includes(ext)) return "video";
    if (ext === "pdf") return "pdf";
    if (ext === "txt") return "text";
    return "file";
  }
  // Handle HTTP/HTTPS URLs (e.g. Discord CDN images)
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    try {
      const pathname = new URL(ref).pathname;
      const ext = pathname.split(".").pop()?.toLowerCase();
      if (ext && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
        return "image";
      if (ext && ["wav", "mp3", "webm", "ogg"].includes(ext)) return "audio";
      if (ext && ["mp4", "mov", "avi"].includes(ext)) return "video";
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

interface ThinkingBlockProps {
  thinking?: string;
  isStreaming?: boolean;
  children?: React.ReactNode;
}

function ThinkingBlock({ thinking, isStreaming, children }: ThinkingBlockProps) {
  // User can manually toggle after streaming has finished
  const [manualOpen, setManualOpen] = useState(false);
  // User can temporarily close during streaming
  const [streamClosed, setStreamClosed] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Derive collapsed state:
  // - Streaming: expanded unless user explicitly closed it
  // - Not streaming: collapsed unless user explicitly opened it
  const collapsed = isStreaming ? streamClosed : !manualOpen;

  // Auto-scroll to bottom of thinking content while streaming (smooth)
  useEffect(() => {
    if (isStreaming && !streamClosed && contentRef.current) {
      const element = contentRef.current;
      requestAnimationFrame(() => {
        if (element) {
          element.scrollTo({
            top: element.scrollHeight,
            behavior: "smooth",
          });
        }
      });
    }
  }, [thinking, isStreaming, streamClosed]);

  const handleToggle = () => {
    if (isStreaming) {
      setStreamClosed((v) => !v);
    } else {
      setManualOpen((v) => !v);
    }
  };

  if (!thinking && !children) return null;

  return (
    <div
      className={`${styles.thinkingBlock}${isStreaming ? ` ${styles.thinkingStreaming}` : ""}`}
    >
      <button className={styles.thinkingToggle} onClick={handleToggle}>
        <Brain size={14} />
        <span>Thoughts</span>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed && (
        <div className={styles.thinkingContent} ref={contentRef}>
          {thinking && <MarkdownContent content={thinking} />}
          {children}
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
 * Use this in both /chat and /admin/chat for consistency.
 */
export function prepareDisplayMessages(rawMessages: Message[] | undefined | null): Message[] {
  if (!rawMessages || rawMessages.length === 0) return [];

  console.debug(
    `[prepareDisplayMessages] input: ${rawMessages.length} messages`,
    rawMessages.map((m, i) => `  [${i}] role=${m.role} content=${(m.content || '').length}ch toolCalls=${m.toolCalls?.length || 0} images=${m.images?.length || 0} audio=${!!m.audio} error=${!!m.error}`).join('\n'),
  );

  // First pass: collect tool results keyed by tool_call_id
  // Support both snake_case (API) and camelCase (normalized) property names
  const toolResults: Record<string, string> = {};
  for (const m of rawMessages) {
    if (m.role === "tool") {
      const id = m.tool_call_id || m.toolCallId;
      if (id) toolResults[id] = m.content || "";
    }
  }

  // Second pass: filter and enrich
  const filtered = rawMessages
    .filter(
      (m, i) => {
        // Filter out tool role messages (they're merged into toolCalls)
        if (m.role === "tool") return false;
        // Filter out system messages
        if (m.role === "system") return false;
        // Filter out empty assistant messages with no useful content
        const isEmptyAssistant =
          m.role === "assistant" &&
          !m.content?.trim() &&
          !m.toolCalls?.length &&
          !m.images?.length &&
          !m.audio &&
          !m.error;
        if (isEmptyAssistant) {
          console.debug(
            `[prepareDisplayMessages] ⚠️ FILTERING OUT empty assistant msg [${i}]:`,
            `content="${(m.content || '').slice(0, 50)}" toolCalls=${m.toolCalls?.length || 0}`,
            `images=${m.images?.length || 0} audio=${!!m.audio} error=${!!m.error}`,
          );
        }
        return !isEmptyAssistant;
      },
    )
    .map((m) => {
      // Merge tool results into toolCalls
      if (m.toolCalls && m.toolCalls.length > 0 && Object.keys(toolResults).length > 0) {
        const enrichedCalls = m.toolCalls.map((tc) => ({
          ...tc,
          result:
            tc.result ||
            toolResults[tc.id] ||
            toolResults[(tc as any).tool_call_id || ""] ||
            null,
        }));
        return { ...m, toolCalls: enrichedCalls };
      }
      return m;
    });

  console.debug(
    `[prepareDisplayMessages] output: ${filtered.length} messages (filtered ${rawMessages.length - filtered.length})`,
    filtered.length === 0 && rawMessages.length > 0
      ? '⚠️ ALL MESSAGES FILTERED — this will empty the chat!'
      : '',
  );

  return filtered;
}

interface MediaPreviewProps {
  dataUrl: string;
  onClick?: () => void;
}

function MediaPreview({ dataUrl: rawUrl, onClick }: MediaPreviewProps) {
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

interface EditableMessageProps {
  content: string;
  index: number;
  role: Message["role"];
  onEdit: (index: number, content: string) => void;
  editing: boolean;
  onCancelEdit: () => void;
  knownPaths?: Set<string> | null;
  onMentionFileOpen?: (path: string) => void;
  showRaw?: boolean;
}

function EditableMessage({
  content,
  index,
  role,
  onEdit,
  editing,
  onCancelEdit,
  knownPaths,
  onMentionFileOpen,
  showRaw = false,
}: EditableMessageProps) {
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isAssistant = role === "assistant";

  // Auto-resize textarea to fit content on open
  useEffect(() => {
    if (editing && textareaRef.current) {
      const element = textareaRef.current;
      element.style.height = "auto";
      element.style.height =
        Math.min(element.scrollHeight, 600) + "px";
    }
  }, [editing]);

  const cancel = () => {
    onCancelEdit();
    setEditValue(content);
  };
  const save = () => {
    if (editValue.trim() && editValue !== content) onEdit(index, editValue);
    onCancelEdit();
  };
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") cancel();
    // Only user messages submit on plain Enter; assistant messages
    // always use Shift+Enter or the Save button (since content is long)
    else if (e.key === "Enter" && !e.shiftKey && !isAssistant) {
      e.preventDefault();
      save();
    }
  };

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
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setEditValue(e.target.value);
            // Auto-resize as content changes
            const element = e.target;
            element.style.height = "auto";
            element.style.height = Math.min(element.scrollHeight, 600) + "px";
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
            background: "var(--bg-surface)",
            border: "1px solid var(--accent-primary)",
            borderRadius: 8,
            resize: "vertical",
            fontFamily: isAssistant ? "var(--font-mono, monospace)" : "inherit",
            boxShadow: "0 0 0 2px var(--accent-primary-glow)",
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
              background: "var(--accent-primary)",
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
              background: "var(--bg-elevated)",
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
    if (showRaw) {
      const { prefix, rest } = splitRawContent(content);
      if (prefix) {
        return (
          <div className={styles.text}>
            <div className={styles.rawPrefix}>{prefix}</div>
            {renderContentWithMentions(rest, knownPaths, onMentionFileOpen)}
          </div>
        );
      }
    }
    return (
      <div className={styles.text}>
        {renderContentWithMentions(content, knownPaths, onMentionFileOpen)}
      </div>
    );
  }
  return null; // Assistant non-editing rendering is handled by the caller
}

/* -- Main export ----------------------------------------------- */

export interface MessageListProps {
  messages?: Message[];
  readOnly?: boolean;
  isGenerating?: boolean;
  streamingOutputs?: Map<string, string> | null;
  workerToolActivity?: Record<string, WorkerToolActivityItem> | null;
  headerContent?: React.ReactNode;
  systemPrompt?: string | null;
  onSystemPromptEdit?: (val: string) => void;
  planProposal?: { plan: string; steps?: string[]; status?: string } | null;
  onPlanApprove?: () => void;
  onPlanReject?: () => void;
  knownPaths?: string[];
  showRaw?: boolean;

  onDelete?: (index: number) => void;
  onRestore?: (index: number) => void;
  onEdit?: (index: number, content: string) => void;
  onRerun?: (index: number) => void;
  onImageClick?: (url: string) => void;
  onDocClick?: (url: string) => void;
  onMentionFileOpen?: (path: string) => void;
}

/**
 * Shared message list component.
 */
export default function MessageList({
  messages = [],
  readOnly = false,
  isGenerating = false,
  streamingOutputs,
  workerToolActivity,
  headerContent,
  systemPrompt,
  onSystemPromptEdit,
  planProposal,
  onPlanApprove,
  onPlanReject,
  knownPaths,
  showRaw = false,

  onDelete,
  onRestore,
  onEdit,
  onRerun,
  onImageClick,
  onDocClick,
  onMentionFileOpen,
}: MessageListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localLightboxSrc, setLocalLightboxSrc] = useState<string | null>(null);
  const knownPathsSet = useMemo(() => knownPaths ? new Set(knownPaths) : null, [knownPaths]);
  const [expandedDeletedSet, setExpandedDeletedSet] = useState<Set<number>>(new Set());
  const hasSystemPrompt = !!(systemPrompt && systemPrompt.trim());

  const handleImageClick = (url: string) => {
    if (onImageClick) {
      onImageClick(url);
    } else {
      setLocalLightboxSrc(url);
    }
  };

  const cleanMessageContent = (content: string | undefined | null): string => {
    if (!content) return "";
    if (content.startsWith("[System Context]")) {
      const splitIdx = content.indexOf("\n\n[User Message]\n");
      if (splitIdx !== -1) {
        return content.substring(splitIdx + "\n\n[User Message]\n".length);
      }
      const altSplit = content.indexOf("[User Message]\n");
      if (altSplit !== -1) {
        return content.substring(altSplit + "[User Message]\n".length);
      }
    } else if (content.startsWith("[System Context - Local Time:")) {
      const index = content.indexOf("]\n\n");
      if (index !== -1) {
        return content.slice(index + 3);
      }
    }
    return content;
  };

  const getCleanAndRaw = (content: string, rawContent?: string) => {
    let cleanVal = content || "";
    let rawVal = rawContent || content || "";

    const contentIsDirty = cleanVal.startsWith("[System Context]") || cleanVal.startsWith("[System Context - Local Time:");
    const rawIsDirty = rawVal.startsWith("[System Context]") || rawVal.startsWith("[System Context - Local Time:");

    if (contentIsDirty && !rawIsDirty) {
      cleanVal = rawVal;
      rawVal = content;
    } else if (!contentIsDirty && rawIsDirty) {
      cleanVal = content;
      rawVal = rawVal;
    } else if (contentIsDirty && rawIsDirty) {
      // Both are dirty, clean one for cleanVal
      cleanVal = cleanMessageContent(content);
    } else {
      // Neither is dirty
      cleanVal = content;
      rawVal = rawContent || content;
    }

    return { clean: cleanVal, raw: rawVal };
  };

  const hasSystemContextMessage = useMemo(() => {
    return messages.some(
      (m) =>
        m.role === "user" &&
        (m.content?.startsWith("[System Context]") ||
          m.rawContent?.startsWith("[System Context]") ||
          m.content?.startsWith("[System Context - Local Time:") ||
          m.rawContent?.startsWith("[System Context - Local Time:"))
    );
  }, [messages]);

  const displayMessages = useMemo(() => {
    return messages.map((m) => {
      if (m.role === "user") {
        const { clean, raw } = getCleanAndRaw(m.content || "", m.rawContent);
        return {
          ...m,
          content: showRaw ? raw : clean,
        };
      }
      return m;
    });
  }, [messages, showRaw]);

  // -- Sticky last user message (pinned header) -------------
  const [isUserMsgScrolledPast, setIsUserMsgScrolledPast] = useState(false);
  const lastUserMsgRef = useRef<HTMLDivElement | null>(null);
  const lastUserMsgIndexRef = useRef<number>(-1);
  const scrollingToUserMsgRef = useRef<boolean>(false);

  // Find the last user message
  const lastUserMsgIndex = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (
        displayMessages[i].role === "user" &&
        !displayMessages[i].deleted &&
        !parseTaskNotification(displayMessages[i].content)
      )
        return i;
    }
    return -1;
  }, [displayMessages]);

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
      ([entry]: IntersectionObserverEntry[]) => {
        // Suppress during programmatic scroll-to to prevent stutter
        if (scrollingToUserMsgRef.current) return;
        // Show sticky when user message is NOT intersecting
        // AND the element is above the viewport (scrolled past)
        const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
        const scrolledPast =
          !entry.isIntersecting &&
          entry.boundingClientRect.bottom < rootTop + 20;
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
  const stickyUserMsg = useMemo(() => {
    if (!isUserMsgScrolledPast || lastUserMsgIndex < 0) return null;
    const message = displayMessages[lastUserMsgIndex];
    if (!message) return null;
    return {
      content: message.content,
      images: message.images,
      index: lastUserMsgIndex,
    };
  }, [isUserMsgScrolledPast, lastUserMsgIndex, displayMessages]);

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

  const toggleDeletedExpanded = (index: number) => {
    setExpandedDeletedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const swapBefore = useMemo(() => {
    const array = new Array(displayMessages.length).fill(false);
    let lastModel = null;
    let prospectiveSwapIndex = null;

    for (let i = 0; i < displayMessages.length; i++) {
      const message = displayMessages[i];
      if (message.role === "user") {
        if (prospectiveSwapIndex === null) {
          prospectiveSwapIndex = i; // The start of the user's turn
        }
      } else if (message.role === "assistant" && message.model) {
        if (lastModel && lastModel !== message.model) {
          // Model changed! Show swap before the user's turn that led to this,
          // or before this assistant message if no user message preceded it.
          const swapIdx =
            prospectiveSwapIndex !== null ? prospectiveSwapIndex : i;
          array[swapIdx] = true;
        }
        lastModel = message.model;
        prospectiveSwapIndex = null;
      }
    }
    return array;
  }, [displayMessages]);

  // -- Coalesce consecutive deleted messages into groups ------
  // Each group is keyed by the index of the first deleted message
  // in the run (the "leader"). Non-leader deleted messages are
  // skipped during rendering.
  const deletedGroups = useMemo(() => {
    const map = new Map(); // index → { isLeader, groupIndices }
    let i = 0;
    while (i < displayMessages.length) {
      if (displayMessages[i].deleted) {
        const start = i;
        const indices = [];
        while (i < displayMessages.length && displayMessages[i].deleted) {
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
  }, [displayMessages]);

  // -- Coalesce consecutive assistant messages into groups ----
  // Each group shares a single avatar + header. Only the first
  // message in a run of assistant messages shows the avatar.
  // "isContinuation" means this assistant msg continues the
  // previous assistant msg's visual container.
  // "isLastInGroup" means metadata (tokens, cost) should render.
  const coalesceMeta = useMemo(() => {
    const meta = new Array(displayMessages.length).fill(null);
    for (let i = 0; i < displayMessages.length; i++) {
      if (displayMessages[i].role !== "assistant") continue;
      // Deleted messages always break the coalesce chain —
      // they render as their own standalone block.
      if (displayMessages[i].deleted) {
        meta[i] = { isContinuation: false, isLastInGroup: true };
        continue;
      }
      const prevIsAssistant =
        i > 0 &&
        displayMessages[i - 1].role === "assistant" &&
        !displayMessages[i - 1].deleted;
      const nextIsAssistant =
        i < displayMessages.length - 1 &&
        displayMessages[i + 1].role === "assistant" &&
        !displayMessages[i + 1].deleted;
      meta[i] = {
        isContinuation: prevIsAssistant && !swapBefore[i],
        isLastInGroup:
          !nextIsAssistant || (i < displayMessages.length - 1 && swapBefore[i + 1]),
      };
    }
    return meta;
  }, [displayMessages, swapBefore]);

  return (
    <div className={styles.messagesList}>

      {/* -- Sticky pinned user message -- */}
      <div
        className={styles.stickyUserMsg}
        onMouseEnter={(e: React.MouseEvent) =>
          stickyUserMsg && SoundService.playHoverButton({ event: e.nativeEvent })
        }
        onClick={(e: React.MouseEvent) => {
          if (stickyUserMsg) {
            SoundService.playClickButton({ event: e.nativeEvent });
            handleStickyClick();
          }
        }}
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
                {stickyUserMsg.images.length} attachment
                {stickyUserMsg.images.length > 1 ? "s" : ""}
              </span>
            )}
            <span className={styles.stickyUserMsgText}>
              {stickyUserMsg?.content
                ? renderContentWithMentions(
                    stickyUserMsg.content.length > 200
                      ? stickyUserMsg.content.slice(0, 200) + "…"
                      : stickyUserMsg.content,
                    knownPathsSet,
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
              {!readOnly && onSystemPromptEdit && (
                <div className={styles.messageActions}>
                  <IconButtonComponent
                    icon={<Pencil size={14} />}
                    onClick={onSystemPromptEdit}
                    tooltip="Edit system prompt"
                    className={styles.actionBtn}
                  />
                </div>
              )}
            </div>
            <MarkdownContent content={systemPrompt} />
          </div>
        </div>
      )}
      {headerContent}
      {displayMessages.map((message, i) => {
        const roleClass =
          message.role === "user"
            ? styles.userNode
            : message.role === "system"
              ? styles.systemNode
              : styles.aiNode;
        const isStreaming =
          (isGenerating &&
            message.role === "assistant" &&
            i === displayMessages.length - 1) ||
          (message.role === "assistant" && message._liveStreaming === true);
        const coalesce = coalesceMeta[i];

        const showModelChange = swapBefore[i];
        const isFadedSwap =
          showModelChange &&
          i > 0 &&
          displayMessages[i - 1].deleted &&
          displayMessages[i].deleted;
        const swapDividerClass =
          `${styles.modelChangeDivider} ${isFadedSwap ? styles.modelChangeDividerFaded : ""}`.trim();

        // If message is a non-leader deleted message, skip rendering the whole
        // top-level block so we don't leak the model swap outside the group
        const deletedGroupInfo = message.deleted ? deletedGroups.get(i) : null;
        if (message.deleted && !deletedGroupInfo?.isLeader) {
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
            {message.deleted &&
              (() => {
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
                            <BadgeComponent
                              variant="info"
                              mini
                              tooltip="Message role"
                            >
                              {message.role === "user" ? "User" : "Model"}
                            </BadgeComponent>
                            {message.model && (
                              <ModelBadgeComponent
                                models={[message.model]}
                                mini
                              />
                            )}
                            {message.timestamp && (
                              <DateTimeBadgeComponent
                                date={message.timestamp}
                                mini
                              />
                            )}
                            {message.content && (
                              <span className={styles.deletedPreview}>
                                {message.content.length > 80
                                  ? message.content.slice(0, 80) + "…"
                                  : message.content}
                              </span>
                            )}
                          </>
                        )}
                        {groupCount > 1 && (
                          <>
                            <DateTimeBadgeComponent
                              date={displayMessages[groupIndices[0]].timestamp}
                              mini
                            />
                            <span style={{ opacity: 0.5 }}>—</span>
                            <DateTimeBadgeComponent
                              date={
                                displayMessages[groupIndices[groupCount - 1]].timestamp
                              }
                              mini
                            />
                          </>
                        )}
                      </button>
                      {groupCount === 1 && !readOnly && onRestore && (
                        <div className={styles.deletedActions}>
                          <IconButtonComponent
                            icon={<Undo2 size={14} />}
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
                    {groupIndices.map((gi: number) => {
                      const gMsg = displayMessages[gi];
                      const gRoleClass =
                        gMsg.role === "user"
                          ? styles.userNode
                          : gMsg.role === "system"
                            ? styles.systemNode
                            : styles.aiNode;

                      const gShowModelChange = swapBefore[gi];
                      const gIsFadedSwap =
                        gShowModelChange &&
                        gi > 0 &&
                        displayMessages[gi - 1].deleted &&
                        displayMessages[gi].deleted;
                      const gSwapDividerClass =
                        `${styles.modelChangeDivider} ${gIsFadedSwap ? styles.modelChangeDividerFaded : ""}`.trim();
                      const shouldRenderInnerSwap =
                        gShowModelChange && gi !== groupIndices[0];

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
                              <BadgeComponent
                                variant="info"
                                mini
                                tooltip="Message role"
                              >
                                {gMsg.role === "user" ? "User" : "Model"}
                              </BadgeComponent>
                              {gMsg.model && (
                                <ModelBadgeComponent
                                  models={[gMsg.model]}
                                  mini
                                />
                              )}
                              {gMsg.timestamp && (
                                <DateTimeBadgeComponent
                                  date={gMsg.timestamp}
                                  mini
                                />
                              )}
                              <div
                                className={styles.deletedActions}
                                style={{ opacity: 1 }}
                              >
                                {!readOnly && onRestore && (
                                  <IconButtonComponent
                                    icon={<Undo2 size={14} />}
                                    onClick={() => onRestore?.(gi)}
                                    tooltip="Restore message"
                                    className={styles.actionBtn}
                                  />
                                )}
                                {gMsg.content && (
                                  <CopyButtonComponent
                                    text={gMsg.content}
                                    tooltip="Copy raw text"
                                    className={styles.actionBtn}
                                  />
                                )}
                              </div>
                            </div>
                            <div className={styles.deletedMessageBody}>
                              <div
                                className={`${styles.message} ${gRoleClass}`}
                              >
                                <div
                                  className={`${styles.avatar} ${styles.deletedAvatar}`}
                                >
                                  {gMsg.role === "user" ? (
                                    <User size={16} />
                                  ) : gMsg.role === "system" ? (
                                    "S"
                                  ) : (
                                    <Bot size={16} />
                                  )}
                                </div>
                                <div className={styles.content}>
                                  {gMsg.thinking && (
                                    <ThinkingBlock
                                      thinking={gMsg.thinking}
                                      isStreaming={false}
                                    />
                                  )}
                                  {gMsg.toolCalls &&
                                    gMsg.toolCalls.length > 0 && (
                                      <ToolCallsBlockComponent
                                        toolCalls={gMsg.toolCalls}
                                        workerToolActivity={workerToolActivity}
                                      />
                                    )}
                                  {gMsg.images && gMsg.images.length > 0 && (
                                    <div className={styles.imagePreviewRow}>
                                      {gMsg.images.map(
                                        (rawUrl: string, j: number) => {
                                          const resolvedUrl = PrismService.getFileUrl(rawUrl);
                                          const cat = getMimeCategory(rawUrl);
                                          let clickHandler;
                                          if (cat === "image")
                                            clickHandler = () => handleImageClick(resolvedUrl);
                                          else if (cat === "pdf" || cat === "text")
                                            clickHandler = () => onDocClick?.(resolvedUrl);
                                          return (
                                            <MediaPreview
                                              key={j}
                                              dataUrl={rawUrl}
                                              onClick={clickHandler}
                                            />
                                          );
                                        }
                                      )}
                                    </div>
                                  )}
                                  {gMsg.content ? (
                                    <MarkdownContent content={gMsg.content} />
                                  ) : null}
                                  {gMsg.role === "assistant" &&
                                    (gMsg.usage || gMsg.provider) && (
                                      <div className={styles.metaBadges}>
                                        {gMsg.provider && (
                                          <ProvidersBadgeComponent
                                            providers={[gMsg.provider]}
                                          />
                                        )}
                                        {gMsg.model && (
                                          <ModelBadgeComponent
                                            models={[gMsg.model]}
                                          />
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
            {!message.deleted &&
              (() => {
                // -- Task notification card (replaces user bubble for worker results) --
                // Only renders for non-absorbed notifications (i.e. edge cases where
                // the matching team_create tool call isn't in the visible window).
                const taskNotif =
                  message.role === "user"
                    ? parseTaskNotification(message.content)
                    : null;
                if (taskNotif) {
                  return (
                    <WorkerNotificationComponent
                      taskNotif={taskNotif}
                      timestamp={message.timestamp}
                      readOnly={readOnly}
                      onDelete={() => onDelete?.(i)}
                    />
                  );
                }
                // -- Normal message rendering --
                return (
                  <div
                    ref={
                      i === lastUserMsgIndex && message.role === "user"
                        ? lastUserMsgRef
                        : undefined
                    }
                    className={`${styles.message} ${roleClass}${coalesce?.isContinuation ? ` ${styles.continuationMessage}` : ""}`}
                  >
                    {/* Avatar: hidden for continuation messages */}
                    {!coalesce?.isContinuation && (
                      <div
                        className={`${styles.avatar}${message.role === "assistant" && isGenerating && i === messages.length - 1 ? ` ${styles.prismAvatar}` : ""}`}
                      >
                        {message.role === "user" ? (
                          <User size={16} />
                        ) : message.role === "system" ? (
                          "S"
                        ) : (
                          <Bot size={16} />
                        )}
                      </div>
                    )}
                    <div className={styles.content}>
                      {/* Header: hidden for continuation messages */}
                      {!coalesce?.isContinuation && (
                        <div className={styles.messageHeader}>
                          <div className={styles.roleLabel}>
                            {message.role === "user"
                              ? "User"
                              : message.role === "system"
                                ? "System"
                                : "Model"}
                            {message.timestamp && (
                              <DateTimeBadgeComponent
                                date={message.timestamp}
                                mini
                              />
                            )}
                          </div>
                          {!readOnly && (
                            <div className={styles.messageActions}>
                              {message.role === "user" && (
                                <>
                                  <IconButtonComponent
                                    icon={<Pencil size={14} />}
                                    onClick={() =>
                                      setEditingIndex(
                                        editingIndex === i ? null : i,
                                      )
                                    }
                                    disabled={isGenerating}
                                    tooltip="Edit message"
                                    className={styles.actionBtn}
                                  />
                                  <IconButtonComponent
                                    icon={<RotateCcw size={14} />}
                                    onClick={() => onRerun?.(i)}
                                    disabled={isGenerating}
                                    tooltip="Rerun this turn"
                                    className={styles.actionBtn}
                                  />
                                </>
                              )}
                              {message.role === "assistant" &&
                                message.content && (
                                  <IconButtonComponent
                                    icon={<Pencil size={14} />}
                                    onClick={() =>
                                      setEditingIndex(
                                        editingIndex === i ? null : i,
                                      )
                                    }
                                    disabled={isGenerating}
                                    tooltip="Edit response"
                                    className={styles.actionBtn}
                                  />
                                )}
                              {message.content && (
                                <CopyButtonComponent
                                  text={message.content}
                                  tooltip="Copy raw text"
                                  className={styles.actionBtn}
                                />
                              )}
                              <IconButtonComponent
                                icon={<Trash2 size={14} />}
                                onClick={() => onDelete?.(i)}
                                tooltip="Delete message"
                                variant="destructive"
                                className={styles.actionBtn}
                              />
                            </div>
                          )}
                          {readOnly && message.content && (
                            <div className={styles.messageActions}>
                              <CopyButtonComponent
                                text={message.content}
                                tooltip="Copy raw text"
                                className={styles.actionBtn}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* -- Interleaved content: thinking + tool calls + text -- */}
                      {message.contentSegments &&
                      message.contentSegments.length > 0 ? (
                        (() => {
                          const segs = message.contentSegments;
                          const hasThinking = segs.some(
                            (s) => s.type === "thinking",
                          );
                          // Dedup guard: track tool IDs already rendered to prevent
                          // the same tool call from appearing in multiple segments
                          const renderedToolIds = new Set();

                          // Helper: render a segment by type
                          const renderSeg = (
                            seg: ContentSegment,
                            si: number,
                            opts: {
                              isLastText?: boolean;
                              insideThinking?: boolean;
                              suppressCursor?: boolean;
                            } = {},
                          ) => {
                            if (seg.type === "thinking") {
                              const fragment =
                                message.thinkingFragments?.[
                                  seg.fragmentIndex ?? 0
                                ]?.trim();
                              if (!fragment) return null;
                              return (
                                <MarkdownContent
                                  key={`seg-k-${si}`}
                                  content={fragment}
                                />
                              );
                            }
                            if (
                              seg.type === "tools" &&
                              message.toolCalls &&
                              message.toolCalls.length > 0
                            ) {
                              const toolIdSet = new Set(seg.toolIds || []);
                              const segmentTools = message.toolCalls.filter(
                                (tc: ToolCallEvent) => {
                                  if (!toolIdSet.has(tc.id)) return false;
                                  if (renderedToolIds.has(tc.id)) return false;
                                  renderedToolIds.add(tc.id);
                                  return true;
                                },
                              );
                              if (segmentTools.length === 0) return null;
                              return (
                                <ToolCallsBlockComponent
                                  key={`seg-t-${si}`}
                                  toolCalls={segmentTools}
                                  streamingOutputs={streamingOutputs}
                                  workerToolActivity={workerToolActivity}
                                />
                              );
                            }
                            if (seg.type === "text") {
                              const fragmentText =
                                message.textFragments?.[
                                  seg.fragmentIndex ?? 0
                                ]?.trim();
                              const isLastTextSeg = !!opts.isLastText;
                              const showCursor =
                                !opts.insideThinking &&
                                !opts.suppressCursor;
                              if (fragmentText) {
                                return (
                                  <MarkdownContent
                                    key={`seg-x-${si}`}
                                    content={fragmentText}
                                    className={
                                      isStreaming && isLastTextSeg && showCursor
                                        ? styles.streamingText
                                        : ""
                                    }
                                  >
                                    {isLastTextSeg && showCursor && (
                                      <StreamingCursorComponent
                                        active={isStreaming}
                                      />
                                    )}
                                  </MarkdownContent>
                                );
                              }
                              if (isStreaming && isLastTextSeg && showCursor) {
                                return (
                                  <StreamingCursorComponent
                                    key={`seg-x-${si}`}
                                    active
                                    standalone
                                  />
                                );
                              }
                              return null;
                            }
                            if (seg.type === "plan" && planProposal) {
                              return (
                                <PlanCardComponent
                                  key={`seg-p-${si}`}
                                  planText={planProposal.plan}
                                  steps={planProposal.steps}
                                  status={planProposal.status as any}
                                  onApprove={onPlanApprove}
                                  onReject={onPlanReject}
                                />
                              );
                            }
                            return null;
                          };

                          // Edit mode: show reasoning then editable text
                          if (
                            message.role === "assistant" &&
                            !readOnly &&
                            editingIndex === i
                          ) {
                            const thinkingOnly = segs.filter(
                              (s) => s.type === "thinking",
                            );
                            const nonThinking = segs.filter(
                              (s) => s.type !== "thinking",
                            );
                            return (
                              <>
                                {hasThinking && thinkingOnly.length > 0 && (
                                  <ThinkingBlock isStreaming={false}>
                                    {thinkingOnly.map((seg, si) =>
                                      renderSeg(seg, si, {
                                        insideThinking: true,
                                      }),
                                    )}
                                  </ThinkingBlock>
                                )}
                                {nonThinking.map((seg, si) =>
                                  renderSeg(seg, si),
                                )}
                                <EditableMessage
                                  key="seg-edit"
                                  content={message.content}
                                  index={i}
                                  role="assistant"
                                  onEdit={onEdit as any}
                                  editing={true}
                                  onCancelEdit={() => setEditingIndex(null)}
                                  knownPaths={knownPathsSet}
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
                            const thinkingOnly = segs.filter(
                              (s) => s.type === "thinking",
                            );
                            const visibleSegs = segs
                              .map((s, index) => ({
                                seg: s,
                                origIdx: index,
                              }))
                              .filter(
                                ({ seg }: { seg: ContentSegment }) => seg.type !== "thinking",
                              );
                            // ThinkingBlock is streaming when thinking is the current
                            // activity (last segment is thinking)
                            const lastSeg = segs[segs.length - 1];
                            const thinkingIsStreaming =
                              isStreaming && lastSeg?.type === "thinking";

                            // Find the last text segment among visible segs for cursor
                            const lastVisibleTextIdx = (() => {
                              for (
                                let k = visibleSegs.length - 1;
                                k >= 0;
                                k--
                              ) {
                                if (visibleSegs[k].seg.type === "text")
                                  return k;
                              }
                              return -1;
                            })();

                            return (
                              <>
                                {thinkingOnly.length > 0 && (
                                  <ThinkingBlock
                                    isStreaming={thinkingIsStreaming}
                                  >
                                    {thinkingOnly.map((seg, si) =>
                                      renderSeg(seg, si, {
                                        insideThinking: true,
                                      }),
                                    )}
                                  </ThinkingBlock>
                                )}
                                {/* Tools and text segments render outside in original order */}
                                {visibleSegs.map(
                                  ({ seg, origIdx }: { seg: ContentSegment; origIdx: number }, vi: number) => {
                                    const isLastText =
                                      vi === lastVisibleTextIdx;
                                    return (
                                      <React.Fragment key={`vis-${vi}`}>
                                        {renderSeg(seg, origIdx, {
                                          isLastText,
                                        })}
                                      </React.Fragment>
                                    );
                                  },
                                )}
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
                          return segs.map((seg, si) =>
                            renderSeg(seg, si, {
                              isLastText: si === lastTextIdx,
                            }),
                          );
                        })()
                      ) : (
                        <>
                          {/* Thinking block (persisted conversations without segments) */}
                          {message.thinking && (
                            <ThinkingBlock
                              thinking={message.thinking}
                              isStreaming={
                                isStreaming &&
                                !!message.thinking &&
                                !message.content
                              }
                            />
                          )}

                          {/* Tool calls (persisted conversations without segments) */}
                          {message.toolCalls &&
                            message.toolCalls.length > 0 && (
                              <ToolCallsBlockComponent
                                toolCalls={message.toolCalls}
                                streamingOutputs={streamingOutputs}
                                workerToolActivity={workerToolActivity}
                              />
                            )}

                          {/* Text content */}
                          {message.role === "user" && !readOnly ? (
                            <EditableMessage
                              content={message.content}
                              index={i}
                              role="user"
                              onEdit={onEdit as any}
                              editing={editingIndex === i}
                              onCancelEdit={() => setEditingIndex(null)}
                              knownPaths={knownPathsSet}
                              onMentionFileOpen={onMentionFileOpen}
                              showRaw={showRaw}
                            />
                          ) : message.role === "assistant" &&
                            !readOnly &&
                            editingIndex === i ? (
                            <EditableMessage
                              content={message.content}
                              index={i}
                              role="assistant"
                              onEdit={onEdit as any}
                              editing={true}
                              onCancelEdit={() => setEditingIndex(null)}
                              knownPaths={knownPathsSet}
                              onMentionFileOpen={onMentionFileOpen}
                            />
                          ) : message.role === "user" && showRaw ? (
                            (() => {
                              const { prefix, rest } = splitRawContent(message.content);
                              if (prefix) {
                                return (
                                  <div className={styles.text}>
                                    <div className={styles.rawPrefix}>{prefix}</div>
                                    <MarkdownContent
                                      content={rest}
                                      className={
                                        isStreaming ? styles.streamingText : ""
                                      }
                                    >
                                      <StreamingCursorComponent active={isStreaming} />
                                    </MarkdownContent>
                                  </div>
                                );
                              }
                              return (
                                <MarkdownContent
                                  content={message.content}
                                  className={
                                    isStreaming ? styles.streamingText : ""
                                  }
                                >
                                  <StreamingCursorComponent active={isStreaming} />
                                </MarkdownContent>
                              );
                            })()
                          ) : message.content ? (
                            <MarkdownContent
                              content={message.content}
                              className={
                                isStreaming ? styles.streamingText : ""
                              }
                            >
                              <StreamingCursorComponent active={isStreaming} />
                            </MarkdownContent>
                          ) : isStreaming ? (
                            <StreamingCursorComponent active standalone />
                          ) : null}
                        </>
                      )}

                      {/* Images / media */}
                      {message.images && message.images.length > 0 && (
                        <div className={styles.imagePreviewRow}>
                          {message.images.map((rawUrl, j) => {
                            const resolvedUrl = PrismService.getFileUrl(rawUrl);
                            const cat = getMimeCategory(rawUrl);
                            let clickHandler;
                            if (cat === "image")
                              clickHandler = () => handleImageClick(resolvedUrl);
                            else if (cat === "pdf" || cat === "text")
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
                        message.role === "assistant" &&
                        message._liveStreaming &&
                        !message.audio && (
                          <div className={styles.audioCard}>
                            <AudioPlayerRecorderComponent streaming compact />
                          </div>
                        )}

                      {/* Audio */}
                      {message.audio && (
                        <div className={styles.imagePreviewRow}>
                          {(Array.isArray(message.audio)
                            ? message.audio
                            : [message.audio]
                          ).map((rawUrl, j) => (
                            <MediaPreview key={`aud-${j}`} dataUrl={rawUrl} />
                          ))}
                        </div>
                      )}

                      {/* Video */}
                      {message.video &&
                        (Array.isArray(message.video)
                          ? message.video
                          : [message.video]
                        ).length > 0 && (
                          <div className={styles.imagePreviewRow}>
                            {(Array.isArray(message.video)
                              ? message.video
                              : [message.video]
                            ).map((rawUrl, j) => (
                              <MediaPreview key={`vid-${j}`} dataUrl={rawUrl} />
                            ))}
                          </div>
                        )}

                      {/* PDF */}
                      {message.pdf &&
                        (Array.isArray(message.pdf)
                          ? message.pdf
                          : [message.pdf]
                        ).length > 0 && (
                          <div className={styles.imagePreviewRow}>
                            {(Array.isArray(message.pdf)
                              ? message.pdf
                              : [message.pdf]
                            ).map((rawUrl, j) => {
                              const resolvedUrl =
                                PrismService.getFileUrl(rawUrl);
                              return (
                                <MediaPreview
                                  key={`pdf-${j}`}
                                  dataUrl={rawUrl}
                                  onClick={() => onDocClick?.(resolvedUrl)}
                                />
                              );
                            })}
                          </div>
                        )}

                      {/* Error block */}
                      {message.error && (
                        <div className={styles.errorBlock}>
                          <AlertTriangle
                            size={14}
                            className={styles.errorIcon}
                          />
                          <span>{message.error}</span>
                        </div>
                      )}

                      {/* User metadata */}
                      {message.role === "user" && message.content && (
                        <div className={styles.metaBadges}>
                          <WordBadgeComponent
                            count={
                              message.content
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length
                            }
                          />
                        </div>
                      )}

                      {/* Assistant metadata — only on the last message in a coalesced group */}
                      {message.role === "assistant" &&
                        coalesce?.isLastInGroup !== false &&
                        (message.usage ||
                          message.audio ||
                          message.provider) && (
                          <div className={styles.metaBadges}>
                            {message.provider && (
                              <ProvidersBadgeComponent
                                providers={[message.provider]}
                              />
                            )}
                            {message.model && (
                              <ModelBadgeComponent
                                models={[message.model]}
                              />
                            )}
                            {message.voice && (
                              <BadgeComponent
                                variant="info"
                                tooltip={`Voice: ${message.voice}`}
                              >
                                🔊 {message.voice}
                              </BadgeComponent>
                            )}
                            {(() => {
                              if (
                                message.usage?.inputTokens != null &&
                                message.usage?.outputTokens != null
                              ) {
                                const cacheRead =
                                  message.usage.cacheReadInputTokens || 0;
                                const cacheWrite =
                                  message.usage.cacheCreationInputTokens || 0;
                                const cached = cacheRead + cacheWrite;
                                const totalIn = getTotalInputTokens(
                                  message.usage,
                                );
                                let inLabel = "in";
                                if (cached) {
                                  const parts = [];
                                  if (message.usage.inputTokens)
                                    parts.push(
                                      `${message.usage.inputTokens.toLocaleString()} new`,
                                    );
                                  if (cacheRead)
                                    parts.push(
                                      `${cacheRead.toLocaleString()} read`,
                                    );
                                  if (cacheWrite)
                                    parts.push(
                                      `${cacheWrite.toLocaleString()} write`,
                                    );
                                  inLabel = `in (${parts.join(" · ")})`;
                                }
                                const reasoning =
                                  (message.usage as any).reasoningOutputTokens || 0;
                                let outLabel = "out";
                                if (reasoning > 0) {
                                  outLabel = `out (${reasoning.toLocaleString()} reasoning)`;
                                }
                                return (
                                  <>
                                    <TokenCountBadgeComponent
                                      value={totalIn}
                                      label={inLabel}
                                    />
                                    <TokenCountBadgeComponent
                                      value={message.usage.outputTokens}
                                      label={outLabel}
                                    />
                                  </>
                                );
                              }
                              if (message.usage?.outputTokens != null) {
                                return (
                                  <TokenCountBadgeComponent
                                    value={message.usage.outputTokens}
                                    label="tokens"
                                  />
                                );
                              }
                              return null;
                            })()}
                            {message.content && (
                              <WordBadgeComponent
                                count={
                                  message.content
                                    .trim()
                                    .split(/\s+/)
                                    .filter(Boolean).length
                                }
                              />
                            )}
                            {message.totalTime != null && (
                              <StopwatchBadgeComponent
                                seconds={message.totalTime}
                              />
                            )}
                            {message.tokensPerSec && (
                              <BadgeComponent
                                variant="info"
                                tooltip={`${message.tokensPerSec} tokens per second`}
                              >
                                {message.tokensPerSec} tok/s
                              </BadgeComponent>
                            )}
                            {message.provider === "lm-studio" ||
                            message.provider === "vllm" ? (
                              <BadgeComponent
                                variant="success"
                                tooltip="Free (local model)"
                              >
                                $0
                              </BadgeComponent>
                            ) : message.estimatedCost ? (
                              <CostBadgeComponent
                                cost={message.estimatedCost}
                              />
                            ) : null}
                            {message.timestamp && (
                              <DateTimeBadgeComponent
                                date={message.timestamp}
                              />
                            )}
                          </div>
                        )}

                      {/* Plan proposal card — fallback for non-segmented messages */}
                      {planProposal &&
                        message.role === "assistant" &&
                        i === messages.length - 1 &&
                        !message.contentSegments?.some(
                          (s) => s.type === "plan",
                        ) && (
                          <PlanCardComponent
                            planText={planProposal.plan}
                            steps={planProposal.steps}
                            status={planProposal.status as any}
                            onApprove={onPlanApprove}
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
      {localLightboxSrc && (
        <ImagePreviewComponent
          src={localLightboxSrc}
          onClose={() => setLocalLightboxSrc(null)}
          readOnly={true}
        />
      )}
    </div>
  );
}
