/**
 * A background task's `<task-notification>` (prism-service
 * BackgroundTaskWatcher): a monitor's batch of stdout lines, or how a
 * background shell or a monitor ended. It reaches the conversation as a
 * `turn_input` of kind `task_notification` (the agent's turn was running),
 * or as the message that wakes a new turn (`_notificationSource:
 * "workspace_task"`, and the `user_message` that opens that turn). Several
 * that arrived together are one message of concatenated blocks.
 *
 * It is the agent's own command output, never the user's words: the chat
 * shows it as a task notification item, never as a user bubble.
 *
 *     <task-notification>
 *     <task-id>monitor-ab12cd34</task-id>
 *     <task-type>monitor</task-type>
 *     <description>owner's in-game chat</description>
 *     <event>
 *     Rod: build a tower here
 *     </event>
 *     </task-notification>
 *
 * An ending carries `<status>`, `<exit-code>` or `<close-code>`,
 * `<output-file>`, `<summary>` and `<output-tail>` instead of `<event>`.
 * (An async task's or a sub-agent's notification has no `<task-type>`; it
 * is not one of these.)
 */
import type { Message } from "../types/types";

/** `_notificationSource` of a background task's notification that woke a turn. */
export const WORKSPACE_TASK_NOTIFICATION_SOURCE = "workspace_task";

export interface WorkspaceTaskNotification {
  taskId: string | null;
  /** `shell` or `monitor`. */
  taskType: string | null;
  description: string | null;
  /** How the task ended; absent on a monitor's events. */
  status: string | null;
  exitCode: string | null;
  /** A `ws` monitor's socket close code. */
  closeCode: string | null;
  outputFile: string | null;
  summary: string | null;
  /** A monitor's events, one line each. */
  events: string[];
  /** The last lines of the task's output, at its end. */
  outputTail: string | null;
}

const BLOCK = /<task-notification>([\s\S]*?)<\/task-notification>/g;

/** A tag's text: one line trimmed, or a multi-line body without the newlines that frame it. */
function tagText(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}>\\n?([\\s\\S]*?)\\n?</${name}>`));
  return match ? match[1] : null;
}

function lineTag(block: string, name: string): string | null {
  const text = tagText(block, name);
  return text === null ? null : text.trim() || null;
}

function parseBlock(block: string): WorkspaceTaskNotification | null {
  const taskType = lineTag(block, "task-type");
  if (!taskType) return null;
  const events = [...block.matchAll(/<event>\n?([\s\S]*?)\n?<\/event>/g)].flatMap((match) => match[1].split("\n"));
  const outputTail = tagText(block, "output-tail");
  return {
    taskId: lineTag(block, "task-id"),
    taskType,
    description: lineTag(block, "description"),
    status: lineTag(block, "status"),
    exitCode: lineTag(block, "exit-code"),
    closeCode: lineTag(block, "close-code"),
    outputFile: lineTag(block, "output-file"),
    summary: lineTag(block, "summary"),
    events,
    outputTail: outputTail && outputTail.trim() ? outputTail : null,
  };
}

/** The background-task notifications in `text`, in order; empty when it holds none. */
export function parseWorkspaceTaskNotifications(text: string | null | undefined): WorkspaceTaskNotification[] {
  if (!text || !text.includes("<task-notification>")) return [];
  return [...text.matchAll(BLOCK)]
    .map((match) => parseBlock(match[1]))
    .filter((notification): notification is WorkspaceTaskNotification => notification !== null);
}

type NotificationFields = Pick<Message, "role" | "content" | "rawContent" | "_notificationSource" | "_turnInput">;

/** Marked as one by the service: woke a turn, or applied mid-turn. */
function isMarkedTaskNotification(message: NotificationFields): boolean {
  return (
    message._notificationSource === WORKSPACE_TASK_NOTIFICATION_SOURCE ||
    message._turnInput?.kind === "task_notification"
  );
}

const parsedByMessage = new WeakMap<object, WorkspaceTaskNotification[] | null>();

/**
 * The background-task notifications a user-role message carries — null
 * when it is not one. A marked message whose text is not in the notation
 * still is one: it shows as a single notification of its text.
 */
export function workspaceTaskNotificationsOf(message: NotificationFields): WorkspaceTaskNotification[] | null {
  if (message.role !== "user") return null;
  if (parsedByMessage.has(message)) return parsedByMessage.get(message)!;
  const text = message.rawContent || message.content || "";
  const parsed = parseWorkspaceTaskNotifications(text);
  let notifications: WorkspaceTaskNotification[] | null = parsed.length > 0 ? parsed : null;
  if (!notifications && isMarkedTaskNotification(message)) {
    notifications = [
      {
        taskId: null,
        taskType: null,
        description: null,
        status: null,
        exitCode: null,
        closeCode: null,
        outputFile: null,
        summary: null,
        events: text ? text.split("\n") : [],
        outputTail: null,
      },
    ];
  }
  parsedByMessage.set(message, notifications);
  return notifications;
}

export function isWorkspaceTaskNotificationMessage(message: NotificationFields): boolean {
  return workspaceTaskNotificationsOf(message) !== null;
}
