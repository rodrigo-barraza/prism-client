// ============================================================
// Prism Client — Shared Type Definitions
// ============================================================
// Single source of truth for domain types. Define canonical shapes
// here so TypeScript inference propagates them downward through
// PrismService → hooks → components → utils — eliminating `as any`.
// ============================================================

import { MESSAGE_ROLES, EXECUTION_STATUS } from "../constants";
import type { ToolDisplayMetadata } from "@rodrigo-barraza/utilities-library";
import type {
  ApprovalDecidedEvent,
  ApprovalRequiredEvent,
  BriefUpdateEvent,
  ContextBudgetEvent,
  ConversationStateUpdateEvent,
  DoneEvent,
  ErrorEvent,
  GoalUpdateEvent,
  PermissionModeEvent,
  PlanProposalEvent,
  StatusEvent,
  SubAgentStatusEvent,
  SubAgentToolExecutionEvent,
  SubAgentToolOutputEvent,
  SynthesisEvent,
  TaskNotificationEvent,
  TodoUpdateEvent,
  ToolExecutionEvent,
  ToolOutputEvent,
  TurnEvent,
  TurnEventOf,
  TurnInputEvent,
  UsageUpdateEvent,
  UserMessageEvent,
  UserQuestionEvent,
} from "./protocol/events";

// --- Identifiers --------------------------------------------

/** MongoDB ObjectId string or UUID */
export type ObjectId = string;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ModelInstance {
  instanceId: string;
  provider: string;
  name: string;
}

export interface AgentInstance {
  instanceId: string;
  agentId: string;
  name: string;
  provider?: string;
  modelName?: string;
  description?: string;
}

export interface ModelOptionWithProvider extends ModelOption {
  provider: string;
}


// --- Config / Models ----------------------------------------

export interface ArenaScores {
  text?: number;
  code?: number;
  vision?: number;
  document?: number;
  image?: number;
  search?: number;
}

export interface ModelOption {
  name: string;
  label?: string;
  display_name?: string;
  provider?: string;
  description?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
  imageCostPer1M?: number;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
  supportsStreaming?: boolean;
  supportsThinking?: boolean;
  thinking?: boolean;
  thinkingLevels?: string[];
  /**
   * Server's explicit answer to "can thinking be switched off?", for models
   * where the thinkingLevels list doesn't say. Absent = use the "declares a
   * minimal level" heuristic. See canDisableThinking() in modelCapabilities.
   */
  canDisableThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsPdf?: boolean;
  supportsSystemPrompt?: boolean;
  supportsJsonMode?: boolean;
  free?: boolean;
  arena?: ArenaScores;
  pricing?: Record<string, number>;
  loaded?: boolean;
  path?: string;
  quantization?: string;
  parameterCount?: number;
  vramGiB?: number;
  /** Instance ID for local models (multi-instance) */
  instanceId?: string;
  liveAPI?: boolean;
  tools?: string[];
  webFetch?: boolean;
  responsesAPI?: boolean;
  reasoningSummary?: boolean;
  verbosity?: boolean;
  jsonMode?: boolean;
  defaultTemperature?: number;
  inputTypes?: string[];
  outputTypes?: string[];
  rawInputTypes?: string[];
  modelType?: string;
  lockedSampling?: boolean;
  adaptiveThinking?: boolean;
}

export interface ModelDefaults {
  [provider: string]: string;
}

export interface ModelsMap {
  [provider: string]: ModelOption[];
}

export interface ModalityConfig {
  models: ModelsMap;
  defaults: ModelDefaults;
  recommendedDefault?: { provider: string; model: string; temperature: number } | null;
  recommendedAgenticDefault?: { provider: string; model: string; temperature: number } | null;
}

export interface VoiceOption {
  id: string;
  name: string;
  provider: string;
  gender?: string;
  accent?: string;
  preview_url?: string;
}

export interface TextToSpeechConfig extends ModalityConfig {
  voices: Record<string, VoiceOption[]>;
  defaultVoices: Record<string, string>;
}

export interface LocalProviderInfo {
  id: string;
  type: string;
  instanceNumber: number;
  concurrency: number;
  nickname?: string;
}

export interface LlamaCppServerProps {
  totalSlots: number;
  modelPath: string | null;
  modelAlias: string | null;
  chatTemplate: string | null;
  modalities: { vision: boolean; audio: boolean } | null;
  endpointSlots: boolean;
  endpointMetrics: boolean;
  defaultGenerationSettings: {
    contextLength: number;
    temperature: number;
    topK: number;
    topP: number;
    minP: number;
    repeatPenalty: number;
    presencePenalty: number;
    frequencyPenalty: number;
    seed: number;
    maxTokens: number;
    samplers: string[];
    cacheTypeK: string | null;
    cacheTypeV: string | null;
  } | null;
  slots: Array<{
    id: number;
    state: string;
    model: string | null;
    contextLength: number;
    tokensUsed: number;
    tokensPredicted: number;
    cacheTokens: number;
    isProcessing: boolean;
  }>;
  health: {
    status: string;
    slotsIdle: number | null;
    slotsProcessing: number | null;
  } | null;
}

// --- Parameter Descriptors ----------------------------------

export interface ParameterDescriptor {
  key: string;
  label: string;
  controlType: "slider" | "select" | "input" | "toggle";
  dataType: "number" | "string" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  defaultValue: number | string | boolean;
  agentDefault: number | string | boolean;
  locked?: boolean;
  lockedReason?: string;
  group: "sampling" | "reasoning" | "output" | "penalties" | "advanced";
  providers: string[];
  requiresThinking?: boolean;
  requiresResponsesAPI?: boolean;
  hideWhenReasoning?: boolean;
  providerOverrides?: Record<string, {
    max?: number;
    min?: number;
    locked?: boolean;
    lockedReason?: string;
    /** Lock the parameter whenever a reasoning model has thinking enabled. */
    lockedWhenReasoning?: boolean;
    lockedWhenReasoningReason?: string;
  }>;
}

export interface PrismConfig {
  fileBaseUrl: string | null;
  fcSystemPrompt: string;
  providers: Record<string, string>;
  providerList: string[];
  availableProviders: string[];
  localProviders: LocalProviderInfo[];
  thinkingPatterns?: string[];
  textToText: ModalityConfig;
  textToSpeech: TextToSpeechConfig;
  textToImage: ModalityConfig;
  imageToText: ModalityConfig;
  embedding: ModalityConfig;
  audioToText: ModalityConfig;
  parameterDescriptors?: ParameterDescriptor[];
}

// --- Background / Incremental Usage -------------------------

export interface BackgroundUsage {
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
}

// --- Generation Settings (server snapshot) ------------------

export interface GenerationSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningEffort?: string;
  thinkingLevel?: string;
  thinkingBudget?: string | number;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  parallelToolCalls?: boolean;
  candidateCount?: number;
  responseMimeType?: string;
  serviceTier?: string;
  seed?: number | string;
  stopSequences?: string[];
  verbosity?: string;
  reasoningSummary?: string;
  responseFormat?: string;
  store?: boolean;
  mediaResolution?: string;
  topLogprobs?: number;
  responseLogprobs?: boolean;
  logprobs?: number;
}

// --- Sub-Agent Generation Progress --------------------------

export interface SubAgentGenerationProgress {
  outputTokens?: number;
  totalOutputTokens?: number;
  tokensPerSecond?: number;
  toolNames?: Record<string, number>;
}

// --- Conversation Stats ---------------------------

export interface ConversationStats {
  totalCost?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  requestCount?: number;
  models?: string[];
  modalities?: Record<string, number>;
  toolCounts?: Record<string, number>;
  totalElapsedTime?: number;
  avgTokensPerSec?: number;
  avgTimeToGeneration?: number;
  totalCacheReadInputTokens?: number;
  totalCacheCreationInputTokens?: number;
  totalReasoningOutputTokens?: number;
  requestErrorCount?: number;
  orchestrator?: ConversationStats;
  subAgents?: ConversationStats;
  providers?: string[];
}

// --- Token Usage --------------------------------------------

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningOutputTokens?: number;
  /**
   * Authoritative pre-summed prompt tokens from the server
   * (new + cache_read + cache_write). Prefer this over re-deriving the sum.
   */
  totalInputTokens?: number;
  requests?: number;
}

// --- Conversations ------------------------------------------

/** Where a forked conversation came from (POST /conversations/:id/fork). */
export interface ForkLineage {
  conversationId: string;
  messageId: string;
  /** "at": copied through that message; "before": an edit-as-branch fork stopping just before it. */
  position?: "at" | "before";
  title?: string;
  forkedAt?: string;
}

