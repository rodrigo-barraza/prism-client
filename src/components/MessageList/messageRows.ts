/**
 * The message list's rows, worked out from its messages.
 *
 * Everything here is pure, and what a row is given keeps its identity when
 * the row did not change: rows are memoized, and a streamed token changes
 * only the last message, so only the last row renders again.
 */

import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { Message, ToolCallEvent } from "../../types/types";
import { getCleanAndRaw } from "../../utils/messageHelpers";
import {
  isTurnInputMessage,
  isUserAuthoredNotificationSource,
  turnInputDisplayText,
} from "../../utils/turnInputRouting";
import { collectPriorToolDisplayUrls } from "../ToolResultRenderers/utils";
import { parseTeamToolResult } from "../ToolCallsBlock/SubAgentParsingUtils";

/* -- Task notification detection ─────────────────────────────
 * Sub-agent results, async task completions, and timer reminders
 * arrive as user-role messages with _notificationSource metadata.
 * For messages persisted before the metadata field existed,
 * fall back to content-based <task-notification> XML detection.  */

export function isNotificationMessage(message: Message): boolean {
  // Mid-turn steering updates / question answers are persisted with a
  // `_notificationSource` too ("user-update" | "user-answer"), but they
  // are the USER's own words — rendered as a user bubble, never a card.
  if (isUserAuthoredNotificationSource(message._notificationSource)) return false;
  if (message._turnInput) return false;
  if (message._notificationSource) return true;
  if (!message.content) return false;
  return message.content.includes("<task-notification>");
}

const cleanDisplayMessages = new WeakMap<Message, Message>();
const rawDisplayMessages = new WeakMap<Message, Message>();

/**
 * A message as the list shows it: a user message's text cleaned of the
 * server's context header (or raw, in the Raw view). The same message
 * yields the same object, so its row stays memoized.
 */
export function toDisplayMessage(message: Message, showRaw: boolean): Message {
  if (message.role !== "user") return message;
  const cache = showRaw ? rawDisplayMessages : cleanDisplayMessages;
  const cached = cache.get(message);
  if (cached) return cached;
  let content: string;
  if (isTurnInputMessage(message)) {
    content = showRaw ? message.content || "" : turnInputDisplayText(message);
  } else {
    const { clean, raw } = getCleanAndRaw(message.content || "", message.rawContent);
    content = showRaw ? raw : clean;
  }
  const displayMessage = { ...message, content };
  cache.set(message, displayMessage);
  return displayMessage;
}

export interface DisplayList {
  messages: Message[];
  /** `sourceIndices[i]` is messages[i]'s index in the list's `messages` prop. */
  sourceIndices: number[];
}

export function buildDisplayList(messages: readonly Message[], showRaw: boolean): DisplayList {
  const displayMessages: Message[] = [];
  const sourceIndices: number[] = [];
  messages.forEach((message, sourceIndex) => {
    if (!showRaw && message.role === "system") return;
    if (!showRaw && message.role === "user" && isNotificationMessage(message)) return;
    sourceIndices.push(sourceIndex);
    displayMessages.push(toDisplayMessage(message, showRaw));
  });
  return { messages: displayMessages, sourceIndices };
}

/** Where a "Model Swap" divider goes: before the turn whose reply changed model. */
export function modelSwapPositions(displayMessages: readonly Message[]): boolean[] {
  const swapBefore = new Array<boolean>(displayMessages.length).fill(false);
  let lastModel: string | null = null;
  let prospectiveSwapIndex: number | null = null;
  for (let index = 0; index < displayMessages.length; index++) {
    const message = displayMessages[index];
    if (message.role === "user") {
      // The start of the user's turn
      if (prospectiveSwapIndex === null) prospectiveSwapIndex = index;
    } else if (message.role === "assistant" && message.model) {
      if (lastModel && lastModel !== message.model) {
        // Model changed! Show swap before the user's turn that led to this,
        // or before this assistant message if no user message preceded it.
        swapBefore[prospectiveSwapIndex !== null ? prospectiveSwapIndex : index] = true;
      }
      lastModel = message.model;
      prospectiveSwapIndex = null;
    }
  }
  return swapBefore;
}

export interface CoalesceMeta {
  /** Continues the previous assistant message's bubble (no avatar or header). */
  isContinuation: boolean;
  /** Last message of its bubble: the metadata badges render here. */
  isLastInGroup: boolean;
}

/**
 * Consecutive assistant messages share one bubble: one avatar and header,
 * the metadata on the last. Deleted messages and model swaps break the run.
 */
export function coalesceAssistantRuns(
  displayMessages: readonly Message[],
  swapBefore: readonly boolean[],
): Array<CoalesceMeta | null> {
  const meta = new Array<CoalesceMeta | null>(displayMessages.length).fill(null);
  for (let index = 0; index < displayMessages.length; index++) {
    if (displayMessages[index].role !== "assistant") continue;
    // Deleted messages always break the coalesce chain —
    // they render as their own standalone block.
    if (displayMessages[index].deleted) {
      meta[index] = { isContinuation: false, isLastInGroup: true };
      continue;
    }
    const previousIsAssistant =
      index > 0 && displayMessages[index - 1].role === "assistant" && !displayMessages[index - 1].deleted;
    const nextIsAssistant =
      index < displayMessages.length - 1 &&
      displayMessages[index + 1].role === "assistant" &&
      !displayMessages[index + 1].deleted;
    meta[index] = {
      isContinuation: previousIsAssistant && !swapBefore[index],
      isLastInGroup: !nextIsAssistant || (index < displayMessages.length - 1 && swapBefore[index + 1]),
    };
  }
  return meta;
}

