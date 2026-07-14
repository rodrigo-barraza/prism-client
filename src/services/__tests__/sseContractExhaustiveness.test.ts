/**
 * Contract exhaustiveness: every event type in the shared taxonomy
 * (SERVER_SENT_EVENT_TYPES — the prism-service ↔ prism-client streaming
 * contract) must be routed to a callback by PrismService._dispatchSSE,
 * or be explicitly listed here as intentionally unhandled.
 *
 * This converts the dispatcher's silent `default: break` into a test
 * failure whenever the taxonomy gains an event the client doesn't know.
 */
import { describe, it, expect, vi } from "vitest";
import { SERVER_SENT_EVENT_TYPES } from "@rodrigo-barraza/utilities-library/taxonomy";
import PrismService from "../PrismService";
import type { SSECallbacks } from "../../types/types";

/**
 * Event types the client deliberately does not handle.
 * Add an entry ONLY with a reason — anything else must have a dispatch case.
 */
const INTENTIONALLY_UNHANDLED: Record<string, string> = {
  [SERVER_SENT_EVENT_TYPES.TEXT]:
    "never emitted as an SSE envelope type — 'text' exists in the taxonomy for content blocks / live-voice WS frames",
  [SERVER_SENT_EVENT_TYPES.TOKEN]:
    "legacy alias, no emit sites in prism-service",
};

/** Minimal payload per event so the dispatch cast paths don't throw. */
function makeEvent(type: string): Record<string, unknown> {
  return {
    type,
    content: "x",
    data: "x",
    mimeType: "image/png",
    code: "x",
    language: "js",
    output: "x",
    outcome: "ok",
    results: [],
    id: "tc-1",
    name: "tool",
    args: {},
    message: "msg",
    conversationId: "c-1",
    role: "assistant",
    index: 0,
  };
}

function buildSpyCallbacks(): { callbacks: SSECallbacks; spies: Array<ReturnType<typeof vi.fn>> } {
  const spies: Array<ReturnType<typeof vi.fn>> = [];
  const spy = () => {
    const fn = vi.fn();
    spies.push(fn);
    return fn;
  };
  const callbacks: SSECallbacks = {
    onChunk: spy(),
    onThinking: spy(),
    onImage: spy(),
    onAudio: spy(),
    onExecutableCode: spy(),
    onCodeExecutionResult: spy(),
    onWebSearchResult: spy(),
    onToolCall: spy(),
    onToolExecution: spy(),
    onToolOutput: spy(),
    onSubAgentToolExecution: spy(),
    onSubAgentToolOutput: spy(),
    onSubAgentStatus: spy(),
    onApprovalRequired: spy(),
    onPlanProposal: spy(),
    onUserQuestion: spy(),
    onTaskNotification: spy(),
    onConversationStateUpdate: spy(),
    onTodoUpdate: spy(),
    onBriefUpdate: spy(),
    onRunInfo: spy(),
    onModelStart: spy(),
    onModelComplete: spy(),
    onRunComplete: spy(),
    onUsageUpdate: spy(),
    onContextBudget: spy(),
    onStatus: spy(),
    onSynthesisStart: spy(),
    onTurnStart: spy(),
    onTurnComplete: spy(),
    onDone: spy(),
    onError: spy(),
    onStreamClosed: spy(),
    onAborted: spy(),
  };
  return { callbacks, spies };
}

describe("SSE contract exhaustiveness", () => {
  const allTypes = Object.values(SERVER_SENT_EVENT_TYPES) as string[];

  it.each(allTypes.filter((t) => !(t in INTENTIONALLY_UNHANDLED)))(
    "dispatches taxonomy event type '%s' to a callback",
    (type) => {
      const { callbacks, spies } = buildSpyCallbacks();
      PrismService._dispatchSSE(makeEvent(type) as never, callbacks);
      const totalCalls = spies.reduce((sum, s) => sum + s.mock.calls.length, 0);
      expect(totalCalls).toBeGreaterThan(0);
    },
  );

  it("documents why unhandled taxonomy types are unhandled", () => {
    for (const [type, reason] of Object.entries(INTENTIONALLY_UNHANDLED)) {
      expect(allTypes).toContain(type);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it("dispatches the synthesis framing events (not yet in the shared taxonomy)", () => {
    // synthesis_start / turn_start / turn_complete are a client↔server
    // sub-protocol for /synthesis/generate; they should be promoted into
    // SERVER_SENT_EVENT_TYPES — this test documents them until then.
    for (const type of ["synthesis_start", "turn_start", "turn_complete"]) {
      const { callbacks, spies } = buildSpyCallbacks();
      PrismService._dispatchSSE(makeEvent(type) as never, callbacks);
      const totalCalls = spies.reduce((sum, s) => sum + s.mock.calls.length, 0);
      expect(totalCalls).toBeGreaterThan(0);
    }
  });
});
