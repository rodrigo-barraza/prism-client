/**
 * Golden-transcript replay: drives a recorded agent-turn SSE event stream
 * through PrismService._dispatchSSE and snapshots the ordered callback
 * sequence. Any change to dispatcher routing (Phase 1 refactor) must keep
 * this sequence identical — or update the snapshot intentionally.
 *
 * Fixtures live in src/__fixtures__/sse-transcripts/*.jsonl, one JSON event
 * per line, in the exact wire shape prism-service emits.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PrismService from "../PrismService";
import { normalizeStreamEvent } from "../agentStream";
import type {
  ContextBudgetEvent,
  SSECallbacks,
  StatusEvent,
  SubAgentStatusEvent,
  SubAgentToolExecutionEvent,
  ToolExecutionEvent,
  ToolOutputEvent,
  TurnEvent,
  UsageUpdateEvent,
} from "../../types/types";

function loadTranscript(name: string): TurnEvent[] {
  const raw = readFileSync(
    resolve(__dirname, "../../__fixtures__/sse-transcripts", name),
    "utf-8",
  );
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TurnEvent);
}

/** Replay a transcript through the dispatcher, recording ordered callback hits. */
function replay(events: TurnEvent[]): string[] {
  const log: string[] = [];
  const record =
    <Event,>(kind: string, describe?: (_event: Event) => string) =>
    (event: Event) =>
      log.push(describe ? `${kind}:${describe(event)}` : kind);

  const callbacks: SSECallbacks = {
    onChunk: (content) => log.push(`chunk:${content.length}ch`),
    onThinking: (content) => log.push(`thinking:${content.length}ch`),
    onToolExecution: record<ToolExecutionEvent>("tool_execution", ({ status, tool }) => {
      return `${status}:${tool.name}:${tool.id}${tool.durationMs != null ? `:${tool.durationMs}ms` : ""}`;
    }),
    onToolOutput: record<ToolOutputEvent>("tool_output", (e) => `${e.toolCallId}:${e.event}`),
    onSubAgentStatus: record<SubAgentStatusEvent>("sub_agent_status", (e) => `${e.subAgentId}:${e.message}`),
    onSubAgentToolExecution: record<SubAgentToolExecutionEvent>(
      "sub_agent_tool_execution",
      (e) => `${e.subAgentId}:${e.status}:${e.tool.name}`,
    ),
    onStatus: record<StatusEvent>("status", (e) => e.message),
    onUsageUpdate: record<UsageUpdateEvent>("usage_update", (e) => `${e.usage.inputTokens}/${e.usage.outputTokens}`),
    onContextBudget: record<ContextBudgetEvent>(
      "context_budget",
      (e) => `${e.totalInputTokens}/${e.contextWindow}`,
    ),
    onDone: record("done"),
    onError: (error) => log.push(`error:${error.message}`),
  };

  for (const event of events) {
    PrismService._dispatchSSE(normalizeStreamEvent(event), callbacks);
  }
  return log;
}

describe("SSE transcript replay", () => {
  it("routes a full agent turn with tools + sub-agent identically", () => {
    const log = replay(loadTranscript("agent-turn-with-tools.jsonl"));

    expect(log).toEqual([
      "status:iteration_progress",
      "thinking:55ch",
      "chunk:24ch",
      "tool_execution:streaming:read_file:tc-001",
      "tool_execution:calling:read_file:tc-001",
      "tool_output:tc-001:stdout",
      // durationMilliseconds on the wire → durationMs after normalization
      "tool_execution:done:read_file:tc-001:312ms",
      "chunk:38ch",
      "tool_execution:calling:create_subagents:tc-002",
      "sub_agent_status:sa-1:spawned",
      "sub_agent_tool_execution:sa-1:calling:grep_files",
      "sub_agent_tool_execution:sa-1:done:grep_files",
      "sub_agent_status:sa-1:complete",
      "tool_execution:done:create_subagents:tc-002:4200ms",
      "usage_update:1200/350",
      "context_budget:14200/120000",
      "chunk:36ch",
      "done",
    ]);
  });
});
