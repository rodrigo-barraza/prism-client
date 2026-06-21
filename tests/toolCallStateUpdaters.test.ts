import { describe, it, expect } from "vitest";
import {
  applyToolExecutionToMessages,
  applyToolExecutionToActivity,
  applyToolCallToMessages,
  type ToolMessageSlice,
  type SegmentSnapshot,
} from "../src/utils/toolCallStateUpdaters";
import type { ToolCallEvent } from "../src/types/types";

// ─── Helpers ────────────────────────────────────────────────────

function makeSnapshot(
  overrides: Partial<SegmentSnapshot> = {},
): SegmentSnapshot {
  return {
    contentSegments: [],
    textFragments: [],
    thinkingFragments: [],
    ...overrides,
  };
}

function makeAssistantMsg(
  overrides: Partial<ToolMessageSlice> = {},
): ToolMessageSlice {
  return {
    role: "assistant",
    content: "",
    toolCalls: [],
    ...overrides,
  };
}

function makeUserMsg(text = "hello"): ToolMessageSlice {
  return { role: "user", content: text };
}

// ─── applyToolExecutionToMessages ───────────────────────────────

describe("applyToolExecutionToMessages", () => {
  describe("status = calling", () => {
    it("adds a new tool call with 'calling' status to an existing assistant message", () => {
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ content: "Let me help." }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-1",
        {
          id: "tc-1",
          name: "web_search",
          args: { q: "test" },
          status: "calling",
        },
        makeSnapshot(),
      );

      expect(result).toHaveLength(2);
      expect(result[1].role).toBe("assistant");
      expect(result[1].toolCalls).toHaveLength(1);
      expect(result[1].toolCalls![0]).toMatchObject({
        id: "tc-1",
        name: "web_search",
        status: "calling",
        args: { q: "test" },
      });
      // Original content preserved
      expect(result[1].content).toBe("Let me help.");
    });

    it("creates a placeholder assistant message if none exists", () => {
      const messages: ToolMessageSlice[] = [makeUserMsg()];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-1",
        {
          id: "tc-1",
          name: "read_file",
          args: { path: "/a" },
          status: "calling",
        },
        makeSnapshot({ textFragments: ["partial text"] }),
      );

      expect(result).toHaveLength(2);
      expect(result[1].role).toBe("assistant");
      expect(result[1].content).toBe("");
      expect(result[1].toolCalls).toHaveLength(1);
      expect(result[1].toolCalls![0].status).toBe("calling");
      expect(result[1].textFragments).toEqual(["partial text"]);
    });

    it("deduplicates: does not add the same tool ID twice", () => {
      const existingTool: ToolCallEvent = {
        id: "tc-1",
        name: "web_search",
        args: {},
        status: "calling",
        timestamp: 1000,
      };
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ toolCalls: [existingTool] }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-1",
        { id: "tc-1", name: "web_search", args: {}, status: "calling" },
        makeSnapshot(),
      );

      expect(result[1].toolCalls).toHaveLength(1);
      expect(result[1].toolCalls![0]).toBe(existingTool); // Same reference
    });

    it("appends to existing tool calls when multiple tools are called", () => {
      const tool1: ToolCallEvent = {
        id: "tc-1",
        name: "web_search",
        args: {},
        status: "calling",
        timestamp: 1000,
      };
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ toolCalls: [tool1] }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-2",
        {
          id: "tc-2",
          name: "read_file",
          args: { path: "/b" },
          status: "calling",
        },
        makeSnapshot(),
      );

      expect(result[1].toolCalls).toHaveLength(2);
      expect(result[1].toolCalls![0].id).toBe("tc-1");
      expect(result[1].toolCalls![1].id).toBe("tc-2");
      expect(result[1].toolCalls![1].status).toBe("calling");
    });
  });

  describe("status = done", () => {
    it("updates an existing 'calling' tool to 'done' with result", () => {
      const callingTool: ToolCallEvent = {
        id: "tc-1",
        name: "web_search",
        args: { q: "test" },
        status: "calling",
        timestamp: 1000,
      };
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ content: "Searching...", toolCalls: [callingTool] }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-1",
        {
          id: "tc-1",
          name: "web_search",
          args: { q: "test" },
          status: "done",
          result: { results: ["found it"] },
        },
        makeSnapshot(),
      );

      expect(result[1].toolCalls).toHaveLength(1);
      expect(result[1].toolCalls![0]).toMatchObject({
        id: "tc-1",
        name: "web_search",
        status: "done",
        result: { results: ["found it"] },
      });
      // Content preserved
      expect(result[1].content).toBe("Searching...");
    });

    it("preserves other tool calls when updating one to done", () => {
      const tool1: ToolCallEvent = {
        id: "tc-1",
        name: "web_search",
        args: {},
        status: "done",
        result: "ok",
      };
      const tool2: ToolCallEvent = {
        id: "tc-2",
        name: "read_file",
        args: { path: "/a" },
        status: "calling",
        timestamp: 2000,
      };
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ toolCalls: [tool1, tool2] }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-2",
        {
          id: "tc-2",
          name: "read_file",
          args: { path: "/a" },
          status: "done",
          result: "file contents",
        },
        makeSnapshot(),
      );

      expect(result[1].toolCalls).toHaveLength(2);
      expect(result[1].toolCalls![0].status).toBe("done");
      expect(result[1].toolCalls![1].status).toBe("done");
      expect(result[1].toolCalls![1].result).toBe("file contents");
    });

    it("matches by name+status when tool has no ID", () => {
      const callingTool: ToolCallEvent = {
        id: "generated-id",
        name: "web_search",
        args: {},
        status: "calling",
        timestamp: 1000,
      };
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ toolCalls: [callingTool] }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "different-id",
        {
          id: undefined,
          name: "web_search",
          args: {},
          status: "done",
          result: { ok: true },
        },
        makeSnapshot(),
      );

      expect(result[1].toolCalls![0].status).toBe("done");
    });
  });

  describe("status = error", () => {
    it("updates a calling tool to error status", () => {
      const callingTool: ToolCallEvent = {
        id: "tc-1",
        name: "exec_shell",
        args: { cmd: "ls" },
        status: "calling",
        timestamp: 1000,
      };
      const messages: ToolMessageSlice[] = [
        makeUserMsg(),
        makeAssistantMsg({ toolCalls: [callingTool] }),
      ];

      const result = applyToolExecutionToMessages(
        messages,
        "tc-1",
        {
          id: "tc-1",
          name: "exec_shell",
          args: { cmd: "ls" },
          status: "error",
          result: { error: "permission denied" },
        },
        makeSnapshot(),
      );

      expect(result[1].toolCalls![0].status).toBe("error");
      expect(result[1].toolCalls![0].result).toEqual({
        error: "permission denied",
      });
    });
  });

  describe("immutability", () => {
    it("does not mutate the input messages array", () => {
      const messages: ToolMessageSlice[] = [makeUserMsg(), makeAssistantMsg()];
      const original = [...messages];

      applyToolExecutionToMessages(
        messages,
        "tc-1",
        { id: "tc-1", name: "test", args: {}, status: "calling" },
        makeSnapshot(),
      );

      expect(messages).toEqual(original);
    });

    it("does not mutate the last message object", () => {
      const lastMessage = makeAssistantMsg({ content: "hello" });
      const messages: ToolMessageSlice[] = [makeUserMsg(), lastMessage];

      applyToolExecutionToMessages(
        messages,
        "tc-1",
        { id: "tc-1", name: "test", args: {}, status: "calling" },
        makeSnapshot(),
      );

      expect(lastMessage.toolCalls).toEqual([]); // Unchanged
    });
  });

  describe("sequential calling → done (simulating real SSE flow)", () => {
    it("calling then done produces correct final state", () => {
      const snapshot = makeSnapshot();

      // Step 1: Tool starts calling
      const step1 = applyToolExecutionToMessages(
        [makeUserMsg(), makeAssistantMsg({ content: "thinking..." })],
        "tc-1",
        {
          id: "tc-1",
          name: "web_search",
          args: { q: "test" },
          status: "calling",
        },
        snapshot,
      );

      expect(step1[1].toolCalls).toHaveLength(1);
      expect(step1[1].toolCalls![0].status).toBe("calling");

      // Step 2: Tool completes
      const step2 = applyToolExecutionToMessages(
        step1,
        "tc-1",
        {
          id: "tc-1",
          name: "web_search",
          args: { q: "test" },
          status: "done",
          result: { data: "found" },
        },
        snapshot,
      );

      expect(step2[1].toolCalls).toHaveLength(1);
      expect(step2[1].toolCalls![0].status).toBe("done");
      expect(step2[1].toolCalls![0].result).toEqual({ data: "found" });
      // Content still preserved
      expect(step2[1].content).toBe("thinking...");
    });

    it("multiple tools: calling A → calling B → done A → done B", () => {
      const snapshot = makeSnapshot();
      let msgs: ToolMessageSlice[] = [makeUserMsg(), makeAssistantMsg()];

      // Tool A starts
      msgs = applyToolExecutionToMessages(
        msgs,
        "tc-a",
        {
          id: "tc-a",
          name: "tool_a",
          args: {},
          status: "calling",
        },
        snapshot,
      );
      expect(msgs[1].toolCalls).toHaveLength(1);

      // Tool B starts
      msgs = applyToolExecutionToMessages(
        msgs,
        "tc-b",
        {
          id: "tc-b",
          name: "tool_b",
          args: {},
          status: "calling",
        },
        snapshot,
      );
      expect(msgs[1].toolCalls).toHaveLength(2);
      expect(msgs[1].toolCalls!.every((toolCall) => toolCall.status === "calling")).toBe(
        true,
      );

      // Tool A completes
      msgs = applyToolExecutionToMessages(
        msgs,
        "tc-a",
        {
          id: "tc-a",
          name: "tool_a",
          args: {},
          status: "done",
          result: "a-result",
        },
        snapshot,
      );
      expect(msgs[1].toolCalls![0].status).toBe("done");
      expect(msgs[1].toolCalls![1].status).toBe("calling");

      // Tool B completes
      msgs = applyToolExecutionToMessages(
        msgs,
        "tc-b",
        {
          id: "tc-b",
          name: "tool_b",
          args: {},
          status: "done",
          result: "b-result",
        },
        snapshot,
      );
      expect(msgs[1].toolCalls!.every((toolCall) => toolCall.status === "done")).toBe(true);
    });
  });
});

