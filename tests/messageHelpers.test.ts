import { describe, it, expect, vi } from "vitest";
import { prepareDisplayMessages } from "../src/utils/messageHelpers";
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
