// ============================================================
// Prism Client — Shared Type Definitions
// ============================================================
// Single source of truth for domain types. Define canonical shapes
// here so TypeScript inference propagates them downward through
// PrismService → hooks → components → utils — eliminating `as any`.
// ============================================================

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
  tokPerSec?: number;
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
  requests?: number;
}

// --- Conversations ------------------------------------------

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

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  rawContent?: string;
  images?: string[];
  files?: FileAttachment[];
  model?: string;
  provider?: string;
  thinking?: string;
  toolCalls?: ToolCallEvent[];
  webSearchResults?: WebSearchResult[];
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
}

export interface Conversation {
  _id: ObjectId;
  id?: string;
  title?: string;
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
}

export interface AgentConversationListResponse {
  items: AgentConversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

// --- SSE Stream Events --------------------------------------

export interface SSEChunkEvent {
  type: "chunk";
  content: string;
  _sourceModel?: string;
  outputCharacters?: number;
}

export interface SSEThinkingEvent {
  type: "thinking";
  content: string;
  _sourceModel?: string;
  outputCharacters?: number;
}

export interface SSEImageEvent {
  type: "image";
  data: string;
  mimeType: string;
  minioRef?: string;
}

export interface SSEAudioEvent {
  type: "audio";
  data: string;
  mimeType: string;
}

export interface SSEToolCallEvent {
  type: "toolCall";
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: string;
  thoughtSignature?: string;
  _sourceModel?: string;
}

export interface SSEToolExecutionEvent {
  type: "tool_execution";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  iteration?: number;
}

export interface SSEToolOutputEvent {
  type: "tool_output";
  toolCallId: string;
  name: string;
  result: unknown;
}

export interface SSEApprovalRequiredEvent {
  type: "approval_required";
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

export interface SSEPlanProposalEvent {
  type: "plan_proposal";
  plan: string;
}

export interface SSEUserQuestionEvent {
  type: "user_question";
  questions: Array<{
    question: string;
    type?: "text" | "single_select" | "multi_select";
    options?: string[];
    annotations?: string;
  }>;
}

export interface SSESubAgentStatusEvent {
  type: "sub_agent_status";
  subAgentId: string;
  status: string;
}

export interface SSEUsageUpdateEvent {
  type: "usage_update";
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}

export interface SSEDoneEvent {
  type: "done";
  conversationId?: string;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent =
  | SSEChunkEvent
  | SSEThinkingEvent
  | SSEImageEvent
  | SSEAudioEvent
  | SSEToolCallEvent
  | SSEToolExecutionEvent
  | SSEToolOutputEvent
  | SSEApprovalRequiredEvent
  | SSEPlanProposalEvent
  | SSEUserQuestionEvent
  | SSESubAgentStatusEvent
  | SSEUsageUpdateEvent
  | SSEDoneEvent
  | SSEErrorEvent;

// --- SSE Callback Interfaces --------------------------------

export interface TransformedSSEData {
  type: string;
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  content?: string;
  data?: string;
  mimeType?: string;
  minioRef?: string;
  result?: unknown;
  status?: string;
  toolCallId?: string;
  iteration?: number;
  maxIterations?: number;
  agentConversationId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  plan?: string;
  steps?: string[];
  autoApproved?: boolean;
  questions?: Array<{
    question: string;
    type?: "text" | "single_select" | "multi_select";
    options?: string[];
    annotations?: string;
  }>;
  subAgentId?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  message?: string;
  conversationId?: string;
  event?: string;
  tool?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: unknown;
    durationMs?: number;
  };
  toolCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
  tier?: 1 | 2 | 3 | undefined;
  question?: string;
  choices?: string[];
  context?: string | null;
  skills?: Skill[];
  strategy?: string;
  timeToFirstToken?: number;
  tokPerSec?: number;
  activeRequests?: number;
  totalTokens?: number;
  avgTtft?: number;
  progress?: number;
  label?: string;
  description?: string;
  firstChunkTime?: number;
  lastChunkTime?: number;
  totalOutputTokens?: number;
  phase?: string;
  estimatedTokens?: number;
  toolCount?: number;
  toolName?: string;
  error?: string;
  phaseProgress?: number;
  toolNames?: Record<string, number>;
  durationMs?: number;
  usage?: TokenUsage;
  totalTime?: number;
  tokensPerSec?: number;
  timeToGeneration?: number;
  [key: string]: unknown;
}

/** Wire-format SSE event — parsed JSON with a discriminant `type` field. */
export type SSEData = TransformedSSEData;

export interface TransformedRequestItem {
  _id: string;
  requestId?: string;
  timestamp?: string;
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
  [key: string]: unknown;
}

export interface SSECallbacks {
  onChunk?: (
    content: string,
    sourceModel?: string,
    outputCharacters?: number,
  ) => void;
  onThinking?: (
    content: string,
    sourceModel?: string,
    outputCharacters?: number,
  ) => void;
  onImage?: (data: string, mimeType: string, minioRef?: string) => void;
  onAudio?: (data: string, mimeType: string) => void;
  onExecutableCode?: (code: string, language: string) => void;
  onCodeExecutionResult?: (output: string, outcome: string) => void;
  onWebSearchResult?: (results: WebSearchResult[]) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolExecution?: (event: SSEData) => void;
  onToolOutput?: (event: SSEData) => void;
  onSubAgentToolExecution?: (event: SSEData) => void;
  onSubAgentToolOutput?: (event: SSEData) => void;
  onSubAgentStatus?: (event: SSEData) => void;
  onApprovalRequired?: (event: SSEData) => void;
  onPlanProposal?: (event: SSEData) => void;
  onUserQuestion?: (event: SSEData) => void;
  onTodoUpdate?: (event: SSEData) => void;
  onBriefUpdate?: (event: SSEData) => void;
  onRunInfo?: (event: SSEData) => void;
  onModelStart?: (event: SSEData) => void;
  onModelComplete?: (event: SSEData) => void;
  onRunComplete?: (event: SSEData) => void;
  onUsageUpdate?: (event: SSEData) => void;
  onStatus?: (event: SSEData) => void;
  onDone?: (event: SSEData) => void;
  onError?: (error: Error) => void;
}

export interface ContentSegment {
  type: "thinking" | "tools" | "text" | "plan";
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

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
}

// --- Files / Attachments ------------------------------------

export interface FileAttachment {
  name: string;
  mimeType: string;
  data?: string;
  url?: string;
  size?: number;
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

// --- Agent Memories -----------------------------------------

export interface AgentMemory {
  _id: ObjectId;
  id?: string;
  type?: string;
  title?: string | null;
  content: string;
  project?: string;
  agent?: string;
  source?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentMemoryListResponse {
  memories: AgentMemory[];
  total: number;
}

export interface ConsolidationHistoryEntry {
  _id?: string;
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
  subAgentProvider?: string;
  subAgentModel?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

// --- Coordinator Sub-Agents ---------------------------------

export interface CoordinatorSubAgent {
  id: string;
  agentId?: string;
  agentConversationId: string;
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
}

// --- Benchmark Presets --------------------------------------

export interface BenchmarkPreset {
  name: string;
  systemPrompt: string;
  prompt: string;
  assertions: Array<{ expectedValue: string; matchMode: string }>;
  assertionOperator: string;
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
  expectedValue?: string;
  matchMode?: string;
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
  tags?: string[];
  /** Aggregated cost across all runs (enriched at list time) */
  cumulativeCost?: number;
}

export interface BenchmarkRunResult {
  model: string;
  provider: string;
  response: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  latencyMs?: number;
  ttftMs?: number;
  tokensPerSecond?: number;
  error?: string;
  label?: string;
  display_name?: string;
  passed?: boolean;
  thinking?: string;
  toolCalls?: Array<{
    id?: string;
    name?: string;
    args?: unknown;
    result?: unknown;
    status?: string;
  }>;
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
  status?: "pending" | "running" | "completed" | "failed" | "aborted";
  startedAt?: string;
  completedAt?: string;
  aborted?: boolean;
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
  totalCost: number;
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

