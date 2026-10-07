/**
 * Reconnecting transport for a conversation's live event stream
 * (`/ws/chat` `subscribe`).
 *
 * A dropped socket reconnects with exponential backoff and jitter and
 * resubscribes with `afterSeq` = the cursor's mark, so the server replays
 * only what was missed; replayed frames at or below the mark are dropped
 * here (liveTurnCursor semantics). With no WebSocket URL configured the
 * socket never opens and reports "unconfigured" — the chat shows a banner.
 *
 * `socketUrlFor` turns the URL into the one an attempt opens — the chat's
 * puts the user's token on it, a fresh one for every reconnect (a browser
 * cannot set an Authorization header on a WebSocket, nor see why an
 * upgrade was refused).
 */

import type { LiveTurnCursor, SubscribedAckSummary } from "../utils/liveTurnCursor";
import type { TurnEvent } from "../types/types";
import { parseStreamEvent } from "./protocolEvents";

export type LiveSocketState =
  /** No WebSocket URL is configured — live streaming is unavailable. */
  | "unconfigured"
  | "connecting"
  /** Subscribed; events flow. */
  | "live"
  /** Dropped; the next attempt is scheduled. */
  | "reconnecting"
  /** Closed by its owner. */
  | "closed";

export interface ReconnectBackoff {
  initialMilliseconds: number;
  maxMilliseconds: number;
  factor: number;
}

export const DEFAULT_RECONNECT_BACKOFF: ReconnectBackoff = {
  initialMilliseconds: 500,
  maxMilliseconds: 15_000,
  factor: 2,
};

/**
 * Delay before reconnect attempt `attempt` (0-based): exponential, capped,
 * with "equal jitter" — half fixed, half random — so a server restart does
 * not bring every viewer back in the same instant.
 */
export function reconnectDelayMilliseconds(
  attempt: number,
  backoff: ReconnectBackoff = DEFAULT_RECONNECT_BACKOFF,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(
    backoff.maxMilliseconds,
    backoff.initialMilliseconds * backoff.factor ** attempt,
  );
  return ceiling / 2 + random() * (ceiling / 2);
}

export interface SubscribedInfo extends SubscribedAckSummary {
  /** False for the first subscribe, true for every resubscribe after a drop. */
  isReconnect: boolean;
  /** The cursor mark this subscribe sent as `afterSeq` (undefined: it sent none). */
  afterSeq: number | undefined;
}

type WebSocketLike = Pick<WebSocket, "send" | "close" | "readyState"> & {
  onopen: ((_event: Event) => void) | null;
  onmessage: ((_event: MessageEvent) => void) | null;
  onerror: ((_event: Event) => void) | null;
  onclose: ((_event: CloseEvent) => void) | null;
};

export interface LiveViewerSocketOptions {
  /** Full socket URL, or null/undefined when none is configured. */
  url: string | null | undefined;
  /**
   * The URL one connection attempt opens, from `url` — asked before every
   * attempt (`isReconnect` after the first). A rejection counts as a failed
   * attempt: backoff, then try again.
   */
  socketUrlFor?: (_url: string, _attempt: { isReconnect: boolean }) => Promise<string>;
  conversationId: string;
  cursor: LiveTurnCursor;
  /** Every accepted (not replay-duplicate) event, in order. */
  onEvent: (_event: TurnEvent) => void;
  onSubscribed?: (_info: SubscribedInfo) => void;
  onStateChange?: (_state: LiveSocketState) => void;
  backoff?: ReconnectBackoff;
  random?: () => number;
  createSocket?: (_url: string) => WebSocketLike;
}

export interface LiveViewerSocket {
  state(): LiveSocketState;
  close(): void;
}

const CLOSED_READY_STATES = new Set([2, 3]); // CLOSING, CLOSED

export function openLiveViewerSocket({
  url,
  socketUrlFor,
  conversationId,
  cursor,
  onEvent,
  onSubscribed,
  onStateChange,
  backoff = DEFAULT_RECONNECT_BACKOFF,
  random = Math.random,
  createSocket = (socketUrl) => new WebSocket(socketUrl) as WebSocketLike,
}: LiveViewerSocketOptions): LiveViewerSocket {
  let state: LiveSocketState = "connecting";
  let socket: WebSocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let failedAttempts = 0;
  let attempts = 0;
  let hasSubscribed = false;
  let isClosedByOwner = false;

  const setState = (next: LiveSocketState) => {
    if (next === state) return;
    state = next;
    onStateChange?.(next);
  };

  const scheduleReconnect = () => {
    if (isClosedByOwner || reconnectTimer) return;
    setState("reconnecting");
    const delay = reconnectDelayMilliseconds(failedAttempts, backoff, random);
    failedAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (isClosedByOwner || !url) return;
    const isReconnect = attempts > 0;
    attempts += 1;
    if (!socketUrlFor) {
      open(url);
      return;
    }
    socketUrlFor(url, { isReconnect }).then(
      (socketUrl) => {
        if (!isClosedByOwner) open(socketUrl);
      },
      (urlError: unknown) => {
        console.warn("[liveViewerSocket] no URL to connect with:", urlError);
        scheduleReconnect();
      },
    );
  };

  const open = (socketUrl: string) => {
    let attemptSocket: WebSocketLike;
    try {
      attemptSocket = createSocket(socketUrl);
    } catch (connectionError: unknown) {
      console.warn("[liveViewerSocket] could not open a WebSocket:", connectionError);
      scheduleReconnect();
      return;
    }
    socket = attemptSocket;
    // The mark this attempt subscribes from, for its ack.
    let subscribedAfterSeq: number | undefined;

    attemptSocket.onopen = () => {
      if (isClosedByOwner || socket !== attemptSocket) return;
      const afterSeq = cursor.afterSeq();
      subscribedAfterSeq = afterSeq;
      attemptSocket.send(
        JSON.stringify({
          type: "subscribe",
          conversationId,
          ...(afterSeq !== undefined ? { afterSeq } : {}),
        }),
      );
    };

    attemptSocket.onmessage = (messageEvent: MessageEvent) => {
      if (isClosedByOwner || socket !== attemptSocket) return;
      let frame: unknown;
      try {
        frame = JSON.parse(messageEvent.data as string);
      } catch (parseError: unknown) {
        console.warn("[liveViewerSocket] unparseable frame:", parseError);
        return;
      }
      const data = parseStreamEvent(frame, "turn");
      if (!data || data.type === "hello") return; // unknown type (logged), or the connection's greeting
      if (data.type === "subscribed") {
        const summary = cursor.noteSubscribed(data);
        const isReconnect = hasSubscribed;
        hasSubscribed = true;
        failedAttempts = 0;
        setState("live");
        onSubscribed?.({ ...summary, isReconnect, afterSeq: subscribedAfterSeq });
        return;
      }
      if (!cursor.accept(data)) return; // replayed duplicate
      onEvent(data);
    };

    // onclose always follows an error; reconnect from there.
    attemptSocket.onerror = () => {};

    attemptSocket.onclose = () => {
      if (isClosedByOwner || socket !== attemptSocket) return;
      socket = null;
      scheduleReconnect();
    };
  };

  if (!url) {
    state = "unconfigured";
    onStateChange?.("unconfigured");
  } else {
    onStateChange?.("connecting");
    connect();
  }

  return {
    state: () => state,
    close() {
      if (isClosedByOwner) return;
      isClosedByOwner = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const closingSocket = socket;
      socket = null;
      if (closingSocket && !CLOSED_READY_STATES.has(closingSocket.readyState)) {
        closingSocket.close();
      }
      if (state !== "unconfigured") setState("closed");
    },
  };
}
