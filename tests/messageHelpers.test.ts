import { describe, it, expect, vi } from "vitest";
import { prepareDisplayMessages, resolveDisplayMessages } from "../src/utils/messageHelpers";
import type { Message, ToolCallEvent } from "../src/types/types";

describe("messageHelpers - prepareDisplayMessages", () => {
  it("should return empty array if input is empty, null, or undefined", () => {
    expect(prepareDisplayMessages(undefined)).toEqual([]);
    expect(prepareDisplayMessages(null)).toEqual([]);
    expect(prepareDisplayMessages([])).toEqual([]);
  });

  it("should normalize snake_case tool_calls to camelCase toolCalls", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        content: "calling tool",
        tool_calls: [
          {
            id: "call-1",
            name: "",
            function: {
              name: "fn-name",
            },
            args: '{"param": 123}',
            status: "pending",
          },
          {
            id: "call-2",
            function: {
              arguments: '{"param": "val"}',
            },
            status: "completed",
          },
        ] as any[],
      },
    ];

    const result = prepareDisplayMessages(rawMessages);
    expect(result).toHaveLength(1);
    expect(result[0].toolCalls).toBeDefined();
    expect(result[0].toolCalls![0].name).toBe("fn-name");
    expect(result[0].toolCalls![1].name).toBe("");
  });

  it("should handle object type args or fallback to empty object if args/arguments invalid", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call-1",
            name: "test-tool",
            args: { param: 123 },
          },
          {
            id: "call-2",
            function: {
              name: "fallback-tool",
              arguments: null,
            },
          },
        ] as any[],
      },
    ];

    const result = prepareDisplayMessages(rawMessages);
    expect(result[0].toolCalls![0].args).toEqual({ param: 123 });
    expect(result[0].toolCalls![1].args).toEqual({});
  });

  it("should filter out empty assistant messages with no content, toolCalls, images, audio, or error", () => {
    const rawMessages: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "" }, // empty assistant
      { role: "assistant", content: " " }, // empty assistant
      { role: "assistant", content: undefined as unknown as string }, // empty assistant
      { role: "assistant", content: "", toolCalls: [] }, // empty assistant (empty toolCalls list)
      { role: "assistant", content: "hello from assistant" }, // should keep
      { role: "assistant", content: "", images: ["img-url"] }, // should keep because of images
      { role: "assistant", content: "", audio: "audio-url" }, // should keep because of audio
      { role: "assistant", content: "", error: "something failed" }, // should keep because of error
    ];

    const result = prepareDisplayMessages(rawMessages);
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe("user");
    expect(result[1].content).toBe("hello from assistant");
    expect(result[2].images).toEqual(["img-url"]);
    expect(result[3].audio).toBe("audio-url");
    expect(result[4].error).toBe("something failed");
  });

  it("should log a warning if all messages are filtered out", () => {
    const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const rawMessages: Message[] = [
      { role: "assistant", content: "" }
    ];
    const result = prepareDisplayMessages(rawMessages);
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[prepareDisplayMessages] output: 0 messages"),
      "⚠️ ALL MESSAGES FILTERED — this will empty the chat!"
    );
    consoleSpy.mockRestore();
  });

  it("should filter out tool messages but merge their result into corresponding assistant toolCalls", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        toolCalls: [
          { id: "call-1", name: "tool-1", args: {}, result: "already-set-result" },
          { id: "call-2", name: "tool-2", args: {} },
          { id: "call-3", name: "tool-3", args: {}, tool_call_id: "call-3" } as any,
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: "new result of tool 1",
      },
      {
        role: "tool",
        toolCallId: "", // empty id
        content: "should not crash",
      },
      {
        role: "tool",
        toolCallId: "call-2",
        content: "", // empty content
      },
      {
        role: "tool",
        tool_call_id: "call-3",
        content: "matched by snake tool_call_id",
      },
    ] as Message[];

    const result = prepareDisplayMessages(rawMessages);
    expect(result).toHaveLength(1); // tool messages filtered out
    expect(result[0].toolCalls![0].result).toBe("already-set-result"); // kept original result
    expect(result[0].toolCalls![1].result).toBe(null); // merged empty content falls back to null
    expect(result[0].toolCalls![2].result).toBe("matched by snake tool_call_id");
  });

  it("should extract audioRef from tool call results and merge into message audio", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        toolCalls: [
          { id: "call-1", name: "tts-tool", args: {} },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: '{"audioRef": "minio://audio-file.wav"}',
      },
    ] as Message[];

    const result = prepareDisplayMessages(rawMessages);
    expect(result[0].audio).toEqual(["minio://audio-file.wav"]);
  });

  it("should extract base64 audio data from tool call results and merge into message audio", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        audio: "existing-audio.mp3",
        toolCalls: [
          { id: "call-1", name: "tts-tool", args: {} },
          { id: "call-2", name: "tts-tool", args: {} },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: { audio: { data: "base64data..." } } as any, // missing mimeType
      },
      {
        role: "tool",
        toolCallId: "call-2",
        content: { audio: { data: "base64data..." } } as any, // duplicate source
      },
    ] as Message[];

    const result = prepareDisplayMessages(rawMessages);
    expect(result[0].audio).toEqual([
      "existing-audio.mp3",
      "data:audio/wav;base64,base64data...",
    ]);
  });

  it("should handle existing audio array and merge audio sources without duplication", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        audio: ["existing-1.mp3", "existing-2.mp3"],
        toolCalls: [
          { id: "call-1", name: "tts-tool", args: {} },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: '{"audioRef": "existing-1.mp3"}', // duplicate, should not add
      },
    ] as Message[];

    const result = prepareDisplayMessages(rawMessages);
    expect(result[0].audio).toEqual(["existing-1.mp3", "existing-2.mp3"]);
  });

  it("should handle plain text or invalid JSON string in tool results gracefully without breaking audio extraction", () => {
    const rawMessages: Message[] = [
      {
        role: "assistant",
        toolCalls: [
          { id: "call-1", name: "text-tool", args: {} },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: "not-json-content",
      },
    ] as Message[];

    const result = prepareDisplayMessages(rawMessages);
    expect(result[0].toolCalls![0].result).toBe("not-json-content");
    expect(result[0].audio).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolveDisplayMessages — ensures conversations always produce messages
// regardless of whether the backend provides displayMessages or not.
//
// This test suite exists because a regression blanked the /admin/chat view
// when the client stopped calling client-side prepareDisplayMessages and
// depended solely on the backend field.
// ─────────────────────────────────────────────────────────────────────────

describe("messageHelpers - resolveDisplayMessages", () => {
  // ── Happy path: backend provides displayMessages ─────────────────────

  it("should return backend-provided displayMessages when present and non-empty", () => {
    const backendDisplayMessages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const result = resolveDisplayMessages({
      displayMessages: backendDisplayMessages,
      messages: [
        { role: "user", content: "Hello" },
        { role: "tool", content: "tool result" },
        { role: "assistant", content: "Hi there!" },
      ],
    });
    expect(result).toBe(backendDisplayMessages);
    expect(result).toHaveLength(2);
  });

  it("should return exact backend reference without re-processing when displayMessages exists", () => {
    const backendDisplayMessages: Message[] = [
      { role: "user", content: "test" },
    ];
    const result = resolveDisplayMessages({ displayMessages: backendDisplayMessages });
    expect(result).toBe(backendDisplayMessages);
  });

  // ── Fallback: backend omits displayMessages entirely ─────────────────

  it("should fall back to client-side prepareDisplayMessages when displayMessages is undefined", () => {
    const result = resolveDisplayMessages({
      messages: [
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("What is 2+2?");
    expect(result[1].role).toBe("assistant");
    expect(result[1].content).toBe("4");
  });

  it("should fall back to client-side prepareDisplayMessages when displayMessages is null-ish", () => {
    const result = resolveDisplayMessages({
      displayMessages: undefined,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("hi");
    expect(result[1].content).toBe("hello");
  });

  it("should fall back when displayMessages is an empty array", () => {
    const result = resolveDisplayMessages({
      displayMessages: [],
      messages: [
        { role: "user", content: "test" },
        { role: "assistant", content: "response" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("test");
    expect(result[1].content).toBe("response");
  });

  // ── Fallback correctly processes raw messages (tool filtering) ───────

  it("should filter tool-role messages from raw messages during fallback", () => {
    const result = resolveDisplayMessages({
      messages: [
        { role: "user", content: "Search for X" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc-1", name: "web_search", args: { query: "X" } }],
        },
        { role: "tool", content: "Search results for X", toolCallId: "tc-1" },
        { role: "assistant", content: "Here are the results for X" },
      ],
    });
    expect(result).toHaveLength(3);
    expect(result.every((message) => message.role !== "tool")).toBe(true);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
    expect(result[1].toolCalls![0].result).toBe("Search results for X");
    expect(result[2].content).toBe("Here are the results for X");
  });

  it("should filter empty assistant stubs from raw messages during fallback", () => {
    const result = resolveDisplayMessages({
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "Real response" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("Hello");
    expect(result[1].content).toBe("Real response");
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  it("should return empty array when both displayMessages and messages are undefined", () => {
    const result = resolveDisplayMessages({});
    expect(result).toEqual([]);
  });

  it("should return empty array when both displayMessages and messages are empty", () => {
    const result = resolveDisplayMessages({
      displayMessages: [],
      messages: [],
    });
    expect(result).toEqual([]);
  });

  it("should return empty array when entry has no message fields at all", () => {
    const result = resolveDisplayMessages({
      displayMessages: undefined,
      messages: undefined,
    });
    expect(result).toEqual([]);
  });

  // ── Admin chat regression: conversation with only raw messages ──────

  it("should produce non-empty output for a typical admin conversation with only raw messages (regression test)", () => {
    const typicalAgentConversation = {
      displayMessages: undefined,
      messages: [
        { role: "system" as const, content: "You are a helpful assistant." },
        { role: "user" as const, content: "What is the nutritional difference between yellow and green bananas?" },
        {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            { id: "call-1", name: "web_search", args: { query: "yellow vs green banana nutrition" } },
          ],
        },
        { role: "tool" as const, content: "Yellow bananas have more sugar...", toolCallId: "call-1" },
        { role: "assistant" as const, content: "Yellow bananas are riper and have more sugar, while green bananas have more resistant starch." },
      ],
    };
    const result = resolveDisplayMessages(typicalAgentConversation);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((message) => message.role === "user")).toBe(true);
    expect(result.some((message) => message.role === "assistant" && (message.content?.length ?? 0) > 0)).toBe(true);
    expect(result.every((message) => message.role !== "tool")).toBe(true);
  });

  it("should produce non-empty output for a direct conversation with only raw messages (regression test)", () => {
    const typicalDirectConversation = {
      displayMessages: undefined,
      messages: [
        { role: "user" as const, content: "Can we research what is stronger, popeye or goku?" },
        { role: "assistant" as const, content: "Great question! Goku is vastly more powerful..." },
      ],
    };
    const result = resolveDisplayMessages(typicalDirectConversation);
    expect(result).toHaveLength(2);
    expect(result[0].content).toContain("popeye");
    expect(result[1].content).toContain("Goku");
  });

  // ── Backend provides displayMessages — should NOT re-process ────────

  it("should not filter or modify backend-provided displayMessages even if they contain tool-role messages", () => {
    const backendMessages: Message[] = [
      { role: "user", content: "test" },
      { role: "tool", content: "tool-result" },
      { role: "assistant", content: "response" },
    ];
    const result = resolveDisplayMessages({ displayMessages: backendMessages });
    expect(result).toBe(backendMessages);
    expect(result).toHaveLength(3);
  });

  // ── Priority verification ──────────────────────────────────────────

  it("should prefer displayMessages over messages when both are present and non-empty", () => {
    const backendDisplayMessages: Message[] = [
      { role: "user", content: "processed-user" },
      { role: "assistant", content: "processed-assistant" },
    ];
    const rawMessages: Message[] = [
      { role: "user", content: "raw-user" },
      { role: "tool", content: "raw-tool" },
      { role: "assistant", content: "raw-assistant" },
    ];
    const result = resolveDisplayMessages({
      displayMessages: backendDisplayMessages,
      messages: rawMessages,
    });
    expect(result).toBe(backendDisplayMessages);
    expect(result[0].content).toBe("processed-user");
  });

  // ── Agent conversation shape (type: "agent") ──────────────────────

  it("should handle agent conversation API response shape correctly", () => {
    const agentConversationResponse = {
      id: "conv-123",
      type: "agent",
      title: "Test Agent Conversation",
      messages: [
        { role: "system" as const, content: "System prompt" },
        { role: "user" as const, content: "Do something" },
        {
          role: "assistant" as const,
          content: "I'll help with that",
          toolCalls: [{ id: "tc-1", name: "execute_code", args: { code: "print('hi')" } }],
        },
        { role: "tool" as const, content: "hi", toolCallId: "tc-1" },
        { role: "assistant" as const, content: "Done! The code printed 'hi'" },
      ],
    };
    const result = resolveDisplayMessages(agentConversationResponse);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((message) => message.role === "user")).toBe(true);
    expect(result.some((message) => message.content?.includes("Done!"))).toBe(true);
    expect(result.every((message) => message.role !== "tool")).toBe(true);
  });

  // ── Messages with thinking field should be preserved ───────────────

  it("should preserve assistant messages that have thinking content during fallback", () => {
    const result = resolveDisplayMessages({
      messages: [
        { role: "user", content: "Think about this" },
        { role: "assistant", content: "", thinking: "Let me think step by step..." },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[1].thinking).toBe("Let me think step by step...");
  });
});
