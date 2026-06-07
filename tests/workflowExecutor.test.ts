import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeWorkflow, abortWorkflow } from "../src/services/WorkflowExecutor";

describe("WorkflowExecutor Client", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createMockSseResponse(events: string[]) {
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      },
    });

    return {
      ok: true,
      status: 200,
      body: readableStream,
      json: async () => ({}),
    } as unknown as Response;
  }

  it("should parse SSE stream and return final results on run_complete", async () => {
    const mockEvents = [
      'data: {"type":"node_start","nodeId":"node-1"}\n\n',
      'data: {"type":"node_complete","nodeId":"node-1","outputs":{"text":"hello"}}\n\n',
      'data: {"type":"run_complete","nodeResults":{"node-1":{"text":"hello"}},"conversationIds":["conv-1"]}\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue(createMockSseResponse(mockEvents));

    const onNodeStart = vi.fn();
    const onNodeComplete = vi.fn();

    const result = await executeWorkflow("workflow-123", [], [], {
      onNodeStart,
      onNodeComplete,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/workflows/workflow-123/run"),
      expect.objectContaining({
        method: "POST",
      }),
    );

    expect(onNodeStart).toHaveBeenCalledWith("node-1");
    expect(onNodeComplete).toHaveBeenCalledWith("node-1", { text: "hello" });
    expect(result.nodeOutputs).toEqual({ "node-1": { text: "hello" } });
    expect(result.conversationIds).toEqual(["conv-1"]);
  });

  it("should trigger callbacks for node errors and viewer partials", async () => {
    const mockEvents = [
      'data: {"type":"node_error","nodeId":"node-1","error":"Something went wrong"}\n\n',
      'data: {"type":"viewer_partial","nodeId":"viewer-1","outputs":{"text":"partial"}}\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue(createMockSseResponse(mockEvents));

    const onNodeError = vi.fn();
    const onViewerPartial = vi.fn();

    await executeWorkflow("workflow-123", [], [], {
      onNodeError,
      onViewerPartial,
    });

    expect(onNodeError).toHaveBeenCalledWith("node-1", "Something went wrong");
    expect(onViewerPartial).toHaveBeenCalledWith("viewer-1", { text: "partial" });
  });

  it("should throw error if fetch response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    } as unknown as Response);

    await expect(executeWorkflow("workflow-123", [], [], {})).rejects.toThrow(
      "Internal Server Error",
    );
  });

  it("should send abort request to backend on abortWorkflow", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ aborted: true }),
    } as unknown as Response);

    await abortWorkflow("workflow-123");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/workflows/workflow-123/abort"),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
