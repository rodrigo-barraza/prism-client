/**
 * Event cursor for a conversation's live stream.
 *
 * Every streamed event MAY carry `seq: number` — monotonic per conversation
 * on the server (seeded at Date.now(), so values are large integers; never
 * assume they start at 1). The client keeps the highest `seq` it has
 * accepted per conversation, sends it as `afterSeq` on every (re)subscribe,
 * and drops any event whose `seq` is at or below that mark.
 *
 * Replay semantics (service contract, branch harness-next): the
 * `{type:"subscribed", lastSeq, replayedCount, droppedCount}` ack arrives
 * BEFORE the replayed events, and `lastSeq` is the conversation's NEWEST
 * seq — every replayed frame that follows carries `seq <= lastSeq`. The
 * cursor therefore never adopts `lastSeq`: it dedupes replay frames only
 * against the mark it held before subscribing (the `afterSeq` it sent) and
 * advances as each accepted event arrives, replayed or live. `lastSeq` is
 * kept as information only (e.g. to know when the replay has caught up).
 *
 * Events without a `seq` are always accepted — the existing content-compare
 * dedupe heuristics in the consumers stay as the fallback for those.
 */

/** Any stream event: the cursor only reads its `seq`. */
export type CursorEventLike = object;

/** The `subscribed` ack, read defensively (numbers are checked, not trusted). */
export interface SubscribedAckLike {
  lastSeq?: unknown;
  replayedCount?: unknown;
  droppedCount?: unknown;
}

export interface SubscribedAckSummary {
  /** Server's newest seq at subscribe time — informational, never adopted. */
  lastSeq: number | undefined;
  replayedCount: number;
  droppedCount: number;
  /** True when the server could not replay everything since `afterSeq`. */
  truncated: boolean;
}

export interface LiveTurnCursor {
  /** True when the event has no usable `seq` or its `seq` is past the mark. */
  shouldAccept(_event: CursorEventLike): boolean;
  /** Advance the mark to this event's `seq` (no-op without one / if behind). */
  remember(_event: CursorEventLike): void;
  /** `shouldAccept` + `remember` in one step; returns whether to process it. */
  accept(_event: CursorEventLike): boolean;
  /** The mark to send as `afterSeq` — undefined before any event was seen. */
  afterSeq(): number | undefined;
  /** Record the ack. Does NOT move the cursor. Returns a normalised summary. */
  noteSubscribed(_ack: SubscribedAckLike): SubscribedAckSummary;
  /** Newest seq reported by the last ack (informational). */
  serverLastSeq(): number | undefined;
  /** Whether the last ack reported dropped (unreplayable) events. */
  wasTruncated(): boolean;
  /** Forget everything — next subscribe sends no `afterSeq`. */
  reset(): void;
}

function readSeq(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function createCursor(initialAfterSeq?: number): LiveTurnCursor {
  let mark: number | undefined = readSeq(initialAfterSeq);
  let lastAckSeq: number | undefined;
  let truncated = false;

  const shouldAccept = (event: CursorEventLike): boolean => {
    const seq = readSeq((event as { seq?: unknown } | undefined)?.seq);
    if (seq === undefined) return true;
    if (mark === undefined) return true;
    return seq > mark;
  };

  const remember = (event: CursorEventLike): void => {
    const seq = readSeq((event as { seq?: unknown } | undefined)?.seq);
    if (seq === undefined) return;
    if (mark === undefined || seq > mark) mark = seq;
  };

  return {
    shouldAccept,
    remember,
    accept(event) {
      if (!shouldAccept(event)) return false;
      remember(event);
      return true;
    },
    afterSeq: () => mark,
    noteSubscribed(ack) {
      lastAckSeq = readSeq(ack?.lastSeq);
      const droppedCount = readCount(ack?.droppedCount);
      truncated = droppedCount > 0;
      return {
        lastSeq: lastAckSeq,
        replayedCount: readCount(ack?.replayedCount),
        droppedCount,
        truncated,
      };
    },
    serverLastSeq: () => lastAckSeq,
    wasTruncated: () => truncated,
    reset() {
      mark = undefined;
      lastAckSeq = undefined;
      truncated = false;
    },
  };
}

/* -- Per-conversation registry ---------------------------------------
 * Module-level so the driving SSE and a later viewer WebSocket for the
 * same conversation share one mark: after the SSE closes, the WebSocket
 * resubscribes with `afterSeq` and the server replays only what was missed.
 */
const cursors = new Map<string, LiveTurnCursor>();

export function cursorFor(conversationId: string): LiveTurnCursor {
  let cursor = cursors.get(conversationId);
  if (!cursor) {
    cursor = createCursor();
    cursors.set(conversationId, cursor);
  }
  return cursor;
}

export function forgetCursor(conversationId: string): void {
  cursors.delete(conversationId);
}

/** Test hook — drop every remembered cursor. */
export function resetAllCursors(): void {
  cursors.clear();
}
