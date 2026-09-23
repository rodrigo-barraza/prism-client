"use client";

/**
 * The pieces a message row is built from: thinking blocks, media and file
 * previews, the inline editor, @mention badges. Moved out of
 * MessageListComponent unchanged when the list was split into rows.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Check,
  Download,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  Video as VideoIcon,
  Volume2,
  X as XIcon,
} from "lucide-react";
import {
  MarkdownContentComponent as MarkdownContent,
  StreamingCursorComponent,
  splitStreamingTail,
} from "@rodrigo-barraza/components-library";
import AudioPlayerRecorderComponent from "../AudioPlayerRecorderComponent";
import BadgeComponent from "../BadgeComponent";
import styles from "../MessageListComponent.module.css";
import PrismService from "../../services/PrismService";
import { stripExternalEnvelopes } from "../../utils/turnInputRouting";
import { parseMentionTokens } from "../../utils/mentionUtils";
import { getTextualFileKind, formatFileSize } from "../../utils/fileIntake";
import type { Message, FileAttachment } from "../../types/types";

export function parseTaskNotification(content: string | undefined | null) {
  if (!content) return null;

  // Primary path: structured XML format
  if (content.includes("<task-notification>")) {
    const tag = (name: string) => {
      const regex = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
      const regexMatch = content.match(regex);
      return regexMatch ? regexMatch[1].trim() : null;
    };
    // A sub-agent's output arrives inside the model's external-input
    // envelope; a person reads the output itself.
    const result = tag("result");
    return {
      taskId: tag("task-id"),
      status: tag("status"),
      summary: tag("summary"),
      result: result === null ? null : stripExternalEnvelopes(result),
      toolUses: tag("tool_uses") ? parseInt(tag("tool_uses") || "0", 10) : 0,
      durationMs: tag("duration_ms"),
    };
  }

  return null;
}

/**
 * Splits a raw message content string into a system context prefix (if any) and the clean user message.
 */
export function splitRawContent(raw: string | undefined | null): {
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

export function renderContentWithMentions(
  text: string | undefined | null,
  knownPaths: Set<string> | null | undefined,
  onMentionFileOpen: ((_path: string) => void) | undefined,
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

export function getMimeCategory(ref: string | undefined | null) {
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
      if (
        ext &&
        ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "heif"].includes(
          ext,
        )
      )
        return "image";
      if (ext && ["wav", "mp3", "webm", "ogg"].includes(ext)) return "audio";
      if (ext && ["mp4", "mov", "avi"].includes(ext)) return "video";
      if (ext === "pdf") return "pdf";
      // Any recognized text/code extension (.txt, .md, .py, .log, …)
      if (ext === "txt" || getTextualFileKind(pathname)) return "text";
    } catch {
      // URL parse failed, fall through
    }
    return "image"; // Default assumption for HTTP URLs in images array
  }
  const match = targetUrl.match(/^data:([^;,]+)/);
  if (!match) return "file";
  const mime = match[1];
  if (mime === "application/json") return "text";
  const type = mime.split("/")[0];
  if (type === "application") return "pdf";
  if (type === "text") return "text";
  return type;
}

/**
 * Category from an explicit MIME type — used when the caller knows the
 * attachment's MIME (message.files) and the URL alone is unreliable
 * (MinIO object names may not keep the original extension).
 */
function getCategoryFromMimeType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json")
    return "text";
  return "file";
}

/* -- Message time formatter ------------------------------------
 * Produces a short clock-time string (e.g. "7:15 PM") from an
 * ISO timestamp, and a full date-time string for the tooltip.  */

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const MESSAGE_TOOLTIP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatMessageTime(isoTimestamp: string | undefined | null): {
  shortTime: string;
  fullDateTime: string;
} | null {
  if (!isoTimestamp) return null;
  try {
    const parsedDate = new Date(isoTimestamp);
    if (isNaN(parsedDate.getTime())) return null;
    return {
      shortTime: MESSAGE_TIME_FORMATTER.format(parsedDate),
      fullDateTime: MESSAGE_TOOLTIP_FORMATTER.format(parsedDate),
    };
  } catch {
    return null;
  }
}
/* -- Sub-components -------------------------------------------- */

interface ThinkingBlockProps {
  thinking?: string;
  isStreaming?: boolean;
  streamKeepVisible?: boolean;
  thinkingDurationSeconds?: number;
  children?: React.ReactNode;
  // Minimal "Chat" view: render a compact, non-expandable pill.
  minimal?: boolean;
}

