/**
 * Frame-level tests for PrismService._streamSSE — the ReadableStream reader
 * loop that parses the SSE wire format. These pin the transport behaviors
 * the agentic UI depends on: partial-line buffering, multi-byte safety,
 * trailing-buffer flush, terminal-state guarantees, and abort semantics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PrismService from "../PrismService";
import type { SSECallbacks } from "../../types/types";

const encoder = new TextEncoder();

/** Build a fetch Response whose body replays the given byte chunks. */
function mockSSEResponse(chunks: Uint8Array[]) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (index < chunks.length) {
            return { done: false, value: chunks[index++] };
          }
          return { done: true, value: undefined };
        },
      }),
    },
  };
}

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

describe("PrismService._streamSSE framing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let fetchResult: unknown;

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, options) => {
      // Honor abort like real fetch: reject if already aborted.
      const signal = (options as RequestInit | undefined)?.signal;
      if (signal?.aborted) {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      }
      return fetchResult as Response;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function collectCallbacks() {
    const calls: Array<{ kind: string; payload?: unknown }> = [];
    const callbacks: SSECallbacks = {
      onChunk: (content) => calls.push({ kind: "chunk", payload: content }),
      onToolExecution: (data) => calls.push({ kind: "tool_execution", payload: data }),
      onDone: (data) => calls.push({ kind: "done", payload: data }),
      onError: (error) => calls.push({ kind: "error", payload: error.message }),
      onStreamClosed: (info) => calls.push({ kind: "stream_closed", payload: info }),
      onAborted: () => calls.push({ kind: "aborted" }),
    };
    return { calls, callbacks };
  }

  it("parses an event split across multiple network chunks mid-JSON", async () => {
    const frame = sse({ type: "chunk", content: "hello world" });
    fetchResult = mockSSEResponse([
      encoder.encode(frame.slice(0, 15)),
      encoder.encode(frame.slice(15)),
      encoder.encode(sse({ type: "done" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/chat", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    expect(calls[0]).toEqual({ kind: "chunk", payload: "hello world" });
  });

  it("handles a multi-byte UTF-8 character split across chunk boundaries", async () => {
    const frame = encoder.encode(sse({ type: "chunk", content: "héllo 👋" }));
    // Split inside the emoji's 4-byte sequence (last 2 bytes of payload area)
    const splitAt = frame.length - 8;
    fetchResult = mockSSEResponse([
      frame.slice(0, splitAt),
      frame.slice(splitAt),
      encoder.encode(sse({ type: "done" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/chat", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    expect(calls[0]).toEqual({ kind: "chunk", payload: "héllo 👋" });
  });

  it("flushes a trailing event that has no terminating newline at EOF", async () => {
    // Final done event arrives without its trailing newline — must not be lost.
    fetchResult = mockSSEResponse([
      encoder.encode(sse({ type: "chunk", content: "partial" })),
      encoder.encode(`data: ${JSON.stringify({ type: "done" })}`),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/chat", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    expect(calls.some((c) => c.kind === "stream_closed")).toBe(false);
  });

  it("synthesizes onStreamClosed when the stream ends without done/error", async () => {
    fetchResult = mockSSEResponse([
      encoder.encode(sse({ type: "chunk", content: "cut off mid-" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() =>
      expect(calls.some((c) => c.kind === "stream_closed")).toBe(true),
    );
    const closed = calls.find((c) => c.kind === "stream_closed");
    expect(closed!.payload).toEqual({ reason: "eof-without-done" });
    expect(calls.some((c) => c.kind === "error")).toBe(false);
  });

  it("does NOT synthesize onStreamClosed when a done event was received", async () => {
    fetchResult = mockSSEResponse([encoder.encode(sse({ type: "done" }))]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    // Give the loop a tick to finish and potentially (wrongly) emit close
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.some((c) => c.kind === "stream_closed")).toBe(false);
  });

  it("treats a server error event as terminal (no onStreamClosed)", async () => {
    fetchResult = mockSSEResponse([
      encoder.encode(sse({ type: "error", message: "boom" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "error")).toBe(true));
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.some((c) => c.kind === "stream_closed")).toBe(false);
  });

  it("invokes onAborted (not onError) when the caller aborts", async () => {
    // Fetch that rejects with AbortError when the signal fires.
    fetchSpy.mockImplementation(
      (_url: unknown, options: unknown) =>
        new Promise((_resolve, reject) => {
          const signal = (options as RequestInit).signal!;
          signal.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }) as Promise<Response>,
    );

    const { calls, callbacks } = collectCallbacks();
    const abort = PrismService._streamSSE("/agent", {}, callbacks);
    abort();

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "aborted")).toBe(true));
    expect(calls.some((c) => c.kind === "error")).toBe(false);
    expect(calls.some((c) => c.kind === "stream_closed")).toBe(false);
  });

  it("surfaces HTTP errors through onError with the server message", async () => {
    fetchResult = {
      ok: false,
      status: 503,
      json: async () => ({ message: "backend overloaded" }),
    };

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "error")).toBe(true));
    expect(calls.find((c) => c.kind === "error")!.payload).toBe("backend overloaded");
  });

  it("surfaces a missing response body through onError instead of throwing", async () => {
    fetchResult = { ok: true, status: 200, body: null };

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "error")).toBe(true));
  });

  it("skips malformed JSON frames without killing the stream", async () => {
    fetchResult = mockSSEResponse([
      encoder.encode(`data: {not json}\n\n`),
      encoder.encode(sse({ type: "chunk", content: "still alive" })),
      encoder.encode(sse({ type: "done" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/chat", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    expect(calls.some((c) => c.kind === "chunk" && c.payload === "still alive")).toBe(true);
  });

  it("tolerates CRLF line endings", async () => {
    fetchResult = mockSSEResponse([
      encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: "windows" })}\r\n\r\n`),
      encoder.encode(`data: ${JSON.stringify({ type: "done" })}\r\n\r\n`),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/chat", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    expect(calls[0]).toEqual({ kind: "chunk", payload: "windows" });
  });

  it("skips SSE comment frames (server heartbeats) without dispatching", async () => {
    fetchResult = mockSSEResponse([
      encoder.encode(`: ping\n\n`),
      encoder.encode(sse({ type: "chunk", content: "after heartbeat" })),
      encoder.encode(`: ping\n\n`),
      encoder.encode(sse({ type: "done" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    expect(calls.map((c) => c.kind)).toEqual(["chunk", "done"]);
  });

  it("aborts a stalled stream via the watchdog and reports onStreamClosed(stalled)", async () => {
    vi.useFakeTimers();
    try {
      // A reader that yields one chunk then hangs forever; rejects with
      // AbortError when the fetch signal fires (like a real body reader).
      fetchSpy.mockImplementation(async (_url: unknown, options: unknown) => {
        const signal = (options as RequestInit).signal!;
        let delivered = false;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: () => {
                if (!delivered) {
                  delivered = true;
                  return Promise.resolve({
                    done: false,
                    value: encoder.encode(sse({ type: "chunk", content: "then silence" })),
                  });
                }
                return new Promise((_resolve, reject) => {
                  signal.addEventListener("abort", () => {
                    const error = new Error("Aborted");
                    error.name = "AbortError";
                    reject(error);
                  });
                });
              },
            }),
          },
        } as unknown as Response;
      });

      const { calls, callbacks } = collectCallbacks();
      PrismService._streamSSE("/agent", {}, callbacks);

      // Let the first chunk arrive, then advance past the stall window
      await vi.advanceTimersByTimeAsync(1);
      expect(calls.some((c) => c.kind === "chunk")).toBe(true);
      await vi.advanceTimersByTimeAsync(120_001);

      expect(calls.some((c) => c.kind === "stream_closed")).toBe(true);
      expect(calls.find((c) => c.kind === "stream_closed")!.payload).toEqual({
        reason: "stalled",
      });
      expect(calls.some((c) => c.kind === "aborted")).toBe(false);
      expect(calls.some((c) => c.kind === "error")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("normalizes durationMilliseconds to durationMs on tool events", async () => {
    fetchResult = mockSSEResponse([
      encoder.encode(
        sse({
          type: "tool_execution",
          tool: { id: "tc-1", name: "read_file", status: "done", durationMilliseconds: 420 },
        }),
      ),
      encoder.encode(sse({ type: "done" })),
    ]);

    const { calls, callbacks } = collectCallbacks();
    PrismService._streamSSE("/agent", {}, callbacks);

    await vi.waitFor(() => expect(calls.some((c) => c.kind === "done")).toBe(true));
    const toolEvent = calls.find((c) => c.kind === "tool_execution")!.payload as {
      tool: { durationMs?: number };
    };
    expect(toolEvent.tool.durationMs).toBe(420);
  });
});
