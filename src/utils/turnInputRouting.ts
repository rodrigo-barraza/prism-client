/**
 * Pure decisions for the composer while a turn is running, and the
 * message-list bookkeeping for mid-turn inputs (`POST /agent/input`).
 *
 * Kept free of React so the rules are unit-testable:
 *  - which action the composer takes (send / update the running turn /
 *    queue for the next turn),
 *  - how a `/agent/input` response maps onto the optimistic bubble,
 *  - how a `turn_input` stream event (or its `turn_input_applied` status
 *    twin) lands on `messages`,
 *  - how persisted `<user-update>` / `<user-answer>` messages are told
 *    apart from task-notification cards and what they display.
 */
import { MESSAGE_ROLES } from "../constants";
import type {
  Message,
  MessageTurnInput,
  TurnInputBoundary,
  TurnInputKind,
} from "../types/types";

/* -- Composer decision ------------------------------------------------ */

export type ComposerSendMode = "update" | "queue";
export type ComposerAction = "send" | "update" | "queue";

export const DEFAULT_COMPOSER_SEND_MODE: ComposerSendMode = "update";

export function decideComposerAction(input: {
  isConversationRunning: boolean;
  mode: ComposerSendMode;
  /** Files ride MinIO + the next `/agent` body, never `/agent/input` → queue. */
  hasFiles?: boolean;
}): ComposerAction {
  if (!input.isConversationRunning) return "send";
  if (input.mode === "update" && !input.hasFiles) return "update";
  return "queue";
}

/* -- /agent/input response → what to do with the optimistic bubble ---- */

export type TurnInputResponse =
  | { ok: true; inputId: string; position?: number }
  | { ok: false; status: number; reason?: string };

export type TurnInputOutcome =
  | { action: "pending"; inputId: string }
  | { action: "queue"; toast: string }
  | { action: "reject"; toast: string };

export const NO_ACTIVE_TURN_TOAST = "No running turn — queued for next turn";

export function resolveTurnInputOutcome(response: TurnInputResponse): TurnInputOutcome {
  if (response.ok) return { action: "pending", inputId: response.inputId };
  if (response.status === 409) return { action: "queue", toast: NO_ACTIVE_TURN_TOAST };
  if (response.reason === "mailbox_full") {
    return { action: "reject", toast: "The agent's inbox is full — try again in a moment" };
  }
  if (response.reason === "empty_input") {
    return { action: "reject", toast: "Nothing to send" };
  }
  return {
    action: "reject",
    toast: `Could not send the update (${response.reason || `HTTP ${response.status}`})`,
  };
}

/* -- Persisted mid-turn messages -------------------------------------- */

const USER_AUTHORED_SOURCES: Record<string, TurnInputKind> = {
  "user-update": "user_update",
  "user-answer": "question_answer",
};

/** `_notificationSource` values that are the USER's own words, not a task card. */
export function isUserAuthoredNotificationSource(source: string | undefined | null): boolean {
  return !!source && source in USER_AUTHORED_SOURCES;
}

export function turnInputKindFromSource(source: string | undefined | null): TurnInputKind | null {
  return source ? USER_AUTHORED_SOURCES[source] ?? null : null;
}

/**
 * The bubble's turn-input record: the client-side `_turnInput` when present,
 * else one derived from a persisted `_notificationSource`.
 */
export function resolveTurnInput(
  message: Pick<Message, "_turnInput" | "_notificationSource">,
): MessageTurnInput | null {
  if (message._turnInput) return message._turnInput;
  const kind = turnInputKindFromSource(message._notificationSource);
  if (!kind) return null;
  return { id: "", kind, status: "applied" };
}

export function isTurnInputMessage(
  message: Pick<Message, "_turnInput" | "_notificationSource">,
): boolean {
  return resolveTurnInput(message) !== null;
}

const WRAPPER_TAG = /^\s*<(user-update|user-answer)>\s*([\s\S]*?)\s*<\/\1>\s*$/;

/** What a mid-turn bubble shows: the typed text, never the tag wrapper. */
export function turnInputDisplayText(
  message: Pick<Message, "content" | "rawContent">,
): string {
  if (message.rawContent) return message.rawContent;
  const content = message.content || "";
  const match = content.match(WRAPPER_TAG);
  return match ? match[2] : content;
}

export function turnInputBadgeLabel(turnInput: MessageTurnInput): string {
  if (turnInput.kind === "question_answer") return "Answer";
  if (turnInput.kind === "task_completion") return "Task result";
  if (turnInput.kind === "agent_message") return "Agent message";
  if (turnInput.status === "sending") return "Sending…";
  if (turnInput.status === "pending") return "Pending";
  if (typeof turnInput.iteration === "number") {
    return `Applied at step ${turnInput.iteration}`;
  }
  return "Applied mid-turn";
}

/* -- messages[] bookkeeping ------------------------------------------- */

export interface TurnInputApplied {
  id: string;
  kind: TurnInputKind;
  content: string;
  images?: string[];
  boundary?: TurnInputBoundary;
  iteration?: number;
  receivedAt?: string;
}

