import { describe, it, expect } from "vitest";
import { collectPriorToolDisplayUrls } from "../utils";

const imageToolCall = (url: string) => ({
  result: { display: { kind: "image", url } },
});

const audioToolCall = (url: string) => ({
  result: { display: { kind: "audio", url } },
});

describe("collectPriorToolDisplayUrls", () => {
  it("collects image/audio display urls from earlier assistant messages in the turn", () => {
    // Persisted agentic-turn shape: intermediate assistant message carries
    // the tool calls, final assistant message carries the promoted media.
    const messages = [
      { role: "user" },
      {
        role: "assistant",
        toolCalls: [
          imageToolCall("minio://generations/pikachu.png"),
          audioToolCall("minio://generations/speech.wav"),
        ],
      },
      { role: "assistant" },
    ];
    const urls = collectPriorToolDisplayUrls(messages, 2);
    expect(urls).toEqual(
      new Set([
        "minio://generations/pikachu.png",
        "minio://generations/speech.wav",
      ]),
    );
  });

  it("does not include the current message's own tool display urls", () => {
    const messages = [
      { role: "user" },
      { role: "assistant", toolCalls: [imageToolCall("minio://a.png")] },
    ];
    expect(collectPriorToolDisplayUrls(messages, 1).size).toBe(0);
  });

  it("stops at a turn boundary (non-assistant message)", () => {
    const messages = [
      { role: "assistant", toolCalls: [imageToolCall("minio://old.png")] },
      { role: "user" },
      { role: "assistant" },
    ];
    expect(collectPriorToolDisplayUrls(messages, 2).size).toBe(0);
  });

  it("stops at deleted assistant messages", () => {
    const messages = [
      {
        role: "assistant",
        deleted: true,
        toolCalls: [imageToolCall("minio://deleted.png")],
      },
      { role: "assistant" },
    ];
    expect(collectPriorToolDisplayUrls(messages, 1).size).toBe(0);
  });

  it("ignores non-media display kinds and JSON-string results", () => {
    const messages = [
      {
        role: "assistant",
        toolCalls: [
          { result: { display: { kind: "embed", url: "https://e" } } },
          { result: { display: { kind: "code", sourceField: "banner" } } },
          {
            result: JSON.stringify({
              display: { kind: "image", url: "minio://from-json.png" },
            }),
          },
          { result: null },
          {},
        ],
      },
      { role: "assistant" },
    ];
    // JSON-string results still resolve (tool results round-trip as strings
    // in some transcript shapes); embed/code kinds are not row media.
    expect(collectPriorToolDisplayUrls(messages, 1)).toEqual(
      new Set(["minio://from-json.png"]),
    );
  });

  it("walks back across multiple contiguous assistant messages", () => {
    const messages = [
      { role: "user" },
      { role: "assistant", toolCalls: [imageToolCall("minio://one.png")] },
      { role: "assistant", toolCalls: [imageToolCall("minio://two.png")] },
      { role: "assistant" },
    ];
    expect(collectPriorToolDisplayUrls(messages, 3)).toEqual(
      new Set(["minio://one.png", "minio://two.png"]),
    );
  });
});
