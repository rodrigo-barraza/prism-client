"use client";

/**
 * Next-turn queue for the chat composer.
 *
 * Input that cannot steer the running turn — attachments, or the composer's
 * "queue" send mode — waits here and goes out after the generation ends,
 * oldest first, one turn at a time. Each turn remembers the conversation it
 * was queued in and only drains there. `useNextTurnQueue` owns the state
 * (declared early, so the send paths can enqueue); `useNextTurnQueueDrain`
 * sends from it (declared after the send function exists).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
import type { PendingFileAttachment } from "../components/MessageListComponent";

export interface QueuedTurnPayload {
  text: string;
  images: string[];
  files?: PendingFileAttachment[];
}

export interface QueuedTurn extends QueuedTurnPayload {
  id: string;
  /** The conversation the turn was queued in. */
  conversationId: string;
}

export interface NextTurnQueue {
  /** Queued turns for the current conversation, oldest first. */
  items: QueuedTurn[];
  enqueue: (_payload: QueuedTurnPayload) => void;
  remove: (_id: string) => void;
}

export function useNextTurnQueue(conversationId: string): NextTurnQueue {
  const [queued, setQueued] = useState<QueuedTurn[]>([]);

  const enqueue = useCallback(
    (payload: QueuedTurnPayload) => {
      setQueued((previous) => [
        ...previous,
        { ...payload, id: generateUUID(), conversationId },
      ]);
    },
    [conversationId],
  );

  const remove = useCallback((id: string) => {
    setQueued((previous) => previous.filter((turn) => turn.id !== id));
  }, []);

  const items = useMemo(
    () => queued.filter((turn) => turn.conversationId === conversationId),
    [queued, conversationId],
  );

  return { items, enqueue, remove };
}

/**
 * Send the oldest queued turn whenever nothing is generating. `send` should
 * settle when the turn it started has ended — the next turn waits for it,
 * so a burst of queued turns never overlaps.
 */
export function useNextTurnQueueDrain(
  queue: NextTurnQueue,
  {
    isGenerating,
    send,
  }: {
    isGenerating: boolean;
    send: (_turn: QueuedTurn) => unknown;
  },
): void {
  const head = queue.items[0];
  const { remove } = queue;
  const isSendingRef = useRef(false);
  // Bumped when a send settles, to look at the queue again even if nothing
  // else about it changed.
  const [settledSends, setSettledSends] = useState(0);

  useEffect(() => {
    if (isGenerating || isSendingRef.current || !head) return;
    isSendingRef.current = true;
    remove(head.id);
    void Promise.resolve()
      .then(() => send(head))
      .catch(() => {
        // handleSend reports its own failures; the queue just moves on.
      })
      .finally(() => {
        isSendingRef.current = false;
        setSettledSends((count) => count + 1);
      });
  }, [isGenerating, head, remove, send, settledSends]);
}
