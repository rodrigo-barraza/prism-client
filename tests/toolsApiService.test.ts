import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import ToolsApiService from "../src/services/ToolsApiService";
import { TOOLS_SERVICE_URL } from "../src/config";

describe("ToolsApiService", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should query tool calls with correct query parameters", async () => {
    const mockTelemetryResponse = {
      total: 1,
      count: 1,
      toolCalls: [],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTelemetryResponse,
    });

    const result = await ToolsApiService.getToolCalls({
      limit: 10,
      status: "success",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/admin/tool-calls?limit=10&status=success`,
    );
    expect(result).toEqual(mockTelemetryResponse);
  });

  it("should fetch a single tool call log entry by ID", async () => {
    const mockEntry = {
      _id: "log-id-123",
      tool: "search_web",
      status: "completed",
      timestamp: "2026-06-06T00:00:00Z",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockEntry,
    });

    const result = await ToolsApiService.getToolCall("log-id-123");

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/admin/tool-calls/log-id-123`,
    );
    expect(result).toEqual(mockEntry);
  });

  it("should fetch tool call statistics", async () => {
    const mockStatsResponse = {
      stats: [],
      total: 0,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStatsResponse,
    });

    const result = await ToolsApiService.getToolCallStats({
      project: "my-project",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/admin/tool-calls/stats?project=my-project`,
    );
    expect(result).toEqual(mockStatsResponse);
  });

  it("should fetch agentic tasks for project via POST", async () => {
    const mockTaskList = {
      project: "my-project",
      tasks: [],
      summary: {},
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTaskList,
    });

    const result = await ToolsApiService.getAgenticTasks("my-project", {
      status: "pending",
      limit: 5,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/agentic/task/list`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project: "my-project",
          status: "pending",
          limit: 5,
        }),
      }),
    );
    expect(result).toEqual(mockTaskList);
  });

  it("should fetch all agentic tasks via GET", async () => {
    const mockTaskList = {
      tasks: [],
      summary: {},
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTaskList,
    });

    const result = await ToolsApiService.getAllAgenticTasks({
      status: "active",
      conversationId: "session-1",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/agentic/task/list-all?status=active&conversationId=session-1`,
    );
    expect(result).toEqual(mockTaskList);
  });

  it("should create a new agentic task", async () => {
    const mockCreateResponse = {
      task: { taskId: "task-01", project: "my-project", title: "New Task" },
      message: "Task created successfully",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockCreateResponse,
    });

    const result = await ToolsApiService.createAgenticTask("my-project", {
      title: "New Task",
      priority: "high",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/agentic/task/create`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project: "my-project",
          title: "New Task",
          priority: "high",
        }),
      }),
    );
    expect(result).toEqual(mockCreateResponse);
  });

  it("should update an agentic task", async () => {
    const mockUpdateResponse = {
      task: { taskId: "task-01", project: "my-project", title: "Updated Task" },
      message: "Task updated successfully",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUpdateResponse,
    });

    const result = await ToolsApiService.updateAgenticTask(
      "my-project",
      "task-01",
      {
        title: "Updated Task",
      },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/agentic/task/update`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project: "my-project",
          taskId: "task-01",
          title: "Updated Task",
        }),
      }),
    );
    expect(result).toEqual(mockUpdateResponse);
  });

  it("should delete an agentic task", async () => {
    const mockDeleteResponse = {
      deleted: true,
      taskId: "task-01",
      message: "Task deleted successfully",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDeleteResponse,
    });

    const result = await ToolsApiService.deleteAgenticTask(
      "my-project",
      "task-01",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/agentic/task/delete`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project: "my-project",
          taskId: "task-01",
        }),
      }),
    );
    expect(result).toEqual(mockDeleteResponse);
  });

  it("should read a file's contents via file service", async () => {
    const mockFileContent = {
      path: "/some/file.txt",
      content: "Hello World",
      totalLines: 1,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockFileContent,
    });

    const result = await ToolsApiService.readFile("/some/file.txt", {
      startLine: 1,
      endLine: 5,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${TOOLS_SERVICE_URL}/agentic/file/read`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          path: "/some/file.txt",
          startLine: 1,
          endLine: 5,
        }),
      }),
    );
    expect(result).toEqual(mockFileContent);
  });

  it("should format binary file streaming URL correctly", () => {
    const result = ToolsApiService.getFileRawUrl("/some/image.png");
    expect(result).toBe(
      `${TOOLS_SERVICE_URL}/agentic/file/raw?path=%2Fsome%2Fimage.png`,
    );
  });

  it("should throw an error with backend message when post fails", async () => {
    const errorBody = { error: "Custom backend violation" };
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => errorBody,
    });

    await expect(
      ToolsApiService.deleteAgenticTask("my-project", "task-01"),
    ).rejects.toThrow("Custom backend violation");
  });

  it("should fall back to standard error format if parsing error fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("Cannot parse JSON");
      },
    });

    await expect(
      ToolsApiService.deleteAgenticTask("my-project", "task-01"),
    ).rejects.toThrow("tools-api error: 502");
  });
});