/** A run of consecutive deleted messages, rendered as one collapsible row. */
export interface DeletedMessageGroup {
  /** Display indices of the members. */
  indices: readonly number[];
  messages: readonly Message[];
  /** Per member: a "Model Swap" divider before it inside the expanded group. */
  innerSwap: readonly boolean[];
}

const deletedGroupsByLeader = new WeakMap<Message, DeletedMessageGroup>();

function sameMembers(group: DeletedMessageGroup, indices: number[], members: Message[], innerSwap: boolean[]): boolean {
  if (group.indices.length !== indices.length) return false;
  for (let position = 0; position < indices.length; position++) {
    if (
      group.indices[position] !== indices[position] ||
      group.messages[position] !== members[position] ||
      group.innerSwap[position] !== innerSwap[position]
    ) {
      return false;
    }
  }
  return true;
}

/** Each run of deleted messages, keyed by its first member's display index. */
export function deletedMessageGroups(
  displayMessages: readonly Message[],
  swapBefore: readonly boolean[],
): Map<number, DeletedMessageGroup> {
  const groups = new Map<number, DeletedMessageGroup>();
  let index = 0;
  while (index < displayMessages.length) {
    if (!displayMessages[index].deleted) {
      index++;
      continue;
    }
    const indices: number[] = [];
    while (index < displayMessages.length && displayMessages[index].deleted) {
      indices.push(index);
      index++;
    }
    const members = indices.map((memberIndex) => displayMessages[memberIndex]);
    const innerSwap = indices.map((memberIndex, position) => position > 0 && !!swapBefore[memberIndex]);
    const cached = deletedGroupsByLeader.get(members[0]);
    const group =
      cached && sameMembers(cached, indices, members, innerSwap)
        ? cached
        : { indices, messages: members, innerSwap };
    deletedGroupsByLeader.set(members[0], group);
    groups.set(indices[0], group);
  }
  return groups;
}

/**
 * Media the earlier messages of this turn already showed at their tool
 * call, which this message's own media row skips — as a string, so an
 * unchanged answer keeps the row memoized. Empty when the message shows no
 * media row.
 */
export function priorToolMediaKey(displayMessages: readonly Message[], index: number): string {
  const message = displayMessages[index];
  const hasImageRow =
    !!message.images?.length && !message.contentSegments?.some((segment) => segment.type === "image");
  const hasAudioRow = !!message.audio && !message.contentSegments?.some((segment) => segment.type === "audio");
  if (!hasImageRow && !hasAudioRow) return "";
  const urls = collectPriorToolDisplayUrls(displayMessages as Message[], index);
  return urls.size === 0 ? "" : [...urls].sort().join("\n");
}

const COORDINATOR_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.CREATE_SUBAGENTS,
  TOOL_NAMES.CREATE_SUBAGENT,
  TOOL_NAMES.SEND_SUBAGENT_MESSAGE,
  TOOL_NAMES.STOP_SUBAGENT,
]);

const readsSubAgentActivityCache = new WeakMap<ToolCallEvent, boolean>();

/**
 * Whether a tool call's block reads the live sub-agent activity: the
 * coordinator tools, and anything shaped like a team (a `members` argument,
 * a result listing agents). Every other block renders the same without it.
 */
function toolCallReadsSubAgentActivity(toolCall: ToolCallEvent): boolean {
  const cached = readsSubAgentActivityCache.get(toolCall);
  if (cached !== undefined) return cached;
  const reads =
    COORDINATOR_TOOL_NAMES.has(toolCall.name) ||
    Array.isArray((toolCall.args as { members?: unknown } | undefined)?.members) ||
    parseTeamToolResult(toolCall.result).some(
      (member) => !!member && typeof member === "object" && ("agent_id" in member || "toolUses" in member),
    );
  readsSubAgentActivityCache.set(toolCall, reads);
  return reads;
}

export function readsSubAgentActivity(messages: readonly Message[]): boolean {
  return messages.some((message) => message.toolCalls?.some(toolCallReadsSubAgentActivity));
}

export function hasStreamingOutput(message: Message, streamingOutputs: ReadonlyMap<string, string> | null | undefined): boolean {
  if (!streamingOutputs || streamingOutputs.size === 0 || !message.toolCalls) return false;
  return message.toolCalls.some((toolCall) => !!toolCall.id && streamingOutputs.has(toolCall.id));
}

/**
 * A row's height before it is measured, from what it holds. Only the
 * scrollbar and a jump to a row that has not been on screen use it —
 * the list corrects to the measured height as soon as the row mounts.
 */
export function estimateRowHeight(message: Message): number {
  const text = typeof message.content === "string" ? message.content : "";
  const lines = Math.ceil(text.length / 90) + (text.match(/\n/g)?.length ?? 0);
  let height = (message.role === "user" ? 64 : 72) + lines * 22;
  height += (message.toolCalls?.length ?? 0) * 44;
  height += (message.images?.length ?? 0) * 220;
  if (message.thinking) height += 44;
  return Math.min(Math.max(height, 56), 4_000);
}
