"use client";

/**
 * One row of the message list: a message bubble, a run of deleted messages,
 * a sub-agent notification or a fired schedule — and the "Model Swap"
 * divider before it.
 *
 * Memoized: a row renders again only when its own props change. A streamed
 * token replaces the last message only, so it renders the last row only.
 * Everything the rows share (the view flags, the handlers) comes in one
 * `shared` object that changes when those do, never per token.
 */

import React, { memo, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Trash2,
  Pencil,
  RotateCcw,
  RefreshCw,
  Undo2,
  AlertTriangle,
  User,
  Bot,
  Terminal,
  Zap,
  History,
  GitBranch,
} from "lucide-react";
import {
  CopyButtonComponent,
  IconButtonComponent,
  MarkdownContentComponent as MarkdownContent,
  StreamingCursorComponent,
  splitStreamingTail,
} from "@rodrigo-barraza/components-library";
import type { ToolDisplayMetadata } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import ToolCallsBlockComponent from "../ToolCallsBlockComponent";
import { ToolResultView } from "../ToolResultRenderers";
import { getResultDisplay, substituteToolOutputTokens } from "../ToolResultRenderers/utils";
import CitationsComponent from "../CitationsComponent";
import AudioPlayerRecorderComponent from "../AudioPlayerRecorderComponent";
import BadgeComponent, { type ClientAgent } from "../BadgeComponent";
import { renderAgentIcon } from "../AgentPickerComponent";
import SubAgentNotificationComponent from "../SubAgentNotificationComponent";
import PlanCardComponent from "../PlanCardComponent";
import styles from "../MessageListComponent.module.css";
import {
  resolveTurnInput,
  turnInputAuthorLabel,
  turnInputBadgeLabel,
} from "../../utils/turnInputRouting";
import PrismService from "../../services/PrismService";
import { APPROVAL_STATUS, isLocalProvider, resolveProviderBaseType } from "../../constants";
import { getTotalInputTokens } from "../../utils/utilities";
import { noteMessageRowRender } from "../../utils/chatDebugProbe";
import type { ContentSegment, Message, ToolCallEvent } from "../../types/types";
import type { SubAgentToolActivityItem } from "../MessageListComponent";
import type { DeletedMessageGroup } from "./messageRows";
import {
  EditableMessage,
  FileAttachmentChip,
  MediaPreview,
  ThinkingBlock,
  formatMessageTime,
  getMimeCategory,
  parseTaskNotification,
  splitRawContent,
} from "./MessageRowParts";

export interface PlanProposalView {
  plan: string;
  steps?: string[];
  status?: "pending" | "approved" | "rejected" | "executing";
}

/** What a row does, by the message's display index. Stable for the list's life. */
export interface MessageRowActions {
  edit: (_index: number, _content: string) => void;
  rerun: (_index: number) => void;
  delete: (_index: number) => void;
  restore: (_index: number) => void;
  rewind: (_index: number) => void;
  fork: (_index: number) => void;
  toggleEditing: (_index: number) => void;
  cancelEditing: () => void;
  toggleDeletedGroup: (_index: number) => void;
  openImage: (_url: string) => void;
  openDocument: (_url: string) => void;
  /** The ref a user message's bubble registers under (the pinned-header tracker). */
  userMessageRef: (_index: number) => (_element: HTMLDivElement | null) => void;
}

/** Shared by every row; a new object only when one of these changes. */
export interface MessageRowShared {
  readOnly: boolean;
  minimal: boolean;
  showRaw: boolean;
  isGenerating: boolean;
  knownPaths: Set<string> | null;
  activeAgent: ClientAgent | null | undefined;
  toolDisplayMetadataMap: Record<string, ToolDisplayMetadata> | null | undefined;
  canEdit: boolean;
  canRerun: boolean;
  canRestore: boolean;
  canRewind: boolean;
  canFork: boolean;
  /** Absent when the list was given none: a badge then opens nothing. */
  onMentionFileOpen: ((_path: string) => void) | undefined;
  onOpenFileInViewer: ((_absolutePath: string) => void) | undefined;
  onPlanApprove: (() => void) | undefined;
  onPlanReject: (() => void) | undefined;
  actions: MessageRowActions;
}

export interface MessageRowProps {
  message: Message;
  /** The message's display index: what every action reports. */
  index: number;
  /** A run of deleted messages this row stands for (its first member is `message`). */
  group: DeletedMessageGroup | null;
  isExpanded: boolean;
  showModelChange: boolean;
  isFadedSwap: boolean;
  isContinuation: boolean;
  isLastInGroup: boolean;
  isStreaming: boolean;
  /** The avatar pulses: the reply being generated. */
  isAvatarLive: boolean;
  isEditing: boolean;
  /** The plan, for the row that shows its card; null for every other row. */
  planProposal: PlanProposalView | null;
  /** Live tool output, for a row whose tool calls have some; null otherwise. */
  streamingOutputs: Map<string, string> | null;
  /** Live sub-agent activity, for a row with a coordinator tool call; null otherwise. */
  subAgentToolActivity: Record<string, SubAgentToolActivityItem> | null;
  /** See messageRows.priorToolMediaKey. */
  priorToolMediaKey: string;
  shared: MessageRowShared;
}

