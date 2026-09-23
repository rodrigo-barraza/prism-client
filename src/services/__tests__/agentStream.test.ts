/**
 * The agent chat's transport (agentStream.ts), one async iterator per way a
 * turn's events arrive:
 *   - the SSE the chat drives: the request, the event cursor it advances,
 *     Stop, and the ways it can end;
 *   - the viewer socket: `afterSeq` on every (re)subscribe, replay
 *     de-duplication, a truncated replay, a service restart;
 *   - following a turn after its SSE dropped, until it ends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
  PRISM_WEBSOCKET_URL: "ws://prism.test",
}));

import {
  followTurn,
  openTurnStream,
  StreamClosedError,
  watchConversation,
  type AgentStream,
  type AgentStreamItem,
} from "../agentStream";
import { cursorFor, resetAllCursors } from "../../utils/liveTurnCursor";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((_event: { data: string }) => void) | null = null;
  onerror: ((_event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  private listeners = new Map<string, Set<() => void>>();
  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
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
    for (const listener of this.listeners.get("open") ?? []) listener();
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  subscriptions() {
    return this.sent.filter((frame) => frame.type === "subscribe");
  }
}

const BASE = 1_760_000_000_000;
const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

/** Collect a stream's items as they arrive (the iteration runs in the background). */
function collect(stream: AgentStream) {
  const items: AgentStreamItem[] = [];
  const finished = (async () => {
    for await (const item of stream) items.push(item);
  })();
  return { items, finished };
}

/** Let the iterator's queued promises run (timers may be faked: microtasks only). */
async function flush() {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

const eventsOf = (items: AgentStreamItem[]) =>
  items.flatMap((item) => (item.kind === "event" ? [item.event] : []));
const chunksOf = (items: AgentStreamItem[]) =>
  eventsOf(items).flatMap((event) => (event.type === "chunk" ? [event.content] : []));

describe("agentStream — the viewer socket", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    resetAllCursors();
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it("subscribes without afterSeq, then resubscribes after the last accepted seq", async () => {
    const stream = watchConversation("conv-1");
    const { items } = collect(stream);
    latest().open();
    expect(latest().subscriptions()).toEqual([{ type: "subscribe", conversationId: "conv-1" }]);
    latest().receive({ type: "subscribed", lastSeq: BASE + 2, replayedCount: 2, droppedCount: 0 });
    latest().receive({ type: "chunk", content: "a", seq: BASE + 1 });
    latest().receive({ type: "chunk", content: "b", seq: BASE + 2 });

    latest().drop();
    vi.advanceTimersByTime(15_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().open();
    expect(latest().subscriptions()).toEqual([
      { type: "subscribe", conversationId: "conv-1", afterSeq: BASE + 2 },
    ]);
    await vi.waitFor(() => expect(chunksOf(items)).toEqual(["a", "b"]));
    expect(items.filter((item) => item.kind === "connection").map((item) => item.kind === "connection" && item.state)).toEqual([
      "connecting",
      "live",
      "reconnecting",
    ]);
    stream.close();
  });

  it("drops replayed events at or below the held mark, never by the ack's lastSeq", async () => {
    cursorFor("conv-2").accept({ seq: BASE + 10 });
    const stream = watchConversation("conv-2");
    const { items } = collect(stream);
    latest().open();
    expect(latest().subscriptions()[0].afterSeq).toBe(BASE + 10);
    // The ack comes first; its lastSeq is the NEWEST seq, and every replayed frame is ≤ it.
    latest().receive({ type: "subscribed", lastSeq: BASE + 13, replayedCount: 3, droppedCount: 0 });
    for (const [content, seq] of [
      ["dup", BASE + 10],
      ["11", BASE + 11],
      ["12", BASE + 12],
      ["13", BASE + 13],
      ["live", BASE + 14],
    ] as const) {
      latest().receive({ type: "chunk", content, seq });
    }
    latest().receive({ type: "chunk", content: "no-seq" });
    await vi.waitFor(() => expect(chunksOf(items)).toEqual(["11", "12", "13", "live", "no-seq"]));
    expect(cursorFor("conv-2").afterSeq()).toBe(BASE + 14);
    const subscribed = items.find((item) => item.kind === "subscribed");
    expect(subscribed?.kind === "subscribed" && subscribed.info.truncated).toBe(false);
    stream.close();
  });

  it("says when the service had to truncate the replay", async () => {
    const stream = watchConversation("conv-3");
    const { items } = collect(stream);
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: BASE + 90, replayedCount: 50, droppedCount: 7 });
    await vi.waitFor(() => expect(items.some((item) => item.kind === "subscribed")).toBe(true));
    const subscribed = items.find((item) => item.kind === "subscribed");
    expect(subscribed?.kind === "subscribed" && subscribed.info).toMatchObject({ truncated: true, droppedCount: 7 });
    stream.close();
  });

  it("reports the turn lost when a resubscribe finds the service restarted", async () => {
    const stream = watchConversation("conv-4");
    const { items } = collect(stream);
    latest().open();
    // The first subscribe to an idle conversation loses nothing.
    latest().receive({ type: "subscribed", lastSeq: 0, replayedCount: 0, droppedCount: 0 });
    latest().receive({ type: "chunk", content: "partial", seq: BASE + 1 });
    latest().drop();
    vi.advanceTimersByTime(15_000);
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: 0, replayedCount: 0, droppedCount: 0 });
    await vi.waitFor(() => expect(items.at(-1)?.kind).toBe("turn-lost"));
    expect(items.filter((item) => item.kind === "turn-lost")).toHaveLength(1);
    stream.close();
  });

  it("normalizes socket events the way the SSE's are", async () => {
    const stream = watchConversation("conv-5");
    const { items } = collect(stream);
    latest().open();
    latest().receive({
      type: "tool_execution",
      status: "done",
      tool: { id: "tc-1", name: "read_file", durationMilliseconds: 420 },
    });
    await vi.waitFor(() => expect(eventsOf(items)).toHaveLength(1));
    const [event] = eventsOf(items);
    expect(event.type === "tool_execution" && event.tool.durationMs).toBe(420);
    stream.close();
  });

  it("ends the iteration and closes the socket on close()", async () => {
    const stream = watchConversation("conv-6");
    const { items, finished } = collect(stream);
    latest().open();
    stream.close();
    await finished;
    expect(latest().readyState).toBe(3);
    latest().receive({ type: "chunk", content: "too late" });
    await flush();
    expect(chunksOf(items)).toEqual([]);
  });

  it("keeps reporting page visibility on a reconnected socket, and stops once closed", () => {
    const visibilityFrames = (socket: FakeWebSocket) =>
      socket.sent.filter((frame) => frame.type === "visibility");
    const visible = { type: "visibility", hidden: false };
    const stream = watchConversation("conv-7");
    const first = latest();
    first.open();
    first.drop();
    vi.advanceTimersByTime(15_000);
    const second = latest();
    second.open();

    document.dispatchEvent(new Event("visibilitychange"));
    // Each socket reports on open; only the live one on a change.
    expect(visibilityFrames(first)).toEqual([visible]);
    expect(visibilityFrames(second)).toEqual([visible, visible]);

    stream.close();
    second.readyState = 1; // a stray open socket must not report after close
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visibilityFrames(second)).toHaveLength(2);
  });
});