export interface ConversationMeta {
  title?: string;
  project?: string;
  agent?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  synthetic?: boolean;
  settings?: PrismSettings;
}

/** Sources a grounded answer cited (Gemini Google Search grounding). */
export interface MessageCitations {
  sources: Array<{ url: string; title: string }>;
  queries?: string[];
  supports?: Array<{ text: string; sources: number[] }>;
}

export interface Message {
  /** Server-assigned id — the anchor for rewind and fork. Absent until persisted. */
  id?: string;
  role: (typeof MESSAGE_ROLES)[keyof typeof MESSAGE_ROLES];
  content: string;
  rawContent?: string;
  images?: string[];
  files?: FileAttachment[];
  model?: string;
  provider?: string;
  thinking?: string;
  toolCalls?: ToolCallEvent[];
  webSearchResults?: WebSearchResult[];
  /** Sources a grounded answer cited — rendered small under the answer. */
  citations?: MessageCitations;
  timestamp?: string;
  _id?: ObjectId;

  // --- Server-enriched fields -------------------------------
  /** Provider-reported usage stats (set on completion) */
  usage?: TokenUsage;
  estimatedCost?: number;
  /** Time from request to first token (seconds) */
  timeToGeneration?: number;
  /** When this assistant message completed */
  completedAt?: string;

  // --- Modality fields --------------------------------------
  audio?: string | string[];
  image?: string;
  documents?: Array<{ name?: string; data?: string; mimeType?: string }>;
  liveTranscription?: boolean;

  // --- Live streaming metadata (client-side, prefixed with _) -
  /** Intermediate usage from per-iteration backend events */
  _intermediateUsage?: TokenUsage;
  /** Backend-computed estimatedCost from per-iteration usage_update events */
  _intermediateEstimatedCost?: number | null;
  /** Backend-computed tok/s from ConversationGenerationTracker */
  _liveGenProgress?: {
    outputTokens?: number;
    tokensPerSecond?: number;
    /** Live server-estimated cost of the in-flight generation (USD) */
    estimatedCost?: number | null;
  };
  _streamingStartTime?: number;
  _streamingLastChunkTime?: number;
  _streamingBurstTokens?: number;
  _streamingBurstElapsed?: number;
  _streamingOutputCharacters?: number;
  /** performance.now() when processing phase started */
  _processingStartTime?: number;
  /** Current phase of in-flight message */
  statusPhase?: string;
  /** Server-computed TTFT samples (seconds[]) from generation_started events */
  _ttftSamples?: number[];
  /** Sub-agent live generation progress (keyed by subAgentId) */
  _subAgentGenerationProgress?: Record<string, SubAgentGenerationProgress>;
  /** Accumulated sub-agent tokens (from sub_agent_status complete events) */
  _subAgentTokens?: {
    input?: number;
    output?: number;
    requests?: number;
  };
  /** Server-side generation parameters snapshot */
  generationSettings?: GenerationSettings;
  /** Incremental background usage (memory extraction, embedding) */
  _backgroundUsage?: BackgroundUsage;
  deleted?: boolean;
  _liveStreaming?: boolean;
  contentSegments?: ContentSegment[];
  thinkingFragments?: string[];
  textFragments?: string[];
  video?: string | string[];
  pdf?: string | string[];
  error?: string;
  totalTime?: number;
  tokensPerSec?: number;
  /** Accumulated thinking phase duration in seconds (from backend). */
  thinkingDurationSeconds?: number;
  /** Accumulated content generation phase duration in seconds (from backend). */
  contentDurationSeconds?: number;
  voice?: string;
  tool_call_id?: string;
  toolCallId?: string;
  tool_calls?: Array<{
    id: string;
    name?: string;
    args?: string | Record<string, JsonValue>;
    result?: string;
    status?: string;
    function?: {
      name?: string;
      arguments?: string | Record<string, JsonValue>;
    };
  }>;
  /** Notification origin — identifies system-generated messages for deterministic detection.
   *  Values: "orchestrator" | "timer" | "async-task". Absent on real user messages. */
  _notificationSource?: string;
  /** Idempotency key — prevents duplicate notification persistence during race conditions. */
  _notificationId?: string;
  /**
   * Mid-turn input (steering update / question answer) — set on the user
   * bubble. Persisted ones carry `_notificationSource: "user-update" |
   * "user-answer"` and wrap `content` in `<user-update>` / `<user-answer>`
   * tags; render `rawContent` (the text the user typed), never the wrapper.
   */
  _turnInput?: MessageTurnInput;
  /**
   * Input from outside the conversation — a webhook, a Discord user who is
   * not the owner, an MCP server, a sub-agent (prism-service
   * external/ExternalInput). Never the user's words: rendered as an external
   * block, `rawContent` its text, `content` the model's envelope.
   */
  _external?: ExternalOrigin;
}

/** Where an external input came from. `sender` is a label, not an identity. */
export type ExternalInputSource = NonNullable<TurnInputEvent["source"]>;
export interface ExternalOrigin {
  source: ExternalInputSource;
  sender?: string;
}

export interface Conversation {
  _id: ObjectId;
  id?: string;
  title?: string;
  forkedFrom?: ForkLineage | null;
  messages: Message[];
  project?: string;
  agent?: string;
  model?: string;
  provider?: string;
  traceId?: string;
  systemPrompt?: string;
  stats?: ConversationStats;
  settings?: PrismSettings;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  totalCost?: number;
  isGenerating?: boolean;
  /** Persisted active-session flag from agent_conversations — false means the session explicitly ended */
  isActive?: boolean;
  username?: string;
  /** Marker for synthetic / test conversations */
  synthetic?: boolean;
  /** Backend-enriched: unique model names from request logs */
  modelNames?: string[];
  /** Live-patched model names during active generation */
  _liveModelNames?: string[];
  /** Backend-enriched: unique providers from request logs */
  providers?: string[];
  /** Backend-enriched: modality usage counts (textIn, imageOut, etc.) */
  modalities?: Record<string, number>;
  /** Backend-enriched: authoritative input token count */
  inputTokens?: number;
  /** Backend-enriched: authoritative output token count */
  outputTokens?: number;
  /** Backend-enriched: tool call counts by tool name */
  toolCounts?: Record<string, number>;
  /** Backend-enriched: parent agent conversation ID if spawned as sub-agent */
  parentAgentConversationId?: string | null;
  /** Backend-enriched: parent conversation document ID for tree grouping */
  parentConversationId?: string | null;
  /** Backend-enriched: true if this conversation has spawned sub-agents */
  hasSubAgents?: boolean;
  /** Backend-enriched: count of requests with errors (success === false) */
  requestErrorCount?: number;
  /** Count of async background tasks in-flight (sub-agents, long-running tools, etc.) */
  pendingBackgroundTasks?: number;
  /** Backend-authoritative zero-based spawn index within a team of sub-agents */
  agentIndex?: number | null;
  /** Backend-serialized display-ready messages (tool results merged, empty stubs filtered) */
  displayMessages?: Message[];
  /** Backend-computed canonical activity state — use for snapshot data only; live surfaces re-derive from SSE-patched fields */
  state?: import("../utils/agentConversationStates").AgentConversationState;
  /** Long-running objective, if one was set (`PUT /conversations/:id/goal`). */
  goal?: ConversationGoal | null;
  /** Tool calls waiting for the user's approval (live: patched by `conversation_attention` changes) */
  pendingApprovalCount?: number;
  /** Questions waiting for the user's answer */
  pendingQuestionCount?: number;
  /** ISO time the oldest pending approval/question started waiting */
  awaitingSince?: string | null;
}