function ModelSwapDivider({ isFaded }: { isFaded: boolean }) {
  const className = `${styles['model-change-divider']} ${isFaded ? styles['model-change-divider-faded'] : ""}`.trim();
  return (
    <div className={className}>
      <span className={styles['model-change-line']} />
      <span className={styles['model-change-label']}>
        <RefreshCw size={11} />
        Model Swap
      </span>
      <span className={styles['model-change-line']} />
    </div>
  );
}

function roleClassOf(message: Message): string {
  return message.role === "user"
    ? styles['user-node']
    : message.role === "system"
      ? styles['system-node']
      : styles['assistant-node'];
}

/** Open an image in the lightbox, a PDF or text file in the document viewer. */
function mediaClickHandler(rawUrl: string, actions: MessageRowActions): (() => void) | undefined {
  const resolvedUrl = PrismService.getFileUrl(rawUrl);
  const category = getMimeCategory(rawUrl);
  if (category === "image") return () => actions.openImage(resolvedUrl);
  if (category === "pdf" || category === "text") return () => actions.openDocument(resolvedUrl);
  return undefined;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* -- Deleted messages: a run collapsed into one row ------------------- */

function DeletedMessageGroupRow({
  group,
  isExpanded,
  index,
  subAgentToolActivity,
  shared,
}: {
  group: DeletedMessageGroup;
  isExpanded: boolean;
  index: number;
  subAgentToolActivity: Record<string, SubAgentToolActivityItem> | null;
  shared: MessageRowShared;
}) {
  const { actions, minimal, canRestore, onOpenFileInViewer, toolDisplayMetadataMap } = shared;
  const message = group.messages[0];
  const groupCount = group.messages.length;

  if (!isExpanded) {
    // -- Collapsed: single summary row --
    return (
      <div className={styles['deleted-layout-row']}>
        <button className={styles['deleted-toggle']} onClick={() => actions.toggleDeletedGroup(index)}>
          <ChevronRight size={13} />
          <span className={styles['deleted-badge']}>
            Deleted{groupCount > 1 ? ` (${groupCount})` : ""}
          </span>
          {groupCount === 1 && (
            <>
              <BadgeComponent variant="info" mini tooltip="Message role">
                {message.role === "user" ? "User" : "Model"}
              </BadgeComponent>
              {message.model && <BadgeComponent type="model" models={[message.model]} mini />}
              {message.timestamp && <BadgeComponent type="dateTime" date={message.timestamp} />}
              {message.content && (
                <span className={styles['deleted-preview']}>
                  {message.content.length > 80 ? message.content.slice(0, 80) + "…" : message.content}
                </span>
              )}
            </>
          )}
          {groupCount > 1 && (
            <>
              <BadgeComponent type="dateTime" date={group.messages[0].timestamp} />
              <span style={{ opacity: 0.5 }}>—</span>
              <BadgeComponent type="dateTime" date={group.messages[groupCount - 1].timestamp} />
            </>
          )}
        </button>
        {groupCount === 1 && canRestore && (
          <div className={styles['deleted-actions']}>
            <IconButtonComponent
              icon={<Undo2 size={14} />}
              onClick={() => actions.restore(index)}
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
        <button className={styles['deleted-toggle']} onClick={() => actions.toggleDeletedGroup(index)}>
          <ChevronDown size={13} />
          <span className={styles['deleted-badge']}>
            Deleted{groupCount > 1 ? ` (${groupCount})` : ""}
          </span>
        </button>
      </div>
      {group.messages.map((groupMessage, position) => {
        const memberIndex = group.indices[position];
        return (
          <React.Fragment key={memberIndex}>
            {group.innerSwap[position] && <ModelSwapDivider isFaded />}
            <div className={styles['deleted-group-item']}>
              <div className={styles['deleted-group-item-header']}>
                <BadgeComponent variant="info" mini tooltip="Message role">
                  {groupMessage.role === "user" ? "User" : "Model"}
                </BadgeComponent>
                {groupMessage.model && <BadgeComponent type="model" models={[groupMessage.model]} mini />}
                {groupMessage.timestamp && <BadgeComponent type="dateTime" date={groupMessage.timestamp} />}
                <div className={styles['deleted-actions']} style={{ opacity: 1 }}>
                  {canRestore && (
                    <IconButtonComponent
                      icon={<Undo2 size={14} />}
                      onClick={() => actions.restore(memberIndex)}
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
                <div className={`${styles['message']} ${roleClassOf(groupMessage)}`}>
                  <div className={`${styles['avatar']} ${styles['deleted-avatar']}`}>
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
                        thinkingDurationSeconds={groupMessage.thinkingDurationSeconds}
                        minimal={minimal}
                      />
                    )}
                    {groupMessage.toolCalls &&
                      groupMessage.toolCalls.length > 0 &&
                      groupMessage.toolCalls.map((singleToolCall: ToolCallEvent, toolCallIndex: number) => (
                        <ToolCallsBlockComponent
                          key={`group-tool-${toolCallIndex}`}
                          toolCall={singleToolCall}
                          subAgentToolActivity={subAgentToolActivity}
                          onOpenFileInViewer={onOpenFileInViewer}
                          toolDisplayMetadataMap={toolDisplayMetadataMap}
                          minimal={minimal}
                        />
                      ))}
                    {groupMessage.images && groupMessage.images.length > 0 && (
                      <div className={styles['image-preview-layout-row']}>
                        {groupMessage.images.map((rawUrl: string, imageIndex: number) => (
                          <MediaPreview
                            key={imageIndex}
                            dataUrl={rawUrl}
                            onClick={mediaClickHandler(rawUrl, actions)}
                          />
                        ))}
                      </div>
                    )}
                    {groupMessage.content ? <MarkdownContent content={groupMessage.content} /> : null}
                    {!minimal &&
                      groupMessage.role === "assistant" &&
                      (groupMessage.usage || groupMessage.provider) && (
                        <div className={styles['meta-badges']}>
                          {groupMessage.provider && (
                            <BadgeComponent type="providers" providers={[groupMessage.provider]} />
                          )}
                          {groupMessage.model && <BadgeComponent type="model" models={[groupMessage.model]} />}
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
}

/* -- A bubble's header: who, when, and the actions -------------------- */

function MessageHeader({
  message,
  index,
  isEditing,
  shared,
}: {
  message: Message;
  index: number;
  isEditing: boolean;
  shared: MessageRowShared;
}) {
  const { actions, readOnly, isGenerating, activeAgent, canRerun, canRewind, canFork } = shared;
  const turnInput = message.role === "user" ? resolveTurnInput(message) : null;
  const formattedTime = formatMessageTime(message.timestamp);
  return (
    <div className={styles['message-header']}>
      <div className={styles['role-label']}>
        {message.role === "user"
          ? turnInputAuthorLabel(turnInput)
          : message.role === "system"
            ? "System"
            : activeAgent?.name || "Model"}
        {turnInput && (() => {
          const isSettled = turnInput.status === "applied" || !turnInput.status;
          return (
            <span
              className={`${styles['turn-input-badge']} ${isSettled ? "" : styles['turn-input-badge-pending']}`}
              title={turnInput.boundary ? `Applied at ${turnInput.boundary.replace(/_/g, " ")}` : undefined}
            >
              {isSettled ? <Zap size={11} /> : <Clock size={11} />}
              {turnInputBadgeLabel(turnInput)}
            </span>
          );
        })()}
        {formattedTime && (
          <span className={styles['message-timestamp']} title={formattedTime.fullDateTime}>
            {formattedTime.shortTime}
          </span>
        )}
      </div>
      {!readOnly && (
        <div className={styles['message-actions']}>
          {message.role === "user" && (
            <>
              <IconButtonComponent
                icon={<Pencil size={14} />}
                onClick={() => actions.toggleEditing(index)}
                disabled={isGenerating}
                tooltip="Edit message"
                aria-pressed={isEditing}
                className={styles['action-button']}
              />
              {canRerun && (
                <IconButtonComponent
                  icon={<RotateCcw size={14} />}
                  onClick={() => actions.rerun(index)}
                  disabled={isGenerating}
                  tooltip="Rerun this turn"
                  className={styles['action-button']}
                />
              )}
            </>
          )}
          {message.role === "assistant" && message.content && (
            <IconButtonComponent
              icon={<Pencil size={14} />}
              onClick={() => actions.toggleEditing(index)}
              disabled={isGenerating}
              tooltip="Edit response"
              aria-pressed={isEditing}
              className={styles['action-button']}
            />
          )}
          {message.content && (
            <CopyButtonComponent text={message.content} tooltip="Copy raw text" className={styles['action-button']} />
          )}
          {canRewind && (
            <IconButtonComponent
              icon={<History size={14} />}
              onClick={() => actions.rewind(index)}
              disabled={isGenerating || !message.id}
              tooltip={message.id ? "Rewind to here…" : "Rewind — available once saved"}
              className={styles['action-button']}
            />
          )}
          {canFork && (
            <IconButtonComponent
              icon={<GitBranch size={14} />}
              onClick={() => actions.fork(index)}
              disabled={isGenerating || !message.id}
              tooltip={message.id ? "Fork from here" : "Fork — available once saved"}
              className={styles['action-button']}
            />
          )}
          <IconButtonComponent
            icon={<Trash2 size={14} />}
            onClick={() => actions.delete(index)}
            disabled={isGenerating}
            tooltip="Delete message"
            variant="destructive"
            className={styles['action-button']}
          />
        </div>
      )}
      {readOnly && message.content && (
        <div className={styles['message-actions']}>
          <CopyButtonComponent text={message.content} tooltip="Copy raw text" className={styles['action-button']} />
        </div>
      )}
    </div>
  );
}

/* -- Interleaved content: thinking + tool calls + text ---------------- */

function MessageSegments({
  message,
  segments,
  index,
  isStreaming,
  isEditing,
  planProposal,
  streamingOutputs,
  subAgentToolActivity,
  shared,
}: {
  message: Message;
  segments: ContentSegment[];
  index: number;
  isStreaming: boolean;
  isEditing: boolean;
  planProposal: PlanProposalView | null;
  streamingOutputs: Map<string, string> | null;
  subAgentToolActivity: Record<string, SubAgentToolActivityItem> | null;
  shared: MessageRowShared;
}) {
  const { actions, minimal, canEdit, knownPaths, onMentionFileOpen, onOpenFileInViewer, toolDisplayMetadataMap } = shared;
  const hasThinking = segments.some((segment) => segment.type === "thinking");
  // Dedup guard: track tool IDs already rendered to prevent
  // the same tool call from appearing in multiple segments
  const renderedToolIds = new Set();

  // Only the block currently being generated stays open:
  // the last tool call of the final segment, and only while
  // this message is streaming. Once a newer block or the
  // text response starts (or streaming ends), every tool
  // block collapses unless the user opened it manually.
  const latestOpenToolId = (() => {
    if (!isStreaming) return null;
    const lastSegment = segments[segments.length - 1];
    if (lastSegment?.type !== "tools") return null;
    const ids = lastSegment.toolIds || [];
    return ids[ids.length - 1] ?? null;
  })();

  // Helper: render a segment by type
  const renderSegment = (
    segment: ContentSegment,
    segmentIndex: number,
    options: { isLastText?: boolean; insideThinking?: boolean; suppressCursor?: boolean } = {},
  ) => {
    if (segment.type === "thinking") {
      const fragment = message.thinkingFragments?.[segment.fragmentIndex ?? 0]?.trim();
      if (!fragment) return null;
      return <MarkdownContent key={`seg-k-${segmentIndex}`} content={fragment} />;
    }
    if (segment.type === "tools" && message.toolCalls && message.toolCalls.length > 0) {
      const toolIdSet = new Set(segment.toolIds || []);
      const segmentTools = message.toolCalls.filter((toolCall: ToolCallEvent) => {
        if (!toolIdSet.has(toolCall.id)) return false;
        if (renderedToolIds.has(toolCall.id)) return false;
        renderedToolIds.add(toolCall.id);
        return true;
      });
      if (segmentTools.length === 0) return null;
      return segmentTools.map((singleToolCall: ToolCallEvent, toolCallIndex: number) => (
        <ToolCallsBlockComponent
          key={`seg-t-${segmentIndex}-${toolCallIndex}`}
          toolCall={singleToolCall}
          streamingOutputs={streamingOutputs}
          subAgentToolActivity={subAgentToolActivity}
          isAutoCollapsed={singleToolCall.id == null || singleToolCall.id !== latestOpenToolId}
          onOpenFileInViewer={onOpenFileInViewer}
          toolDisplayMetadataMap={toolDisplayMetadataMap}
          minimal={minimal}
        />
      ));
    }
    if (segment.type === "text") {
      const rawFragment = message.textFragments?.[segment.fragmentIndex ?? 0]?.trim();
      const fragmentText = rawFragment ? substituteToolOutputTokens(rawFragment, message.toolCalls) : rawFragment;
      const isLastTextSegment = !!options.isLastText;
      const showCursor = !options.insideThinking && !options.suppressCursor;
      const cursorActive = isStreaming && isLastTextSegment && showCursor;
      if (fragmentText) {
        const { body, token } = cursorActive ? splitStreamingTail(fragmentText) : { body: fragmentText, token: "" };
        return (
          <MarkdownContent
            key={`seg-x-${segmentIndex}`}
            content={body}
            className={cursorActive ? styles['streaming-text'] : ""}
          >
            {cursorActive && <StreamingCursorComponent active token={token} />}
          </MarkdownContent>
        );
      }
      if (cursorActive) {
        return <StreamingCursorComponent key={`seg-x-${segmentIndex}`} active standalone />;
      }
      return null;
    }
    if (segment.type === "plan" && planProposal) {
      return (
        <PlanCardComponent
          key={`seg-p-${segmentIndex}`}
          planText={planProposal.plan}
          steps={planProposal.steps}
          status={planProposal.status}
          onApprove={shared.onPlanApprove}
          onReject={shared.onPlanReject}
        />
      );
    }
    if (segment.type === "audio") {
      const audioList = Array.isArray(message.audio) ? message.audio : message.audio ? [message.audio] : [];
      const audioReference = audioList[segment.fragmentIndex ?? 0];
      if (!audioReference) return null;
      return (
        <div key={`seg-a-${segmentIndex}`} className={styles['image-preview-layout-row']}>
          <MediaPreview dataUrl={audioReference} />
        </div>
      );
    }
    if (segment.type === "image") {
      const imageReference = message.images?.[segment.fragmentIndex ?? 0];
      if (!imageReference) return null;
      return (
        <div key={`seg-i-${segmentIndex}`} className={styles['image-preview-layout-row']}>
          <MediaPreview dataUrl={imageReference} onClick={mediaClickHandler(imageReference, actions)} />
        </div>
      );
    }
    return null;
  };

  // Edit mode: show reasoning then editable text
  if (message.role === "assistant" && canEdit && isEditing) {
    const nonThinking = segments.filter((segment) => segment.type !== "thinking");
    return (
      <>
        {hasThinking &&
          segments
            .filter((segment) => segment.type === "thinking")
            .map((segment, segmentIndex) => (
              <ThinkingBlock
                key={`edit-think-${segmentIndex}`}
                isStreaming={false}
                thinking={message.thinkingFragments?.[segment.fragmentIndex ?? 0]}
                thinkingDurationSeconds={message.thinkingDurationSeconds}
                minimal={minimal}
              />
            ))}
        {nonThinking.map((segment, segmentIndex) => renderSegment(segment, segmentIndex))}
        <EditableMessage
          key="seg-edit"
          content={message.content}
          index={index}
          role="assistant"
          onEdit={actions.edit}
          editing={true}
          onCancelEdit={actions.cancelEditing}
          knownPaths={knownPaths}
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
    const lastSegment = segments[segments.length - 1];

    // Find the last text segment index for streaming cursor.
    // The cursor only attaches to text while text is the
    // final segment — once a tool call (or anything else)
    // starts after it, the cursor moves below that block.
    let lastTextSegmentIndex = -1;
    for (let position = segments.length - 1; position >= 0; position--) {
      if (segments[position].type === "text") {
        lastTextSegmentIndex = position;
        break;
      }
    }
    const cursorOnText = lastTextSegmentIndex === segments.length - 1;

    // Track whether any non-thinking content exists
    const hasVisibleContent = segments.some((segment) => segment.type !== "thinking");

    // Find the last thinking segment — the streaming cursor
    // should attach to this one (not the absolute last segment)
    // so intermediate thinking blocks remain visible during
    // multi-iteration agentic flows.
    let lastThinkingSegmentIndex = -1;
    for (let position = segments.length - 1; position >= 0; position--) {
      if (segments[position].type === "thinking") {
        lastThinkingSegmentIndex = position;
        break;
      }
    }

    return (
      <>
        {segments.map((segment, segmentIndex) => {
          if (segment.type === "thinking") {
            const isLastThinkingSegment = segmentIndex === lastThinkingSegmentIndex;
            const isThinkingStreaming = isStreaming && isLastThinkingSegment && segment === lastSegment;
            return (
              <ThinkingBlock
                key={`think-${segmentIndex}`}
                isStreaming={isThinkingStreaming}
                streamKeepVisible={isStreaming && isLastThinkingSegment}
                thinking={message.thinkingFragments?.[segment.fragmentIndex ?? 0]}
                thinkingDurationSeconds={message.thinkingDurationSeconds}
                minimal={minimal}
              />
            );
          }
          const isLastText = cursorOnText && segmentIndex === lastTextSegmentIndex;
          return (
            <React.Fragment key={`vis-${segmentIndex}`}>
              {renderSegment(segment, segmentIndex, { isLastText })}
            </React.Fragment>
          );
        })}
        {/* Streaming cursor when no visible content yet,
            or below the trailing non-text block (e.g. a
            tool call being generated/executed) */}
        {isStreaming &&
          (!hasVisibleContent ||
            (lastSegment && lastSegment.type !== "text" && lastSegment.type !== "thinking")) && (
            <StreamingCursorComponent active standalone />
          )}
      </>
    );
  }

  // No thinking — render all segments inline (tools interleaved with text)
  // Find the last text segment to place streaming cursor.
  // The cursor only stays attached to text while text is
  // the final segment — once a tool call (or other block)
  // follows it, the cursor renders standalone below.
  let lastTextIndex = -1;
  for (let position = segments.length - 1; position >= 0; position--) {
    if (segments[position].type === "text") {
      lastTextIndex = position;
      break;
    }
  }
  const trailingSegment = segments[segments.length - 1];
  const textIsLast = lastTextIndex === segments.length - 1;
  return (
    <>
      {segments.map((segment, segmentIndex) =>
        renderSegment(segment, segmentIndex, { isLastText: textIsLast && segmentIndex === lastTextIndex }),
      )}
      {isStreaming && trailingSegment && trailingSegment.type !== "text" && (
        <StreamingCursorComponent active standalone />
      )}
    </>
  );
}

/* -- Structural render path: a message without segments --------------- */

function StreamingMarkdown({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const { body, token } = isStreaming ? splitStreamingTail(content) : { body: content, token: "" };
  return (
    <MarkdownContent content={body} className={isStreaming ? styles['streaming-text'] : ""}>
      {isStreaming && <StreamingCursorComponent active token={token} />}
    </MarkdownContent>
  );
}

function MessageStructuredBody({
  message,
  index,
  isStreaming,
  isEditing,
  streamingOutputs,
  subAgentToolActivity,
  shared,
}: {
  message: Message;
  index: number;
  isStreaming: boolean;
  isEditing: boolean;
  streamingOutputs: Map<string, string> | null;
  subAgentToolActivity: Record<string, SubAgentToolActivityItem> | null;
  shared: MessageRowShared;
}) {
  const { actions, minimal, showRaw, canEdit, knownPaths, onMentionFileOpen, onOpenFileInViewer, toolDisplayMetadataMap } =
    shared;
  return (
    <>
      {/* Structural render path: this branch handles all user messages
          (inline editing / raw view / mentions, below) and any message that
          has no contentSegments. The thinking + tool-call blocks additionally
          cover assistant messages persisted before contentSegments existed. */}
      {/* Thinking block (segment-less assistant messages) */}
      {message.thinking && (
        <ThinkingBlock
          thinking={message.thinking}
          isStreaming={isStreaming && !!message.thinking && !message.content}
          thinkingDurationSeconds={message.thinkingDurationSeconds}
          minimal={minimal}
        />
      )}

      {/* Tool calls (persisted conversations without segments) */}
      {message.toolCalls &&
        message.toolCalls.length > 0 &&
        message.toolCalls.map((singleToolCall: ToolCallEvent, toolCallIndex: number) => (
          <ToolCallsBlockComponent
            key={`fallback-tool-${toolCallIndex}`}
            toolCall={singleToolCall}
            streamingOutputs={streamingOutputs}
            subAgentToolActivity={subAgentToolActivity}
            isAutoCollapsed={
              // Only the latest tool call stays open, and only
              // while streaming with no text response yet
              !isStreaming || !!message.content || toolCallIndex !== message.toolCalls!.length - 1
            }
            onOpenFileInViewer={onOpenFileInViewer}
            toolDisplayMetadataMap={toolDisplayMetadataMap}
            minimal={minimal}
          />
        ))}

      {/* Text content */}
      {message.role === "user" && canEdit ? (
        <EditableMessage
          content={message.content}
          index={index}
          role="user"
          onEdit={actions.edit}
          editing={isEditing}
          onCancelEdit={actions.cancelEditing}
          knownPaths={knownPaths}
          onMentionFileOpen={onMentionFileOpen}
          showRaw={showRaw}
        />
      ) : message.role === "assistant" && canEdit && isEditing ? (
        <EditableMessage
          content={message.content}
          index={index}
          role="assistant"
          onEdit={actions.edit}
          editing={true}
          onCancelEdit={actions.cancelEditing}
          knownPaths={knownPaths}
          onMentionFileOpen={onMentionFileOpen}
        />
      ) : message.role === "user" && showRaw ? (
        (() => {
          const { prefix, rest } = splitRawContent(message.content);
          if (prefix) {
            return (
              <div className={styles['text']}>
                <div className={styles['raw-prefix']}>{prefix}</div>
                <StreamingMarkdown content={rest} isStreaming={isStreaming} />
              </div>
            );
          }
          return <StreamingMarkdown content={message.content} isStreaming={isStreaming} />;
        })()
      ) : message.content ? (
        <StreamingMarkdown
          content={substituteToolOutputTokens(message.content, message.toolCalls)}
          isStreaming={isStreaming}
        />
      ) : isStreaming ? (
        <StreamingCursorComponent active standalone />
      ) : null}
    </>
  );
}

/* -- Tool results with a visual, below the prose ---------------------- */

function MessageToolVisuals({ message }: { message: Message }) {
  if (message.role !== "assistant" || !message.toolCalls || message.toolCalls.length === 0) return null;
  // A tool result renders inline when it carries
  // self-describing `display` metadata — except media
  // already rendered inline at its true position:
  // images promoted to message.images (media row
  // below), and audio covered by inline audio
  // segments. During streaming every tool clip also
  // arrives as an `audio` SSE event that renders an
  // inline player right after its tool chip, so
  // repeating it here would pile every clip up at
  // the bottom of the in-flight message.
  const messageImageUrls = new Set(message.images || []);
  const hasInlineAudioSegments = !!message.contentSegments?.some((segment) => segment.type === "audio");
  const visualToolCalls = message.toolCalls.filter((toolCall: ToolCallEvent) => {
    const display = getResultDisplay(toolCall.result);
    if (!display) return false;
    // "code" stays in the tool card — the reply text
    // already carries the substituted verbatim copy.
    if (display.kind === "code") return false;
    if (display.kind === "image" && messageImageUrls.has(display.url)) return false;
    if (display.kind === "audio" && hasInlineAudioSegments) return false;
    return true;
  });
  if (visualToolCalls.length === 0) return null;
  return visualToolCalls.map((toolCall: ToolCallEvent, toolCallIndex: number) => (
    <div key={`visual-${toolCall.id || toolCallIndex}`}>
      <ToolResultView toolCall={toolCall} hideToggles={true} />
    </div>
  ));
}

/* -- Media, files, citations ------------------------------------------ */

function MessageMedia({
  message,
  priorToolMediaUrls,
  shared,
}: {
  message: Message;
  priorToolMediaUrls: ReadonlySet<string>;
  shared: MessageRowShared;
}) {
  const { actions, readOnly } = shared;
  const imageRow = (() => {
    // Images / media (skipped when already rendered inline via segments)
    if (!message.images || message.images.length === 0) return null;
    if (message.contentSegments?.some((segment) => segment.type === "image")) return null;
    // Skip media already rendered at its tool call's
    // position by an earlier message in this turn.
    const rowImages = message.images.filter((rawUrl) => !priorToolMediaUrls.has(rawUrl));
    if (rowImages.length === 0) return null;
    return (
      <div className={styles['image-preview-layout-row']}>
        {rowImages.map((rawUrl, imageIndex) => (
          <MediaPreview key={imageIndex} dataUrl={rawUrl} onClick={mediaClickHandler(rawUrl, actions)} />
        ))}
      </div>
    );
  })();

  const audioRow = (() => {
    // Audio (skipped when already rendered inline via segments)
    if (!message.audio) return null;
    if (message.contentSegments?.some((segment) => segment.type === "audio")) return null;
    // Same cross-message dedup as images above — plus
    // this message's OWN audio tool results, which the
    // visual-tool-result stack above already renders
    // with their descriptive header (Synth/TTS card).
    const skippedUrls = new Set(priorToolMediaUrls);
    for (const toolCall of message.toolCalls || []) {
      const display = getResultDisplay(toolCall.result);
      if (display?.kind === "audio") skippedUrls.add(display.url);
    }
    const rowAudio = (Array.isArray(message.audio) ? message.audio : [message.audio]).filter(
      (rawUrl) => !skippedUrls.has(rawUrl),
    );
    if (rowAudio.length === 0) return null;
    return (
      <div className={styles['image-preview-layout-row']}>
        {rowAudio.map((rawUrl, audioIndex) => (
          <MediaPreview key={`aud-${audioIndex}`} dataUrl={rawUrl} />
        ))}
      </div>
    );
  })();

  const videos = message.video ? (Array.isArray(message.video) ? message.video : [message.video]) : [];
  const pdfs = message.pdf ? (Array.isArray(message.pdf) ? message.pdf : [message.pdf]) : [];

  return (
    <>
      {imageRow}

      {/* Sources a grounded answer cited */}
      {message.role === "assistant" && message.citations && <CitationsComponent citations={message.citations} />}

      {/* Non-image file attachments (uploaded refs) */}
      {message.files && message.files.length > 0 && (
        <div className={styles['file-attachment-row']}>
          {message.files.map((attachedFile, fileIndex) => (
            <FileAttachmentChip key={`file-${fileIndex}`} file={attachedFile} />
          ))}
        </div>
      )}

      {/* Streaming audio (live conversation in progress) */}
      {!readOnly && message.role === "assistant" && message._liveStreaming && !message.audio && (
        <div className={styles['audio-card']}>
          <AudioPlayerRecorderComponent streaming compact />
        </div>
      )}

      {audioRow}

      {/* Video */}
      {videos.length > 0 && (
        <div className={styles['image-preview-layout-row']}>
          {videos.map((rawUrl, videoIndex) => (
            <MediaPreview key={`vid-${videoIndex}`} dataUrl={rawUrl} />
          ))}
        </div>
      )}

      {/* PDF */}
      {pdfs.length > 0 && (
        <div className={styles['image-preview-layout-row']}>
          {pdfs.map((rawUrl, pdfIndex) => {
            const resolvedUrl = PrismService.getFileUrl(rawUrl);
            return (
              <MediaPreview
                key={`pdf-${pdfIndex}`}
                dataUrl={rawUrl}
                onClick={() => actions.openDocument(resolvedUrl)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

/* -- Metadata badges -------------------------------------------------- */

function AssistantTokenBadges({ message }: { message: Message }) {
  if (message.usage?.inputTokens != null && message.usage?.outputTokens != null) {
    const cacheRead = message.usage.cacheReadInputTokens || 0;
    const cacheWrite = message.usage.cacheCreationInputTokens || 0;
    const cached = cacheRead + cacheWrite;
    const totalIn = getTotalInputTokens(message.usage);
    let inLabel = "in";
    if (cached) {
      const parts = [];
      if (message.usage.inputTokens) parts.push(`${message.usage.inputTokens.toLocaleString()} new`);
      if (cacheRead) parts.push(`${cacheRead.toLocaleString()} read`);
      if (cacheWrite) parts.push(`${cacheWrite.toLocaleString()} write`);
      inLabel = `in (${parts.join(" · ")})`;
    }
    const reasoning = message.usage?.reasoningOutputTokens || 0;
    let outLabel = "out";
    if (reasoning > 0) outLabel = `out (${reasoning.toLocaleString()} reasoning)`;
    return (
      <>
        <BadgeComponent type="tokens" value={totalIn} label={inLabel} />
        <BadgeComponent type="tokens" value={message.usage.outputTokens} label={outLabel} />
      </>
    );
  }
  if (message.usage?.outputTokens != null) {
    return <BadgeComponent type="tokens" value={message.usage.outputTokens} label="tokens" />;
  }
  return null;
}

function MessageMetaBadges({ message, isLastInGroup }: { message: Message; isLastInGroup: boolean }) {
  if ((message.role === "user" || message.role === "system") && message.content) {
    // User / system metadata
    return (
      <div className={styles['meta-badges']}>
        <BadgeComponent type="words" count={wordCount(message.content)} />
        <BadgeComponent type="tokens" value={Math.ceil(message.content.length / 4)} label="estimated" />
      </div>
    );
  }
  // Assistant metadata — only on the last message in a coalesced group
  if (message.role !== "assistant" || !isLastInGroup) return null;
  if (!message.usage && !message.audio && !message.provider) return null;
  return (
    <div className={styles['meta-badges']}>
      {message.provider && <BadgeComponent type="providers" providers={[message.provider]} />}
      {message.model && <BadgeComponent type="model" models={[message.model]} />}
      {message.voice && (
        <BadgeComponent variant="info" tooltip={`Voice: ${message.voice}`}>
          🔊 {message.voice}
        </BadgeComponent>
      )}
      <AssistantTokenBadges message={message} />
      {message.content && <BadgeComponent type="words" count={wordCount(message.content)} />}
      {message.totalTime != null && <BadgeComponent type="stopwatch" seconds={message.totalTime} />}
      {message.tokensPerSec && (
        <BadgeComponent variant="info" tooltip={`${message.tokensPerSec} tokens per second`}>
          {message.tokensPerSec} tok/s
        </BadgeComponent>
      )}
      {isLocalProvider(resolveProviderBaseType(message.provider ?? "")) ? (
        <BadgeComponent variant="success" tooltip="Free (local model)">
          $0
        </BadgeComponent>
      ) : message.estimatedCost ? (
        <BadgeComponent type="cost" cost={message.estimatedCost} />
      ) : null}
    </div>
  );
}

/* -- A message bubble ------------------------------------------------- */

function MessageBubble(props: MessageRowProps & { priorToolMediaUrls: ReadonlySet<string> }) {
  const {
    message,
    index,
    isContinuation,
    isLastInGroup,
    isStreaming,
    isAvatarLive,
    isEditing,
    planProposal,
    streamingOutputs,
    subAgentToolActivity,
    priorToolMediaUrls,
    shared,
  } = props;
  const { actions, minimal, activeAgent } = shared;
  const segments = message.contentSegments;
  return (
    <div
      ref={message.role === "user" ? actions.userMessageRef(index) : undefined}
      data-message-index={index}
      {...(!isContinuation ? { "data-navigation-target": "" } : {})}
      className={`${styles['message']} ${roleClassOf(message)}${isContinuation ? ` ${styles['continuation-message']}` : ""}`}
    >
      {/* Avatar: hidden for continuation messages */}
      {!isContinuation && (
        <div className={`${styles['avatar']}${isAvatarLive ? ` ${styles['prism-avatar']}` : ""}`}>
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
        {!isContinuation && <MessageHeader message={message} index={index} isEditing={isEditing} shared={shared} />}

        {segments && segments.length > 0 ? (
          <MessageSegments
            message={message}
            segments={segments}
            index={index}
            isStreaming={isStreaming}
            isEditing={isEditing}
            planProposal={planProposal}
            streamingOutputs={streamingOutputs}
            subAgentToolActivity={subAgentToolActivity}
            shared={shared}
          />
        ) : (
          <MessageStructuredBody
            message={message}
            index={index}
            isStreaming={isStreaming}
            isEditing={isEditing}
            streamingOutputs={streamingOutputs}
            subAgentToolActivity={subAgentToolActivity}
            shared={shared}
          />
        )}

        <MessageToolVisuals message={message} />

        <MessageMedia message={message} priorToolMediaUrls={priorToolMediaUrls} shared={shared} />

        {/* Error block */}
        {message.error && (
          <div className={styles['error-block']}>
            <AlertTriangle size={14} className={styles['error-icon']} />
            <span>{message.error}</span>
          </div>
        )}

        {!minimal && <MessageMetaBadges message={message} isLastInGroup={isLastInGroup} />}

        {/* Plan proposal card — fallback for non-segmented messages */}
        {planProposal &&
          message.role === "assistant" &&
          !message.contentSegments?.some((segment) => segment.type === "plan") && (
            <PlanCardComponent
              planText={planProposal.plan}
              steps={planProposal.steps}
              status={planProposal.status}
              onApprove={shared.onPlanApprove}
              onReject={shared.onPlanReject}
            />
          )}

        {/* Termination notice — surfaces why the agentic loop ended abnormally */}
        {message.role === "assistant" &&
          !isStreaming &&
          (message as unknown as { _terminationReason?: string })._terminationReason && (
            <div className={styles['termination-notice']}>
              <AlertTriangle size={14} />
              <span>{(message as unknown as { _terminationReason?: string })._terminationReason}</span>
            </div>
          )}
      </div>
    </div>
  );
}

const TIMER_PREFIXES = ["⏰ Reminder fired: ", "🔔 Notification: ", "🏮 Reminder fired: "];

function MessageRow(props: MessageRowProps) {
  const { message, index, group, showModelChange, isFadedSwap, priorToolMediaKey, shared } = props;
  // Test-only row-render counter (utils/chatDebugProbe).
  noteMessageRowRender(message, index);
  const priorToolMediaUrls = useMemo(
    () => new Set(priorToolMediaKey ? priorToolMediaKey.split("\n") : []),
    [priorToolMediaKey],
  );

  let body: React.ReactNode;
  if (group) {
    body = (
      <DeletedMessageGroupRow
        group={group}
        isExpanded={props.isExpanded}
        index={index}
        subAgentToolActivity={props.subAgentToolActivity}
        shared={shared}
      />
    );
  } else {
    // -- Task notification card (replaces user bubble for sub-agent results) --
    // Only renders for non-absorbed notifications (i.e. edge cases where
    // the matching team_create tool call isn't in the visible window).
    const taskNotification = message.role === "user" ? parseTaskNotification(message.content) : null;
    const isTimerFired =
      message.role === "user" &&
      typeof message.content === "string" &&
      TIMER_PREFIXES.some((prefix) => message.content.startsWith(prefix));
    if (taskNotification) {
      body = (
        <SubAgentNotificationComponent
          taskNotif={taskNotification}
          timestamp={message.timestamp}
          readOnly={shared.readOnly}
          onDelete={() => shared.actions.delete(index)}
        />
      );
    } else if (isTimerFired) {
      // -- Fired Timer Badge Rendering --
      const prompt = TIMER_PREFIXES.reduce((text, prefix) => text.replace(prefix, ""), message.content);
      body = (
        <div className={styles['schedule-fired-divider']}>
          <span className={styles['schedule-fired-line']} />
          <span className={styles['schedule-fired-label']}>Schedule Fired</span>
          <span className={styles['schedule-fired-line']} />
          <div className={styles['schedule-fired-details']}>
            {message.timestamp && <BadgeComponent type="dateTime" date={message.timestamp} />}
            <span className={styles['schedule-fired-prompt']}>{prompt}</span>
          </div>
        </div>
      );
    } else {
      body = <MessageBubble {...props} priorToolMediaUrls={priorToolMediaUrls} />;
    }
  }

  return (
    <>
      {showModelChange && <ModelSwapDivider isFaded={isFadedSwap} />}
      {body}
    </>
  );
}

export default memo(MessageRow);

/** Whether a plan card belongs in this row (see MessageRowProps.planProposal). */
export function rowShowsPlan(
  message: Message,
  planProposal: PlanProposalView | null | undefined,
  isLastSourceIndex: boolean,
): boolean {
  if (!planProposal || message.role !== "assistant") return false;
  if (message.contentSegments?.some((segment) => segment.type === "plan")) return true;
  return planProposal.status === APPROVAL_STATUS.PENDING
    ? isLastSourceIndex
    : !!message.toolCalls?.some((toolCall) => toolCall.name === TOOL_NAMES.EXIT_PLAN_MODE);
}