describe("agentStream — following a turn after its SSE dropped", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    resetAllCursors();
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it("continues from the SSE's cursor without repeating anything, and ends with the turn", async () => {
    // The SSE rendered through seq 2 before it dropped.
    cursorFor("conv-2").accept({ seq: BASE + 2 });
    const isTurnRunning = vi.fn(async () => true);
    const recovery = followTurn("conv-2", { isTurnRunning, timeoutMilliseconds: 60_000 });
    const { items, finished } = collect(recovery);
    latest().open();
    expect(latest().subscriptions()[0]).toEqual({ type: "subscribe", conversationId: "conv-2", afterSeq: BASE + 2 });
    latest().receive({ type: "subscribed", lastSeq: BASE + 4, replayedCount: 3, droppedCount: 0 });
    latest().receive({ type: "chunk", content: "already shown", seq: BASE + 2 });
    latest().receive({ type: "chunk", content: " and", seq: BASE + 3 });
    latest().receive({ type: "chunk", content: " the rest", seq: BASE + 4 });
    latest().receive({ type: "done", seq: BASE + 5 });

    await expect(recovery.outcome).resolves.toBe("done");
    await finished;
    expect(chunksOf(items)).toEqual([" and", " the rest"]);
    expect(eventsOf(items).at(-1)?.type).toBe("done");
    expect(isTurnRunning).not.toHaveBeenCalled();
    expect(latest().readyState).toBe(3);
  });

  it("ends when the service restarted and holds nothing for the conversation", async () => {
    cursorFor("conv-3").accept({ seq: BASE + 9 });
    const recovery = followTurn("conv-3", { isTurnRunning: async () => true, timeoutMilliseconds: 60_000 });
    collect(recovery);
    // The first attempt fails while the service is down.
    latest().drop();
    vi.advanceTimersByTime(15_000);
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: 0, replayedCount: 0, droppedCount: 0 });
    await expect(recovery.outcome).resolves.toBe("ended");
  });

  it("asks the document whether the turn still runs when nothing was missed", async () => {
    cursorFor("conv-4").accept({ seq: BASE + 3 });
    const isTurnRunning = vi.fn(async () => false);
    const recovery = followTurn("conv-4", { isTurnRunning, timeoutMilliseconds: 60_000 });
    collect(recovery);
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: BASE + 3, replayedCount: 0, droppedCount: 0 });
    await expect(recovery.outcome).resolves.toBe("ended");
    expect(isTurnRunning).toHaveBeenCalledTimes(1);
  });

  it("gives up after its timeout", async () => {
    const recovery = followTurn("conv-5", { isTurnRunning: async () => true, timeoutMilliseconds: 1_000 });
    collect(recovery);
    vi.advanceTimersByTime(1_000);
    await expect(recovery.outcome).resolves.toBe("timeout");
  });

  it("ends with the socket's closed state for the connection badge", async () => {
    const recovery = followTurn("conv-6", { isTurnRunning: async () => true, timeoutMilliseconds: 60_000 });
    const { items, finished } = collect(recovery);
    latest().open();
    latest().receive({ type: "subscribed", lastSeq: BASE + 1, replayedCount: 1, droppedCount: 0 });
    latest().receive({ type: "done", seq: BASE + 1 });
    await finished;
    const states = items.flatMap((item) => (item.kind === "connection" ? [item.state] : []));
    expect(states).toEqual(["connecting", "live", "closed"]);
  });
});