// ─── applyToolExecutionToActivity ───────────────────────────────

describe("applyToolExecutionToActivity", () => {
  it("adds a new tool when calling", () => {
    const result = applyToolExecutionToActivity([], "tc-1", {
      id: "tc-1",
      name: "web_search",
      args: { q: "test" },
      status: "calling",
    });

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({
      id: "tc-1",
      name: "web_search",
      status: "calling",
    });
  });

  it("returns null for duplicate calling events", () => {
    const existing: ToolCallEvent[] = [
      {
        id: "tc-1",
        name: "web_search",
        args: {},
        status: "calling",
        timestamp: 1000,
      },
    ];

    const result = applyToolExecutionToActivity(existing, "tc-1", {
      id: "tc-1",
      name: "web_search",
      args: {},
      status: "calling",
    });

    expect(result).toBeNull();
  });

  it("updates status to done for matching tool", () => {
    const existing: ToolCallEvent[] = [
      {
        id: "tc-1",
        name: "web_search",
        args: {},
        status: "calling",
        timestamp: 1000,
      },
    ];

    const result = applyToolExecutionToActivity(existing, "tc-1", {
      id: "tc-1",
      name: "web_search",
      args: {},
      status: "done",
      result: { ok: true },
    });

    expect(result).not.toBeNull();
    expect(result![0].status).toBe("done");
    expect(result![0].result).toEqual({ ok: true });
  });

  it("preserves unrelated tools when updating one", () => {
    const existing: ToolCallEvent[] = [
      { id: "tc-1", name: "tool_a", args: {}, status: "done", timestamp: 1000 },
      {
        id: "tc-2",
        name: "tool_b",
        args: {},
        status: "calling",
        timestamp: 2000,
      },
    ];

    const result = applyToolExecutionToActivity(existing, "tc-2", {
      id: "tc-2",
      name: "tool_b",
      args: {},
      status: "done",
      result: "ok",
    });

    expect(result![0]).toBe(existing[0]); // Same reference — untouched
    expect(result![1].status).toBe("done");
  });
});

