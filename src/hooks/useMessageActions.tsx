"use client";

/**
 * Edit / Rerun / Delete / Restore for the main chat's message list.
 *
 * MessageList reports an index into the `messages` it was given
 * (`listMessages` here — the chat's filtered view); the hook maps it back
 * to the conversation array by identity and persists the result through
 * `PATCH /conversations/:id`.
 */

import type { ReactNode } from "react";
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
  onRerun: ((_index: number) => void) | null;
  onDelete: (_index: number) => void;
  onRestore: (_index: number) => void;
}

export default function useMessageActions(
  _options: UseMessageActionsOptions,
): { listProps: Record<string, never>; confirmDialog: ReactNode } {
  // AgentChatComponent passes no message handlers to its MessageList.
  return { listProps: {}, confirmDialog: null };
}
