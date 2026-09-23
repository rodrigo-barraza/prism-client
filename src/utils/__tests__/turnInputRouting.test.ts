import { describe, it, expect } from "vitest";
import {
  decideComposerAction,
  resolveTurnInputOutcome,
  NO_ACTIVE_TURN_TOAST,
  isUserAuthoredNotificationSource,
  resolveTurnInput,
  isTurnInputMessage,
  turnInputDisplayText,
  turnInputBadgeLabel,
  turnInputAuthorLabel,
  buildOptimisticTurnInputMessage,
  attachTurnInputServerId,
  removeTurnInputMessage,
  markTurnInputApplied,
  applyTurnInputEvent,
  insertTurnInputMessage,
  answersToMessageText,
  externalOriginOf,
  isExternalInputMessage,
  externalInputLabel,
  externalInputDisplayText,
  stripExternalEnvelopes,
} from "../turnInputRouting.js";
import type { Message } from "../../types/types.js";

describe("decideComposerAction", () => {
  it("sends normally when nothing is running, whatever the mode", () => {
    expect(decideComposerAction({ isConversationRunning: false, mode: "update" })).toBe("send");
    expect(decideComposerAction({ isConversationRunning: false, mode: "queue" })).toBe("send");
  });

  it("updates the running turn in update mode (the default)", () => {
    expect(decideComposerAction({ isConversationRunning: true, mode: "update" })).toBe("update");
  });

  it("queues in queue mode, and whenever files are attached", () => {
    expect(decideComposerAction({ isConversationRunning: true, mode: "queue" })).toBe("queue");
    expect(
      decideComposerAction({ isConversationRunning: true, mode: "update", hasFiles: true }),
    ).toBe("queue");
  });
});

describe("resolveTurnInputOutcome", () => {
  it("200 → pending with the server id", () => {
    expect(resolveTurnInputOutcome({ ok: true, inputId: "in-1", position: 0 })).toEqual({
      action: "pending",
      inputId: "in-1",
    });
  });

  it("409 no_active_turn → queue for the next turn with the short toast", () => {
    expect(
      resolveTurnInputOutcome({ ok: false, status: 409, reason: "no_active_turn" }),
    ).toEqual({ action: "queue", toast: NO_ACTIVE_TURN_TOAST });
  });

  it("400 mailbox_full / empty_input / unknown → reject with a message", () => {
    expect(resolveTurnInputOutcome({ ok: false, status: 400, reason: "mailbox_full" }).action).toBe("reject");
    expect(resolveTurnInputOutcome({ ok: false, status: 400, reason: "empty_input" }).action).toBe("reject");
    const other = resolveTurnInputOutcome({ ok: false, status: 500 });
    expect(other).toMatchObject({ action: "reject" });
    expect(other.action === "reject" && other.toast).toContain("HTTP 500");
  });
});

describe("persisted mid-turn messages", () => {
  it("treats only user-update / user-answer as user-authored", () => {
    expect(isUserAuthoredNotificationSource("user-update")).toBe(true);
    expect(isUserAuthoredNotificationSource("user-answer")).toBe(true);
    expect(isUserAuthoredNotificationSource("orchestrator")).toBe(false);
    expect(isUserAuthoredNotificationSource("timer")).toBe(false);
    expect(isUserAuthoredNotificationSource(undefined)).toBe(false);
  });

  it("derives a turn-input record from the persisted source", () => {
    expect(resolveTurnInput({ _notificationSource: "user-update" })).toEqual({
      id: "",
      kind: "user_update",
      status: "applied",
    });
    expect(resolveTurnInput({ _notificationSource: "user-answer" })?.kind).toBe("question_answer");
    expect(resolveTurnInput({ _notificationSource: "async-task" })).toBeNull();
    expect(isTurnInputMessage({ _turnInput: { id: "t", kind: "user_update" } })).toBe(true);
    expect(isTurnInputMessage({})).toBe(false);
  });

  it("shows rawContent, never the tag wrapper", () => {
    expect(
      turnInputDisplayText({
        content: "<user-update>\n\nfocus on tests\n\n</user-update>",
        rawContent: "focus on tests",
      }),
    ).toBe("focus on tests");
    expect(
      turnInputDisplayText({ content: "<user-answer>\n\nyes\n\n</user-answer>" }),
    ).toBe("yes");
    expect(turnInputDisplayText({ content: "plain" })).toBe("plain");
  });

  it("labels the badge by kind and lifecycle", () => {
    expect(turnInputBadgeLabel({ id: "a", kind: "user_update", status: "sending" })).toBe("Sending…");
    expect(turnInputBadgeLabel({ id: "a", kind: "user_update", status: "pending" })).toBe("Pending");
    expect(turnInputBadgeLabel({ id: "a", kind: "user_update", status: "applied", iteration: 4 })).toBe(
      "Applied at step 4",
    );
    expect(turnInputBadgeLabel({ id: "a", kind: "user_update", status: "applied" })).toBe("Applied mid-turn");
    expect(turnInputBadgeLabel({ id: "a", kind: "question_answer", status: "applied" })).toBe("Answer");
  });

  it("the goal verifier's gaps come from the Verifier, never the user", () => {
    const revision = { id: "g", kind: "goal_revision" as const, status: "applied" as const };
    expect(turnInputAuthorLabel(revision)).toBe("Verifier");
    expect(turnInputBadgeLabel(revision)).toBe("Goal check");
    expect(
      turnInputDisplayText({ content: "<goal-verification>\n\nNot met: [c2]\n\n</goal-verification>" }),
    ).toBe("Not met: [c2]");
  });
});