export interface ConversationListResponse {
  items: Conversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Agent Conversations -----------------------------------------

export interface AgentConversation {
  _id: ObjectId;
  id?: string;
  forkedFrom?: ForkLineage | null;
  /** Long-running objective, if one was set (`PUT /conversations/:id/goal`). */
  goal?: ConversationGoal | null;
  project: string;
  agent?: string;
  model?: string;
  provider?: string;
  status?: string;
  messages: Message[];
  title?: string;
  traceId?: string;
  systemPrompt?: string;
  stats?: ConversationStats;
  settings?: PrismSettings;
  createdAt: string;
  updatedAt: string;
  parentAgentConversationId?: string | null;
  parentConversationId?: string | null;
  hasSubAgents?: boolean;
  /** Count of async background tasks in-flight (sub-agents, long-running tools, etc.) */
  pendingBackgroundTasks?: number;
  /** Persisted active-session flag from agent_conversations — false means the session explicitly ended */
  isActive?: boolean;
  /** Backend-authoritative zero-based spawn index within a team of sub-agents */
  agentIndex?: number | null;
  /** Backend-serialized display-ready messages (tool results merged, empty stubs filtered) */
  displayMessages?: Message[];
  /** Tool calls waiting for the user's approval (live: patched by `conversation_attention` changes) */
  pendingApprovalCount?: number;
  /** Questions waiting for the user's answer */
  pendingQuestionCount?: number;
  /** ISO time the oldest pending approval/question started waiting */
  awaitingSince?: string | null;
}

export interface AgentConversationListResponse {
  items: AgentConversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Stream events (the event protocol) -----------------------

/**
 * Every event of a conversation turn stream (SSE /agent, /chat; the
 * /ws/chat WebSocket) is a `TurnEvent`; the synthesis stream's are
 * `SynthesisEvent`s. Both come from `./protocol/events`, a byte-identical
 * copy of prism-service's `src/protocol/events.ts` (see its header).
 */
export type {
  TurnEvent,
  TurnEventType,
  TurnEventOf,
  SynthesisEvent,
  HelloEvent,
  ErrorEvent,
  ChunkEvent,
  ThinkingEvent,
  ImageEvent,
  AudioEvent,
  UserMessageEvent,
  SubscribedEvent,
  RefusalEvent,
  ToolExecutionEvent,
  ToolOutputEvent,
  ApprovalRequiredEvent,
  ApprovalDecidedEvent,
  PlanProposalEvent,
  UserQuestionEvent,
  TurnInputEvent,
  GoalUpdateEvent,
  TodoUpdateEvent,
  BriefUpdateEvent,
  UsageUpdateEvent,
  ContextBudgetEvent,
  TaskNotificationEvent,
  ConversationStateUpdateEvent,
  PermissionModeEvent,
  SubAgentStatusEvent,
  SubAgentToolExecutionEvent,
  SubAgentToolOutputEvent,
  StatusEvent,
  KnownStatusEvent,
  NoticeStatusEvent,
  DoneEvent,
} from "./protocol/events";

/**
 * The benchmark run stream (POST /benchmark/:id/run, GET /:id/follow) is
 * endpoint-specific, not part of the event protocol: these four framing
 * events, plus each model's turn events forwarded with `_sourceModel`.
 */
export type BenchmarkStreamEvent =
  | { type: "run_info"; totalModels: number }
  | { type: "model_start"; provider: string; model: string; label?: string; isLocal?: boolean }
  | ({ type: "model_complete" } & BenchmarkRunResult)
  | ({ type: "run_complete" } & BenchmarkRun);

/** Everything `PrismService._streamSSE` hands the dispatcher. */
export type StreamEvent = TurnEvent | SynthesisEvent | BenchmarkStreamEvent;

/** The synthesis stream's `done`. */
export type SynthesisDoneEvent = Extract<SynthesisEvent, { type: "done" }>;

/** A benchmark framing event by `type`. */
export type BenchmarkStreamEventOf<Type extends BenchmarkStreamEvent["type"]> = Extract<
  BenchmarkStreamEvent,
  { type: Type }
>;

/** An `error` event, as the Error handed to `onError`. */
export class StreamError extends Error {
  readonly code: ErrorEvent["code"];
  readonly retryable: boolean;
  readonly provider?: string;
  readonly status?: number;

