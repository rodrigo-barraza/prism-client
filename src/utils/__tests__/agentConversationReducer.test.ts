/**
 * The agent chat's conversation reducer: pure (state, action) → state for
 * every turn event type and every lifecycle action.
 *
 * Two starting points recur: `sentTurn()` — a turn this chat sent, with the
 * placeholder bubble its stream owns — and `joinedTurn()` — a conversation
 * opened from its stored document, whose trailing reply is COMPLETE and must
 * never be written into by a live stream.
 */
import { describe, it, expect } from "vitest";
import { TURN_EVENT_TYPES, type TurnEventType } from "../../types/protocol/events";
import type { TurnEvent } from "../../types/types";
import {
  agentConversationReducer,
  createAgentConversationState,
  createTurnStream,
  reduceEvent,
  turnActivityOf,
  type AgentConversationAction,
  type AgentConversationState,
  type ClientMessage,
  type EventClock,
} from "../agentConversationReducer";

const EPOCH = Date.UTC(2026, 8, 22, 12, 0, 0);
const CONVERSATION = "conv-1";

/** The clock after `step` events 25 ms apart. */
const clockAt = (step: number): EventClock => ({
  epochMilliseconds: EPOCH + step * 25,
  monotonicMilliseconds: 1_000 + step * 25,
  nonce: 0.25,
});

const event = (fields: Record<string, unknown>) => fields as unknown as TurnEvent;

/** Apply events in order, one clock step apart (starting at `firstStep`). */
function play(state: AgentConversationState, events: TurnEvent[], firstStep = 1): AgentConversationState {
  return events.reduce(
    (current, next, index) => reduceEvent(current, next, CONVERSATION, clockAt(firstStep + index)),
    state,
  );
}

const USER: ClientMessage = { role: "user", content: "What port?", timestamp: "2026-09-22T12:00:00.000Z" };

function sentTurn(): AgentConversationState {
  return agentConversationReducer(createAgentConversationState(), {
    type: "turn/started",
    messages: [USER, { role: "assistant", content: "", provider: "anthropic", model: "claude-test" }],
    conversationId: CONVERSATION,
    sentWith: { provider: "anthropic", model: "claude-test" },
  });
}

const EARLIER_REPLY: ClientMessage = {
  role: "assistant",
  content: "Earlier answer.",
  provider: "anthropic",
  model: "claude-test",
};

function joinedTurn(): AgentConversationState {
  let state = agentConversationReducer(createAgentConversationState(), {
    type: "field/set",
    field: "messages",
    value: [{ role: "user", content: "Earlier question" }, EARLIER_REPLY],
  });
  state = agentConversationReducer(state, { type: "stream/attached", continuation: false });
  return state;
}

const last = (state: AgentConversationState) => state.messages[state.messages.length - 1];

// ---------------------------------------------------------------------------
// One sample of every event type
// ---------------------------------------------------------------------------

