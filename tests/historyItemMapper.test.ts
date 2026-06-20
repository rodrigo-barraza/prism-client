import { describe, it, expect } from "vitest";
import {
  mapConversationToHistoryItem,
} from "../src/utils/historyItemMapper";
import type { Conversation, Message } from "../src/types/types";

function createMinimalConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    _id: "conv-default-id",
    messages: [],
    createdAt: "2026-06-10T12:00:00Z",
    updatedAt: "2026-06-10T12:01:00Z",
    ...overrides,
  } as Conversation;
}

// ═══════════════════════════════════════════════════════════════
// mapConversationToHistoryItem
// ═══════════════════════════════════════════════════════════════

describe("mapConversationToHistoryItem", () => {
  it("should use conversation.id when present, falling back to _id", () => {
    const withExplicitId = createMinimalConversation({ id: "explicit-id" });
    const withoutExplicitId = createMinimalConversation({ _id: "fallback-id" });

    expect(mapConversationToHistoryItem(withExplicitId).id).toBe("explicit-id");
    expect(mapConversationToHistoryItem(withoutExplicitId).id).toBe("fallback-id");
  });

  it("should use conversation.title when present, defaulting to 'Untitled Chat'", () => {
    const withTitle = createMinimalConversation({ title: "My Chat" });
    const withoutTitle = createMinimalConversation({ title: undefined });

    expect(mapConversationToHistoryItem(withTitle).title).toBe("My Chat");
    expect(mapConversationToHistoryItem(withoutTitle).title).toBe("Untitled Chat");
  });

  it("should use precomputed totalCost when available", () => {
    const conversation = createMinimalConversation({ totalCost: 0.42 });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.totalCost).toBeCloseTo(0.42, 6);
  });

  it("should default totalCost to 0 when server field is absent", () => {
    const messages = [
      { role: "user", content: "hello" } as Message,
      { role: "assistant", content: "hi", estimatedCost: 0.01 } as Message,
      { role: "user", content: "question" } as Message,
      { role: "assistant", content: "answer", estimatedCost: 0.02 } as Message,
    ];
    const conversation = createMinimalConversation({
      totalCost: undefined,
      messages,
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.totalCost).toBe(0);
  });

  it("should add project tag when showProject is true and project exists", () => {
    const conversation = createMinimalConversation({ project: "prism-client" });
    const result = mapConversationToHistoryItem(conversation, { showProject: true });
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].label).toBe("prism-client");
  });

  it("should not add project tag when showProject is false", () => {
    const conversation = createMinimalConversation({ project: "prism-client" });
    const result = mapConversationToHistoryItem(conversation, { showProject: false });
    expect(result.tags).toHaveLength(0);
  });

  it("should add SYNTHETIC tag when conversation is synthetic", () => {
    const conversation = createMinimalConversation({ synthetic: true });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].label).toBe("SYNTHETIC");
  });

  it("should add both project and synthetic tags when applicable", () => {
    const conversation = createMinimalConversation({
      project: "my-project",
      synthetic: true,
    });
    const result = mapConversationToHistoryItem(conversation, { showProject: true });
    expect(result.tags).toHaveLength(2);
    expect(result.tags[0].label).toBe("my-project");
    expect(result.tags[1].label).toBe("SYNTHETIC");
  });

  it("should merge functionCalling count from toolCounts into modalities", () => {
    const conversation = createMinimalConversation({
      modalities: { textIn: 2, textOut: 1 },
      toolCounts: { search_web: 3, read_file: 5 },
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.modalities).toHaveProperty("functionCalling", 8);
    expect(result.modalities).toHaveProperty("textIn", 2);
  });

  it("should not add functionCalling when toolCounts is absent", () => {
    const conversation = createMinimalConversation({
      modalities: { textIn: 1 },
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.modalities).not.toHaveProperty("functionCalling");
  });

  it("should derive modelNames from _liveModelNames first", () => {
    const conversation = createMinimalConversation({
      _liveModelNames: ["gemini-3.5-flash"],
      modelNames: ["gpt-5.4"],
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.modelNames).toEqual(["gemini-3.5-flash"]);
  });

  it("should derive modelNames from modelNames when _liveModelNames is empty", () => {
    const conversation = createMinimalConversation({
      _liveModelNames: [],
      modelNames: ["gpt-5.4"],
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.modelNames).toEqual(["gpt-5.4"]);
  });

  it("should derive modelNames from assistant messages when no pre-enriched data exists", () => {
    const messages = [
      { role: "user", content: "hi" } as Message,
      { role: "assistant", content: "hello", model: "claude-sonnet-4" } as Message,
      { role: "user", content: "question" } as Message,
      { role: "assistant", content: "answer", model: "gemini-3.5-flash" } as Message,
    ];
    const conversation = createMinimalConversation({ messages });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.modelNames).toContain("claude-sonnet-4");
    expect(result.modelNames).toContain("gemini-3.5-flash");
  });

  it("should fallback to settings.model for modelNames when messages have no model field", () => {
    const conversation = createMinimalConversation({
      messages: [
        { role: "user", content: "hi" } as Message,
        { role: "assistant", content: "hello" } as Message,
      ],
      settings: { model: "fallback-model" } as Conversation["settings"],
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.modelNames).toEqual(["fallback-model"]);
  });

  it("should return empty providers when server providers array is absent", () => {
    const messages = [
      { role: "user", content: "hi" } as Message,
      { role: "assistant", content: "hello", provider: "google" } as Message,
      { role: "assistant", content: "more", provider: "anthropic" } as Message,
    ];
    const conversation = createMinimalConversation({ messages });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.providers).toEqual([]);
  });

  it("should use pre-enriched providers when available", () => {
    const conversation = createMinimalConversation({
      providers: ["openai"],
      messages: [
        { role: "assistant", content: "hi", provider: "google" } as Message,
      ],
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.providers).toEqual(["openai"]);
  });

  it("should assemble searchText from project, username, and message contents", () => {
    const conversation = createMinimalConversation({
      project: "prism",
      username: "rodrigo",
      messages: [
        { role: "user", content: "search query" } as Message,
        { role: "assistant", content: "search result" } as Message,
      ],
    });
    const result = mapConversationToHistoryItem(conversation);
    expect(result.searchText).toContain("prism");
    expect(result.searchText).toContain("rodrigo");
    expect(result.searchText).toContain("search query");
    expect(result.searchText).toContain("search result");
  });

  it("should pass through parentConversationId, defaulting to null", () => {
    const withParent = createMinimalConversation({ parentConversationId: "parent-123" });
    const withoutParent = createMinimalConversation({});

    expect(mapConversationToHistoryItem(withParent).parentConversationId).toBe("parent-123");
    expect(mapConversationToHistoryItem(withoutParent).parentConversationId).toBeNull();
  });
});
