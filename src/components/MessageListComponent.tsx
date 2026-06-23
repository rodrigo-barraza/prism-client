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
import ToolCallsBlockComponent, { VISUAL_TOOL_NAMES } from "./ToolCallsBlockComponent";
import { ToolResultView } from "./ToolResultRenderersComponent";
import MarkdownContent from "./MarkdownContentComponent";
import StreamingCursorComponent from "./StreamingCursorComponent";

import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";

import BadgeComponent, { type ClientAgent } from "./BadgeComponent";
import { renderAgentIcon } from "./AgentPickerComponent";

import {
  CopyButtonComponent,
  IconButtonComponent,
} from "@rodrigo-barraza/components-library";
import SubAgentNotificationComponent from "./SubAgentNotificationComponent";

import PlanCardComponent from "./PlanCardComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";
import styles from "./MessageListComponent.module.css";
import PrismService from "../services/PrismService";
import SoundService from "@/services/SoundService";
import { getTotalInputTokens } from "../utils/utilities";
import { parseMentionTokens } from "../utils/mentionUtils";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";

import type { Message, ToolCallEvent, ContentSegment } from "../types/types";

export interface SubAgentToolActivityItem {
  toolNames?: string[] | Record<string, number> | Record<string, string>;
  currentTool?: string | null;
  description?: string;
  tokPerSec?: number | null;
  phase?: string | null;
  phaseLabel?: string;
  phaseProgress?: number | null;
  toolCount?: number;
  iteration?: number;
  maxIterations?: number;
  toolCalls?: import("../types/types").ToolCallEvent[];
  conversationId?: string;
}

/* -- Task notification detection (Claude Code pattern) -------
 * Sub-agent results arrive as user-role messages containing
 * <task-notification> XML. Detect by content so it works for
 * both live messages and already-persisted history.            */

