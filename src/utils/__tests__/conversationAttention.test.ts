/**
 * "Needs you" helpers — the change-stream patch, the counts and the labels
 * the sidebar and the tab title are built from.
 */
import { describe, it, expect } from "vitest";
import {
  ATTENTION_CHANGE_COLLECTION,
  applyAttentionChange,
  countNeedsYou,
  describeAttention,
  formatAwaitingAge,
  needsYou,
  titleWithNeedsYouCount,
} from "../conversationAttention";

const conversations = [
  { id: "a", title: "A", pendingApprovalCount: 0, pendingQuestionCount: 0 },
  { id: "b", title: "B" },
];

describe("applyAttentionChange", () => {
  it("patches the named conversation with the event's counts", () => {
    const next = applyAttentionChange(conversations, {
      collection: ATTENTION_CHANGE_COLLECTION,
      id: "b",
      attention: { pendingApprovalCount: 2, pendingQuestionCount: 0, awaitingSince: "2026-09-22T10:00:00.000Z" },
    });
    expect(next).not.toBe(conversations);
    expect(next[1]).toEqual({
      id: "b",
      title: "B",
      pendingApprovalCount: 2,
      pendingQuestionCount: 0,
      awaitingSince: "2026-09-22T10:00:00.000Z",
    });
    expect(next[0]).toBe(conversations[0]);
  });

  it("returns the same array for other collections and unlisted conversations", () => {
    expect(
      applyAttentionChange(conversations, {
        collection: "agent_conversations",
        id: "a",
        attention: { pendingApprovalCount: 1 },
      }),
    ).toBe(conversations);
    expect(
      applyAttentionChange(conversations, {
        collection: ATTENTION_CHANGE_COLLECTION,
        id: "not-listed",
        attention: { pendingApprovalCount: 1 },
      }),
    ).toBe(conversations);
  });
});

describe("counts and labels", () => {
  it("needsYou / countNeedsYou read both counts", () => {
    expect(needsYou({ pendingApprovalCount: 1 })).toBe(true);
    expect(needsYou({ pendingQuestionCount: 1 })).toBe(true);
    expect(needsYou({})).toBe(false);
    expect(
      countNeedsYou([{ pendingApprovalCount: 1 }, { pendingQuestionCount: 3 }, {}]),
    ).toBe(2);
  });

  it("formatAwaitingAge rounds down to now / minutes / hours / days", () => {
    const now = Date.parse("2026-09-22T12:00:00.000Z");
    expect(formatAwaitingAge("2026-09-22T11:59:40.000Z", now)).toBe("now");
    expect(formatAwaitingAge("2026-09-22T11:55:00.000Z", now)).toBe("5m");
    expect(formatAwaitingAge("2026-09-22T09:00:00.000Z", now)).toBe("3h");
    expect(formatAwaitingAge("2026-09-20T12:00:00.000Z", now)).toBe("2d");
    expect(formatAwaitingAge(null, now)).toBeNull();
  });

  it("describeAttention pluralizes", () => {
    expect(describeAttention({ pendingApprovalCount: 2, pendingQuestionCount: 1 })).toBe(
      "2 approvals · 1 question",
    );
  });

  it("titleWithNeedsYouCount prefixes once and restores the bare title at zero", () => {
    expect(titleWithNeedsYouCount("Prism Playground", 2)).toBe("(2) Prism Playground");
    expect(titleWithNeedsYouCount("(2) Prism Playground", 3)).toBe("(3) Prism Playground");
    expect(titleWithNeedsYouCount("(3) Prism Playground", 0)).toBe("Prism Playground");
  });
});
