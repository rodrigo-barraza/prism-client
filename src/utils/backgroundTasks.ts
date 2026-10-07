/**
 * The conversation's background tasks — detached `execute_command` runs and
 * monitors — as the chat tracks them. Two sources feed the same records:
 * `background_task` events (the reducer, agentConversationReducer.ts) and
 * GET /conversations/:id/tasks (hooks/useBackgroundTasks.ts). Everything
 * here is pure: times come in as arguments.
 *
 * `updatedAt` is the CLIENT's clock — when the chat last saw the task
 * change — so a list fetched before an event cannot undo it, and a task
 * that just ended stays on screen for a moment, whatever the server's clock
 * says. `startedAt` / `endedAt` are the server's, for display.
 */
import type {
  BackgroundTask,
  BackgroundTaskEvent,
  BackgroundTaskStatus,
  BackgroundTaskType,
  ToolCallEvent,
} from "../types/types";

const TASK_TYPES: ReadonlySet<string> = new Set<BackgroundTaskType>(["shell", "monitor"]);
const TASK_STATUSES: ReadonlySet<string> = new Set<BackgroundTaskStatus>([
  "running",
  "completed",
  "failed",
  "killed",
  "timeout",
  "too_many_events",
  "closed",
  "exited",
  "lost",
]);

/** How long a task that just ended keeps its row, showing how it ended. */
export const FINISHED_TASK_VISIBLE_MILLISECONDS = 8_000;

export function isBackgroundTaskRunning(task: Pick<BackgroundTask, "status">): boolean {
  return task.status === "running";
}

/**
 * The task after its `background_task` event, received at `receivedAt`
 * (ISO, the client's clock). A task that ended stays ended: a replayed or
 * late `running` frame never revives it, and a monitor's count only grows.
 */
export function applyBackgroundTaskEvent(
  previous: BackgroundTask | undefined,
  event: BackgroundTaskEvent,
  receivedAt: string,
): BackgroundTask {
  const isRunning = event.status === "running";
  if (previous && !isBackgroundTaskRunning(previous) && isRunning) return previous;
  const task: BackgroundTask = {
    ...previous,
    taskId: event.taskId,
    taskType: event.taskType,
    status: event.status,
    description: event.description || previous?.description || "",
    eventCount: Math.max(previous?.eventCount ?? 0, event.eventCount ?? 0),
    updatedAt: receivedAt,
  };
  if (event.command !== undefined) task.command = event.command;
  if (event.wsUrl !== undefined) task.wsUrl = event.wsUrl;
  if (event.outputFile !== undefined) task.outputFile = event.outputFile;
  if (event.exitCode !== undefined) task.exitCode = event.exitCode;
  // A task first seen running started then (a list fetched later corrects
  // a task first seen at a monitor's batch); one first seen ending did not.
  if (!task.startedAt && isRunning) task.startedAt = event.at;
  if (!isRunning && !task.endedAt) task.endedAt = event.at;
  return task;
}

const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;
const numberOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * One entry of GET /conversations/:id/tasks (prism-service's
 * WatchedTaskSummary: the `background_task` fields, with `startedAt` and
 * `endedAt`), or null for an entry that is not a task this chat can show.
 */
export function backgroundTaskFromRecord(record: unknown): BackgroundTask | null {
  if (!record || typeof record !== "object") return null;
  const fields = record as Record<string, unknown>;
  const taskId = stringOf(fields.taskId);
  const taskType = stringOf(fields.taskType);
  const status = stringOf(fields.status);
  if (!taskId || !taskType || !TASK_TYPES.has(taskType) || !status || !TASK_STATUSES.has(status)) return null;
  const task: BackgroundTask = {
    taskId,
    taskType: taskType as BackgroundTaskType,
    status: status as BackgroundTaskStatus,
    description: stringOf(fields.description) ?? "",
    eventCount: numberOf(fields.eventCount) ?? 0,
  };
  const wsUrl = stringOf(fields.wsUrl);
  const command = stringOf(fields.command);
  const outputFile = stringOf(fields.outputFile);
  const startedAt = stringOf(fields.startedAt);
  const endedAt = stringOf(fields.endedAt);
  if (command) task.command = command;
  if (wsUrl) task.wsUrl = wsUrl;
  if (outputFile) task.outputFile = outputFile;
  if (fields.exitCode === null || numberOf(fields.exitCode) !== undefined) {
    task.exitCode = fields.exitCode as number | null;
  }
  if (startedAt) task.startedAt = startedAt;
  if (endedAt) task.endedAt = endedAt;
  return task;
}

/** GET /conversations/:id/tasks: `{ tasks: [...] }`, or the list itself. */
export function backgroundTasksFromResponse(body: unknown): BackgroundTask[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { tasks?: unknown }).tasks)
      ? (body as { tasks: unknown[] }).tasks
      : [];
  return list.map(backgroundTaskFromRecord).filter((task): task is BackgroundTask => task !== null);
}

