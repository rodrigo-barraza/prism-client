import { describe, it, expect } from "vitest";
import { refusalNotice, resolveDisplayMessages } from "../messageHelpers.js";
import type { Message } from "../../types/types.js";

/**
 * The client-side prepareDisplayMessages copy was deleted (audit M2) — all
 * conversation-serving endpoints now attach backend-serialized
 * `displayMessages` at serve time (see prepareDisplayMessages +
 * reconstructRequestDisplayMessages tests in prism-service, which carry the
 * former normalization coverage). resolveDisplayMessages reads the
 * backend-provided field directly with no client-side fallback.
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

  it("returns an empty array when displayMessages is missing (no raw-message fallback)", () => {
    const entry = {
      messages: [
        { role: "user", content: "question" },
        { role: "assistant", content: "answer" },
        { role: "tool", content: "raw tool result", tool_call_id: "call-1" },
      ] as Message[],
    };
    expect(resolveDisplayMessages(entry)).toEqual([]);
  });

  it("returns the backend displayMessages as-is when it is an empty array", () => {
    const entry = {
      displayMessages: [] as Message[],
      messages: [{ role: "user", content: "hello" }] as Message[],
    };
    expect(resolveDisplayMessages(entry)).toHaveLength(0);
  });

  it("returns empty array when entry has no message fields at all", () => {
    expect(resolveDisplayMessages({})).toEqual([]);
    expect(
      resolveDisplayMessages({ displayMessages: [], messages: [] }),
    ).toEqual([]);
  });
});

describe("refusalNotice", () => {
  it("names the filter's category", () => {
    expect(refusalNotice({ category: "OTHER", explanation: null, model: "gemini-3.8-flash" })).toBe(
      "The provider's safety filter blocked this reply (OTHER).",
    );
  });

  it("adds the provider's explanation and suggested model when there are any", () => {
    expect(
      refusalNotice({ category: "cyber", explanation: "Declined: could enable cyber harm.", recommendedModel: "claude-sonnet-5" }),
    ).toBe(
      "The provider's safety filter blocked this reply (cyber). Declined: could enable cyber harm. Suggested model: claude-sonnet-5.",
    );
  });

  it("reads without a category", () => {
    expect(refusalNotice({ category: null, explanation: null })).toBe("The provider's safety filter blocked this reply.");
  });
});
