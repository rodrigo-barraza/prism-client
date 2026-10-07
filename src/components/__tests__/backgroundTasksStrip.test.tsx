/**
 * The strip above the composer: each running background shell and monitor
 * with its description, type, event count and age, and a Stop that asks
 * the service; a task that just ended shows how for a moment, then leaves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import BackgroundTasksStripComponent from "../BackgroundTasksStripComponent";
import { FINISHED_TASK_VISIBLE_MILLISECONDS } from "../../utils/backgroundTasks";
import type { BackgroundTask } from "../../types/types";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const iso = (offsetMilliseconds: number) => new Date(NOW + offsetMilliseconds).toISOString();

const shell: BackgroundTask = {
  taskId: "shell-ab12cd34",
  taskType: "shell",
  status: "running",
  description: "Build the client",
  command: "npm run build",
  outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
  eventCount: 0,
  startedAt: iso(-65_000),
  updatedAt: iso(-65_000),
};

const monitor: BackgroundTask = {
  taskId: "monitor-ab12cd34",
  taskType: "monitor",
  status: "running",
  description: "errors in deploy.log",
  command: "tail -f deploy.log | grep --line-buffered ERROR",
  eventCount: 3,
  startedAt: iso(-12_000),
  updatedAt: iso(-1_000),
};

const rowOf = (taskId: string) => screen.getByLabelText(new RegExp(`^\\w+ ${taskId}:`));

describe("BackgroundTasksStripComponent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists each running task with its description, type, events and age", () => {
    render(<BackgroundTasksStripComponent tasks={[shell, monitor]} onStop={vi.fn()} />);
    const strip = screen.getByRole("region", { name: "Background tasks" });
    expect(within(strip).getByText("2 running")).toBeTruthy();

    const shellRow = rowOf("shell-ab12cd34");
    expect(within(shellRow).getByText("Build the client")).toBeTruthy();
    expect(within(shellRow).getByText("shell")).toBeTruthy();
    expect(within(shellRow).getByText("1m 05s")).toBeTruthy();
    // A shell has no events to count.
    expect(within(shellRow).queryByText(/events?$/)).toBeNull();

    const monitorRow = rowOf("monitor-ab12cd34");
    expect(within(monitorRow).getByText("monitor")).toBeTruthy();
    expect(within(monitorRow).getByText("3 events")).toBeTruthy();
    expect(within(monitorRow).getByText("12s")).toBeTruthy();

    // The age ticks.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(within(monitorRow).getByText("15s")).toBeTruthy();
  });

  it("stops a task from its row, and says it is stopping until it ends", () => {
    const onStop = vi.fn();
    const { rerender } = render(<BackgroundTasksStripComponent tasks={[shell, monitor]} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop monitor-ab12cd34" }));
    expect(onStop).toHaveBeenCalledWith("monitor-ab12cd34");

    rerender(
      <BackgroundTasksStripComponent
        tasks={[shell, monitor]}
        onStop={onStop}
        stopRequestedTaskIds={new Set(["monitor-ab12cd34"])}
      />,
    );
    const stopping = screen.getByRole("button", { name: "Stop monitor-ab12cd34" }) as HTMLButtonElement;
    expect(stopping.disabled).toBe(true);
    expect(stopping.textContent).toContain("Stopping…");
    expect((screen.getByRole("button", { name: "Stop shell-ab12cd34" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says why a stop failed", () => {
    render(
      <BackgroundTasksStripComponent
        tasks={[shell]}
        onStop={vi.fn()}
        stopErrors={{ "shell-ab12cd34": "Task not found" }}
      />,
    );
    expect(within(rowOf("shell-ab12cd34")).getByRole("alert").textContent).toBe("Task not found");
  });

  it("shows how a task ended for a moment, then lets it go", () => {
    const failed: BackgroundTask = {
      ...shell,
      status: "failed",
      exitCode: 2,
      endedAt: iso(-1_000),
      updatedAt: iso(0),
    };
    const killed: BackgroundTask = { ...monitor, status: "killed", exitCode: null, endedAt: iso(0), updatedAt: iso(0) };
    render(<BackgroundTasksStripComponent tasks={[failed, killed]} onStop={vi.fn()} />);
    expect(within(rowOf("shell-ab12cd34")).getByText("failed · exit 2")).toBeTruthy();
    expect(within(rowOf("monitor-ab12cd34")).getByText("stopped")).toBeTruthy();
    // How long it ran, frozen at its end; no Stop on a task that ended.
    expect(within(rowOf("shell-ab12cd34")).getByText("1m 04s")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/running$/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(FINISHED_TASK_VISIBLE_MILLISECONDS + 1_000);
    });
    expect(screen.queryByRole("region", { name: "Background tasks" })).toBeNull();
  });

  it("renders nothing without a task to show", () => {
    const longEnded: BackgroundTask = { ...shell, status: "completed", exitCode: 0, updatedAt: iso(-60_000) };
    const { container } = render(<BackgroundTasksStripComponent tasks={[longEnded]} onStop={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
