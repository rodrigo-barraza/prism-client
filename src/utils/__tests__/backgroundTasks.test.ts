import { describe, it, expect } from "vitest";
import {
  FINISHED_TASK_VISIBLE_MILLISECONDS,
  backgroundTaskFromRecord,
  backgroundTaskOutcomeTone,
  backgroundTaskStatusLabel,
  backgroundTasksFromResponse,
  finishedTaskToolCallsKey,
  formatTaskElapsed,
  sortBackgroundTasks,
  visibleBackgroundTasks,
} from "../backgroundTasks";
import type { BackgroundTask } from "../../types/types";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const iso = (offsetMilliseconds: number) => new Date(NOW + offsetMilliseconds).toISOString();

describe("GET /conversations/:id/tasks", () => {
  it("reads the service's records", () => {
    expect(
      backgroundTasksFromResponse({
        tasks: [
          {
            taskId: "shell-1",
            taskType: "shell",
            status: "failed",
            description: "Build",
            command: "npm run build",
            outputFile: "/tmp/prism-1000/tasks/shell-1.output",
            exitCode: 2,
            startedAt: iso(-60_000),
            endedAt: iso(-1_000),
            eventCount: 0,
          },
          { taskId: "monitor-1", taskType: "monitor", status: "running", description: "deploy events", wsUrl: "wss://events.example.com", eventCount: 7 },
          { taskId: "shell-2", taskType: "shell", status: "killed", description: "Serve", exitCode: null },
        ],
      }),
    ).toEqual([
      {
        taskId: "shell-1",
        taskType: "shell",
        status: "failed",
        description: "Build",
        command: "npm run build",
        outputFile: "/tmp/prism-1000/tasks/shell-1.output",
        exitCode: 2,
        startedAt: iso(-60_000),
        endedAt: iso(-1_000),
        eventCount: 0,
      },
      { taskId: "monitor-1", taskType: "monitor", status: "running", description: "deploy events", wsUrl: "wss://events.example.com", eventCount: 7 },
      { taskId: "shell-2", taskType: "shell", status: "killed", description: "Serve", exitCode: null, eventCount: 0 },
    ]);
  });

  it("takes the bare list too, and drops what is not a task it can show", () => {
    expect(
      backgroundTasksFromResponse([
        { taskId: "shell-1", taskType: "shell", status: "running", description: "x" },
        { taskId: "task-1", taskType: "async", status: "running" },
        { taskId: "shell-2", taskType: "shell", status: "settled" },
        { taskType: "shell", status: "running" },
        null,
      ]).map((task) => task.taskId),
    ).toEqual(["shell-1"]);
    expect(backgroundTasksFromResponse({ error: "nope" })).toEqual([]);
    expect(backgroundTaskFromRecord("shell-1")).toBeNull();
  });
});

describe("finishedTaskToolCallsKey", () => {
  it("names the finished calls that started or stopped a task, and changes only when another finishes", () => {
    const calls = [
      { id: "call-1", name: "execute_command", args: { command: "npm run build", run_in_background: true }, status: "done" },
      { id: "call-2", name: "execute_command", args: { command: "ls" }, status: "done" },
      { id: "call-3", name: "monitor", args: { command: "tail -f log", description: "log" }, status: "calling" },
      { id: "call-4", name: "read_file", args: { path: "/tmp/prism-1000/tasks/shell-1.output" }, status: "done" },
    ];
    expect(finishedTaskToolCallsKey(calls)).toBe("call-1");
    expect(finishedTaskToolCallsKey([...calls.slice(0, 2), { ...calls[2], status: "done" }, calls[3]])).toBe("call-1|call-3");
    expect(finishedTaskToolCallsKey([...calls, { id: "call-5", name: "task_stop", args: { task_id: "shell-1" }, status: "done" }])).toBe(
      "call-1|call-5",
    );
    expect(finishedTaskToolCallsKey([])).toBe("");
  });
});

describe("what the strip shows", () => {
  const running: BackgroundTask = { taskId: "b", taskType: "shell", status: "running", description: "", eventCount: 0, startedAt: iso(-5_000) };
  const justEnded: BackgroundTask = { taskId: "a", taskType: "monitor", status: "exited", exitCode: 0, description: "", eventCount: 2, startedAt: iso(-9_000), updatedAt: iso(-1_000) };
  const endedLongAgo: BackgroundTask = { ...justEnded, taskId: "c", updatedAt: iso(-FINISHED_TASK_VISIBLE_MILLISECONDS - 1) };
  const listedEnded: BackgroundTask = { taskId: "d", taskType: "shell", status: "completed", description: "", eventCount: 0 };

  it("every running task, and each one that ended a moment ago", () => {
    expect(visibleBackgroundTasks([running, justEnded, endedLongAgo, listedEnded], NOW).map((task) => task.taskId)).toEqual(["b", "a"]);
  });

  it("oldest first", () => {
    expect(sortBackgroundTasks([running, justEnded]).map((task) => task.taskId)).toEqual(["a", "b"]);
  });

  it("says how each one ended", () => {
    expect(
      (
        [
          ["running", undefined],
          ["completed", 0],
          ["failed", 1],
          ["exited", 3],
          ["killed", null],
          ["timeout", null],
          ["too_many_events", null],
          ["closed", null],
          ["lost", null],
        ] as const
      ).map(([status, exitCode]) => [backgroundTaskStatusLabel({ status, exitCode }), backgroundTaskOutcomeTone({ status, exitCode })]),
    ).toEqual([
      ["running", "neutral"],
      ["completed · exit 0", "ok"],
      ["failed · exit 1", "failed"],
      ["exited · exit 3", "failed"],
      ["stopped", "neutral"],
      ["timed out", "neutral"],
      ["stopped: too many events", "failed"],
      ["socket closed", "neutral"],
      ["lost", "failed"],
    ]);
    expect(backgroundTaskOutcomeTone({ status: "exited", exitCode: 0 })).toBe("ok");
    expect(backgroundTaskOutcomeTone({ status: "exited", exitCode: null })).toBe("neutral");
  });

  it("an age to the second", () => {
    expect([0, 999, 12_400, 65_000, 3_600_000 + 2 * 60_000 + 5_000, -50].map(formatTaskElapsed)).toEqual([
      "0s",
      "0s",
      "12s",
      "1m 05s",
      "1h 02m",
      "0s",
    ]);
  });
});
