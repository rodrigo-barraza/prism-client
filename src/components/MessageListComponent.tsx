"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  type Ref,
  type RefObject,
} from "react";
import { ChevronDown, Pencil, Terminal, User } from "lucide-react";
import {
  CopyButtonComponent,
  IconButtonComponent,
  MarkdownContentComponent as MarkdownContent,
} from "@rodrigo-barraza/components-library";
import type { ToolDisplayMetadata } from "@rodrigo-barraza/utilities-library";
import BadgeComponent, { type ClientAgent } from "./BadgeComponent";
import ImagePreviewComponent from "./ImagePreviewComponent";
import MessageRow, {
  rowShowsPlan,
  type MessageRowActions,
  type MessageRowShared,
  type PlanProposalView,
} from "./MessageList/MessageRowComponent";
import { parseTaskNotification, renderContentWithMentions } from "./MessageList/MessageRowParts";
import {
  buildDisplayList,
  coalesceAssistantRuns,
  deletedMessageGroups,
  estimateRowHeight,
  hasStreamingOutput,
  modelSwapPositions,
  priorToolMediaKey,
  readsSubAgentActivity,
} from "./MessageList/messageRows";
import styles from "./MessageListComponent.module.css";
import SoundService from "@/services/SoundService";
import useVirtualRows from "../hooks/useVirtualRows";
import type { Message } from "../types/types";

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

/** A non-image file staged in the input box, not yet uploaded. */
export interface PendingFileAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  modality: string;
  sizeBytes?: number;
}

/** Previous / next message, as the chat header's arrows move. */
export interface MessageListNavigation {
  previous: () => void;
  next: () => void;
}

export interface MessageListNavigationState {
  canNavigateUp: boolean;
  canNavigateDown: boolean;
}

interface MessageListBaseProps {
  messages?: Message[];
  isGenerating?: boolean;
  streamingOutputs?: Map<string, string> | null;
  subAgentToolActivity?: Record<string, SubAgentToolActivityItem> | null;
  headerContent?: React.ReactNode;
  systemPrompt?: string | null;
  onSystemPromptEdit?: (_editedPromptValue: string) => void;
  planProposal?: PlanProposalView | null;
  onPlanApprove?: () => void;
  onPlanReject?: () => void;
  knownPaths?: string[];
  showRaw?: boolean;
  // Minimal "Chat" view: render tool calls as non-expandable summary pills.
  minimal?: boolean;
  activeAgent?: ClientAgent | null;
  onImageClick?: (_url: string) => void;
  onDocClick?: (_url: string) => void;
  onMentionFileOpen?: (_path: string) => void;
  onOpenFileInViewer?: (_absolutePath: string) => void;
  toolDisplayMetadataMap?: Record<string, ToolDisplayMetadata> | null;
  /**
   * The element the list scrolls in. Given, the list mounts only the rows
   * near the viewport (hooks/useVirtualRows); without it every row renders.
   */
  scrollElementRef?: RefObject<HTMLElement | null>;
  /** What the rows belong to (the conversation): keeps unsaved rows' measurements apart. */
  listKey?: string;
  /** Previous / next message for the header's arrows. */
  navigationRef?: Ref<MessageListNavigation>;
  onNavigationStateChange?: (_state: MessageListNavigationState) => void;
}

/** A read-only list shows no message actions. */
interface ReadOnlyMessageListProps {
  readOnly: true;
  onEdit?: never;
  onRerun?: never;
  onDelete?: never;
  onRestore?: never;
  onRewind?: never;
  onFork?: never;
}

/**
 * An editable list wires every action it shows. Handler indices are
 * indices into `messages`. `onRerun: null` hides Rerun for a caller with no
 * turn to rerun; `onRestore` is optional (deleted messages stay collapsed).
 */
interface EditableMessageListProps {
  readOnly?: false;
  onEdit: (_index: number, _content: string) => void;
  onRerun: ((_index: number) => void) | null;
  onDelete: (_index: number) => void;
  onRestore?: (_index: number) => void;
  /** "Rewind to here…" — conversation and/or code (optional; hidden when absent). */
  onRewind?: (_index: number) => void;
  /** "Fork from here" — a new conversation through this message (optional). */
  onFork?: (_index: number) => void;
}

export type MessageListProps = MessageListBaseProps &
  (ReadOnlyMessageListProps | EditableMessageListProps);

