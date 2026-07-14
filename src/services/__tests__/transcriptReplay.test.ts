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
import type { SSECallbacks, SSEData } from "../../types/types";

function loadTranscript(name: string): SSEData[] {
  const raw = readFileSync(
    resolve(__dirname, "../../__fixtures__/sse-transcripts", name),
    "utf-8",
  );
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SSEData);
}

/** Replay a transcript through the dispatcher, recording ordered callback hits. */
function replay(events: SSEData[]): string[] {
  const log: string[] = [];
  const record =
    (kind: string, describe?: (event: SSEData) => string) =>
    (event: SSEData) =>
      log.push(describe ? `${kind}:${describe(event)}` : kind);

  const callbacks: SSECallbacks = {
    onChunk: (content) => log.push(`chunk:${content.length}ch`),
    onThinking: (content) => log.push(`thinking:${content.length}ch`),
    onToolExecution: record("tool_execution", (e) => {
      const tool = e.tool as { id?: string; name?: string; durationMs?: number };
      return `${e.status}:${tool?.name}:${tool?.id}${tool?.durationMs != null ? `:${tool.durationMs}ms` : ""}`;
    }),
    onToolOutput: record("tool_output", (e) => String((e.tool as { id?: string })?.id)),
    onSubAgentStatus: record("sub_agent_status", (e) => `${e.subAgentId}:${e.message}`),
    onSubAgentToolExecution: record(
      "sub_agent_tool_execution",
      (e) => `${e.subAgentId}:${e.status}:${(e.tool as { name?: string })?.name}`,
    ),
    onStatus: record("status", (e) => String(e.message)),
    onUsageUpdate: record("usage_update", (e) => `${e.inputTokens}/${e.outputTokens}`),
    onContextBudget: record("context_budget", (e) => `${e.used}/${e.total}`),
    onDone: record("done"),
    onError: (error) => log.push(`error:${error.message}`),
  };

  for (const event of events) {
    PrismService._dispatchSSE(PrismService._normalizeSSEData(event), callbacks);
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
      "tool_output:tc-001",
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
