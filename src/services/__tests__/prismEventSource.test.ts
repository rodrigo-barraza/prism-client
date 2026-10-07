/**
 * PrismEventSource: an EventSource whose request carries the user's token,
 * with EventSource's framing and reconnect rules.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_RECONNECT_MILLISECONDS, PrismEventSource } from "../prismEventSource";
import { TEST_PRISM_TOKEN } from "../../../tests/prismTokenStub";

const STREAM_URL = "http://prism.test/admin/changes/stream";

/** A response body the test writes into. */
function writableBody() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  return {
    body,
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
  };
}

/** Promise chains (fetch, the body reader) settle; timers do not move. */
async function settle() {
  for (let round = 0; round < 30; round += 1) await Promise.resolve();
}

describe("PrismEventSource", () => {
  let network: ReturnType<typeof vi.fn>;
  let bodies: Array<ReturnType<typeof writableBody>>;
  let sources: PrismEventSource[];

  function open() {
    const source = new PrismEventSource(STREAM_URL);
    const messages: string[] = [];
    const errors = vi.fn();
    source.onmessage = (event) => messages.push(event.data as string);
    source.onerror = errors;
    sources.push(source);
    return { source, messages, errors };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    bodies = [];
    sources = [];
    network = vi.fn(async () => {
      const body = writableBody();
      bodies.push(body);
      return new Response(body.body, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", network);
  });

  afterEach(() => {
    for (const source of sources) source.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the stream with the user's token", async () => {
    open();
    await settle();
    expect(network).toHaveBeenCalledTimes(1);
    const [url, init] = network.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(STREAM_URL);
    expect(init.headers).toEqual({ Accept: "text/event-stream", Authorization: `Bearer ${TEST_PRISM_TOKEN}` });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("delivers each message's data lines once a blank line ends it; pings and named events are not messages", async () => {
    const { messages } = open();
    await settle();
    const [body] = bodies;
    body.write(": ping\n\n");
    body.write('data: {"type":"status","changeStreams":true}\n\n');
    body.write("data: first line\ndata: second line\n\n");
    body.write("event: other\ndata: not a message\n\n");
    body.write("data: crlf\r\n\r\n");
    body.write("data: spl");
    body.write("it\n\n");
    body.write("data: cr\r");
    body.write("\ndata: same message\n\n");
    body.write("data:no space\n\n");
    await settle();
    expect(messages).toEqual([
      '{"type":"status","changeStreams":true}',
      "first line\nsecond line",
      "crlf",
      "split",
      "cr\nsame message",
      "no space",
    ]);
  });

  it("reconnects after the stream ends, waiting what `retry:` asked", async () => {
    const { errors, messages } = open();
    await settle();
    bodies[0].write("retry: 1000\n\n");
    bodies[0].end();
    await settle();
    expect(errors).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    await settle();
    expect(network).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await settle();
    expect(network).toHaveBeenCalledTimes(2);
    bodies[1].write("data: after the reconnect\n\n");
    await settle();
    expect(messages).toEqual(["after the reconnect"]);
  });

  it("reconnects after a network error, by default in three seconds", async () => {
    network.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { errors } = open();
    await settle();
    expect(errors).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DEFAULT_RECONNECT_MILLISECONDS);
    await settle();
    expect(network).toHaveBeenCalledTimes(2);
    expect(DEFAULT_RECONNECT_MILLISECONDS).toBe(3_000);
  });

  it("stays closed once prism-service refuses the request", async () => {
    network.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Admin only." }), { status: 403 }));
    const { source, errors } = open();
    await settle();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(source.readyState).toBe(2);
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("close() ends the stream: nothing more arrives, and it never reconnects", async () => {
    const { source, messages, errors } = open();
    await settle();
    bodies[0].write("data: before\n\n");
    await settle();
    source.close();
    await settle();
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(messages).toEqual(["before"]);
    expect(errors).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(1);
  });
});
