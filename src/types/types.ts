// ============================================================
// Prism Client — Shared Type Definitions
// ============================================================
// Single source of truth for domain types. Define canonical shapes
// here so TypeScript inference propagates them downward through
// PrismService → hooks → components → utils — eliminating `as any`.
// ============================================================

// ─── Identifiers ────────────────────────────────────────────

/** MongoDB ObjectId string or UUID */
export type ObjectId = string;

// ─── Config / Models ────────────────────────────────────────

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
  loaded?: boolean;
  path?: string;
  quantization?: string;
  parameterCount?: number;
  vramGiB?: number;
  /** Instance ID for local models (multi-instance) */
  instanceId?: string;
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

export interface PrismConfig {
  fileBaseUrl: string | null;
  fcSystemPrompt: string;
  providers: Record<string, string>;
  providerList: string[];
  availableProviders: string[];
  localProviders: LocalProviderInfo[];
  textToText: ModalityConfig;
  textToSpeech: TextToSpeechConfig;
  textToImage: ModalityConfig;
  imageToText: ModalityConfig;
  embedding: ModalityConfig;
  audioToText: ModalityConfig;
}

// ─── Conversations ──────────────────────────────────────────

export interface ConversationMeta {
  title?: string;
  project?: string;
  agent?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  synthetic?: boolean;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  images?: string[];
  files?: FileAttachment[];
  model?: string;
  provider?: string;
  thinking?: string;
  toolCalls?: ToolCallEvent[];
  webSearchResults?: WebSearchResult[];
  timestamp?: string;
  _id?: ObjectId;

