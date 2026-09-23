"use client";

/**
 * The chat's composer: the editable input with its `@` mentions (workspace
 * files, MCP resources) and `/` menu (rules as badges, MCP prompts), the
 * attachments (picker, drop, paste — validated at intake), the next-turn
 * queue, the permission mode and the context budget above it, and Send
 * (Stop while the conversation runs; Update / Queue beside it).
 *
 * Typing re-renders the composer only. The chat reads and clears the draft
 * through `handleRef` when it sends.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  CornerDownLeft,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Paperclip,
  Send,
  Square,
  Video,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import ChatInputButton from "./ChatInputButtonComponent";
import InputBoxComponent from "./InputBoxComponent";
import ContextBudgetIndicatorComponent from "./ContextBudgetIndicatorComponent";
import QueuedTurnChipsComponent from "./QueuedTurnChipsComponent";
import PermissionModeSelectorComponent from "./PermissionModeSelectorComponent";
import { McpPromptSlashItems, McpResourceMentionItems } from "./McpComposerMenuItemsComponent";
import type { PendingFileAttachment } from "./MessageListComponent";
import chatStyles from "./ChatAreaComponent.module.css";
import useComposerSendMode from "../hooks/useComposerSendMode";
import { useMcpComposerSources } from "../hooks/useMcpComposerSources";
import type { NextTurnQueue } from "../hooks/useNextTurnQueue";
import type { PermissionModeApi } from "../hooks/usePermissionMode";
import type { AttachmentPolicy } from "../hooks/useAttachmentPolicy";
import type { WorkspacePathEntry, WorkspacePathIndex } from "../hooks/useWorkspacePathIndex";
import type { SendOptions } from "../hooks/useChatTurns";
import { EVENT_NAME_USER_TYPING } from "../constants";
import { decideComposerAction } from "../utils/turnInputRouting";
import { filterMcpPrompts, filterMcpResources } from "../utils/mcpComposer";
import {
  applyMentionToTextNode,
  createMcpResourceBadge,
  createMentionBadge,
  createSlashCommandBadge,
  detectMentionToken,
  extractSlashCommandNames,
  filterMentionResults,
  placeCaretAfter,
  serializeEditable,
} from "../utils/mentionUtils";
import {
  classifyIntakeFile,
  downscaleImageForAttachment,
  formatFileSize,
  getTextualFileKind,
  isUniversallyReadableMime,
  normalizeDataUrlMimeType,
  shouldDownscaleImage,
} from "../utils/fileIntake";
import type { ContextBudget, MCPResource, Rule } from "../types/types";

// -- Attachment guardrails ---------------------------------------
// Enforced at intake (file picker, drag-drop, paste) so oversized or
// excess attachments are rejected with feedback instead of silently
// bloating the payload. Images travel inline as base64; other files
// upload to MinIO before send.
// The file cap must leave its base64 data URL (×4/3) under the
// service's 50MB JSON body limit, or /files/upload 413s at the body
// parser before the endpoint's friendly validation can run.
const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB per image
const MAX_FILE_ATTACHMENT_BYTES = 35 * 1024 * 1024; // 35MB per non-image file (~46.7MB as base64)
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

function formatByteLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/** What the composer holds when the chat sends. */
export interface ComposerDraft {
  /** The text, trimmed, with @mentions as `@path` (see serializeEditable). */
  text: string;
  images: string[];
  files: PendingFileAttachment[];
  /** Rules picked from the `/` menu (badges in the input). */
  ruleNames: Set<string>;
}

export interface ComposerHandle {
  readDraft: () => ComposerDraft;
  /** Empty the input and the attachments. */
  clear: () => void;
  /** Drop the pending images only (a new conversation keeps the text). */
  clearImages: () => void;
  /** Put a draft back (a send that failed). */
  restore: (_draft: { text: string; images: string[]; files: PendingFileAttachment[] }) => void;
  /** Add an image (the lightbox's annotated copy). */
  addImage: (_dataUrl: string) => void;
  /** A workspace file (or lines of it) as an @mention badge at the caret. */
  insertMention: (_filePath: string, _lines?: { start: number; end: number }) => void;
  focus: () => void;
}

