import { describe, it, expect } from "vitest";
import type { Message } from "../../../types/types";
import {
  buildDisplayList,
  coalesceAssistantRuns,
  deletedMessageGroups,
  estimateRowHeight,
  hasStreamingOutput,
  modelSwapPositions,
  priorToolMediaKey,
  readsSubAgentActivity,
  toDisplayMessage,
} from "../messageRows";

const user = (content: string, extra: Partial<Message> = {}): Message => ({ role: "user", content, ...extra });
const assistant = (content: string, extra: Partial<Message> = {}): Message => ({
  role: "assistant",
  content,
  ...extra,
});

describe("toDisplayMessage", () => {
  it("returns the same object for the same message, so its row stays memoized", () => {
    const message = user("[System Context]\nnow\n\n[User Message]\nHello");
    const first = toDisplayMessage(message, false);
    expect(first).not.toBe(message);
    expect(first.content).toBe("Hello");
    expect(toDisplayMessage(message, false)).toBe(first);
    // The Raw view has its own copy, with the context header.
    expect(toDisplayMessage(message, true).content).toContain("[System Context]");
  });

  it("leaves assistant messages as they are", () => {
    const reply = assistant("Hi");
    expect(toDisplayMessage(reply, false)).toBe(reply);
  });
});

describe("buildDisplayList", () => {
  it("drops system and notification messages outside the Raw view and keeps their source indices", () => {
    const messages = [
      { role: "system", content: "You are helpful." } as Message,
      user("Question"),
      user("<task-notification><status>done</status></task-notification>"),
      assistant("Answer"),
    ];
    const clean = buildDisplayList(messages, false);
    expect(clean.messages.map((message) => message.content)).toEqual(["Question", "Answer"]);
    expect(clean.sourceIndices).toEqual([1, 3]);
    expect(buildDisplayList(messages, true).sourceIndices).toEqual([0, 1, 2, 3]);
  });
});

describe("row layout", () => {
  it("coalesces a run of assistant messages and breaks it at a model swap", () => {
    const messages = [
      user("Q1"),
      assistant("a", { model: "m1" }),
      assistant("b", { model: "m1" }),
      user("Q2"),
      assistant("c", { model: "m2" }),
      assistant("d", { model: "m2" }),
    ];
    const swapBefore = modelSwapPositions(messages);
    expect(swapBefore).toEqual([false, false, false, true, false, false]);
    const meta = coalesceAssistantRuns(messages, swapBefore);
    expect(meta[1]).toEqual({ isContinuation: false, isLastInGroup: false });
    expect(meta[2]).toEqual({ isContinuation: true, isLastInGroup: true });
    expect(meta[0]).toBeNull();
  });

  it("groups a run of deleted messages under its first, and keeps the group while its members do", () => {
    const first = user("gone", { deleted: true });
    const second = assistant("gone too", { deleted: true });
    const messages = [user("kept"), first, second, assistant("kept too")];
    const groups = deletedMessageGroups(messages, modelSwapPositions(messages));
    expect([...groups.keys()]).toEqual([1]);
    expect(groups.get(1)?.messages).toEqual([first, second]);
    // A token elsewhere rebuilds the list: the same members, the same group object.
    const again = deletedMessageGroups([...messages], modelSwapPositions(messages));
    expect(again.get(1)).toBe(groups.get(1));
  });
});

describe("priorToolMediaKey", () => {
  const imageResult = (url: string) => ({ display: { kind: "image", url } });

  it("names the media an earlier message of the turn showed at its tool call", () => {
    const messages = [
      user("Draw two"),
      assistant("", { toolCalls: [{ id: "t1", name: "generate_image", args: {}, result: imageResult("minio://a.png") }] }),
      assistant("Here they are", { images: ["minio://a.png", "minio://b.png"] }),
    ];
    expect(priorToolMediaKey(messages, 2)).toBe("minio://a.png");
  });

  it("is empty for a message without a media row", () => {
    expect(priorToolMediaKey([user("Hi"), assistant("Hello")], 1)).toBe("");
  });
});

describe("what a row needs of the live state", () => {
  it("reads sub-agent activity only for coordinator tool calls", () => {
    expect(readsSubAgentActivity([assistant("", { toolCalls: [{ id: "t", name: "read_file", args: {} }] })])).toBe(false);
    expect(readsSubAgentActivity([assistant("", { toolCalls: [{ id: "t", name: "create_subagents", args: {} }] })])).toBe(true);
  });

  it("gets streaming tool output only when one of its calls has some", () => {
    const message = assistant("", { toolCalls: [{ id: "t1", name: "execute_python", args: {} }] });
    expect(hasStreamingOutput(message, new Map([["t1", "hello"]]))).toBe(true);
    expect(hasStreamingOutput(message, new Map([["other", "hello"]]))).toBe(false);
    expect(hasStreamingOutput(message, null)).toBe(false);
  });
});

describe("estimateRowHeight", () => {
  it("grows with the text and the tool calls, within bounds", () => {
    const short = estimateRowHeight(user("Hi"));
    const long = estimateRowHeight(assistant("x".repeat(2_000)));
    const withTools = estimateRowHeight(assistant("x", { toolCalls: [{ id: "a", name: "t", args: {} }, { id: "b", name: "t", args: {} }] }));
    expect(short).toBeGreaterThanOrEqual(56);
    expect(long).toBeGreaterThan(short);
    expect(withTools).toBeGreaterThan(estimateRowHeight(assistant("x")));
    expect(estimateRowHeight(assistant("x".repeat(1_000_000)))).toBe(4_000);
  });
});
