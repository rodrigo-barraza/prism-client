"use client";

/**
 * Rewind to here / Fork from here / Edit as a branch, for the main chat.
 *
 * - Rewind opens RewindDialogComponent on a dry run, then restores the
 *   conversation, the code, or both (POST /conversations/:id/rewind) and
 *   reloads the conversation.
 * - Fork copies the conversation through a message into a new one and
 *   opens it; the files are not touched.
 * - forkForEdit is what an Edit of an earlier prompt does by default: fork
 *   BEFORE the edited message, open the fork, and send the edited text
 *   there once the fork is the conversation on screen — the original keeps
 *   everything that came after it.
 *
 * Handler indices are indices into `listMessages`, like useMessageActions.
 * Messages carry the server-assigned `id` once persisted; one without an id
 * (still streaming) cannot be rewound to or forked from yet.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import RewindDialogComponent from "../components/RewindDialogComponent";
import {
  forkConversation,
  rewindConversation,
  type ForkResult,
  type RewindOutcome,
  type RewindReport,
  type RewindRestore,
} from "../services/conversationBranching";
import { getErrorMessage } from "../utils/errorMessage";
import type { MessageActionResend } from "./useMessageActions";
import type { Message } from "../types/types";

export interface UseConversationBranchingOptions {
  /** The subset MessageList renders; its indices are what handlers receive. */
  listMessages: Message[];
  /** Persisted id of the conversation on screen; null before its first turn is saved. */
  conversationId: string | null;
  project?: string;
  isGenerating: boolean;
  /** Reload the conversation on screen after a rewind. */
  onRewound: (_report: RewindReport) => void | Promise<void>;
  /** Open a fork (list refresh + navigation). */
  openConversation: (_fork: ForkResult) => void | Promise<void>;
  /** Send a turn in the conversation on screen. */
  send: (_payload: MessageActionResend) => void;
  onNotice: (_message: string) => void;
  onError: (_message: string) => void;
}

export interface BranchingListProps {
  onRewind: (_index: number) => void;
  onFork: (_index: number) => void;
}

interface RewindTarget {
  messageId: string;
  preview: string;
}

function describeRewind(report: RewindReport): string {
  const parts: string[] = [];
  if (report.conversation) {
    const count = report.conversation.prunedCount;
    parts.push(count ? `removed ${count} message${count === 1 ? "" : "s"}` : "conversation unchanged");
  }
  if (report.code) {
    if (report.code.status === "restored") {
      const restored = report.code.workspaces.reduce((sum, workspace) => sum + workspace.restored.length, 0);
      const removed = report.code.workspaces.reduce((sum, workspace) => sum + workspace.removed.length, 0);
      parts.push(`restored ${restored} file${restored === 1 ? "" : "s"}, deleted ${removed}`);
    } else if (report.code.reason) {
      parts.push(report.code.reason);
    }
  }
  return `Rewound — ${parts.join("; ")}.`;
}

export default function useConversationBranching({
  listMessages,
  conversationId,
  project,
  isGenerating,
  onRewound,
  openConversation,
  send,
  onNotice,
  onError,
}: UseConversationBranchingOptions): {
  listProps: BranchingListProps;
  dialog: ReactNode;
  forkForEdit: (_target: Message, _payload: MessageActionResend) => Promise<boolean>;
} {
  const [rewindTarget, setRewindTarget] = useState<RewindTarget | null>(null);
  const [rewindOpening, setRewindOpening] = useState(0);
  const pendingForkSendRef = useRef<{
    conversationId: string;
    payload: MessageActionResend;
  } | null>(null);

  // Send the edited prompt once the fork is the conversation on screen
  // (openConversation switches it; the send must use that render's state).
  useEffect(() => {
    const pending = pendingForkSendRef.current;
    if (!pending || isGenerating || conversationId !== pending.conversationId) return;
    pendingForkSendRef.current = null;
    send(pending.payload);
  }, [conversationId, isGenerating, send]);

  const messageIdAt = (index: number): string | null => {
    const id = listMessages[index]?.id;
    if (!id) {
      onError("That message is not saved yet — try again once the reply has finished.");
      return null;
    }
    return id;
  };

  const onRewind = (index: number) => {
    if (isGenerating || !conversationId) return;
    const messageId = messageIdAt(index);
    if (!messageId) return;
    setRewindOpening((opening) => opening + 1);
    setRewindTarget({ messageId, preview: listMessages[index]?.content || "" });
  };

  const onFork = (index: number) => {
    if (isGenerating || !conversationId) return;
    const messageId = messageIdAt(index);
    if (!messageId) return;
    void (async () => {
      try {
        const fork = await forkConversation(conversationId, messageId, { position: "at", project });
        await openConversation(fork);
        onNotice(`Forked into “${fork.title}”.`);
      } catch (error: unknown) {
        onError(`Could not fork the conversation — ${getErrorMessage(error)}`);
      }
    })();
  };

  const forkForEdit = async (target: Message, payload: MessageActionResend): Promise<boolean> => {
    if (!conversationId || !target.id) {
      onError("That message is not saved yet — edit it in place instead.");
      return false;
    }
    try {
      const fork = await forkConversation(conversationId, target.id, { position: "before", project });
      pendingForkSendRef.current = { conversationId: fork.id, payload };
      await openConversation(fork);
      return true;
    } catch (error: unknown) {
      onError(`Could not branch the conversation — ${getErrorMessage(error)}`);
      return false;
    }
  };

  const runRewind = async (restore: RewindRestore, force: boolean, dryRun: boolean): Promise<RewindOutcome> => {
    if (!rewindTarget || !conversationId) return { status: 0, report: null, error: "Nothing to rewind." };
    return rewindConversation(
      conversationId,
      { toMessageId: rewindTarget.messageId, restore, force, dryRun },
      project,
    );
  };

  const dialog = rewindTarget && (
    <RewindDialogComponent
      key={rewindOpening}
      open
      messagePreview={rewindTarget?.preview ?? ""}
      onClose={() => setRewindTarget(null)}
      preview={() => runRewind("both", false, true)}
      onConfirm={async (restore, force) => {
        const outcome = await runRewind(restore, force, false);
        if (outcome.status === 409 && outcome.report) return outcome;
        if (!outcome.report) {
          onError(`Rewind failed — ${outcome.error}`);
          return outcome;
        }
        setRewindTarget(null);
        if (outcome.report.code?.status === "failed") {
          const failures = outcome.report.code.workspaces.map((workspace) => workspace.error).filter(Boolean);
          onError(`The code restore failed — ${failures.join("; ") || outcome.report.code.reason || "see the server log"}`);
        } else {
          onNotice(describeRewind(outcome.report));
        }
        await onRewound(outcome.report);
        return outcome;
      }}
    />
  );

  return { listProps: { onRewind, onFork }, dialog, forkForEdit };
}