interface ComposerComponentProps {
  handleRef: Ref<ComposerHandle>;
  placeholder: string;
  isConversationRunning: boolean;
  rules: Rule[];
  workspacePaths: WorkspacePathIndex;
  attachmentPolicy: AttachmentPolicy;
  /** The conversation's permission mode; null where there is none (agentless chat). */
  permissionMode: PermissionModeApi | null;
  contextBudget: ContextBudget | null;
  queue: NextTurnQueue;
  onSend: (_options?: SendOptions) => void;
  /** A pending image was clicked: preview (and annotate) it. */
  onPreviewImage: (_dataUrl: string) => void;
  onNotify: (_message: string, _type: string) => void;
}

export default function ComposerComponent({
  handleRef,
  placeholder,
  isConversationRunning,
  rules,
  workspacePaths,
  attachmentPolicy,
  permissionMode,
  contextBudget,
  queue,
  onSend,
  onPreviewImage,
  onNotify,
}: ComposerComponentProps) {
  const textareaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputValueRef = useRef<string>("");
  const [hasInput, setHasInput] = useState(false);
  const [draftInputLength, setDraftInputLength] = useState(0);
  const [composerSendMode, setComposerSendMode] = useComposerSendMode();

  // Active rules are tracked as inline badges in the contentEditable DOM.
  // At send time we extract names via extractSlashCommandNames().
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashCommandQuery, setSlashCommandQuery] = useState("");
  // MCP prompts (the `/` menu) and resources (the `@` menu).
  const {
    prompts: mcpPrompts,
    resources: mcpResources,
    ensurePrompts: ensureMcpPrompts,
    ensureResources: ensureMcpResources,
  } = useMcpComposerSources();

  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFileAttachment[]>([]);
  // Refs mirror the pending attachment state so intake validation and
  // the send can read current values without re-creating callbacks on
  // every attachment change (the main cause of input lag).
  const pendingImagesRef = useRef<string[]>(pendingImages);
  const pendingFilesRef = useRef<PendingFileAttachment[]>(pendingFiles);
  useLayoutEffect(() => {
    pendingImagesRef.current = pendingImages;
    pendingFilesRef.current = pendingFiles;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef<number>(0);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Helper to programmatically set the editable value (quick prompts, queue cancel)
  const setTextareaValue = useCallback((text: string) => {
    inputValueRef.current = text;
    setHasInput(text.trim().length > 0);
    setDraftInputLength(text.length);
    if (textareaRef.current) {
      textareaRef.current.textContent = text;
    }
  }, []);

  /** Re-read the editable after a badge went in or out. */
  const syncFromEditable = useCallback((element: HTMLDivElement) => {
    inputValueRef.current = serializeEditable(element);
    setHasInput(inputValueRef.current.trim().length > 0);
    setDraftInputLength(inputValueRef.current.length);
  }, []);

  // -- Mention Autocomplete ---------------------------------------
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionAnchorRef = useRef<{ node: Text; offset: number } | null>(null); // { node, offset } of the `@`
  const mentionListRef = useRef<HTMLDivElement | null>(null);
  const { entries: workspaceEntries, ensure: ensureWorkspacePaths } = workspacePaths;

  /** Detect @query from cursor position inside contentEditable. */
  const detectMentionQuery = useCallback(
    (element: HTMLDivElement) => {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount || !element.contains(selection.anchorNode)) {
        setMentionOpen(false);
        return;
      }
      const anchor = selection.anchorNode as Text | null;
      if (!anchor || anchor.nodeType !== Node.TEXT_NODE || !anchor.textContent) {
        setMentionOpen(false);
        return;
      }
      const result = detectMentionToken(anchor.textContent, selection.anchorOffset);
      if (result) {
        mentionAnchorRef.current = { node: anchor, offset: result.anchorOffset };
        setMentionQuery(result.query);
        setMentionIndex(0);
        setMentionOpen(true);
        ensureWorkspacePaths();
        ensureMcpResources();
      } else {
        setMentionOpen(false);
      }
    },
    [ensureWorkspacePaths, ensureMcpResources],
  );

  const mentionResults = useMemo<WorkspacePathEntry[]>(() => {
    if (!mentionOpen || !workspaceEntries) return [];
    return filterMentionResults(workspaceEntries, mentionQuery, 20);
  }, [mentionOpen, mentionQuery, workspaceEntries]);

  const mcpResourceMatches = useMemo(
    () => (mentionOpen ? filterMcpResources(mcpResources, mentionQuery) : []),
    [mentionOpen, mentionQuery, mcpResources],
  );

  /** Mention an MCP resource — its content is attached when the message is sent. */
  const applyMcpResourceMention = useCallback((resource: MCPResource) => {
    const element = textareaRef.current;
    if (!element || !mentionAnchorRef.current) return;
    const { node, offset } = mentionAnchorRef.current;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const badge = createMcpResourceBadge(resource.server, resource.uri, resource.name);
    const space = applyMentionToTextNode(node, offset, selection.anchorOffset, badge);
    placeCaretAfter(space);
    inputValueRef.current = serializeEditable(element);
    setHasInput(inputValueRef.current.trim().length > 0);
    setMentionOpen(false);
    element.focus();
  }, []);

  /** Apply mention — replace @query text with a badge span. */
  const applyMention = useCallback((entry: { path?: string; name: string; type?: string }) => {
    const element = textareaRef.current;
    if (!element || !mentionAnchorRef.current) return;
    const { node, offset } = mentionAnchorRef.current;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const badge = createMentionBadge(entry.path || "", entry.name, entry.type);
    const space = applyMentionToTextNode(node, offset, selection.anchorOffset, badge);
    placeCaretAfter(space);
    inputValueRef.current = serializeEditable(element);
    setHasInput(inputValueRef.current.trim().length > 0);
    setMentionOpen(false);
    element.focus();
  }, []);

  // -- Stable input change handler -----------------------------
  const handleInputChange = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    const value = serializeEditable(element);
    inputValueRef.current = value;
    setDraftInputLength(value.length);
    window.dispatchEvent(new CustomEvent(EVENT_NAME_USER_TYPING));
    const hasSlashBadges = element.querySelectorAll("[data-slash-command]").length > 0;
    const nowHasInput = value.trim().length > 0 || hasSlashBadges;
    setHasInput((previousHasInput) => (previousHasInput !== nowHasInput ? nowHasInput : previousHasInput));
    // -- Mention autocomplete detection --
    detectMentionQuery(element);
    // -- Slash command detection --
    // Only open the picker when the raw text content starts with / and
    // there are no existing badges (otherwise the user is just typing after a badge).
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith("/") && !trimmedValue.includes(" ") && !hasSlashBadges) {
      setSlashCommandOpen(true);
      setSlashCommandQuery(trimmedValue.slice(1).toLowerCase());
      ensureMcpPrompts();
    } else {
      setSlashCommandOpen(false);
      setSlashCommandQuery("");
    }
  }, [ensureMcpPrompts, detectMentionQuery]);

  /** Strip HTML on paste — contentEditable should only accept plain text. */
  const handleEditablePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    placeCaretAfter(textNode);
    // Sync
    const element = textareaRef.current;
    if (element) syncFromEditable(element);
  }, [syncFromEditable]);

  // -- File-mention handler (@ in the workspace tree, the file viewer's @ gutter) --
  // Inserts a styled badge at the current cursor position (e.g. 📄 file.js
  // or, with lines, 📄 file.js:10-25).
  const insertMention = useCallback((filePath: string, lines?: { start: number; end: number }) => {
    const element = textareaRef.current;
    if (!element) return;
    const name = filePath.split("/").pop();
    const badge = lines
      ? createMentionBadge(filePath, name ?? "", "file", { lineStart: lines.start, lineEnd: lines.end })
      : createMentionBadge(filePath, name ?? "", name?.includes(".") ? "file" : "directory");
    const space = document.createTextNode(" ");
    const selection = window.getSelection();
    const range =
      selection && selection.rangeCount && element.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    if (range) {
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const previousCharacter = container.textContent ? container.textContent[range.startOffset - 1] : "";
        if (previousCharacter && previousCharacter !== " " && previousCharacter !== "\n") {
          range.insertNode(document.createTextNode(" "));
          range.collapse(false);
        }
      }
      range.insertNode(space);
      range.insertNode(badge);
    } else {
      if ((element.textContent || "").length > 0) element.appendChild(document.createTextNode(" "));
      element.appendChild(badge);
      element.appendChild(space);
    }
    placeCaretAfter(space);
    inputValueRef.current = serializeEditable(element);
    setHasInput(true);
    element.focus();
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      readDraft: () => ({
        text: inputValueRef.current.trim(),
        images: [...pendingImagesRef.current],
        files: [...pendingFilesRef.current],
        ruleNames: textareaRef.current ? extractSlashCommandNames(textareaRef.current) : new Set<string>(),
      }),
      clear: () => {
        setTextareaValue("");
        setPendingImages([]);
        setPendingFiles([]);
      },
      clearImages: () => setPendingImages([]),
      restore: ({ text, images, files }) => {
        setTextareaValue(text);
        setPendingImages(images);
        setPendingFiles(files);
      },
      addImage: (dataUrl) => setPendingImages((previousPendingImages) => [...previousPendingImages, dataUrl]),
      insertMention,
      focus: () => textareaRef.current?.focus(),
    }),
    [setTextareaValue, insertMention],
  );

  // -- File/image handlers --------------------------------------
  const { supportedInputModalities, attachmentKindsLabel, activeUploadTypes, acceptFilter } = attachmentPolicy;
  // MIME → modality classification with an extension fallback for the
  // odd/empty MIME types browsers report for code and config files
  // (see utils/fileIntake). Returns the modality plus the effective
  // MIME type — normalized from the fallback table when the browser's
  // was generic — or null when the active model can't take the file.
  const classifyFileModality = useCallback(
    (file: { name: string; type: string }) => {
      const classification = classifyIntakeFile(file.name, file.type);
      if (!classification) return null;
      // Text/code files are universally supported — the server inlines
      // them as plain text for every provider, so they bypass the
      // model-modality gate. Binary media (images/audio/video/pdf and
      // office documents) still require the modality.
      if (
        !supportedInputModalities.has(classification.modality) &&
        !isUniversallyReadableMime(classification.mimeType)
      ) {
        return null;
      }
      return classification;
    },
    [supportedInputModalities],
  );

  const readFileToState = useCallback((file: globalThis.File, modality: string, mimeType: string) => {
    const reader = new FileReader();
    reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
      if (!readerEvent.target?.result) return;
      // Rewrite generic data-URL MIMEs (application/octet-stream,
      // empty) to the effective type — the server upload allowlist
      // blocks octet-stream by design and relies on the client
      // normalizing. The original filename rides on the attachment.
      const dataUrl = normalizeDataUrlMimeType(readerEvent.target.result as string, mimeType);

      if (modality === "image") {
        setPendingImages((previous) => [...previous, dataUrl]);
      } else {
        setPendingFiles((previous) => [
          ...previous,
          { name: file.name, mimeType, dataUrl, modality, sizeBytes: file.size },
        ]);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const routeFileToState = useCallback(
    (file: globalThis.File, modality: string, mimeType: string) => {
      // Large raster images are downscaled in-browser (≤2576px long
      // edge, WebP/JPEG re-encode) before joining the payload — images
      // travel inline as base64 in the agent request body, so a few
      // full-resolution photos would otherwise blow the service's 50MB
      // JSON limit. Undecodable formats (e.g. HEIC) fall back to the
      // original bytes; the service converts and clamps those.
      if (modality === "image" && shouldDownscaleImage(mimeType, file.size)) {
        void downscaleImageForAttachment(file).then((downscaledDataUrl) => {
          if (downscaledDataUrl) {
            setPendingImages((previous) => [...previous, downscaledDataUrl]);
          } else {
            readFileToState(file, modality, mimeType);
          }
        });
        return;
      }
      readFileToState(file, modality, mimeType);
    },
    [readFileToState],
  );

  // Single validated intake path for every attachment source (picker,
  // drag-drop, paste). Rejections always surface a toast — files are
  // never silently dropped.
  const intakeFiles = useCallback(
    (incomingFiles: globalThis.File[]) => {
      // Running total so a single multi-file drop can't blow past the
      // attachment cap before React state catches up.
      let totalAttachments = pendingImagesRef.current.length + pendingFilesRef.current.length;
      for (const file of incomingFiles) {
        const classification = classifyFileModality(file);
        if (!classification) {
          onNotify(`"${file.name}" isn't supported by the current model (supports: ${attachmentKindsLabel})`, "warning");
          continue;
        }
        const { modality, mimeType } = classification;
        const byteLimit = modality === "image" ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_FILE_ATTACHMENT_BYTES;
        if (file.size > byteLimit) {
          onNotify(
            `"${file.name}" is too large (${formatByteLimit(file.size)}) — the limit is ${formatByteLimit(byteLimit)} per ${modality === "image" ? "image" : "file"}`,
            "warning",
          );
          continue;
        }
        if (totalAttachments >= MAX_ATTACHMENTS_PER_MESSAGE) {
          onNotify(
            `"${file.name}" not attached — a message can have at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`,
            "warning",
          );
          continue;
        }
        totalAttachments++;
        routeFileToState(file, modality, mimeType);
      }
    },
    [classifyFileModality, attachmentKindsLabel, onNotify, routeFileToState],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      intakeFiles(Array.from(e.target.files || []));
      e.target.value = "";
    },
    [intakeFiles],
  );

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items?.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      intakeFiles(Array.from(e.dataTransfer?.files || []));
    },
    [intakeFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is globalThis.File => file !== null);
      if (files.length === 0) return;
      e.preventDefault();
      intakeFiles(files);
    },
    [intakeFiles],
  );

  /** Send, then give the keyboard back to the input (a click on Send moved it). */
  const send = useCallback(
    (options?: SendOptions) => {
      onSend(options);
      textareaRef.current?.focus();
    },
    [onSend],
  );

  /** While the conversation runs, Enter and the second button steer it or queue for after. */
  const runningSendOptions = useCallback((): SendOptions => {
    const runningAction = decideComposerAction({
      isConversationRunning: true,
      mode: composerSendMode,
      hasFiles: pendingFilesRef.current.length > 0,
    });
    return runningAction === "update" ? { isTurnInput: true } : { isQueueing: true };
  }, [composerSendMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // -- Mention autocomplete keyboard nav --
      if (mentionOpen && mentionResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((index) => {
            const next = Math.min(index + 1, mentionResults.length - 1);
            // Scroll selected item into view
            mentionListRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
            return next;
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((index) => {
            const next = Math.max(index - 1, 0);
            mentionListRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
            return next;
          });
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          applyMention(mentionResults[mentionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionOpen(false);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend(isConversationRunning ? runningSendOptions() : undefined);
      } else if (e.key === "Enter" && e.shiftKey) {
        // Shift+Enter: insert a <br> for newline in contentEditable
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement("br");
          range.insertNode(br);
          // Move cursor after the <br>
          const newRange = document.createRange();
          newRange.setStartAfter(br);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
    },
    [onSend, isConversationRunning, runningSendOptions, mentionOpen, mentionResults, mentionIndex, applyMention],
  );

  const insertRuleBadge = (rule: Rule) => {
    const element = textareaRef.current;
    if (element) {
      // Clear the typed /query text
      element.textContent = "";
      // Insert the inline badge
      const badge = createSlashCommandBadge(rule.name);
      const space = document.createTextNode(" ");
      element.appendChild(badge);
      element.appendChild(space);
      placeCaretAfter(space);
      inputValueRef.current = serializeEditable(element);
      setHasInput(true);
      element.focus();
    }
    setSlashCommandOpen(false);
    setSlashCommandQuery("");
  };

  const filteredRules = slashCommandOpen
    ? rules.filter((rule) => rule.enabled && rule.name.toLowerCase().includes(slashCommandQuery))
    : [];
  const filteredMcpPrompts = slashCommandOpen ? filterMcpPrompts(mcpPrompts, slashCommandQuery) : [];
  const hasAttachments = pendingImages.length > 0 || pendingFiles.length > 0;
  const runningAction = isConversationRunning
    ? decideComposerAction({
        isConversationRunning: true,
        mode: composerSendMode,
        hasFiles: pendingFiles.length > 0,
      })
    : null;

  return (
    <>
      {permissionMode && (
        <PermissionModeSelectorComponent
          mode={permissionMode.mode}
          modes={permissionMode.modes}
          onChange={(mode) => void permissionMode.change(mode)}
          disabled={permissionMode.isBusy}
          message={permissionMode.error ?? permissionMode.notice}
        />
      )}
      {contextBudget && (
        <ContextBudgetIndicatorComponent
          contextBudget={contextBudget}
          estimatedDraftTokens={Math.ceil(draftInputLength / 4)}
        />
      )}
      <QueuedTurnChipsComponent items={queue.items} onRemove={queue.remove} />
      <InputBoxComponent
        as="form"
        onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          send();
        }}
        isDragActive={isDragging}
        isGenerating={isConversationRunning}
        className={chatStyles['input-box-layout']}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {isDragging && (
          <div className={chatStyles['drag-overlay']}>
            <Paperclip size={20} />
            <span>Drop files here ({attachmentKindsLabel})</span>
          </div>
        )}
        {hasAttachments && (
          <div className={chatStyles['pending-images']}>
            {pendingImages.map((dataUrl, imageIndex) => (
              <div key={`img-${imageIndex}`} className={chatStyles['pending-attachment-wrap']}>
                <img
                  src={dataUrl}
                  alt="Attached"
                  className={chatStyles['pending-img']}
                  onClick={() => onPreviewImage(dataUrl)}
                />
                <button
                  type="button"
                  onClick={() => setPendingImages((previous) => previous.filter((_, index) => index !== imageIndex))}
                  className={chatStyles['remove-attachment']}
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {pendingFiles.map((pendingFile, fileIndex) => {
              // Text/code documents get code-flavoured icons; other
              // documents (docx/xlsx/csv) keep the spreadsheet icon.
              const textualKind = pendingFile.modality === "document" ? getTextualFileKind(pendingFile.name) : null;
              const FileIcon =
                pendingFile.modality === "audio" ? Volume2
                : pendingFile.modality === "video" ? Video
                : pendingFile.modality === "pdf" ? FileText
                : textualKind === "code" ? FileCode
                : textualKind === "text" ? FileText
                : pendingFile.modality === "document" ? FileSpreadsheet
                : File;
              return (
                <div key={`file-${fileIndex}`} className={chatStyles['pending-attachment-wrap']}>
                  <div className={chatStyles['pending-file-thumb']}>
                    <FileIcon size={20} />
                    <span style={{ fontSize: "0.5625rem", textOverflow: "ellipsis", overflow: "hidden", maxWidth: 56, whiteSpace: "nowrap" }}>
                      {pendingFile.name.length > 10 ? pendingFile.name.slice(0, 7) + "..." : pendingFile.name}
                    </span>
                    {pendingFile.sizeBytes != null && pendingFile.sizeBytes > 0 && (
                      <span style={{ fontSize: "0.5625rem", opacity: 0.65, whiteSpace: "nowrap" }}>
                        {formatFileSize(pendingFile.sizeBytes)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((previous) => previous.filter((_, index) => index !== fileIndex))}
                    className={chatStyles['remove-attachment']}
                    aria-label={`Remove ${pendingFile.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {/* Active rule badges are now inline in the contentEditable */}
        {isConversationRunning && (
          <div
            className={chatStyles['send-mode-toggle']}
            role="radiogroup"
            aria-label="While the agent is working, Enter will"
          >
            <button
              type="button"
              role="radio"
              aria-checked={composerSendMode === "update"}
              className={`${chatStyles['send-mode-option']} ${composerSendMode === "update" ? chatStyles['send-mode-option-active'] : ""}`}
              onClick={() => setComposerSendMode("update")}
              title="Send now — the agent reads it at its next step"
            >
              <Zap size={12} />
              Update current task
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={composerSendMode === "queue"}
              className={`${chatStyles['send-mode-option']} ${composerSendMode === "queue" ? chatStyles['send-mode-option-active'] : ""}`}
              onClick={() => setComposerSendMode("queue")}
              title="Hold it and send when this turn ends"
            >
              <CornerDownLeft size={12} />
              Queue for next turn
            </button>
          </div>
        )}
        <div className={chatStyles['input-layout-row']}>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptFilter}
            multiple
            hidden
            onChange={handleFileSelect}
          />
          <ChatInputButton
            onClick={() => fileInputRef.current?.click()}
            label={`Attach files (${attachmentKindsLabel})`}
            icon="paperclip"
            uploadTypes={activeUploadTypes.length > 1 ? activeUploadTypes : undefined}
          />
          <div
            ref={textareaRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            className={chatStyles['editable-input']}
            onInput={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handleEditablePaste}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.dataset?.slashCommand) {
                target.remove();
                const element = textareaRef.current;
                if (element) {
                  inputValueRef.current = serializeEditable(element);
                  setHasInput(inputValueRef.current.trim().length > 0 || element.querySelectorAll("[data-slash-command]").length > 0);
                }
              }
            }}
            onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
            data-placeholder={placeholder}
            suppressContentEditableWarning
          />
          {/* -- Slash Command Picker -- */}
          {slashCommandOpen &&
            (rules.length > 0 || mcpPrompts.length > 0) &&
            (filteredRules.length > 0 || filteredMcpPrompts.length > 0) && (
              <div
                className={chatStyles['mention-dropdown']}
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--color-amber) 30%, var(--calculated-border-color))",
                }}
              >
                <div className={chatStyles['mention-list']}>
                  {filteredRules.map((rule) => (
                    <button
                      key={rule.id || rule._id?.toString()}
                      type="button"
                      className={chatStyles['mention-item']}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertRuleBadge(rule);
                      }}
                    >
                      <span
                        style={{
                          color: "var(--color-amber)",
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 600,
                        }}
                      >
                        /{rule.name}
                      </span>
                      {rule.description && (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.7rem",
                            marginInlineStart: "8px",
                          }}
                        >
                          {rule.description}
                        </span>
                      )}
                    </button>
                  ))}
                  <McpPromptSlashItems
                    prompts={filteredMcpPrompts}
                    itemClassName={chatStyles['mention-item']}
                    onInsert={(promptText) => {
                      setTextareaValue(promptText);
                      setSlashCommandOpen(false);
                      setSlashCommandQuery("");
                      textareaRef.current?.focus();
                    }}
                  />
                </div>
              </div>
            )}
          {/* -- Mention Autocomplete Dropdown -- */}
          {mentionOpen && (mentionResults.length > 0 || mcpResourceMatches.length > 0) && (
            <div className={chatStyles['mention-dropdown']}>
              <div className={chatStyles['mention-list']} ref={mentionListRef}>
                {mentionResults.map((entry, entryIndex) => (
                  <button
                    key={entry.path}
                    type="button"
                    className={`${chatStyles['mention-item']} ${entryIndex === mentionIndex ? chatStyles['mention-item-is-active-state'] : ""}`}
                    onMouseDown={(e: React.MouseEvent) => {
                      e.preventDefault();
                      applyMention(entry);
                    }}
                    onMouseEnter={() => setMentionIndex(entryIndex)}
                  >
                    {entry.type === "directory" ? <FolderOpen size={12} /> : <File size={12} />}
                    <span className={chatStyles['mention-item-path']}>{entry.path}</span>
                  </button>
                ))}
                <McpResourceMentionItems
                  resources={mcpResourceMatches}
                  itemClassName={chatStyles['mention-item']}
                  onPick={applyMcpResourceMention}
                />
              </div>
            </div>
          )}
          {runningAction && (
            <ChatInputButton
              variant="button"
              onClick={() => send(runningSendOptions())}
              disabled={!hasInput && !hasAttachments}
              label={runningAction === "update" ? "Update the current task" : "Queue message for next turn"}
              icon={runningAction === "update" ? <Zap size={18} /> : <CornerDownLeft size={18} />}
            />
          )}
          <ButtonComponent
            variant="submit"
            icon={isConversationRunning ? Square : Send}
            isGenerating={isConversationRunning}
            disabled={isConversationRunning ? false : !hasInput && !hasAttachments}
            aria-label={isConversationRunning ? "Stop" : "Send"}
          />
        </div>
      </InputBoxComponent>
    </>
  );
}
