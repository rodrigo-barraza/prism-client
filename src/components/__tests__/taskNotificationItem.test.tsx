/**
 * A background shell's or monitor's notification is the agent's own command
 * output, never the user's words: whether it arrived mid-turn (a
 * `turn_input` of kind `task_notification`), woke a new turn (persisted
 * with `_notificationSource: "workspace_task"`) or opened that turn on a
 * viewer (`user_message`), it renders as a compact "Task notification"
 * item — task id, type, description, status, event lines — and never as a
 * user bubble.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import MessageList from "../MessageListComponent";
import TaskNotificationItemComponent from "../TaskNotificationItemComponent";
import { applyTurnInputEvent } from "../../utils/turnInputRouting";
import { parseWorkspaceTaskNotifications } from "../../utils/taskNotifications";
import type { Message } from "../../types/types";

vi.mock("../../services/PrismService", () => ({
  default: { getFileUrl: (reference: string) => reference },
}));

const MONITOR_EVENTS = [
  "<task-notification>",
  "<task-id>monitor-ab12cd34</task-id>",
  "<task-type>monitor</task-type>",
  "<description>owner's in-game chat</description>",
  "<event>",
  "Rod: build a tower here",
  "Rod: and a well",
  "</event>",
  "</task-notification>",
].join("\n");

const SHELL_EXIT = [
  "<task-notification>",
  "<task-id>shell-ab12cd34</task-id>",
  "<task-type>shell</task-type>",
  "<status>completed</status>",
  "<exit-code>0</exit-code>",
  "<description>Build the client</description>",
  "<output-file>/tmp/prism-1000/tasks/shell-ab12cd34.output</output-file>",
  '<summary>Background command "Build the client" completed (exit code 0).</summary>',
  "<output-tail>",
  "✓ Compiled in 12.3s",
  "</output-tail>",
  "</task-notification>",
].join("\n");

const MONITOR_TIMEOUT = [
  "<task-notification>",
  "<task-id>monitor-ffff0000</task-id>",
  "<task-type>monitor</task-type>",
  "<status>timeout</status>",
  "<description>errors in deploy.log</description>",
  '<summary>Monitor "errors in deploy.log" expired after 300000 ms with 0 events. Re-arm it if you still need the watch.</summary>',
  "</task-notification>",
].join("\n");

describe("parseWorkspaceTaskNotifications", () => {
  it("reads every block of a coalesced message, events line by line", () => {
    const [events, exit] = parseWorkspaceTaskNotifications(`${MONITOR_EVENTS}\n${SHELL_EXIT}`);
    expect(events).toMatchObject({
      taskId: "monitor-ab12cd34",
      taskType: "monitor",
      description: "owner's in-game chat",
      status: null,
      events: ["Rod: build a tower here", "Rod: and a well"],
    });
    expect(exit).toMatchObject({
      taskId: "shell-ab12cd34",
      taskType: "shell",
      status: "completed",
      exitCode: "0",
      outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
      summary: 'Background command "Build the client" completed (exit code 0).',
      events: [],
      outputTail: "✓ Compiled in 12.3s",
    });
  });

  it("leaves an async task's or a sub-agent's notification (no task type) alone", () => {
    expect(
      parseWorkspaceTaskNotifications("<task-notification><status>✅ completed</status><result>4</result></task-notification>"),
    ).toEqual([]);
  });
});

describe("task notifications in the message list", () => {
  it("render as task notification items, never as user bubbles", () => {
    // Applied mid-turn: the turn_input event's bubble.
    const [midTurn] = applyTurnInputEvent([] as Message[], {
      id: "input-1",
      kind: "task_notification",
      content: MONITOR_EVENTS,
      boundary: "after_tools",
      iteration: 2,
    });
    const messages: Message[] = [
      { role: "user", content: "Watch the chat for me", timestamp: "2026-10-06T10:00:00Z" },
      { role: "assistant", content: "Watching.", timestamp: "2026-10-06T10:00:02Z" },
      midTurn,
      // Woke a new turn: persisted by the service.
      {
        role: "user",
        content: SHELL_EXIT,
        _notificationSource: "workspace_task",
        _notificationId: "workspace_task:shell-ab12cd34:7",
        timestamp: "2026-10-06T10:05:00Z",
      },
      // That turn's opening `user_message` on a viewer: no marker, the notation tells.
      { role: "user", content: MONITOR_TIMEOUT, timestamp: "2026-10-06T10:10:00Z" },
      { role: "assistant", content: "The build passed.", timestamp: "2026-10-06T10:10:02Z" },
    ];
    render(<MessageList messages={messages} isGenerating={false} readOnly />);

    const items = screen.getAllByRole("note", { name: /^Task notification/ });
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Task notification from monitor-ab12cd34",
      "Task notification from shell-ab12cd34",
      "Task notification from monitor-ffff0000",
    ]);

    // The monitor's events, with its id, type and description.
    const [events, exit, expiry] = items;
    expect(within(events).getByText("monitor")).toBeTruthy();
    expect(within(events).getByText("monitor-ab12cd34")).toBeTruthy();
    expect(within(events).getByText("owner's in-game chat")).toBeTruthy();
    expect(within(events).getByText("2 events")).toBeTruthy();
    expect(within(events).getByLabelText("Events").textContent).toBe("Rod: build a tower here\nRod: and a well");

    // The shell's end: status and exit code, summary, output.
    expect(within(exit).getByText("completed · exit 0")).toBeTruthy();
    expect(within(exit).getByText("Build the client")).toBeTruthy();
    expect(within(exit).getByText('Background command "Build the client" completed (exit code 0).')).toBeTruthy();
    expect(within(exit).getByText("/tmp/prism-1000/tasks/shell-ab12cd34.output")).toBeTruthy();
    expect(within(exit).getByText("✓ Compiled in 12.3s")).toBeTruthy();

    // Worded as the strip words it.
    expect(within(expiry).getByText("timed out")).toBeTruthy();

    // None is a user bubble (a bubble is a [data-message-index] element), and no raw notation shows.
    for (const item of items) expect(item.closest("[data-message-index]")).toBeNull();
    expect(screen.getByText("Watch the chat for me").closest("[data-message-index]")).not.toBeNull();
    expect(screen.queryByText(/<task-notification>/)).toBeNull();
  });

  it("shows a marked notification that is not in the notation as its text", () => {
    const messages: Message[] = [
      { role: "user", content: "Monitor stopped: socket closed (1006)", _notificationSource: "workspace_task" },
    ];
    render(<MessageList messages={messages} isGenerating={false} readOnly />);
    const item = screen.getByRole("note", { name: "Task notification" });
    expect(within(item).getByLabelText("Events").textContent).toBe("Monitor stopped: socket closed (1006)");
  });
});

describe("TaskNotificationItemComponent", () => {
  it("offers Delete only when the list is editable", () => {
    const onDelete = vi.fn();
    const notifications = parseWorkspaceTaskNotifications(SHELL_EXIT);
    const { rerender } = render(<TaskNotificationItemComponent notifications={notifications} onDelete={onDelete} />);
    expect(screen.getByRole("note").querySelector("button")).not.toBeNull();
    rerender(<TaskNotificationItemComponent notifications={notifications} onDelete={onDelete} readOnly />);
    expect(screen.getByRole("note").querySelector("button")).toBeNull();
  });
});
