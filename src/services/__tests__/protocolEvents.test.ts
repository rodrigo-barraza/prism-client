/**
 * The wire boundary of the event protocol (src/services/protocolEvents.ts):
 *
 *   - it accepts every recorded fixture as a valid event of its stream;
 *   - it rejects an unknown event type — drops it and logs it visibly —
 *     on the SSE path and the viewer socket alike;
 *   - it keeps a known event with an unexpected field (a newer server) and,
 *     outside production, reports the schema violation;
 *   - `hello` from a newer protocol is reported, and dispatches nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import PrismService from "../PrismService";
import { parseStreamEvent, _resetProtocolReports } from "../protocolEvents";
import { PROTOCOL_VERSION, validateTurnEvent } from "../../types/protocol/events";
import type { SSECallbacks } from "../../types/types";

const FIXTURES = resolve(__dirname, "../../__fixtures__");

/** Every recorded event: the SSE transcripts, one event per line, and the single-event fixtures. */
function recordedEvents(): Array<{ source: string; event: unknown }> {
  const transcripts = readdirSync(resolve(FIXTURES, "sse-transcripts"))
    .filter((file) => file.endsWith(".jsonl"))
    .flatMap((file) =>
      readFileSync(resolve(FIXTURES, "sse-transcripts", file), "utf-8")
        .split("\n")
        .map((line, index) => ({ line, source: `${file}:${index + 1}` }))
        .filter(({ line }) => line.trim())
        .map(({ line, source }) => ({ source, event: JSON.parse(line) as unknown })),
    );
  const singles = readdirSync(resolve(FIXTURES, "approvals"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      source: `approvals/${file}`,
      event: JSON.parse(readFileSync(resolve(FIXTURES, "approvals", file), "utf-8")) as unknown,
    }));
  return [...transcripts, ...singles];
}

const encoder = new TextEncoder();

function sseResponse(events: unknown[]) {
  const body = encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: body })),
      }),
    },
  } as unknown as Response;
}