function parseTaskNotification(content: string | undefined | null) {
  if (!content || !content.includes("<task-notification>")) return null;
  const tag = (name: string) => {
    const regex = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
    const regexMatch = content.match(regex);
    return regexMatch ? regexMatch[1].trim() : null;
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
function splitRawContent(raw: string | undefined | null): {
  prefix: string;
  rest: string;
} {
  if (!raw) return { prefix: "", rest: "" };
  if (raw.startsWith("[System Context]")) {
    const splitIndex = raw.indexOf("\n\n[User Message]\n");
    if (splitIndex !== -1) {
      const length = splitIndex + "\n\n[User Message]\n".length;
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
      <BadgeComponent
        key={i}
        type="mention"
        path={cleanPath}
        lineStart={seg.lineStart}
        lineEnd={seg.lineEnd}
        knownPaths={knownPaths}
        onFileOpen={onMentionFileOpen}
      />
    );
  });
}

function getMimeCategory(ref: string | undefined | null) {
  if (!ref) return "file";
  let targetUrl = ref;
  if (ref.startsWith("minio://")) {
    targetUrl = PrismService.getFileUrl(ref);
  }
  // Handle HTTP/HTTPS URLs (e.g. MinIO files or Discord CDN images)
  if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
    try {
      const pathname = new URL(targetUrl).pathname;
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
  const match = targetUrl.match(/^data:([\w-]+)\//);
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
  streamKeepVisible?: boolean;
  children?: React.ReactNode;
}

function ThinkingBlock({
  thinking,
  isStreaming,
  streamKeepVisible,
  children,
}: ThinkingBlockProps) {
  // User can manually toggle after streaming has finished
  const [manualOpen, setManualOpen] = useState(false);
  // User can temporarily close during streaming
  const [streamClosed, setStreamClosed] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Derive collapsed state:
  // - Streaming: expanded unless user explicitly closed it
  // - Not streaming: collapsed unless user explicitly opened it
  const collapsed = isStreaming ? streamClosed : !manualOpen;

  // Auto-scroll to bottom of thinking content while streaming (instant snap)
  // Direct scrollTop assignment avoids the race condition where queued smooth
  // scroll animations can never keep up with rapid token emission.
  useEffect(() => {
    if (isStreaming && !streamClosed && contentRef.current) {
      const element = contentRef.current;
      requestAnimationFrame(() => {
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      });
    }
  }, [thinking, isStreaming, streamClosed]);

  const handleToggle = () => {
    if (isStreaming) {
      setStreamClosed((previousClosedState) => !previousClosedState);
    } else {
      setManualOpen((previousOpenState) => !previousOpenState);
    }
  };

  if (!isStreaming && !streamKeepVisible && !thinking?.trim() && !children) return null;

  return (
    <div
      className={`${styles['thinking-block']}${isStreaming ? ` ${styles['thinking-streaming']}` : ""}`}
    >
      <button className={styles['thinking-toggle']} onClick={handleToggle}>
        <Brain size={14} />
        <span>Thoughts</span>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed && (
        <div className={styles['thinking-content']} ref={contentRef}>
          {thinking?.trim() ? (
            <MarkdownContent content={thinking}>
              {isStreaming && (
                <StreamingCursorComponent active={isStreaming} text={thinking} />
              )}
            </MarkdownContent>
          ) : (
            isStreaming && <StreamingCursorComponent active standalone />
          )}
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
export { prepareDisplayMessages } from "../utils/messageHelpers.ts";

interface MediaPreviewProps {
  dataUrl: string;
  onClick?: () => void;
}

function MediaPreview({ dataUrl: rawUrl, onClick }: MediaPreviewProps) {
  const sourceUrl = PrismService.getFileUrl(rawUrl);
  const cat = getMimeCategory(rawUrl);

  if (cat === "image") {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={sourceUrl}
        alt="Attached"
        className={styles['message-image']}
        onClick={onClick}
      />
    );
  }
  if (cat === "audio") {
    return (
      <div className={styles['audio-card']}>
        <AudioPlayerRecorderComponent sourceUrl={sourceUrl} compact />
      </div>
    );
  }
  if (cat === "video") {
    return (
      <div className={styles['video-card']}>
        <video
          controls
          src={sourceUrl}
          preload="metadata"
          className={styles['video-preview']}
        />
      </div>
    );
  }
  if (cat === "pdf") {
    return (
      <div className={styles['pdf-viewer']}>
        <div className={styles['pdf-header']}>
          <FileText size={14} className={styles['pdf-header-icon']} />
          <span className={styles['pdf-header-label']}>PDF Document</span>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles['pdf-open-link']}
          >
            Open ↗
          </a>
        </div>
        <iframe
          src={sourceUrl}
          className={styles['pdf-frame']}
          title="PDF preview"
        />
      </div>
    );
  }
  if (cat === "text") {
    return (
      <div
        className={styles['media-card']}
        onClick={onClick}
        style={onClick ? { cursor: "pointer" } : undefined}
      >
        <FileText size={22} className={styles['media-card-icon']} />
        <span className={styles['media-card-label']}>{cat.toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className={styles['media-card']}>
      <FileText size={22} className={styles['media-card-icon']} />
      <span className={styles['media-card-label']}>{cat.toUpperCase()}</span>
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
      element.style.height = Math.min(element.scrollHeight, 600) + "px";
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
            background: "var(--background-surface)",
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
              background: "var(--background-elevated)",
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
          <div className={styles['text']}>
            <div className={styles['raw-prefix']}>{prefix}</div>
            {renderContentWithMentions(rest, knownPaths, onMentionFileOpen)}
          </div>
        );
      }
    }
    return (
      <div className={styles['text']}>
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
  subAgentToolActivity?: Record<string, SubAgentToolActivityItem> | null;
  headerContent?: React.ReactNode;
  systemPrompt?: string | null;
  onSystemPromptEdit?: (editedPromptValue: string) => void;
  planProposal?: { plan: string; steps?: string[]; status?: "pending" | "approved" | "rejected" | "executing" } | null;
  onPlanApprove?: () => void;
  onPlanReject?: () => void;
  knownPaths?: string[];
  showRaw?: boolean;

  onDelete?: (index: number) => void;
  onRestore?: (index: number) => void;
  onEdit?: (index: number, content: string) => void;
  onRerun?: (index: number) => void;
  activeAgent?: ClientAgent | null;
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
  subAgentToolActivity,
  headerContent,
  systemPrompt,
  onSystemPromptEdit,
  planProposal,
  onPlanApprove,
  onPlanReject,
  knownPaths,
  showRaw = false,

  activeAgent,
  onDelete,
  onRestore,
  onEdit,
  onRerun,
  onImageClick,
  onDocClick,
  onMentionFileOpen,
}: MessageListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localLightboxSourceUrl, setLocalLightboxSourceUrl] = useState<string | null>(null);
  const knownPathsSet = useMemo(
    () => (knownPaths ? new Set(knownPaths) : null),
    [knownPaths],
  );
  const [expandedDeletedSet, setExpandedDeletedSet] = useState<Set<number>>(
    new Set(),
  );
  const hasSystemPrompt = !!(systemPrompt && systemPrompt.trim());

  const containerReference = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const messagesListElement = containerReference.current;
    if (!messagesListElement) return;

    const computeAndApplyContrastColor = () => {
      let currentAncestorElement = messagesListElement.parentElement;
      let backgroundColorValue = "rgba(0, 0, 0, 0)";

      while (currentAncestorElement) {
        const computedStyle = getComputedStyle(currentAncestorElement);
        backgroundColorValue = computedStyle.backgroundColor;

        const redGreenBlueMatch = backgroundColorValue.match(
          /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/,
        );
        if (redGreenBlueMatch) {
          const alphaValue =
            redGreenBlueMatch[4] !== undefined
              ? parseFloat(redGreenBlueMatch[4])
              : 1;
          if (alphaValue > 0) {
            break;
          }
        }
        currentAncestorElement = currentAncestorElement.parentElement;
      }

      const redGreenBlueMatch = backgroundColorValue.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
      );
      if (!redGreenBlueMatch) return;

      const redChannel = parseInt(redGreenBlueMatch[1], 10);
      const greenChannel = parseInt(redGreenBlueMatch[2], 10);
      const blueChannel = parseInt(redGreenBlueMatch[3], 10);

      const toLinearComponent = (channelValue: number): number => {
        const normalizedValue = channelValue / 255;
        return normalizedValue <= 0.03928
          ? normalizedValue / 12.92
          : Math.pow((normalizedValue + 0.055) / 1.055, 2.4);
      };

      const relativeLuminance =
        0.2126 * toLinearComponent(redChannel) +
        0.7152 * toLinearComponent(greenChannel) +
        0.0722 * toLinearComponent(blueChannel);

      const isLightBackground = relativeLuminance > 0.179;

      messagesListElement.style.setProperty(
        "--raw-prefix-contrast-color",
        isLightBackground ? "rgba(0, 0, 0, 0.87)" : "rgba(255, 255, 255, 0.92)",
      );
      messagesListElement.style.setProperty(
        "--raw-prefix-contrast-opacity",
        isLightBackground ? "0.55" : "0.6",
      );
    };

    computeAndApplyContrastColor();

    const listMutationObserver = new MutationObserver(
      computeAndApplyContrastColor,
    );
    listMutationObserver.observe(messagesListElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    let closestAncestorElement = messagesListElement.parentElement;
    while (closestAncestorElement) {
      const computedStyle = getComputedStyle(closestAncestorElement);
      const ancestorBackgroundColorValue = computedStyle.backgroundColor;
      const redGreenBlueMatch = ancestorBackgroundColorValue.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/,
      );
      if (redGreenBlueMatch) {
        const alphaValue =
          redGreenBlueMatch[4] !== undefined
            ? parseFloat(redGreenBlueMatch[4])
            : 1;
        if (alphaValue > 0) {
          break;
        }
      }
      closestAncestorElement = closestAncestorElement.parentElement;
    }

    let ancestorMutationObserver: MutationObserver | null = null;
    if (closestAncestorElement) {
      ancestorMutationObserver = new MutationObserver(
        computeAndApplyContrastColor,
      );
      ancestorMutationObserver.observe(closestAncestorElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }

    const documentMutationObserver = new MutationObserver(
      computeAndApplyContrastColor,
    );
    documentMutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      listMutationObserver.disconnect();
      if (ancestorMutationObserver) {
        ancestorMutationObserver.disconnect();
      }
      documentMutationObserver.disconnect();
    };
  }, []);

  const handleImageClick = (url: string) => {
    if (onImageClick) {
      onImageClick(url);
    } else {
      setLocalLightboxSourceUrl(url);
    }
  };

  const cleanMessageContent = (content: string | undefined | null): string => {
    if (!content) return "";
    if (content.startsWith("[System Context]")) {
      const splitIndex = content.indexOf("\n\n[User Message]\n");
      if (splitIndex !== -1) {
        return content.substring(splitIndex + "\n\n[User Message]\n".length);
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
    let cleanedContentValue = content || "";
    let rawContentValue = rawContent || content || "";

    const contentIsDirty =
      cleanedContentValue.startsWith("[System Context]") ||
      cleanedContentValue.startsWith("[System Context - Local Time:");
    const rawIsDirty =
      rawContentValue.startsWith("[System Context]") ||
      rawContentValue.startsWith("[System Context - Local Time:");

    if (contentIsDirty && !rawIsDirty) {
      cleanedContentValue = rawContentValue;
      rawContentValue = content;
    } else if (!contentIsDirty && rawIsDirty) {
      cleanedContentValue = content;
      rawContentValue = rawContentValue;
    } else if (contentIsDirty && rawIsDirty) {
      // Both are dirty, clean one for cleanedContentValue
      cleanedContentValue = cleanMessageContent(content);
    } else {
      // Neither is dirty
      cleanedContentValue = content;
      rawContentValue = rawContent || content;
    }

    return { clean: cleanedContentValue, raw: rawContentValue };
  };

  const displayMessages = useMemo(() => {
    return messages
      .filter((message) => showRaw || message.role !== "system")
      .map((message) => {
        if (message.role === "user") {
          const { clean, raw } = getCleanAndRaw(message.content || "", message.rawContent);
          return {
            ...message,
            content: showRaw ? raw : clean,
          };
        }
        return message;
      });
  }, [messages, showRaw]);

  // -- Sticky last user message (pinned header) -------------
  const [isUserMessageScrolledPast, setIsUserMessageScrolledPast] = useState(false);
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null);
  const lastUserMessageIndexRef = useRef<number>(-1);
  const scrollingToUserMessageRef = useRef<boolean>(false);

  // Find the last user message
  const lastUserMessageIndex = useMemo(() => {
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
    lastUserMessageIndexRef.current = lastUserMessageIndex;
    const node = lastUserMessageRef.current;
    if (!node || lastUserMessageIndex < 0) {
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
        if (scrollingToUserMessageRef.current) return;
        // Show sticky when user message is NOT intersecting
        // AND the element is above the viewport (scrolled past)
        const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
        const scrolledPast =
          !entry.isIntersecting &&
          entry.boundingClientRect.bottom < rootTop + 20;
        setIsUserMessageScrolledPast(scrolledPast);
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
      setIsUserMessageScrolledPast(false);
    };
  }, [lastUserMessageIndex]);

  // Derive sticky message data from the boolean flag
  const stickyUserMessage = useMemo(() => {
    if (!isUserMessageScrolledPast || lastUserMessageIndex < 0) return null;
    const message = displayMessages[lastUserMessageIndex];
    if (!message) return null;
    return {
      content: message.content,
      images: message.images,
      index: lastUserMessageIndex,
    };
  }, [isUserMessageScrolledPast, lastUserMessageIndex, displayMessages]);

  const handleStickyClick = useCallback(() => {
    const node = lastUserMessageRef.current;
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
    scrollingToUserMessageRef.current = true;

    const nodeRect = node.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const offset = nodeRect.top - parentRect.top + scrollParent.scrollTop - 50;
    scrollParent.scrollTo({ top: offset, behavior: "smooth" });

    // Re-enable observer after scroll completes — it will naturally
    // detect the element is visible and dismiss the sticky header
    setTimeout(() => {
      scrollingToUserMessageRef.current = false;
      // Manually check if element is now visible and dismiss sticky
      const rect = node.getBoundingClientRect();
      const pRect = scrollParent.getBoundingClientRect();
      if (rect.top >= pRect.top) {
        setIsUserMessageScrolledPast(false);
      }
    }, 600);
  }, []);

  const toggleDeletedExpanded = (index: number) => {
    setExpandedDeletedSet((previousExpandedSet) => {
      const next = new Set(previousExpandedSet);
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
          const swapIndex =
            prospectiveSwapIndex !== null ? prospectiveSwapIndex : i;
          array[swapIndex] = true;
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
      const previousIsAssistant =
        i > 0 &&
        displayMessages[i - 1].role === "assistant" &&
        !displayMessages[i - 1].deleted;
      const nextIsAssistant =
        i < displayMessages.length - 1 &&
        displayMessages[i + 1].role === "assistant" &&
        !displayMessages[i + 1].deleted;
      meta[i] = {
        isContinuation: previousIsAssistant && !swapBefore[i],
        isLastInGroup:
          !nextIsAssistant ||
          (i < displayMessages.length - 1 && swapBefore[i + 1]),
      };
    }
    return meta;
  }, [displayMessages, swapBefore]);

  return (
    <div ref={containerReference} className={`message-list-component ${styles['messages-list']}`}>
      {/* -- Sticky pinned user message -- */}
      <div
        className={styles['sticky-user-message']}
        onMouseEnter={(e: React.MouseEvent) =>
          stickyUserMessage &&
          SoundService.playHoverButton({ event: e.nativeEvent })
        }
        onClick={(e: React.MouseEvent) => {
          if (stickyUserMessage) {
            SoundService.playClickButton({ event: e.nativeEvent });
            handleStickyClick();
          }
        }}
        style={{
          visibility: stickyUserMessage ? "visible" : "hidden",
          opacity: stickyUserMessage ? 1 : 0,
          pointerEvents: stickyUserMessage ? "auto" : "none",
          transition: "opacity 0.2s ease, visibility 0.2s ease",
        }}
      >
        <div className={styles['sticky-user-message-inner']}>
          <div className={styles['sticky-user-message-avatar']}>
            <User size={12} />
          </div>
          <div className={styles['sticky-user-message-content']}>
            {stickyUserMessage?.images && stickyUserMessage.images.length > 0 && (
              <span className={styles['sticky-user-message-badge']}>
                {stickyUserMessage.images.length} attachment
                {stickyUserMessage.images.length > 1 ? "s" : ""}
              </span>
            )}
            <span className={styles['sticky-user-message-text']}>
              {stickyUserMessage?.content
                ? renderContentWithMentions(
                    stickyUserMessage.content.length > 200
                      ? stickyUserMessage.content.slice(0, 200) + "…"
                      : stickyUserMessage.content,
                    knownPathsSet,
                    onMentionFileOpen,
                  )
                : "(no text)"}
            </span>
          </div>
          <ChevronDown size={14} className={styles['sticky-user-message-chevron']} />
        </div>
      </div>
      {hasSystemPrompt && (
        <div className={`${styles['message']} ${styles['system-node']}`} data-navigation-target>

          <div className={styles['avatar']}>
            <Terminal size={16} />
          </div>
          <div className={styles['content']}>
            <div className={styles['message-header']}>
              <div className={styles['role-label']}>System Prompt</div>
              <div className={styles['message-actions']}>
                {!readOnly && onSystemPromptEdit && (
                  <IconButtonComponent
                    icon={<Pencil size={14} />}
                    onClick={() => onSystemPromptEdit(systemPrompt || "")}
                    tooltip="Edit system prompt"
                    className={styles['action-button']}
                  />
                )}
                {systemPrompt && (
                  <CopyButtonComponent
                    text={systemPrompt}
                    tooltip="Copy raw text"
                    className={styles['action-button']}
                  />
                )}
              </div>
            </div>
            <MarkdownContent content={systemPrompt} />
            {systemPrompt && (
              <div className={styles['meta-badges']}>
                <BadgeComponent
                  type="words"
                  count={
                    systemPrompt
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean).length
                  }
                />
                <BadgeComponent
                  type="tokens"
                  value={Math.ceil(systemPrompt.length / 4)}
                  label="estimated"
                />
              </div>
            )}
          </div>
        </div>
      )}
      {headerContent}
      {displayMessages.map((message, i) => {
        const roleClass =
          message.role === "user"
            ? styles['user-node']
            : message.role === "system"
              ? styles['system-node']
              : styles['assistant-node'];
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
          `${styles['model-change-divider']} ${isFadedSwap ? styles['model-change-divider-faded'] : ""}`.trim();

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
                <span className={styles['model-change-line']} />
                <span className={styles['model-change-label']}>
                  <RefreshCw size={11} />
                  Model Swap
                </span>
                <span className={styles['model-change-line']} />
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
                    <div className={styles['deleted-layout-row']}>
                      <button
                        className={styles['deleted-toggle']}
                        onClick={() => toggleDeletedExpanded(i)}
                      >
                        <ChevronRight size={13} />
                        <span className={styles['deleted-badge']}>
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
                              <BadgeComponent
                                type="model"
                                models={[message.model]}
                                mini
                              />
                            )}
                            {message.timestamp && (
                              <BadgeComponent
                                type="dateTime"
                                date={message.timestamp}
                              />
                            )}
                            {message.content && (
                              <span className={styles['deleted-preview']}>
                                {message.content.length > 80
                                  ? message.content.slice(0, 80) + "…"
                                  : message.content}
                              </span>
                            )}
                          </>
                        )}
                        {groupCount > 1 && (
                          <>
                            <BadgeComponent
                              type="dateTime"
                              date={displayMessages[groupIndices[0]].timestamp}
                            />
                            <span style={{ opacity: 0.5 }}>—</span>
                            <BadgeComponent
                              type="dateTime"
                              date={
                                displayMessages[groupIndices[groupCount - 1]]
                                  .timestamp
                              }
                            />
                          </>
                        )}
                      </button>
                      {groupCount === 1 && !readOnly && onRestore && (
                        <div className={styles['deleted-actions']}>
                          <IconButtonComponent
                            icon={<Undo2 size={14} />}
                            onClick={() => onRestore?.(i)}
                            tooltip="Restore message"
                            className={styles['action-button']}
                          />
                        </div>
                      )}
                    </div>
                  );
                }

                // -- Expanded: show all messages in the group --
                return (
                  <div className={styles['deleted-expanded']}>
                    <div className={styles['deleted-layout-row']}>
                      <button
                        className={styles['deleted-toggle']}
                        onClick={() => toggleDeletedExpanded(i)}
                      >
                        <ChevronDown size={13} />
                        <span className={styles['deleted-badge']}>
                          Deleted{groupCount > 1 ? ` (${groupCount})` : ""}
                        </span>
                      </button>
                    </div>
                    {groupIndices.map((gi: number) => {
                      const groupMessage = displayMessages[gi];
                      const gRoleClass =
                        groupMessage.role === "user"
                          ? styles['user-node']
                          : groupMessage.role === "system"
                            ? styles['system-node']
                            : styles['assistant-node'];

                      const gShowModelChange = swapBefore[gi];
                      const gIsFadedSwap =
                        gShowModelChange &&
                        gi > 0 &&
                        displayMessages[gi - 1].deleted &&
                        displayMessages[gi].deleted;
                      const gSwapDividerClass =
                        `${styles['model-change-divider']} ${gIsFadedSwap ? styles['model-change-divider-faded'] : ""}`.trim();
                      const shouldRenderInnerSwap =
                        gShowModelChange && gi !== groupIndices[0];

                      return (
                        <React.Fragment key={gi}>
                          {shouldRenderInnerSwap && (
                            <div className={gSwapDividerClass}>
                              <span className={styles['model-change-line']} />
                              <span className={styles['model-change-label']}>
                                <RefreshCw size={11} />
                                Model Swap
                              </span>
                              <span className={styles['model-change-line']} />
                            </div>
                          )}
                          <div className={styles['deleted-group-item']}>
                            <div className={styles['deleted-group-item-header']}>
                              <BadgeComponent
                                variant="info"
                                mini
                                tooltip="Message role"
                              >
                                {groupMessage.role === "user" ? "User" : "Model"}
                              </BadgeComponent>
                              {groupMessage.model && (
                                <BadgeComponent
                                  type="model"
                                  models={[groupMessage.model]}
                                  mini
                                />
                              )}
                              {groupMessage.timestamp && (
                                <BadgeComponent
                                  type="dateTime"
                                  date={groupMessage.timestamp}
                                />
                              )}
                              <div
                                className={styles['deleted-actions']}
                                style={{ opacity: 1 }}
                              >
                                {!readOnly && onRestore && (
                                  <IconButtonComponent
                                    icon={<Undo2 size={14} />}
                                    onClick={() => onRestore?.(gi)}
                                    tooltip="Restore message"
                                    className={styles['action-button']}
                                  />
                                )}
                                {groupMessage.content && (
                                  <CopyButtonComponent
                                    text={groupMessage.content}
                                    tooltip="Copy raw text"
                                    className={styles['action-button']}
                                  />
                                )}
                              </div>
                            </div>
                            <div className={styles['deleted-message-body']}>
                              <div
                                className={`${styles['message']} ${gRoleClass}`}
                              >
                                <div
                                  className={`${styles['avatar']} ${styles['deleted-avatar']}`}
                                >
                                  {groupMessage.role === "user" ? (
                                    <User size={16} />
                                  ) : groupMessage.role === "system" ? (
                                    <Terminal size={16} />
                                  ) : (
                                    <Bot size={16} />
                                  )}
                                </div>
                                <div className={styles['content']}>
                                  {groupMessage.thinking && (
                                    <ThinkingBlock
                                      thinking={groupMessage.thinking}
                                      isStreaming={false}
                                    />
                                  )}
                                  {groupMessage.toolCalls &&
                                    groupMessage.toolCalls.length > 0 && (
                                      <ToolCallsBlockComponent
                                        toolCalls={groupMessage.toolCalls}
                                        subAgentToolActivity={subAgentToolActivity}
                                      />
                                    )}
                                  {groupMessage.images && groupMessage.images.length > 0 && (
                                    <div className={styles['image-preview-layout-row']}>
                                      {groupMessage.images.map(
                                        (rawUrl: string, j: number) => {
                                          const resolvedUrl =
                                            PrismService.getFileUrl(rawUrl);
                                          const cat = getMimeCategory(rawUrl);
                                          let clickHandler;
                                          if (cat === "image")
                                            clickHandler = () =>
                                              handleImageClick(resolvedUrl);
                                          else if (
                                            cat === "pdf" ||
                                            cat === "text"
                                          )
                                            clickHandler = () =>
                                              onDocClick?.(resolvedUrl);
                                          return (
                                            <MediaPreview
                                              key={j}
                                              dataUrl={rawUrl}
                                              onClick={clickHandler}
                                            />
                                          );
                                        },
                                      )}
                                    </div>
                                  )}
                                  {groupMessage.content ? (
                                    <MarkdownContent content={groupMessage.content} />
                                  ) : null}
                                  {groupMessage.role === "assistant" &&
                                    (groupMessage.usage || groupMessage.provider) && (
                                      <div className={styles['meta-badges']}>
                                        {groupMessage.provider && (
                                          <BadgeComponent
                                            type="providers"
                                            providers={[groupMessage.provider]}
                                          />
                                        )}
                                        {groupMessage.model && (
                                          <BadgeComponent
                                            type="model"
                                            models={[groupMessage.model]}
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
                // -- Task notification card (replaces user bubble for sub-agent results) --
                // Only renders for non-absorbed notifications (i.e. edge cases where
                // the matching team_create tool call isn't in the visible window).
                const taskNotif =
                  message.role === "user"
                    ? parseTaskNotification(message.content)
                    : null;
                if (taskNotif) {
                  return (
                    <SubAgentNotificationComponent
                      taskNotif={taskNotif}
                      timestamp={message.timestamp}
                      readOnly={readOnly}
                      onDelete={() => onDelete?.(i)}
                    />
                  );
                }

                // -- Fired Timer Badge Rendering --
                const isTimerFired =
                  message.role === "user" &&
                  message.content &&
                  typeof message.content === "string" &&
                  (message.content.startsWith("⏰ Reminder fired: ") ||
                    message.content.startsWith("🔔 Notification: ") ||
                    message.content.startsWith("🏮 Reminder fired: "));
                if (isTimerFired) {
                  const prompt = message.content
                    .replace("⏰ Reminder fired: ", "")
                    .replace("🔔 Notification: ", "")
                    .replace("🏮 Reminder fired: ", "");
                  return (
                    <div className={styles['schedule-fired-divider']}>
                      <span className={styles['schedule-fired-line']} />
                      <span className={styles['schedule-fired-label']}>
                        Schedule Fired
                      </span>
                      <span className={styles['schedule-fired-line']} />
                      <div className={styles['schedule-fired-details']}>
                        {message.timestamp && (
                          <BadgeComponent
                            type="dateTime"
                            date={message.timestamp}
                          />
                        )}
                        <span className={styles['schedule-fired-prompt']}>
                          {prompt}
                        </span>
                      </div>
                    </div>
                  );
                }


                // -- Normal message rendering --
                return (
                  <div
                    ref={
                      i === lastUserMessageIndex && message.role === "user"
                        ? lastUserMessageRef
                        : undefined
                    }
                    data-message-index={i}
                    {...(!coalesce?.isContinuation ? { 'data-navigation-target': '' } : {})}
                    className={`${styles['message']} ${roleClass}${coalesce?.isContinuation ? ` ${styles['continuation-message']}` : ""}`}
                  >
                    {/* Avatar: hidden for continuation messages */}
                    {!coalesce?.isContinuation && (
                      <div
                        className={`${styles['avatar']}${message.role === "assistant" && isGenerating && i === messages.length - 1 ? ` ${styles['prism-avatar']}` : ""}`}
                      >
                        {message.role === "user" ? (
                          <User size={16} />
                        ) : message.role === "system" ? (
                          <Terminal size={16} />
                        ) : activeAgent ? (
                          renderAgentIcon(activeAgent, 16)
                        ) : (
                          <Bot size={16} />
                        )}
                      </div>
                    )}
                    <div className={styles['content']}>
                      {/* Header: hidden for continuation messages */}
                      {!coalesce?.isContinuation && (
                        <div className={styles['message-header']}>
                          <div className={styles['role-label']}>
                            {message.role === "user"
                              ? "User"
                              : message.role === "system"
                                ? "System"
                                : activeAgent?.name || "Model"}
                            {message.timestamp && (
                              <BadgeComponent
                                type="dateTime"
                                date={message.timestamp}
                              />
                            )}
                          </div>
                          {!readOnly && (
                            <div className={styles['message-actions']}>
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
                                    className={styles['action-button']}
                                  />
                                  <IconButtonComponent
                                    icon={<RotateCcw size={14} />}
                                    onClick={() => onRerun?.(i)}
                                    disabled={isGenerating}
                                    tooltip="Rerun this turn"
                                    className={styles['action-button']}
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
                                    className={styles['action-button']}
                                  />
                                )}
                              {message.content && (
                                <CopyButtonComponent
                                  text={message.content}
                                  tooltip="Copy raw text"
                                  className={styles['action-button']}
                                />
                              )}
                              <IconButtonComponent
                                icon={<Trash2 size={14} />}
                                onClick={() => onDelete?.(i)}
                                tooltip="Delete message"
                                variant="destructive"
                                className={styles['action-button']}
                              />
                            </div>
                          )}
                          {readOnly && message.content && (
                            <div className={styles['message-actions']}>
                              <CopyButtonComponent
                                text={message.content}
                                tooltip="Copy raw text"
                                className={styles['action-button']}
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
                            (state) => state.type === "thinking",
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
                              isAutoCollapsed?: boolean;
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
                                (toolCall: ToolCallEvent) => {
                                  if (!toolIdSet.has(toolCall.id)) return false;
                                  if (renderedToolIds.has(toolCall.id)) return false;
                                  renderedToolIds.add(toolCall.id);
                                  return true;
                                },
                              );
                              if (segmentTools.length === 0) return null;
                              return (
                                <ToolCallsBlockComponent
                                  key={`seg-t-${si}`}
                                  toolCalls={segmentTools}
                                  streamingOutputs={streamingOutputs}
                                  subAgentToolActivity={subAgentToolActivity}
                                  isAutoCollapsed={opts.isAutoCollapsed}
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
                                !opts.insideThinking && !opts.suppressCursor;
                              if (fragmentText) {
                                return (
                                  <MarkdownContent
                                    key={`seg-x-${si}`}
                                    content={fragmentText}
                                    className={
                                      isStreaming && isLastTextSeg && showCursor
                                        ? styles['streaming-text']
                                        : ""
                                    }
                                  >
                                    {isLastTextSeg && showCursor && (
                                      <StreamingCursorComponent
                                        active={isStreaming}
                                        text={fragmentText}
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
                                    text={fragmentText}
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
                                  status={planProposal.status}
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
                            const nonThinking = segs.filter(
                              (state) => state.type !== "thinking",
                            );
                            return (
                              <>
                                {hasThinking &&
                                  segs
                                    .filter((state) => state.type === "thinking")
                                    .map((seg, segmentIndex) => {
                                      const fragment =
                                        message.thinkingFragments?.[
                                          seg.fragmentIndex ?? 0
                                        ];
                                      return (
                                        <ThinkingBlock
                                          key={`edit-think-${segmentIndex}`}
                                          isStreaming={false}
                                          thinking={fragment}
                                        />
                                      );
                                    })}
                                {nonThinking.map((seg, si) =>
                                  renderSeg(seg, si),
                                )}
                                <EditableMessage
                                  key="seg-edit"
                                  content={message.content}
                                  index={i}
                                  role="assistant"
                                  onEdit={onEdit!}
                                  editing={true}
                                  onCancelEdit={() => setEditingIndex(null)}
                                  knownPaths={knownPathsSet}
                                  onMentionFileOpen={onMentionFileOpen}
                                />
                              </>
                            );
                          }

                          // -- Normal rendering --
                          // Render each segment in its original interleaved order.
                          // Each thinking segment gets its own ThinkingBlock so they
                          // appear separately between tool calls and text — both
                          // during streaming and after refresh.
                          if (hasThinking) {
                            const lastSeg = segs[segs.length - 1];

                            // Find the last text segment index for streaming cursor
                            const lastTextSegmentIndex = (() => {
                              for (let k = segs.length - 1; k >= 0; k--) {
                                if (segs[k].type === "text") return k;
                              }
                              return -1;
                            })();

                            // Track whether any non-thinking content exists
                            const hasVisibleContent = segs.some(
                              (state) => state.type !== "thinking",
                            );

                            // Find last tool segment for auto-collapse logic
                            const lastToolSegmentIndex = (() => {
                              for (let k = segs.length - 1; k >= 0; k--) {
                                if (segs[k].type === "tools") return k;
                              }
                              return -1;
                            })();

                            // Find the last thinking segment — the streaming cursor
                            // should attach to this one (not the absolute last segment)
                            // so intermediate thinking blocks remain visible during
                            // multi-iteration agentic flows.
                            const lastThinkingSegmentIndex = (() => {
                              for (let k = segs.length - 1; k >= 0; k--) {
                                if (segs[k].type === "thinking") return k;
                              }
                              return -1;
                            })();

                            return (
                              <>
                                {segs.map((seg, segmentIndex) => {
                                  if (seg.type === "thinking") {
                                    const isLastThinkingSegment =
                                      segmentIndex === lastThinkingSegmentIndex;
                                    const isThinkingStreaming =
                                      isStreaming &&
                                      isLastThinkingSegment &&
                                      seg === lastSeg;
                                    const fragment =
                                      message.thinkingFragments?.[
                                        seg.fragmentIndex ?? 0
                                      ];
                                    return (
                                      <ThinkingBlock
                                        key={`think-${segmentIndex}`}
                                        isStreaming={isThinkingStreaming}
                                        streamKeepVisible={
                                          isStreaming && isLastThinkingSegment
                                        }
                                        thinking={fragment}
                                      />
                                    );
                                  }
                                  const isLastText =
                                    segmentIndex === lastTextSegmentIndex;
                                  return (
                                    <React.Fragment
                                      key={`vis-${segmentIndex}`}
                                    >
                                      {renderSeg(seg, segmentIndex, {
                                        isLastText,
                                        isAutoCollapsed:
                                          isStreaming &&
                                          seg.type === "tools" &&
                                          segmentIndex !== lastToolSegmentIndex,
                                      })}
                                    </React.Fragment>
                                  );
                                })}
                                {/* Streaming cursor when no visible content yet */}
                                {isStreaming && !hasVisibleContent && (
                                  <StreamingCursorComponent active standalone />
                                )}
                              </>
                            );
                          }

                          // No thinking — render all segments inline (tools interleaved with text)
                          // Find the last text segment to place streaming cursor
                          const lastTextIndex = (() => {
                            for (let k = segs.length - 1; k >= 0; k--) {
                              if (segs[k].type === "text") return k;
                            }
                            return -1;
                          })();
                          // Find last tool segment for auto-collapse logic
                          const lastToolIndex = (() => {
                            for (let k = segs.length - 1; k >= 0; k--) {
                              if (segs[k].type === "tools") return k;
                            }
                            return -1;
                          })();
                          return segs.map((seg, si) =>
                            renderSeg(seg, si, {
                              isLastText: si === lastTextIndex,
                              isAutoCollapsed:
                                isStreaming &&
                                seg.type === "tools" &&
                                si !== lastToolIndex,
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
                                subAgentToolActivity={subAgentToolActivity}
                              />
                            )}

                          {/* Text content */}
                          {message.role === "user" && !readOnly ? (
                            <EditableMessage
                              content={message.content}
                              index={i}
                              role="user"
                              onEdit={onEdit!}
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
                              onEdit={onEdit!}
                              editing={true}
                              onCancelEdit={() => setEditingIndex(null)}
                              knownPaths={knownPathsSet}
                              onMentionFileOpen={onMentionFileOpen}
                            />
                          ) : message.role === "user" && showRaw ? (
                            (() => {
                              const { prefix, rest } = splitRawContent(
                                message.content,
                              );
                              if (prefix) {
                                return (
                                  <div className={styles['text']}>
                                    <div className={styles['raw-prefix']}>
                                      {prefix}
                                    </div>
                                    <MarkdownContent
                                      content={rest}
                                      className={
                                        isStreaming ? styles['streaming-text'] : ""
                                      }
                                    >
                                      <StreamingCursorComponent
                                        active={isStreaming}
                                        text={rest}
                                      />
                                    </MarkdownContent>
                                  </div>
                                );
                              }
                              return (
                                <MarkdownContent
                                  content={message.content}
                                  className={
                                    isStreaming ? styles['streaming-text'] : ""
                                  }
                                >
                                  <StreamingCursorComponent
                                    active={isStreaming}
                                    text={message.content}
                                  />
                                </MarkdownContent>
                              );
                            })()
                          ) : message.content ? (
                            <MarkdownContent
                              content={message.content}
                              className={
                                isStreaming ? styles['streaming-text'] : ""
                              }
                            >
                              <StreamingCursorComponent
                                active={isStreaming}
                                text={message.content}
                              />
                            </MarkdownContent>
                          ) : isStreaming ? (
                            <StreamingCursorComponent active standalone />
                          ) : null}
                        </>
                      )}

                      {/* Visual tool results rendered inline below prose */}
                      {message.role === "assistant" &&
                        message.toolCalls &&
                        message.toolCalls.length > 0 &&
                        (() => {
                          const visualToolCalls = message.toolCalls.filter(
                            (toolCall: ToolCallEvent) =>
                              VISUAL_TOOL_NAMES.has(toolCall.name) &&
                              toolCall.result,
                          );
                          if (visualToolCalls.length === 0) return null;
                          return visualToolCalls.map(
                            (toolCall: ToolCallEvent, toolCallIndex: number) => (
                              <div key={`visual-${toolCall.id || toolCallIndex}`}>
                                <ToolResultView toolCall={toolCall} hideToggles={true} />
                              </div>
                            ),
                          );
                        })()}

                      {/* Images / media */}
                      {message.images && message.images.length > 0 && (
                        <div className={styles['image-preview-layout-row']}>
                          {message.images.map((rawUrl, j) => {
                            const resolvedUrl = PrismService.getFileUrl(rawUrl);
                            const cat = getMimeCategory(rawUrl);
                            let clickHandler;
                            if (cat === "image")
                              clickHandler = () =>
                                handleImageClick(resolvedUrl);
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

                      {/* Streaming audio (live conversation in progress) */}
                      {!readOnly &&
                        message.role === "assistant" &&
                        message._liveStreaming &&
                        !message.audio && (
                          <div className={styles['audio-card']}>
                            <AudioPlayerRecorderComponent streaming compact />
                          </div>
                        )}

                      {/* Audio */}
                      {message.audio && (
                        <div className={styles['image-preview-layout-row']}>
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
                          <div className={styles['image-preview-layout-row']}>
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
                          <div className={styles['image-preview-layout-row']}>
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
                        <div className={styles['error-block']}>
                          <AlertTriangle
                            size={14}
                            className={styles['error-icon']}
                          />
                          <span>{message.error}</span>
                        </div>
                      )}

                      {/* User metadata */}
                      {message.role === "user" && message.content && (
                        <div className={styles['meta-badges']}>
                          <BadgeComponent
                            type="words"
                            count={
                              message.content
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length
                            }
                          />
                          <BadgeComponent
                            type="tokens"
                            value={Math.ceil(message.content.length / 4)}
                            label="estimated"
                          />
                          {message.timestamp && (
                            <BadgeComponent
                              type="dateTime"
                              date={message.timestamp}
                            />
                          )}
                        </div>
                      )}

                      {/* System metadata */}
                      {message.role === "system" && message.content && (
                        <div className={styles['meta-badges']}>
                          <BadgeComponent
                            type="words"
                            count={
                              message.content
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length
                            }
                          />
                          <BadgeComponent
                            type="tokens"
                            value={Math.ceil(message.content.length / 4)}
                            label="estimated"
                          />
                          {message.timestamp && (
                            <BadgeComponent
                              type="dateTime"
                              date={message.timestamp}
                            />
                          )}
                        </div>
                      )}

                      {/* Assistant metadata — only on the last message in a coalesced group */}
                      {message.role === "assistant" &&
                        coalesce?.isLastInGroup !== false &&
                        (message.usage ||
                          message.audio ||
                          message.provider) && (
                          <div className={styles['meta-badges']}>
                            {message.provider && (
                              <BadgeComponent
                                type="providers"
                                providers={[message.provider]}
                              />
                            )}
                            {message.model && (
                              <BadgeComponent
                                type="model"
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
                                  message.usage
                                    ?.reasoningOutputTokens || 0;
                                let outLabel = "out";
                                if (reasoning > 0) {
                                  outLabel = `out (${reasoning.toLocaleString()} reasoning)`;
                                }
                                return (
                                  <>
                                    <BadgeComponent
                                      type="tokens"
                                      value={totalIn}
                                      label={inLabel}
                                    />
                                    <BadgeComponent
                                      type="tokens"
                                      value={message.usage.outputTokens}
                                      label={outLabel}
                                    />
                                  </>
                                );
                              }
                              if (message.usage?.outputTokens != null) {
                                return (
                                  <BadgeComponent
                                    type="tokens"
                                    value={message.usage.outputTokens}
                                    label="tokens"
                                  />
                                );
                              }
                              return null;
                            })()}
                            {message.content && (
                              <BadgeComponent
                                type="words"
                                count={
                                  message.content
                                    .trim()
                                    .split(/\s+/)
                                    .filter(Boolean).length
                                }
                              />
                            )}
                            {message.totalTime != null && (
                              <BadgeComponent
                                type="stopwatch"
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
                              <BadgeComponent
                                type="cost"
                                cost={message.estimatedCost}
                              />
                            ) : null}
                            {message.timestamp && (
                              <BadgeComponent
                                type="dateTime"
                                date={message.timestamp}
                              />
                            )}
                          </div>
                        )}

                      {/* Plan proposal card — fallback for non-segmented messages */}
                      {planProposal &&
                        message.role === "assistant" &&
                        (planProposal.status === "pending"
                          ? i === messages.length - 1
                          : message.toolCalls?.some((toolCall) => toolCall.name === TOOL_NAMES.EXIT_PLAN_MODE)) &&
                        !message.contentSegments?.some(
                          (state) => state.type === "plan",
                        ) && (
                          <PlanCardComponent
                            planText={planProposal.plan}
                            steps={planProposal.steps}
                            status={planProposal.status}
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
      {localLightboxSourceUrl && (
        <ImagePreviewComponent
          src={localLightboxSourceUrl}
          onClose={() => setLocalLightboxSourceUrl(null)}
          readOnly={true}
        />
      )}
    </div>
  );
}
