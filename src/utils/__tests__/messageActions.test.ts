import { describe, it, expect } from "vitest";
import {
  applyAssistantEdit,
  countLaterMessages,
  restoreMessage,
  softDeleteMessage,
  toPersistableMessages,
} from "../messageActions";
import { getCleanAndRaw, userMessageResendText } from "../messageHelpers";
import type { Message } from "../../types/types";

const messages: Message[] = [
  { role: "user", content: "q1" },
  { role: "assistant", content: "a1" },
  { role: "user", content: "q2" },
];

describe("message action edits", () => {
  it("counts what an edit or rerun discards", () => {
    expect(countLaterMessages(messages, 0)).toBe(2);
    expect(countLaterMessages(messages, 2)).toBe(0);
  });

  it("soft-deletes and restores one message without touching the others", () => {
    const deleted = softDeleteMessage(messages, 1);
    expect(deleted.map((message) => message.deleted ?? false)).toEqual([false, true, false]);
    expect(deleted[0]).toBe(messages[0]);
    expect(restoreMessage(deleted, 1)[1]).toEqual(messages[1]);
  });

  it("an assistant edit collapses the text fragments behind the tool segments", () => {
    const edited = applyAssistantEdit(
      {
        role: "assistant",
        content: "before tools after",
        textFragments: ["before", "after"],
        contentSegments: [
          { type: "text", fragmentIndex: 0 },
          { type: "tools", toolIds: ["t1"] },
          { type: "text", fragmentIndex: 1 },
        ],
      },
      "rewritten",
    );
    expect(edited.content).toBe("rewritten");
    expect(edited.textFragments).toEqual(["rewritten"]);
    expect(edited.contentSegments).toEqual([
      { type: "tools", toolIds: ["t1"] },
      { type: "text", fragmentIndex: 0 },
    ]);
    expect(applyAssistantEdit({ role: "assistant", content: "x" }, "y")).toEqual({
      role: "assistant",
      content: "y",
    });
  });

  it("persists the server's fields and drops the client's live bookkeeping", () => {
    const persisted = toPersistableMessages([
      {
        role: "user",
        content: "<task-notification>done</task-notification>",
        _notificationSource: "task-complete",
      } as Message,
      {
        role: "assistant",
        content: "a",
        _liveStreaming: true,
        _streamingStartTime: 12,
        _liveGenProgress: { outputTokens: 3 },
      },
      { role: "assistant", content: "⚠️ Error: boom", isError: true } as Message,
    ]);
    expect(persisted).toEqual([
      {
        role: "user",
        content: "<task-notification>done</task-notification>",
        _notificationSource: "task-complete",
      },
      { role: "assistant", content: "a" },
    ]);
  });
});

describe("user message text", () => {
  it("resends what was typed, never the injected system context", () => {
    expect(
      userMessageResendText({
        role: "user",
        content: "[System Context]\nclock\n\n[User Message]\nhello",
        rawContent: "hello",
      }),
    ).toBe("hello");
    expect(
      userMessageResendText({
        role: "user",
        content: "[System Context]\nclock\n\n[User Message]\nhello",
      }),
    ).toBe("hello");
    expect(userMessageResendText({ role: "user", content: "plain" })).toBe("plain");
  });

  it("splits clean and raw text either way round", () => {
    expect(getCleanAndRaw("[System Context - Local Time: 9]\n\nhi", "hi")).toEqual({
      clean: "hi",
      raw: "[System Context - Local Time: 9]\n\nhi",
    });
    expect(getCleanAndRaw("hi", undefined)).toEqual({ clean: "hi", raw: "hi" });
  });
});