  constructor(event: ErrorEvent) {
    super(event.message);
    this.name = "StreamError";
    this.code = event.code;
    this.retryable = event.retryable;
    this.provider = event.provider;
    this.status = event.status;
  }
}

/** One option of an agent question (`ask_user`); `preview` is optional detail shown on hover. */
export interface UserQuestionOption {
  label: string;
  preview?: string | null;
}

/**
 * An MCP server asking for input mid-call. A form is rendered from
 * `requestedSchema` (flat: string / number / integer / boolean / enum /
 * multi-select), a URL request shows the link. The answer is
 * `{ answer: "accept" | "decline" | "cancel", content? }`.
 */
export interface McpElicitationRequest {
  server: string;
  mode: "form" | "url";
  requestedSchema?: {
    type?: string;
    properties?: Record<string, McpElicitationField>;
    required?: string[];
  };
  url?: string;
}

export interface McpElicitationField {
  type?: "string" | "number" | "integer" | "boolean" | "array";
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  enumNames?: string[];
  oneOf?: Array<{ const: string; title?: string }>;
  items?: { type?: string; enum?: string[]; anyOf?: Array<{ const: string; title?: string }> };
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
}

/** One question inside a `user_question` event. */
export interface UserQuestionItem {
  question: string;
  header?: string | null;
  options: UserQuestionOption[];
  multiSelect?: boolean;
  /** Present when the question is an MCP server's elicitation. */
  elicitation?: McpElicitationRequest;
}

/** Where in the agentic loop a mid-turn input was applied. */
export type TurnInputBoundary = TurnInputEvent["boundary"];

/** What a mid-turn input was. */
export type TurnInputKind = TurnInputEvent["kind"];

/** Client-side tracking of a mid-turn input on its user bubble. */
export interface MessageTurnInput {
  /** Local temp id until the server's `inputId` replaces it. */
  id: string;
  kind: TurnInputKind;
  receivedAt?: string;
  /** Client lifecycle: sending → pending → applied (persisted ones are applied). */
  status?: "sending" | "pending" | "applied";
  boundary?: TurnInputBoundary;
  iteration?: number;
  /** `external` only: where it came from. */
  source?: ExternalInputSource;
  sender?: string;
}

export interface ConversationGoalBudget {
  maxCostDollars?: number;
  maxTurns?: number;
  /** ISO timestamp */
  deadline?: string;
}

/** `proposed` only on a goal the model proposed, waiting for approval. */
export type ConversationGoalStatus = "active" | "paused" | "completed" | "blocked" | "proposed";

/** One criterion of a goal's rubric — what the verifier checks. */
export interface GoalCriterion {
  id: string;
  criterion: string;
}

export interface GoalVerifierModel {
  provider: string;
  model: string;
}

/** Why a goal is paused — every pause records one. */
export type GoalPauseReason =
  | "budget"
  | "max_iterations"
  | "empty_continuations"
  | "user_message"
  | "restart"
  | "failed"
  | "user";

/** The goal verifier's last verdict, per criterion. */
export interface GoalVerification {
  verdict: "satisfied" | "needs_revision" | "failed";
  criteria: Array<{ id: string; pass: boolean; evidence: string }>;
  reason?: string;
  /** 1-based round since the goal was last (re)activated. */
  iteration: number;
  verifier: GoalVerifierModel;
  costDollars: number;
  at: string;
}

/** Persisted long-running objective for a conversation (`/conversations/:id/goal`). */
export interface ConversationGoal {
  objective: string;
  completionCriteria?: string;
  rubric?: GoalCriterion[];
  stepRubric?: GoalCriterion[];
  /** Absent = the default verifier (a model on another provider). */
  verifier?: GoalVerifierModel;
  maxIterations?: number;
  budget?: ConversationGoalBudget;
  /** What the agent goes without while it works on the goal on its own — `{ network: false }`. */
  capabilities?: Record<string, boolean>;
  progress: {
    summary: string;
    percent?: number | null;
    updatedAt: string;
  };
  blockedOn?: string | null;
  status: ConversationGoalStatus;
  pause?: { reason: GoalPauseReason; detail?: string; at: string } | null;
  verification?: GoalVerification | null;
  verificationRounds?: number;
  continuingSince?: string | null;
  spentDollars: number;
  turnsUsed: number;
  createdAt: string;
  updatedAt: string;
}

/** What the goal form sends: PUT creates, PATCH edits in place. */
export interface ConversationGoalInput {
  objective: string;
  /** Existing criteria keep their ids; new ones get theirs from the service. */
  rubric: Array<{ id?: string; criterion: string }>;
  /** null = back to the default verifier (PATCH). */
  verifier?: GoalVerifierModel | null;
  maxIterations?: number;
  /** null = no budget (PATCH). */
  budget?: ConversationGoalBudget | null;
}

export interface ContextBudget {
  contextWindow: number;
  messageTokens: number;
  systemPromptTokens: number;
  toolSchemaTokens: number;
  skillTokens?: number;
  safetyMarginTokens: number;
  totalInputTokens: number;
  availableOutputTokens: number;
  requestedOutputTokens?: number;
  isClamped: boolean;
  toolCount: number;
  source?: "estimated" | "reported";
  lastReportedInputTokens?: number;
  calibrationRatio?: number;
}

export interface TransformedRequestItem {
  _id: string;
  requestId?: string;
  createdAt?: string;
  project?: string;
  endpoint?: string;
  operation?: string;
  harness?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  tokensPerSec?: number;
  totalTime?: number;
  success?: boolean;
  conversationId?: string;
  requestPayload?: Record<string, JsonValue>;
  responsePayload?: Record<string, JsonValue>;
  modalities?: Record<string, number | boolean> | null;
  toolDisplayNames?: string[];
  toolApiNames?: string[];
  errorMessage?: string | null;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningOutputTokens?: number;
  timeToGeneration?: number;
  generationTime?: number;
  agent?: string;
  agentConversationId?: string;
  parentAgentConversationId?: string | null;
  username?: string;
  inputCharacters?: number;
  outputCharacters?: number;
  messageCount?: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  /** Backend-reconstructed display-ready chat preview (GET /requests/:id only) */
  displayMessages?: Message[];
  /** Backend-extracted system prompt accompanying displayMessages */
  displaySystemPrompt?: string;
  [key: string]: unknown;
}

export interface SSECallbacks {
  onChunk?: (
    _content: string,
    _sourceModel?: string,
    _outputCharacters?: number,
  ) => void;
  onThinking?: (
    _content: string,
    _sourceModel?: string,
    _outputCharacters?: number,
  ) => void;
  onImage?: (_data: string, _mimeType: string, _minioRef?: string) => void;
  onAudio?: (_data: string, _mimeType: string) => void;
  onExecutableCode?: (_code: string, _language: string) => void;
  onCodeExecutionResult?: (_output: string, _outcome: string) => void;
  onWebSearchResult?: (_results: WebSearchResultItem[]) => void;
  onToolCall?: (_event: ToolCallEvent) => void;
  onToolExecution?: (_event: ToolExecutionEvent) => void;
  onToolOutput?: (_event: ToolOutputEvent) => void;
  onSubAgentToolExecution?: (_event: SubAgentToolExecutionEvent) => void;
  onSubAgentToolOutput?: (_event: SubAgentToolOutputEvent) => void;
  onSubAgentStatus?: (_event: SubAgentStatusEvent) => void;
  onApprovalRequired?: (_event: ApprovalRequiredEvent) => void;
  /** One pending call was decided — here, in another tab, by a batch scope or a timeout (`approval_decided`) */
  onApprovalDecided?: (_event: ApprovalDecidedEvent) => void;
  onPlanProposal?: (_event: PlanProposalEvent) => void;
  onUserQuestion?: (_event: UserQuestionEvent) => void;
  /** Turn-start mirror of the user's prompt (`user_message` event) */
  onUserMessage?: (_event: UserMessageEvent) => void;
  onTaskNotification?: (_event: TaskNotificationEvent) => void;
  onConversationStateUpdate?: (_event: ConversationStateUpdateEvent) => void;
  onTodoUpdate?: (_event: TodoUpdateEvent) => void;
  onBriefUpdate?: (_event: BriefUpdateEvent) => void;
  /** A mid-turn input was applied by the harness (`turn_input` event) */
  onTurnInput?: (_event: TurnInputEvent) => void;
  /** The conversation goal was set / progressed / paused / cleared (`goal_update`) */
  onGoalUpdate?: (_event: GoalUpdateEvent) => void;
  /** `permission_mode` — the conversation's permission mode is now `mode`. */
  onPermissionMode?: (_event: PermissionModeEvent) => void;
  onRunInfo?: (_event: BenchmarkStreamEventOf<"run_info">) => void;
  onModelStart?: (_event: BenchmarkStreamEventOf<"model_start">) => void;
  onModelComplete?: (_event: BenchmarkStreamEventOf<"model_complete">) => void;
  onRunComplete?: (_event: BenchmarkStreamEventOf<"run_complete">) => void;
  onUsageUpdate?: (_event: UsageUpdateEvent) => void;
  onContextBudget?: (_event: ContextBudgetEvent) => void;
  onStatus?: (_event: StatusEvent) => void;
  /** Synthesis stream (/synthesis/generate): run started, conversation allocated */
  onSynthesisStart?: (_conversationId: string) => void;
  /** Synthesis stream: a user/assistant turn begins — subsequent chunk/thinking events belong to it */
  onTurnStart?: (_role: string, _index: number) => void;
  /** Synthesis stream: turn finished with its canonical message */
  onTurnComplete?: (_message: Message, _role: string) => void;
  onDone?: (_event: DoneEvent | SynthesisDoneEvent) => void;
  /** A stream failure. An `error` event arrives as a `StreamError` carrying its code and retryability. */
  onError?: (_error: Error) => void;
  /**
   * The transport closed without the server sending a terminal done/error
   * event — network EOF (server crash mid-turn) or a stalled socket that
   * produced no bytes past the watchdog window. Consumers waiting on
   * onDone must treat this as end-of-stream.
   */
  onStreamClosed?: (_info: { reason: "eof-without-done" | "stalled" }) => void;
  /** The stream was torn down by the caller's abort handle (user stop). */
  onAborted?: () => void;
}

export interface ContentSegment {
  type: "thinking" | "tools" | "text" | "plan" | "audio" | "image";
  /** For text/thinking: index into the fragments array. For audio/image: index into message.audio/message.images. */
  fragmentIndex?: number;
  toolIds?: string[];
}

// --- Tool Calls ---------------------------------------------

export interface ToolCallEvent {
  id: string;
  tool_call_id?: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: string;
  thoughtSignature?: string;
  _sourceModel?: string;
  timestamp?: number;
  durationMs?: number;
}

// --- Web Search ---------------------------------------------

/** One `webSearchResult` item as the wire sends it (Anthropic server-side web search). */
export type WebSearchResultItem = TurnEventOf<"webSearchResult">["results"][number];

/** A search result kept as a turn's source: an item that has a URL. */
export interface WebSearchResult {
  url: string;
  title?: string;
  pageAge?: string;
}

// --- Files / Attachments ------------------------------------

/**
 * A non-image attachment on a sent message. Files are uploaded to
 * MinIO at send time — `url` is the resolved (or minio://) reference
 * the backend and renderers consume. `modality` is the input modality
 * bucket the file was classified into at intake (audio | video | pdf |
 * document); optional because messages persisted before the modality
 * plumbing lack it.
 */
export interface FileAttachment {
  name: string;
  mimeType: string;
  url: string;
  modality?: string;
  /** File size in bytes, captured at intake; absent on older messages. */
  sizeBytes?: number;
}


// --- Custom Agents ------------------------------------------

/**
 * Serialized policy format — stored in MongoDB and sent over the wire.
 * The `when` predicate function is reconstructed on the backend from
 * the `pattern` and `field` values.
 */
export interface SerializedPolicy {
  /** Tool name this policy targets, or "*" for all tools. */
  tool: string;
  /** The outcome: APPROVE, DENY, or ASK_USER. */
  decision: "APPROVE" | "DENY" | "ASK_USER";
  /** Human-readable label. */
  name?: string;
  /** Regex pattern to test against the argument field. */
  pattern?: string;
  /** Which argument field to test the pattern against (default: "command"). */
  field?: string;
}

export interface CustomAgent {
  _id?: ObjectId;
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  icon?: string;
  avatar?: string;
  color?: string;
  backgroundImage?: string;
  project?: string;
  enabledTools?: string[];
  availableTools?: string[];
  enabledByDefaultTools?: string[];
  /** Declarative tool call policies for this agent. */
  policies?: SerializedPolicy[];
  custom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// --- Agent Personas (from /config/agents) -------------------

export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  custom: boolean;
  icon: string;
  avatar: string;
  color: string;
  backgroundImage: string;
  project?: string;
  toolCount: number;
  enabledToolNames: string[];
  enabledByDefaultToolNames: string[];
  coreToolsLocked: boolean;
  canSpawnSubAgents: boolean;
  usesDirectoryTree: boolean;
  usesCodingGuidelines: boolean;
}

// --- Skills -------------------------------------------------

export interface Skill {
  _id?: ObjectId;
  id?: string;
  name: string;
  description?: string;
  project?: string;
  template: string;
  /** Alias used by the skills panel for the template body */
  content?: string;
  variables?: Record<string, string>;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// --- Rules (Per-Agent Slash Commands) -----------------------

export interface Rule {
  _id?: ObjectId;
  id?: string;
  name: string;
  description?: string;
  content?: string;
  agent: string;
  project?: string;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// --- Hooks (Configurable Lifecycle Handlers) ----------------

/** Lifecycle point a hook fires on. Mirrors prism-service's HOOK_EVENTS. */
export type HookEventName =
  | "SessionStart"
  | "TurnStart"
  | "UserPromptSubmit"
  | "InstructionsLoaded"
  | "PreModelSwitch"
  | "PostModelSwitch"
  | "PreToolUse"
  | "PermissionRequest"
  | "PermissionDenied"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "Stop"
  | "StopFailure"
  | "Interrupt"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PostCompact"
  | "Notification"
  | "TurnEnd"
  | "SessionEnd"
  | "Error";

/**
 * Every hook event, in the order they happen in a turn — the single source
 * the UI picker reads so the list is never duplicated per-component.
 */
export const HOOK_EVENT_NAMES: HookEventName[] = [
  "SessionStart",
  "TurnStart",
  "UserPromptSubmit",
  "InstructionsLoaded",
  "PreModelSwitch",
  "PostModelSwitch",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Stop",
  "StopFailure",
  "Interrupt",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
  "TurnEnd",
  "SessionEnd",
  "Error",
];

/** Ask a model for the decision. */
export interface HookPromptHandler {
  type: "prompt";
  prompt: string;
  provider?: string;
  model?: string;
}

/** POST the event payload to a URL and use the response as the decision. */
export interface HookHttpHandler {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

/** Call an MCP tool and use its result as the decision. */
export interface HookMcpToolHandler {
  type: "mcp_tool";
  server: string;
  tool: string;
  input?: Record<string, unknown>;
}

/**
 * Run a shell command with the event JSON on stdin (exit 2 blocks). Executed
 * by tools-service in the owner's hooks directory, with its privileges — so
 * only owner-listed usernames may create one.
 */
export interface HookCommandHandler {
  type: "command";
  command: string;
  /** What a timeout means on a blocking event. Default `fail_open`. */
  timeoutBehavior?: "fail_open" | "fail_closed";
}

/** Experimental: a no-tools verifier that sees the payload and the transcript. */
export interface HookAgentHandler {
  type: "agent";
  prompt: string;
  provider?: string;
  model?: string;
}

export type HookHandlerConfig =
  | HookPromptHandler
  | HookHttpHandler
  | HookMcpToolHandler
  | HookCommandHandler
  | HookAgentHandler;

export interface Hook {
  _id?: ObjectId;
  id?: string;
  name: string;
  description?: string;
  event: HookEventName;
  /**
   * Narrows which occurrences fire the hook. On tool events: a tool name,
   * `A|B`, a regex, or `Tool(argPattern)` (e.g. `execute_shell(git *)`). On a
   * few others (SessionStart, StopFailure, …) it matches one payload field.
   */
  matcher?: string;
  handler: HookHandlerConfig;
  /** null = every agent. */
  agent?: string | null;
  enabled?: boolean;
  /** Runs in the background: never blocks; its context arrives at the next boundary. */
  async?: boolean;
  timeoutMilliseconds?: number;
  project?: string;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Result of a one-off hook dry run. */
export interface HookTestResult {
  decision: Record<string, unknown> | null;
  durationMilliseconds: number;
  error?: string;
  /** The payload the handler actually received. */
  payload?: Record<string, unknown>;
}

// --- Project Instructions (PRISM.md) ------------------------

/** The single self-updating markdown doc for a scope. */
export interface ProjectInstructions {
  id?: string;
  content: string;
  version: number;
  /** null = the project-wide doc rather than an agent-specific one. */
  agent?: string | null;
  updatedBy?: "user" | "agent";
  createdAt?: string;
  updatedAt?: string;
}

/** A superseded revision, kept for the history list and rollback. */
export interface ProjectInstructionsVersion {
  version: number;
  content: string;
  updatedBy?: string;
  updatedAt?: string;
  closedReason?: string;
}

// --- Agent Memories -----------------------------------------

export interface AgentMemory {
  _id: ObjectId;
  id?: string;
  type?: string;
  title?: string | null;
  content: string;
  project?: string;
  agent?: string;
  /**
   * Where the memory came from (prism-service memory/MemoryProvenance):
   * user | assistant | web | subagent | tool:<name> | mcp:<server>.
   * Missing on memories written before provenance — read as "assistant".
   */
  source?: string;
  trust?: MemoryTrust;
  /** Learned from untrusted content: never recalled until the user accepts it. */
  quarantined?: boolean;
  reviewDecision?: MemoryReviewDecision | null;
  createdAt: string;
  updatedAt?: string;
  // Discord (LUPOS) memories: who the fact is about and who revealed it
  username?: string | null;
  guildId?: string;
  channelId?: string;
  aboutUserId?: string;
  aboutUsername?: string;
  sourceUserId?: string;
  sourceUsername?: string;
  confidence?: number;
  sourceMessageId?: string;
  // Bi-temporal validity — set when a memory is superseded/invalidated
  // (soft-closed) by consolidation rather than deleted.
  validTo?: string | null;
  supersededBy?: string | null;
  closedReason?: string | null;
}

export type MemoryTrust = "user" | "derived" | "untrusted";

/** "corroborated": the user later said the same thing in their own words. */
export type MemoryReviewDecision = "accepted" | "rejected" | "corroborated";

export interface AgentMemoryListResponse {
  memories: AgentMemory[];
  total: number;
}

export interface MemoryTypeFacet {
  type: string;
  count: number;
}

export interface MemoryUserFacet {
  userId: string;
  username?: string | null;
  count: number;
}

export interface AgentMemoryFacets {
  types: MemoryTypeFacet[];
  aboutUsers: MemoryUserFacet[];
  sourceUsers: MemoryUserFacet[];
  /** Quarantined memories waiting for Accept / Reject. */
  pendingReview?: number;
}

export interface ConsolidationHistoryEntry {
  _id?: string;
  runId?: string;
  project?: string;
  trigger?: string;
  runAt?: string;
  createdAt?: string;
  summary?: string;
  actionsApplied?: number;
  merged?: number;
  created?: number;
  memoriesBefore?: number;
  memoriesAfter?: number;
  durationMs?: number;
  // Soft-close bookkeeping — presence enables rollback
  closedIds?: string[];
  createdIds?: string[];
  rolledBackAt?: string | null;
}

export interface ConsolidationHistoryResponse {
  history: ConsolidationHistoryEntry[];
}

export interface ConsolidateResult {
  skipped?: boolean;
  reason?: string;
  actionsApplied?: number;
  merged?: number;
  summary?: string;
}

export type MemoryType = "user" | "feedback" | "project" | "reference";

// --- Workflow Memories (AWM) --------------------------------

export interface WorkflowStep {
  toolName: string;
  isSuccess: boolean;
  keyArguments: Record<string, string>;
}

export interface WorkflowMemory {
  _id: ObjectId;
  conversationId: string;
  agentConversationId: string;
  project: string;
  username: string;
  agent: string;
  userRequest: string;
  stepCount: number;
  steps: WorkflowStep[];
  summary: string;
  createdAt: string;
}

export interface WorkflowMemoryListResponse {
  workflows: WorkflowMemory[];
  total: number;
}

// --- Settings -----------------------------------------------

export interface MemoryConfig {
  extractionProvider?: string;
  extractionModel?: string;
  consolidationProvider?: string;
  consolidationModel?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
}

export interface AgentDefaultsConfig {
  /** Role models (prism-service routing/RoleModelResolver). */
  mainProvider?: string;
  mainModel?: string;
  subAgentProvider?: string;
  subAgentModel?: string;
  /** "" = one step below the parent (effort first), "inherit", or a level. */
  subAgentEffort?: string;
  oracleProvider?: string;
  oracleModel?: string;
  compactionProvider?: string;
  compactionModel?: string;
  classifierProvider?: string;
  classifierModel?: string;
  /** "" or "lead_sidekick". */
  routingPreset?: string;
  criticProvider?: string;
  criticModel?: string;
  reminderProvider?: string;
  reminderModel?: string;
  harness?: string;
  topology?: string;
  dynamicToolActivation?: boolean;
  thoughtStructure?: string;
  workspaceEnabled?: boolean;
  locale?: string;
}

export interface SecurityConfig {
  allowEnvFiles?: boolean;
}

export interface PrismSettings {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  thinkingLevel?: string;
  thinkingBudget?: string;
  webSearchEnabled?: boolean;
  verbosity?: string;
  reasoningSummary?: string;
  minP?: number;
  repeatPenalty?: number;
  seed?: string | number | null;
  voice?: string;
  liveVoice?: string;
  liveThinkingLevel?: string;
  forceImageGeneration?: boolean;
  functionCallingEnabled?: boolean;
  urlContextEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  /** OpenAI structured output format */
  responseFormat?: string;
  /** OpenAI service tier (e.g. "auto", "default") */
  serviceTier?: string;
  /** Memory extraction/consolidation/embedding model config */
  memory?: MemoryConfig;
  /** Per-agent default provider/model overrides */
  agents?: AgentDefaultsConfig;
  /** Security and sandboxing preferences */
  security?: SecurityConfig;
  /** Creative tools configuration (image generation & vision) */
  creative?: CreativeConfig;
  /** Somatic state emotion analysis model config */
  somatic?: SomaticConfig;
  /** Workspace agent connection config */
  workspace?: WorkspaceConfig;
}

export interface WorkspaceConfig {
  agentSecret?: string;
}

export interface CreativeConfig {
  imageProvider?: string;
  imageModel?: string;
  visionProvider?: string;
  visionModel?: string;
  textToSpeechProvider?: string;
  textToSpeechModel?: string;
  speechToTextProvider?: string;
  speechToTextModel?: string;
}

export interface SomaticConfig {
  emotionProvider?: string;
  emotionModel?: string;
}

// --- MCP Servers --------------------------------------------

export interface MCPServer {
  _id?: ObjectId;
  id?: string;
  name: string;
  displayName?: string;
  url: string;
  project?: string;
  transport?: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[] | string;
  env?: Record<string, string>;
  connected?: boolean;
  toolCount?: number;
  tools?: Array<{ name: string; description?: string }>;
  enabled?: boolean;
  headers?: Record<string, string>;
  /** Seeded by the deployment — every profile sees it; not editable here. */
  shared?: boolean;
  /** Owner-set: lets a tool's readOnlyHint lower it to the AUTO tier. */
  trusted?: boolean;
  /** Protocol negotiation: `auto` probes for 2026-07-28, falls back to 2025. */
  protocol?: "auto" | "legacy" | "2026-07-28";
  /** Cap on one tool result, in tokens (server default). */
  outputCapTokens?: number | null;
  toolOutputCapTokens?: Record<string, number>;
  /** What the last connection negotiated. */
  protocolVersion?: string | null;
  protocolEra?: string | null;
  /** Tools held back from the agent until the owner re-approves them. */
  quarantinedTools?: MCPQuarantinedTool[];
  /** OAuth 2.1 instead of static headers (HTTP transports). */
  auth?: { type: "oauth"; scope?: string | null } | null;
  /** The server's authorization state — present for OAuth servers. */
  oauth?: MCPOAuthStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface MCPOAuthStatus {
  status: "none" | "pending" | "authorized" | "failed";
  authorized: boolean;
  issuer?: string | null;
  expiresAt?: string | null;
  error?: string | null;
}

/** An MCP prompt, offered as a slash command in the composer. */
export interface MCPPrompt {
  server: string;
  name: string;
  title: string | null;
  description: string | null;
  arguments: Array<{ name: string; description: string | null; required: boolean }>;
}

/** An MCP resource, offered as an @-mention in the composer. */
export interface MCPResource {
  server: string;
  uri: string;
  name: string;
  description: string | null;
  mimeType: string | null;
}

export interface MCPQuarantinedTool {
  name: string;
  /** changed = definition differs from the approved one; new = appeared after approval; duplicate = name collision (can't be approved). */
  reason: "changed" | "new" | "duplicate";
  hash: string;
  description: string;
}

// --- Coordinator Sub-Agents ---------------------------------

export interface CoordinatorSubAgent {
  id: string;
  agentId?: string;
  agentConversationId: string;
  subAgentConversationId?: string;
  status: string;
  task?: string;
  description?: string;
  model?: string;
  resolvedModel?: string;
  provider?: string;
  startedAt?: string;
  completedAt?: string;
  phase?: string;
  currentTool?: string | null;
  durationMs?: number;
  totalCost?: number;
  toolCallCount?: number;
  branchName?: string;
  files?: string[];
  recursionDepth?: number;
  /** Backend-assigned conversation-scoped sequential spawn index (0-based). */
  globalSpawnIndex?: number;
  toolNames?: Record<string, number>;
}

// --- Favorites ----------------------------------------------

export interface Favorite {
  _id?: ObjectId;
  type: string;
  key: string;
  meta?: Record<string, string | number | boolean>;
  createdAt?: string;
}

// --- Tool Schemas -------------------------------------------

/** JSON Schema parameter definition */
export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  required?: string[];
  description?: string;
  enum?: Array<string | number | boolean | null>;
  default?: JsonValue;
  format?: string;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchemaObject;
  oneOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  allOf?: JsonSchemaObject[];
  $ref?: string;
  [key: string]: unknown;
}

export interface ToolSchema {
  name: string;
  description: string;
  emoji?: string | string[];
  domain?: string;
  domainKey?: string;
  system?: boolean;
  intelligenceTier?: "low" | "medium" | "high" | "frontier";
  inputModalities?: string[];
  parameters?: JsonSchemaObject;
  function?: {
    name: string;
    description?: string;
    parameters?: JsonSchemaObject;
  };
  display?: ToolDisplayMetadata;
}

// --- Benchmark Presets --------------------------------------

export interface BenchmarkPreset {
  name: string;
  category: string;
  description?: string;
  systemPrompt: string;
  prompt: string;
  assertions?: Array<{ expectedValue: string; matchMode: string }>;
  assertionOperator?: string;
  agentAssertions?: AgentBenchmarkAssertion[];
  agentAssertionOperator?: string;
  enabledTools?: string[];
}

// --- Benchmarks ---------------------------------------------

export interface BenchmarkPrompt {
  role: string;
  content: string;
}

export interface BenchmarkAssertion {
  expectedValue: string;
  matchMode: string;
}

export interface AgentBenchmarkAssertion {
  type?: string;
  operator?: string;
  operand?: string | number;
  /** Tool-scoped assertions (comma-separated list for tool_sequence) */
  toolName?: string;
  /** tool_sequence: require the exact full order */
  exactOrder?: boolean;
  expectedValue?: string;
  matchMode?: string;
  /** llm_judge: grading rubric */
  rubric?: string;
  /** llm_judge: optional "provider:model" judge override */
  judgeModel?: string;
}

export interface BenchmarkJudgeVerdict {
  passed: boolean;
  score?: number;
  reasoning?: string;
  model?: string;
  provider?: string;
  cost?: number;
  error?: string;
}

export interface BenchmarkAssertionResult {
  kind: "text" | "behavior";
  label: string;
  passed: boolean;
  actual?: string;
  error?: string;
  judge?: BenchmarkJudgeVerdict;
}

export interface Benchmark {
  _id: ObjectId;
  id?: string;
  name: string;
  description?: string;
  prompts?: BenchmarkPrompt[];
  models?: string[];
  latestRun?: BenchmarkRun;
  createdAt: string;
  updatedAt?: string;
  /** Single-prompt shorthand (server normalizes to `prompts[]`) */
  prompt?: string;
  systemPrompt?: string;
  benchmarkMode?: string;
  expectedValue?: string;
  matchMode?: string;
  assertions?: BenchmarkAssertion[];
  assertionOperator?: string;
  agentAssertions?: AgentBenchmarkAssertion[];
  agentAssertionOperator?: string;
  /** Tools exposed to tool-enabled targets during runs */
  enabledTools?: string[];
  /** Default repeated executions per target */
  trials?: number;
  tags?: string[];
  /** Aggregated cost across all runs (enriched at list time) */
  cumulativeCost?: number;
  /** Number of persisted runs (enriched at list time) */
  runCount?: number;
}

export interface BenchmarkRunResult {
  model: string;
  provider: string;
  response: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  /** LLM-judge spend for this result */
  judgeCost?: number;
  /** Wall-clock seconds (server-persisted) */
  latency?: number;
  latencyMs?: number;
  ttftMs?: number;
  tokensPerSecond?: number;
  error?: string;
  label?: string;
  display_name?: string;
  passed?: boolean;
  /** Per-assertion pass/fail breakdown */
  assertionResults?: BenchmarkAssertionResult[];
  turnCount?: number;
  /** Trial index (1-based) when a target ran multiple times */
  trial?: number;
  trialCount?: number;
  thinking?: string;
  toolCalls?: Array<{
    id?: string;
    name?: string;
    args?: unknown;
    result?: unknown;
    status?: string;
  }>;
  toolNames?: string[];
  thinkingEnabled?: boolean;
  toolsEnabled?: boolean;
  agent?: string;
}

export interface BenchmarkRunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  totalCost?: number;
}

export interface BenchmarkRun {
  _id: ObjectId;
  id?: string;
  benchmarkId: ObjectId;
  results?: BenchmarkRunResult[];
  models?: BenchmarkRunResult[];
  status?:
    | typeof EXECUTION_STATUS.PENDING
    | typeof EXECUTION_STATUS.RUNNING
    | typeof EXECUTION_STATUS.COMPLETED
    | typeof EXECUTION_STATUS.FAILED
    | "aborted";
  startedAt?: string;
  completedAt?: string;
  aborted?: boolean;
  /** Trials per target used for this run */
  trials?: number;
  summary?: BenchmarkRunSummary;
}

export interface BenchmarkListResponse {
  benchmarks: Benchmark[];
  count: number;
}

export interface BenchmarkBreakdown {
  name: string;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  latestPassed?: boolean;
  latestErrored?: boolean;
}

export interface BenchmarkModelStat {
  model: string;
  provider: string;
  label?: string;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  passRate: number;
  avgLatency: number;
  avgTtftMs?: number;
  totalCost: number;
  runCount?: number;
  runs?: number;
  avgLatencyMs?: number;
  avgTokensPerSecond?: number;
  avgCost?: number;
  thinkingEnabled?: boolean;
  toolsEnabled?: boolean;
  agent?: string | null;
  benchmarks?: BenchmarkBreakdown[];
}

export interface BenchmarkModelStats {
  models: BenchmarkModelStat[];
  totalModels: number;
  totalBenchmarks: number;
}

// --- VRAM Benchmarks ----------------------------------------

export interface VramBenchmarkGpuTelemetry {
  name?: string;
  temp?: number;
  power?: string;
  utilization?: string;
}

export interface VramBenchmarkTtft {
  ms: number;
  prefillTokPerSec?: number;
}

export interface VramBenchmarkSystem {
  hostname: string;
  gpu?: VramBenchmarkGpuTelemetry;
  cpuRam?: {
    deltaMiB?: number;
  };
}

export interface VramBenchmarkSettings {
  label: string;
}

export interface VramBenchmarkVramDuringGen {
  peakGiB?: number;
}

export interface VramBenchmarkEntry {
  _id: ObjectId;
  model: string;
  displayName?: string;
  provider?: string;
  quantization?: string;
  architecture?: string;
  bitsPerWeight?: number;
  fileSizeGB?: number;
  contextLength: number;
  vramUsageGiB: number;
  modelVramGiB?: number;
  estimatedGiB?: number;
  fitsInVram?: boolean;
  tokensPerSecond?: number;
  ttft?: VramBenchmarkTtft;
  loadTimeMs?: number;
  hostname?: string;
  gpu?: string;
  gpuVramGB?: number;
  system?: VramBenchmarkSystem;
  settings?: VramBenchmarkSettings;
  vramDuringGen?: VramBenchmarkVramDuringGen;
  hysteresis?: {
    leakedMiB?: number;
  };
  generation?: {
    outputTokens?: number;
    totalTimeMs?: number;
  };
  createdAt?: string;
}

export interface VramBenchmarkMachine {
  hostname: string;
  gpu: string;
  gpuVramGB: number;
  gpuVendor?: string;
  cpu?: string;
  ramGiB?: number;
  platform?: string;
  benchmarkCount: number;
  lastRun: string;
}

// --- Workflows ----------------------------------------------

export interface WorkflowNodeConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export interface WorkflowConnection {
  id?: string;
  sourceNodeId: string;
  sourceModality: string;
  targetNodeId: string;
  targetModality: string;
}

export interface BuiltInToolReference {
  name: string;
  description?: string;
  enabled?: boolean;
}

export interface WorkflowNode {
  id: string;
  type?: string;
  label?: string;
  config?: WorkflowNodeConfig;
  position?: { x: number; y: number };
  inputTypes?: string[];
  outputTypes?: string[];
  supportedModalities?: string[];
  builtInTools?: Array<string | BuiltInToolReference>;
  disabledTools?: string[];
  receivedOutputs?: Record<string, unknown>;
  nodeType?: string;
  provider?: string;
  modelName?: string;
  modelType?: string;
  supportsSystemPrompt?: boolean;
  /** Primary modality of this node (e.g. "text", "image", "audio") */
  modality?: string | null;
  /** Raw input type definitions before normalization */
  rawInputTypes?: string[];
  /** Accumulated messages from node execution */
  messages?: Message[];