describe("protocolEvents.parseStreamEvent", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetProtocolReports();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("accepts every recorded fixture, and each one is a valid TurnEvent", () => {
    const events = recordedEvents();
    expect(events.length).toBeGreaterThan(40);
    const rejected = events.filter(({ event }) => parseStreamEvent(event, "turn") === null);
    const invalid = events.flatMap(({ source, event }) => {
      const result = validateTurnEvent(event);
      return result.success
        ? []
        : [`${source}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`];
    });
    expect(rejected.map(({ source }) => source)).toEqual([]);
    expect(invalid).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("rejects an unknown event type and says so, once per type", () => {
    expect(parseStreamEvent({ type: "teleport", to: "mars" }, "turn")).toBeNull();
    expect(parseStreamEvent({ type: "teleport", to: "venus" }, "turn")).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain('unknown type "teleport"');
    expect(String(consoleError.mock.calls[0][0])).toContain(`protocol v${PROTOCOL_VERSION}`);
  });

  it("rejects a frame with no type", () => {
    expect(parseStreamEvent({ content: "orphan" }, "turn")).toBeNull();
    expect(parseStreamEvent("just text", "turn")).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it("keeps a known event with an unexpected field, and reports the drift outside production", () => {
    const event = { type: "chunk", content: "hi", addedByANewerServer: true };
    expect(parseStreamEvent(event, "turn")).toBe(event);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(String(consoleWarn.mock.calls[0][0])).toContain('"chunk" event does not match');
  });

  it("reports a newer protocol version from hello", () => {
    expect(parseStreamEvent({ type: "hello", protocolVersion: PROTOCOL_VERSION + 1 }, "turn")).not.toBeNull();
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining(`protocol v${PROTOCOL_VERSION + 1}`));
  });

  it("accepts a background task's events and a task notification's turn input", () => {
    const started = {
      type: "background_task",
      seq: 41,
      conversationId: "conv-1",
      taskId: "shell-ab12cd34",
      taskType: "shell",
      status: "running",
      description: "Build the client",
      command: "npm run build",
      outputFile: "/tmp/prism-1000/tasks/shell-ab12cd34.output",
      at: "2026-10-06T12:00:00.000Z",
    };
    const batch = {
      type: "background_task",
      conversationId: "conv-1",
      taskId: "monitor-ab12cd34",
      taskType: "monitor",
      status: "running",
      description: "deploy events",
      wsUrl: "wss://events.example.com/stream",
      eventCount: 3,
      at: "2026-10-06T12:00:05.000Z",
    };
    const killed = { ...started, status: "killed", exitCode: null, at: "2026-10-06T12:01:00.000Z" };
    const notification = {
      type: "turn_input",
      id: "input-7",
      kind: "task_notification",
      source: "task",
      content: "<task-notification>\n<task-id>monitor-ab12cd34</task-id>\n<task-type>monitor</task-type>\n</task-notification>",
      boundary: "after_tools",
      iteration: 3,
    };
    for (const frame of [started, batch, killed, notification]) {
      expect(parseStreamEvent(frame, "turn")).toBe(frame);
      expect(validateTurnEvent(frame).success).toBe(true);
    }
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("reports a background task event that breaks the protocol, and still passes it on", () => {
    const frame = {
      type: "background_task",
      conversationId: "conv-1",
      taskId: "shell-1",
      taskType: "daemon",
      status: "running",
      description: "x",
      at: "2026-10-06T12:00:00.000Z",
    };
    expect(parseStreamEvent(frame, "turn")).toBe(frame);
    expect(String(consoleWarn.mock.calls[0][0])).toContain('"background_task" event does not match');
    expect(String(consoleWarn.mock.calls[0][0])).toContain("taskType");
  });

  it("reads each stream with its own event types", () => {
    expect(parseStreamEvent({ type: "turn_start", role: "user", index: 0 }, "synthesis")).not.toBeNull();
    expect(parseStreamEvent({ type: "turn_start", role: "user", index: 0 }, "turn")).toBeNull();
    expect(parseStreamEvent({ type: "tool_execution" }, "synthesis")).toBeNull();
    expect(parseStreamEvent({ type: "run_info", totalModels: 3 }, "turn")).toBeNull();
  });
});

describe("the SSE stream drops what the protocol does not know", () => {
  afterEach(() => vi.restoreAllMocks());

  it("dispatches the known events around an unknown one, and nothing for hello", async () => {
    _resetProtocolReports();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(
      sseResponse([
        { type: "hello", protocolVersion: PROTOCOL_VERSION },
        { type: "chunk", content: "before" },
        { type: "teleport", to: "mars" },
        { type: "chunk", content: "after" },
        { type: "done", provider: "anthropic", model: "claude-sonnet-5", usage: null, estimatedCost: null, totalTime: 1 },
      ]),
    );
    const chunks: string[] = [];
    const done = new Promise<void>((resolveDone) => {
      const callbacks: SSECallbacks = {
        onChunk: (content) => chunks.push(content),
        onDone: () => resolveDone(),
      };
      PrismService._streamSSE("/agent", { body: {} }, callbacks);
    });
    await done;

    expect(chunks).toEqual(["before", "after"]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('unknown type "teleport"'), expect.anything());
  });

  it("hands an error event to onError as a StreamError carrying its code", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(
      sseResponse([
        { type: "hello", protocolVersion: PROTOCOL_VERSION },
        { type: "error", code: "rate_limited", message: "slow down", retryable: true, provider: "anthropic", status: 429 },
      ]),
    );
    const error = await new Promise<Error>((resolveError) => {
      PrismService._streamSSE("/agent", { body: {} }, { onError: resolveError });
    });

    expect(error).toMatchObject({
      name: "StreamError",
      message: "slow down",
      code: "rate_limited",
      retryable: true,
      provider: "anthropic",
      status: 429,
    });
  });
});
