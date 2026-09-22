import { describe, it, expect } from "vitest";
import { appendRecoveredText } from "../liveTurnRecovery";
import type { Message } from "../../types/types";

describe("appendRecoveredText", () => {
  it("continues the streaming bubble's last text fragment", () => {
    const streaming: Message = {
      role: "assistant",
      content: "Let me check",
      textFragments: ["Let me check"],
      contentSegments: [{ type: "text", fragmentIndex: 0 }],
    };
    const [continued] = appendRecoveredText([streaming], " the config.");
    expect(continued.content).toBe("Let me check the config.");
    expect(continued.textFragments).toEqual(["Let me check the config."]);
    expect(continued.contentSegments).toEqual([{ type: "text", fragmentIndex: 0 }]);
  });

  it("opens a new text segment after a tool group", () => {
    const [continued] = appendRecoveredText(
      [
        {
          role: "assistant",
          content: "Reading",
          textFragments: ["Reading"],
          contentSegments: [
            { type: "text", fragmentIndex: 0 },
            { type: "tools", toolIds: ["t1"] },
          ],
        },
      ],
      "Port is 3000.",
    );
    expect(continued.textFragments).toEqual(["Reading", "Port is 3000."]);
    expect(continued.contentSegments?.at(-1)).toEqual({ type: "text", fragmentIndex: 1 });
  });

  it("starts a bubble when the last one is the user's or already complete", () => {
    const user: Message = { role: "user", content: "hi" };
    expect(appendRecoveredText([user], "Hello")).toEqual([
      user,
      {
        role: "assistant",
        content: "Hello",
        contentSegments: [{ type: "text", fragmentIndex: 0 }],
        textFragments: ["Hello"],
      },
    ]);
    const done: Message = { role: "assistant", content: "old", completedAt: "2026-09-22T10:00:00Z" };
    expect(appendRecoveredText([done], "new")).toHaveLength(2);
  });
});
