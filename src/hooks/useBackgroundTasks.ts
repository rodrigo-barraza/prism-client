"use client";

/**
 * The conversation's background shells and monitors, for the strip above
 * the composer. Live `background_task` events go through the conversation
 * reducer; this hook lists and stops:
 *
 * - a stored conversation that opens is listed (GET /conversations/:id/tasks)
 *   — a new conversation this chat is sending has nothing to list yet;
 * - a tool call that started or stopped a task finished: listed again. The
 *   task's events go to the conversation's live viewers, and the stream of
 *   the turn this chat sent is not one;
 * - while a task runs it is listed again every few seconds: its events
 *   reach only a live stream, and a conversation between turns has none;
 * - Stop asks the service (POST /tasks/:taskId/stop) and lists again, so
 *   the task shows how it ended even with no stream open.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PrismService from "../services/PrismService";
import { backgroundTasksOf } from "../utils/agentConversationReducer";
import { finishedTaskToolCallsKey, isBackgroundTaskRunning, sortBackgroundTasks } from "../utils/backgroundTasks";
import { getErrorMessage } from "../utils/errorMessage";
import type { BackgroundTask } from "../types/types";
import type { AgentConversation } from "./useAgentConversation";

export const BACKGROUND_TASK_POLL_INTERVAL_MILLISECONDS = 5_000;

interface UseBackgroundTasksOptions {
  /** The conversation on screen (a new one's id is minted before it is saved). */
  conversationId: string;
  /** The stored conversation on screen; null for a new, unsaved one. */
  activeId: string | null;
  project: string | undefined;
  conversation: Pick<AgentConversation, "state" | "dispatch">;
  /** The conversation whose turn this chat is sending (session.clientDrivenConversationIdRef). */
  clientDrivenConversationIdRef: React.RefObject<string | null>;
  /** False for a chat that runs no tools (Direct Chat) or watches someone else's (admin). */
  isEnabled: boolean;
}

export interface BackgroundTasksApi {
  /** The conversation's tasks, oldest first — running and ended. */
  tasks: BackgroundTask[];
  stop: (_taskId: string) => Promise<void>;
  /** Tasks the user asked to stop: "Stopping…" until they end. */
  stopRequestedTaskIds: ReadonlySet<string>;
  /** Why a stop failed, by task id. */
  stopErrors: Readonly<Record<string, string>>;
}

export default function useBackgroundTasks({
  conversationId,
  activeId,
  project,
  conversation,
  clientDrivenConversationIdRef,
  isEnabled,
}: UseBackgroundTasksOptions): BackgroundTasksApi {
  const { state, dispatch } = conversation;
  const [stopRequestedTaskIds, setStopRequestedTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [stopErrors, setStopErrors] = useState<Readonly<Record<string, string>>>({});

  const tasksById = backgroundTasksOf(state, conversationId);
  const tasks = useMemo(() => sortBackgroundTasks(Object.values(tasksById)), [tasksById]);
  const hasRunningTask = tasks.some(isBackgroundTaskRunning);
  const taskToolCallsKey = useMemo(() => finishedTaskToolCallsKey(state.toolActivity), [state.toolActivity]);

  const list = useCallback(
    async (targetConversationId: string) => {
      const requestedAt = new Date().toISOString();
      try {
        const listed = await PrismService.getConversationTasks(targetConversationId, project);
        dispatch({
          type: "background-tasks/listed",
          conversationId: targetConversationId,
          tasks: listed,
          requestedAt,
          receivedAt: new Date().toISOString(),
        });
      } catch {
        // Non-critical: the strip keeps what the events said.
      }
    },
    [project, dispatch],
  );

  // A stored conversation opened: list its tasks.
  useEffect(() => {
    if (!isEnabled || !activeId) return;
    if (clientDrivenConversationIdRef.current === activeId) return;
    void list(activeId);
  }, [isEnabled, activeId, list, clientDrivenConversationIdRef]);

  // The turn started or stopped a task.
  useEffect(() => {
    if (!isEnabled || !activeId || !taskToolCallsKey) return;
    void list(activeId);
  }, [isEnabled, activeId, taskToolCallsKey, list]);

  // A task runs: keep the list current.
  useEffect(() => {
    if (!isEnabled || !activeId || !hasRunningTask) return;
    const pollTimer = setInterval(() => void list(activeId), BACKGROUND_TASK_POLL_INTERVAL_MILLISECONDS);
    return () => clearInterval(pollTimer);
  }, [isEnabled, activeId, hasRunningTask, list]);

  const stop = useCallback(
    async (taskId: string) => {
      setStopRequestedTaskIds((previous) => new Set(previous).add(taskId));
      setStopErrors((previous) => {
        if (!(taskId in previous)) return previous;
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
      try {
        await PrismService.stopBackgroundTask(taskId);
        if (activeId) await list(activeId);
      } catch (error: unknown) {
        setStopRequestedTaskIds((previous) => {
          const next = new Set(previous);
          next.delete(taskId);
          return next;
        });
        setStopErrors((previous) => ({ ...previous, [taskId]: getErrorMessage(error) }));
      }
    },
    [activeId, list],
  );

  return { tasks, stop, stopRequestedTaskIds, stopErrors };
}