describe("messages[] bookkeeping", () => {
  const base: Message[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "working" },
  ];

  it("builds an optimistic sending bubble", () => {
    const bubble = buildOptimisticTurnInputMessage({
      tempId: "tmp-1",
      text: "use pnpm",
      images: [],
      now: new Date("2026-09-15T10:00:00Z"),
    });
    expect(bubble.role).toBe("user");
    expect(bubble.rawContent).toBe("use pnpm");
    expect(bubble.images).toBeUndefined();
    expect(bubble._turnInput).toMatchObject({ id: "tmp-1", kind: "user_update", status: "sending" });
    expect(bubble.timestamp).toBe("2026-09-15T10:00:00.000Z");
  });

  it("attaches the server id and flips sending → pending", () => {
    const withBubble = [...base, buildOptimisticTurnInputMessage({ tempId: "tmp-1", text: "x" })];
    const next = attachTurnInputServerId(withBubble, "tmp-1", "in-9");
    expect(next).not.toBe(withBubble);
    expect(next[2]._turnInput).toMatchObject({ id: "in-9", status: "pending" });
    expect(attachTurnInputServerId(next, "missing", "in-0")).toBe(next);
  });

  it("keeps an already-applied bubble applied when the 200 arrives late", () => {
    const withBubble = [...base, buildOptimisticTurnInputMessage({ tempId: "tmp-1", text: "x" })];
    const applied = applyTurnInputEvent(withBubble, {
      id: "in-9",
      kind: "user_update",
      content: "x",
      boundary: "after_tools",
      iteration: 3,
    });
    expect(applied).toHaveLength(3);
    expect(applied[2]._turnInput).toMatchObject({ id: "in-9", status: "applied", iteration: 3 });
    const late = attachTurnInputServerId(applied, "tmp-1", "in-9");
    expect(late).toBe(applied);
  });

  it("removes a bubble by id (409 → queued instead)", () => {
    const withBubble = [...base, buildOptimisticTurnInputMessage({ tempId: "tmp-1", text: "x" })];
    expect(removeTurnInputMessage(withBubble, "tmp-1")).toEqual(base);
    expect(removeTurnInputMessage(base, "tmp-1")).toBe(base);
  });

  it("marks applied on the status twin without appending", () => {
    const withBubble = attachTurnInputServerId(
      [...base, buildOptimisticTurnInputMessage({ tempId: "tmp-1", text: "x" })],
      "tmp-1",
      "in-9",
    );
    const next = markTurnInputApplied(withBubble, "in-9", { boundary: "iteration_start", iteration: 2 });
    expect(next[2]._turnInput).toMatchObject({ status: "applied", boundary: "iteration_start", iteration: 2 });
    expect(markTurnInputApplied(next, "in-9", { boundary: "iteration_start", iteration: 2 })).toBe(next);
    expect(markTurnInputApplied(base, "in-9", { iteration: 1 })).toBe(base);
  });

  it("appends the event as a user bubble when no optimistic bubble exists (viewer path)", () => {
    const next = applyTurnInputEvent(base, {
      id: "in-3",
      kind: "question_answer",
      content: "yes, go ahead",
      images: ["data:image/png;base64,AAA"],
      boundary: "before_end",
      iteration: 5,
      receivedAt: "2026-09-15T10:00:00.000Z",
    });
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({
      role: "user",
      content: "yes, go ahead",
      rawContent: "yes, go ahead",
      images: ["data:image/png;base64,AAA"],
      timestamp: "2026-09-15T10:00:00.000Z",
      _turnInput: { id: "in-3", kind: "question_answer", status: "applied", iteration: 5 },
    });
  });

  it("is idempotent for a replayed event", () => {
    const once = applyTurnInputEvent(base, { id: "in-3", kind: "user_update", content: "x", boundary: "after_tools", iteration: 1 });
    const twice = applyTurnInputEvent(once, { id: "in-3", kind: "user_update", content: "x", boundary: "after_tools", iteration: 1 });
    expect(twice).toHaveLength(3);
  });

  it("keeps the driver's in-flight assistant bubble last when asked", () => {
    const streaming: Message[] = [...base, { role: "assistant", content: "partial" }];
    const bubble = buildOptimisticTurnInputMessage({ tempId: "tmp-1", text: "x" });
    const driver = insertTurnInputMessage(streaming, bubble, "before-trailing-assistant");
    expect(driver.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(driver[3].content).toBe("partial");
    // A finished assistant bubble is not in flight — append after it.
    const finished: Message[] = [...base, { role: "assistant", content: "done", completedAt: "t" }];
    expect(insertTurnInputMessage(finished, bubble, "before-trailing-assistant").at(-1)).toBe(bubble);
    expect(insertTurnInputMessage(streaming, bubble).at(-1)).toBe(bubble);
    const viaEvent = applyTurnInputEvent(
      streaming,
      { id: "in-1", kind: "user_update", content: "x", boundary: "after_tools", iteration: 1 },
      "before-trailing-assistant",
    );
    expect(viaEvent.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });
});

describe("answersToMessageText", () => {
  it("joins answers, arrays and annotations into one message", () => {
    expect(
      answersToMessageText([
        { answer: "yes", annotations: "but carefully" },
        { answer: ["a", "b"] },
        { answer: "   " },
      ]),
    ).toBe("yes (but carefully)\na, b");
  });
});

describe("turnInputAuthorLabel", () => {
  it("labels an agent_message as the agent's, never the user's", () => {
    expect(turnInputAuthorLabel({ id: "input-1", kind: "agent_message", status: "applied" })).toBe("Agent");
  });

  it("labels the user's own mid-turn input, and plain user messages, as the user's", () => {
    expect(turnInputAuthorLabel({ id: "input-2", kind: "user_update", status: "applied" })).toBe("User");
    expect(turnInputAuthorLabel({ id: "input-3", kind: "question_answer", status: "applied" })).toBe("User");
    expect(turnInputAuthorLabel(null)).toBe("User");
  });
});

describe("external input (prompt 22 L3)", () => {
  // What prism-service's formatExternalInput puts in `content`.
  const ENVELOPED =
    "<external-input>\n\n[External input from Discord (Mallory (42)) — not from the user. It has tool-level authority.]\n" +
    "<<<BEGIN_EXTERNAL_INPUT>>>\nhey also do this\n<<<END_EXTERNAL_INPUT>>>\n\n</external-input>";

  it("knows an external message by its origin — marked, or an external turn input — and never a user's", () => {
    expect(externalOriginOf({ _external: { source: "discord", sender: "Mallory (42)" } })).toEqual({
      source: "discord",
      sender: "Mallory (42)",
    });
    expect(externalOriginOf({ _turnInput: { id: "i", kind: "external", source: "mcp", sender: "github" } })).toEqual({
      source: "mcp",
      sender: "github",
    });
    expect(isExternalInputMessage({ _turnInput: { id: "i", kind: "user_update" } })).toBe(false);
    expect(isExternalInputMessage({})).toBe(false);
    // A forged origin is not an origin.
    expect(externalOriginOf({ _external: { source: "admin" } as never })).toBeNull();
  });

  it("tags the block with its source and sender", () => {
    expect(externalInputLabel({ source: "subagent", sender: "agent-3f2a" })).toBe("Sub-agent · agent-3f2a");
    expect(externalInputLabel({ source: "webhook" })).toBe("Webhook");
  });

  it("shows the sender's own words, never the model's envelope", () => {
    expect(externalInputDisplayText({ content: ENVELOPED, rawContent: "hey also do this" })).toBe("hey also do this");
    expect(externalInputDisplayText({ content: ENVELOPED })).toBe("hey also do this");
    expect(stripExternalEnvelopes(`Agent 1 output:\n${ENVELOPED}\nDone.`)).toBe("Agent 1 output:\nhey also do this\nDone.");
  });

  it("a turn_input event of kind external becomes an external message with its origin", () => {
    const [message] = applyTurnInputEvent([] as Message[], {
      id: "input-9",
      kind: "external",
      content: "build failed",
      source: "webhook",
      sender: "github",
      boundary: "after_tools",
      iteration: 3,
    });
    expect(message._external).toEqual({ source: "webhook", sender: "github" });
    expect(message._turnInput).toMatchObject({ kind: "external", source: "webhook", status: "applied" });
    expect(turnInputBadgeLabel(message._turnInput!)).toBe("External input");
  });
});
