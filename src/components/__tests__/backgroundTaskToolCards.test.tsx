/**
 * The tool cards of background work: `monitor` (what it watches — a command
 * or a WebSocket — its deadline and the task it started), `task_stop`
 * (which task, and whether it stopped), and `execute_command` with
 * `run_in_background`, which returns at once and shows the task it started
 * (id and output file) instead of an empty terminal.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ToolResultView } from "../ToolResultRenderers";
import { backgroundTaskStartOf } from "../ToolResultRenderers/renderers/BackgroundTaskRenderers";

vi.mock("../../services/PrismService", () => ({
  default: { getFileUrl: (reference: string) => reference },
}));

const SHELL_LINE =
  "Command running in background with ID: shell-ab12cd34. Output is being written to: /tmp/prism-1000/tasks/shell-ab12cd34.output";
const MONITOR_LINE =
  "Monitor started (task id: monitor-ab12cd34, timeout 1800000 ms). Each stdout line will arrive as a notification; stderr goes to /tmp/prism-1000/tasks/monitor-ab12cd34.output. Use task_stop to cancel.";

describe("backgroundTaskStartOf", () => {
  it("reads the task from an object result or from Claude's line", () => {
    expect(
      backgroundTaskStartOf({
        success: true,
        backgrounded: true,
        taskId: "shell-1",
        outputFile: "/tmp/prism-1000/tasks/shell-1.output",
        stdout: "",
        exitCode: null,
      }),
    ).toEqual({ taskId: "shell-1", outputFile: "/tmp/prism-1000/tasks/shell-1.output", timeoutMs: null });
    expect(backgroundTaskStartOf(SHELL_LINE)).toEqual({
      taskId: "shell-ab12cd34",
      outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
      timeoutMs: null,
    });
    expect(backgroundTaskStartOf({ message: MONITOR_LINE })).toEqual({
      taskId: "monitor-ab12cd34",
      outputFile: "/tmp/prism-1000/tasks/monitor-ab12cd34.output",
      timeoutMs: 1_800_000,
    });
    expect(backgroundTaskStartOf({ stdout: "ok", exitCode: 0 })).toBeNull();
    expect(backgroundTaskStartOf(undefined)).toBeNull();
  });
});

describe("execute_command", () => {
  it("run in the background: the task it started, not an empty terminal", () => {
    render(
      <ToolResultView
        toolCall={{
          name: "execute_command",
          args: { command: "npm run build", description: "Build the client", run_in_background: true },
          result: {
            success: true,
            backgrounded: true,
            taskId: "shell-ab12cd34",
            outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
            pid: 4242,
            stdout: "",
            stderr: "",
            exitCode: null,
            message: SHELL_LINE,
          },
        }}
        hideToggles
      />,
    );
    expect(screen.getByText("Build the client")).toBeTruthy();
    expect(screen.getByText("npm run build")).toBeTruthy();
    expect(screen.getByText("Running in background as")).toBeTruthy();
    expect(screen.getByText("shell-ab12cd34")).toBeTruthy();
    expect(screen.getByText("/tmp/prism-1000/tasks/shell-ab12cd34.output")).toBeTruthy();
    expect(screen.getByText("started")).toBeTruthy();
    // No terminal: no OUT section waiting for output that will never come.
    expect(screen.queryByText("OUT")).toBeNull();
  });

  it("run in the background with Claude's line as its result", () => {
    render(
      <ToolResultView
        toolCall={{ name: "execute_command", args: { command: "sleep 600", run_in_background: true }, result: SHELL_LINE }}
        hideToggles
      />,
    );
    expect(screen.getByText("shell-ab12cd34")).toBeTruthy();
    expect(screen.getByText("/tmp/prism-1000/tasks/shell-ab12cd34.output")).toBeTruthy();
  });

  it("run in the background, before its result: starting", () => {
    render(
      <ToolResultView
        toolCall={{ name: "execute_command", args: { command: "sleep 600", run_in_background: true }, status: "calling" }}
        hideToggles
      />,
    );
    expect(screen.getByText("Starting in the background…")).toBeTruthy();
  });

  it("in the foreground: still a terminal", () => {
    render(
      <ToolResultView
        toolCall={{ name: "execute_command", args: { command: "echo ok" }, result: { stdout: "ok\n", exitCode: 0 } }}
        hideToggles
      />,
    );
    expect(screen.getByText("OUT")).toBeTruthy();
    expect(screen.getByText("exit 0")).toBeTruthy();
    expect(screen.queryByText("Running in background as")).toBeNull();
  });
});

describe("monitor", () => {
  it("a command monitor: description, command, deadline (capped) and its task", () => {
    render(
      <ToolResultView
        toolCall={{
          name: "monitor",
          args: {
            command: 'tail -f deploy.log | grep -E --line-buffered "ERROR|FAILED"',
            description: "errors in deploy.log",
            timeout_ms: 3_600_000,
          },
          result: MONITOR_LINE,
        }}
        hideToggles
      />,
    );
    expect(screen.getByText("errors in deploy.log")).toBeTruthy();
    expect(screen.getByText('tail -f deploy.log | grep -E --line-buffered "ERROR|FAILED"')).toBeTruthy();
    expect(screen.getByText(/Expires after 30 min/).textContent).toContain("(asked for 60 min)");
    expect(screen.getByText("monitor-ab12cd34")).toBeTruthy();
    expect(screen.getByText("/tmp/prism-1000/tasks/monitor-ab12cd34.output")).toBeTruthy();
    expect(screen.getByText("started")).toBeTruthy();
  });

  it("a WebSocket monitor: the socket and its protocols", () => {
    render(
      <ToolResultView
        toolCall={{
          name: "monitor",
          args: { ws: { url: "wss://events.example.com/stream", protocols: ["v1"] }, description: "deploy events" },
        }}
        hideToggles
      />,
    );
    expect(screen.getByText("deploy events")).toBeTruthy();
    expect(screen.getByText("wss://events.example.com/stream")).toBeTruthy();
    expect(screen.getByText(/protocols v1/)).toBeTruthy();
    // No result yet: no status.
    expect(screen.queryByText("started")).toBeNull();
  });

  it("a monitor that could not start says why", () => {
    render(
      <ToolResultView
        toolCall={{ name: "monitor", args: { command: "x", description: "x" }, result: { error: "Pass command or ws, not both" } }}
        hideToggles
      />,
    );
    expect(screen.getByText("failed")).toBeTruthy();
    expect(screen.getByText("Pass command or ws, not both")).toBeTruthy();
  });
});

describe("task_stop", () => {
  it("names the task and says it stopped", () => {
    render(
      <ToolResultView
        toolCall={{ name: "task_stop", args: { task_id: "monitor-ab12cd34" }, result: { success: true, message: "Stopped monitor-ab12cd34." } }}
        hideToggles
      />,
    );
    expect(screen.getByText("monitor-ab12cd34")).toBeTruthy();
    expect(screen.getByText("stopped")).toBeTruthy();
    expect(screen.getByText("Stopped monitor-ab12cd34.")).toBeTruthy();
  });

  it("says why a task was not stopped (the deprecated shell_id names it too)", () => {
    render(
      <ToolResultView
        toolCall={{
          name: "task_stop",
          args: { shell_id: "shell-ab12cd34" },
          result: { success: false, message: "Task shell-ab12cd34 already completed." },
        }}
        hideToggles
      />,
    );
    expect(screen.getByText("shell-ab12cd34")).toBeTruthy();
    expect(screen.getByText("not stopped")).toBeTruthy();
    expect(screen.getByText("Task shell-ab12cd34 already completed.")).toBeTruthy();
  });
});