// ─── applyToolCallToMessages (MCP path) ─────────────────────────

describe("applyToolCallToMessages", () => {
  it("adds calling tool to messages (MCP path)", () => {
    const messages: ToolMessageSlice[] = [makeUserMsg(), makeAssistantMsg()];
    const toolData: ToolCallEvent = {
      id: "mcp-1",
      name: "mcp_tool",
      args: { key: "val" },
      status: "calling",
    };

    const result = applyToolCallToMessages(
      messages,
      "mcp-1",
      toolData,
      makeSnapshot(),
    );

    expect(result[1].toolCalls).toHaveLength(1);
    expect(result[1].toolCalls![0]).toMatchObject({
      id: "mcp-1",
      name: "mcp_tool",
      status: "calling",
    });
  });

  it("updates calling tool to done (MCP path)", () => {
    const calling: ToolCallEvent = {
      id: "mcp-1",
      name: "mcp_tool",
      args: { key: "val" },
      status: "calling",
      timestamp: 1000,
    };
    const messages: ToolMessageSlice[] = [
      makeUserMsg(),
      makeAssistantMsg({ toolCalls: [calling] }),
    ];
    const toolData: ToolCallEvent = {
      id: "mcp-1",
      name: "mcp_tool",
      args: { key: "val" },
      status: "done",
      result: { output: "success" },
    };

    const result = applyToolCallToMessages(
      messages,
      "mcp-1",
      toolData,
      makeSnapshot(),
    );

    expect(result[1].toolCalls).toHaveLength(1);
    expect(result[1].toolCalls![0].status).toBe("done");
    expect(result[1].toolCalls![0].result).toEqual({ output: "success" });
  });

  it("creates placeholder when no assistant message exists (MCP path)", () => {
    const messages: ToolMessageSlice[] = [makeUserMsg()];
    const toolData: ToolCallEvent = {
      id: "mcp-1",
      name: "mcp_tool",
      args: {},
      status: "calling",
    };

    const result = applyToolCallToMessages(
      messages,
      "mcp-1",
      toolData,
      makeSnapshot(),
    );

    expect(result).toHaveLength(2);
    expect(result[1].role).toBe("assistant");
    expect(result[1].content).toBe("");
    expect(result[1].toolCalls).toHaveLength(1);
  });
});