  // Dynamic/UI Fields
  displayName?: string | null;
  systemPrompt?: string;
  staticInputs?: Record<string, unknown>;
  customName?: string;
  content?: string | ArrayBuffer | Record<string, unknown> | null;
  contentType?: string | null;
}

export interface WorkflowEdge {
  id: string;
  source?: string;
  target?: string;
  label?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceModality?: string;
  targetModality?: string;
}

export type WorkflowNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface Workflow {
  _id?: ObjectId;
  id?: string;
  name: string;
  title?: string;
  description?: string;
  source?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  connections?: WorkflowEdge[];
  conversationIds?: string[];
  nodeResults?: Record<string, unknown>;
  nodeStatuses?: Record<string, WorkflowNodeStatus>;
  userContent?: string;
  createdAt?: string;
  updatedAt?: string;
  workflowName?: string;
  /** Aggregated cost across all nodes */
  totalCost?: number;
  /** Modality counts (e.g. { text: 3, image: 1 }) */
  modalities?: Record<string, number>;
  /** Providers used during execution */
  providers?: string[];
  /** User who created/ran the workflow */
  userName?: string;
}

// --- Synthesis ----------------------------------------------

export interface SynthesisRun {
  _id: ObjectId;
  id?: string;
  name?: string;
  title?: string;
  prompt?: string;
  systemPrompt?: string;
  userPersona?: string;
  category?: string;
  targetTurns?: number;
  seedMessages?: Array<{ role: string; content: string }>;
  settings?: PrismSettings;
  conversationId?: string;
  models?: Array<{ provider: string; model: string }>;
  results?: Array<{
    provider: string;
    model: string;
    response: string;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
    latencyMs?: number;
  }>;
  synthesis?: string;
  status?: string;
  createdAt: string;
}

// --- Media --------------------------------------------------

export interface MediaItem {
  _id: ObjectId;
  type: string;
  mimeType: string;
  data?: string;
  minioRef?: string;
  url?: string;
  prompt?: string;
  model?: string;
  provider?: string;
  conversationId?: ObjectId;
  createdAt: string;
}

export interface MediaListResponse {
  data: MediaItem[];
  total: number;
  page: number;
  limit: number;
  providers: string[];
  models: string[];
  projects?: string[];
  usernames?: string[];
}

// --- Artifacts ----------------------------------------------

export type ArtifactKind =
  | "markdown"
  | "html"
  | "image"
  | "video"
  | "audio"
  | "embed";

export interface ArtifactItem {
  id: string;
  project: string;
  username: string;
  agent?: string | null;
  conversationId?: string | null;
  agentConversationId?: string | null;
  source: "document" | "tool";
  kind: ArtifactKind;
  title: string;
  /** Inline body — document artifacts only; detail responses only. */
  content?: string;
  /** First ~400 chars of content — list responses only. */
  preview?: string;
  /** Asset URL — tool-captured media/embed artifacts only. */
  url?: string;
  toolName?: string;
  height?: number;
  version: number;
  versions?: Array<{ content: string; title: string; updatedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactListResponse {
  data: ArtifactItem[];
  total: number;
  page: number;
  limit: number;
}

// --- Text Content -------------------------------------------

export interface TextContentItem {
  _id: ObjectId;
  content: string;
  model?: string;
  provider?: string;
  conversationId?: ObjectId;
  createdAt: string;
}

export interface TextListResponse {
  data: TextContentItem[];
  total: number;
  page: number;
  limit: number;
  providers: string[];
  models: string[];
}

// --- LM Studio ----------------------------------------------

export interface LmStudioModel {
  id: string;
  name: string;
  path: string;
  loaded: boolean;
  quantization?: string;
  parameterCount?: number;
  contextLength?: number;
  architecture?: string;
  vramGiB?: number;
}

export interface LmStudioVramEstimate {
  gpuGiB: number;
  totalGiB: number;
  archParams: Record<string, number>;
  totalLayers: number;
}

// --- Stats --------------------------------------------------

export interface ModelUsageStat {
  model: string;
  provider: string;
  totalRequests: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  lastUsed?: string | Date;
}

export interface ToolUsageStat {
  tool: string;
  totalCalls: number;
  totalRequests: number;
  totalCost?: number;
}

// --- Chat Payloads ------------------------------------------

export interface ChatGenerationResult {
  text?: string;
  content?: string;
  images?: string[];
  messages?: Message[];
}

export interface ChatPayload {
  messages: Message[];
  model: string;
  provider: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tools?: ToolSchema[];
  conversationId?: string;
  conversationMeta?: ConversationMeta;
  project?: string;
  agent?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  thinkingLevel?: string;
  thinkingBudget?: string | number;
  webSearchEnabled?: boolean;
}

export interface ImageGenerationResult {
  images?: string[];
  imageData?: string;
  mimeType?: string;
  minioRef?: string;
  text?: string;
}

export interface ImageGenerationPayload {
  prompt: string;
  images?: Array<string | { imageData: string; mimeType?: string }>;
  model: string;
  provider: string;
  systemPrompt?: string;
  conversationId?: string;
  conversationMeta?: ConversationMeta;
}

// --- Audio --------------------------------------------------

export interface TTSPayload {
  text: string;
  model: string;
  provider: string;
  voice?: string;
  conversationId?: string;
  conversationMeta?: ConversationMeta;
}

export interface TTSResponse {
  audioDataUrl: string;
  contentType: string;
}

export interface TranscriptionPayload {
  audio: string;
  model?: string;
  provider?: string;
  conversationId?: string;
  conversationMeta?: ConversationMeta;
}

export interface TranscriptionResponse {
  text: string;
  usage?: TokenUsage;
  estimatedCost?: number;
  totalTime?: number;
}

// --- Embeddings ---------------------------------------------

export interface EmbeddingPayload {
  input?: string | string[];
  text?: string;
  images?: string[];
  audio?: string;
  model?: string;
  provider?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  provider: string;
  model: string;
}

// --- Harnesses ----------------------------------------------

export interface AgenticHarness {
  id: string;
  label: string;
  description: string;
}

// --- Topology Definitions -----------------------------------

export interface TopologyAlignmentEntry {
  component: string;
  status: "aligned" | "simplified" | "extended";
  detail: string;
}

export interface TopologyConfigOption {
  name: string;
  type: "number" | "string" | "boolean";
  defaultValue: string;
  description: string;
}

export interface TopologyDefinition {
  id: string;
  displayName: string;
  abbreviation: string;
  description: string;
  paperTitle: string | null;
  paperAuthors: string | null;
  paperYear: number | null;
  paperUrl: string | null;
  implementationFile: string;
  categoryLabel: string;
  phases: string[];
  configOptions: TopologyConfigOption[];
  alignment: TopologyAlignmentEntry[];
  flowDescription: string;
}

// --- Thought Structure Definitions --------------------------

export interface ThoughtStructureDefinition {
  id: string;
  displayName: string;
  abbreviation: string;
  description: string;
  paperTitle: string;
  paperAuthors: string;
  paperYear: number;
  paperUrl: string;
  implementationFile: string;
  categoryLabel: string;
  phases: string[];
  configOptions: TopologyConfigOption[];
  alignment: TopologyAlignmentEntry[];
  flowDescription: string;
}

// --- Approval -----------------------------------------------

export interface ApprovalResponse {
  ok: boolean;
  approved: boolean;
}

export type ApprovalDecision = "allow" | "deny";

/** How far one decision reaches: this call, the rest of its batch, or the whole conversation. */
export type ApprovalScope = "call" | "batch" | "conversation";

/** A unified diff of what a file-writing call would change (`approval_required.preview`). */
export interface ApprovalPreview {
  kind: "diff";
  path: string;
  diff: string;
  isNewFile?: boolean;
  isTruncated?: boolean;
}

/** Body of POST /agent/approve — one decision for one pending call. */
export interface ApprovalDecisionRequest {
  toolCallId: string;
  batchId?: string;
  decision: ApprovalDecision;
  reason?: string;
  editedArgs?: Record<string, unknown>;
  scope?: ApprovalScope;
}

export interface ApprovalDecisionResponse extends ApprovalResponse {
  decision: ApprovalDecision;
  scope: ApprovalScope;
  batchId: string;
  /** Every call this decision settled — more than one for a batch/conversation scope. */
  decidedToolCallIds: string[];
  remaining: number;
  /** scope "conversation": whether the flag reached the conversation document. */
  persisted?: boolean;
}

export interface UserQuestionAnswer {
  answer: string | string[];
  annotations?: string;
}

// --- Iris Stats ----------------------------------------------

export interface IrisDashboardStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalDuration: number;
  avgLatency: number;
  avgTokensPerSec: number;
  totalToolCalls: number;
  successCount: number;
  errorCount: number;
  conversationCount: number;
  agentConversationCount: number;
  agentCount: number;
  workspaceCount: number;
}

export interface IrisProjectStat {
  project: string;
  totalRequests: number;
  totalCost?: number;
}

export interface IrisModelStat {
  provider: string;
  model?: string;
  totalRequests: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCost?: number;
  avgLatency?: number;
  avgTokensPerSec?: number;
  conversationCount?: number;
  workflowCount?: number;
  agentConversationCount?: number;
}

export interface IrisTimelineEntry {
  hour?: string;
  totalRequests: number;
  totalCost?: number;
}

export interface IrisProviderStat {
  provider: string;
  totalRequests: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCost?: number;
  avgLatency?: number;
  avgTokensPerSec?: number | null;
  models?: string[];
  modelCount?: number;
  conversationCount?: number;
  workflowCount?: number;
  agentConversationCount?: number;
}

export interface IrisAgentStat {
  agent: string;
  name: string;
  type?: string;
  custom?: boolean;
  totalRequests: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCost?: number;
  avgLatency?: number;
  avgTokensPerSec?: number | null;
  models?: string[];
  modelCount?: number;
  providers?: string[];
  providerCount?: number;
  conversationCount?: number;
  agentConversationCount?: number;
  lastRequest?: string;
  successCount?: number;
  errorCount?: number;
}

export interface IrisUserStat {
  username: string;
  totalRequests: number;
  totalTokens?: number;
  totalCost?: number;
  avgLatency?: number;
  lastRequest?: string;
}

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  startDate?: string;
  weekdays?: number[];
  monthlyType?: "dayOfMonth" | "nthDayOfWeek";
  dayOfMonth?: number;
  nthDayOfWeek?: {
    occurrence: 1 | 2 | 3 | 4 | -1;
    dayOfWeek: number;
  };
  yearlyType?: "specificDate" | "nthDayOfWeek";
  months?: number[];
}

export interface ScheduledTask {
  id: string;
  name: string;
  project: string;
  username?: string;
  prompt: string;
  agent: string | null;
  provider: string;
  model: string;
  scheduleType: "hourly" | "daily" | "weekly" | "cron" | "trigger" | "once" | "custom";
  scheduleTime?: string;
  scheduleDay?: number;
  scheduleDate?: string;
  cronExpression?: string;
  recurrenceRule?: RecurrenceRule;
  toolConfig?: {
    enabledTools?: string[];
    disabledTools?: string[];
  };
  enabled: boolean;
  lastRunMinute?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTimer {
  id: string;
  conversationId: string;
  project: string;
  username: string;
  prompt: string;
  mode: "one_shot" | "recurring";
  durationSeconds?: number;
  cronExpression?: string;
  maxIterations?: number;
  iterationCount: number;
  firesAt: string;
  lastFiredMinuteKey?: string;
  status: "active" | "fired" | "cancelled" | "expired";
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  _id?: ObjectId;
  id: string;
  title: string;
  content: string;
  tags: string[];
  project?: string;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
  color?: string;
}

export interface LiveSubAgentStatus {
  phase: string;
  label: string | null;
  conversationId: string | null;
  startedAt: string | null;
}

export interface LiveConversationStatus {
  phase: string;
  label: string | null;
  iteration: number;
  maxIterations: number;
  startedAt: string;
  phaseStartedAt: string;
  tokensPerSecond: number | null;
  activeRequests: number;
  outputTokens: number;
  inputTokens: number;
  totalTokens: number;
  /** Live server-estimated cost of the in-flight generation (USD). */
  estimatedCost?: number;
  subAgents: Record<string, LiveSubAgentStatus>;
}

export interface LiveConversationStatusResponse extends LiveConversationStatus {
  active: boolean;
}