/**
 * The conversation's tasks once a list requested at `requestedAt` arrived at
 * `receivedAt` (both ISO, the client's clock):
 *
 * - each listed task, merged into what the events said: a list that still
 *   says `running` never revives a task the events saw end, and never lowers
 *   a monitor's count; a task the list shows ended just now stays on screen
 *   for its moment, like one an event ended;
 * - each task the list does not name that changed after the list was
 *   requested (it started meanwhile). Any other is gone from the service.
 */
export function mergeListedBackgroundTasks(
  current: Readonly<Record<string, BackgroundTask>> | undefined,
  listed: readonly BackgroundTask[],
  requestedAt: string,
  receivedAt: string,
): Record<string, BackgroundTask> {
  const next: Record<string, BackgroundTask> = {};
  for (const task of listed) {
    const known = current?.[task.taskId];
    if (!known) {
      next[task.taskId] = task;
    } else if (!isBackgroundTaskRunning(known) && isBackgroundTaskRunning(task)) {
      next[task.taskId] = known;
    } else {
      next[task.taskId] = {
        ...known,
        ...task,
        eventCount: Math.max(known.eventCount, task.eventCount),
        updatedAt: known.status === task.status ? known.updatedAt : receivedAt,
      };
    }
  }
  for (const [taskId, task] of Object.entries(current ?? {})) {
    if (!(taskId in next) && task.updatedAt !== undefined && task.updatedAt > requestedAt) next[taskId] = task;
  }
  return next;
}

/** Oldest first, the order they were started in. */
export function sortBackgroundTasks(tasks: Iterable<BackgroundTask>): BackgroundTask[] {
  return [...tasks].sort(
    (first, second) =>
      (first.startedAt ?? first.updatedAt ?? "").localeCompare(second.startedAt ?? second.updatedAt ?? "") ||
      first.taskId.localeCompare(second.taskId),
  );
}

/** What the strip shows at `now` (epoch ms): every running task, and each one that ended a moment ago. */
export function visibleBackgroundTasks(tasks: readonly BackgroundTask[], now: number): BackgroundTask[] {
  return tasks.filter((task) => {
    if (isBackgroundTaskRunning(task)) return true;
    if (!task.updatedAt) return false;
    return now - Date.parse(task.updatedAt) < FINISHED_TASK_VISIBLE_MILLISECONDS;
  });
}

/** "completed · exit 0", "failed · exit 2", "timed out", "stopped: too many events", … */
export function backgroundTaskStatusLabel(task: Pick<BackgroundTask, "status" | "exitCode">): string {
  const exit = typeof task.exitCode === "number" ? ` · exit ${task.exitCode}` : "";
  switch (task.status) {
    case "running":
      return "running";
    case "completed":
    case "failed":
    case "exited":
      return `${task.status}${exit}`;
    case "killed":
      return "stopped";
    case "timeout":
      return "timed out";
    case "too_many_events":
      return "stopped: too many events";
    case "closed":
      return "socket closed";
    case "lost":
      return "lost";
  }
}

export type BackgroundTaskOutcomeTone = "ok" | "neutral" | "failed";

/**
 * How the way a task ended reads: a clean exit is ok; a requested stop, a
 * socket that closed or a monitor that expired are neutral (they happen by
 * design); a failure, a monitor stopped for too many events or a task lost
 * with its workspace agent is failed.
 */
export function backgroundTaskOutcomeTone(task: Pick<BackgroundTask, "status" | "exitCode">): BackgroundTaskOutcomeTone {
  switch (task.status) {
    case "completed":
      return "ok";
    case "exited":
      return task.exitCode === 0 ? "ok" : typeof task.exitCode === "number" ? "failed" : "neutral";
    case "failed":
    case "too_many_events":
    case "lost":
      return "failed";
    case "running":
    case "killed":
    case "closed":
    case "timeout":
      return "neutral";
  }
}

export function isBackgroundTaskStatus(status: string): status is BackgroundTaskStatus {
  return TASK_STATUSES.has(status);
}

/** Tools whose every call starts or stops a background task. */
const TASK_TOOL_NAMES: ReadonlySet<string> = new Set(["monitor", "task_stop"]);

/**
 * The turn's finished tool calls that started or stopped a background task
 * — `monitor`, `task_stop`, an `execute_command` run in the background — as
 * one key, which changes only when another of them finishes. A task's own
 * events reach the conversation's live viewers, not always the stream that
 * sent the turn: the chat lists the tasks again when this key changes.
 */
export function finishedTaskToolCallsKey(toolCalls: readonly ToolCallEvent[]): string {
  return toolCalls
    .filter(
      (toolCall) =>
        toolCall.status === "done" &&
        (TASK_TOOL_NAMES.has(toolCall.name) ||
          (toolCall.name === "execute_command" && toolCall.args?.run_in_background === true)),
    )
    .map((toolCall) => toolCall.id)
    .join("|");
}

/** "12s", "3m 05s", "1h 02m" — a running task's age, to the second. */
export function formatTaskElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}
