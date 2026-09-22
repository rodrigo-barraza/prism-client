"use client";

/**
 * Edit / Rerun / Delete / Restore for the main chat's message list.
 *
 * MessageList reports an index into the `messages` it was given
 * (`listMessages` here — the chat's filtered view); the hook maps it back
 * to the conversation array by identity and persists the result through
 * `PATCH /conversations/:id`.
 *
 * - Edit of a user message, and Rerun: the message and everything after it
 *   leave the conversation, then its text goes out again as a new turn. The
 *   server appends that turn to the truncated document.
 * - Edit of an assistant reply: its text is replaced in place.
 * - Delete / Restore: the soft `deleted` flag, which the server already
 *   strips from the model's context and the list renders collapsed.
 */

import { useState, type ReactNode } from "react";
import { DialogComponent } from "@rodrigo-barraza/components-library";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import { userMessageResendText } from "../utils/messageHelpers";
import {
  applyAssistantEdit,
  countLaterMessages,
  restoreMessage,
  softDeleteMessage,
  toPersistableMessages,
} from "../utils/messageActions";
import type { FileAttachment, Message } from "../types/types";

/** What a user-message edit or rerun sends as the new turn. */
export interface MessageActionResend {
  text: string;
  images: string[];
  /** Attachments already uploaded with the original message. */
  uploadedFiles: FileAttachment[];
}

export interface UseMessageActionsOptions {
  /** The whole conversation, as held in state. */
  messages: Message[];
  /** The subset MessageList renders; its indices are what handlers receive. */
  listMessages: Message[];
  /** Replace the conversation state (and any ref mirroring it). */
  commitMessages: (_next: Message[]) => void;
  isGenerating: boolean;
  /** Persisted conversation id; null before the first turn is saved. */
  conversationId: string | null;
  project?: string;
  resend: (_payload: MessageActionResend) => void;
  onError: (_message: string) => void;
}

export interface MessageActionProps {
  onEdit: (_index: number, _content: string) => void;
  onRerun: (_index: number) => void;
  onDelete: (_index: number) => void;
  onRestore: (_index: number) => void;
}

interface PendingResend {
  kind: "edit" | "rerun";
  /** The user message to resend from — re-found by identity on confirm. */
  target: Message;
  text: string;
  discardCount: number;
}

export default function useMessageActions({
  messages,
  listMessages,
  commitMessages,
  isGenerating,
  conversationId,
  project,
  resend,
  onError,
}: UseMessageActionsOptions): { listProps: MessageActionProps; confirmDialog: ReactNode } {
  const [pendingResend, setPendingResend] = useState<PendingResend | null>(null);

  const conversationIndexOf = (listIndex: number): number => {
    const target = listMessages[listIndex];
    return target ? messages.indexOf(target) : -1;
  };

  /** Show `next`, persist it, and put `messages` back if the save fails. */
  const persist = async (next: Message[]): Promise<boolean> => {
    const previous = messages;
    commitMessages(next);
    if (!conversationId) return true;
    try {
      await PrismService.patchConversation(
        conversationId,
        { messages: toPersistableMessages(next) },
        project,
      );
      return true;
    } catch (error: unknown) {
      commitMessages(previous);
      onError(`Could not save the conversation — ${getErrorMessage(error)}`);
      return false;
    }
  };

  const resendFrom = async (target: Message, text: string) => {
    const index = messages.indexOf(target);
    if (index === -1) {
      onError("The conversation changed before the message was resent — try again.");
      return;
    }
    // TODO(prompt 15, rewind-and-fork): an edit forks the conversation
    // instead of discarding what came after it.
    if (!(await persist(messages.slice(0, index)))) return;
    resend({
      text,
      images: target.images ?? [],
      uploadedFiles: target.files ?? [],
    });
  };

  const requestResend = (kind: PendingResend["kind"], index: number, text: string) => {
    const target = messages[index];
    const discardCount = countLaterMessages(messages, index);
    // An edit always names what it discards; a rerun only when it reaches
    // past its own turn's reply.
    const needsConfirmation =
      kind === "edit"
        ? discardCount > 0
        : messages.slice(index + 1).some((message) => message.role === "user");
    if (needsConfirmation) {
      setPendingResend({ kind, target, text, discardCount });
    } else {
      void resendFrom(target, text);
    }
  };

  const onEdit = (listIndex: number, content: string) => {
    if (isGenerating) return;
    const index = conversationIndexOf(listIndex);
    const target = messages[index];
    if (!target) return;
    if (target.role === "user") {
      requestResend("edit", index, content);
    } else if (target.role === "assistant") {
      void persist(
        messages.map((message, messageIndex) =>
          messageIndex === index ? applyAssistantEdit(message, content) : message,
        ),
      );
    }
  };

  const onRerun = (listIndex: number) => {
    if (isGenerating) return;
    const index = conversationIndexOf(listIndex);
    const target = messages[index];
    if (target?.role !== "user") return;
    requestResend("rerun", index, userMessageResendText(target));
  };

  const onDelete = (listIndex: number) => {
    if (isGenerating) return;
    const index = conversationIndexOf(listIndex);
    if (index === -1) return;
    void persist(softDeleteMessage(messages, index));
  };

  const onRestore = (listIndex: number) => {
    if (isGenerating) return;
    const index = conversationIndexOf(listIndex);
    if (index === -1) return;
    void persist(restoreMessage(messages, index));
  };

  const discardCount = pendingResend?.discardCount ?? 0;
  const confirmDialog = (
    <DialogComponent
      open={pendingResend !== null}
      onClose={() => setPendingResend(null)}
      headline={pendingResend?.kind === "rerun" ? "Rerun from here?" : "Resend the edited message?"}
      confirmLabel="Discard and resend"
      confirmVariant="destructive"
      onConfirm={() => {
        const confirmed = pendingResend;
        setPendingResend(null);
        if (confirmed) void resendFrom(confirmed.target, confirmed.text);
      }}
    >
      {`This discards the ${discardCount} later message${discardCount === 1 ? "" : "s"} in this conversation and sends the ${
        pendingResend?.kind === "rerun" ? "" : "edited "
      }message again.`}
    </DialogComponent>
  );

  return { listProps: { onEdit, onRerun, onDelete, onRestore }, confirmDialog };
}