const SAMPLES: { [Type in TurnEventType]: TurnEvent } = {
  hello: event({ type: "hello", protocolVersion: 1 }),
  subscribed: event({ type: "subscribed", lastSeq: 5, replayedCount: 0, droppedCount: 0 }),
  user_message: event({ type: "user_message", role: "user", content: "Add a README.", timestamp: EPOCH }),
  chunk: event({ type: "chunk", content: "Hello", outputCharacters: 5 }),
  thinking: event({ type: "thinking", content: "Reading first." }),
  image: event({ type: "image", minioRef: "minio://images/a.png", mimeType: "image/png" }),
  audio: event({ type: "audio", data: "https://audio.example/a.mp3", mimeType: "audio/mpeg" }),
  executableCode: event({ type: "executableCode", code: "print(1)", language: "PYTHON" }),
  codeExecutionResult: event({ type: "codeExecutionResult", output: "1\n", outcome: "OUTCOME_OK" }),
  webSearchResult: event({
    type: "webSearchResult",
    results: [{ title: "Port", url: "https://docs.example.dev/port" }],
  }),
  citations: event({ type: "citations", sources: [{ url: "https://a.example", title: "A" }], queries: ["q"] }),
  refusal: event({ type: "refusal", category: null, explanation: null }),
  toolCall: event({ type: "toolCall", id: "mcp-1", name: "search", args: { q: "x" }, status: "calling" }),
  tool_execution: event({
    type: "tool_execution",
    tool: { id: "tc-1", name: "read_file", args: { path: "/app/config.json" } },
    status: "calling",
    timestamp: EPOCH,
  }),
  tool_output: event({ type: "tool_output", toolCallId: "tc-1", name: "execute_command", event: "stdout", data: "ok\n" }),
  approval_required: event({
    type: "approval_required",
    toolCallId: "tc-1",
    batchId: "batch-1",
    toolCall: { id: "tc-1", name: "write_file", args: { path: "README.md" } },
    tier: 2,
  }),
  approval_decided: event({ type: "approval_decided", toolCallId: "tc-1", decision: "allow", scope: "call", source: "user" }),
  plan_proposal: event({
    type: "plan_proposal",
    plan: "1. Read\n2. Write",
    steps: ["Read", "Write"],
    autoApproved: false,
    toolCallId: "tc-plan",
  }),
  user_question: event({
    type: "user_question",
    questions: [{ question: "Which database?", options: [{ label: "Postgres" }] }],
    context: "The config names neither.",
    questionId: "q-1",
    blocking: true,
  }),
  turn_input: event({ type: "turn_input", id: "input-1", kind: "user_update", content: "Also the tests.", boundary: "after_tools", iteration: 1 }),
  goal_update: event({ type: "goal_update", change: "cleared" }),
  todo_update: event({ type: "todo_update", items: [{ id: 1, content: "Read", status: "pending" }], stats: {} }),
  brief_update: event({ type: "brief_update", brief: { summary: "Port is 3000.", keyFiles: [], openQuestions: [] } }),
  usage_update: event({ type: "usage_update", usage: { inputTokens: 100, outputTokens: 20, requests: 1 }, estimatedCost: 0.001 }),
  context_budget: event({
    type: "context_budget",
    contextWindow: 200_000,
    messageTokens: 1_000,
    systemPromptTokens: 500,
    toolSchemaTokens: 300,
    safetyMarginTokens: 100,
    totalInputTokens: 1_900,
    availableOutputTokens: 198_100,
    isClamped: false,
    toolCount: 4,
    source: "reported",
  }),
  task_notification: event({
    type: "task_notification",
    content: "Task finished.",
    timestamp: "2026-09-22T12:00:05.000Z",
    _notificationSource: "task",
    _notificationId: "n-1",
  }),
  permission_mode: event({ type: "permission_mode", conversationId: CONVERSATION, mode: "plan", source: "user" }),
  conversation_state_update: event({ type: "conversation_state_update", pendingBackgroundTasks: 1, isActive: true }),
  memory_consolidation_complete: event({ type: "memory_consolidation_complete", project: null, merged: 0 }),
  sub_agent_status: event({
    type: "sub_agent_status",
    subAgentId: "sa-1",
    message: "spawned",
    description: "Audit auth",
    conversationId: "conv-sub-1",
  }),
  sub_agent_tool_execution: event({
    type: "sub_agent_tool_execution",
    subAgentId: "sa-1",
    tool: { id: "tc-sa-1", name: "grep_files", args: { pattern: "3000" } },
    status: "calling",
  }),
  sub_agent_tool_output: event({
    type: "sub_agent_tool_output",
    subAgentId: "sa-1",
    toolCallId: "tc-sa-1",
    name: "grep_files",
    event: "stdout",
    data: "2 matches\n",
  }),
  status: event({ type: "status", message: "iteration_progress", iteration: 2, maxIterations: 25 }),
  done: event({ type: "done", provider: "anthropic", model: "claude-test", usage: null, estimatedCost: null, totalTime: 1.5 }),
  error: event({ type: "error", code: "internal", message: "boom", retryable: false }),
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of value instanceof Map ? value.values() : Object.values(value)) deepFreeze(item);
  }
  return value;
}

describe("agentConversationReducer — every event type", () => {
  it("has a sample of every turn event type the protocol defines", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...TURN_EVENT_TYPES].sort());
  });

  it.each(Object.entries(SAMPLES))("%s: pure and deterministic, from a sent and a joined turn", (_type, sample) => {
    for (const start of [sentTurn(), joinedTurn()]) {
      deepFreeze(start);
      const once = reduceEvent(start, sample, CONVERSATION, clockAt(1));
      const twice = reduceEvent(start, sample, CONVERSATION, clockAt(1));
      expect(twice).toEqual(once);
    }
  });

  it.each([
    "hello",
    "subscribed",
    "refusal",
    "memory_consolidation_complete",
    "citations",
    "goal_update",
    "permission_mode",
    "conversation_state_update",
  ] as const)("%s changes no conversation state (side effects only, or not rendered)", (type) => {
    const start = sentTurn();
    expect(reduceEvent(start, SAMPLES[type], CONVERSATION, clockAt(1))).toBe(start);
  });
});

// ---------------------------------------------------------------------------
// Text, thinking and media
// ---------------------------------------------------------------------------

