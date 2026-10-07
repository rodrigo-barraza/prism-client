import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import useAgentConversation from "../useAgentConversation";
import useBackgroundTasks, { BACKGROUND_TASK_POLL_INTERVAL_MILLISECONDS } from "../useBackgroundTasks";

vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
}));

/**
 * The strip's tasks: a stored conversation that opens is listed
 * (GET /conversations/:id/tasks) — one this chat is sending is not; the list
 * is fetched again while a task runs; Stop asks the service
 * (POST /tasks/:taskId/stop) and lists again, and a refused stop says why.
 */

interface RecordedRequest {
  method: string;
  path: string;
}

let requests: RecordedRequest[] = [];
let listedTasks: unknown[] = [];
let stopAnswer: { status: number; body: unknown } = { status: 200, body: { stopped: true, status: "killed" } };

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  requests = [];
  listedTasks = [];
  stopAnswer = { status: 200, body: { stopped: true, status: "killed" } };
  vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    const parsed = new URL(String(url), "http://localhost");
    const path = `${parsed.pathname}${parsed.search}`;
    requests.push({ method: init?.method ?? "GET", path });
    if (/\/tasks\/[^/]+\/stop$/.test(parsed.pathname)) return jsonResponse(stopAnswer.status, stopAnswer.body);
    if (parsed.pathname.endsWith("/tasks")) return jsonResponse(200, { tasks: listedTasks });
    return jsonResponse(404, { error: "not routed" });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const RUNNING_SHELL = {
  taskId: "shell-ab12cd34",
  taskType: "shell",
  status: "running",
  description: "Build the client",
  command: "npm run build",
  outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
  startedAt: "2026-10-06T12:00:00.000Z",
  eventCount: 0,
};

function renderTasks({
  activeId = "conv-1",
  clientDrivenId = null as string | null,
  isEnabled = true,
} = {}) {
  const clientDrivenConversationIdRef = { current: clientDrivenId };
  return renderHook(
    ({ id }) => {
      const conversation = useAgentConversation();
      return useBackgroundTasks({
        conversationId: id ?? "conv-new",
        activeId: id,
        project: "prism-chat",
        conversation,
        clientDrivenConversationIdRef,
        isEnabled,
      });
    },
    { initialProps: { id: activeId as string | null } },
  );
}

const listRequests = () => requests.filter((request) => request.path.includes("/tasks?") || request.path.endsWith("/tasks"));

describe("useBackgroundTasks", () => {
  it("lists a stored conversation's tasks when it opens", async () => {
    listedTasks = [RUNNING_SHELL];
    const { result } = renderTasks();
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(requests[0]).toEqual({ method: "GET", path: "/conversations/conv-1/tasks?project=prism-chat" });
    expect(result.current.tasks[0]).toMatchObject({
      taskId: "shell-ab12cd34",
      taskType: "shell",
      status: "running",
      description: "Build the client",
      outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
    });
  });

  it("lists nothing for a conversation this chat is sending, nor when disabled, nor for a new one", async () => {
    renderTasks({ clientDrivenId: "conv-1" });
    renderTasks({ isEnabled: false });
    renderTasks({ activeId: null as unknown as string });
    await act(async () => {});
    expect(requests).toEqual([]);
  });

  it("lists again when a tool call of the turn this chat sent started a task", async () => {
    const clientDrivenConversationIdRef = { current: "conv-1" as string | null };
    const { result } = renderHook(() => {
      const conversation = useAgentConversation();
      const tasks = useBackgroundTasks({
        conversationId: "conv-1",
        activeId: "conv-1",
        project: "prism-chat",
        conversation,
        clientDrivenConversationIdRef,
        isEnabled: true,
      });
      return { conversation, tasks };
    });
    await act(async () => {});
    // This chat is sending the conversation's turn: nothing listed on open.
    expect(listRequests()).toEqual([]);

    listedTasks = [RUNNING_SHELL];
    const call = { id: "call-1", name: "execute_command", args: { command: "npm run build", run_in_background: true } };
    act(() => {
      result.current.conversation.setToolActivity([{ ...call, status: "calling" }]);
    });
    await act(async () => {});
    expect(listRequests()).toEqual([]);
    act(() => {
      result.current.conversation.setToolActivity([{ ...call, status: "done", result: { backgrounded: true, taskId: "shell-ab12cd34" } }]);
    });
    await waitFor(() => expect(result.current.tasks.tasks).toHaveLength(1));
    expect(listRequests()).toHaveLength(1);
  });

  it("lists again while a task runs, and stops once none does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listedTasks = [RUNNING_SHELL];
    const { result } = renderTasks();
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(listRequests()).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKGROUND_TASK_POLL_INTERVAL_MILLISECONDS);
    });
    expect(listRequests()).toHaveLength(2);

    listedTasks = [{ ...RUNNING_SHELL, status: "completed", exitCode: 0, endedAt: "2026-10-06T12:02:00.000Z" }];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKGROUND_TASK_POLL_INTERVAL_MILLISECONDS);
    });
    expect(result.current.tasks[0]).toMatchObject({ status: "completed", exitCode: 0 });
    const afterEnd = listRequests().length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKGROUND_TASK_POLL_INTERVAL_MILLISECONDS * 3);
    });
    expect(listRequests()).toHaveLength(afterEnd);
  });

  it("stops a task through the service and lists again", async () => {
    listedTasks = [RUNNING_SHELL];
    const { result } = renderTasks();
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    listedTasks = [{ ...RUNNING_SHELL, status: "killed", exitCode: null }];
    await act(async () => {
      await result.current.stop("shell-ab12cd34");
    });
    expect(requests.filter((request) => request.method === "POST")).toEqual([
      { method: "POST", path: "/tasks/shell-ab12cd34/stop" },
    ]);
    expect(result.current.tasks[0].status).toBe("killed");
    expect(result.current.stopRequestedTaskIds.has("shell-ab12cd34")).toBe(true);
    expect(result.current.stopErrors).toEqual({});
  });

  it("says why a stop was refused", async () => {
    listedTasks = [RUNNING_SHELL];
    stopAnswer = { status: 200, body: { stopped: false, status: "completed" } };
    const { result } = renderTasks();
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => {
      await result.current.stop("shell-ab12cd34");
    });
    expect(result.current.stopErrors).toEqual({ "shell-ab12cd34": "Already completed" });
    expect(result.current.stopRequestedTaskIds.size).toBe(0);

    stopAnswer = { status: 404, body: { error: "Task not found" } };
    await act(async () => {
      await result.current.stop("shell-ab12cd34");
    });
    expect(result.current.stopErrors).toEqual({ "shell-ab12cd34": "Task not found" });
  });
});