export function ThinkingBlock({
  thinking,
  isStreaming,
  streamKeepVisible,
  thinkingDurationSeconds,
  children,
  minimal = false,
}: ThinkingBlockProps) {
  // User can manually toggle after streaming has finished
  const [manualOpen, setManualOpen] = useState(false);
  // User can temporarily close during streaming
  const [streamClosed, setStreamClosed] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Live counter for streaming — track elapsed seconds in real-time.
  // Deliberately keyed on a boolean rather than the thinking text itself:
  // depending on `thinking` would tear down and recreate the interval on
  // every streamed token, so a sub-second token cadence keeps the 1s timer
  // from ever firing and the counter never advances.
  const streamingStartRef = useRef<number | null>(null);
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);
  const hasThinkingText = Boolean(thinking);

  useEffect(() => {
    if (isStreaming && hasThinkingText) {
      if (streamingStartRef.current === null) {
        streamingStartRef.current = performance.now();
      }
      const updateElapsedSeconds = () => {
        if (streamingStartRef.current !== null) {
          setLiveElapsedSeconds(
            Math.round((performance.now() - streamingStartRef.current) / 1000),
          );
        }
      };
      updateElapsedSeconds();
      const intervalId = setInterval(updateElapsedSeconds, 1000);
      return () => clearInterval(intervalId);
    }
    if (!isStreaming) {
      streamingStartRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLiveElapsedSeconds(0);
    }
  }, [isStreaming, hasThinkingText]);

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

  // Determine the label text based on streaming state and available duration
  const thinkingLabel = (() => {
    if (isStreaming) {
      return liveElapsedSeconds > 0
        ? `Thinking for ${liveElapsedSeconds} second${liveElapsedSeconds === 1 ? "" : "s"}…`
        : "Thinking…";
    }
    if (thinkingDurationSeconds != null && thinkingDurationSeconds > 0) {
      return `Thought for ${thinkingDurationSeconds < 1 ? "<1" : Math.round(thinkingDurationSeconds)} second${Math.round(thinkingDurationSeconds) === 1 ? "" : "s"}`;
    }
    return "Thoughts";
  })();

  // Minimal "Chat" view — a non-expandable pill mirroring the tool-call pill.
  if (minimal) {
    return (
      <div
        className={`${styles['thinking-pill']}${isStreaming ? ` ${styles['thinking-pill-active']}` : ""}`}
      >
        <span className={styles['thinking-toggle-emoji']}>🧠</span>
        <span className={styles['thinking-pill-label']}>{thinkingLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles['thinking-block']}${isStreaming ? ` ${styles['thinking-streaming']}` : ""}`}
    >
      <button className={styles['thinking-toggle']} onClick={handleToggle}>
        <span className={styles['thinking-toggle-emoji']}>🧠</span>
        <span>{thinkingLabel}</span>
        <ChevronDown size={14} className={`${styles['thinking-chevron']}${collapsed ? ` ${styles['thinking-chevron-collapsed']}` : ''}`} />
      </button>
      <div className={`${styles['thinking-disclosure']}${collapsed ? ` ${styles['thinking-disclosure-collapsed']}` : ''}`}>
        <div className={styles['thinking-content']} ref={contentRef}>
          {thinking?.trim() ? (
            (() => {
              const { body, token } = isStreaming
                ? splitStreamingTail(thinking)
                : { body: thinking, token: "" };
              return (
                <MarkdownContent
                  content={body}
                  className={isStreaming ? styles['streaming-text'] : ""}
                >
                  {isStreaming && (
                    <StreamingCursorComponent active token={token} />
                  )}
                </MarkdownContent>
              );
            })()
          ) : (
            isStreaming && <StreamingCursorComponent active standalone />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/* Inline preview of a text/code attachment — fetches the source
 * (fetch() handles data: URLs too) and renders it in a scrollable
 * monospace block. Content is capped so a huge log can't lock up the
 * message list. */
const TEXT_PREVIEW_MAX_CHARS = 100_000;

function TextFilePreview({ sourceUrl }: { sourceUrl: string }) {
  // Callers key this component on sourceUrl, so a URL change remounts
  // it and the loading state resets without any in-effect setState.
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(sourceUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setTextContent(
          text.length > TEXT_PREVIEW_MAX_CHARS
            ? text.slice(0, TEXT_PREVIEW_MAX_CHARS) + "\n… (truncated)"
            : text,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "failed to load",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  return (
    <div className={styles['text-file-preview']}>
      {loadError ? (
        <div className={styles['text-file-status']}>
          Could not load preview ({loadError})
        </div>
      ) : textContent === null ? (
        <div className={styles['text-file-status']}>Loading…</div>
      ) : (
        <pre className={styles['text-file-content']}>{textContent}</pre>
      )}
    </div>
  );
}

interface MediaPreviewProps {
  dataUrl: string;
  /**
   * Known MIME type of the attachment. When provided it decides the
   * preview category directly — more reliable than sniffing the URL,
   * whose extension may be lost on MinIO uploads.
   */
  mimeType?: string;
  onClick?: () => void;
}

export function MediaPreview({ dataUrl: rawUrl, mimeType, onClick }: MediaPreviewProps) {
  const sourceUrl = PrismService.getFileUrl(rawUrl);
  const mimeCategory = mimeType ? getCategoryFromMimeType(mimeType) : "file";
  const cat = mimeCategory !== "file" ? mimeCategory : getMimeCategory(rawUrl);

  if (cat === "image") {
    return (
       
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
    return <TextFilePreview key={sourceUrl} sourceUrl={sourceUrl} />;
  }
  return (
    <div className={styles['media-card']}>
      <FileText size={22} className={styles['media-card-icon']} />
      <span className={styles['media-card-label']}>{cat.toUpperCase()}</span>
    </div>
  );
}

/* -- Sent non-image file attachments ---------------------------
 * message.files carries {url, name, mimeType, modality} refs for
 * files uploaded to MinIO at send time. Each renders as a compact
 * chip (mirroring the pending-attachment chips in the input box);
 * previewable categories expand an inline MediaPreview on click,
 * everything else gets a download / open-in-new-tab link.       */

function renderAttachmentChipIcon(file: FileAttachment) {
  const mimeType = file.mimeType || "";
  const kind =
    file.modality ||
    (mimeType.startsWith("audio/")
      ? "audio"
      : mimeType.startsWith("video/")
        ? "video"
        : mimeType === "application/pdf"
          ? "pdf"
          : undefined);
  const iconProps = { size: 14, className: styles['file-chip-icon'] };
  if (kind === "audio") return <Volume2 {...iconProps} />;
  if (kind === "video") return <VideoIcon {...iconProps} />;
  if (kind === "pdf") return <FileText {...iconProps} />;
  // Text/code files get code-flavoured icons regardless of modality
  // bucket; other documents (docx/xlsx/csv) keep the spreadsheet icon.
  const textualKind = getTextualFileKind(file.name || "");
  if (textualKind === "code") return <FileCode {...iconProps} />;
  if (textualKind === "text") return <FileText {...iconProps} />;
  if (kind === "document") return <FileSpreadsheet {...iconProps} />;
  if (mimeType.startsWith("text/") || mimeType === "application/json")
    return <FileText {...iconProps} />;
  return <FileIcon {...iconProps} />;
}

function getAttachmentCategory(file: FileAttachment): string {
  const mimeType = file.mimeType || "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json")
    return "text";
  return "file";
}

// Categories MediaPreview can render meaningfully inline.
const PREVIEWABLE_ATTACHMENT_CATEGORIES = new Set([
  "image",
  "audio",
  "video",
  "pdf",
  "text",
]);

export function FileAttachmentChip({ file }: { file: FileAttachment }) {
  const [expanded, setExpanded] = useState(false);
  const resolvedUrl = file.url ? PrismService.getFileUrl(file.url) : null;
  const category = getAttachmentCategory(file);
  const canPreview =
    Boolean(file.url) && PREVIEWABLE_ATTACHMENT_CATEGORIES.has(category);
  const chipBody = (
    <>
      {renderAttachmentChipIcon(file)}
      <span className={styles['file-chip-name']}>{file.name}</span>
      {file.sizeBytes != null && file.sizeBytes > 0 && (
        <span className={styles['file-chip-size']}>
          {formatFileSize(file.sizeBytes)}
        </span>
      )}
    </>
  );
  return (
    <div className={styles['file-attachment']}>
      <div className={styles['file-chip']}>
        {canPreview ? (
          <button
            type="button"
            className={styles['file-chip-main']}
            onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
            title={`${file.name} — click to ${expanded ? "hide" : "show"} preview`}
          >
            {chipBody}
          </button>
        ) : (
          <span className={styles['file-chip-main']} title={file.name}>
            {chipBody}
          </span>
        )}
        {resolvedUrl && (
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={file.name}
            className={styles['file-chip-open']}
            title={`Download / open ${file.name}`}
          >
            <Download size={13} />
          </a>
        )}
      </div>
      {expanded && canPreview && file.url && (
        <div className={styles['file-attachment-preview']}>
          <MediaPreview dataUrl={file.url} mimeType={file.mimeType} />
        </div>
      )}
    </div>
  );
}

/* -- Inline edit for messages ---------------------------------- */

interface EditableMessageProps {
  content: string;
  index: number;
  role: Message["role"];
  onEdit: (_index: number, _content: string) => void;
  editing: boolean;
  onCancelEdit: () => void;
  knownPaths?: Set<string> | null;
  onMentionFileOpen?: (_path: string) => void;
  showRaw?: boolean;
}

export function EditableMessage({
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