describe("streamed content", () => {
  it("fills the sent turn's placeholder, one text fragment per run of text", () => {
    const state = play(sentTurn(), [
      event({ type: "chunk", content: "Checking the config", outputCharacters: 19 }),
      event({ type: "chunk", content: " now. ", outputCharacters: 25 }),
    ]);
    expect(state.messages).toHaveLength(2);
    expect(last(state)).toMatchObject({
      role: "assistant",
      content: "Checking the config now.",
      provider: "anthropic",
      contentSegments: [{ type: "text", fragmentIndex: 0 }],
      textFragments: ["Checking the config now. "],
      _streamingOutputCharacters: 25,
      _streamingStartTime: 1_025,
      _streamingLastChunkTime: 1_050,
      _streamingBurstTokens: 2,
      _streamingBurstElapsed: 25,
    });
  });

  it("counts a burst only while chunks keep coming (a pause of 500 ms starts a new one)", () => {
    let state = reduceEvent(sentTurn(), SAMPLES.chunk, CONVERSATION, clockAt(1));
    state = reduceEvent(state, SAMPLES.chunk, CONVERSATION, { ...clockAt(2), monotonicMilliseconds: 1_025 + 600 });
    expect(last(state)).toMatchObject({ _streamingBurstTokens: 1, _streamingBurstElapsed: 0 });
  });

  it("interleaves thinking, text and tools in the order they streamed", () => {
    const state = play(sentTurn(), [
      event({ type: "thinking", content: "Read it first." }),
      event({ type: "chunk", content: "Reading." }),
      SAMPLES.tool_execution,
      event({ type: "tool_execution", tool: { id: "tc-2", name: "grep_files", args: {} }, status: "calling" }),
      event({ type: "chunk", content: " Done." }),
      event({ type: "thinking", content: "All good." }),
    ]);
    expect(last(state)).toMatchObject({
      content: "Reading. Done.",
      thinking: "Read it first.All good.",
      contentSegments: [
        { type: "thinking", fragmentIndex: 0 },
        { type: "text", fragmentIndex: 0 },
        { type: "tools", toolIds: ["tc-1", "tc-2"] },
        { type: "text", fragmentIndex: 1 },
        { type: "thinking", fragmentIndex: 1 },
      ],
      textFragments: ["Reading.", " Done."],
      thinkingFragments: ["Read it first.", "All good."],
    });
  });

  it("never writes into a joined conversation's completed reply: it opens its own bubble", () => {
    const state = play(joinedTurn(), [SAMPLES.chunk, event({ type: "chunk", content: " world" })]);
    expect(state.messages[1]).toBe(EARLIER_REPLY);
    expect(state.messages).toHaveLength(3);
    expect(last(state)).toMatchObject({ role: "assistant", content: "Hello world" });
  });

  it("continues a torn-down stream's bubble when the socket resumes it", () => {
    let state = play(sentTurn(), [event({ type: "chunk", content: "Checking the config" })]);
    state = agentConversationReducer(state, { type: "stream/attached", continuation: true });
    state = play(state, [event({ type: "chunk", content: " — port 3000." })], 2);
    expect(state.messages).toHaveLength(2);
    expect(last(state).content).toBe("Checking the config — port 3000.");
  });

  it("places images and audio where they arrived, once each", () => {
    const state = play(sentTurn(), [
      event({ type: "chunk", content: "Here:" }),
      SAMPLES.image,
      SAMPLES.image,
      SAMPLES.audio,
    ]);
    expect(last(state)).toMatchObject({
      images: ["minio://images/a.png"],
      audio: ["https://audio.example/a.mp3"],
      contentSegments: [
        { type: "text", fragmentIndex: 0 },
        { type: "image", fragmentIndex: 0 },
        { type: "audio", fragmentIndex: 0 },
      ],
    });
    expect(reduceEvent(sentTurn(), event({ type: "audio" }), CONVERSATION, clockAt(1)).messages).toEqual(
      sentTurn().messages,
    );
  });
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

describe("tools", () => {
  it("tracks a tool from its call to its result, on the bubble and in the activity list", () => {
    const state = play(sentTurn(), [
      SAMPLES.tool_execution,
      event({
        type: "tool_execution",
        tool: { id: "tc-1", name: "read_file", result: { content: "{}" }, durationMs: 12 },
        status: "done",
      }),
    ]);
    const expected = { id: "tc-1", name: "read_file", status: "done", result: { content: "{}" }, durationMs: 12 };
    expect(state.toolActivity).toEqual([expect.objectContaining(expected)]);
    expect(last(state).toolCalls).toEqual([expect.objectContaining(expected)]);
  });

  it("mints an id for a tool event that carries none, from the event's clock", () => {
    const state = play(sentTurn(), [event({ type: "tool_execution", tool: { name: "search" }, status: "calling" })]);
    expect(state.toolActivity[0].id).toBe(`tc-${EPOCH + 25}-0.25`);
  });

  it("routes LM Studio's native tool calls through the same path", () => {
    const state = play(sentTurn(), [SAMPLES.toolCall]);
    expect(state.toolActivity).toEqual([expect.objectContaining({ id: "mcp-1", name: "search", status: "calling" })]);
    expect(last(state).contentSegments).toEqual([{ type: "tools", toolIds: ["mcp-1"] }]);
  });

  it("gives a joined turn's first tool a bubble of its own", () => {
    const state = play(joinedTurn(), [SAMPLES.tool_execution]);
    expect(state.messages[1]).toBe(EARLIER_REPLY);
    expect(last(state)).toMatchObject({ role: "assistant", content: "", toolCalls: [expect.objectContaining({ id: "tc-1" })] });
  });

  it("collects a running command's stdout and stderr, and nothing else", () => {
    const state = play(sentTurn(), [
      SAMPLES.tool_output,
      event({ type: "tool_output", toolCallId: "tc-1", event: "stderr", data: "warn\n" }),
      event({ type: "tool_output", toolCallId: "tc-1", event: "exit", data: "0" }),
    ]);
    expect(state.streamingOutputs).toEqual(new Map([["tc-1", "ok\nwarn\n"]]));
  });

  it("ignores a tool_execution frame without its tool", () => {
    const start = sentTurn();
    expect(reduceEvent(start, event({ type: "tool_execution", status: "calling" }), CONVERSATION, clockAt(1))).toBe(start);
  });
});

// ---------------------------------------------------------------------------
// Cards: approvals, plans, questions, turn inputs
// ---------------------------------------------------------------------------

describe("cards", () => {
  it("adds an approval card (a replay replaces it) and stops the TTFT clock", () => {
    let state = play(sentTurn(), [event({ type: "status", message: "Loading model", phase: "prefilling" })]);
    expect(last(state)._processingStartTime).toBe(1_025);
    state = play(state, [SAMPLES.approval_required, SAMPLES.approval_required], 2);
    expect(state.pendingApprovals).toEqual([
      expect.objectContaining({ id: "tc-1", toolName: "write_file", status: "pending", batchId: "batch-1" }),
    ]);
    expect(last(state)).toMatchObject({ statusPhase: undefined, _processingStartTime: undefined });
  });

  it("settles a card decided anywhere", () => {
    const state = play(sentTurn(), [
      SAMPLES.approval_required,
      event({ type: "approval_decided", toolCallId: "tc-1", decision: "deny", scope: "call", source: "user" }),
    ]);
    expect(state.pendingApprovals[0].status).toBe("rejected");
  });

  it("renders a plan in the flow and settles it when it is decided elsewhere", () => {
    let state = play(sentTurn(), [event({ type: "chunk", content: "Here is the plan." }), SAMPLES.plan_proposal]);
    expect(state.planProposal).toEqual({ plan: "1. Read\n2. Write", steps: ["Read", "Write"], status: "pending" });
    expect(last(state).contentSegments).toEqual([{ type: "text", fragmentIndex: 0 }, { type: "plan" }]);
    state = play(state, [event({ type: "approval_decided", toolCallId: "tc-plan", decision: "allow" })], 3);
    expect(state.planProposal?.status).toBe("approved");
    // A decision about another call leaves the plan alone.
    const other = play(sentTurn(), [SAMPLES.plan_proposal, SAMPLES.approval_decided]);
    expect(other.planProposal?.status).toBe("pending");
  });

  it("takes an auto-approved plan as approved", () => {
    const state = play(sentTurn(), [event({ type: "plan_proposal", plan: "p", autoApproved: true })]);
    expect(state.planProposal?.status).toBe("approved");
  });

  it("shows a blocking question to the sender only", () => {
    expect(play(sentTurn(), [SAMPLES.user_question]).pendingUserQuestion).toEqual({
      questionId: "q-1",
      questions: [{ question: "Which database?", options: [{ label: "Postgres" }] }],
      context: "The config names neither.",
    });
    expect(play(joinedTurn(), [SAMPLES.user_question]).pendingUserQuestion).toBeNull();
    const nonBlocking = event({ ...(SAMPLES.user_question as object), blocking: false });
    const start = sentTurn();
    expect(reduceEvent(start, nonBlocking, CONVERSATION, clockAt(1))).toBe(start);
  });

  it("puts a mid-turn input above the bubble the turn is streaming into", () => {
    const state = play(sentTurn(), [event({ type: "chunk", content: "Reading." }), SAMPLES.turn_input]);
    expect(state.messages.map((message) => message.role)).toEqual(["user", "user", "assistant"]);
    expect(state.messages[1]).toMatchObject({
      content: "Also the tests.",
      _turnInput: { id: "input-1", status: "applied", boundary: "after_tools", iteration: 1 },
    });
    // What streams next still extends the same bubble.
    const continued = play(state, [event({ type: "chunk", content: " And the tests." })], 3);
    expect(last(continued).content).toBe("Reading. And the tests.");
  });

  it("an external input lands as external — its source tagged — never as the user's bubble (prompt 22 L3)", () => {
    const state = play(joinedTurn(), [
      event({
        type: "turn_input",
        id: "input-x",
        kind: "external",
        content: "Found 3 of 5 sources.",
        source: "subagent",
        sender: "agent-3f2a",
        boundary: "after_tools",
        iteration: 2,
      }),
    ]);
    expect(last(state)).toMatchObject({
      role: "user",
      content: "Found 3 of 5 sources.",
      _external: { source: "subagent", sender: "agent-3f2a" },
      _turnInput: { id: "input-x", kind: "external", source: "subagent", sender: "agent-3f2a" },
    });
  });

  it("appends a mid-turn input when the turn owns no bubble, and what follows opens one", () => {
    let state = play(joinedTurn(), [SAMPLES.turn_input]);
    expect(last(state)).toMatchObject({ role: "user", content: "Also the tests." });
    state = play(state, [SAMPLES.chunk], 2);
    expect(last(state)).toMatchObject({ role: "assistant", content: "Hello" });
  });

  it("marks our optimistic mid-turn bubble applied instead of adding another", () => {
    let state = sentTurn();
    state = agentConversationReducer(state, {
      type: "field/set",
      field: "messages",
      value: (messages) => [
        ...messages.slice(0, -1),
        { role: "user", content: "Also the tests.", _turnInput: { id: "input-1", kind: "user_update", status: "pending" } },
        messages[messages.length - 1],
      ],
    });
    state = play(state, [SAMPLES.turn_input]);
    expect(state.messages).toHaveLength(3);
    expect(state.messages[1]._turnInput?.status).toBe("applied");
    state = play(state, [event({ type: "status", message: "turn_input_applied", inputId: "input-1", boundary: "before_llm", iteration: 2 })], 2);
    expect(state.messages[1]._turnInput).toMatchObject({ boundary: "before_llm", iteration: 2 });
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe("status", () => {
  it("tracks iterations; live events take the status bar's timer over", () => {
    let state = agentConversationReducer(sentTurn(), {
      type: "field/set",
      field: "statusBarInitialElapsedMilliseconds",
      value: 9_000,
    });
    state = play(state, [SAMPLES.status]);
    expect(state.agenticProgress).toEqual({ iteration: 2, maxIterations: 25 });
    expect(state.statusBarInitialElapsedMilliseconds).toBeNull();
  });

  it("shows a phase on the turn's bubble, creating a placeholder for a joined turn", () => {
    const phase = event({ type: "status", message: "Prefilling 40%", phase: "prefilling", progress: 0.4 });
    const sent = play(sentTurn(), [phase]);
    expect(last(sent)).toMatchObject({ status: "Prefilling 40%", statusPhase: "prefilling", _statusProgress: 0.4, _processingStartTime: 1_025 });
    const joined = play(joinedTurn(), [phase]);
    expect(joined.messages[1]).toBe(EARLIER_REPLY);
    expect(last(joined)).toMatchObject({ role: "assistant", content: "", statusPhase: "prefilling" });
    // Display text without a phase shows nothing.
    const start = sentTurn();
    expect(reduceEvent(start, event({ type: "status", message: "Tool execution rejected: x" }), CONVERSATION, clockAt(1))).toBe(start);
  });

  it("shows compaction on the bubble until it completes or fails", () => {
    let state = play(sentTurn(), [event({ type: "status", message: "compaction_started" })]);
    expect(last(state)).toMatchObject({ status: "Compacting conversation...", statusPhase: "prefilling" });
    state = play(state, [event({ type: "status", message: "compaction_complete" })], 2);
    expect(last(state)).toMatchObject({ status: undefined, statusPhase: undefined });
    state = play(sentTurn(), [event({ type: "status", message: "compaction_started" }), event({ type: "status", message: "compaction_failed" })]);
    expect(last(state).statusPhase).toBeUndefined();
  });

  it("keeps the server's TTFT samples and live generation progress", () => {
    const state = play(sentTurn(), [
      event({ type: "status", message: "generation_started", timeToFirstToken: 0.8 }),
      event({ type: "status", message: "generation_started", timeToFirstToken: 1.2 }),
      event({ type: "status", message: "generation_progress", tokPerSec: 40, activeRequests: 1, outputTokens: 10, inputTokens: 100, totalTokens: 110, avgTtft: 1, estimatedCost: 0.01 }),
      event({ type: "status", message: "generation_progress", tokPerSec: 42, activeRequests: 1, outputTokens: 12, inputTokens: 100, totalTokens: 112, avgTtft: 1 }),
    ]);
    expect(last(state)._ttftSamples).toEqual([0.8, 1.2]);
    expect(last(state)._liveGenProgress).toEqual({
      tokensPerSecond: 42,
      activeRequests: 1,
      outputTokens: 12,
      inputTokens: 100,
      totalTokens: 112,
      avgTtft: 1,
      estimatedCost: 0.01,
      timestamp: 1_100,
    });
  });

  it.each([
    ["iteration_limit_reached", "The agent reached its maximum iteration limit before producing a final response."],
    ["semantic_stall_detected", "The agent was stuck in a behavioral loop, calling the same tools repeatedly."],
    ["cost_limit_reached", "The generation was stopped because the cost limit was reached."],
    ["empty_output", "The model produced an empty response with no text or tool calls."],
  ])("notes why the loop ended: %s", (message, reason) => {
    expect(last(play(sentTurn(), [event({ type: "status", message })]))._terminationReason).toBe(reason);
  });

  it.each(["skills_injected", "tool_set_changed", "tasks_updated", "sub_agents_updated", "memories_updated", "hook_system_message"])(
    "%s leaves the state alone (side effects only)",
    (message) => {
      const start = sentTurn();
      expect(reduceEvent(start, event({ type: "status", message }), CONVERSATION, clockAt(1))).toBe(start);
    },
  );
});

// ---------------------------------------------------------------------------
// Sub-agents
// ---------------------------------------------------------------------------

describe("sub-agents", () => {
  it("follows a sub-agent from spawn to completion, adding its usage to the turn", () => {
    const state = play(sentTurn(), [
      SAMPLES.sub_agent_status,
      event({ type: "sub_agent_status", subAgentId: "sa-1", message: "iteration_progress", iteration: 1, maxIterations: 25 }),
      event({ type: "sub_agent_status", subAgentId: "sa-1", message: "phase", phase: "generating", progress: 0.5 }),
      SAMPLES.sub_agent_tool_execution,
      SAMPLES.sub_agent_tool_output,
      event({
        type: "sub_agent_tool_execution",
        subAgentId: "sa-1",
        tool: { id: "tc-sa-1", name: "grep_files", result: { matches: 2 }, durationMilliseconds: 150 },
        status: "done",
      }),
      event({ type: "sub_agent_status", subAgentId: "sa-1", message: "generation_started", timeToFirstToken: 1.1 }),
      event({ type: "sub_agent_status", subAgentId: "sa-1", message: "generation_progress", outputTokens: 42, tokPerSec: 21, totalOutputTokens: 120 }),
      event({
        type: "sub_agent_status",
        subAgentId: "sa-1",
        message: "complete",
        conversationId: "conv-sub-1",
        durationMilliseconds: 4_100,
        toolCount: 1,
        usage: { inputTokens: 900, outputTokens: 210, requests: 1 },
      }),
    ]);
    expect(state.subAgentToolActivity["sa-1"]).toMatchObject({
      description: "Audit auth",
      conversationId: "conv-sub-1",
      phase: "complete",
      currentTool: null,
      durationMs: 4_100,
      toolCount: 1,
      toolNames: { grep_files: 1 },
      toolCalls: [{ id: "tc-sa-1", status: "done", result: { matches: 2 }, durationMs: 150 }],
      totalOutputTokens: 120,
    });
    expect(state.streamingOutputs.get("tc-sa-1")).toBe("2 matches\n");
    expect(last(state)._ttftSamples).toEqual([1.1]);
    expect(last(state)._subAgentTokens).toEqual({ input: 900, output: 210, requests: 1 });
    // A finished sub-agent's live tok/s does not linger.
    expect(last(state)._subAgentGenerationProgress).toBeUndefined();
  });

  it("marks a failed sub-agent with its error", () => {
    const state = play(sentTurn(), [
      SAMPLES.sub_agent_status,
      event({ type: "sub_agent_status", subAgentId: "sa-1", message: "failed", error: "Provider overloaded" }),
    ]);
    expect(state.subAgentToolActivity["sa-1"]).toMatchObject({ phase: "failed", currentTool: null, error: "Provider overloaded" });
  });
});

// ---------------------------------------------------------------------------
// Usage, budget, task notifications
// ---------------------------------------------------------------------------

describe("usage and notifications", () => {
  it("keeps an iteration's usage until the final usage arrives, and background usage apart", () => {
    let state = play(sentTurn(), [
      SAMPLES.usage_update,
      event({ type: "usage_update", operation: "memory:extract", usage: { inputTokens: 50, outputTokens: 5 }, estimatedCost: 0.0001 }),
    ]);
    expect(last(state)).toMatchObject({
      _intermediateUsage: { inputTokens: 100, outputTokens: 20, requests: 1 },
      _intermediateEstimatedCost: 0.001,
      _backgroundUsage: { inputTokens: 50, outputTokens: 5, requests: 1, cost: 0.0001 },
    });
    state = play(state, [event({ type: "done", provider: "p", model: "m", usage: { inputTokens: 1 } })], 3);
    const finalUsage = last(state);
    expect(last(play(state, [SAMPLES.usage_update], 4))).toBe(finalUsage);
  });

  it("reads the context budget whole", () => {
    expect(play(sentTurn(), [SAMPLES.context_budget]).contextBudget).toMatchObject({
      contextWindow: 200_000,
      totalInputTokens: 1_900,
      source: "reported",
    });
  });

  it("answers a task notification in a fresh bubble", () => {
    const state = play(sentTurn(), [SAMPLES.chunk, SAMPLES.task_notification, event({ type: "chunk", content: "On it." })]);
    expect(state.messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "What port?"],
      ["assistant", "Hello"],
      ["user", "Task finished."],
      ["assistant", "On it."],
    ]);
    expect(state.messages[1].completedAt).toBe(new Date(EPOCH + 50).toISOString());
    expect(state.messages[2]).toMatchObject({ _notificationSource: "task", _notificationId: "n-1" });
    expect(last(state)).toMatchObject({ provider: "anthropic", model: "claude-test", textFragments: ["On it."] });
  });
});

// ---------------------------------------------------------------------------
// The turn's start and end
// ---------------------------------------------------------------------------

describe("turn boundaries", () => {
  it("swallows the echo of our own prompt", () => {
    const start = sentTurn();
    const state = reduceEvent(start, SAMPLES.user_message, CONVERSATION, clockAt(1));
    expect(state.messages).toBe(start.messages);
    expect(state.stream.awaitingUserMessageEcho).toBe(false);
  });

  it("renders a prompt sent elsewhere, once", () => {
    const state = play(joinedTurn(), [SAMPLES.user_message, SAMPLES.user_message]);
    expect(state.messages.slice(2)).toEqual([
      { role: "user", content: "Add a README.", timestamp: new Date(EPOCH).toISOString() },
    ]);
    expect(state.stream.ownsTrailingBubble).toBe(false);
  });

  it("finishes the bubble on done, with the model the turn was sent on", () => {
    const state = play(sentTurn(), [
      SAMPLES.chunk,
      SAMPLES.user_question,
      event({ type: "done", provider: "other", model: "other-model", usage: { inputTokens: 10 }, estimatedCost: 0.02, totalTime: 1.5, tokensPerSec: 12, audioRef: "minio://a.mp3" }),
    ]);
    expect(last(state)).toMatchObject({
      provider: "anthropic",
      model: "claude-test",
      usage: { inputTokens: 10 },
      estimatedCost: 0.02,
      totalTime: 1.5,
      tokensPerSec: 12,
      audio: ["minio://a.mp3"],
      completedAt: new Date(EPOCH + 75).toISOString(),
    });
    expect(state.pendingUserQuestion).toBeNull();
    expect(state.stream.hasEnded).toBe(true);
  });

  it("finishes a joined turn's bubble with the model done names", () => {
    const state = play(joinedTurn(), [SAMPLES.chunk, SAMPLES.done]);
    expect(last(state)).toMatchObject({ provider: "anthropic", model: "claude-test", content: "Hello" });
  });

  it("shows an error, unless the turn already ended (done, then error)", () => {
    const failed = play(sentTurn(), [SAMPLES.error]);
    expect(last(failed)).toEqual({ role: "assistant", content: "⚠️ Error: boom", isError: true });
    const finished = play(sentTurn(), [SAMPLES.done]);
    expect(play(finished, [SAMPLES.error], 2).messages).toBe(finished.messages);
    // Still ended after the socket lets go, or the stored document replaces the transcript…
    for (const action of [{ type: "stream/released" }, { type: "conversation/loaded" }] as const) {
      const released = agentConversationReducer(finished, action);
      expect(play(released, [SAMPLES.error], 2).messages).toBe(released.messages);
    }
    // …until the next turn starts.
    const next = play(finished, [SAMPLES.user_message, SAMPLES.error], 2);
    expect(last(next)).toMatchObject({ isError: true });
  });

  it("keeps each conversation's side channels to itself", () => {
    let state = play(sentTurn(), [SAMPLES.todo_update, SAMPLES.brief_update, SAMPLES.webSearchResult, SAMPLES.executableCode, SAMPLES.codeExecutionResult]);
    expect(turnActivityOf(state, CONVERSATION)).toMatchObject({
      todos: [{ content: "Read", status: "pending" }],
      brief: { summary: "Port is 3000." },
      sources: [{ url: "https://docs.example.dev/port" }],
      codeRuns: [{ code: "print(1)", language: "python", output: "1\n", outcome: "OUTCOME_OK" }],
    });
    expect(turnActivityOf(state, "conv-2")).toEqual({ todos: null, brief: null, sources: [], codeRuns: [] });
    state = reduceEvent(state, SAMPLES.webSearchResult, "conv-2", clockAt(9));
    expect(turnActivityOf(state, CONVERSATION).todos).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

describe("lifecycle actions", () => {
  it("turn/started clears the last turn's cards and activity, keeping running sub-agents", () => {
    let state = play(sentTurn(), [
      SAMPLES.tool_execution,
      SAMPLES.approval_required,
      SAMPLES.plan_proposal,
      SAMPLES.status,
      SAMPLES.tool_output,
      SAMPLES.sub_agent_status,
      event({ type: "sub_agent_status", subAgentId: "sa-2", message: "spawned" }),
      event({ type: "sub_agent_status", subAgentId: "sa-2", message: "failed" }),
      SAMPLES.done,
    ]);
    state = agentConversationReducer(state, {
      type: "turn/started",
      messages: [USER],
      conversationId: CONVERSATION,
      sentWith: { provider: "anthropic" },
    });
    expect(state).toMatchObject({
      messages: [USER],
      toolActivity: [],
      pendingApprovals: [],
      pendingUserQuestion: null,
      planProposal: null,
      agenticProgress: null,
      statusBarInitialElapsedMilliseconds: null,
      streamingOutputs: new Map(),
    });
    expect(Object.keys(state.subAgentToolActivity)).toEqual(["sa-1"]);
    expect(state.stream).toEqual(
      createTurnStream({ ownsTrailingBubble: true, isDriving: true, awaitingUserMessageEcho: true, sentWith: { provider: "anthropic" } }),
    );
  });

  it("turn/stopped freezes the bubble and every sub-agent bar", () => {
    let state = play(sentTurn(), [SAMPLES.chunk, SAMPLES.sub_agent_status, SAMPLES.plan_proposal]);
    state = agentConversationReducer({ ...state, isGenerating: true }, { type: "turn/stopped", clock: clockAt(9) });
    expect(state.isGenerating).toBe(false);
    expect(state.planProposal).toBeNull();
    expect(last(state)).toMatchObject({ _streamingStartTime: undefined, _streamingLastChunkTime: undefined, completedAt: new Date(EPOCH + 225).toISOString() });
    expect(state.subAgentToolActivity["sa-1"]).toMatchObject({ phase: "complete", currentTool: null });
    expect(state.stream.hasEnded).toBe(true);
  });

  it("turn/failed shows the failure", () => {
    const state = agentConversationReducer(sentTurn(), { type: "turn/failed", message: "HTTP 500" });
    expect(last(state)).toEqual({ role: "assistant", content: "⚠️ Error: HTTP 500", isError: true });
  });

  it("conversation/reset and conversation/restored replace everything", () => {
    const busy = play(sentTurn(), [SAMPLES.chunk]);
    expect(agentConversationReducer(busy, { type: "conversation/reset" })).toEqual(createAgentConversationState());
    expect(agentConversationReducer(createAgentConversationState(), { type: "conversation/restored", state: busy })).toBe(busy);
  });

  it("field/set takes a value or an updater, and keeps the state when nothing changed", () => {
    const start = sentTurn();
    const action: AgentConversationAction = { type: "field/set", field: "isGenerating", value: true };
    const generating = agentConversationReducer(start, action);
    expect(generating.isGenerating).toBe(true);
    expect(agentConversationReducer(generating, action)).toBe(generating);
    const updated = agentConversationReducer(generating, {
      type: "field/set",
      field: "messages",
      value: (messages) => messages.slice(0, 1),
    });
    expect(updated.messages).toEqual([USER]);
  });

  it("the same reducer brings a background snapshot up to date", () => {
    const snapshot = sentTurn();
    const events = [SAMPLES.chunk, SAMPLES.tool_execution];
    expect(play(snapshot, events)).toEqual(
      events.reduce(
        (state, next, index) => agentConversationReducer(state, { type: "event", event: next, conversationId: CONVERSATION, clock: clockAt(index + 1) }),
        snapshot,
      ),
    );
  });
});