export function buildOptimisticTurnInputMessage(input: {
  tempId: string;
  text: string;
  images?: string[];
  kind?: TurnInputKind;
  now?: Date;
}): Message {
  const timestamp = (input.now ?? new Date()).toISOString();
  return {
    role: MESSAGE_ROLES.USER,
    content: input.text,
    rawContent: input.text,
    ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
    timestamp,
    _turnInput: {
      id: input.tempId,
      kind: input.kind ?? "user_update",
      status: "sending",
      receivedAt: timestamp,
    },
  };
}

/**
 * Where a new mid-turn user bubble goes. The DRIVING stream keeps its
 * in-flight assistant bubble LAST (every chunk handler patches
 * `messages[length-1]` when it is an assistant), so the driver inserts
 * the bubble just above it; a viewer appends and opens a fresh assistant
 * bubble for what follows. The finalize refresh restores the true order.
 */
export type TurnInputPlacement = "append" | "before-trailing-assistant";

export function insertTurnInputMessage<M extends Message>(
  messages: M[],
  message: M,
  placement: TurnInputPlacement = "append",
): M[] {
  const last = messages[messages.length - 1];
  if (
    placement === "before-trailing-assistant" &&
    last?.role === MESSAGE_ROLES.ASSISTANT &&
    !last.completedAt
  ) {
    return [...messages.slice(0, -1), message, last];
  }
  return [...messages, message];
}

/** Fallback when `/agent/answer` 404s: the answer becomes a plain message. */
export function answersToMessageText(
  answers: Array<{ answer: string | string[]; annotations?: string }>,
): string {
  return answers
    .map((entry) => {
      const answer = Array.isArray(entry.answer) ? entry.answer.join(", ") : entry.answer;
      return entry.annotations ? `${answer} (${entry.annotations})` : answer;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function findTurnInputIndex<M extends Message>(messages: M[], id: string): number {
  if (!id) return -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]._turnInput?.id === id) return index;
  }
  return -1;
}

/** Swap the local temp id for the server's `inputId`; sending → pending. */
export function attachTurnInputServerId<M extends Message>(
  messages: M[],
  tempId: string,
  inputId: string,
): M[] {
  const index = findTurnInputIndex(messages, tempId);
  if (index < 0) return messages;
  const current = messages[index]._turnInput!;
  const next = [...messages];
  next[index] = {
    ...messages[index],
    _turnInput: {
      ...current,
      id: inputId,
      status: current.status === "applied" ? "applied" : "pending",
    },
  };
  return next;
}

export function removeTurnInputMessage<M extends Message>(messages: M[], id: string): M[] {
  const index = findTurnInputIndex(messages, id);
  if (index < 0) return messages;
  return [...messages.slice(0, index), ...messages.slice(index + 1)];
}

/**
 * `status: turn_input_applied` — mark the matching bubble applied. Never
 * appends: the `turn_input` event is the one that carries the content.
 */
export function markTurnInputApplied<M extends Message>(
  messages: M[],
  inputId: string,
  where: { boundary?: TurnInputBoundary; iteration?: number },
): M[] {
  const index = findTurnInputIndex(messages, inputId);
  if (index < 0) return messages;
  const current = messages[index]._turnInput!;
  if (
    current.status === "applied" &&
    current.iteration === where.iteration &&
    current.boundary === where.boundary
  ) {
    return messages;
  }
  const next = [...messages];
  next[index] = {
    ...messages[index],
    _turnInput: { ...current, status: "applied", ...where },
  };
  return next;
}

/**
 * `turn_input` event — mark the optimistic bubble applied when one exists
 * (by id, else by an unapplied bubble with the same text: the 200 that
 * carries the server id can lose the race with the event), otherwise
 * append the event as a user bubble (viewer path / other tab / answers
 * and task completions the harness applied on its own).
 */
export function applyTurnInputEvent<M extends Message>(
  messages: M[],
  event: TurnInputApplied,
  placement: TurnInputPlacement = "append",
): M[] {
  let index = findTurnInputIndex(messages, event.id);
  if (index < 0) {
    for (let candidate = messages.length - 1; candidate >= 0; candidate -= 1) {
      const turnInput = messages[candidate]._turnInput;
      if (
        turnInput &&
        turnInput.status !== "applied" &&
        turnInput.kind === event.kind &&
        turnInputDisplayText(messages[candidate]) === event.content
      ) {
        index = candidate;
        break;
      }
    }
  }
  const where = { boundary: event.boundary, iteration: event.iteration };
  if (index >= 0) {
    const current = messages[index]._turnInput!;
    const next = [...messages];
    next[index] = {
      ...messages[index],
      _turnInput: { ...current, id: event.id, status: "applied", ...where },
    };
    return next;
  }
  const timestamp = event.receivedAt ?? new Date().toISOString();
  const appended: Message = {
    role: MESSAGE_ROLES.USER,
    content: event.content,
    rawContent: event.content,
    ...(event.images && event.images.length > 0 ? { images: event.images } : {}),
    timestamp,
    _turnInput: {
      id: event.id,
      kind: event.kind,
      status: "applied",
      receivedAt: timestamp,
      ...where,
    },
  };
  return insertTurnInputMessage(messages, appended as M, placement);
}
