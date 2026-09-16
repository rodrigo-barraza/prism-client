import { describe, it, expect, beforeEach } from "vitest";
import {
  createCursor,
  cursorFor,
  forgetCursor,
  resetAllCursors,
} from "../liveTurnCursor.js";

// The service seeds the per-conversation counter at Date.now() — seq values
// are large integers, never small ordinals.
const BASE = 1_760_000_000_000;

describe("liveTurnCursor", () => {
  beforeEach(() => resetAllCursors());

  it("accepts every event before any seq was seen and sends no afterSeq", () => {
    const cursor = createCursor();
    expect(cursor.afterSeq()).toBeUndefined();
    expect(cursor.shouldAccept({ type: "chunk", seq: BASE + 5 })).toBe(true);
    expect(cursor.shouldAccept({ type: "chunk" })).toBe(true);
  });

  it("advances the mark on accepted events and drops seq <= mark", () => {
    const cursor = createCursor();
    expect(cursor.accept({ seq: BASE + 1 })).toBe(true);
    expect(cursor.accept({ seq: BASE + 2 })).toBe(true);
    expect(cursor.afterSeq()).toBe(BASE + 2);
    expect(cursor.accept({ seq: BASE + 2 })).toBe(false);
    expect(cursor.accept({ seq: BASE + 1 })).toBe(false);
    expect(cursor.afterSeq()).toBe(BASE + 2);
    expect(cursor.accept({ seq: BASE + 7 })).toBe(true);
    expect(cursor.afterSeq()).toBe(BASE + 7);
  });

  it("always accepts events without a seq and never moves the mark for them", () => {
    const cursor = createCursor(BASE + 3);
    expect(cursor.accept({ type: "status" })).toBe(true);
    expect(cursor.accept({ type: "status", seq: "not-a-number" })).toBe(true);
    expect(cursor.accept({ type: "status", seq: Number.NaN })).toBe(true);
    expect(cursor.afterSeq()).toBe(BASE + 3);
  });

  it("does NOT adopt the ack's lastSeq — replayed frames <= lastSeq still flow", () => {
    const cursor = createCursor();
    cursor.accept({ seq: BASE + 10 });
    // Reconnect: we send afterSeq = BASE+10; the server replays 11..13 and
    // tells us its newest is 13 BEFORE those frames arrive.
    const summary = cursor.noteSubscribed({
      lastSeq: BASE + 13,
      replayedCount: 3,
      droppedCount: 0,
    });
    expect(summary).toEqual({
      lastSeq: BASE + 13,
      replayedCount: 3,
      droppedCount: 0,
      truncated: false,
    });
    expect(cursor.afterSeq()).toBe(BASE + 10);
    expect(cursor.serverLastSeq()).toBe(BASE + 13);
    // Replay: 11, 12, 13 all accepted; 10 (a duplicate of what we had) dropped.
    expect(cursor.accept({ seq: BASE + 10 })).toBe(false);
    expect(cursor.accept({ seq: BASE + 11 })).toBe(true);
    expect(cursor.accept({ seq: BASE + 12 })).toBe(true);
    expect(cursor.accept({ seq: BASE + 13 })).toBe(true);
    expect(cursor.afterSeq()).toBe(BASE + 13);
    // Live frames continue past the ack's lastSeq.
    expect(cursor.accept({ seq: BASE + 14 })).toBe(true);
  });

  it("reports truncation from droppedCount and keeps it until the next ack", () => {
    const cursor = createCursor(BASE);
    expect(cursor.wasTruncated()).toBe(false);
    const summary = cursor.noteSubscribed({ lastSeq: BASE + 99, droppedCount: 4 });
    expect(summary.truncated).toBe(true);
    expect(summary.droppedCount).toBe(4);
    expect(cursor.wasTruncated()).toBe(true);
    cursor.noteSubscribed({ lastSeq: BASE + 120, droppedCount: 0 });
    expect(cursor.wasTruncated()).toBe(false);
  });

  it("tolerates a malformed ack", () => {
    const cursor = createCursor(BASE + 1);
    const summary = cursor.noteSubscribed({ lastSeq: "x", droppedCount: -2, replayedCount: null });
    expect(summary).toEqual({ lastSeq: undefined, replayedCount: 0, droppedCount: 0, truncated: false });
    expect(cursor.afterSeq()).toBe(BASE + 1);
  });

  it("reset forgets the mark and the ack", () => {
    const cursor = createCursor();
    cursor.accept({ seq: BASE + 5 });
    cursor.noteSubscribed({ lastSeq: BASE + 5, droppedCount: 2 });
    cursor.reset();
    expect(cursor.afterSeq()).toBeUndefined();
    expect(cursor.serverLastSeq()).toBeUndefined();
    expect(cursor.wasTruncated()).toBe(false);
    expect(cursor.accept({ seq: BASE + 1 })).toBe(true);
  });

  it("keeps one cursor per conversation in the module registry", () => {
    const a = cursorFor("conv-a");
    const b = cursorFor("conv-b");
    a.accept({ seq: BASE + 3 });
    expect(cursorFor("conv-a")).toBe(a);
    expect(cursorFor("conv-a").afterSeq()).toBe(BASE + 3);
    expect(b.afterSeq()).toBeUndefined();
    forgetCursor("conv-a");
    expect(cursorFor("conv-a")).not.toBe(a);
    expect(cursorFor("conv-a").afterSeq()).toBeUndefined();
  });
});
