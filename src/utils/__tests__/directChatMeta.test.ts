import { describe, it, expect } from "vitest";

import { buildDirectChatConversationMeta } from "../directChatMeta";

/**
 * Regression: an agentless turn that shipped no `conversationMeta` made
 * ChatRoutes skip the user message entirely (it appends the prompt only when
 * `userMessage && conversationMeta`), so the conversation kept the model's
 * reply and lost the prompt that produced it. The meta object must therefore
 * exist on every turn, system prompt or not.
 */
describe("buildDirectChatConversationMeta", () => {
  it("returns an object even with no system prompt — presence is the marker", () => {
    for (const emptyish of [undefined, null, ""]) {
      const meta = buildDirectChatConversationMeta(emptyish);
      expect(meta).toBeTruthy();
      expect(typeof meta).toBe("object");
      expect(meta.systemPrompt).toBeUndefined();
    }
  });

  it("carries the system prompt when there is one", () => {
    const meta = buildDirectChatConversationMeta("You are helpful.");
    expect(meta.systemPrompt).toBe("You are helpful.");
  });

  it("never invents a title — the service derives it", () => {
    expect(
      buildDirectChatConversationMeta("You are helpful.").title,
    ).toBeUndefined();
    expect(buildDirectChatConversationMeta("").title).toBeUndefined();
  });
});