  // ─── Server-enriched fields ───────────────────────────────
  /** Provider-reported usage stats (set on completion) */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    requests?: number;
    [key: string]: unknown;
  };
  estimatedCost?: number;
  /** Time from request to first token (seconds) */
  timeToGeneration?: number;
  /** When this assistant message completed */
  completedAt?: string;

  // ─── Modality fields ──────────────────────────────────────
  audio?: string;
  image?: string;
  documents?: Array<{ name?: string; data?: string; mimeType?: string }>;
  liveTranscription?: boolean;

  // ─── Live streaming metadata (client-side, prefixed with _) ─
  /** Intermediate usage from per-iteration backend events */
  _intermediateUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    requests?: number;
    [key: string]: unknown;
  };
  /** Backend-computed tok/s from SessionGenerationTracker */
  _liveGenProgress?: {
    outputTokens?: number;
    tokensPerSecond?: number;
    [key: string]: unknown;
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
  /** Worker live generation progress (keyed by workerId) */
  _workerGenerationProgress?: Record<string, {
    outputTokens?: number;
    totalOutputTokens?: number;
    tokensPerSecond?: number;
    toolNames?: Record<string, number>;
    [key: string]: unknown;
  }>;
  /** Accumulated worker tokens (from worker_status complete events) */
  _workerTokens?: {
    input?: number;
    output?: number;
    requests?: number;
  };
  /** Server-side generation parameters snapshot */
  generationSettings?: Record<string, unknown>;
  /** Incremental background usage (memory extraction, embedding) */
  _backgroundUsage?: Record<string, unknown>;
  [key: string]: unknown;
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
  stats?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ConversationListResponse {
  items: Conversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Agent Sessions ─────────────────────────────────────────

export interface AgentSession {
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
  stats?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface AgentSessionListResponse {
  items: AgentSession[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── SSE Stream Events ──────────────────────────────────────

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
  [key: string]: unknown;
}

export interface SSEToolOutputEvent {
  type: "tool_output";
  toolCallId: string;
  name: string;
  result: unknown;
  [key: string]: unknown;
}

export interface SSEApprovalRequiredEvent {
  type: "approval_required";
  agentSessionId: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  [key: string]: unknown;
}

export interface SSEPlanProposalEvent {
  type: "plan_proposal";
  plan: string;
  [key: string]: unknown;
}

export interface SSEUserQuestionEvent {
  type: "user_question";
  agentSessionId: string;
  questions: Array<{
    question: string;
    type?: "text" | "single_select" | "multi_select";
    options?: string[];
    annotations?: string;
  }>;
  [key: string]: unknown;
}

export interface SSEWorkerStatusEvent {
  type: "worker_status";
  workerId: string;
  status: string;
  [key: string]: unknown;
}

export interface SSEUsageUpdateEvent {
  type: "usage_update";
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  [key: string]: unknown;
}

export interface SSEDoneEvent {
  type: "done";
  conversationId?: string;
  [key: string]: unknown;
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
  | SSEWorkerStatusEvent
  | SSEUsageUpdateEvent
  | SSEDoneEvent
  | SSEErrorEvent;

// ─── SSE Callback Interfaces ────────────────────────────────

/** Wire-format SSE event — parsed JSON with a discriminant `type` field. */
export type SSEData = Record<string, unknown> & { type: string };

export interface SSECallbacks {
  onChunk?: (content: string, sourceModel?: string, outputCharacters?: number) => void;
  onThinking?: (content: string, sourceModel?: string, outputCharacters?: number) => void;
  onImage?: (data: string, mimeType: string, minioRef?: string) => void;
  onAudio?: (data: string, mimeType: string) => void;
  onExecutableCode?: (code: string, language: string) => void;
  onCodeExecutionResult?: (output: string, outcome: string) => void;
  onWebSearchResult?: (results: WebSearchResult[]) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolExecution?: (event: SSEData) => void;
  onToolOutput?: (event: SSEData) => void;
  onWorkerToolExecution?: (event: SSEData) => void;
  onWorkerToolOutput?: (event: SSEData) => void;
  onWorkerStatus?: (event: SSEData) => void;
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

// ─── Tool Calls ─────────────────────────────────────────────

export interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: string;
  thoughtSignature?: string;
  _sourceModel?: string;
}

// ─── Web Search ─────────────────────────────────────────────

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
}

// ─── Files / Attachments ────────────────────────────────────

export interface FileAttachment {
  name: string;
  mimeType: string;
  data?: string;
  url?: string;
  size?: number;
}

// ─── Custom Tools ───────────────────────────────────────────

export interface CustomToolParameter {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  enum?: string[];
}

export interface CustomTool {
  _id?: ObjectId;
  name: string;
  description: string;
  project?: string;
  enabled?: boolean;
  parameters?: CustomToolParameter[];
  implementation?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Custom Agents ──────────────────────────────────────────

export interface CustomAgent {
  _id?: ObjectId;
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  icon?: string;
  color?: string;
  backgroundImage?: string;
  project?: string;
  enabledTools?: string[];
  custom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Agent Personas (from /config/agents) ───────────────────

export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  custom: boolean;
  icon: string;
  color: string;
  backgroundImage: string;
  project?: string;
  toolCount: number;
  enabledToolNames: string[];
  canSpawnWorkers: boolean;
  usesDirectoryTree: boolean;
  usesCodingGuidelines: boolean;
}

// ─── Skills ─────────────────────────────────────────────────

export interface Skill {
  _id?: ObjectId;
  id?: string;
  name: string;
  description?: string;
  project?: string;
  template: string;
  variables?: Record<string, string>;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

// ─── Agent Memories ─────────────────────────────────────────

export interface AgentMemory {
  _id: ObjectId;
  id?: string;
  content: string;
  project?: string;
  agent?: string;
  source?: string;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface AgentMemoryListResponse {
  memories: AgentMemory[];
  total: number;
}

// ─── Settings ───────────────────────────────────────────────

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
  [key: string]: unknown;
}

// ─── MCP Servers ────────────────────────────────────────────

export interface MCPServer {
  _id?: ObjectId;
  name: string;
  url: string;
  project?: string;
  transport?: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  connected?: boolean;
  toolCount?: number;
  tools?: Array<{ name: string; description?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Coordinator Workers ────────────────────────────────────

export interface CoordinatorWorker {
  id: string;
  agentSessionId: string;
  status: string;
  task?: string;
  model?: string;
  provider?: string;
  startedAt?: string;
  completedAt?: string;
  phase?: string;
  currentTool?: string | null;
  [key: string]: unknown;
}

// ─── Favorites ──────────────────────────────────────────────

export interface Favorite {
  _id?: ObjectId;
  type: string;
  key: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
}

// ─── Tool Schemas ───────────────────────────────────────────

export interface ToolSchema {
  name: string;
  description: string;
  domain?: string;
  labels?: string[];
  parameters?: Record<string, unknown>;
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

// ─── Benchmarks ─────────────────────────────────────────────

export interface BenchmarkPrompt {
  role: string;
  content: string;
}

export interface Benchmark {
  _id: ObjectId;
  id?: string;
  name: string;
  description?: string;
  prompts: BenchmarkPrompt[];
  models?: string[];
  latestRun?: BenchmarkRun;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
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
}

export interface BenchmarkRun {
  _id: ObjectId;
  id?: string;
  benchmarkId: ObjectId;
  results: BenchmarkRunResult[];
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  startedAt: string;
  completedAt?: string;
  [key: string]: unknown;
}

export interface BenchmarkListResponse {
  benchmarks: Benchmark[];
  count: number;
}

export interface BenchmarkModelStats {
  models: Array<Record<string, unknown>>;
  totalModels: number;
  totalBenchmarks: number;
}

// ─── VRAM Benchmarks ────────────────────────────────────────

export interface VramBenchmarkGpuTelemetry {
  name?: string;
  temp?: number;
  power?: string;
  utilization?: string;
  [key: string]: unknown;
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
  ttft?: { ms: number; prefillTokPerSec?: number; [key: string]: unknown };
  loadTimeMs?: number;
  hostname?: string;
  gpu?: string;
  gpuVramGB?: number;
  system?: { hostname: string; gpu?: VramBenchmarkGpuTelemetry; [key: string]: unknown };
  settings?: { label: string; [key: string]: unknown };
  vramDuringGen?: { peakGiB?: number; [key: string]: unknown };
  createdAt?: string;
  [key: string]: unknown;
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

// ─── Workflows ──────────────────────────────────────────────

export interface WorkflowNode {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
  [key: string]: unknown;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  [key: string]: unknown;
}

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
  nodeStatuses?: Record<string, unknown>;
  userContent?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

// ─── Synthesis ──────────────────────────────────────────────

export interface SynthesisRun {
  _id: ObjectId;
  id?: string;
  name?: string;
  title?: string;
  prompt: string;
  systemPrompt?: string;
  userPersona?: string;
  category?: string;
  targetTurns?: number;
  seedMessages?: Array<{ role: string; content: string }>;
  settings?: Record<string, unknown>;
  conversationId?: string;
  models: Array<{ provider: string; model: string }>;
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
  [key: string]: unknown;
}

// ─── Media ──────────────────────────────────────────────────

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
  [key: string]: unknown;
}

// ─── Text Content ───────────────────────────────────────────

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

// ─── LM Studio ──────────────────────────────────────────────

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
  [key: string]: unknown;
}

export interface LmStudioVramEstimate {
  gpuGiB: number;
  totalGiB: number;
  archParams: Record<string, unknown>;
  totalLayers: number;
}

// ─── Stats ──────────────────────────────────────────────────

export interface ModelUsageStat {
  model: string;
  provider: string;
  totalRequests: number;
}

export interface ToolUsageStat {
  tool: string;
  totalCalls: number;
  totalRequests: number;
  totalCost?: number;
  [key: string]: unknown;
}

// ─── Chat Payloads ──────────────────────────────────────────

export interface ChatGenerationResult {
  text?: string;
  content?: string;
  images?: string[];
  messages?: Message[];
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface ImageGenerationResult {
  images?: string[];
  imageData?: string;
  mimeType?: string;
  minioRef?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ImageGenerationPayload {
  prompt: string;
  images?: Array<string | { imageData: string; mimeType?: string }>;
  model: string;
  provider: string;
  systemPrompt?: string;
  conversationId?: string;
  conversationMeta?: ConversationMeta;
  [key: string]: unknown;
}

// ─── Audio ──────────────────────────────────────────────────

export interface TTSPayload {
  text: string;
  model: string;
  provider: string;
  voice?: string;
  [key: string]: unknown;
}

export interface TTSResponse {
  audioDataUrl: string;
  contentType: string;
}

export interface TranscriptionPayload {
  audio: string;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface TranscriptionResponse {
  text: string;
  usage?: Record<string, unknown>;
  estimatedCost?: number;
  totalTime?: number;
}

// ─── Embeddings ─────────────────────────────────────────────

export interface EmbeddingPayload {
  input?: string | string[];
  text?: string;
  images?: string[];
  audio?: string;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  provider: string;
  model: string;
}

// ─── Harnesses ──────────────────────────────────────────────

export interface AgenticHarness {
  id: string;
  label: string;
  description: string;
}

// ─── Approval ───────────────────────────────────────────────

export interface ApprovalResponse {
  ok: boolean;
  approved: boolean;
}

export interface UserQuestionAnswer {
  answer: string | string[];
  annotations?: string;
}
