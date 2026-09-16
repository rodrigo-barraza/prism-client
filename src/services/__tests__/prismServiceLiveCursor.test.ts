/**
 * Event-cursor wiring in PrismService.subscribeToAutoResponse:
 *  - `afterSeq` rides the subscribe frame once a seq has been seen,
 *  - the `subscribed` ack is informational (its `lastSeq` is the NEWEST
 *    seq; the replay that follows carries seq <= lastSeq) and only a
 *    droppedCount > 0 surfaces as onReplayTruncated,
 *  - events with seq <= the held mark are dropped, everything else flows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
  PRISM_WEBSOCKET_URL: "ws://prism.test",
}));

import PrismService from "../PrismService";
import { cursorFor, resetAllCursors } from "../../utils/liveTurnCursor";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CLOSED = 3;
  static CLOSING = 2;
  readonly CLOSED = 3;
  readonly CLOSING = 2;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((_event: { data: string }) => void) | null = null;
  onerror: ((_event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  /** Test helper: deliver a server frame. */
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const BASE = 1_760_000_000_000;

describe("PrismService.subscribeToAutoResponse event cursor", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    resetAllCursors();
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it("first subscribe carries no afterSeq; a resubscribe carries the last accepted seq", () => {
    const onChunk = vi.fn();
    const cleanup = PrismService.subscribeToAutoResponse("conv-1", { onChunk });
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    expect(JSON.parse(socket.sent[0])).toEqual({ type: "subscribe", conversationId: "conv-1" });

    socket.receive({ type: "subscribed", conversationId: "conv-1", lastSeq: BASE + 2, replayedCount: 2, droppedCount: 0 });
    socket.receive({ type: "chunk", content: "a", seq: BASE + 1 });
    socket.receive({ type: "chunk", content: "b", seq: BASE + 2 });
    expect(onChunk).toHaveBeenCalledTimes(2);
    cleanup();

    const cleanup2 = PrismService.subscribeToAutoResponse("conv-1", { onChunk });
    const socket2 = FakeWebSocket.instances[1];
    socket2.onopen?.();
    expect(JSON.parse(socket2.sent[0])).toEqual({
      type: "subscribe",
      conversationId: "conv-1",
      afterSeq: BASE + 2,
    });
    cleanup2();
  });

  it("drops replayed duplicates at or below the held mark, never the ack's lastSeq", () => {
    cursorFor("conv-2").accept({ seq: BASE + 10 });
    const onChunk = vi.fn();
    const onReplayTruncated = vi.fn();
    const cleanup = PrismService.subscribeToAutoResponse("conv-2", { onChunk, onReplayTruncated });
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    expect(JSON.parse(socket.sent[0]).afterSeq).toBe(BASE + 10);

    // Ack first: newest is 13, three frames follow — all <= 13.
    socket.receive({ type: "subscribed", conversationId: "conv-2", lastSeq: BASE + 13, replayedCount: 3, droppedCount: 0 });
    socket.receive({ type: "chunk", content: "dup", seq: BASE + 10 });
    socket.receive({ type: "chunk", content: "11", seq: BASE + 11 });
    socket.receive({ type: "chunk", content: "12", seq: BASE + 12 });
    socket.receive({ type: "chunk", content: "13", seq: BASE + 13 });
    socket.receive({ type: "chunk", content: "live", seq: BASE + 14 });
    socket.receive({ type: "chunk", content: "no-seq" });
    expect(onChunk.mock.calls.map((call) => call[0])).toEqual(["11", "12", "13", "live", "no-seq"]);
    expect(onReplayTruncated).not.toHaveBeenCalled();
    expect(cursorFor("conv-2").afterSeq()).toBe(BASE + 14);
    cleanup();
  });

  it("surfaces a truncated replay", () => {
    const onReplayTruncated = vi.fn();
    const cleanup = PrismService.subscribeToAutoResponse("conv-3", { onReplayTruncated });
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.receive({ type: "subscribed", conversationId: "conv-3", lastSeq: BASE + 90, replayedCount: 50, droppedCount: 7 });
    expect(onReplayTruncated).toHaveBeenCalledWith({ droppedCount: 7 });
    cleanup();
  });

  it("the driving SSE advances the same cursor so a later viewer socket resumes after it", async () => {
    const encoder = new TextEncoder();
    const frames = [
      { type: "chunk", content: "x", seq: BASE + 1 },
      { type: "chunk", content: "x-dup", seq: BASE + 1 },
      { type: "done", seq: BASE + 2 },
    ];
    const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response);

    const onChunk = vi.fn();
    const done = new Promise<void>((resolve) => {
      PrismService.streamAgentText(
        { messages: [], model: "m", provider: "p", conversationId: "conv-4" } as never,
        { onChunk, onDone: () => resolve() } as { onChunk: typeof onChunk; onDone: () => void },
      );
    });
    await done;
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(cursorFor("conv-4").afterSeq()).toBe(BASE + 2);
    fetchSpy.mockRestore();

    const cleanup = PrismService.subscribeToAutoResponse("conv-4", {});
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    expect(JSON.parse(socket.sent[0]).afterSeq).toBe(BASE + 2);
    cleanup();
  });
});
