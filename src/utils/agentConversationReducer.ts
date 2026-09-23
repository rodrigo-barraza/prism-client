/**
 * The agent chat's conversation state, and the ONE reducer every turn event
 * goes through — whether it arrived on the SSE this chat drives, on the live
 * viewer socket, or on the socket that follows a turn after its SSE dropped
 * (services/agentStream.ts). `useAgentConversation` holds it in `useReducer`.
 *
 * The reducer is pure: time and the random part of ids the chat mints come
 * in on the action (`EventClock`), side effects are described separately
 * (agentConversationEffects.ts), and the same reducer can bring a snapshot
 * of a conversation the user switched away from up to date in the
 * background.
 *
 * What "the turn" owns lives in `stream`: the text and thinking streamed so
 * far, the interleaving of text, thinking, tools, plans and media
 * (`segments`), the tokens-per-second burst, and whether the trailing
 * assistant bubble is this turn's to extend (`ownsTrailingBubble`). A turn
 * this chat sent owns the placeholder bubble it pushed; a turn joined over
 * the socket owns only a bubble it created — it never writes into a
 * completed reply that came from the stored document.
 */

import { STATUS_MESSAGES } from "@rodrigo-barraza/utilities-library/taxonomy";
import { MESSAGE_ROLES } from "../constants";
import type {
  BackgroundUsage,
  ContentSegment,
  ContextBudget,
  DoneEvent,
  Message,
  StatusEvent,
  SubAgentGenerationProgress,
  SubAgentStatusEvent,
  SubAgentToolExecutionEvent,
  ToolCallEvent,
  TurnEvent,
  UserQuestionItem,
} from "../types/types";
import { isKnownStatusEvent } from "../types/protocol/events";
import {
  addApproval,
  applyApprovalDecided,
  approvalFromEvent,
  type PendingApproval,
} from "./approvalCards";
import { seedStreamAccumulators } from "./liveConversationView";
import {
  applyToolExecutionToActivity,
  applyToolExecutionToMessages,
  type ToolExecutionInput,
} from "./toolCallStateUpdaters";
import {
  EMPTY_TURN_ACTIVITY,
  applyBriefUpdate,
  applyCodeExecutionResult,
  applyExecutableCode,
  applyTodoUpdate,
  applyWebSearchResults,
  startTurn as startTurnActivity,
  type TurnActivity,
} from "./turnActivity";
import { applyTurnInputEvent, markTurnInputApplied } from "./turnInputRouting";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A transcript message with the live fields the stream keeps on it. */
export interface ClientMessage extends Message {
  _liveModelNames?: string[];
  _liveModalities?: Record<string, number>;
  _backgroundUsage?: BackgroundUsage & { requests?: number };
  _streamingOutputCharacters?: number;
  _streamingStartTime?: number;
  _streamingLastChunkTime?: number;
  _streamingBurstTokens?: number;
  _streamingBurstElapsed?: number;
  _processingStartTime?: number;
  _ttftSamples?: number[];
  _statusProgress?: number | Record<string, unknown>;
  _subAgentGenerationProgress?: Record<string, SubAgentGenerationProgress>;
  _subAgentTokens?: {
    input?: number;
    output?: number;
    requests?: number;
  };
  _liveGenProgress?: {
    inputTokens?: number;
    outputTokens?: number;
    tokensPerSecond?: number;
    totalOutputTokens?: number;
    cost?: number;
    requests?: number;
    activeRequests?: number;
    totalTokens?: number;
    avgTtft?: number;
    /** Live server-estimated cost of the in-flight generation (USD) */
    estimatedCost?: number | null;
    timestamp?: number;
  };
  _fromSnapshot?: boolean;
  _snapshot?: Record<string, unknown>;
  statusPhase?: string;
  synthetic?: boolean;
  /** UI-only status marker for in-flight messages (e.g. 'thinking', 'processing') */
  status?: string;
  /** Populated when the agentic loop terminates for a non-standard reason (e.g. iteration limit, stall, cost limit) */
  _terminationReason?: string;
  /** A "⚠️ Error:" bubble the chat added for a failed turn. */
  isError?: boolean;
}

/** A sub-agent's live activity, keyed by its id in `subAgentToolActivity`. */
export interface SubAgentActivityEntry {
  phase?: string;
  currentTool?: string | null;
  iteration?: number;
  subAgentId?: string;
  toolName?: string;
  error?: string;
  phaseProgress?: number;
  totalOutputTokens?: number;
  tokensPerSecond?: number;
  toolCount?: number;
  toolNames?: Record<string, number>;
  toolCalls?: ToolCallEvent[];
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | Record<string, number>
    | ToolCallEvent[];
}

/** The blocking question the turn waits on. */
export interface PendingUserQuestion {
  questionId?: string;
  questions?: UserQuestionItem[];
  context?: string;
}

export interface PlanProposalState {
  plan: string;
  steps?: string[];
  status?: "pending" | "approved" | "rejected" | "executing";
}

export interface AgenticProgress {
  iteration: number;
  maxIterations: number;
}

/** What the turn in progress has streamed, and whether the trailing bubble is its own. */
export interface TurnStream {
  /** The trailing assistant bubble is this turn's: content events extend it. */
  ownsTrailingBubble: boolean;
  /** This chat sent the turn: only the sender answers a blocking question. */
  isDriving: boolean;
  /** The sender waits for the server's `user_message` echo of its own prompt. */
  awaitingUserMessageEcho: boolean;
  /** `done` or `error` arrived: a later `error` (the route's, after `done`) is not shown. */
  hasEnded: boolean;
  /** Provider and model a turn this chat sent runs on; null for a joined turn. */
  sentWith: { provider?: string; model?: string } | null;
  /** The call id of the turn's plan, so a decision made elsewhere settles its card. */
  planToolCallId?: string;
  text: string;
  thinking: string;
  segments: ContentSegment[];
  textFragments: string[];
  thinkingFragments: string[];
  audioRefs: string[];
  imageRefs: string[];
  /** Tool ids already placed in `segments`. */
  segmentToolIds: string[];
  lastSegmentType: ContentSegment["type"] | null;
  firstChunkTime?: number;
  previousChunkTime: number | null;
  /** Tokens and milliseconds of the current generation burst (resets on a gap). */
  burstTokens: number;
  burstElapsed: number;
}

