import { PRISM_SERVICE_URL, MINIO_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";

const API_BASE = PRISM_SERVICE_URL;

function getHeaders() {
  return getBaseHeaders();
}

/**
 * Resolve a file reference to a usable URL.
 * Points directly at the MinIO bucket URL for minio:// refs.
 */
function resolveFileRef(ref: any) {
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
  static async _request(endpoint: any, { method = "POST", body }: any = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: getHeaders(),
      cache: "no-store",
      ...(body && { body: JSON.stringify(body) }),
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
  static getFileUrl(ref: any) {
    return resolveFileRef(ref);
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  /**
   * Fetch the Prism configuration (providers, models, defaults).

   */
  static async getConfig() {
    const config = await PrismService._request("/config", { method: "GET" });
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
  static async getLocalConfig() {
    return PrismService._request("/config-local", { method: "GET" });
  }

  /**
   * Merge local provider models into an existing config object (immutable).
   * Returns a new config with local models merged into textToText.models.


   * @returns {object} Updated config
   */
  static mergeLocalModels(config: any, localModels: any) {
    if (!config || !localModels || Object.keys(localModels).length === 0) {
      return config;
    }
    const updated = { ...config };
    const textToText = { ...updated.textToText };
    const existingModels = { ...textToText.models };
    for (const [provider, providerModels] of Object.entries(localModels)) {
      const existing = existingModels[provider] || [];
      const existingKeys = new Set(existing.map((m: any) => m.name));
      const merged = [...existing];
      for (const m of providerModels as any) {
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
  }: any = {}) {
    const svc = service || PrismService;
    const config = await svc.getConfig();

    if (onConfig) onConfig(config);

    // Fire-and-forget local model fetch
    if (config?.localProviders?.length > 0) {
      svc
        .getLocalConfig()
        .then(({ models }: any) => {
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
  static async getBuiltInToolSchemas(agent: any) {
    const qs = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request(`/config/tools${qs}`, { method: "GET" });
  }

  /**
   * Trigger Prism to re-fetch tool schemas from tools-api.
   * @returns {Promise<{ ok: boolean, count: number }>}
   */
  static async refreshBuiltInToolSchemas() {
    return PrismService._request("/config/tools/refresh", { method: "POST" });
  }

  /**
   * Fetch the list of registered agent personas from Prism.
   * @returns {Promise<Array<{ id: string, name: string, project: string, toolCount: number }>>}
   */
  static async getAgentPersonas() {
    return PrismService._request("/config/agents", { method: "GET" });
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Fetch per-model usage stats for the current user.
   * @returns {Promise<Array<{ model, provider, totalRequests }>>}
   */
  static async getModelStats() {
    return PrismService._request("/stats/models", { method: "GET" });
  }

  /**
   * Fetch lifetime usage stats for all tools (aggregated from requests).
   * Returns an array of { tool, totalCalls, totalRequests, totalCost, ... }.

   */
  static async getToolStats() {
    return PrismService._request("/admin/stats/tools", { method: "GET" });
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  /**
   * List conversations with cursor-based pagination.


   * @returns {Promise<{ items: Array, nextCursor: string|null, hasMore: boolean }>}
   */
  static async getConversations({ limit, cursor }: any = {}) {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    const query = qs.toString();
    return PrismService._request(`/conversations${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  }

  /**
   * Get a single conversation by ID.


   */
  static async getConversation(id: any) {
    return PrismService._request(`/conversations/${id}`, { method: "GET" });
  }

  /**
   * Delete a conversation.


   */
  static async deleteConversation(id: any) {
    return PrismService._request(`/conversations/${id}`, { method: "DELETE" });
  }

  /**


  // -- Agent Sessions -----------------------------------------

  /**
   * List agent sessions for a specific project with cursor-based pagination.


   * @returns {Promise<{ items: Array, nextCursor: string|null, hasMore: boolean }>}
   */
  static async getAgentSessions(project: any, { limit, cursor }: any = {}) {
    const qs = new URLSearchParams();
    qs.set("project", project);
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    return PrismService._request(`/agent-sessions?${qs}`, { method: "GET" });
  }

  /**
   * Get a single agent session by ID.


   */
  static async getAgentSession(id: any, project: any) {
    return PrismService._request(
      `/agent-sessions/${id}?project=${encodeURIComponent(project)}`,
      { method: "GET" },
    );
  }

  /**
   * Delete an agent session.


   */
  static async deleteAgentSession(id: any, project: any) {
    return PrismService._request(
      `/agent-sessions/${id}?project=${encodeURIComponent(project)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Append messages to a conversation, auto-creating it if it doesn't exist.


   */
  static async appendMessages(
    id: any,
    messages: any,
    project: any,
    conversationMeta: any,
  ) {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    const body = { messages };
    if (conversationMeta) (body as any).conversationMeta = conversationMeta;
    return PrismService._request(`/conversations/${id}/messages${qs}`, {
      body,
    });
  }

  // ---------------------------------------------------------------------------
  // Custom Tools
  // ---------------------------------------------------------------------------

  /**
   * Fetch favorites, optionally filtered by type.


   */
  static async getFavorites(type: any) {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    return PrismService._request(`/favorites${qs}`, { method: "GET" });
  }

  /**
   * Add a favorite.


   */
  static async addFavorite(type: any, key: any, meta: any = {}) {
    return PrismService._request("/favorites", { body: { type, key, meta } });
  }

  /**
   * Remove a favorite.


   */
  static async removeFavorite(type: any, key: any) {
    return PrismService._request(
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
  static async getCustomTools(project?: any) {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request(`/custom-tools${qs}`, { method: "GET" });
  }

  /**
   * Create a new custom tool.


   */
  static async createCustomTool(tool: any) {
    return PrismService._request("/custom-tools", {
      method: "POST",
      body: tool,
    });
  }

  /**
   * Update an existing custom tool.


   */
  static async updateCustomTool(id: any, updates: any) {
    return PrismService._request(`/custom-tools/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a custom tool.


   */
  static async deleteCustomTool(id: any) {
    return PrismService._request(`/custom-tools/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Custom Agents
  // ---------------------------------------------------------------------------

  /**
   * List all custom agent personas.

   */
  static async getCustomAgents() {
    return PrismService._request("/custom-agents", { method: "GET" });
  }

  /**
   * Create a new custom agent persona.


   */
  static async createCustomAgent(agent: any) {
    return PrismService._request("/custom-agents", {
      method: "POST",
      body: agent,
    });
  }

  /**
   * Update an existing custom agent persona.


   */
  static async updateCustomAgent(id: any, updates: any) {
    return PrismService._request(`/custom-agents/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a custom agent persona.


   */
  static async deleteCustomAgent(id: any) {
    return PrismService._request(`/custom-agents/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  /**
   * List all skills for a project.


   */
  static async getSkills(project: any) {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request(`/skills${qs}`, { method: "GET" });
  }

  /**
   * Create a new skill.


   */
  static async createSkill(skill: any) {
    return PrismService._request("/skills", {
      method: "POST",
      body: skill,
    });
  }

  /**
   * Update an existing skill.


   */
  static async updateSkill(id: any, updates: any) {
    return PrismService._request(`/skills/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a skill.


   */
  static async deleteSkill(id: any) {
    return PrismService._request(`/skills/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // Agent Memories
  // ---------------------------------------------------------------------------

  /**
   * List all agent memories for a project (read-only).


   * @returns {Promise<{ memories: Array, total: number }>}
   */
  static async getAgentMemories(project: any, limit = 100, agent: any) {
    const qs = new URLSearchParams();
    if (project) qs.set("project", project);
    if (limit) qs.set("limit", String(limit));
    if (agent) qs.set("agent", agent);
    return PrismService._request(`/agent-memories?${qs}`, { method: "GET" });
  }

  /**
   * Delete a specific agent memory.

   * @returns {Promise<{ success: boolean }>}
   */
  static async deleteAgentMemory(id: any) {
    return PrismService._request(`/agent-memories/${id}`, { method: "DELETE" });
  }

  /**
   * Trigger memory consolidation for a project.

   * @returns {Promise<object>} Consolidation results
   */
  static async consolidateMemories(project: any, agent: any) {
    return PrismService._request("/agent-memories/consolidate", {
      method: "POST",
      body: { project, ...(agent && { agent }) },
    });
  }

  /**
   * Get consolidation run history for a project.


   * @returns {Promise<{ history: Array }>}
   */
  static async getConsolidationHistory(project: any, limit = 10) {
    const qs = new URLSearchParams();
    if (project) qs.set("project", project);
    if (limit) qs.set("limit", String(limit));
    return PrismService._request(
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
  static async getSettings() {
    return PrismService._request("/settings", { method: "GET" });
  }

  /**
   * Update server-side settings (deep merge).

   * @returns {Promise<object>} Updated settings
   */
  static async updateSettings(data: any) {
    return PrismService._request("/settings", { method: "PUT", body: data });
  }

  /**
   * Get compiled defaults for settings (useful for reset buttons).

   */
  static async getSettingsDefaults() {
    return PrismService._request("/settings/defaults", { method: "GET" });
  }

  /**
   * Fetch available agentic harnesses from the server.
   * @returns {Promise<Array<{ id: string, label: string, description: string }>>}
   */
  static async getHarnesses() {
    return PrismService._request("/settings/harnesses", { method: "GET" });
  }

  // ---------------------------------------------------------------------------
  // MCP Servers
  // ---------------------------------------------------------------------------

  /**
   * List all MCP server configs + live connection status.


   */
  static async getMCPServers(project: any) {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request(`/mcp-servers${qs}`, { method: "GET" });
  }

  /**
   * Add a new MCP server config.


   */
  static async createMCPServer(server: any) {
    return PrismService._request("/mcp-servers", {
      method: "POST",
      body: server,
    });
  }

  /**
   * Update an MCP server config.


   */
  static async updateMCPServer(id: any, updates: any) {
    return PrismService._request(`/mcp-servers/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete an MCP server config.


   */
  static async deleteMCPServer(id: any) {
    return PrismService._request(`/mcp-servers/${id}`, { method: "DELETE" });
  }

  /**
   * Connect to an MCP server.

   * @returns {Promise<{ success, serverName, toolCount, tools }>}
   */
  static async connectMCPServer(id: any) {
    return PrismService._request(`/mcp-servers/${id}/connect`, {
      method: "POST",
    });
  }

  /**
   * Disconnect from an MCP server.

   * @returns {Promise<{ success }>}
   */
  static async disconnectMCPServer(id: any) {
    return PrismService._request(`/mcp-servers/${id}/disconnect`, {
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
  static async getCoordinatorWorkers(agentSessionId: any) {
    const qs = agentSessionId
      ? `?agentSessionId=${encodeURIComponent(agentSessionId)}`
      : "";
    return PrismService._request(`/coordinator/workers${qs}`, {
      method: "GET",
    });
  }

  /**
   * Abort all running workers for a given agent session.

   * @returns {Promise<{ stopped: string[], alreadyStopped: string[] }>}
   */
  static async stopCoordinatorWorkers(agentSessionId: any) {
    return PrismService._request("/coordinator/workers/stop", {
      body: { agentSessionId },
    });
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  /**
   * Generate text (non-streaming).


   */
  static async generateText(payload: any) {
    return PrismService._request("/chat?stream=false", { body: payload });
  }

  /**
   * Generate text via the agentic endpoint (non-streaming).
   * Routes through /agent which enables the AgenticLoopService
   * (tool orchestration, planning, approval, etc.).


   */
  static async generateAgentText(payload: any) {
    return PrismService._request("/agent?stream=false", {
      body: { ...payload, agent: payload.agent || "CODING" },
    });
  }

  /**
   * Send an approval/rejection response for a pending agentic tool or plan.


   * @returns {Promise<{ ok: boolean, approved: boolean }>}
   */
  static async sendApprovalResponse(
    agentSessionId: any,
    approved: any,
    { approveAll }: any = {},
  ) {
    return PrismService._request("/agent/approve", {
      body: { agentSessionId, approved, ...(approveAll && { approveAll }) },
    });
  }

  /**
   * Submit answer(s) to a pending ask_user_question tool call.

   * @param {string|Array<{ answer: string|string[], annotations?: string }>} answerOrAnswers
   *   Simple string for single-question backward compat, or structured answers array.
   * @returns {Promise<{ ok: boolean }>}
   */
  static async sendUserQuestionAnswer(
    agentSessionId: any,
    answerOrAnswers: any,
  ) {
    // Normalize: structured array vs simple string
    const body = { agentSessionId };
    if (Array.isArray(answerOrAnswers)) {
      (body as any).answers = answerOrAnswers;
    } else {
      (body as any).answer = String(answerOrAnswers);
    }
    return PrismService._request("/agent/answer", { body });
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
    endpoint: any,
    { method = "POST", body }: any = {},
    callbacks: any = {},
  ) {
    const { onError } = callbacks;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
          method,
          headers: getHeaders(),
          ...(body && { body: JSON.stringify(body) }),
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
            } catch (parseErr: any) {
              if (json.length > 0) {
                console.warn(
                  `[PrismService] SSE JSON parse failed (${json.length} chars):`,
                  parseErr.message,
                  json.slice(0, 120),
                );
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name === "AbortError") return;
        if (onError) onError(error);
      }
    })();

    return () => controller.abort();
  }

  /**
   * Dispatch a single parsed SSE event object to the matching callback.
   * Centralises the type → handler mapping shared by chat, agent, and
   * benchmark streams.
   */
  static _dispatchSSE(data: any, callbacks: any) {
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
        onChunk?.(data.content, data._sourceModel, data.outputCharacters);
        break;
      case "thinking":
        onThinking?.(data.content, data._sourceModel, data.outputCharacters);
        break;
      case "image":
        onImage?.(data.data, data.mimeType, data.minioRef);
        break;
      case "audio":
        onAudio?.(data.data, data.mimeType);
        break;
      case "executableCode":
        onExecutableCode?.(data.code, data.language);
        break;
      case "codeExecutionResult":
        onCodeExecutionResult?.(data.output, data.outcome);
        break;
      case "webSearchResult":
        onWebSearchResult?.(data.results);
        break;
      case "toolCall":
        onToolCall?.({
          id: data.id,
          name: data.name,
          args: data.args,
          result: data.result,
          status: data.status,
          thoughtSignature: data.thoughtSignature,
          _sourceModel: data._sourceModel,
        });
        break;
      case "tool_execution":
        onToolExecution?.({ ...data });
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
        onError?.(new Error(data.message));
        break;
      default:
        break;
    }
  }

  /**
   * Stream text generation via SSE (Server-Sent Events).


   * @returns {Function} abort - Call to cancel the stream early
   */
  static streamText(payload: any, callbacks: any) {
    return PrismService._streamSSE("/chat", { body: payload }, callbacks);
  }

  /**
   * Stream agentic text generation via SSE — hits the /agent endpoint
   * which enables the AgenticLoopService (tool orchestration, planning,
   * approval gates, etc.). Identical callback interface to streamText().
   *


   * @returns {Function} abort - Call to cancel the stream early
   */
  static streamAgentText(payload: any, callbacks: any) {
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
  static async generateImage(payload: any) {
    const {
      prompt,
      images,
      systemPrompt,
      conversationId,
      conversationMeta,
      ...rest
    } = payload;
    const userMessage = {
      role: "user",
      content: prompt || "",
    };

    if (images?.length > 0) {
      (userMessage as any).images = images.map((image: any) => {
        if (typeof image === "string") return image;
        return `data:${image.mimeType || "image/png"};base64,${image.imageData}`;
      });
    }

    const body = {
      ...rest,
      messages: [userMessage],
    };
    if (systemPrompt) body.systemPrompt = systemPrompt;
    if (conversationId) body.conversationId = conversationId;
    if (conversationMeta) body.conversationMeta = conversationMeta;

    return PrismService._request("/chat?stream=false", { body });
  }

  /**
   * Caption / describe an image (image-to-text).

   * @returns {Promise<{ text: string }>}
   */
  static async captionImage(payload: any) {
    return PrismService._request("/chat?stream=false", { body: payload });
  }

  /**
   * Transcribe an audio file to text.

   * @returns {Promise<{ text, usage?, estimatedCost?, totalTime? }>}
   */
  static async transcribeAudio(payload: any) {
    return PrismService._request("/audio-to-text", { body: payload });
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
  static async generateSpeech(payload: any) {
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
  static async generateEmbedding(payload: any) {
    return PrismService._request("/embed", { body: payload });
  }

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------

  /**
   * List all saved workflows (metadata only).

   */
  static async getWorkflows() {
    return PrismService._request("/workflows?source=prism-client", {
      method: "GET",
    });
  }

  /**
   * Get a single workflow by ID (full document).


   */
  static async getWorkflow(id: any) {
    return PrismService._request(`/workflows/${id}`, { method: "GET" });
  }

  /**
   * Create a new workflow.

   * @returns {Promise<{ success: boolean, id: string }>}
   */
  static async saveWorkflow(workflow: any) {
    return PrismService._request("/workflows", {
      body: { ...workflow, source: "prism-client" },
    });
  }

  /**
   * Update an existing workflow.


   * @returns {Promise<{ success: boolean }>}
   */
  static async updateWorkflow(id: any, workflow: any) {
    return PrismService._request(`/workflows/${id}`, {
      method: "PUT",
      body: workflow,
    });
  }

  /**
   * Delete a workflow.

   * @returns {Promise<{ success: boolean }>}
   */
  static async deleteWorkflow(id: any) {
    return PrismService._request(`/workflows/${id}`, { method: "DELETE" });
  }

  /**
   * Append conversation IDs to a workflow (generated during execution).


   * @returns {Promise<{ success: boolean }>}
   */
  static async patchWorkflowConversations(id: any, conversationIds: any) {
    return PrismService._request(`/workflows/${id}/conversations`, {
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
  static async getMedia(params = {}) {
    const query = new URLSearchParams(params).toString();
    return PrismService._request(`/media${query ? `?${query}` : ""}`, {
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
  static async getText(params = {}) {
    const query = new URLSearchParams(params).toString();
    return PrismService._request(`/text${query ? `?${query}` : ""}`, {
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
  static async getLmStudioModels() {
    return PrismService._request("/lm-studio/models", { method: "GET" });
  }

  /**
   * Load a model into LM Studio with optional configuration.


   */
  static async loadLmStudioModel(model: any, options = {}) {
    return PrismService._request("/lm-studio/load", {
      body: buildLmStudioLoadBody(model, options),
    });
  }

  /**
   * Unload a model from LM Studio memory.


   */
  static async unloadLmStudioModel(instanceId: any) {
    return PrismService._request("/lm-studio/unload", {
      body: { instance_id: instanceId },
    });
  }

  /**
   * Estimate VRAM usage for an LM Studio model.
   * @param {string} model — model key/path
   * @param {object} config — { contextLength, gpuLayers, flashAttention, offloadKvCache }
   * @returns {Promise<{ gpuGiB: number, totalGiB: number, archParams: object, totalLayers: number }>}
   */
  static async estimateLmStudioMemory(model: any, config = {}) {
    return PrismService._request("/lm-studio/estimate", {
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
    model: any,
    options = {},
    callbacks: any = {},
  ) {
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
      } catch (error: any) {
        clearInterval(progressInterval);
        if (error.name === "AbortError") return;
        if (onError) onError(error);
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
  static async getBenchmarks() {
    return PrismService._request("/benchmark", { method: "GET" });
  }

  /**
   * Get aggregated model performance stats across all benchmark runs.
   * @returns {Promise<{ models: Array, totalModels: number, totalBenchmarks: number }>}
   */
  static async getBenchmarkStats() {
    return PrismService._request("/benchmark/stats", { method: "GET" });
  }

  /**
   * Get available conversation models for benchmarking.
   * @returns {Promise<{ models: Array, count: number }>}
   */
  static async getBenchmarkModels() {
    return PrismService._request("/benchmark/models", { method: "GET" });
  }

  /**
   * Create a new benchmark test.


   */
  static async createBenchmark(data: any) {
    return PrismService._request("/benchmark", { body: data });
  }

  /**
   * Get a single benchmark test with its latest run.


   */
  static async getBenchmark(id: any) {
    return PrismService._request(`/benchmark/${id}`, { method: "GET" });
  }

  /**
   * Delete a benchmark test and all its runs.


   */
  static async deleteBenchmark(id: any) {
    return PrismService._request(`/benchmark/${id}`, { method: "DELETE" });
  }

  /**
   * Run a benchmark against selected models (or all).


   * @returns {Promise<object>} The run result
   */
  static async runBenchmark(id: any, models: any) {
    return PrismService._request(`/benchmark/${id}/run`, {
      body: models ? { models } : {},
    });
  }

  /**
   * Stream a benchmark run via SSE, receiving per-model progress events.


   * @returns {Function} abort — call to cancel the stream
   */
  static streamBenchmarkRun(id: any, models: any, callbacks = {}) {
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
  static async getBenchmarkRuns(id: any) {
    return PrismService._request(`/benchmark/${id}/runs`, { method: "GET" });
  }

  /**
   * Re-run a specific past run with the same model set.


   */
  static async rerunBenchmark(benchmarkId: any, runId: any) {
    return PrismService._request(
      `/benchmark/${benchmarkId}/runs/${runId}/rerun`,
      { body: {} },
    );
  }

  /**
   * Explicitly abort a running benchmark.

   * @returns {Promise<{ aborted: boolean }>}
   */
  static async abortBenchmarkRun(benchmarkId: any) {
    return PrismService._request(`/benchmark/${benchmarkId}/abort`, {
      body: {},
    });
  }

  /**
   * Fetch all benchmark IDs that currently have active (in-progress) runs.
   * @returns {Promise<{ activeIds: string[] }>}
   */
  static async getActiveBenchmarks() {
    return PrismService._request("/benchmark/active-list", { method: "GET" });
  }

  /**
   * Check if a benchmark has an active (in-progress) run.

   * @returns {Promise<{ active: boolean, completedResults?, activeModel?, startedAt? }>}
   */
  static async getBenchmarkActive(id: any) {
    return PrismService._request(`/benchmark/${id}/active`, { method: "GET" });
  }

  /**
   * Follow an in-progress benchmark run via SSE.
   * Replays completed results first, then streams live events.


   * @returns {Function} abort — call to disconnect
   */
  static followBenchmarkRun(id: any, callbacks = {}) {
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
  static async getSynthesisRuns() {
    return PrismService._request("/synthesis", { method: "GET" });
  }

  /**
   * Get a single synthesis run by ID.


   */
  static async getSynthesisRun(id: any) {
    return PrismService._request(`/synthesis/${id}`, { method: "GET" });
  }

  /**
   * Create a new synthesis run.


   */
  static async createSynthesisRun(data: any) {
    return PrismService._request("/synthesis", { body: data });
  }

  /**
   * Delete a synthesis run.


   */
  static async deleteSynthesisRun(id: any) {
    return PrismService._request(`/synthesis/${id}`, { method: "DELETE" });
  }

  // ---------------------------------------------------------------------------
  // VRAM Benchmarks
  // ---------------------------------------------------------------------------

  /**
   * Fetch VRAM benchmark entries with optional filters.

   * @returns {Promise<{ count: number, data: Array }>}
   */
  static async getVramBenchmarks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return PrismService._request(
      `/vram-benchmarks${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  /**
   * Fetch distinct machines that have run VRAM benchmarks.
   * @returns {Promise<Array<{ hostname, gpu, gpuVramGB, gpuVendor, cpu, ramGiB, platform, benchmarkCount, lastRun }>>}
   */
  static async getVramBenchmarkMachines() {
    return PrismService._request("/vram-benchmarks/machines", {
      method: "GET",
    });
  }

  /**
   * Fetch distinct settings labels available in benchmark data.

   */
  static async getVramBenchmarkSettings() {
    return PrismService._request("/vram-benchmarks/settings", {
      method: "GET",
    });
  }

  /**
   * Fetch distinct context lengths available in benchmark data.


   */
  static async getVramBenchmarkContexts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return PrismService._request(
      `/vram-benchmarks/contexts${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }
}