/** One row of the list: a message, or the first of a run of deleted ones. */
interface ListRow {
  /** The message's display index. */
  index: number;
  /** Measurement key: the saved message id, else its place in this list. */
  key: string;
  /** A bubble the header's arrows stop at (not a continuation, group or notice). */
  isNavigationTarget: boolean;
  /** A user bubble — the pinned header's candidates. */
  isUserBubble: boolean;
}

const EMPTY_MESSAGES: Message[] = [];

const TIMER_PREFIXES = ["⏰ Reminder fired: ", "🔔 Notification: ", "🏮 Reminder fired: "];

function rendersBubble(message: Message): boolean {
  if (message.deleted) return false;
  if (message.role !== "user") return true;
  if (parseTaskNotification(message.content)) return false;
  return !(typeof message.content === "string" && TIMER_PREFIXES.some((prefix) => message.content.startsWith(prefix)));
}

/** The nearest ancestor that scrolls vertically. */
function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  let scrollParent = element?.parentElement ?? null;
  while (scrollParent) {
    const overflow = getComputedStyle(scrollParent).overflowY;
    if (overflow === "auto" || overflow === "scroll") return scrollParent;
    scrollParent = scrollParent.parentElement;
  }
  return null;
}

/** Last entry of the ascending `positions` below `limit`, or -1. */
function lastBelow(positions: readonly number[], limit: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (positions[middle] < limit) low = middle + 1;
    else high = middle;
  }
  return low > 0 ? positions[low - 1] : -1;
}

/** First entry of the ascending `positions` at or above `limit`, or -1. */
function firstAtOrAbove(positions: readonly number[], limit: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (positions[middle] < limit) low = middle + 1;
    else high = middle;
  }
  return low < positions.length ? positions[low] : -1;
}

/**
 * The frame around one row: what the virtualizer measures. A row that was
 * in the list before it mounted (scrolled back into view) does not fade in
 * again; a new one (a reply, a conversation just opened) does.
 */
