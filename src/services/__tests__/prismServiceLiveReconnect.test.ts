/**
 * PrismService's live socket after a drop: the viewer subscription
 * resubscribes and ends a turn the server no longer holds; the sender's
 * followLiveTurn continues a turn its SSE lost and settles on its outcome.
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
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((_event: { data: string }) => void) | null = null;
  onerror: ((_event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const BASE = 1_760_000_000_000;
const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

describe("PrismService live socket after a drop", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    resetAllCursors();
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it("a viewer resubscribes after the service restarts and ends the turn it lost", () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const states: string[] = [];
    const cleanup = PrismService.subscribeToAutoResponse(
      "conv-1",
      { onChunk, onDone },
      { onStateChange: (state) => states.push(state) },
    );
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: BASE + 1, replayedCount: 1, droppedCount: 0 });
    latest().receive({ type: "chunk", content: "partial", seq: BASE + 1 });

    latest().drop();
    vi.advanceTimersByTime(15_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().open();
    expect(latest().sent[0]).toEqual({ type: "subscribe", conversationId: "conv-1", afterSeq: BASE + 1 });
    // A restarted service holds no events for the conversation.
    latest().receive({ type: "subscribed", lastSeq: 0, replayedCount: 0, droppedCount: 0 });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["connecting", "live", "reconnecting", "live"]);
    cleanup();
    expect(states.at(-1)).toBe("closed");
  });

  it("the first subscribe to an idle conversation does not end anything", () => {
    const onDone = vi.fn();
    const cleanup = PrismService.subscribeToAutoResponse("conv-idle", { onDone });
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: 0, replayedCount: 0, droppedCount: 0 });
    expect(onDone).not.toHaveBeenCalled();
    cleanup();
  });

  it("followLiveTurn continues a lost SSE from its cursor without repeating text", async () => {
    // The SSE rendered through seq 2 before it dropped.
    cursorFor("conv-2").accept({ seq: BASE + 2 });
    const chunks: string[] = [];
    const isTurnRunning = vi.fn(async () => true);
    const outcome = PrismService.followLiveTurn(
      "conv-2",
      { onChunk: (content) => chunks.push(content) },
      { isTurnRunning, timeoutMilliseconds: 60_000 },
    );
    latest().open();
    expect(latest().sent[0]).toEqual({ type: "subscribe", conversationId: "conv-2", afterSeq: BASE + 2 });
    latest().receive({ type: "subscribed", lastSeq: BASE + 4, replayedCount: 3, droppedCount: 0 });
    latest().receive({ type: "chunk", content: "already shown", seq: BASE + 2 });
    latest().receive({ type: "chunk", content: " and", seq: BASE + 3 });
    latest().receive({ type: "chunk", content: " the rest", seq: BASE + 4 });
    latest().receive({ type: "done", seq: BASE + 5 });

    await expect(outcome).resolves.toBe("done");
    expect(chunks).toEqual([" and", " the rest"]);
    expect(isTurnRunning).not.toHaveBeenCalled();
    expect(latest().readyState).toBe(3);
  });

  it("followLiveTurn settles as ended when the service restarted", async () => {
    cursorFor("conv-3").accept({ seq: BASE + 9 });
    const outcome = PrismService.followLiveTurn("conv-3", {}, {
      isTurnRunning: async () => true,
      timeoutMilliseconds: 60_000,
    });
    // The first connection attempt fails while the service is down.
    latest().drop();
    vi.advanceTimersByTime(15_000);
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: 0, replayedCount: 0, droppedCount: 0 });
    await expect(outcome).resolves.toBe("ended");
  });

  it("followLiveTurn asks the document when nothing was missed", async () => {
    cursorFor("conv-4").accept({ seq: BASE + 3 });
    const isTurnRunning = vi.fn(async () => false);
    const outcome = PrismService.followLiveTurn("conv-4", {}, {
      isTurnRunning,
      timeoutMilliseconds: 60_000,
    });
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: BASE + 3, replayedCount: 0, droppedCount: 0 });
    await expect(outcome).resolves.toBe("ended");
    expect(isTurnRunning).toHaveBeenCalledTimes(1);
  });

  it("followLiveTurn gives up after its timeout", async () => {
    const outcome = PrismService.followLiveTurn("conv-5", {}, {
      isTurnRunning: async () => true,
      timeoutMilliseconds: 1_000,
    });
    vi.advanceTimersByTime(1_000);
    await expect(outcome).resolves.toBe("timeout");
  });

  it("a reconnected viewer keeps reporting page visibility, and stops once closed", () => {
    const visibilityFrames = (socket: FakeWebSocket) =>
      socket.sent.filter((frame) => frame.type === "visibility");
    const cleanup = PrismService.subscribeToAutoResponse("conv-6", {});
    const first = latest();
    first.open();
    first.drop();
    vi.advanceTimersByTime(15_000);
    const second = latest();
    second.open();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(visibilityFrames(first)).toHaveLength(0);
    expect(visibilityFrames(second)).toEqual([{ type: "visibility", hidden: false }]);

    cleanup();
    second.readyState = 1; // a stray open socket must not report after cleanup
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visibilityFrames(second)).toHaveLength(1);
  });
});