export interface AgentConversationState {
  messages: ClientMessage[];
  isGenerating: boolean;
  toolActivity: ToolCallEvent[];
  /** Live stdout/stderr of running tools, by tool call id. */
  streamingOutputs: Map<string, string>;
  subAgentToolActivity: Record<string, SubAgentActivityEntry>;
  pendingApprovals: PendingApproval[];
  pendingUserQuestion: PendingUserQuestion | null;
  planProposal: PlanProposalState | null;
  agenticProgress: AgenticProgress | null;
  /**
   * Elapsed milliseconds the status bar's timer starts from, taken from the
   * service's live status after a switch or reload; null once live events flow.
   */
  statusBarInitialElapsedMilliseconds: number | null;
  contextBudget: ContextBudget | null;
  /** A turn's side channels (checklist, brief, sources, code runs), for one conversation. */
  turnActivity: { conversationId: string | null; activity: TurnActivity };
  stream: TurnStream;
}

export function createTurnStream(overrides: Partial<TurnStream> = {}): TurnStream {
  return {
    ownsTrailingBubble: false,
    isDriving: false,
    awaitingUserMessageEcho: false,
    hasEnded: false,
    sentWith: null,
    text: "",
    thinking: "",
    segments: [],
    textFragments: [],
    thinkingFragments: [],
    audioRefs: [],
    imageRefs: [],
    segmentToolIds: [],
    lastSegmentType: null,
    previousChunkTime: null,
    burstTokens: 0,
    burstElapsed: 0,
    ...overrides,
  };
}

export function createAgentConversationState(): AgentConversationState {
  return {
    messages: [],
    isGenerating: false,
    toolActivity: [],
    streamingOutputs: new Map(),
    subAgentToolActivity: {},
    pendingApprovals: [],
    pendingUserQuestion: null,
    planProposal: null,
    agenticProgress: null,
    statusBarInitialElapsedMilliseconds: null,
    contextBudget: null,
    turnActivity: { conversationId: null, activity: EMPTY_TURN_ACTIVITY },
    stream: createTurnStream(),
  };
}