function RowFrame({
  rowKey,
  position,
  isNew,
  measureRow,
  children,
}: {
  rowKey: string;
  position: number;
  isNew: boolean;
  measureRow: (_key: string) => (_element: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  const [isSettled] = useState(!isNew);
  return (
    <div
      ref={measureRow(rowKey)}
      data-row-position={position}
      className={isSettled ? `${styles['row-frame']} ${styles['row-frame-settled']}` : styles['row-frame']}
    >
      {children}
    </div>
  );
}

/**
 * Shared message list component.
 *
 * Rows are memoized (MessageList/MessageRowComponent): a streamed token
 * renders the last row only. Given a `scrollElementRef`, only the rows near
 * the viewport mount (hooks/useVirtualRows).
 */
export default function MessageList({
  messages = EMPTY_MESSAGES,
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
  minimal = false,

  activeAgent,
  onDelete,
  onRestore,
  onEdit,
  onRerun,
  onRewind,
  onFork,
  onImageClick,
  onDocClick,
  onMentionFileOpen,
  onOpenFileInViewer,
  toolDisplayMetadataMap,
  scrollElementRef,
  listKey = "list",
  navigationRef,
  onNavigationStateChange,
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
  const rowsReference = useRef<HTMLDivElement | null>(null);

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

  // `displaySourceIndices[i]` is displayMessages[i]'s index in `messages` —
  // the index every message action reports to its caller.
  const { messages: displayMessages, sourceIndices: displaySourceIndices } = useMemo(
    () => buildDisplayList(messages, showRaw),
    [messages, showRaw],
  );
  const swapBefore = useMemo(() => modelSwapPositions(displayMessages), [displayMessages]);
  // Consecutive deleted messages coalesce into one row, keyed by the first.
  const deletedGroups = useMemo(
    () => deletedMessageGroups(displayMessages, swapBefore),
    [displayMessages, swapBefore],
  );
  // Consecutive assistant messages share one bubble (avatar and header on
  // the first, metadata on the last).
  const coalesceMeta = useMemo(
    () => coalesceAssistantRuns(displayMessages, swapBefore),
    [displayMessages, swapBefore],
  );

  // The rows: every message but the non-first members of a deleted run.
  const { rows, navigationTargetPositions, userBubblePositions } = useMemo(() => {
    const listRows: ListRow[] = [];
    const targets: number[] = [];
    const userBubbles: number[] = [];
    const usedKeys = new Set<string>();
    displayMessages.forEach((message, index) => {
      if (message.deleted && !deletedGroups.has(index)) return;
      let key = message.id ? `id:${message.id}` : `${listKey}:at:${index}`;
      if (message.deleted) key = `deleted:${key}`;
      if (usedKeys.has(key)) key = `${key}#${index}`;
      usedKeys.add(key);
      const isBubble = rendersBubble(message);
      const row: ListRow = {
        index,
        key,
        isNavigationTarget: isBubble && !coalesceMeta[index]?.isContinuation,
        isUserBubble: isBubble && message.role === "user",
      };
      if (row.isNavigationTarget) targets.push(listRows.length);
      if (row.isUserBubble) userBubbles.push(listRows.length);
      listRows.push(row);
    });
    return { rows: listRows, navigationTargetPositions: targets, userBubblePositions: userBubbles };
  }, [displayMessages, deletedGroups, coalesceMeta, listKey]);

  const getRowKey = useCallback((position: number) => rows[position].key, [rows]);
  const estimateRowSize = useCallback(
    (position: number) => {
      const row = rows[position];
      const group = deletedGroups.get(row.index);
      // A deleted run starts collapsed: one summary line.
      return group ? 40 : estimateRowHeight(displayMessages[row.index]);
    },
    [rows, deletedGroups, displayMessages],
  );
  const virtual = useVirtualRows({
    count: rows.length,
    getKey: getRowKey,
    estimateSize: estimateRowSize,
    scrollElementRef,
    rowsElementRef: rowsReference,
  });

  // Keys the last render had: a row mounting with one of them is not new.
  const previousRowKeysRef = useRef<ReadonlySet<string>>(new Set());
  useLayoutEffect(() => {
    previousRowKeysRef.current = new Set(rows.map((row) => row.key));
  }, [rows]);

  // What the windowing and the handlers read between renders.
  const latestRef = useRef({
    rows,
    virtual,
    displaySourceIndices,
    navigationTargetPositions,
    userBubblePositions,
    onEdit,
    onRerun,
    onDelete,
    onRestore,
    onRewind,
    onFork,
    onImageClick,
    onDocClick,
    onMentionFileOpen,
    onOpenFileInViewer,
    onPlanApprove,
    onPlanReject,
    onNavigationStateChange,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      rows,
      virtual,
      displaySourceIndices,
      navigationTargetPositions,
      userBubblePositions,
      onEdit,
      onRerun,
      onDelete,
      onRestore,
      onRewind,
      onFork,
      onImageClick,
      onDocClick,
      onMentionFileOpen,
      onOpenFileInViewer,
      onPlanApprove,
      onPlanReject,
      onNavigationStateChange,
    };
  });

  // -- Sticky user message (pinned section header) -----------
  // Tracks ALL user messages: the pinned candidate is whichever
  // user message "owns" the section at the top of the viewport
  // (the last one whose top edge has scrolled past it). It only
  // shows once its own bubble is fully out of view — while the
  // bubble is visible at the top, the real message acts as its
  // own header, so scrolling back up settles it into place.
  const [pinnedUserMessageIndex, setPinnedUserMessageIndex] = useState(-1);
  const userMessageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollingToUserMessageRef = useRef<boolean>(false);
  const recomputePinnedRef = useRef<(() => void) | null>(null);

  // The handlers every row shares. Stable for the list's life: they read
  // the latest props when called, so a row never renders for a new closure.
  const actions = useMemo<MessageRowActions>(() => {
    const toSourceIndex = (displayIndex: number) =>
      latestRef.current.displaySourceIndices[displayIndex] ?? displayIndex;
    const userMessageRefs = new Map<number, (_element: HTMLDivElement | null) => void>();
    return {
      edit: (index, content) => latestRef.current.onEdit?.(toSourceIndex(index), content),
      rerun: (index) => latestRef.current.onRerun?.(toSourceIndex(index)),
      delete: (index) => latestRef.current.onDelete?.(toSourceIndex(index)),
      restore: (index) => latestRef.current.onRestore?.(toSourceIndex(index)),
      rewind: (index) => latestRef.current.onRewind?.(toSourceIndex(index)),
      fork: (index) => latestRef.current.onFork?.(toSourceIndex(index)),
      toggleEditing: (index) => setEditingIndex((current) => (current === index ? null : index)),
      cancelEditing: () => setEditingIndex(null),
      toggleDeletedGroup: (index) =>
        setExpandedDeletedSet((previousExpandedSet) => {
          const next = new Set(previousExpandedSet);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        }),
      openImage: (url) => {
        const { onImageClick: openImage } = latestRef.current;
        if (openImage) openImage(url);
        else setLocalLightboxSourceUrl(url);
      },
      openDocument: (url) => latestRef.current.onDocClick?.(url),
      userMessageRef: (index) => {
        let callback = userMessageRefs.get(index);
        if (!callback) {
          callback = (element) => {
            if (element) userMessageElementsRef.current.set(index, element);
            else userMessageElementsRef.current.delete(index);
          };
          userMessageRefs.set(index, callback);
        }
        return callback;
      },
    };
  }, []);

  // Handlers whose presence changes what a row shows get stable stand-ins.
  const stableCallbacks = useMemo(
    () => ({
      openMentionedFile: (path: string) => latestRef.current.onMentionFileOpen?.(path),
      openFileInViewer: (path: string) => latestRef.current.onOpenFileInViewer?.(path),
      approvePlan: () => latestRef.current.onPlanApprove?.(),
      rejectPlan: () => latestRef.current.onPlanReject?.(),
    }),
    [],
  );
  const canEdit = !!onEdit;
  const canRerun = !!onRerun;
  const canRestore = !!onRestore;
  const canRewind = !!onRewind;
  const canFork = !!onFork;
  const hasMentionFileOpen = !!onMentionFileOpen;
  const hasOpenFileInViewer = !!onOpenFileInViewer;
  const hasPlanApprove = !!onPlanApprove;
  const hasPlanReject = !!onPlanReject;
  const shared = useMemo<MessageRowShared>(
    () => ({
      readOnly,
      minimal,
      showRaw,
      isGenerating,
      knownPaths: knownPathsSet,
      activeAgent,
      toolDisplayMetadataMap,
      canEdit,
      canRerun,
      canRestore,
      canRewind,
      canFork,
      onMentionFileOpen: hasMentionFileOpen ? stableCallbacks.openMentionedFile : undefined,
      onOpenFileInViewer: hasOpenFileInViewer ? stableCallbacks.openFileInViewer : undefined,
      onPlanApprove: hasPlanApprove ? stableCallbacks.approvePlan : undefined,
      onPlanReject: hasPlanReject ? stableCallbacks.rejectPlan : undefined,
      actions,
    }),
    [
      readOnly,
      minimal,
      showRaw,
      isGenerating,
      knownPathsSet,
      activeAgent,
      toolDisplayMetadataMap,
      canEdit,
      canRerun,
      canRestore,
      canRewind,
      canFork,
      hasMentionFileOpen,
      hasOpenFileInViewer,
      hasPlanApprove,
      hasPlanReject,
      stableCallbacks,
      actions,
    ],
  );

  const resolveScrollElement = useCallback(
    (): HTMLElement | null => scrollElementRef?.current ?? findScrollParent(containerReference.current),
    [scrollElementRef],
  );

  useEffect(() => {
    const container = containerReference.current;
    if (!container) return;

    // Find the scroll container — walk up to the nearest overflow-y ancestor
    const scrollElement = resolveScrollElement();
    if (!scrollElement) return;

    // Sticky offsets resolve against the scroll container's padding box,
    // so a padded container leaves a see-through gap above/beside the
    // pinned bar. Measure the gap and expose it as CSS variables the
    // sticky uses to pull itself flush with the visible top edge and
    // cover the side gutters.
    const applyCoverOffsets = () => {
      const scrollRect = scrollElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scrollportLeft = scrollRect.left + scrollElement.clientLeft;
      const scrollportRight = scrollportLeft + scrollElement.clientWidth;
      container.style.setProperty(
        "--sticky-cover-top",
        getComputedStyle(scrollElement).paddingTop,
      );
      container.style.setProperty(
        "--sticky-cover-left",
        `${Math.max(0, containerRect.left - scrollportLeft)}px`,
      );
      container.style.setProperty(
        "--sticky-cover-right",
        `${Math.max(0, scrollportRight - containerRect.right)}px`,
      );
    };
    applyCoverOffsets();

    let rafId: number | null = null;
    const updatePinnedIndex = () => {
      rafId = null;
      // Suppress during programmatic scroll-to to prevent stutter
      if (scrollingToUserMessageRef.current) return;
      const pinThreshold = scrollElement.getBoundingClientRect().top + 20;

      let ownerIndex = -1;
      let ownerBottom = 0;
      userMessageElementsRef.current.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < pinThreshold && index > ownerIndex) {
          ownerIndex = index;
          ownerBottom = rect.bottom;
        }
      });
      if (ownerIndex < 0) {
        // Windowed: the owner can be above the mounted rows — the last user
        // bubble before them, entirely above the viewport.
        const { rows: currentRows, virtual: currentVirtual, userBubblePositions: bubbles } = latestRef.current;
        const hiddenOwner = lastBelow(bubbles, currentVirtual.start);
        if (hiddenOwner >= 0) {
          ownerIndex = currentRows[hiddenOwner].index;
          ownerBottom = -Infinity;
        }
      }
      setPinnedUserMessageIndex(
        ownerIndex >= 0 && ownerBottom < pinThreshold ? ownerIndex : -1,
      );
    };
    recomputePinnedRef.current = updatePinnedIndex;

    const scheduleUpdate = () => {
      if (rafId === null) rafId = requestAnimationFrame(updatePinnedIndex);
    };
    scrollElement.addEventListener("scroll", scheduleUpdate, { passive: true });
    // Content height changes (streaming, images loading) shift positions;
    // scroll container resizes can change its responsive padding
    const resizeObserver = new ResizeObserver(() => {
      applyCoverOffsets();
      scheduleUpdate();
    });
    resizeObserver.observe(container);
    resizeObserver.observe(scrollElement);
    updatePinnedIndex();

    return () => {
      scrollElement.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      recomputePinnedRef.current = null;
      setPinnedUserMessageIndex(-1);
    };
  }, [displayMessages.length, resolveScrollElement]);

  // Derive sticky message data from the pinned index. Messages with
  // neither text nor attachments (e.g. audio-only) are never pinned.
  const stickyUserMessage = useMemo(() => {
    if (pinnedUserMessageIndex < 0) return null;
    const message = displayMessages[pinnedUserMessageIndex];
    if (!message || message.role !== "user" || message.deleted) return null;
    const text = (message.content || "").trim();
    if (!text && !message.images?.length) return null;
    return {
      content: text,
      images: message.images,
      index: pinnedUserMessageIndex,
    };
  }, [pinnedUserMessageIndex, displayMessages]);

  const handleStickyClick = useCallback(() => {
    const node = userMessageElementsRef.current.get(pinnedUserMessageIndex);
    const { rows: currentRows, virtual: currentVirtual } = latestRef.current;
    // Suppress tracking during scroll to prevent stutter from layout shifts
    const suppressTracking = () => {
      scrollingToUserMessageRef.current = true;
      // Re-enable tracking after the smooth scroll completes — the recompute
      // sees the message back in view and dismisses the sticky header
      setTimeout(() => {
        scrollingToUserMessageRef.current = false;
        recomputePinnedRef.current?.();
      }, 600);
    };
    if (currentVirtual.isWindowed) {
      // Through the window: the message may not be mounted, and rows
      // mounting on the way must not cut a smooth scroll short.
      const position = currentRows.findIndex((row) => row.index === pinnedUserMessageIndex);
      if (position < 0) return;
      suppressTracking();
      // Land the message just inside the pin threshold so the sticky header
      // dismisses and the real message takes its place at the top
      currentVirtual.scrollToIndex(position, {
        offset: -12,
        behavior: node ? "smooth" : "auto",
        selector: "[data-message-index]",
      });
      return;
    }
    if (!node) return;
    const scrollParent = findScrollParent(node);
    if (!scrollParent) return;
    suppressTracking();
    const nodeRect = node.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    // Land the message just inside the pin threshold so the sticky header
    // dismisses and the real message takes its place at the top
    const offset = nodeRect.top - parentRect.top + scrollParent.scrollTop - 12;
    scrollParent.scrollTo({ top: offset, behavior: "smooth" });
  }, [pinnedUserMessageIndex]);

  // -- Previous / next message (the chat header's arrows) -------------
  const navigation = useMemo(() => {
    const mountedTargets = (): HTMLElement[] => {
      const container = containerReference.current;
      return container ? Array.from(container.querySelectorAll<HTMLElement>("[data-navigation-target]")) : [];
    };
    // The message at or nearest the viewport top: the first whose bottom
    // is below the container top (or the last, scrolled past everything).
    const currentOf = (targets: HTMLElement[], containerTop: number): number => {
      if (targets.length === 0) return -1;
      for (let index = 0; index < targets.length; index++) {
        // Considered "current" when its top is near (within 8px) or below
        // the container top, or its bottom extends past it
        if (targets[index].getBoundingClientRect().bottom > containerTop + 8) return index;
      }
      return targets.length - 1;
    };
    const scrollToTarget = (target: HTMLElement) => {
      const scrollElement = resolveScrollElement();
      if (!scrollElement) return;
      const { virtual: currentVirtual } = latestRef.current;
      const frame = target.closest<HTMLElement>("[data-row-position]");
      if (currentVirtual.isWindowed && frame) {
        currentVirtual.scrollToIndex(Number(frame.dataset.rowPosition), {
          behavior: "smooth",
          selector: "[data-navigation-target]",
        });
        return;
      }
      const containerTop = scrollElement.getBoundingClientRect().top;
      const scrollOffset = target.getBoundingClientRect().top - containerTop + scrollElement.scrollTop;
      scrollElement.scrollTo({ top: scrollOffset, behavior: "smooth" });
    };
    const scrollToRow = (position: number) =>
      latestRef.current.virtual.scrollToIndex(position, { selector: "[data-navigation-target]" });
    const state = (): MessageListNavigationState => {
      const scrollElement = resolveScrollElement();
      const { virtual: currentVirtual, navigationTargetPositions: targetPositions } = latestRef.current;
      const hasTargetsAbove = currentVirtual.isWindowed && lastBelow(targetPositions, currentVirtual.start) >= 0;
      const hasTargetsBelow = currentVirtual.isWindowed && firstAtOrAbove(targetPositions, currentVirtual.end) >= 0;
      const targets = mountedTargets();
      if (!scrollElement || targets.length === 0) {
        return { canNavigateUp: hasTargetsAbove, canNavigateDown: hasTargetsBelow };
      }
      const containerTop = scrollElement.getBoundingClientRect().top;
      const currentIndex = currentOf(targets, containerTop);
      const currentTop = targets[currentIndex]?.getBoundingClientRect().top ?? containerTop;
      const isCurrentTopOffscreen = currentTop < containerTop - 8;
      return {
        canNavigateUp: currentIndex > 0 || isCurrentTopOffscreen || hasTargetsAbove,
        canNavigateDown: currentIndex < targets.length - 1 || hasTargetsBelow,
      };
    };
    return {
      state,
      // Navigate to the previous message (scroll its top into view). If the
      // current message's top is scrolled above the viewport, snap to it
      // first before jumping to the previous message.
      previous: () => {
        const scrollElement = resolveScrollElement();
        if (!scrollElement) return;
        const targets = mountedTargets();
        const currentIndex = currentOf(targets, scrollElement.getBoundingClientRect().top);
        const { virtual: currentVirtual, navigationTargetPositions: targetPositions } = latestRef.current;
        if (currentIndex >= 0) {
          const currentElement = targets[currentIndex];
          const containerTop = scrollElement.getBoundingClientRect().top;
          const isCurrentTopOffscreen = currentElement.getBoundingClientRect().top < containerTop - 8;
          const target = isCurrentTopOffscreen ? currentElement : targets[currentIndex - 1];
          if (target) {
            scrollToTarget(target);
            return;
          }
        }
        // The previous message is above the mounted rows.
        if (!currentVirtual.isWindowed) return;
        const position = lastBelow(targetPositions, currentVirtual.start);
        if (position >= 0) scrollToRow(position);
      },
      // Navigate to the next message (scroll its top into view)
      next: () => {
        const scrollElement = resolveScrollElement();
        if (!scrollElement) return;
        const targets = mountedTargets();
        const currentIndex = currentOf(targets, scrollElement.getBoundingClientRect().top);
        if (currentIndex >= 0 && currentIndex < targets.length - 1) {
          scrollToTarget(targets[currentIndex + 1]);
          return;
        }
        // The next message is below the mounted rows.
        const { virtual: currentVirtual, navigationTargetPositions: targetPositions } = latestRef.current;
        if (!currentVirtual.isWindowed) return;
        const position = firstAtOrAbove(targetPositions, currentVirtual.end);
        if (position >= 0) scrollToRow(position);
      },
    };
  }, [resolveScrollElement]);

  useImperativeHandle(navigationRef, () => ({ previous: navigation.previous, next: navigation.next }), [navigation]);

  // Report the arrows' state on scroll and whenever the rows change.
  const reportedNavigationRef = useRef<MessageListNavigationState | null>(null);
  const reportNavigationState = useCallback(() => {
    const report = latestRef.current.onNavigationStateChange;
    if (!report) return;
    const next = navigation.state();
    const previous = reportedNavigationRef.current;
    if (previous && previous.canNavigateUp === next.canNavigateUp && previous.canNavigateDown === next.canNavigateDown) {
      return;
    }
    reportedNavigationRef.current = next;
    report(next);
  }, [navigation]);
  useEffect(() => {
    reportNavigationState();
  }, [messages, virtual.start, virtual.end, reportNavigationState]);
  useEffect(() => {
    if (!onNavigationStateChange) return;
    const scrollElement = resolveScrollElement();
    if (!scrollElement) return;
    scrollElement.addEventListener("scroll", reportNavigationState, { passive: true });
    return () => scrollElement.removeEventListener("scroll", reportNavigationState);
  }, [onNavigationStateChange, resolveScrollElement, reportNavigationState]);

  const mountedRows = rows.slice(virtual.start, virtual.end);

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
            {stickyUserMessage?.content && (
              <span className={styles['sticky-user-message-text']}>
                {renderContentWithMentions(
                  stickyUserMessage.content.length > 200
                    ? stickyUserMessage.content.slice(0, 200) + "…"
                    : stickyUserMessage.content,
                  knownPathsSet,
                  onMentionFileOpen,
                )}
              </span>
            )}
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
            {!minimal && systemPrompt && (
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
      <div
        ref={rowsReference}
        className={rows.length === 0 ? `${styles['rows']} ${styles['rows-empty']}` : styles['rows']}
        style={
          virtual.isWindowed
            ? { paddingTop: virtual.paddingTop, paddingBottom: virtual.paddingBottom }
            : undefined
        }
      >
        {/* eslint-disable-next-line react-hooks/refs -- the last commit's row keys (the usePrevious pattern): a row mounting with one is not new */}
        {mountedRows.map((row, offset) => {
          const position = virtual.start + offset;
          const { index } = row;
          const message = displayMessages[index];
          const coalesce = coalesceMeta[index];
          const group = message.deleted ? deletedGroups.get(index) ?? null : null;
          const showModelChange = swapBefore[index];
          const isFadedSwap =
            showModelChange && index > 0 && !!displayMessages[index - 1].deleted && !!message.deleted;
          const isStreaming =
            (isGenerating && message.role === "assistant" && index === displayMessages.length - 1) ||
            (message.role === "assistant" && message._liveStreaming === true);
          return (
            <RowFrame
              key={`${listKey}:${index}`}
              rowKey={row.key}
              position={position}
              isNew={!previousRowKeysRef.current.has(row.key)}
              measureRow={virtual.measureRow}
            >
              <MessageRow
                message={message}
                index={index}
                group={group}
                isExpanded={!!group && expandedDeletedSet.has(index)}
                showModelChange={showModelChange}
                isFadedSwap={isFadedSwap}
                isContinuation={!!coalesce?.isContinuation}
                isLastInGroup={coalesce?.isLastInGroup !== false}
                isStreaming={isStreaming}
                isAvatarLive={message.role === "assistant" && isGenerating && index === messages.length - 1}
                isEditing={editingIndex === index}
                planProposal={
                  rowShowsPlan(message, planProposal, index === messages.length - 1) ? planProposal ?? null : null
                }
                streamingOutputs={
                  !group && hasStreamingOutput(message, streamingOutputs) ? streamingOutputs ?? null : null
                }
                subAgentToolActivity={
                  subAgentToolActivity && readsSubAgentActivity(group ? group.messages : [message])
                    ? subAgentToolActivity
                    : null
                }
                priorToolMediaKey={group ? "" : priorToolMediaKey(displayMessages, index)}
                shared={shared}
              />
            </RowFrame>
          );
        })}
      </div>
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
