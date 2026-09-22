"use client";

/**
 * Next-turn queue for the chat composer.
 *
 * Input that cannot steer the running turn — attachments, or the composer's
 * "queue" send mode — waits here and goes out after the generation ends.
 * `useNextTurnQueue` owns the state (declared early, so the send paths can
 * enqueue); `useNextTurnQueueDrain` sends from it (declared after the send
 * function exists).
 */

import { useCallback, useEffect, useState } from "react";
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
  const [slot, setSlot] = useState<QueuedTurn | null>(null);

  const enqueue = useCallback(
    (payload: QueuedTurnPayload) => {
      setSlot({ ...payload, id: generateUUID(), conversationId });
    },
    [conversationId],
  );

  const remove = useCallback((id: string) => {
    setSlot((current) => (current?.id === id ? null : current));
  }, []);

  return { items: slot ? [slot] : [], enqueue, remove };
}

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

  useEffect(() => {
    if (!isGenerating && head) {
      remove(head.id);
      setTimeout(() => {
        send(head);
      }, 50);
    }
  }, [isGenerating, head, remove, send]);
}