/** The turn activity to show for `conversationId` (empty for any other conversation). */
export function turnActivityOf(state: AgentConversationState, conversationId: string): TurnActivity {
  return state.turnActivity.conversationId === conversationId
    ? state.turnActivity.activity
    : EMPTY_TURN_ACTIVITY;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** When an event was received — the reducer reads no clock of its own. */
export interface EventClock {
  /** `Date.now()` */
  epochMilliseconds: number;
  /** `performance.now()` */
  monotonicMilliseconds: number;
  /** `Math.random()`, for an id the chat mints when an event carries none. */
  nonce: number;
}

export function eventClockNow(): EventClock {
  return {
    epochMilliseconds: Date.now(),
    monotonicMilliseconds: performance.now(),
    nonce: Math.random(),
  };
}

/** The fields a caller may set directly — everything but the turn's stream. */
export type SettableField = Exclude<keyof AgentConversationState, "stream">;

export type FieldUpdate<Field extends SettableField> =
  | AgentConversationState[Field]
  | ((_previous: AgentConversationState[Field]) => AgentConversationState[Field]);

export type AgentConversationAction =
  /** A turn event, from any transport. `conversationId` is the stream's. */
  | { type: "event"; event: TurnEvent; conversationId: string; clock: EventClock }
  /**
   * This chat sent a turn: `messages` ends with the user's message and the
   * assistant placeholder the stream will fill.
   */
  | {
      type: "turn/started";
      messages: ClientMessage[];
      conversationId: string;
      sentWith: { provider?: string; model?: string };
    }
  /** The user pressed Stop. */
  | { type: "turn/stopped"; clock: EventClock }
  /** The request failed before or outside the event stream (HTTP error, upload…). */
  | { type: "turn/failed"; message: string }
  /**
   * A live socket began delivering this conversation. `continuation`: it
   * resumes a stream a moment ago torn down mid-turn, whose partial text is
   * still in the trailing bubble.
   */
  | { type: "stream/attached"; continuation: boolean }
  /** A live socket's turn ended: what streams next opens a new bubble. */
  | { type: "stream/released" }
  /** A stored document replaced the transcript: the stream owns nothing in it. */
  | { type: "conversation/loaded" }
  /** A new, empty conversation. */
  | { type: "conversation/reset" }
  /** Back to a conversation the user switched away from mid-turn. */
  | { type: "conversation/restored"; state: AgentConversationState }
  | { [Field in SettableField]: { type: "field/set"; field: Field; value: FieldUpdate<Field> } }[SettableField];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_SUB_AGENT_PHASES = new Set(["complete", "completed", "failed", "stopped"]);
/** Gaps longer than this between chunks are tool or processing pauses, not generation. */
const CHUNK_GAP_THRESHOLD_MILLISECONDS = 500;

const TERMINATION_REASONS: Record<string, string> = {
  [STATUS_MESSAGES.ITERATION_LIMIT_REACHED]:
    "The agent reached its maximum iteration limit before producing a final response.",
  [STATUS_MESSAGES.SEMANTIC_STALL_DETECTED]:
    "The agent was stuck in a behavioral loop, calling the same tools repeatedly.",
  [STATUS_MESSAGES.COST_LIMIT_REACHED]:
    "The generation was stopped because the cost limit was reached.",
  [STATUS_MESSAGES.EMPTY_OUTPUT]:
    "The model produced an empty response with no text or tool calls.",
};

const isoAt = (clock: EventClock) => new Date(clock.epochMilliseconds).toISOString();

/** The trailing message, when it is an assistant bubble this turn owns. */
function ownedBubble(state: AgentConversationState): ClientMessage | null {
  if (!state.stream.ownsTrailingBubble) return null;
  const last = state.messages[state.messages.length - 1];
  return last?.role === "assistant" ? last : null;
}

/** Rewrite the owned trailing bubble; no bubble of the turn's, no change. */
function patchOwnedBubble(
  state: AgentConversationState,
  patch: (_bubble: ClientMessage) => ClientMessage,
): ClientMessage[] {
  const bubble = ownedBubble(state);
  if (!bubble) return state.messages;
  const patched = patch(bubble);
  if (patched === bubble) return state.messages;
  return [...state.messages.slice(0, -1), patched];
}

/**
 * Extend the owned trailing bubble with `patch`, or push a new assistant
 * bubble (`created`) that the turn then owns.
 */
function writeTurnBubble(
  state: AgentConversationState,
  patch: Partial<ClientMessage>,
  created: ClientMessage,
): Pick<AgentConversationState, "messages" | "stream"> {
  const bubble = ownedBubble(state);
  const messages = bubble
    ? [...state.messages.slice(0, -1), { ...bubble, ...patch }]
    : [...state.messages, created];
  return { messages, stream: { ...state.stream, ownsTrailingBubble: true } };
}

/** Clear the live TTFT clock — time the user spends deciding is not time to first token. */
function stopProcessingClock(state: AgentConversationState): ClientMessage[] {
  return patchOwnedBubble(state, (bubble) =>
    bubble.statusPhase || bubble._processingStartTime
      ? { ...bubble, statusPhase: undefined, _processingStartTime: undefined }
      : bubble,
  );
}

/** Count a streamed token into the burst (tokens per second skip tool pauses). */
function recordBurst(stream: TurnStream, now: number): TurnStream {
  let burstTokens = stream.burstTokens + 1;
  let burstElapsed = stream.burstElapsed;
  if (stream.previousChunkTime !== null) {
    const gap = now - stream.previousChunkTime;
    if (gap < CHUNK_GAP_THRESHOLD_MILLISECONDS) {
      burstElapsed += gap;
    } else {
      burstTokens = 1;
      burstElapsed = 0;
    }
  }
  return {
    ...stream,
    firstChunkTime: stream.firstChunkTime || now,
    previousChunkTime: now,
    burstTokens,
    burstElapsed,
  };
}

/** Open a new text or thinking fragment when the stream switches kind. */
function openFragment(stream: TurnStream, type: "text" | "thinking"): TurnStream {
  if (stream.lastSegmentType === type) return stream;
  const fragments = type === "text" ? stream.textFragments : stream.thinkingFragments;
  const segments = [...stream.segments, { type, fragmentIndex: fragments.length }];
  return type === "text"
    ? { ...stream, segments, textFragments: [...fragments, ""], lastSegmentType: type }
    : { ...stream, segments, thinkingFragments: [...fragments, ""], lastSegmentType: type };
}

function appendToLast(fragments: string[], delta: string): string[] {
  if (!delta) return fragments;
  return [...fragments.slice(0, -1), fragments[fragments.length - 1] + delta];
}

function streamingFields(stream: TurnStream, outputCharacters: number | undefined, now: number) {
  return {
    _streamingOutputCharacters: outputCharacters || 0,
    _streamingStartTime: stream.firstChunkTime,
    _streamingLastChunkTime: now,
    _streamingBurstTokens: stream.burstTokens,
    _streamingBurstElapsed: stream.burstElapsed,
  };
}

/** The stream's accumulators emptied for a new response (task notification, new turn). */
function withEmptyAccumulators(stream: TurnStream): TurnStream {
  const empty = createTurnStream();
  return {
    ...stream,
    text: empty.text,
    thinking: empty.thinking,
    segments: empty.segments,
    textFragments: empty.textFragments,
    thinkingFragments: empty.thinkingFragments,
    audioRefs: empty.audioRefs,
    imageRefs: empty.imageRefs,
    segmentToolIds: empty.segmentToolIds,
    lastSegmentType: empty.lastSegmentType,
    firstChunkTime: undefined,
    previousChunkTime: empty.previousChunkTime,
    burstTokens: empty.burstTokens,
    burstElapsed: empty.burstElapsed,
  };
}

function updateTurnActivity(
  state: AgentConversationState,
  conversationId: string,
  change: (_activity: TurnActivity) => TurnActivity,
): AgentConversationState {
  return {
    ...state,
    turnActivity: { conversationId, activity: change(turnActivityOf(state, conversationId)) },
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function applyText(
  state: AgentConversationState,
  content: string,
  outputCharacters: number | undefined,
  now: number,
): AgentConversationState {
  let stream = recordBurst(state.stream, now);
  stream = openFragment({ ...stream, text: stream.text + content }, "text");
  stream = { ...stream, textFragments: appendToLast(stream.textFragments, content) };
  const fields = {
    content: stream.text.trim(),
    contentSegments: stream.segments,
    textFragments: stream.textFragments,
    thinkingFragments: stream.thinkingFragments,
    ...streamingFields(stream, outputCharacters, now),
  };
  return {
    ...state,
    ...writeTurnBubble({ ...state, stream }, fields, { role: MESSAGE_ROLES.ASSISTANT, ...fields }),
  };
}

function applyThinking(
  state: AgentConversationState,
  content: string,
  outputCharacters: number | undefined,
  now: number,
): AgentConversationState {
  let stream = recordBurst(state.stream, now);
  stream = openFragment({ ...stream, thinking: stream.thinking + content }, "thinking");
  stream = { ...stream, thinkingFragments: appendToLast(stream.thinkingFragments, content) };
  const fields = {
    thinking: stream.thinking,
    contentSegments: stream.segments,
    thinkingFragments: stream.thinkingFragments,
    ...streamingFields(stream, outputCharacters, now),
  };
  return {
    ...state,
    ...writeTurnBubble({ ...state, stream }, fields, {
      role: MESSAGE_ROLES.ASSISTANT,
      content: "",
      ...fields,
    }),
  };
}

/** An image or audio part: placed in the segments where it arrived. */
function applyMedia(
  state: AgentConversationState,
  kind: "image" | "audio",
  reference: string,
): AgentConversationState {
  if (!reference) return state;
  let stream = state.stream;
  const references = kind === "image" ? stream.imageRefs : stream.audioRefs;
  let nextReferences = references;
  if (!references.includes(reference)) {
    nextReferences = [...references, reference];
    stream = {
      ...stream,
      segments: [...stream.segments, { type: kind, fragmentIndex: references.length }],
      ...(kind === "image" ? { imageRefs: nextReferences } : { audioRefs: nextReferences }),
      lastSegmentType: kind,
    };
  }
  const field = kind === "image" ? "images" : "audio";
  const fields = { [field]: [...nextReferences], contentSegments: stream.segments };
  return {
    ...state,
    ...writeTurnBubble({ ...state, stream }, fields, {
      role: MESSAGE_ROLES.ASSISTANT,
      content: "",
      ...fields,
    }),
  };
}

/**
 * Agentic `tool_execution` and LM Studio native `toolCall` events alike:
 * the activity list, the tool's place among the segments, and the call on
 * the turn's bubble.
 */
function applyToolEvent(
  state: AgentConversationState,
  toolInput: ToolExecutionInput,
  clock: EventClock,
): AgentConversationState {
  const now = clock.epochMilliseconds;
  const resolvedId = toolInput.id || `tc-${now}-${clock.nonce}`;
  const toolActivity =
    applyToolExecutionToActivity(state.toolActivity, resolvedId, toolInput, now) ?? state.toolActivity;

  let stream = state.stream;
  if (
    (toolInput.status === "streaming" || toolInput.status === "calling") &&
    !stream.segmentToolIds.includes(resolvedId)
  ) {
    const last = stream.segments[stream.segments.length - 1];
    const segments =
      stream.lastSegmentType === "tools" && last
        ? [...stream.segments.slice(0, -1), { ...last, toolIds: [...(last.toolIds ?? []), resolvedId] }]
        : [...stream.segments, { type: "tools" as const, toolIds: [resolvedId] }];
    stream = {
      ...stream,
      segments,
      segmentToolIds: [...stream.segmentToolIds, resolvedId],
      lastSegmentType: "tools",
    };
  }

  // A joined turn never writes into a completed reply: open its own bubble.
  const base =
    ownedBubble(state) || state.messages[state.messages.length - 1]?.role !== "assistant"
      ? state.messages
      : [...state.messages, { role: MESSAGE_ROLES.ASSISTANT, content: "" }];
  const messages = applyToolExecutionToMessages(
    base,
    resolvedId,
    toolInput,
    {
      contentSegments: stream.segments,
      textFragments: stream.textFragments,
      thinkingFragments: stream.thinkingFragments,
    },
    now,
  ) as ClientMessage[];
  return {
    ...state,
    toolActivity,
    messages,
    stream: { ...stream, ownsTrailingBubble: true },
  };
}

function appendOutput(outputs: Map<string, string>, key: string, data: string | undefined) {
  const updated = new Map(outputs);
  updated.set(key, (updated.get(key) || "") + (data || ""));
  return updated;
}

/**
 * A status with a phase — LM Studio's lifecycle (loading, prefilling,
 * generating) or a truncated turn: shown on the turn's bubble, created as a
 * placeholder when none exists yet.
 */
function applyStatusPhase(
  state: AgentConversationState,
  status: { message: string; phase: string; progress?: number },
  now: number,
): AgentConversationState {
  const bubble = ownedBubble(state);
  const hasProgress = status.progress != null;
  return {
    ...state,
    ...writeTurnBubble(
      state,
      {
        status: status.message,
        statusPhase: status.phase,
        _statusProgress: hasProgress ? status.progress : bubble?._statusProgress,
        _processingStartTime:
          status.phase === "prefilling" && !bubble?._processingStartTime
            ? now
            : bubble?._processingStartTime,
      },
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content: "",
        status: status.message,
        statusPhase: status.phase,
        _statusProgress: hasProgress ? status.progress : undefined,
        _processingStartTime: status.phase === "prefilling" ? now : undefined,
      },
    ),
  };
}

function applyStatus(state: AgentConversationState, event: StatusEvent, clock: EventClock): AgentConversationState {
  const now = clock.monotonicMilliseconds;
  // Display text (a provider's progress, a blocked tool) carries only a phase.
  if (!isKnownStatusEvent(event)) {
    return event.phase
      ? applyStatusPhase(state, { message: event.message, phase: event.phase, progress: event.progress }, now)
      : state;
  }
  let next = state;
  // The `turn_input` event carries the content; this twin only settles a
  // bubble's badge if that event was missed.
  if (event.message === "turn_input_applied" && typeof event.inputId === "string") {
    next = {
      ...next,
      messages: markTurnInputApplied(next.messages, event.inputId, {
        boundary: event.boundary,
        iteration: typeof event.iteration === "number" ? event.iteration : undefined,
      }),
    };
  }
  switch (event.message) {
    case STATUS_MESSAGES.ITERATION_PROGRESS:
      // Live events flow: the status bar's own timer takes over.
      return {
        ...next,
        agenticProgress: { iteration: event.iteration ?? 0, maxIterations: event.maxIterations ?? 0 },
        statusBarInitialElapsedMilliseconds: null,
      };
    case STATUS_MESSAGES.COMPACTION_STARTED:
      return {
        ...next,
        ...writeTurnBubble(
          next,
          { status: "Compacting conversation...", statusPhase: "prefilling" },
          {
            role: MESSAGE_ROLES.ASSISTANT,
            content: "",
            status: "Compacting conversation...",
            statusPhase: "prefilling",
          },
        ),
      };
    case STATUS_MESSAGES.COMPACTION_COMPLETE:
    case STATUS_MESSAGES.COMPACTION_FAILED:
      return {
        ...next,
        messages: patchOwnedBubble(next, (bubble) =>
          bubble.statusPhase === "prefilling"
            ? { ...bubble, status: undefined, statusPhase: undefined }
            : bubble,
        ),
      };
    case STATUS_MESSAGES.GENERATION_STARTED: {
      // Server-computed TTFT — one sample per iteration, averaged for display.
      const timeToFirstToken = event.timeToFirstToken ?? 0;
      return {
        ...next,
        messages: patchOwnedBubble(next, (bubble) => ({
          ...bubble,
          _ttftSamples: [...(bubble._ttftSamples || []), timeToFirstToken],
        })),
      };
    }
    case STATUS_MESSAGES.GENERATION_PROGRESS: {
      // The server's aggregate across orchestrator, sub-agents and tool
      // sub-requests (ConversationGenerationTracker).
      const progress = event as typeof event & Record<string, number | undefined>;
      return {
        ...next,
        messages: patchOwnedBubble(next, (bubble) => ({
          ...bubble,
          _liveGenProgress: {
            // Server emits `tokPerSec`; accept the legacy alias too.
            tokensPerSecond: progress.tokPerSec ?? progress.tokensPerSecond,
            activeRequests: progress.activeRequests,
            outputTokens: progress.outputTokens,
            inputTokens: progress.inputTokens,
            totalTokens: progress.totalTokens,
            avgTtft: progress.avgTtft as number | undefined, // null on the wire when unknown
            // A high-water mark per turn: keep the last one when a frame has none.
            estimatedCost: progress.estimatedCost ?? bubble._liveGenProgress?.estimatedCost,
            timestamp: now,
          },
        })),
      };
    }
    case STATUS_MESSAGES.ITERATION_LIMIT_REACHED:
    case STATUS_MESSAGES.SEMANTIC_STALL_DETECTED:
    case STATUS_MESSAGES.COST_LIMIT_REACHED:
    case STATUS_MESSAGES.EMPTY_OUTPUT: {
      // The loop ended for a non-standard reason: a notice on the turn's bubble.
      const reason = TERMINATION_REASONS[event.message] || "The generation ended unexpectedly.";
      return {
        ...next,
        messages: patchOwnedBubble(next, (bubble) => ({ ...bubble, _terminationReason: reason })),
      };
    }
    case STATUS_MESSAGES.SKILLS_INJECTED:
    case STATUS_MESSAGES.CONTEXT_TRUNCATED:
    case STATUS_MESSAGES.TOOL_SET_CHANGED:
    case STATUS_MESSAGES.TASKS_UPDATED:
    case STATUS_MESSAGES.SUB_AGENTS_UPDATED:
    case STATUS_MESSAGES.MEMORIES_UPDATED:
      return next; // side effects only (agentConversationEffects)
    default:
      return "phase" in event && event.phase
        ? applyStatusPhase(next, { message: event.message, phase: event.phase as string }, now)
        : next;
  }
}

const NEW_SUB_AGENT = { toolCount: 0, currentTool: null, iteration: 0, toolNames: {} };

function applySubAgentToolExecution(
  state: AgentConversationState,
  event: SubAgentToolExecutionEvent,
  clock: EventClock,
): AgentConversationState {
  const subAgentId = event.subAgentId;
  const toolData = event.tool;
  if (!subAgentId || !toolData) return state;
  const previous = state.subAgentToolActivity;
  const entry = {
    toolCount: 0,
    currentTool: null as string | null,
    iteration: 0,
    toolNames: {} as Record<string, number>,
    toolCalls: [] as ToolCallEvent[],
    ...previous[subAgentId],
  };
  const status = event.status as string;
  let calls = [...entry.toolCalls];
  let updated: SubAgentActivityEntry | null = null;
  if (status === "streaming" || status === "calling") {
    const call: ToolCallEvent = {
      id: toolData.id || `wtc-${clock.epochMilliseconds}`,
      name: toolData.name || "unknown",
      args: toolData.args || {},
      status,
    };
    if (calls.some((existing) => existing.id === call.id)) {
      calls = calls.map((existing) =>
        existing.id === call.id
          ? {
              ...existing,
              status,
              ...(toolData.args && Object.keys(toolData.args).length > 0 ? { args: toolData.args } : {}),
            }
          : existing,
      );
      updated = { ...entry, currentTool: toolData.name || entry.currentTool, toolCalls: calls, phase: undefined };
    } else {
      calls.push(call);
      const toolName = toolData.name || "unknown";
      updated = {
        ...entry,
        currentTool: toolName,
        toolCount: entry.toolCount + 1,
        toolNames: { ...entry.toolNames, [toolName]: (entry.toolNames[toolName] || 0) + 1 },
        toolCalls: calls,
        phase: undefined, // a tool is running now
      };
    }
  } else if (status === "done" || status === "error") {
    calls = calls.map((existing) =>
      existing.id === toolData.id ||
      (existing.name === toolData.name && (existing.status === "calling" || existing.status === "streaming"))
        ? {
            ...existing,
            status: status === "done" ? "done" : "error",
            result: toolData.result,
            durationMs:
              toolData.durationMs ||
              ((toolData as Record<string, unknown>).durationMilliseconds as number | undefined),
          }
        : existing,
    );
    updated = { ...entry, currentTool: null, toolCalls: calls, phase: undefined };
  }
  if (!updated) return state;
  return { ...state, subAgentToolActivity: { ...previous, [subAgentId]: updated } };
}

function applySubAgentStatus(state: AgentConversationState, event: SubAgentStatusEvent): AgentConversationState {
  const subAgentId = event.subAgentId;
  if (!subAgentId) return state;
  const activity = state.subAgentToolActivity;
  const current = activity[subAgentId];
  const withEntry = (entry: SubAgentActivityEntry) => ({
    ...state,
    subAgentToolActivity: { ...activity, [subAgentId]: entry },
  });
  const fields = event as SubAgentStatusEvent & Record<string, unknown>;
  switch (event.message) {
    case STATUS_MESSAGES.SPAWNED:
      // Mapped early by description, so the spawn renderer finds the
      // activity before the tool result arrives.
      return withEntry({
        ...(current || NEW_SUB_AGENT),
        description: event.description,
        phase: "spawned",
        conversationId: (fields.conversationId as string) || undefined,
      });
    case STATUS_MESSAGES.ITERATION_PROGRESS:
      return withEntry({
        ...(current || { toolCount: 0, currentTool: null }),
        iteration: fields.iteration as number,
        maxIterations: fields.maxIterations as number,
      });
    case STATUS_MESSAGES.PHASE:
      return withEntry({
        ...(current || { toolCount: 0, currentTool: null, iteration: 0 }),
        phase: fields.phase as string,
        phaseLabel: (fields.label as string) || undefined,
        phaseProgress:
          fields.progress != null ? (fields.progress as number) : (current?.phaseProgress ?? undefined),
      });
    case STATUS_MESSAGES.GENERATION_STARTED: {
      const timeToFirstToken = (fields.timeToFirstToken as number | undefined) ?? 0;
      return {
        ...state,
        messages: patchOwnedBubble(state, (bubble) => ({
          ...bubble,
          _ttftSamples: [...(bubble._ttftSamples || []), timeToFirstToken],
        })),
      };
    }
    case STATUS_MESSAGES.GENERATION_PROGRESS: {
      const progress = fields as Record<string, number | string | undefined>;
      const messages = patchOwnedBubble(state, (bubble) => {
        const perAgent = bubble._subAgentGenerationProgress || {};
        const existing = (perAgent[subAgentId] || {}) as SubAgentGenerationProgress;
        return {
          ...bubble,
          _subAgentGenerationProgress: {
            ...perAgent,
            [subAgentId]: {
              ...existing,
              // Burst-scoped values for tok/s — only when present.
              ...(progress.outputTokens != null && { outputTokens: progress.outputTokens as number }),
              ...(progress.firstChunkTime != null && { firstChunkTime: progress.firstChunkTime as number }),
              ...(progress.lastChunkTime != null && { lastChunkTime: progress.lastChunkTime as number }),
              totalOutputTokens:
                (progress.totalOutputTokens as number) ||
                (progress.outputTokens as number) ||
                existing.totalOutputTokens,
              // Server emits `tokPerSec`; accept the legacy alias.
              tokensPerSecond:
                (progress.tokPerSec as number | undefined) ??
                (progress.tokensPerSecond as number | undefined) ??
                existing.tokensPerSecond,
              ...(progress.inputTokens != null && { inputTokens: progress.inputTokens as number }),
              ...(progress.totalTokens != null && { totalTokens: progress.totalTokens as number }),
              ...(progress.avgTtft != null && { avgTtft: progress.avgTtft as number }),
            },
          },
        };
      });
      // Also on the activity entry, for each sub-agent's own header.
      const existing = (current || NEW_SUB_AGENT) as SubAgentActivityEntry;
      return {
        ...state,
        messages,
        subAgentToolActivity: {
          ...activity,
          [subAgentId]: {
            ...existing,
            status: (progress.status as string) || existing.status,
            iteration: (progress.iteration as number) || existing.iteration,
            ...(progress.outputTokens != null && { outputTokens: progress.outputTokens as number }),
            ...(progress.firstChunkTime != null && { firstChunkTime: progress.firstChunkTime as number }),
            ...(progress.lastChunkTime != null && { lastChunkTime: progress.lastChunkTime as number }),
            totalOutputTokens:
              (progress.totalOutputTokens as number) ||
              (progress.outputTokens as number) ||
              existing.totalOutputTokens,
            tokensPerSecond: (progress.tokensPerSecond as number | undefined) ?? existing.tokensPerSecond,
          },
        },
      };
    }
    case STATUS_MESSAGES.COMPLETE: {
      const next = withEntry({
        ...(current || {}),
        phase: "complete",
        currentTool: null,
        durationMs: fields.durationMilliseconds as number | undefined,
        toolCount: (fields.toolCount as number | undefined) ?? current?.toolCount,
      });
      const usage = fields.usage as { inputTokens?: number; outputTokens?: number; requests?: number } | undefined;
      if (!usage) return next;
      // Sub-agent usage adds into the turn's bubble as each one completes.
      return {
        ...next,
        messages: patchOwnedBubble(next, (bubble) => {
          const tokens = bubble._subAgentTokens || { input: 0, output: 0, requests: 0 };
          const perAgent = { ...(bubble._subAgentGenerationProgress || {}) };
          delete perAgent[subAgentId]; // no stale tok/s after it finished
          return {
            ...bubble,
            _subAgentTokens: {
              input: (tokens.input || 0) + (usage.inputTokens || 0),
              output: (tokens.output || 0) + (usage.outputTokens || 0),
              requests: (tokens.requests || 0) + (usage.requests || 1),
            },
            _subAgentGenerationProgress: Object.keys(perAgent).length > 0 ? perAgent : undefined,
          };
        }),
      };
    }
    case STATUS_MESSAGES.FAILED:
      return withEntry({
        ...(current || {}),
        phase: "failed",
        currentTool: null,
        error: fields.error as string | undefined,
      });
    default:
      return state;
  }
}

function applyDone(state: AgentConversationState, event: DoneEvent, clock: EventClock): AgentConversationState {
  const sentWith = state.stream.sentWith;
  const messages = patchOwnedBubble(state, (bubble) => {
    const existingAudio = Array.isArray(bubble.audio) ? bubble.audio : bubble.audio ? [bubble.audio] : [];
    const audio = event.audioRef
      ? existingAudio.includes(event.audioRef)
        ? existingAudio.length > 0
          ? existingAudio
          : undefined
        : [...existingAudio, event.audioRef]
      : bubble.audio;
    return {
      ...bubble,
      provider: sentWith ? sentWith.provider : event.provider,
      model: sentWith ? sentWith.model : event.model,
      usage: event.usage ?? undefined,
      totalTime: event.totalTime ?? undefined,
      tokensPerSec: event.tokensPerSec ?? undefined,
      estimatedCost: event.estimatedCost ?? undefined,
      timeToGeneration: event.timeToGeneration ?? undefined,
      thinkingDurationSeconds: event.thinkingDurationSeconds,
      contentDurationSeconds: event.contentDurationSeconds,
      completedAt: isoAt(clock),
      status: undefined,
      statusPhase: undefined,
      ...(audio ? { audio } : {}),
    };
  });
  return {
    ...state,
    messages,
    pendingUserQuestion: null,
    stream: { ...state.stream, hasEnded: true, awaitingUserMessageEcho: false },
  };
}

function applyEvent(
  state: AgentConversationState,
  event: TurnEvent,
  conversationId: string,
  clock: EventClock,
): AgentConversationState {
  const now = clock.monotonicMilliseconds;
  switch (event.type) {
    case "user_message": {
      // Our own prompt, echoed back: already on screen.
      if (state.stream.awaitingUserMessageEcho) {
        return { ...state, stream: { ...state.stream, awaitingUserMessageEcho: false } };
      }
      // A turn started elsewhere: what streams next opens a new bubble.
      const next = updateTurnActivity({ ...state, stream: createTurnStream() }, conversationId, startTurnActivity);
      const content = event.content || "";
      if (!content) return next;
      const last = next.messages[next.messages.length - 1];
      if (last?.role === "user" && last.content === content) return next; // already present
      return {
        ...next,
        messages: [
          ...next.messages,
          {
            role: MESSAGE_ROLES.USER,
            content,
            timestamp: new Date(event.timestamp || clock.epochMilliseconds).toISOString(),
          },
        ],
      };
    }
    case "chunk":
      return applyText(state, event.content, event.outputCharacters, now);
    case "thinking":
      return applyThinking(state, event.content, event.outputCharacters, now);
    case "image":
      return applyMedia(state, "image", event.minioRef || event.data || "");
    case "audio":
      return applyMedia(state, "audio", event.data ?? "");
    case "tool_execution":
      if (!event.tool) return state;
      return applyToolEvent(
        state,
        {
          id: event.tool.id ?? "",
          name: event.tool.name,
          args: event.tool.args,
          status: event.status as string,
          result: event.tool.result,
          durationMs: event.tool.durationMs,
          timestamp: event.timestamp as number | undefined,
        },
        clock,
      );
    case "toolCall":
      return applyToolEvent(
        state,
        {
          id: event.id ?? "",
          name: event.name ?? "",
          args: event.args,
          status: (event.status as string) || "",
          result: event.result,
        },
        clock,
      );
    case "tool_output":
      if (event.event !== "stdout" && event.event !== "stderr") return state;
      return {
        ...state,
        streamingOutputs: appendOutput(state.streamingOutputs, event.toolCallId || event.name || "", event.data),
      };
    case "approval_required": {
      const approval = approvalFromEvent(event);
      if (!approval) return state;
      return {
        ...state,
        pendingApprovals: addApproval(state.pendingApprovals, approval),
        messages: stopProcessingClock(state),
      };
    }
    case "approval_decided": {
      // One card decided — here, in another tab, by a batch scope or a timeout.
      const pendingApprovals = applyApprovalDecided(state.pendingApprovals, event);
      const plan = state.planProposal;
      const decidesPlan =
        plan?.status === "pending" &&
        !!state.stream.planToolCallId &&
        event.toolCallId === state.stream.planToolCallId;
      if (!plan || !decidesPlan) return { ...state, pendingApprovals };
      return {
        ...state,
        pendingApprovals,
        planProposal: { ...plan, status: event.decision === "allow" ? "approved" : "rejected" },
      };
    }
    case "plan_proposal": {
      // The plan renders in-flow: later tools and text come after its card.
      const stream: TurnStream = {
        ...state.stream,
        segments: [...state.stream.segments, { type: "plan" }],
        lastSegmentType: "plan",
        ...(typeof event.toolCallId === "string" ? { planToolCallId: event.toolCallId } : {}),
      };
      const isPending = !event.autoApproved;
      const next = { ...state, stream };
      return {
        ...next,
        messages: patchOwnedBubble(next, (bubble) => ({
          ...bubble,
          contentSegments: stream.segments,
          textFragments: stream.textFragments,
          thinkingFragments: stream.thinkingFragments,
          ...(isPending ? { statusPhase: undefined, _processingStartTime: undefined } : {}),
        })),
        planProposal: {
          plan: event.plan || "",
          steps: event.steps || [],
          status: isPending ? "pending" : "approved",
        },
      };
    }
    case "user_question":
      // Non-blocking: the agent keeps working; the card is its own (effects).
      if (event.blocking === false) return state;
      // Blocking: only the sender answers — a viewing tab would answer a
      // question the sender may already have answered.
      if (!state.stream.isDriving) return state;
      return {
        ...state,
        pendingUserQuestion: {
          questionId: typeof event.questionId === "string" ? event.questionId : undefined,
          questions: event.questions || [],
          context: event.context || undefined,
        },
        messages: stopProcessingClock(state),
      };
    case "turn_input": {
      // A mid-turn input landed (a steer, an answer, a task completion).
      // While the turn streams into its own bubble the input goes just above
      // that bubble; otherwise it is appended and what follows opens a new one.
      const inputId = typeof event.id === "string" ? event.id : "";
      if (!inputId) return state;
      return {
        ...state,
        messages: applyTurnInputEvent(
          state.messages,
          {
            id: inputId,
            kind: event.kind ?? "user_update",
            content: event.content || "",
            images: Array.isArray(event.images) ? event.images : undefined,
            boundary: event.boundary,
            iteration: typeof event.iteration === "number" ? event.iteration : undefined,
            receivedAt: isoAt(clock),
            // External input names where it came from (never the user).
            ...(event.source ? { source: event.source } : {}),
            ...(event.sender ? { sender: event.sender } : {}),
          },
          state.stream.ownsTrailingBubble ? "before-trailing-assistant" : "append",
        ),
      };
    }
    case "status":
      return applyStatus(state, event, clock);
    case "sub_agent_tool_execution":
      return applySubAgentToolExecution(state, event, clock);
    case "sub_agent_tool_output": {
      const key = event.toolCallId || event.name || "";
      if (!event.subAgentId || !key) return state;
      return { ...state, streamingOutputs: appendOutput(state.streamingOutputs, key, event.data) };
    }
    case "sub_agent_status":
      return applySubAgentStatus(state, event);
    case "usage_update":
      return {
        ...state,
        messages: patchOwnedBubble(state, (bubble) => {
          // Background work (memory extraction, embeddings, compaction)
          // accumulates on its own, so the token badge grows smoothly.
          const operation = (event.operation as string) || "";
          if (operation.startsWith("memory:") || operation.startsWith("embed:") || operation.startsWith("compact:")) {
            const background = bubble._backgroundUsage || { inputTokens: 0, outputTokens: 0, cost: 0 };
            return {
              ...bubble,
              _backgroundUsage: {
                inputTokens: (background.inputTokens || 0) + (event.usage?.inputTokens || 0),
                outputTokens: (background.outputTokens || 0) + (event.usage?.outputTokens || 0),
                requests: (background.requests || 0) + (event.usage?.requests || 1),
                cost: (background.cost || 0) + (event.estimatedCost || 0),
              },
            };
          }
          if (bubble.usage) return bubble;
          // The iteration's authoritative usage: between the streaming
          // estimate and the final `done` for the token stats.
          return {
            ...bubble,
            _intermediateUsage: event.usage,
            _intermediateEstimatedCost: event.estimatedCost ?? null,
          };
        }),
      };
    case "context_budget":
      return {
        ...state,
        contextBudget: {
          contextWindow: event.contextWindow as number,
          messageTokens: event.messageTokens as number,
          systemPromptTokens: event.systemPromptTokens as number,
          toolSchemaTokens: event.toolSchemaTokens as number,
          skillTokens: event.skillTokens !== undefined ? (event.skillTokens as number) : undefined,
          safetyMarginTokens: event.safetyMarginTokens as number,
          totalInputTokens: event.totalInputTokens as number,
          availableOutputTokens: event.availableOutputTokens as number,
          requestedOutputTokens:
            event.requestedOutputTokens !== undefined ? (event.requestedOutputTokens as number) : undefined,
          isClamped: event.isClamped as boolean,
          toolCount: event.toolCount as number,
          source: (event.source as "estimated" | "reported") || "estimated",
          lastReportedInputTokens:
            event.lastReportedInputTokens !== undefined ? (event.lastReportedInputTokens as number) : undefined,
          calibrationRatio: event.calibrationRatio !== undefined ? (event.calibrationRatio as number) : undefined,
        },
      };
    case "task_notification": {
      // A background task finished and the agent answers it: the current
      // reply is done, the notification shows as a user message, and the
      // answer streams into a fresh bubble.
      const bubble = ownedBubble(state);
      const settled =
        bubble && !bubble.completedAt
          ? [...state.messages.slice(0, -1), { ...bubble, completedAt: isoAt(clock) }]
          : state.messages;
      const sentWith = state.stream.sentWith;
      return {
        ...state,
        messages: [
          ...settled,
          {
            role: MESSAGE_ROLES.USER,
            content: event.content as string,
            timestamp: event.timestamp as string,
            _notificationSource: event._notificationSource as string,
            _notificationId: event._notificationId as string,
          },
          {
            role: MESSAGE_ROLES.ASSISTANT,
            content: "",
            timestamp: isoAt(clock),
            provider: sentWith?.provider,
            model: sentWith?.model,
          },
        ],
        stream: { ...withEmptyAccumulators(state.stream), ownsTrailingBubble: true },
      };
    }
    case "done":
      return applyDone(state, event, clock);
    case "error":
      // `done` then `error` is the route reporting a loop failure the turn
      // already persisted: the stored document is what shows.
      if (state.stream.hasEnded) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: MESSAGE_ROLES.ASSISTANT, content: `⚠️ Error: ${event.message}`, isError: true },
        ],
        stream: { ...state.stream, hasEnded: true },
      };
    case "todo_update":
      return updateTurnActivity(state, conversationId, (activity) => applyTodoUpdate(activity, event));
    case "brief_update":
      return updateTurnActivity(state, conversationId, (activity) => applyBriefUpdate(activity, event));
    case "webSearchResult":
      return updateTurnActivity(state, conversationId, (activity) =>
        applyWebSearchResults(activity, event.results),
      );
    case "executableCode":
      return updateTurnActivity(state, conversationId, (activity) =>
        applyExecutableCode(activity, event.code, event.language),
      );
    case "codeExecutionResult":
      return updateTurnActivity(state, conversationId, (activity) =>
        applyCodeExecutionResult(activity, event.output, event.outcome),
      );
    // Side effects only (agentConversationEffects), connection framing, and
    // events the chat does not render: `citations` shows through the
    // `webSearchResult` that follows it, and later from the stored message.
    case "goal_update":
    case "permission_mode":
    case "conversation_state_update":
    case "hello":
    case "subscribed":
    case "refusal":
    case "memory_consolidation_complete":
    case "citations":
      return state;
    default:
      event satisfies never;
      return state;
  }
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function agentConversationReducer(
  state: AgentConversationState,
  action: AgentConversationAction,
): AgentConversationState {
  switch (action.type) {
    case "event":
      return applyEvent(state, action.event, action.conversationId, action.clock);
    case "turn/started": {
      // Sub-agents still running keep their bars through the follow-up.
      const runningSubAgents: Record<string, SubAgentActivityEntry> = {};
      for (const [id, entry] of Object.entries(state.subAgentToolActivity)) {
        if (!entry.phase || !TERMINAL_SUB_AGENT_PHASES.has(entry.phase)) runningSubAgents[id] = entry;
      }
      return updateTurnActivity(
        {
          ...state,
          messages: action.messages,
          toolActivity: [],
          subAgentToolActivity: runningSubAgents,
          streamingOutputs: new Map(),
          pendingApprovals: [],
          pendingUserQuestion: null,
          planProposal: null,
          agenticProgress: null,
          statusBarInitialElapsedMilliseconds: null,
          stream: createTurnStream({
            ownsTrailingBubble: true,
            isDriving: true,
            awaitingUserMessageEcho: true,
            sentWith: action.sentWith,
          }),
        },
        action.conversationId,
        startTurnActivity,
      );
    }
    case "turn/stopped": {
      // No more live metrics on the bubble, and every sub-agent bar stops:
      // their terminal events will not arrive on an aborted stream.
      const last = state.messages[state.messages.length - 1];
      const messages =
        last?.role === "assistant" && !last.completedAt
          ? [
              ...state.messages.slice(0, -1),
              {
                ...last,
                statusPhase: undefined,
                _processingStartTime: undefined,
                _streamingStartTime: undefined,
                _streamingLastChunkTime: undefined,
                completedAt: isoAt(action.clock),
              },
            ]
          : state.messages;
      const hasRunningSubAgent = Object.values(state.subAgentToolActivity).some(
        (entry) => !entry.phase || !TERMINAL_SUB_AGENT_PHASES.has(entry.phase),
      );
      const subAgentToolActivity = hasRunningSubAgent
        ? Object.fromEntries(
            Object.entries(state.subAgentToolActivity).map(([id, entry]) => [
              id,
              !entry.phase || !TERMINAL_SUB_AGENT_PHASES.has(entry.phase)
                ? { ...entry, phase: "complete", currentTool: null }
                : entry,
            ]),
          )
        : state.subAgentToolActivity;
      return {
        ...state,
        messages,
        isGenerating: false,
        planProposal: null,
        subAgentToolActivity,
        stream: { ...state.stream, hasEnded: true },
      };
    }
    case "turn/failed":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: MESSAGE_ROLES.ASSISTANT, content: `⚠️ Error: ${action.message}`, isError: true },
        ],
      };
    case "stream/attached": {
      if (!action.continuation) return { ...state, stream: createTurnStream() };
      // Continue the bubble the torn-down stream was writing.
      const seeded = seedStreamAccumulators(state.messages);
      return {
        ...state,
        stream: createTurnStream({
          text: seeded.streamedText,
          thinking: seeded.streamedThinking,
          ownsTrailingBubble: seeded.streamedText !== "" || seeded.streamedThinking !== "",
        }),
      };
    }
    case "stream/released":
    case "conversation/loaded":
      // Nothing on screen is the stream's any more. A turn that ended stays
      // ended until the next one starts: a late `error` is the finished turn's.
      return { ...state, stream: createTurnStream({ hasEnded: state.stream.hasEnded }) };
    case "conversation/reset":
      return createAgentConversationState();
    case "conversation/restored":
      return action.state;
    case "field/set": {
      const previous = state[action.field];
      const value =
        typeof action.value === "function"
          ? (action.value as (_previous: typeof previous) => typeof previous)(previous)
          : action.value;
      return Object.is(value, previous) ? state : { ...state, [action.field]: value };
    }
    default:
      action satisfies never;
      return state;
  }
}

/** Apply one event to a conversation's state held outside React (a background snapshot). */
export function reduceEvent(
  state: AgentConversationState,
  event: TurnEvent,
  conversationId: string,
  clock: EventClock = eventClockNow(),
): AgentConversationState {
  return agentConversationReducer(state, { type: "event", event, conversationId, clock });
}