// ─── Regression: large tool results (convert_image_to_ascii) ────

describe("regression: large tool results", () => {
  it("preserves all messages when tool returns a very large result", () => {
    const snapshot = makeSnapshot();
    const largeAsciiResult = "X".repeat(200_000); // 200KB of ASCII art

    // Build up state: user msg → assistant → tool calling → tool done
    let msgs: ToolMessageSlice[] = [
      makeUserMsg("Convert this image to ASCII"),
      makeAssistantMsg({ content: "I'll convert that image for you." }),
    ];

    // Tool starts calling
    msgs = applyToolExecutionToMessages(
      msgs,
      "tc-ascii",
      {
        id: "tc-ascii",
        name: "convert_image_to_ascii",
        args: { input: "https://example.com/photo.jpg", width: 100 },
        status: "calling",
      },
      snapshot,
    );

    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("Convert this image to ASCII");
    expect(msgs[1].toolCalls).toHaveLength(1);

    // Tool completes with large result
    msgs = applyToolExecutionToMessages(
      msgs,
      "tc-ascii",
      {
        id: "tc-ascii",
        name: "convert_image_to_ascii",
        args: { input: "https://example.com/photo.jpg", width: 100 },
        status: "done",
        result: {
          success: true,
          ascii: largeAsciiResult,
          ansi: "\x1b[38;2;0;0;0m" + "X".repeat(50_000),
          width: 100,
          height: 55,
          asciiEmbedUrl:
            "https://api.prism.rod.dev/compute/image/ascii/embed?id=abc",
        },
      },
      snapshot,
    );

    // Critical: all messages must still be present
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Convert this image to ASCII");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("I'll convert that image for you.");
    expect(msgs[1].toolCalls).toHaveLength(1);
    expect(msgs[1].toolCalls![0].status).toBe("done");
    expect(
      (msgs[1].toolCalls![0].result as Record<string, unknown>).success,
    ).toBe(true);
  });

  it("snapshot values are preserved on the message after tool completion", () => {
    const segments = [
      { type: "text" as const, fragmentIndex: 0 },
      { type: "tools" as const, toolIds: ["tc-1"] },
    ];
    const snapshot = makeSnapshot({
      contentSegments: segments,
      textFragments: ["Here is the result:"],
      thinkingFragments: ["Let me think..."],
    });

    const msgs = applyToolExecutionToMessages(
      [makeUserMsg(), makeAssistantMsg({ content: "Processing..." })],
      "tc-1",
      {
        id: "tc-1",
        name: "convert_image_to_ascii",
        args: {},
        status: "done",
        result: { ok: true },
      },
      snapshot,
    );

    expect(msgs[1].contentSegments).toEqual(segments);
    expect(msgs[1].textFragments).toEqual(["Here is the result:"]);
    expect(msgs[1].thinkingFragments).toEqual(["Let me think..."]);
  });
});