describe("agentStream — the SSE the chat drives", () => {
  const encoder = new TextEncoder();
  const sse = (event: Record<string, unknown>) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let requests: Array<{ url: string; body: unknown }>;
  let respondWith: (_signal: AbortSignal) => unknown;

  beforeEach(() => {
    resetAllCursors();
    requests = [];
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) });
      return respondWith((init as RequestInit).signal!) as Response;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /** A body that replays `chunks`, then ends. */
  const body = (chunks: Uint8Array[]) => {
    let index = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () =>
            index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined },
        }),
      },
    };
  };

  it("posts the turn to /agent and advances the conversation's cursor, dropping repeats", async () => {
    respondWith = () =>
      body([
        sse({ type: "chunk", content: "x", seq: BASE + 1 }),
        sse({ type: "chunk", content: "x-dup", seq: BASE + 1 }),
        sse({ type: "done", seq: BASE + 2 }),
      ]);
    const { items, finished } = collect(openTurnStream("/agent", { conversationId: "conv-9", messages: [] }));
    await finished;
    expect(requests).toEqual([{ url: "http://prism.test/agent", body: { conversationId: "conv-9", messages: [] } }]);
    expect(eventsOf(items).map((event) => event.type)).toEqual(["chunk", "done"]);
    // A later viewer socket for the conversation resumes after the SSE.
    expect(cursorFor("conv-9").afterSeq()).toBe(BASE + 2);
  });

  it("posts a direct chat to /chat, which keeps no cursor", async () => {
    respondWith = () => body([sse({ type: "chunk", content: "hi", seq: BASE + 1 }), sse({ type: "done" })]);
    await collect(openTurnStream("/chat", { conversationId: "conv-10", messages: [] })).finished;
    expect(requests[0].url).toBe("http://prism.test/chat");
    expect(cursorFor("conv-10").afterSeq()).toBeUndefined();
  });

  it("delivers a server error as an event, and ends there", async () => {
    respondWith = () => body([sse({ type: "error", code: "provider_error", message: "boom", retryable: false })]);
    const { items, finished } = collect(openTurnStream("/agent", { conversationId: "conv-11" }));
    await finished;
    expect(eventsOf(items)).toEqual([{ type: "error", code: "provider_error", message: "boom", retryable: false }]);
  });

  it("throws StreamClosedError when the body ends before done or error", async () => {
    respondWith = () => body([sse({ type: "chunk", content: "cut" })]);
    const { items, finished } = collect(openTurnStream("/agent", { conversationId: "conv-12" }));
    await expect(finished).rejects.toBeInstanceOf(StreamClosedError);
    await expect(finished).rejects.toThrow("SSE network stream closed early (eof-without-done)");
    expect(chunksOf(items)).toEqual(["cut"]);
  });

  it("throws the server's message on an HTTP error", async () => {
    respondWith = () => ({ ok: false, status: 503, json: async () => ({ message: "backend overloaded" }) });
    await expect(collect(openTurnStream("/agent", { conversationId: "conv-13" })).finished).rejects.toThrow(
      "backend overloaded",
    );
  });

  it("ends quietly on close() — even when the body never answers the abort", async () => {
    // A reader that yields one frame, then hangs forever and ignores the signal.
    let delivered = false;
    respondWith = () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: () => {
            if (delivered) return new Promise(() => {});
            delivered = true;
            return Promise.resolve({ done: false, value: sse({ type: "chunk", content: "then silence" }) });
          },
        }),
      },
    });
    const stream = openTurnStream("/agent", { conversationId: "conv-14" });
    const { items, finished } = collect(stream);
    await vi.waitFor(() => expect(chunksOf(items)).toEqual(["then silence"]));
    stream.close();
    await expect(finished).resolves.toBeUndefined();
  });
});
