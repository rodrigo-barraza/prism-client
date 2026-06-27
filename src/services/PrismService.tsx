import { AGENT_IDS, EV_PRISM_SETTINGS_UPDATED } from "@/constants";
import { SERVER_SENT_EVENT_TYPES } from "@rodrigo-barraza/utilities-library/taxonomy";
import { PRISM_SERVICE_URL, MINIO_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { getErrorMessage } from "../utils/errorMessage";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";
import type {
  PrismConfig,
  ModelOption,
  Conversation,
  ConversationListResponse,
  ConversationMeta,
  Message,
  AgentConversation,
  AgentConversationListResponse,
  CustomAgent,
  AgentPersona,
  Skill,
  Rule,
  AgentMemory,
  AgentMemoryListResponse,
  PrismSettings,
  MCPServer,
  CoordinatorSubAgent,
  Favorite,
  ToolSchema,
  Benchmark,
  BenchmarkPreset,
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
  LlamaCppServerProps,
  ModelUsageStat,
  ToolUsageStat,
  ChatPayload,
  ChatGenerationResult,
  ImageGenerationPayload,
  ImageGenerationResult,
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
  Prompt,
  ScheduledTask,
  ConversationTimer,
  TopologyDefinition,
  ThoughtStructureDefinition,
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
  static async _request<T = unknown>(
    endpoint: string,
    { method = "POST", body }: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: getHeaders(),
      cache: "no-store",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || `Prism API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Resolve a file reference (minio:// or data URL) to a renderable URL.
   */
  static getFileUrl(ref: string): string {
    return resolveFileRef(ref);
  }

  /**
   * Upload a base64 data URL to MinIO file storage.
   * Returns the MinIO ref, a resolved URL for tool consumption,
   * file size in bytes, and the detected content type.
   */
  static async uploadFile(
    dataUrl: string,
  ): Promise<{ ref: string; url: string; size: number; contentType: string }> {
    const result = await PrismService._request<{
      ref: string;
      size: number;
      contentType: string;
    }>("/files/upload", {
      body: { data: dataUrl },
    });
    return {
      ...result,
      url: resolveFileRef(result.ref),
    };
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  /**
   * Fetch the Prism configuration (providers, models, defaults).

   */
  static async getConfig(): Promise<PrismConfig> {
    const config = await PrismService._request<PrismConfig>("/config", {
      method: "GET",
    });
    // Register local provider metadata (nicknames, instance numbers)
    // on every config fetch — enables resolveProviderLabel() globally
    if (config?.localProviders) {
      setLocalProviderMeta(config.localProviders);
    }
    return config;
  }


  /**
   * Unified config loading: fetches the full config with local models
   * merged server-side via GET /config?includeLocal=true.
   *
   * Fires onConfig immediately, then onLocalMerge with the same config
   * (which already includes local models) to maintain the existing
   * callback contract for all consumers.
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
    const config = await svc._request<PrismConfig>("/config?includeLocal=true", { method: "GET" });

    if (config?.localProviders) {
      setLocalProviderMeta(config.localProviders);
    }

    if (onConfig) onConfig(config);
    if (onLocalMerge) onLocalMerge(config);

    return config;
  }

  /**
   * Fetch built-in tool schemas from Prism.
   * Optionally filter by agent persona (e.g. "CODING" returns only agent-enabled tools).


   */
  static async getBuiltInToolSchemas(agent?: string): Promise<ToolSchema[]> {
    const queryString = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request<ToolSchema[]>(`/config/tools${queryString}`, {
      method: "GET",
    });
  }

  /**
   * Trigger Prism to re-fetch tool schemas from tools-api.
   */
  static async refreshBuiltInToolSchemas(): Promise<{
    ok: boolean;
    count: number;
  }> {
    return PrismService._request<{ ok: boolean; count: number }>(
      "/config/tools/refresh",
      { method: "POST" },
    );
  }

  /**
   * Fetch the assembled system prompt for a given agent/tool/workspace
   * configuration without making any LLM calls. Used by the Raw view
   * to display a live preview on new conversations.
   */
  static async previewSystemPrompt(options: {
    agent?: string | null;
    disabledTools?: string[];
    workspaceEnabled?: boolean;
    systemPrompt?: string;
    locale?: string;
  }): Promise<{ prompt: string; characterCount: number; estimatedTokens: number }> {
    return PrismService._request<{
      prompt: string;
      characterCount: number;
      estimatedTokens: number;
    }>("/config/system-prompt-preview", {
      method: "POST",
      body: options,
    });
  }

  /**
   * Fetch the list of registered agent personas from Prism.
   */
  static async getAgentPersonas(): Promise<AgentPersona[]> {
    return PrismService._request<AgentPersona[]>("/config/agents", {
      method: "GET",
    });
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Fetch per-model usage stats for the current user.
   */
  static async getModelStats(): Promise<ModelUsageStat[]> {
    return PrismService._request<ModelUsageStat[]>("/stats/models", {
      method: "GET",
    });
  }

  /**
   * Fetch lifetime usage stats for all tools (aggregated from requests).
   * Returns an array of { tool, totalCalls, totalRequests, totalCost, ... }.

   */
  static async getToolStats(): Promise<ToolUsageStat[]> {
    return PrismService._request<ToolUsageStat[]>("/admin/stats/tools", {
      method: "GET",
    });
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  /**
   * List conversations with cursor-based pagination.


   */
  static async getConversations({
    limit,
    cursor,
  }: {
    limit?: number;
    cursor?: string;
  } = {}): Promise<ConversationListResponse> {
    const queryString = new URLSearchParams();
    if (limit) queryString.set("limit", String(limit));
    if (cursor) queryString.set("cursor", cursor);
    const query = queryString.toString();
    return PrismService._request<ConversationListResponse>(
      `/conversations${query ? `?${query}` : ""}`,
      {
        method: "GET",
      },
    );
  }

  /**
   * Get a single conversation by ID.


   */
  static async getConversation(id: string): Promise<Conversation> {
    return PrismService._request<Conversation>(`/conversations/${id}`, {
      method: "GET",
    });
  }

  /**
   * Delete a conversation.


   */
  static async deleteConversation(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/conversations/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Fetch all active scheduled reminders for a specific conversation.
   */
  static async getConversationTimers(id: string): Promise<ConversationTimer[]> {
    return PrismService._request<ConversationTimer[]>(`/conversations/${id}/timers`, {
      method: "GET",
    });
  }

  /**
   * Cancel a specific scheduled reminder.
   */
  static async cancelConversationTimer(
    id: string,
    timerId: string,
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/conversations/${id}/timers/${timerId}/cancel`,
      { method: "POST" },
    );
  }

  /**


  // -- Agent Conversations ------------------------------------

  /**
   * List agent conversations for a specific project with cursor-based pagination.


   */
  static async getAgentConversations(
    project: string,
    {
      limit,
      cursor,
      agent,
    }: { limit?: number; cursor?: string; agent?: string } = {},
  ): Promise<AgentConversationListResponse> {
    const queryString = new URLSearchParams();
    queryString.set("type", "agent");
    queryString.set("project", project);
    if (agent) queryString.set("agent", agent);
    if (limit) queryString.set("limit", String(limit));
    if (cursor) queryString.set("cursor", cursor);
    return PrismService._request<AgentConversationListResponse>(
      `/conversations?${queryString}`,
      { method: "GET" },
    );
  }

  /**
   * Get a single agent conversation by ID.


   */
  static async getAgentConversation(
    id: string,
    project: string,
  ): Promise<AgentConversation> {
    return PrismService._request<AgentConversation>(
      `/conversations/${id}?project=${encodeURIComponent(project)}`,
      { method: "GET" },
    );
  }

  /**
   * Delete an agent conversation.


   */
  static async deleteAgentConversation(
    id: string,
    project: string,
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/conversations/${id}?project=${encodeURIComponent(project)}`,
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
    const queryString = project
      ? `?project=${encodeURIComponent(project)}`
      : "";
    const body: { messages: Message[]; conversationMeta?: ConversationMeta } = {
      messages,
    };
    if (conversationMeta) body.conversationMeta = conversationMeta;
    return PrismService._request<{ success: boolean }>(
      `/conversations/${id}/messages${queryString}`,
      {
        body,
      },
    );
  }

  /**
   * Patch conversation or agent conversation.
   */
  static async patchConversation(
    id: string,
    updates: {
      title?: string;
      systemPrompt?: string;
      settings?: Record<string, unknown>;
    },
    project?: string,
  ): Promise<Conversation> {
    const queryString = project
      ? `?project=${encodeURIComponent(project)}`
      : "";
    return PrismService._request<Conversation>(`/conversations/${id}${queryString}`, {
      method: "PATCH",
      body: updates,
    });
  }

  // ---------------------------------------------------------------------------
  // Custom Tools
  // ---------------------------------------------------------------------------

  /**
   * Fetch favorites, optionally filtered by type.


   */
  static async getFavorites(type?: string): Promise<Favorite[]> {
    const queryString = type ? `?type=${encodeURIComponent(type)}` : "";
    return PrismService._request<Favorite[]>(`/favorites${queryString}`, {
      method: "GET",
    });
  }

  /**
   * Add a favorite.


   */
  static async addFavorite(
    type: string,
    key: string,
    meta: Record<string, string | number | boolean> = {},
  ): Promise<Favorite> {
    return PrismService._request<Favorite>("/favorites", {
      body: { type, key, meta },
    });
  }

  /**
   * Remove a favorite.


   */
  static async removeFavorite(
    type: string,
    key: string,
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/favorites?type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
  }


  // ---------------------------------------------------------------------------
  // Custom Agents
  // ---------------------------------------------------------------------------

  /**
   * List all custom agent personas.

   */
  static async getCustomAgents(): Promise<CustomAgent[]> {
    return PrismService._request<CustomAgent[]>("/custom-agents", {
      method: "GET",
    });
  }

  /**
   * Create a new custom agent persona.


   */
  static async createCustomAgent(
    agent: Omit<CustomAgent, "_id">,
  ): Promise<CustomAgent> {
    return PrismService._request<CustomAgent>("/custom-agents", {
      method: "POST",
      body: agent,
    });
  }

  /**
   * Update an existing custom agent persona.


   */
  static async updateCustomAgent(
    id: string,
    updates: Partial<CustomAgent>,
  ): Promise<CustomAgent> {
    return PrismService._request<CustomAgent>(`/custom-agents/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a custom agent persona.


   */
  static async deleteCustomAgent(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/custom-agents/${id}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  /**
   * List all skills for a project.


   */
  static async getSkills(project?: string): Promise<Skill[]> {
    const queryString = project
      ? `?project=${encodeURIComponent(project)}`
      : "";
    return PrismService._request<Skill[]>(`/skills${queryString}`, {
      method: "GET",
    });
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
  static async updateSkill(
    id: string,
    updates: Partial<Skill>,
  ): Promise<Skill> {
    return PrismService._request<Skill>(`/skills/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete a skill.


   */
  static async deleteSkill(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/skills/${id}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Rules (Per-Agent Slash Commands)
  // ---------------------------------------------------------------------------

  static async getRules(agent?: string): Promise<Rule[]> {
    const queryString = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request<Rule[]>(`/rules${queryString}`, {
      method: "GET",
    });
  }

  static async createRule(rule: Omit<Rule, "_id">): Promise<Rule> {
    return PrismService._request<Rule>("/rules", {
      method: "POST",
      body: rule,
    });
  }

  static async updateRule(id: string, updates: Partial<Rule>): Promise<Rule> {
    return PrismService._request<Rule>(`/rules/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  static async deleteRule(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/rules/${id}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Agent Memories
  // ---------------------------------------------------------------------------

  /**
   * List all agent memories for a project (read-only).


   */
  static async getAgentMemories(
    project?: string,
    limit = 100,
    agent?: string,
    skip = 0,
    type?: string,
  ): Promise<AgentMemoryListResponse> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (limit) queryString.set("limit", String(limit));
    if (agent) queryString.set("agent", agent);
    if (skip) queryString.set("skip", String(skip));
    if (type) queryString.set("type", type);
    return PrismService._request<AgentMemoryListResponse>(
      `/agent-memories?${queryString}`,
      { method: "GET" },
    );
  }

  /**
   * Delete a specific agent memory.

   */
  static async deleteAgentMemory(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/agent-memories/${id}`,
      { method: "DELETE" },
    );
  }

  /**
   * Trigger memory consolidation for a project.

   */
  static async consolidateMemories(
    project: string,
    agent?: string,
  ): Promise<{ merged: number; created: number }> {
    return PrismService._request<{ merged: number; created: number }>(
      "/agent-memories/consolidate",
      {
        method: "POST",
        body: { project, ...(agent ? { agent } : {}) },
      },
    );
  }

  /**
   * Get consolidation run history for a project.


   */
  static async getConsolidationHistory(
    project?: string,
    limit = 10,
  ): Promise<{
    history: Array<{
      _id: string;
      project: string;
      createdAt: string;
      merged: number;
      created: number;
    }>;
  }> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (limit) queryString.set("limit", String(limit));
    return PrismService._request<{
      history: Array<{
        _id: string;
        project: string;
        createdAt: string;
        merged: number;
        created: number;
      }>;
    }>(`/agent-memories/consolidation-history?${queryString}`, {
      method: "GET",
    });
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

   */
  static async updateSettings(
    data: Partial<PrismSettings>,
  ): Promise<PrismSettings> {
    const updatedSettings = await PrismService._request<PrismSettings>("/settings", {
      method: "PUT",
      body: data,
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(EV_PRISM_SETTINGS_UPDATED, { detail: updatedSettings })
      );
    }
    return updatedSettings;
  }

  /**
   * Get compiled defaults for settings (useful for reset buttons).

   */
  static async getSettingsDefaults(): Promise<PrismSettings> {
    return PrismService._request<PrismSettings>("/settings/defaults", {
      method: "GET",
    });
  }

  /**
   * Fetch available agentic harnesses from the server.
   */
  static async getHarnesses(): Promise<AgenticHarness[]> {
    return PrismService._request<AgenticHarness[]>("/settings/harnesses", {
      method: "GET",
    });
  }

  /**
   * Fetch available prompt locale options from the server.
   */
  static async getAvailableLocales(): Promise<{ value: string; label: string }[]> {
    return PrismService._request<{ value: string; label: string }[]>("/config/locales", {
      method: "GET",
    });
  }

  // ---------------------------------------------------------------------------
  // Topologies
  // ---------------------------------------------------------------------------

  static async getTopologies(): Promise<TopologyDefinition[]> {
    return PrismService._request<TopologyDefinition[]>("/topologies", {
      method: "GET",
    });
  }

  // ---------------------------------------------------------------------------
  // Thought Structures
  // ---------------------------------------------------------------------------

  static async getThoughtStructures(): Promise<ThoughtStructureDefinition[]> {
    return PrismService._request<ThoughtStructureDefinition[]>("/thought-structures", {
      method: "GET",
    });
  }

  static getWorkspaceAgentDownloadUrl(): string {
    return `${API_BASE}/workspaces/download/agent`;
  }

  static getWorkspaceAgentPlatformDownloadUrl(platform: string): string {
    return `${API_BASE}/workspaces/download/agent?platform=${encodeURIComponent(platform)}`;
  }

  static getWorkspaceAgentTrayAppDownloadUrl(platform: string): string {
    return `${API_BASE}/workspaces/download/tray-app?platform=${encodeURIComponent(platform)}`;
  }

  // ---------------------------------------------------------------------------
  // MCP Servers
  // ---------------------------------------------------------------------------

  /**
   * List all MCP server configs + live connection status.


   */
  static async getMCPServers(project?: string): Promise<MCPServer[]> {
    const queryString = project
      ? `?project=${encodeURIComponent(project)}`
      : "";
    return PrismService._request<MCPServer[]>(`/mcp-servers${queryString}`, {
      method: "GET",
    });
  }

  /**
   * Add a new MCP server config.


   */
  static async createMCPServer(
    server: Omit<MCPServer, "_id">,
  ): Promise<MCPServer> {
    return PrismService._request<MCPServer>("/mcp-servers", {
      method: "POST",
      body: server,
    });
  }

  /**
   * Update an MCP server config.


   */
  static async updateMCPServer(
    id: string,
    updates: Partial<MCPServer>,
  ): Promise<MCPServer> {
    return PrismService._request<MCPServer>(`/mcp-servers/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete an MCP server config.


   */
  static async deleteMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/mcp-servers/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Connect to an MCP server.

   */
  static async connectMCPServer(
    id: string,
  ): Promise<{
    success: boolean;
    serverName: string;
    toolCount: number;
    tools: Array<{ name: string; description?: string }>;
  }> {
    return PrismService._request<{
      success: boolean;
      serverName: string;
      toolCount: number;
      tools: Array<{ name: string; description?: string }>;
    }>(`/mcp-servers/${id}/connect`, {
      method: "POST",
    });
  }

  /**
   * Disconnect from an MCP server.

   */
  static async disconnectMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/mcp-servers/${id}/disconnect`,
      {
        method: "POST",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Coordinator Sub-Agents
  // ---------------------------------------------------------------------------

  static async getCoordinatorSubAgents(
    conversationId?: string,
  ): Promise<{ subAgents: CoordinatorSubAgent[] }> {
    const queryString = conversationId
      ? `?conversationId=${encodeURIComponent(conversationId)}`
      : "";
    interface SubAgentsResponse {
      subAgents: Array<{
        agentId: string;
        description: string;
        status: string;
        providerName?: string;
        resolvedModel?: string;
        durationMs: number;
        toolUses: number;
        hasChanges: boolean;
        totalCost?: number | null;
        branchName?: string | null;
        files?: string[];
        toolCallCount?: number;
        recursionDepth?: number;
        toolNames?: Record<string, number>;
      }>;
    }
    const response = await PrismService._request<SubAgentsResponse>(
      `/orchestrator/sub-agents${queryString}`,
      {
        method: "GET",
      },
    );
    const subAgentsList = response.subAgents || [];
    const mappedSubAgentsList = subAgentsList.map((subAgent) => ({
      id: subAgent.agentId,
      agentId: subAgent.agentId,
      agentConversationId: conversationId || "",
      status: subAgent.status,
      description: subAgent.description,
      resolvedModel: subAgent.resolvedModel,
      provider: subAgent.providerName,
      durationMs: subAgent.durationMs,
      totalCost: subAgent.totalCost ?? undefined,
      toolCallCount: subAgent.toolCallCount ?? subAgent.toolUses,
      branchName: subAgent.branchName ?? undefined,
      files: subAgent.files,
      recursionDepth: subAgent.recursionDepth,
      toolNames: subAgent.toolNames,
    }));
    return { subAgents: mappedSubAgentsList };
  }

  // Abort all running sub-agents for a given agent conversation.
  static async stopCoordinatorSubAgents(
    conversationId: string,
  ): Promise<{ stopped: string[]; alreadyStopped: string[] }> {
    return PrismService._request<{
      stopped: string[];
      alreadyStopped: string[];
    }>("/orchestrator/sub-agents/stop", {
      method: "POST",
      body: { conversationId },
    });
  }

  /**
   * Explicitly stop a running agentic session on the backend.
   * Decoupled from SSE connection lifecycle so mobile browser disconnections
   * don't abort background processing — only this explicit call does.
   */
  static async stopGeneration(
    conversationId: string,
  ): Promise<{ ok: boolean; stopped: boolean }> {
    return PrismService._request<{ ok: boolean; stopped: boolean }>(
      "/agent/stop",
      {
        method: "POST",
        body: { conversationId },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Cron Jobs
  // ---------------------------------------------------------------------------

  /**
   * Fetch all cron jobs.
   */
  static async getCronJobs(): Promise<ScheduledTask[]> {
    return PrismService._request<ScheduledTask[]>("/scheduled-tasks", { method: "GET" });
  }

  static async getAllCronJobs(): Promise<ScheduledTask[]> {
    return PrismService._request<ScheduledTask[]>("/scheduled-tasks/all", { method: "GET" });
  }

  static async getTaskConversations(
    project: string,
    taskId: string,
    limit = 50,
  ): Promise<AgentConversationListResponse> {
    const queryString = new URLSearchParams();
    queryString.set("type", "agent");
    queryString.set("project", project);
    queryString.set("taskId", taskId);
    queryString.set("limit", String(limit));
    return PrismService._request<AgentConversationListResponse>(
      `/conversations?${queryString}`,
      { method: "GET" },
    );
  }

  /**
   * Create a cron job.
   */
  static async createCronJob(
    task: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "project" | "enabled"> & {
      project?: string;
      enabled?: boolean;
    },
  ): Promise<ScheduledTask> {
    return PrismService._request<ScheduledTask>("/scheduled-tasks", {
      method: "POST",
      body: task,
    });
  }

  /**
   * Update an existing cron job (e.g. toggle enabled).
   */
  static async updateCronJob(
    id: string,
    updates: Partial<ScheduledTask>,
  ): Promise<ScheduledTask> {
    return PrismService._request<ScheduledTask>(`/scheduled-tasks/${id}`, {
      method: "PATCH",
      body: updates,
    });
  }

  /**
   * Delete a cron job.
   */
  static async deleteCronJob(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/scheduled-tasks/${id}`,
      {
        method: "DELETE",
      },
    );
  }

  /**
   * Trigger a cron job immediately in the background.
   */
  static async triggerCronJob(
    id: string,
  ): Promise<{ success: boolean; agentConversationId: string }> {
    return PrismService._request<{ success: boolean; agentConversationId: string }>(
      `/scheduled-tasks/${id}/trigger`,
      {
        method: "POST",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  /**
   * Generate text (non-streaming).


   */
  static async generateText(
    payload: ChatPayload,
  ): Promise<ChatGenerationResult> {
    return PrismService._request<ChatGenerationResult>("/chat?stream=false", {
      body: payload,
    });
  }

  /**
   * Generate text via the agentic endpoint (non-streaming).
   * Routes through /agent which enables the AgenticLoopService
   * (tool orchestration, planning, approval, etc.).


   */
  static async generateAgentText(
    payload: ChatPayload,
  ): Promise<ChatGenerationResult> {
    return PrismService._request<ChatGenerationResult>("/agent?stream=false", {
      body: { ...payload, agent: payload.agent || AGENT_IDS.CODING },
    });
  }

  /**
   * Send an approval/rejection response for a pending agentic tool or plan.


   */
  static async sendApprovalResponse(
    conversationId: string,
    approved: boolean,
    { approveAll }: { approveAll?: boolean } = {},
  ): Promise<ApprovalResponse> {
    return PrismService._request<ApprovalResponse>("/agent/approve", {
      body: { conversationId, approved, ...(approveAll ? { approveAll } : {}) },
    });
  }

  /**
   * Submit answer(s) to a pending ask_user tool call.

   */
  static async sendUserQuestionAnswer(
    conversationId: string,
    answerOrAnswers:
      | string
      | Array<{ answer: string | string[]; annotations?: string }>,
  ): Promise<{ ok: boolean }> {
    // Normalize: structured array vs simple string
    const body: {
      conversationId: string;
      answer?: string;
      answers?: Array<{ answer: string | string[]; annotations?: string }>;
    } = { conversationId };
    if (Array.isArray(answerOrAnswers)) {
      body.answers = answerOrAnswers;
    } else {
      body.answer = String(answerOrAnswers);
    }
    return PrismService._request<{ ok: boolean }>("/agent/answer", { body });
  }

  /**
   * Upload a video/webcam frame for the active agentic conversation.
   */
  static async uploadVisionFrame(
    conversationId: string,
    frameDataUrl: string,
  ): Promise<{ ok: boolean }> {
    return PrismService._request<{ ok: boolean }>(
      `/agent/conversation/${conversationId}/frame`,
      {
        method: "POST",
        body: { frameDataUrl },
      },
    );
  }

  /**
   * Stream text generation via SSE (Server-Sent Events).


   */
  /**
   * Generic SSE stream helper — handles fetch, ReadableStream parsing, and
   * callback dispatch for any SSE endpoint.  All public stream* methods
   * delegate here so the protocol logic lives in exactly one place.
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
          if (done) {
            console.debug(
              `[SSE] stream reader done, remaining buffer=${buffer.length}ch`,
            );
            break;
          }

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
              if (
                data.type === SERVER_SENT_EVENT_TYPES.TOOL_EXECUTION ||
                data.type === SERVER_SENT_EVENT_TYPES.TOOL_CALL ||
                data.type === SERVER_SENT_EVENT_TYPES.DONE ||
                data.type === SERVER_SENT_EVENT_TYPES.ERROR
              ) {
                console.debug(
                  `[SSE dispatch] type=${data.type} status=${data.status || ""} tool=${data.tool?.name || data.name || ""} (${json.length}ch)`,
                );
              }
              PrismService._dispatchSSE(data, callbacks);
            } catch (parseError: unknown) {
              if (json.length > 0) {
                console.warn(
                  `[PrismService] SSE JSON parse failed (${json.length} chars):`,
                  getErrorMessage(parseError),
                  json.slice(0, 200),
                );
              }
            }
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error(`[SSE] stream error:`, error);
        if (onError)
          onError(
            error instanceof Error ? error : new Error(getErrorMessage(error)),
          );
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
      onSubAgentToolExecution,
      onSubAgentToolOutput,
      onSubAgentStatus,
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
      case SERVER_SENT_EVENT_TYPES.CHUNK:
        onChunk?.(
          data.content as string,
          data._sourceModel as string | undefined,
          data.outputCharacters as number | undefined,
        );
        break;
      case SERVER_SENT_EVENT_TYPES.THINKING:
        onThinking?.(
          data.content as string,
          data._sourceModel as string | undefined,
          data.outputCharacters as number | undefined,
        );
        break;
      case SERVER_SENT_EVENT_TYPES.IMAGE:
        onImage?.(
          data.data as string,
          data.mimeType as string,
          data.minioRef as string | undefined,
        );
        break;
      case SERVER_SENT_EVENT_TYPES.AUDIO:
        onAudio?.(data.data as string, data.mimeType as string);
        break;
      case SERVER_SENT_EVENT_TYPES.EXECUTABLE_CODE:
        onExecutableCode?.(data.code as string, data.language as string);
        break;
      case SERVER_SENT_EVENT_TYPES.CODE_EXECUTION_RESULT:
        onCodeExecutionResult?.(data.output as string, data.outcome as string);
        break;
      case SERVER_SENT_EVENT_TYPES.WEB_SEARCH_RESULT:
        onWebSearchResult?.(data.results as WebSearchResult[]);
        break;
      case SERVER_SENT_EVENT_TYPES.TOOL_CALL:
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
      case SERVER_SENT_EVENT_TYPES.TOOL_EXECUTION:
        onToolExecution?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.TOOL_OUTPUT:
        onToolOutput?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.APPROVAL_REQUIRED:
        onApprovalRequired?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.PLAN_PROPOSAL:
        onPlanProposal?.(data);
        break;
      // Sub-agent events — forwarded from spawned sub-agents
      case SERVER_SENT_EVENT_TYPES.SUB_AGENT_TOOL_EXECUTION:
        onSubAgentToolExecution?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.SUB_AGENT_TOOL_OUTPUT:
        onSubAgentToolOutput?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.SUB_AGENT_STATUS:
        onSubAgentStatus?.(data);
        break;
      // Prism-local agentic events
      case SERVER_SENT_EVENT_TYPES.USER_QUESTION:
        onUserQuestion?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.TODO_UPDATE:
        onTodoUpdate?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.BRIEF_UPDATE:
        onBriefUpdate?.(data);
        break;
      // Benchmark-specific events
      case SERVER_SENT_EVENT_TYPES.RUN_INFO:
        onRunInfo?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.MODEL_START:
        onModelStart?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.MODEL_COMPLETE:
        onModelComplete?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.RUN_COMPLETE:
        onRunComplete?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.USAGE_UPDATE:
        onUsageUpdate?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.STATUS:
        onStatus?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.DONE:
        onDone?.(data);
        break;
      case SERVER_SENT_EVENT_TYPES.ERROR:
        onError?.(new Error(data.message as string));
        break;
      default:
        break;
    }
  }

  /**
   * Stream text generation via SSE (Server-Sent Events).


   */
  static streamText(payload: ChatPayload, callbacks: SSECallbacks): () => void {
    return PrismService._streamSSE("/chat", { body: payload }, callbacks);
  }

  /**
   * Stream agentic text generation via SSE — hits the /agent endpoint
   * which enables the AgenticLoopService (tool orchestration, planning,
   * approval gates, etc.). Identical callback interface to streamText().
   */
  static streamAgentText(
    payload: ChatPayload,
    callbacks: SSECallbacks,
  ): () => void {
    return PrismService._streamSSE(
      "/agent",
      { body: { ...payload, agent: payload.agent || AGENT_IDS.CODING } },
      callbacks,
    );
  }

  /**
   * Generate an image from text.

   */
  static async generateImage(
    payload: ImageGenerationPayload,
  ): Promise<ImageGenerationResult> {
    const {
      prompt,
      images,
      systemPrompt,
      conversationId,
      conversationMeta,
      ...rest
    } = payload;
    const userMessage: { role: string; content: string; images?: string[] } = {
      role: "user",
      content: prompt || "",
    };

    if (images?.length && images.length > 0) {
      userMessage.images = images.map((image) => {
        if (typeof image === "string") return image;
        return `data:${image.mimeType || "image/png"};base64,${image.imageData}`;
      });
    }

    const body: {
      model: string;
      provider: string;
      messages: (typeof userMessage)[];
      systemPrompt?: string;
      conversationId?: string;
      conversationMeta?: ConversationMeta;
    } & Record<string, unknown> = {
      ...rest,
      messages: [userMessage],
    };
    if (systemPrompt) body.systemPrompt = systemPrompt;
    if (conversationId) body.conversationId = conversationId;
    if (conversationMeta) body.conversationMeta = conversationMeta;

    return PrismService._request<ImageGenerationResult>("/chat?stream=false", {
      body,
    });
  }

  /**
   * Caption / describe an image (image-to-text).

   */
  static async captionImage(
    payload: ChatPayload,
  ): Promise<ChatGenerationResult> {
    return PrismService._request<ChatGenerationResult>("/chat?stream=false", {
      body: payload,
    });
  }

  /**
   * Transcribe an audio file to text.

   */
  static async transcribeAudio(
    payload: TranscriptionPayload,
  ): Promise<TranscriptionResponse> {
    return PrismService._request<TranscriptionResponse>("/audio-to-text", {
      body: payload,
    });
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------

  /**
   * Generate speech from text (TTS).
   * Uses ?format=dataUrl so the backend returns the audio as a base64 data URL
   * directly, eliminating client-side ArrayBuffer→Base64 conversion.

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

   */
  static async generateEmbedding(
    payload: EmbeddingPayload,
  ): Promise<EmbeddingResponse> {
    return PrismService._request<EmbeddingResponse>("/embed", {
      body: payload,
    });
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
    return PrismService._request<Workflow>(`/workflows/${id}`, {
      method: "GET",
    });
  }

  /**
   * Create a new workflow.

   */
  static async saveWorkflow(
    workflow: Omit<Workflow, "_id">,
  ): Promise<{ success: boolean; id: string }> {
    return PrismService._request<{ success: boolean; id: string }>(
      "/workflows",
      {
        body: { ...workflow, source: "prism-client" },
      },
    );
  }

  /**
   * Update an existing workflow.


   */
  static async updateWorkflow(
    id: string,
    workflow: Partial<Workflow>,
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/workflows/${id}`, {
      method: "PUT",
      body: workflow,
    });
  }

  /**
   * Delete a workflow.

   */
  static async deleteWorkflow(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/workflows/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Append conversation IDs to a workflow (generated during execution).


   */
  static async patchWorkflowConversations(
    id: string,
    conversationIds: string[],
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/workflows/${id}/conversations`,
      {
        method: "PATCH",
        body: { conversationIds },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Media
  // ---------------------------------------------------------------------------

  /**
   * List media items from the caller's project conversations.

   */
  static async getMedia(
    params: Record<string, string | number | boolean> = {},
  ): Promise<MediaListResponse> {
    const stringParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) stringParams[key] = String(value);
    const query = new URLSearchParams(stringParams).toString();
    return PrismService._request<MediaListResponse>(
      `/media${query ? `?${query}` : ""}`,
      {
        method: "GET",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------

  /**
   * List text content from the caller's project conversations.

   */
  static async getText(
    params: Record<string, string | number | boolean> = {},
  ): Promise<TextListResponse> {
    const stringParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) stringParams[key] = String(value);
    const query = new URLSearchParams(stringParams).toString();
    return PrismService._request<TextListResponse>(
      `/text${query ? `?${query}` : ""}`,
      {
        method: "GET",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // LM Studio
  // ---------------------------------------------------------------------------

  /**
   * List all LM Studio models (loaded + downloaded).
   */
  static async getLmStudioModels(instanceId?: string): Promise<{ models: LmStudioModel[] }> {
    const queryString = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : "";
    return PrismService._request<{ models: LmStudioModel[] }>(
      `/lm-studio/models${queryString}`,
      { method: "GET" },
    );
  }

  /**
   * Fetch rich runtime metadata from a llama.cpp server instance:
   * context configuration, slot utilization, sampling defaults,
   * model path, chat template, and modality flags.
   *
   * Returns null on error (server unreachable, non-llama-cpp instance, etc.)
   */
  static async getLlamaCppServerProps(
    instanceId?: string,
  ): Promise<LlamaCppServerProps | null> {
    try {
      const queryString = instanceId
        ? `?instance=${encodeURIComponent(instanceId)}`
        : "";
      return await PrismService._request<LlamaCppServerProps>(
        `/lm-studio/server-props${queryString}`,
        { method: "GET" },
      );
    } catch {
      return null;
    }
  }

  /**
   * List all Ollama models (loaded + downloaded).
   */
  static async getOllamaModels(instanceId?: string): Promise<{ models: LmStudioModel[] }> {
    const queryString = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : "";
    return PrismService._request<{ models: LmStudioModel[] }>(
      `/ollama/models${queryString}`,
      { method: "GET" },
    );
  }

  /**
   * Load a model into LM Studio with optional configuration.


   */
  static async loadLmStudioModel(
    model: string,
    options: {
      contextLength?: number;
      flashAttention?: boolean;
      offloadKvCache?: boolean;
      evalBatchSize?: number;
    } = {},
  ): Promise<{ success: boolean; instance_id?: string }> {
    return PrismService._request<{ success: boolean; instance_id?: string }>(
      "/lm-studio/load",
      {
        body: buildLmStudioLoadBody(model, options),
      },
    );
  }

  /**
   * Unload a model from LM Studio memory.


   */
  static async unloadLmStudioModel(
    instanceId: string,
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>("/lm-studio/unload", {
      body: { instance_id: instanceId },
    });
  }

  /**
   * Estimate VRAM usage for an LM Studio model.
   */
  static async estimateLmStudioMemory(
    model: string,
    config: {
      contextLength?: number;
      flashAttention?: boolean;
      offloadKvCache?: boolean;
      evalBatchSize?: number;
    } = {},
  ): Promise<LmStudioVramEstimate> {
    return PrismService._request<LmStudioVramEstimate>("/lm-studio/estimate", {
      body: { model, ...config },
    });
  }

  /**
   * Load an LM Studio model with streaming progress via SSE.
   */
  static loadLmStudioModelStream(
    model: string,
    options: {
      contextLength?: number;
      flashAttention?: boolean;
      offloadKvCache?: boolean;
      evalBatchSize?: number;
    } = {},
    callbacks: {
      onProgress?: (percentage: number) => void;
      onComplete?: () => void;
      onError?: (error: Error) => void;
    } = {},
  ): () => void {
    const { onProgress, onComplete, onError } = callbacks;
    const controller = new AbortController();

    const body = buildLmStudioLoadBody(model, options);

    (async () => {
      // Client-side synthetic progress (asymptotic: approaches 95% over ~15s)
      const EXPECTED_LOAD_MS = 15_000;
      const startTime = Date.now();
      let lastPercentage = 0;
      const progressInterval = setInterval(() => {
        if (controller.signal.aborted) {
          clearInterval(progressInterval);
          return;
        }
        const elapsed = Date.now() - startTime;
        const percentage = Math.min(
          0.95,
          elapsed / (elapsed + EXPECTED_LOAD_MS),
        );
        if (percentage > lastPercentage + 0.005) {
          lastPercentage = percentage;
          if (onProgress) onProgress(percentage);
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
        if (error instanceof Error && error.name === "AbortError") return;
        if (onError)
          onError(
            error instanceof Error ? error : new Error(getErrorMessage(error)),
          );
      }
    })();

    return () => controller.abort();
  }

  // ---------------------------------------------------------------------------
  // Benchmarks
  // ---------------------------------------------------------------------------

  /**
   * Fetch industry-standard benchmark presets from the server.
   */
  static async getBenchmarkPresets(): Promise<BenchmarkPreset[]> {
    const response = await PrismService._request<{ presets: BenchmarkPreset[]; count: number }>("/benchmark/presets", {
      method: "GET",
    });
    return response.presets;
  }

  /**
   * List all benchmark tests.
   */
  static async getBenchmarks(): Promise<BenchmarkListResponse> {
    return PrismService._request<BenchmarkListResponse>("/benchmark", {
      method: "GET",
    });
  }

  /**
   * Get aggregated model performance stats across all benchmark runs.
   */
  static async getBenchmarkStats(): Promise<BenchmarkModelStats> {
    return PrismService._request<BenchmarkModelStats>("/benchmark/stats", {
      method: "GET",
    });
  }

  /**
   * Get available conversation models for benchmarking.
   */
  static async getBenchmarkModels(): Promise<{
    models: ModelOption[];
    count: number;
  }> {
    return PrismService._request<{ models: ModelOption[]; count: number }>(
      "/benchmark/models",
      { method: "GET" },
    );
  }

  /**
   * Create a new benchmark test.


   */
  static async createBenchmark(
    data: Omit<Benchmark, "_id" | "createdAt">,
  ): Promise<Benchmark> {
    return PrismService._request<Benchmark>("/benchmark", { body: data });
  }

  /**
   * Get a single benchmark test with its latest run.


   */
  static async getBenchmark(id: string): Promise<Benchmark> {
    return PrismService._request<Benchmark>(`/benchmark/${id}`, {
      method: "GET",
    });
  }

  /**
   * Delete a benchmark test and all its runs.


   */
  static async deleteBenchmark(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/benchmark/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Run a benchmark against selected models (or all).


   */
  static async runBenchmark(
    id: string,
    models?: string[],
  ): Promise<BenchmarkRun> {
    return PrismService._request<BenchmarkRun>(`/benchmark/${id}/run`, {
      body: models ? { models } : {},
    });
  }

  /**
   * Stream a benchmark run via SSE, receiving per-model progress events.


   */
  static streamBenchmarkRun(
    id: string,
    models?: Array<{
      provider: string;
      model: string;
      display_name?: string;
      thinkingEnabled?: boolean;
      toolsEnabled?: boolean;
      agent?: string;
    }>,
    callbacks: SSECallbacks = {},
  ): () => void {
    return PrismService._streamSSE(
      `/benchmark/${id}/run`,
      { body: models ? { models } : {} },
      callbacks,
    );
  }

  /**
   * Get all past runs for a benchmark.

   */
  static async getBenchmarkRuns(
    id: string,
  ): Promise<{ runs: BenchmarkRun[]; count: number }> {
    return PrismService._request<{ runs: BenchmarkRun[]; count: number }>(
      `/benchmark/${id}/runs`,
      { method: "GET" },
    );
  }

  /**
   * Re-run a specific past run with the same model set.


   */
  static async rerunBenchmark(
    benchmarkId: string,
    runId: string,
  ): Promise<BenchmarkRun> {
    return PrismService._request<BenchmarkRun>(
      `/benchmark/${benchmarkId}/runs/${runId}/rerun`,
      { body: {} },
    );
  }

  /**
   * Explicitly abort a running benchmark.

   */
  static async abortBenchmarkRun(
    benchmarkId: string,
  ): Promise<{ aborted: boolean }> {
    return PrismService._request<{ aborted: boolean }>(
      `/benchmark/${benchmarkId}/abort`,
      {
        body: {},
      },
    );
  }

  /**
   * Fetch all benchmark IDs that currently have active (in-progress) runs.
   */
  static async getActiveBenchmarks(): Promise<{ activeIds: string[] }> {
    return PrismService._request<{ activeIds: string[] }>(
      "/benchmark/active-list",
      { method: "GET" },
    );
  }

  /**
   * Check if a benchmark has an active (in-progress) run.

   */
  static async getBenchmarkActive(
    id: string,
  ): Promise<{ active: boolean; runId?: string }> {
    return PrismService._request<{ active: boolean; runId?: string }>(
      `/benchmark/${id}/active`,
      { method: "GET" },
    );
  }

  /**
   * Follow an in-progress benchmark run via SSE.
   * Replays completed results first, then streams live events.


   */
  static followBenchmarkRun(
    id: string,
    callbacks: SSECallbacks = {},
  ): () => void {
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
    return PrismService._request<SynthesisRun[]>("/synthesis", {
      method: "GET",
    });
  }

  /**
   * Get a single synthesis run by ID.


   */
  static async getSynthesisRun(id: string): Promise<SynthesisRun> {
    return PrismService._request<SynthesisRun>(`/synthesis/${id}`, {
      method: "GET",
    });
  }

  /**
   * Create a new synthesis run.


   */
  static async createSynthesisRun(
    data: Omit<SynthesisRun, "_id" | "createdAt">,
  ): Promise<SynthesisRun> {
    return PrismService._request<SynthesisRun>("/synthesis", { body: data });
  }

  /**
   * Delete a synthesis run.


   */
  static async deleteSynthesisRun(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/synthesis/${id}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // VRAM Benchmarks
  // ---------------------------------------------------------------------------

  /**
   * Fetch VRAM benchmark entries with optional filters.

   */
  static async getVramBenchmarks(
    params: Record<string, string> = {},
  ): Promise<{ count: number; data: VramBenchmarkEntry[] }> {
    const query = new URLSearchParams(params).toString();
    return PrismService._request<{ count: number; data: VramBenchmarkEntry[] }>(
      `/vram-benchmarks${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  /**
   * Fetch distinct machines that have run VRAM benchmarks.
   */
  static async getVramBenchmarkMachines(): Promise<VramBenchmarkMachine[]> {
    return PrismService._request<VramBenchmarkMachine[]>(
      "/vram-benchmarks/machines",
      {
        method: "GET",
      },
    );
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
  static async getVramBenchmarkContexts(
    params: Record<string, string> = {},
  ): Promise<number[]> {
    const query = new URLSearchParams(params).toString();
    return PrismService._request<number[]>(
      `/vram-benchmarks/contexts${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

  static async getPrompts(
    params: Record<string, string | number | boolean> = {},
  ): Promise<{ data: Prompt[]; total: number; page: number; limit: number }> {
    const stringParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) stringParams[key] = String(value);
    const query = new URLSearchParams(stringParams).toString();
    return PrismService._request<{ data: Prompt[]; total: number; page: number; limit: number }>(
      `/prompts${query ? `?${query}` : ""}`,
      { method: "GET" },
    );
  }

  static async getPrompt(id: string): Promise<Prompt> {
    return PrismService._request<Prompt>(`/prompts/${id}`, { method: "GET" });
  }

  static async createPrompt(data: {
    title: string;
    content: string;
    tags?: string[];
    color?: string;
  }): Promise<Prompt> {
    return PrismService._request<Prompt>("/prompts", {
      method: "POST",
      body: data,
    });
  }

  static async updatePrompt(
    id: string,
    updates: Partial<{ title: string; content: string; tags: string[]; color: string }>,
  ): Promise<Prompt> {
    return PrismService._request<Prompt>(`/prompts/${id}`, {
      method: "PATCH",
      body: updates,
    });
  }

  static async deletePrompt(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/prompts/${id}`, {
      method: "DELETE",
    });
  }
}
