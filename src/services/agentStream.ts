/**
 * The agent chat's transport: every way a conversation's turn events reach
 * the chat, behind one kind of async iterator.
 *
 *   - `openTurnStream` — the SSE the chat drives itself (POST /agent, /chat);
 *   - `watchConversation` — the live-viewer WebSocket (`/ws/chat`) for a turn
 *     driven elsewhere: another tab or device, a scheduled run, a sub-agent;
 *   - `followTurn` — the same socket, following a turn THIS client drove
 *     after its SSE dropped, until the turn ends.
 *
 * Each is an `AgentStream`: `for await (const item of stream)` receives
 * `AgentStreamItem`s in wire order, and `close()` ends the iteration. An
 * `event` item is a `TurnEvent` that passed the protocol parser
 * (protocolEvents.ts), with its durations normalized, and that the
 * conversation's event cursor (utils/liveTurnCursor) had not seen: the SSE
 * advances the cursor as it reads, and a socket resubscribes with `afterSeq`
 * and drops the replayed frames at or below it — so a turn that moves from
 * one transport to another never repeats an event.
 *
 * The SSE is read on demand: the next network chunk is requested only once
 * the consumer has taken every event of the previous one.
 */

import { PRISM_SERVICE_URL, PRISM_WEBSOCKET_URL } from "@/config";
import { HEADER_PROFILE_ID, HTTP_METHODS } from "@/constants";
import { IDENTITY_HEADERS, SERVER_SENT_EVENT_TYPES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { StreamEvent, TurnEvent } from "../types/types";
import { getErrorMessage } from "../utils/errorMessage";
import { cursorFor } from "../utils/liveTurnCursor";
import {
  openLiveViewerSocket,
  type LiveSocketState,
  type LiveViewerSocketOptions,
  type SubscribedInfo,
} from "./liveViewerSocket";
import { parseStreamEvent, type StreamProtocol } from "./protocolEvents";
import { getBaseHeaders } from "./serviceHeaders";
import { reportViewerVisibility } from "./viewerVisibility";

export type AgentStreamItem =
  /** One accepted turn event. */
  | { kind: "event"; event: TurnEvent }
  /** Socket transports: the connection moved to `state`. */
  | { kind: "connection"; state: LiveSocketState }
  /** Socket transports: a (re)subscribe was acknowledged. */
  | { kind: "subscribed"; info: SubscribedInfo }
  /**
   * `watchConversation`: a RE-subscribe found the service holding no events
   * for the conversation (it restarted while the socket was down), so the
   * turn being watched is gone — the stored document says how it ended.
   */
  | { kind: "turn-lost" };

export interface AgentStream extends AsyncIterable<AgentStreamItem> {
  /** Stop: abort the request or close the socket. The iteration then ends. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Server-sent events
// ---------------------------------------------------------------------------

/** No bytes for this long ends an SSE as stalled (the server pings well inside it). */
export const STALL_TIMEOUT_MILLISECONDS = 120_000;

/**
 * The SSE ended without the server sending a terminal `done` / `error`:
 * network EOF (a crash mid-turn, a proxy timeout) or a stalled socket. The
 * turn may still be running server-side. The message is the one the chat's
 * recovery has always matched on.
 */
export class StreamClosedError extends Error {
  readonly reason: "eof-without-done" | "stalled";

  constructor(reason: "eof-without-done" | "stalled") {
    super(`SSE network stream closed early (${reason})`);
    this.name = "StreamClosedError";
    this.reason = reason;
  }
}

export interface ServerSentEventsOptions {
  method?: string;
  body?: unknown;
  /** Which stream this is (protocolEvents.ts): its frames are parsed as that stream's events. */
  protocol?: StreamProtocol;
  /**
   * Advance this conversation's event cursor as events arrive, so a later
   * socket for the same conversation resubscribes with `afterSeq` and drops
   * whatever this stream already delivered.
   */
  cursorConversationId?: string;
  /** Aborting ends the iteration quietly (no error). */
  signal?: AbortSignal;
}

/**
 * The server emits tool durations as `durationMs` or `durationMilliseconds`
 * depending on the code path; give both the envelope and a nested `tool`
 * the canonical `durationMs`. Mutates and returns the event.
 */
export function normalizeStreamEvent<Event extends StreamEvent>(event: Event): Event {
  const normalizeDuration = (fields: Record<string, unknown> | undefined) => {
    if (!fields) return;
    if (fields.durationMs == null && typeof fields.durationMilliseconds === "number") {
      fields.durationMs = fields.durationMilliseconds;
    }
  };
  normalizeDuration(event as Record<string, unknown>);
  normalizeDuration((event as { tool?: Record<string, unknown> }).tool);
  return event;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("The stream was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Parse one SSE line into an event: `data: {json}` frames only, `:`
 * comments (heartbeats) and malformed JSON skipped.
 */
function parseDataLine(line: string, protocol: StreamProtocol): StreamEvent | null {
  if (!line.startsWith("data: ")) return null;
  const json = line.slice(6);
  if (!json) return null;
  try {
    const parsed = parseStreamEvent(JSON.parse(json), protocol);
    if (!parsed) return null; // not an event of this stream — logged by the parser
    const event = normalizeStreamEvent(parsed);
    if (event.type === "tool_execution" || event.type === "toolCall") {
      const toolName = event.type === "tool_execution" ? event.tool.name : event.name;
      console.debug(
        `[SSE dispatch] type=${event.type} status=${event.status || ""} tool=${toolName || ""} (${json.length}ch)`,
      );
    } else if (event.type === "done" || event.type === "error") {
      console.debug(`[SSE dispatch] type=${event.type} (${json.length}ch)`);
    }
    return event;
  } catch (parseError: unknown) {
    console.warn(
      `[agentStream] SSE JSON parse failed (${json.length} chars):`,
      getErrorMessage(parseError),
      json.slice(0, 200),
    );
    return null;
  }
}

/**
 * Read an SSE response as parsed events, in order.
 *
 * - Throws the server's message on an HTTP error, and when the response has
 *   no body.
 * - Throws `StreamClosedError` when the body ends (or stalls past
 *   `STALL_TIMEOUT_MILLISECONDS`) before a `done` / `error` event.
 * - Ends quietly when `signal` aborts.
 */
export async function* serverSentEvents(
  endpoint: string,
  {
    method = HTTP_METHODS.POST,
    body,
    protocol = "turn",
    cursorConversationId,
    signal,
  }: ServerSentEventsOptions = {},
): AsyncGenerator<StreamEvent, void, undefined> {
  const cursor = cursorConversationId ? cursorFor(cursorConversationId) : null;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abortFromCaller);
  // A body reader that ignores the signal must not keep an aborted stream
  // waiting on its next read.
  const aborted = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) reject(abortError());
    else controller.signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
  aborted.catch(() => {});

  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let stalled = false;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, STALL_TIMEOUT_MILLISECONDS);
  };

  let sawTerminalEvent = false;
  const acceptedEvents = (lines: string[]): StreamEvent[] => {
    const events: StreamEvent[] = [];
    for (const rawLine of lines) {
      // Tolerate CRLF line endings; skip `:` comment (heartbeat) frames.
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith(":")) continue;
      const event = parseDataLine(line, protocol);
      if (!event) continue;
      if (event.type === SERVER_SENT_EVENT_TYPES.DONE || event.type === SERVER_SENT_EVENT_TYPES.ERROR) {
        sawTerminalEvent = true;
      }
      if (cursor && !cursor.accept(event)) continue; // already delivered
      events.push(event);
    }
    return events;
  };

  try {
    const response = await Promise.race([
      fetch(`${PRISM_SERVICE_URL}${endpoint}`, {
        method,
        headers: getBaseHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      }),
      aborted,
    ]);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    if (!response.body) throw new Error("SSE response has no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    armStallTimer();
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      armStallTimer();
      if (done) {
        // A final event without a terminating newline would otherwise be lost.
        buffer += decoder.decode();
        if (buffer.length > 0) yield* acceptedEvents(buffer.split("\n"));
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep the incomplete line
      yield* acceptedEvents(lines);
    }
    if (!sawTerminalEvent) {
      console.warn(`[SSE] stream closed without done/error event`);
      throw new StreamClosedError("eof-without-done");
    }
  } catch (error: unknown) {
    if (isAbortError(error)) {
      if (!stalled) return; // the caller aborted
      console.warn(
        `[SSE] no bytes received for ${STALL_TIMEOUT_MILLISECONDS / 1000}s — treating stream as stalled`,
      );
      throw new StreamClosedError("stalled");
    }
    throw error;
  } finally {
    clearTimeout(stallTimer);
    signal?.removeEventListener("abort", abortFromCaller);
    controller.abort(); // a consumer that stopped early releases the request
  }
}

