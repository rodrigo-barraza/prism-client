import { describe, it, expect } from "vitest";
import { resolveDisplayMessages } from "../messageHelpers.js";
import type { Message } from "../../types/types.js";

/**
 * The client-side prepareDisplayMessages copy was deleted (audit M2) — all
 * conversation-serving endpoints now attach backend-serialized
 * `displayMessages` at serve time (see prepareDisplayMessages +
 * reconstructRequestDisplayMessages tests in prism-service, which carry the
 * former normalization coverage). resolveDisplayMessages keeps only a
 * readable-degradation fallback for responses that unexpectedly lack the
 * field.
 */
describe("messageHelpers - resolveDisplayMessages", () => {
  it("returns backend-provided displayMessages when present and non-empty", () => {
    const displayMessages: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const entry = {
      displayMessages,
      messages: [{ role: "user", content: "raw" }] as Message[],
    };
    // Exact backend reference — no re-processing
    expect(resolveDisplayMessages(entry)).toBe(displayMessages);
  });

  it("does not re-process backend displayMessages even if they contain tool-role messages", () => {
    const displayMessages: Message[] = [
      { role: "assistant", content: "" },
      { role: "tool", content: "result", tool_call_id: "call-1" },
    ];
    expect(resolveDisplayMessages({ displayMessages })).toBe(displayMessages);
  });

  it("falls back to raw messages minus tool-role stubs when displayMessages is missing", () => {
    const entry = {
      messages: [
        { role: "user", content: "question" },
        { role: "assistant", content: "answer" },
        { role: "tool", content: "raw tool result", tool_call_id: "call-1" },
      ] as Message[],
    };
    const result = resolveDisplayMessages(entry);
    expect(result).toHaveLength(2);
    expect(result.every((message) => message.role !== "tool")).toBe(true);
  });

  it("falls back when displayMessages is an empty array", () => {
    const entry = {
      displayMessages: [] as Message[],
      messages: [{ role: "user", content: "hello" }] as Message[],
    };
    expect(resolveDisplayMessages(entry)).toHaveLength(1);
  });

  it("returns empty array when entry has no message fields at all", () => {
    expect(resolveDisplayMessages({})).toEqual([]);
    expect(
      resolveDisplayMessages({ displayMessages: [], messages: [] }),
    ).toEqual([]);
  });
});
