import { PRISM_SERVICE_URL, MINIO_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";
import type {
  PrismConfig,
  ModelsMap,
  ModelOption,
  Conversation,
  ConversationListResponse,
  ConversationMeta,
  Message,
  AgentSession,
  AgentSessionListResponse,
  CustomTool,
  CustomAgent,
  AgentPersona,
  Skill,
  AgentMemory,
  AgentMemoryListResponse,
  PrismSettings,
  MCPServer,
  CoordinatorWorker,
  Favorite,
  ToolSchema,
  Benchmark,
  BenchmarkListResponse,
  BenchmarkModelStats,
  BenchmarkRun,
  VramBenchmarkEntry,
  VramBenchmarkMachine,
  Workflow,
  SynthesisRun,
  MediaListResponse,
  TextListResponse,
  LmStudioModel,
  LmStudioVramEstimate,
  ModelUsageStat,
  ToolUsageStat,
  ChatPayload,
  ImageGenerationPayload,
  TTSPayload,
  TTSResponse,
  TranscriptionPayload,
  TranscriptionResponse,
  EmbeddingPayload,
  EmbeddingResponse,
  SSECallbacks,
  SSEData,
  WebSearchResult,
  ApprovalResponse,
  AgenticHarness,
} from "../types/types";

const API_BASE = PRISM_SERVICE_URL;

function getHeaders() {
  return getBaseHeaders();
}

/**
 * Resolve a file reference to a usable URL.
 * Points directly at the MinIO bucket URL for minio:// refs.
 */
function resolveFileRef(ref: string): string {
  if (typeof ref === "string" && ref.startsWith("minio://")) {
    let key = ref.replace("minio://", "");
    key = key.replace(/::ffff:/g, "");
    const base = MINIO_URL || `${API_BASE}/files`;
    return `${base}/${key}`;
  }
  return ref;
}

export default class PrismService {
  /**
   * Shared fetch helper — centralises request / error handling.


   */
  static async _request<T = unknown>(endpoint: string, { method = "POST", body }: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: getHeaders(),
      cache: "no-store",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Prism API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Resolve a file reference (minio:// or data URL) to a renderable URL.
   */
  static getFileUrl(ref: string): string {
    return resolveFileRef(ref);
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  /**
   * Fetch the Prism configuration (providers, models, defaults).

   */
  static async getConfig(): Promise<PrismConfig> {
    const config = await PrismService._request<PrismConfig>("/config", { method: "GET" });
    // Register local provider metadata (nicknames, instance numbers)
    // on every config fetch — enables resolveProviderLabel() globally
    if (config?.localProviders) {
      setLocalProviderMeta(config.localProviders);
    }
    return config;
  }

  /**
   * Fetch local/self-hosted provider models (LM Studio, vLLM, Ollama).
   * Returns { models: { [provider]: [...] } } to merge into the main config.
   * @returns {Promise<{ models: object }>}
   */
  static async getLocalConfig(): Promise<{ models: ModelsMap }> {
    return PrismService._request<{ models: ModelsMap }>("/config-local", { method: "GET" });
  }

  /**
   * Merge local provider models into an existing config object (immutable).
   * Returns a new config with local models merged into textToText.models.


   * @returns {object} Updated config
   */
  static mergeLocalModels(config: PrismConfig, localModels: ModelsMap): PrismConfig {
    if (!config || !localModels || Object.keys(localModels).length === 0) {
      return config;
    }
    const updated = { ...config };
    const textToText = { ...updated.textToText };
    const existingModels = { ...textToText.models };
    for (const [provider, providerModels] of Object.entries(localModels)) {
      const existing = existingModels[provider] || [];
      const existingKeys = new Set(existing.map((m: ModelOption) => m.name));
      const merged = [...existing];
      for (const m of providerModels) {
        if (!existingKeys.has(m.name)) merged.push(m);
      }
      existingModels[provider] = merged;
    }
    textToText.models = existingModels;
    updated.textToText = textToText;
    return updated;
  }

  /**
   * Progressive config loading: fetches cloud config immediately, then
   * lazily fetches local provider models and calls onLocalMerge with the
   * updated config when they arrive.
   *

   * @param {Function} options.onConfig - Called immediately with cloud-only config
   * @param {Function} options.onLocalMerge - Called when local models arrive, with merged config

   * @returns {Promise<object>} The initial cloud config
   */
  static async getConfigWithLocalModels({
    onConfig,
    onLocalMerge,
    service,
  }: {
    onConfig?: (config: PrismConfig) => void;
    onLocalMerge?: (config: PrismConfig) => void;
    service?: typeof PrismService;
  } = {}): Promise<PrismConfig> {
    const svc = service || PrismService;
    const config = await svc.getConfig();

    if (onConfig) onConfig(config);

    // Fire-and-forget local model fetch
    if (config?.localProviders?.length > 0) {
      svc
        .getLocalConfig()
        .then(({ models }: { models: ModelsMap }) => {
          const merged = PrismService.mergeLocalModels(config, models);
          if (merged !== config && onLocalMerge) onLocalMerge(merged);
        })
        .catch(() => {}); // Local providers are optional
    }

    return config;
  }

  /**
   * Fetch built-in tool schemas from Prism.
   * Optionally filter by agent persona (e.g. "CODING" returns only agent-enabled tools).


   */
  static async getBuiltInToolSchemas(agent?: string): Promise<ToolSchema[]> {
    const qs = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request<ToolSchema[]>(`/config/tools${qs}`, { method: "GET" });
  }

  /**
   * Trigger Prism to re-fetch tool schemas from tools-api.
   * @returns {Promise<{ ok: boolean, count: number }>}
   */
  static async refreshBuiltInToolSchemas(): Promise<{ ok: boolean; count: number }> {
    return PrismService._request<{ ok: boolean; count: number }>("/config/tools/refresh", { method: "POST" });
  }

  /**
   * Fetch the list of registered agent personas from Prism.
   * @returns {Promise<Array<{ id: string, name: string, project: string, toolCount: number }>>}
   */
  static async getAgentPersonas(): Promise<AgentPersona[]> {
    return PrismService._request<AgentPersona[]>("/config/agents", { method: "GET" });
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Fetch per-model usage stats for the current user.
   * @returns {Promise<Array<{ model, provider, totalRequests }>>}
   */
  static async getModelStats(): Promise<ModelUsageStat[]> {
    return PrismService._request<ModelUsageStat[]>("/stats/models", { method: "GET" });
  }

  /**
   * Fetch lifetime usage stats for all tools (aggregated from requests).
   * Returns an array of { tool, totalCalls, totalRequests, totalCost, ... }.

   */
  static async getToolStats(): Promise<ToolUsageStat[]> {
    return PrismService._request<ToolUsageStat[]>("/admin/stats/tools", { method: "GET" });
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  /**
   * List conversations with cursor-based pagination.


   * @returns {Promise<{ items: Array, nextCursor: string|null, hasMore: boolean }>}
   */
  static async getConversations({ limit, cursor }: { limit?: number; cursor?: string } = {}): Promise<ConversationListResponse> {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    const query = qs.toString();
    return PrismService._request<ConversationListResponse>(`/conversations${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  }

  /**
   * Get a single conversation by ID.


   */
  static async getConversation(id: string): Promise<Conversation> {
    return PrismService._request<Conversation>(`/conversations/${id}`, { method: "GET" });
  }

  /**
   * Delete a conversation.


   */
  static async deleteConversation(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/conversations/${id}`, { method: "DELETE" });
  }

  /**


  // -- Agent Sessions -----------------------------------------

  /**
   * List agent sessions for a specific project with cursor-based pagination.


   * @returns {Promise<{ items: Array, nextCursor: string|null, hasMore: boolean }>}
   */
  static async getAgentSessions(project: string, { limit, cursor }: { limit?: number; cursor?: string } = {}): Promise<AgentSessionListResponse> {
    const qs = new URLSearchParams();
    qs.set("project", project);
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    return PrismService._request<AgentSessionListResponse>(`/agent-sessions?${qs}`, { method: "GET" });
  }

  /**
   * Get a single agent session by ID.


   */
  static async getAgentSession(id: string, project: string): Promise<AgentSession> {
    return PrismService._request<AgentSession>(
      `/agent-sessions/${id}?project=${encodeURIComponent(project)}`,
      { method: "GET" },
    );
  }

  /**
   * Delete an agent session.


   */
  static async deleteAgentSession(id: string, project: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/agent-sessions/${id}?project=${encodeURIComponent(project)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Append messages to a conversation, auto-creating it if it doesn't exist.


   */
  static async appendMessages(
    id: string,
    messages: Message[],
    project?: string,
    conversationMeta?: ConversationMeta,
  ): Promise<{ success: boolean }> {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    const body: { messages: Message[]; conversationMeta?: ConversationMeta } = { messages };
    if (conversationMeta) body.conversationMeta = conversationMeta;
    return PrismService._request<{ success: boolean }>(`/conversations/${id}/messages${qs}`, {
      body,
    });
  }

  // ---------------------------------------------------------------------------
  // Custom Tools
  // ---------------------------------------------------------------------------

  /**
   * Fetch favorites, optionally filtered by type.


   */
  static async getFavorites(type?: string): Promise<Favorite[]> {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    return PrismService._request<Favorite[]>(`/favorites${qs}`, { method: "GET" });
  }

  /**
   * Add a favorite.


   */
  static async addFavorite(type: string, key: string, meta: Record<string, unknown> = {}): Promise<Favorite> {
    return PrismService._request<Favorite>("/favorites", { body: { type, key, meta } });
  }

  /**
   * Remove a favorite.


   */
  static async removeFavorite(type: string, key: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/favorites?type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
  }

  // ---------------------------------------------------------------------------
  // Custom Tools
  // ---------------------------------------------------------------------------

  /**
   * List all custom tools for a project.


   */
  static async getCustomTools(project?: string): Promise<CustomTool[]> {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request<CustomTool[]>(`/custom-tools${qs}`, { method: "GET" });
  }

  /**
   * Create a new custom tool.


   */
  static async createCustomTool(tool: Omit<CustomTool, "_id">): Promise<CustomTool> {
    return PrismService._request<CustomTool>("/custom-tools", {
      method: "POST",
      body: tool,
    });
  }

  /**
   * Update an existing custom tool.


   */
  static async updateCustomTool(id: string, updates: Partial<CustomTool>): Promise<CustomTool> {
    return PrismService._request<CustomTool>(`/custom-tools/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a custom tool.


   */
  static async deleteCustomTool(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/custom-tools/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Custom Agents
  // ---------------------------------------------------------------------------

  /**
   * List all custom agent personas.

   */
  static async getCustomAgents(): Promise<CustomAgent[]> {
    return PrismService._request<CustomAgent[]>("/custom-agents", { method: "GET" });
  }

  /**
   * Create a new custom agent persona.


   */
  static async createCustomAgent(agent: Omit<CustomAgent, "_id">): Promise<CustomAgent> {
    return PrismService._request<CustomAgent>("/custom-agents", {
      method: "POST",
      body: agent,
    });
  }

  /**
   * Update an existing custom agent persona.


   */
  static async updateCustomAgent(id: string, updates: Partial<CustomAgent>): Promise<CustomAgent> {
    return PrismService._request<CustomAgent>(`/custom-agents/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a custom agent persona.


   */
  static async deleteCustomAgent(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/custom-agents/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  /**
   * List all skills for a project.


   */
  static async getSkills(project?: string): Promise<Skill[]> {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request<Skill[]>(`/skills${qs}`, { method: "GET" });
  }

  /**
   * Create a new skill.


   */
  static async createSkill(skill: Omit<Skill, "_id">): Promise<Skill> {
    return PrismService._request<Skill>("/skills", {
      method: "POST",
      body: skill,
    });
  }

  /**
   * Update an existing skill.


   */
  static async updateSkill(id: string, updates: Partial<Skill>): Promise<Skill> {
    return PrismService._request<Skill>(`/skills/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a skill.


   */
  static async deleteSkill(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/skills/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Agent Memories
  // ---------------------------------------------------------------------------

  /**
   * List all agent memories for a project (read-only).


   * @returns {Promise<{ memories: Array, total: number }>}
   */
  static async getAgentMemories(project?: string, limit = 100, agent?: string): Promise<AgentMemoryListResponse> {
    const qs = new URLSearchParams();
    if (project) qs.set("project", project);
    if (limit) qs.set("limit", String(limit));
    if (agent) qs.set("agent", agent);
    return PrismService._request<AgentMemoryListResponse>(`/agent-memories?${qs}`, { method: "GET" });
  }

  /**
   * Delete a specific agent memory.

   * @returns {Promise<{ success: boolean }>}
   */
  static async deleteAgentMemory(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/agent-memories/${id}`, { method: "DELETE" });
  }

  /**
   * Trigger memory consolidation for a project.

   * @returns {Promise<object>} Consolidation results
   */
  static async consolidateMemories(project: string, agent?: string): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>("/agent-memories/consolidate", {
      method: "POST",
      body: { project, ...(agent ? { agent } : {}) },
    });
  }

  /**
   * Get consolidation run history for a project.


   * @returns {Promise<{ history: Array }>}
   */
  static async getConsolidationHistory(project?: string, limit = 10): Promise<{ history: Record<string, unknown>[] }> {
    const qs = new URLSearchParams();
    if (project) qs.set("project", project);
    if (limit) qs.set("limit", String(limit));
    return PrismService._request<{ history: Record<string, unknown>[] }>(
      `/agent-memories/consolidation-history?${qs}`,
      { method: "GET" },
    );
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  /**
   * Fetch current server-side settings.

   */
  static async getSettings(): Promise<PrismSettings> {
    return PrismService._request<PrismSettings>("/settings", { method: "GET" });
  }

  /**
   * Update server-side settings (deep merge).

   * @returns {Promise<object>} Updated settings
   */
  static async updateSettings(data: Partial<PrismSettings>): Promise<PrismSettings> {
    return PrismService._request<PrismSettings>("/settings", { method: "PUT", body: data });
  }

  /**
   * Get compiled defaults for settings (useful for reset buttons).

   */
  static async getSettingsDefaults(): Promise<PrismSettings> {
    return PrismService._request<PrismSettings>("/settings/defaults", { method: "GET" });
  }

  /**
   * Fetch available agentic harnesses from the server.
   * @returns {Promise<Array<{ id: string, label: string, description: string }>>}
   */
  static async getHarnesses(): Promise<AgenticHarness[]> {
    return PrismService._request<AgenticHarness[]>("/settings/harnesses", { method: "GET" });
  }

  // ---------------------------------------------------------------------------
  // MCP Servers
  // ---------------------------------------------------------------------------

  /**
   * List all MCP server configs + live connection status.


   */
  static async getMCPServers(project?: string): Promise<MCPServer[]> {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request<MCPServer[]>(`/mcp-servers${qs}`, { method: "GET" });
  }

  /**
   * Add a new MCP server config.


   */
  static async createMCPServer(server: Omit<MCPServer, "_id">): Promise<MCPServer> {
    return PrismService._request<MCPServer>("/mcp-servers", {
      method: "POST",
      body: server,
    });
  }

  /**
   * Update an MCP server config.


   */
  static async updateMCPServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer> {
    return PrismService._request<MCPServer>(`/mcp-servers/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete an MCP server config.


   */
  static async deleteMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" });
  }

  /**
   * Connect to an MCP server.

   * @returns {Promise<{ success, serverName, toolCount, tools }>}
   */
  static async connectMCPServer(id: string): Promise<{ success: boolean; serverName: string; toolCount: number; tools: Array<{ name: string; description?: string }> }> {
    return PrismService._request<{ success: boolean; serverName: string; toolCount: number; tools: Array<{ name: string; description?: string }> }>(`/mcp-servers/${id}/connect`, {
      method: "POST",
    });
  }

  /**
   * Disconnect from an MCP server.

   * @returns {Promise<{ success }>}
   */
  static async disconnectMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/mcp-servers/${id}/disconnect`, {
      method: "POST",
    });
  }

  // ---------------------------------------------------------------------------
  // Coordinator Workers
  // ---------------------------------------------------------------------------

  /**
   * List coordinator workers, optionally filtered by session.

   * @returns {Promise<{ workers: Array }>}
   */
  static async getCoordinatorWorkers(agentSessionId?: string): Promise<{ workers: CoordinatorWorker[] }> {
    const qs = agentSessionId
      ? `?agentSessionId=${encodeURIComponent(agentSessionId)}`
      : "";
    return PrismService._request<{ workers: CoordinatorWorker[] }>(`/coordinator/workers${qs}`, {
      method: "GET",
    });
  }

  /**
   * Abort all running workers for a given agent session.

   * @returns {Promise<{ stopped: string[], alreadyStopped: string[] }>}
   */
  static async stopCoordinatorWorkers(agentSessionId: string): Promise<{ stopped: string[]; alreadyStopped: string[] }> {
    return PrismService._request<{ stopped: string[]; alreadyStopped: string[] }>("/coordinator/workers/stop", {
      body: { agentSessionId },
    });
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  /**
   * Generate text (non-streaming).


   */
  static async generateText(payload: ChatPayload): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>("/chat?stream=false", { body: payload });
  }

  /**
   * Generate text via the agentic endpoint (non-streaming).
   * Routes through /agent which enables the AgenticLoopService
   * (tool orchestration, planning, approval, etc.).


   */
  static async generateAgentText(payload: ChatPayload): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>("/agent?stream=false", {
      body: { ...payload, agent: payload.agent || "CODING" },
    });
  }

  /**
   * Send an approval/rejection response for a pending agentic tool or plan.


   * @returns {Promise<{ ok: boolean, approved: boolean }>}
   */
  static async sendApprovalResponse(
    agentSessionId: string,
    approved: boolean,
    { approveAll }: { approveAll?: boolean } = {},
  ): Promise<ApprovalResponse> {
    return PrismService._request<ApprovalResponse>("/agent/approve", {
      body: { agentSessionId, approved, ...(approveAll ? { approveAll } : {}) },
    });
  }

  /**
   * Submit answer(s) to a pending ask_user_question tool call.

   * @param {string|Array<{ answer: string|string[], annotations?: string }>} answerOrAnswers
   *   Simple string for single-question backward compat, or structured answers array.
   * @returns {Promise<{ ok: boolean }>}
   */
  static async sendUserQuestionAnswer(
    agentSessionId: string,
    answerOrAnswers: string | Array<{ answer: string | string[]; annotations?: string }>,
  ): Promise<{ ok: boolean }> {
    // Normalize: structured array vs simple string
    const body: Record<string, unknown> = { agentSessionId };
    if (Array.isArray(answerOrAnswers)) {
      body.answers = answerOrAnswers;
    } else {
      body.answer = String(answerOrAnswers);
    }
    return PrismService._request<{ ok: boolean }>("/agent/answer", { body });
  }

  /**
   * Stream text generation via SSE (Server-Sent Events).


   * @returns {Function} abort - Call to cancel the stream early
   */
  /**
   * Generic SSE stream helper — handles fetch, ReadableStream parsing, and
   * callback dispatch for any SSE endpoint.  All public stream* methods
   * delegate here so the protocol logic lives in exactly one place.
   *


   * @param {Function} callbacks.onError   - Required for error delivery
   * @returns {Function} abort — call to cancel the stream
   */
  static _streamSSE(
    endpoint: string,
    { method = "POST", body }: { method?: string; body?: unknown } = {},
    callbacks: SSECallbacks = {},
  ): () => void {
    const { onError } = callbacks;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
          method,
          headers: getHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (onError)
            onError(new Error(error.message || `HTTP ${response.status}`));
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines: "data: {...}\n\n"
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            if (!json) continue;

            try {
              const data = JSON.parse(json);
              PrismService._dispatchSSE(data, callbacks);
            } catch (parseErr: unknown) {
              if (json.length > 0) {
                console.warn(
                  `[PrismService] SSE JSON parse failed (${json.length} chars):`,
                  (parseErr as Error).message,
                  json.slice(0, 120),
                );
              }
            }
          }
        }
      } catch (error: unknown) {
        if ((error as Error).name === "AbortError") return;
        if (onError) onError(error as Error);
      }
    })();

    return () => controller.abort();
  }

  /**
   * Dispatch a single parsed SSE event object to the matching callback.
   * Centralises the type → handler mapping shared by chat, agent, and
   * benchmark streams.
   */
  static _dispatchSSE(data: SSEData, callbacks: SSECallbacks): void {
    const {
      onChunk,
      onThinking,
      onImage,
      onAudio,
      onExecutableCode,
      onCodeExecutionResult,
      onWebSearchResult,
      onToolCall,
      onToolExecution,
      onToolOutput,
      onWorkerToolExecution,
      onWorkerToolOutput,
      onWorkerStatus,
      onApprovalRequired,
      onPlanProposal,
      onUserQuestion,
      onTodoUpdate,
      onBriefUpdate,
      onRunInfo,
      onModelStart,
      onModelComplete,
      onRunComplete,
      onUsageUpdate,
      onStatus,
      onDone,
      onError,
    } = callbacks;

    switch (data.type) {
      case "chunk":
        onChunk?.(data.content as string, data._sourceModel as string | undefined, data.outputCharacters as number | undefined);
        break;
      case "thinking":
        onThinking?.(data.content as string, data._sourceModel as string | undefined, data.outputCharacters as number | undefined);
        break;
      case "image":
        onImage?.(data.data as string, data.mimeType as string, data.minioRef as string | undefined);
        break;
      case "audio":
        onAudio?.(data.data as string, data.mimeType as string);
        break;
      case "executableCode":
        onExecutableCode?.(data.code as string, data.language as string);
        break;
      case "codeExecutionResult":
        onCodeExecutionResult?.(data.output as string, data.outcome as string);
        break;
      case "webSearchResult":
        onWebSearchResult?.(data.results as WebSearchResult[]);
        break;
      case "toolCall":
        onToolCall?.({
          id: data.id as string,
          name: data.name as string,
          args: data.args as Record<string, unknown>,
          result: data.result,
          status: data.status as string | undefined,
          thoughtSignature: data.thoughtSignature as string | undefined,
          _sourceModel: data._sourceModel as string | undefined,
        });
        break;
      case "tool_execution":
        onToolExecution?.(data);
        break;
      case "tool_output":
        onToolOutput?.(data);
        break;
      case "approval_required":
        onApprovalRequired?.(data);
        break;
      case "plan_proposal":
        onPlanProposal?.(data);
        break;
      // Worker agent events — forwarded from spawned sub-agents
      case "worker_tool_execution":
        onWorkerToolExecution?.(data);
        break;
      case "worker_tool_output":
        onWorkerToolOutput?.(data);
        break;
      case "worker_status":
        onWorkerStatus?.(data);
        break;
      // Prism-local agentic events
      case "user_question":
        onUserQuestion?.(data);
        break;
      case "todo_update":
        onTodoUpdate?.(data);
        break;
      case "brief_update":
        onBriefUpdate?.(data);
        break;
      // Benchmark-specific events
      case "run_info":
        onRunInfo?.(data);
        break;
      case "model_start":
        onModelStart?.(data);
        break;
      case "model_complete":
        onModelComplete?.(data);
        break;
      case "run_complete":
        onRunComplete?.(data);
        break;
      case "usage_update":
        onUsageUpdate?.(data);
        break;
      case "status":
        onStatus?.(data);
        break;
      case "done":
        onDone?.(data);
        break;
      case "error":
        onError?.(new Error(data.message as string));
        break;
      default:
        break;
    }
  }

  /**
   * Stream text generation via SSE (Server-Sent Events).


   * @returns {Function} abort - Call to cancel the stream early
   */
  static streamText(payload: ChatPayload, callbacks: SSECallbacks): () => void {
    return PrismService._streamSSE("/chat", { body: payload }, callbacks);
  }

  /**
   * Stream agentic text generation via SSE — hits the /agent endpoint
   * which enables the AgenticLoopService (tool orchestration, planning,
   * approval gates, etc.). Identical callback interface to streamText().
   *


   * @returns {Function} abort - Call to cancel the stream early
   */
  static streamAgentText(payload: ChatPayload, callbacks: SSECallbacks): () => void {
    return PrismService._streamSSE(
      "/agent",
      { body: { ...payload, agent: payload.agent || "CODING" } },
      callbacks,
    );
  }

  /**
   * Generate an image from text.

   * @returns {Promise<{ images: string[], text?: string }>}
   */
  static async generateImage(payload: ImageGenerationPayload): Promise<Record<string, unknown>> {
    const {
      prompt,
      images,
      systemPrompt,
      conversationId,
      conversationMeta,
      ...rest
    } = payload;
    const userMessage: Record<string, unknown> = {
      role: "user",
      content: prompt || "",
    };

    if (images?.length && images.length > 0) {
      userMessage.images = images.map((image) => {
        if (typeof image === "string") return image;
        return `data:${image.mimeType || "image/png"};base64,${image.imageData}`;
      });
    }

    const body: Record<string, unknown> = {
      ...rest,
      messages: [userMessage],
    };
    if (systemPrompt) body.systemPrompt = systemPrompt;
    if (conversationId) body.conversationId = conversationId;
    if (conversationMeta) body.conversationMeta = conversationMeta;

    return PrismService._request<Record<string, unknown>>("/chat?stream=false", { body });
  }

  /**
   * Caption / describe an image (image-to-text).

   * @returns {Promise<{ text: string }>}
   */
  static async captionImage(payload: ChatPayload): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>("/chat?stream=false", { body: payload });
  }

  /**
   * Transcribe an audio file to text.

   * @returns {Promise<{ text, usage?, estimatedCost?, totalTime? }>}
   */
  static async transcribeAudio(payload: TranscriptionPayload): Promise<TranscriptionResponse> {
    return PrismService._request<TranscriptionResponse>("/audio-to-text", { body: payload });
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------

  /**
   * Generate speech from text (TTS).
   * Uses ?format=dataUrl so the backend returns the audio as a base64 data URL
   * directly, eliminating client-side ArrayBuffer→Base64 conversion.

   * @returns {Promise<{ audioDataUrl: string, contentType: string }>}
   */
  static async generateSpeech(payload: TTSPayload): Promise<TTSResponse> {
    const response = await fetch(`${API_BASE}/text-to-audio?format=dataUrl`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      let message = "Failed to generate speech";
      try {
        const error = JSON.parse(text);
        message = error.message || message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    return response.json();
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  /**
   * Generate embeddings from any modality.

   * @returns {Promise<{ embedding: number[], dimensions: number, provider: string, model: string }>}
   */
  static async generateEmbedding(payload: EmbeddingPayload): Promise<EmbeddingResponse> {
    return PrismService._request<EmbeddingResponse>("/embed", { body: payload });
  }

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------

  /**
   * List all saved workflows (metadata only).

   */
  static async getWorkflows(): Promise<Workflow[]> {
    return PrismService._request<Workflow[]>("/workflows?source=prism-client", {
      method: "GET",
    });
  }

  /**
   * Get a single workflow by ID (full document).


   */
  static async getWorkflow(id: string): Promise<Workflow> {
    return PrismService._request<Workflow>(`/workflows/${id}`, { method: "GET" });
  }

  /**
   * Create a new workflow.

   * @returns {Promise<{ success: boolean, id: string }>}
   */
  static async saveWorkflow(workflow: Omit<Workflow, "_id">): Promise<{ success: boolean; id: string }> {
    return PrismService._request<{ success: boolean; id: string }>("/workflows", {
      body: { ...workflow, source: "prism-client" },
    });
  }

  /**
   * Update an existing workflow.


   * @returns {Promise<{ success: boolean }>}
   */
  static async updateWorkflow(id: string, workflow: Partial<Workflow>): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/workflows/${id}`, {
      method: "PUT",
      body: workflow,
    });
  }

  /**
   * Delete a workflow.

   * @returns {Promise<{ success: boolean }>}
   */
  static async deleteWorkflow(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/workflows/${id}`, { method: "DELETE" });
  }

  /**
   * Append conversation IDs to a workflow (generated during execution).


   * @returns {Promise<{ success: boolean }>}
   */
  static async patchWorkflowConversations(id: string, conversationIds: string[]): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/workflows/${id}/conversations`, {
      method: "PATCH",
      body: { conversationIds },
    });
  }

  // ---------------------------------------------------------------------------
  // Media
  // ---------------------------------------------------------------------------

  /**
   * List media items from the caller's project conversations.

   * @returns {Promise<{ data, total, page, limit, providers, models }>}
   */
  static async getMedia(params: Record<string, string> = {}): Promise<MediaListResponse> {
    const query = new URLSearchParams(params).toString();
    return PrismService._request<MediaListResponse>(`/media${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  }

  // ---------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------

  /**
   * List text content from the caller's project conversations.

   * @returns {Promise<{ data, total, page, limit, providers, models }>}
   */
  static async getText(params: Record<string, string> = {}): Promise<TextListResponse> {
    const query = new URLSearchParams(params).toString();
    return PrismService._request<TextListResponse>(`/text${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  }

  // ---------------------------------------------------------------------------
  // LM Studio
  // ---------------------------------------------------------------------------

  /**
   * List all LM Studio models (loaded + downloaded).
   * @returns {Promise<{ models: Array }>}
   */
  static async getLmStudioModels(): Promise<{ models: LmStudioModel[] }> {
    return PrismService._request<{ models: LmStudioModel[] }>("/lm-studio/models", { method: "GET" });
  }

  /**
   * Load a model into LM Studio with optional configuration.


   */
  static async loadLmStudioModel(model: string, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>("/lm-studio/load", {
      body: buildLmStudioLoadBody(model, options),
    });
  }

  /**
   * Unload a model from LM Studio memory.


   */
  static async unloadLmStudioModel(instanceId: string): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>("/lm-studio/unload", {
      body: { instance_id: instanceId },
    });
  }

  /**
   * Estimate VRAM usage for an LM Studio model.
   * @param {string} model — model key/path
   * @param {object} config — { contextLength, gpuLayers, flashAttention, offloadKvCache }
   * @returns {Promise<{ gpuGiB: number, totalGiB: number, archParams: object, totalLayers: number }>}
   */
  static async estimateLmStudioMemory(model: string, config: Record<string, unknown> = {}): Promise<LmStudioVramEstimate> {
    return PrismService._request<LmStudioVramEstimate>("/lm-studio/estimate", {
      body: { model, ...config },
    });
  }

  /**
   * Load an LM Studio model with streaming progress via SSE.
   * @param {string} model — model key/path
   * @param {object} options — { contextLength, flashAttention, offloadKvCache }
   * @param {object} callbacks — { onProgress(0-1), onComplete(), onError(err) }
   * @returns {Function} abort — call to cancel
   */
  static loadLmStudioModelStream(
    model: string,
    options: Record<string, unknown> = {},
    callbacks: { onProgress?: (pct: number) => void; onComplete?: () => void; onError?: (err: Error) => void } = {},
  ): () => void {
    const { onProgress, onComplete, onError } = callbacks;
    const controller = new AbortController();

    const body = buildLmStudioLoadBody(model, options);

    (async () => {
      // Client-side synthetic progress (asymptotic: approaches 95% over ~15s)
      const EXPECTED_LOAD_MS = 15_000;
      const startTime = Date.now();
      let lastPct = 0;
      const progressInterval = setInterval(() => {
        if (controller.signal.aborted) {
          clearInterval(progressInterval);
          return;
        }
        const elapsed = Date.now() - startTime;
        const pct = Math.min(0.95, elapsed / (elapsed + EXPECTED_LOAD_MS));
        if (pct > lastPct + 0.005) {
          lastPct = pct;
          if (onProgress) onProgress(pct);
        }
      }, 300);

      try {
        if (onProgress) onProgress(0);

        const response = await fetch(`${API_BASE}/lm-studio/load`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (onError)
            onError(new Error(error.message || `HTTP ${response.status}`));
          return;
        }

        if (onProgress) onProgress(1);
        if (onComplete) onComplete();
      } catch (error: unknown) {
        clearInterval(progressInterval);
        if ((error as Error).name === "AbortError") return;
        if (onError) onError(error as Error);
      }
    })();

    return () => controller.abort();
  }

  // ---------------------------------------------------------------------------
  // Benchmarks
  // ---------------------------------------------------------------------------

  /**
   * List all benchmark tests.
   * @returns {Promise<{ benchmarks: Array, count: number }>}
   */
  static async getBenchmarks(): Promise<BenchmarkListResponse> {
    return PrismService._request<BenchmarkListResponse>("/benchmark", { method: "GET" });
  }

  /**
   * Get aggregated model performance stats across all benchmark runs.
   * @returns {Promise<{ models: Array, totalModels: number, totalBenchmarks: number }>}
   */
  static async getBenchmarkStats(): Promise<BenchmarkModelStats> {
    return PrismService._request<BenchmarkModelStats>("/benchmark/stats", { method: "GET" });
  }

  /**
   * Get available conversation models for benchmarking.
   * @returns {Promise<{ models: Array, count: number }>}
   */
  static async getBenchmarkModels(): Promise<{ models: ModelOption[]; count: number }> {
    return PrismService._request<{ models: ModelOption[]; count: number }>("/benchmark/models", { method: "GET" });
  }

  /**
   * Create a new benchmark test.


   */
  static async createBenchmark(data: Omit<Benchmark, "_id" | "createdAt">): Promise<Benchmark> {
    return PrismService._request<Benchmark>("/benchmark", { body: data });
  }

  /**
   * Get a single benchmark test with its latest run.


   */
  static async getBenchmark(id: string): Promise<Benchmark> {
    return PrismService._request<Benchmark>(`/benchmark/${id}`, { method: "GET" });
  }

  /**
   * Delete a benchmark test and all its runs.


   */
  static async deleteBenchmark(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/benchmark/${id}`, { method: "DELETE" });
  }

  /**
   * Run a benchmark against selected models (or all).


   * @returns {Promise<object>} The run result
   */
  static async runBenchmark(id: string, models?: string[]): Promise<BenchmarkRun> {
    return PrismService._request<BenchmarkRun>(`/benchmark/${id}/run`, {
      body: models ? { models } : {},
    });
  }

  /**
   * Stream a benchmark run via SSE, receiving per-model progress events.


   * @returns {Function} abort — call to cancel the stream
   */
  static streamBenchmarkRun(id: string, models?: string[], callbacks: SSECallbacks = {}): () => void {
    return PrismService._streamSSE(
      `/benchmark/${id}/run`,
      { body: models ? { models } : {} },
      callbacks,
    );
  }

  /**
   * Get all past runs for a benchmark.

   * @returns {Promise<{ runs: Array, count: number }>}
   */
  static async getBenchmarkRuns(id: string): Promise<{ runs: BenchmarkRun[]; count: number }> {
    return PrismService._request<{ runs: BenchmarkRun[]; count: number }>(`/benchmark/${id}/runs`, { method: "GET" });
  }

  /**
   * Re-run a specific past run with the same model set.


   */
  static async rerunBenchmark(benchmarkId: string, runId: string): Promise<BenchmarkRun> {
    return PrismService._request<BenchmarkRun>(
      `/benchmark/${benchmarkId}/runs/${runId}/rerun`,
      { body: {} },
    );
  }

  /**
   * Explicitly abort a running benchmark.

   * @returns {Promise<{ aborted: boolean }>}
   */
  static async abortBenchmarkRun(benchmarkId: string): Promise<{ aborted: boolean }> {
    return PrismService._request<{ aborted: boolean }>(`/benchmark/${benchmarkId}/abort`, {
      body: {},
    });
  }

  /**
   * Fetch all benchmark IDs that currently have active (in-progress) runs.
   * @returns {Promise<{ activeIds: string[] }>}
   */
  static async getActiveBenchmarks(): Promise<{ activeIds: string[] }> {
    return PrismService._request<{ activeIds: string[] }>("/benchmark/active-list", { method: "GET" });
  }

  /**
   * Check if a benchmark has an active (in-progress) run.

   * @returns {Promise<{ active: boolean, completedResults?, activeModel?, startedAt? }>}
   */
  static async getBenchmarkActive(id: string): Promise<Record<string, unknown>> {
    return PrismService._request<Record<string, unknown>>(`/benchmark/${id}/active`, { method: "GET" });
  }

  /**
   * Follow an in-progress benchmark run via SSE.
   * Replays completed results first, then streams live events.


   * @returns {Function} abort — call to disconnect
   */
  static followBenchmarkRun(id: string, callbacks: SSECallbacks = {}): () => void {
    return PrismService._streamSSE(
      `/benchmark/${id}/follow`,
      { method: "GET" },
      callbacks,
    );
  }

  // ---------------------------------------------------------------------------
  // Synthesis
  // ---------------------------------------------------------------------------

  /**
   * List all synthesis runs for the current project.

   */
  static async getSynthesisRuns(): Promise<SynthesisRun[]> {
    return PrismService._request<SynthesisRun[]>("/synthesis", { method: "GET" });
  }

  /**
   * Get a single synthesis run by ID.


   */
  static async getSynthesisRun(id: string): Promise<SynthesisRun> {
    return PrismService._request<SynthesisRun>(`/synthesis/${id}`, { method: "GET" });
  }

  /**
   * Create a new synthesis run.


   */
  static async createSynthesisRun(data: Omit<SynthesisRun, "_id" | "createdAt">): Promise<SynthesisRun> {
    return PrismService._request<SynthesisRun>("/synthesis", { body: data });
  }

  /**
   * Delete a synthesis run.


   */
  static async deleteSynthesisRun(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/synthesis/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // VRAM Benchmarks
  // ---------------------------------------------------------------------------

  /**
   * Fetch VRAM benchmark entries with optional filters.

   * @returns {Promise<{ count: number, data: Array }>}
   */
  static async getVramBenchmarks(params: Record<string, string> = {}): Promise<{ count: number; data: VramBenchmarkEntry[] }> {
    const query = new URLSearchParams(params).toString();
    return PrismService._request<{ count: number; data: VramBenchmarkEntry[] }>(
      `/vram-benchmarks${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  /**
   * Fetch distinct machines that have run VRAM benchmarks.
   * @returns {Promise<Array<{ hostname, gpu, gpuVramGB, gpuVendor, cpu, ramGiB, platform, benchmarkCount, lastRun }>>}
   */
  static async getVramBenchmarkMachines(): Promise<VramBenchmarkMachine[]> {
    return PrismService._request<VramBenchmarkMachine[]>("/vram-benchmarks/machines", {
      method: "GET",
    });
  }

  /**
   * Fetch distinct settings labels available in benchmark data.

   */
  static async getVramBenchmarkSettings(): Promise<string[]> {
    return PrismService._request<string[]>("/vram-benchmarks/settings", {
      method: "GET",
    });
  }

  /**
   * Fetch distinct context lengths available in benchmark data.


   */
  static async getVramBenchmarkContexts(params: Record<string, string> = {}): Promise<number[]> {
    const query = new URLSearchParams(params).toString();
    return PrismService._request<number[]>(
      `/vram-benchmarks/contexts${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }
}