/**
 * The SSE of a turn this chat drives: `/agent` (the agentic loop) or
 * `/chat` (direct chat). `/agent` advances the conversation's event cursor.
 * Iterating throws what `serverSentEvents` throws, a server `error` event
 * arrives as an event; `close()` (the user's Stop) ends it quietly.
 */
export function openTurnStream(
  endpoint: "/agent" | "/chat",
  body: { conversationId?: string } & Record<string, unknown>,
): AgentStream {
  const controller = new AbortController();
  const events = serverSentEvents(endpoint, {
    body,
    signal: controller.signal,
    ...(endpoint === "/agent" && body.conversationId
      ? { cursorConversationId: body.conversationId }
      : {}),
  });
  return {
    close: () => controller.abort(),
    async *[Symbol.asyncIterator]() {
      for await (const event of events) {
        yield { kind: "event", event: event as TurnEvent };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The live socket
// ---------------------------------------------------------------------------

/**
 * The `/ws/chat` URL with this client's identity, or null when no WebSocket
 * URL is configured. Browsers cannot set headers on a WebSocket upgrade, so
 * identity and profile travel as query parameters (mirrored server-side).
 */
export function liveSocketUrl(): string | null {
  if (!PRISM_WEBSOCKET_URL) return null;
  const headers = getBaseHeaders();
  const parameters = new URLSearchParams({
    project: headers[IDENTITY_HEADERS.project] || "any",
    username: headers[IDENTITY_HEADERS.username] || "anonymous",
  });
  if (headers[HEADER_PROFILE_ID]) parameters.set("profileId", headers[HEADER_PROFILE_ID]);
  return `${PRISM_WEBSOCKET_URL}/ws/chat?${parameters.toString()}`;
}

/**
 * A `createSocket` for openLiveViewerSocket that keeps the service told
 * whether this page is visible on every (re)connected socket — a viewer
 * that never reports counts as watching, and the conversation's "needs
 * you" push would be held back. `stop` ends the reporting for good.
 */
export function visibilityReportingSockets(): {
  createSocket: (_url: string) => WebSocket;
  stop: () => void;
} {
  let stopReporting: (() => void) | null = null;
  return {
    createSocket: (socketUrl) => {
      stopReporting?.();
      const websocket = new WebSocket(socketUrl);
      stopReporting = reportViewerVisibility(websocket);
      return websocket;
    },
    stop: () => {
      stopReporting?.();
      stopReporting = null;
    },
  };
}

/**
 * Items pushed by a callback source, pulled by one `for await`. `end()`
 * finishes the iteration once the queued items are taken.
 */
function itemQueue<Item>() {
  const queued: Item[] = [];
  let waiting: ((_result: IteratorResult<Item>) => void) | null = null;
  let isEnded = false;
  return {
    push(item: Item) {
      if (isEnded) return;
      if (waiting) {
        const resolveNext = waiting;
        waiting = null;
        resolveNext({ done: false, value: item });
      } else {
        queued.push(item);
      }
    },
    end() {
      if (isEnded) return;
      isEnded = true;
      if (waiting) {
        const resolveNext = waiting;
        waiting = null;
        resolveNext({ done: true, value: undefined });
      }
    },
    iterator(onReturn: () => void): AsyncIterator<Item> {
      return {
        next: () => {
          const item = queued.shift();
          if (item !== undefined) return Promise.resolve({ done: false, value: item });
          if (isEnded) return Promise.resolve({ done: true, value: undefined });
          return new Promise((resolveNext) => {
            waiting = resolveNext;
          });
        },
        return: () => {
          onReturn();
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
}

type SocketHooks = Pick<LiveViewerSocketOptions, "onEvent" | "onSubscribed" | "onStateChange">;

/**
 * Open the reconnecting socket for a conversation, with visibility
 * reporting. Its events are normalized exactly as the SSE's are.
 */
function openConversationSocket(conversationId: string, { onEvent, ...hooks }: SocketHooks) {
  const sockets = visibilityReportingSockets();
  const socket = openLiveViewerSocket({
    url: liveSocketUrl(),
    conversationId,
    cursor: cursorFor(conversationId),
    createSocket: sockets.createSocket,
    onEvent: (event) => onEvent(normalizeStreamEvent(event)),
    ...hooks,
  });
  return {
    socket,
    close() {
      socket.close();
      sockets.stop();
    },
  };
}

/**
 * Watch a conversation's live events. Runs until `close()`: it survives
 * drops (reconnecting from the cursor) and turn boundaries. Without a
 * WebSocket URL it yields one `connection: "unconfigured"` and waits.
 */
export function watchConversation(conversationId: string): AgentStream {
  const queue = itemQueue<AgentStreamItem>();
  if (!liveSocketUrl()) {
    console.warn("[agentStream] No WebSocket URL configured — live streaming unavailable");
  }
  const connection = openConversationSocket(conversationId, {
    onStateChange: (state) => queue.push({ kind: "connection", state }),
    onEvent: (event) => queue.push({ kind: "event", event }),
    onSubscribed: (info) => {
      console.debug(
        `[agentStream] Live subscription ${info.isReconnect ? "resumed" : "confirmed"} for conversation ${conversationId} (lastSeq=${info.lastSeq}, replayed=${info.replayedCount}, dropped=${info.droppedCount})`,
      );
      queue.push({ kind: "subscribed", info });
      if (info.isReconnect && !info.lastSeq && info.replayedCount === 0) {
        queue.push({ kind: "turn-lost" });
      }
    },
  });
  const close = () => {
    connection.close();
    queue.end();
  };
  return { close, [Symbol.asyncIterator]: () => queue.iterator(close) };
}

export type FollowOutcome =
  /** The turn's `done` / `error` arrived. */
  | "done"
  | "error"
  /** A subscribe found the server no longer running it. */
  | "ended"
  /** No WebSocket URL: nothing to follow (the caller falls back to polling). */
  | "unconfigured"
  | "timeout";

export interface FollowedTurn extends AgentStream {
  /** How the follow ended; settles when the iteration does. */
  readonly outcome: Promise<FollowOutcome>;
}

/**
 * Follow a turn THIS client was driving after its SSE dropped: resubscribe
 * from the event cursor (the SSE's own mark, so nothing repeats) and yield
 * what arrives until the turn ends. A subscribe that replays nothing asks
 * `isTurnRunning` whether there is anything left to wait for.
 */
export function followTurn(
  conversationId: string,
  {
    isTurnRunning,
    timeoutMilliseconds,
  }: { isTurnRunning: () => Promise<boolean>; timeoutMilliseconds: number },
): FollowedTurn {
  const queue = itemQueue<AgentStreamItem>();
  let settleOutcome: (_outcome: FollowOutcome) => void = () => {};
  const outcome = new Promise<FollowOutcome>((resolveOutcome) => {
    settleOutcome = resolveOutcome;
  });
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let connection: { close(): void } | null = null;
  let finishedWith: FollowOutcome | null = null;
  const finish = (result: FollowOutcome) => {
    if (finishedWith) return;
    finishedWith = result;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    connection?.close();
    queue.end();
    settleOutcome(result);
  };

  const opened = openConversationSocket(conversationId, {
    onStateChange: (state) => queue.push({ kind: "connection", state }),
    onEvent: (event) => {
      queue.push({ kind: "event", event });
      if (event.type === SERVER_SENT_EVENT_TYPES.DONE) finish("done");
      else if (event.type === SERVER_SENT_EVENT_TYPES.ERROR) finish("error");
    },
    onSubscribed: (info) => {
      queue.push({ kind: "subscribed", info });
      if (!info.lastSeq && info.replayedCount === 0) {
        finish("ended"); // the server holds no events for it: it restarted
        return;
      }
      if (info.replayedCount === 0) {
        // Nothing missed — still running, or finished with its buffer
        // already retired. The document says which.
        isTurnRunning()
          .then((isRunning) => {
            if (!isRunning) finish("ended");
          })
          .catch(() => {});
      }
    },
  });
  connection = opened;
  if (finishedWith) opened.close();
  else if (opened.socket.state() === "unconfigured") finish("unconfigured");
  else timeoutTimer = setTimeout(() => finish("timeout"), timeoutMilliseconds);

  const close = () => finish("ended");
  return { outcome, close, [Symbol.asyncIterator]: () => queue.iterator(close) };
}
