import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  openLiveViewerSocket,
  reconnectDelayMilliseconds,
  type LiveSocketState,
} from "../liveViewerSocket";
import { createCursor } from "../../utils/liveTurnCursor";
import type { TurnEvent } from "../../types/types";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((_event: Event) => void) | null = null;
  onmessage: ((_event: MessageEvent) => void) | null = null;
  onerror: ((_event: Event) => void) | null = null;
  onclose: ((_event: CloseEvent) => void) | null = null;
  constructor(_url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
  // -- test helpers --
  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }
  receive(frame: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
  /** The server went away. */
  drop() {
    this.readyState = 3;
    this.onerror?.({} as Event);
    this.onclose?.({} as CloseEvent);
  }
}

const BASE = 1_760_000_000_000;
const BACKOFF = { initialMilliseconds: 1_000, maxMilliseconds: 8_000, factor: 2 };

function openSocket(url: string | null = "ws://prism.test/ws/chat") {
  const events: TurnEvent[] = [];
  const states: LiveSocketState[] = [];
  const subscribed = vi.fn();
  const cursor = createCursor();
  const socket = openLiveViewerSocket({
    url,
    conversationId: "conv-1",
    cursor,
    onEvent: (event) => events.push(event),
    onSubscribed: subscribed,
    onStateChange: (state) => states.push(state),
    backoff: BACKOFF,
    random: () => 0.5,
    createSocket: (socketUrl) => new FakeSocket(socketUrl) as unknown as WebSocket,
  });
  const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1];
  const texts = () => events.map((event) => ("content" in event ? event.content : undefined));
  return { socket, events, texts, states, subscribed, cursor, latest };
}

describe("reconnectDelayMilliseconds", () => {
  it("doubles up to the cap, half of each delay jittered", () => {
    expect(reconnectDelayMilliseconds(0, BACKOFF, () => 0)).toBe(500);
    expect(reconnectDelayMilliseconds(0, BACKOFF, () => 1)).toBe(1_000);
    expect(reconnectDelayMilliseconds(2, BACKOFF, () => 0.5)).toBe(3_000);
    expect(reconnectDelayMilliseconds(10, BACKOFF, () => 1)).toBe(8_000);
  });
});

describe("openLiveViewerSocket", () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("after a drop, reconnects with growing backoff and resubscribes after the last seq", () => {
    const { latest, states, texts, subscribed } = openSocket();
    const first = latest();
    first.open();
    expect(first.sent).toEqual([{ type: "subscribe", conversationId: "conv-1" }]);
    first.receive({ type: "subscribed", lastSeq: BASE + 2, replayedCount: 2, droppedCount: 0 });
    first.receive({ type: "chunk", content: "Hel", seq: BASE + 1 });
    first.receive({ type: "chunk", content: "lo", seq: BASE + 2 });
    expect(states).toEqual(["connecting", "live"]);

    first.drop();
    expect(states.at(-1)).toBe("reconnecting");
    // Attempt 1 after 750 ms (1 000 ms ceiling, jitter 0.5) — and it fails.
    vi.advanceTimersByTime(749);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    latest().drop();
    // Attempt 2 backs off to 1 500 ms.
    vi.advanceTimersByTime(1_499);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);

    const third = latest();
    third.open();
    expect(third.sent).toEqual([
      { type: "subscribe", conversationId: "conv-1", afterSeq: BASE + 2 },
    ]);
    // Replay: the ack, then everything the buffer holds past the mark — the
    // server's replay may still include what this client already rendered.
    third.receive({ type: "subscribed", lastSeq: BASE + 4, replayedCount: 3, droppedCount: 0 });
    third.receive({ type: "chunk", content: "lo", seq: BASE + 2 });
    third.receive({ type: "chunk", content: " wor", seq: BASE + 3 });
    third.receive({ type: "chunk", content: "ld", seq: BASE + 4 });
    third.receive({ type: "chunk", content: "!", seq: BASE + 5 });

    expect(texts()).toEqual(["Hel", "lo", " wor", "ld", "!"]);
    expect(states.at(-1)).toBe("live");
    expect(subscribed.mock.calls.map(([info]) => info.isReconnect)).toEqual([false, true]);

    // A successful subscribe resets the backoff.
    third.drop();
    vi.advanceTimersByTime(750);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it("close() stops reconnecting", () => {
    const { socket, latest, states } = openSocket();
    latest().open();
    latest().drop();
    socket.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(states.at(-1)).toBe("closed");
  });

  it("a missing URL opens nothing and reports the banner state", () => {
    const { socket, states } = openSocket(null);
    expect(FakeSocket.instances).toHaveLength(0);
    expect(states).toEqual(["unconfigured"]);
    expect(socket.state()).toBe("unconfigured");
    socket.close();
    expect(socket.state()).toBe("unconfigured");
  });

  it("keeps retrying when the socket cannot even be created", () => {
    let attempts = 0;
    const states: LiveSocketState[] = [];
    openLiveViewerSocket({
      url: "ws://prism.test/ws/chat",
      conversationId: "conv-1",
      cursor: createCursor(),
      onEvent: () => {},
      onStateChange: (state) => states.push(state),
      backoff: BACKOFF,
      random: () => 0,
      createSocket: () => {
        attempts += 1;
        throw new Error("SecurityError");
      },
    });
    expect(attempts).toBe(1);
    vi.advanceTimersByTime(500);
    expect(attempts).toBe(2);
    expect(states).toEqual(["connecting", "reconnecting"]);
  });
});
