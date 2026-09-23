import { EVENT_NAME_PRISM_SETTINGS_UPDATED, HTTP_METHODS, HEADER_PROFILE_ID } from "@/constants";
import { reportViewerVisibility } from "./viewerVisibility";
import { SERVER_SENT_EVENT_TYPES, IDENTITY_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { PRISM_SERVICE_URL, PRISM_WEBSOCKET_URL, MINIO_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { getErrorMessage } from "../utils/errorMessage";
import { cursorFor } from "../utils/liveTurnCursor";
import { parseStreamEvent, sourceModelOf, type StreamProtocol } from "./protocolEvents";
import { StreamError } from "../types/types";
import { openLiveViewerSocket, type LiveSocketState } from "./liveViewerSocket";
import type { TurnInputResponse } from "../utils/turnInputRouting";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";
import { hydrateToolEmojiCache } from "../components/WorkflowNodeConstantsComponent";
import type {
  PrismConfig,
  ModelOption,
  Conversation,
  ConversationGoal,
  ConversationGoalBudget,
  ConversationListResponse,
  ConversationMeta,
  Message,
  AgentConversation,
  AgentConversationListResponse,
  CustomAgent,
  AgentPersona,
  Skill,
  Rule,
  Hook,
  HookTestResult,
  ProjectInstructions,
  ProjectInstructionsVersion,
  AgentMemoryListResponse,
  AgentMemoryFacets,
  PrismSettings,
  MCPServer,
  MCPQuarantinedTool,
  MCPOAuthStatus,
  MCPPrompt,
  MCPResource,
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
  ArtifactListResponse,
  ArtifactItem,
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
  StreamEvent,
  ApprovalResponse,
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  AgenticHarness,
  Prompt,
  ScheduledTask,
  ConversationTimer,
  TopologyDefinition,
  ThoughtStructureDefinition,
  ContextBudget,
  LiveConversationStatus,
  LiveConversationStatusResponse,
  WorkflowMemoryListResponse,
} from "../types/types";

const API_BASE = PRISM_SERVICE_URL;

function getHeaders() {
  return getBaseHeaders();
}

/**
 * Resolve a file reference to a usable URL — a pure minio://key → URL prefix
 * swap (direct bucket URL when configured, else the backend /files proxy).
 *
 * Key repair lives server-side: FileService.normalizeKey (prism-service)
 * normalizes keys on reads, and served displayMessages arrive pre-cleaned.
 */
function resolveFileReference(fileReference: string): string {
  if (typeof fileReference === "string" && fileReference.startsWith("minio://")) {
    const key = fileReference.replace("minio://", "");
    const base = MINIO_URL || `${API_BASE}/files`;
    return `${base}/${key}`;
  }
  return fileReference;
}

export default class PrismService {
  /**
   * Shared fetch helper — centralises request / error handling.


   */
  static async _request<T = unknown>(
    endpoint: string,
    { method = HTTP_METHODS.POST, body }: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: getHeaders(),
      cache: "no-store",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // `status` rides on the Error so callers can branch on 404 / 409
      // without parsing the message (see PrismRequestError).
      throw Object.assign(
        new Error(error.error || error.message || `Prism API error: ${response.status}`),
        { status: response.status, reason: error.reason as string | undefined },
      );
    }

    return response.json();
  }

  /**
   * Resolve a file reference (minio:// or data URL) to a renderable URL.
   */
  static getFileUrl(fileReference: string): string {
    return resolveFileReference(fileReference);
  }

  /**
   * Upload a base64 data URL to MinIO file storage.
   * Returns the MinIO ref, a resolved URL for tool consumption,
   * file size in bytes, and the detected content type.
   */
  static async uploadFile(
    dataUrl: string,
  ): Promise<{ reference: string; url: string; size: number; contentType: string }> {
    const result = await PrismService._request<{
      reference: string;
      size: number;
      contentType: string;
    }>("/files/upload", {
      body: { data: dataUrl },
    });
    return {
      ...result,
      url: resolveFileReference(result.reference),
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
      method: HTTP_METHODS.GET,
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
    serviceInstance,
  }: {
    onConfig?: (_config: PrismConfig) => void;
    onLocalMerge?: (_config: PrismConfig) => void;
    serviceInstance?: typeof PrismService;
  } = {}): Promise<PrismConfig> {
    const service = serviceInstance || PrismService;
    const config = await service._request<PrismConfig>("/config?includeLocal=true", { method: HTTP_METHODS.GET });

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
    const schemas = await PrismService._request<ToolSchema[]>(`/config/tools${queryString}`, {
      method: HTTP_METHODS.GET,
    });
    hydrateToolEmojiCache(schemas);
    return schemas;
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
      { method: HTTP_METHODS.POST },
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
    model?: string;
  }): Promise<{
    prompt: string;
    characterCount: number;
    estimatedTokens: number;
    baselineBudget?: ContextBudget;
  }> {
    return PrismService._request<{
      prompt: string;
      characterCount: number;
      estimatedTokens: number;
      baselineBudget?: ContextBudget;
    }>("/config/system-prompt-preview", {
      method: HTTP_METHODS.POST,
      body: options,
    });
  }

  /**
   * Fetch the list of registered agent personas from Prism.
   */
  static async getAgentPersonas(): Promise<AgentPersona[]> {
    return PrismService._request<AgentPersona[]>("/config/agents", {
      method: HTTP_METHODS.GET,
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Fetch lifetime usage stats for all tools (aggregated from requests).
   * Returns an array of { tool, totalCalls, totalRequests, totalCost, ... }.

   */
  static async getToolStats(): Promise<ToolUsageStat[]> {
    return PrismService._request<ToolUsageStat[]>("/admin/stats/tools", {
      method: HTTP_METHODS.GET,
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
        method: HTTP_METHODS.GET,
      },
    );
  }

  /**
   * Get a single conversation by ID.


   */
  static async getConversation(id: string): Promise<Conversation> {
    return PrismService._request<Conversation>(`/conversations/${id}`, {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Lightweight lifecycle-flag snapshot for pollers — avoids fetching the
   * full conversation document (displayMessages payload) every tick.
   */
  static async getConversationStatus(id: string): Promise<{
    id: string;
    isActive?: boolean;
    isGenerating?: boolean;
    pendingBackgroundTasks?: number;
    updatedAt?: string;
    type: "direct" | "agent";
  }> {
    return PrismService._request(`/conversations/${id}/status`, {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Delete a conversation.


   */
  static async deleteConversation(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/conversations/${id}`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  /**
   * Fetch all active scheduled reminders for a specific conversation.
   */
  static async getConversationTimers(id: string): Promise<ConversationTimer[]> {
    return PrismService._request<ConversationTimer[]>(`/conversations/${id}/timers`, {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Fetch the real-time generation status from the backend's in-memory registry.
   * Returns the live status object if the conversation is actively generating,
   * or null if it is not.
   */
  static async getConversationLiveStatus(
    conversationId: string,
  ): Promise<LiveConversationStatus | null> {
    const response = await PrismService._request<LiveConversationStatusResponse>(
      `/conversations/${conversationId}/live-status`,
      { method: HTTP_METHODS.GET },
    );
    return response.active ? response : null;
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
      { method: HTTP_METHODS.POST },
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
      { method: HTTP_METHODS.GET },
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
      { method: HTTP_METHODS.GET },
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
      { method: HTTP_METHODS.DELETE },
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
      /** Replaces the stored message array. */
      messages?: Message[];
    },
    project?: string,
  ): Promise<Conversation> {
    const queryString = project
      ? `?project=${encodeURIComponent(project)}`
      : "";
    return PrismService._request<Conversation>(`/conversations/${id}${queryString}`, {
      method: HTTP_METHODS.PATCH,
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
      method: HTTP_METHODS.GET,
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
      { method: HTTP_METHODS.DELETE },
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Create a new custom agent persona.


   */
  static async createCustomAgent(
    agent: Omit<CustomAgent, "_id">,
  ): Promise<CustomAgent> {
    return PrismService._request<CustomAgent>("/custom-agents", {
      method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.PUT,
      body: updates,
    });
  }

  /**
   * Delete a custom agent persona.


   */
  static async deleteCustomAgent(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/custom-agents/${id}`, {
      method: HTTP_METHODS.DELETE,
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Create a new skill.


   */
  static async createSkill(skill: Omit<Skill, "_id">): Promise<Skill> {
    return PrismService._request<Skill>("/skills", {
      method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.PUT,
      body: updates,
    });
  }

  /**
   * Delete a skill.


   */
  static async deleteSkill(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/skills/${id}`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  // ---------------------------------------------------------------------------
  // Rules (Per-Agent Slash Commands)
  // ---------------------------------------------------------------------------

  static async getRules(agent?: string): Promise<Rule[]> {
    const queryString = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request<Rule[]>(`/rules${queryString}`, {
      method: HTTP_METHODS.GET,
    });
  }

  static async createRule(rule: Omit<Rule, "_id">): Promise<Rule> {
    return PrismService._request<Rule>("/rules", {
      method: HTTP_METHODS.POST,
      body: rule,
    });
  }

  static async updateRule(id: string, updates: Partial<Rule>): Promise<Rule> {
    return PrismService._request<Rule>(`/rules/${id}`, {
      method: HTTP_METHODS.PUT,
      body: updates,
    });
  }

  static async deleteRule(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/rules/${id}`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  // ---------------------------------------------------------------------------
  // Hooks (Configurable Lifecycle Handlers)
  // ---------------------------------------------------------------------------

  /**
   * List hooks, optionally narrowed to one agent and/or one lifecycle event.
   * Project / username scoping is implicit via the identity headers.
   */
  static async getHooks(agent?: string, event?: string): Promise<Hook[]> {
    const queryString = new URLSearchParams();
    if (agent) queryString.set("agent", agent);
    if (event) queryString.set("event", event);
    const query = queryString.toString();
    return PrismService._request<Hook[]>(
      `/hooks${query ? `?${query}` : ""}`,
      { method: HTTP_METHODS.GET },
    );
  }

  static async createHook(hook: Omit<Hook, "_id">): Promise<Hook> {
    return PrismService._request<Hook>("/hooks", {
      method: HTTP_METHODS.POST,
      body: hook,
    });
  }

  static async updateHook(id: string, updates: Partial<Hook>): Promise<Hook> {
    return PrismService._request<Hook>(`/hooks/${encodeURIComponent(id)}`, {
      method: HTTP_METHODS.PUT,
      body: updates,
    });
  }

  static async deleteHook(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/hooks/${encodeURIComponent(id)}`,
      { method: HTTP_METHODS.DELETE },
    );
  }

  /**
   * Dry-run one hook against a sample event payload — returns the decision the
   * handler produced plus how long it took, without touching a live session.
   */
  static async testHook(
    id: string,
    payload?: Record<string, unknown>,
  ): Promise<HookTestResult> {
    return PrismService._request<HookTestResult>(
      `/hooks/${encodeURIComponent(id)}/test`,
      { method: HTTP_METHODS.POST, body: { payload } },
    );
  }

  // ---------------------------------------------------------------------------
  // Project Instructions (PRISM.md)
  // ---------------------------------------------------------------------------

  /**
   * Fetch the single self-updating instructions doc for the current scope.
   * Omit `agent` for the project-wide doc.
   */
  static async getProjectInstructions(
    agent?: string,
  ): Promise<ProjectInstructions> {
    const queryString = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request<ProjectInstructions>(
      `/project-instructions${queryString}`,
      { method: HTTP_METHODS.GET },
    );
  }

  /** Replace the doc body — the server closes the old version and bumps. */
  static async updateProjectInstructions(
    content: string,
    agent?: string,
  ): Promise<ProjectInstructions> {
    return PrismService._request<ProjectInstructions>("/project-instructions", {
      method: HTTP_METHODS.PUT,
      body: { content, agent },
    });
  }

  /** Superseded revisions, newest first. */
  static async getProjectInstructionsVersions(
    agent?: string,
    limit?: number,
  ): Promise<ProjectInstructionsVersion[]> {
    const queryString = new URLSearchParams();
    if (agent) queryString.set("agent", agent);
    if (limit) queryString.set("limit", String(limit));
    const query = queryString.toString();
    return PrismService._request<ProjectInstructionsVersion[]>(
      `/project-instructions/versions${query ? `?${query}` : ""}`,
      { method: HTTP_METHODS.GET },
    );
  }

  /** Restore an earlier revision as a new current version. */
  static async rollbackProjectInstructions(
    version: number,
    agent?: string,
  ): Promise<ProjectInstructions> {
    return PrismService._request<ProjectInstructions>(
      "/project-instructions/rollback",
      { method: HTTP_METHODS.POST, body: { version, agent } },
    );
  }

  static async deleteProjectInstructions(
    agent?: string,
  ): Promise<{ success: boolean }> {
    const queryString = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    return PrismService._request<{ success: boolean }>(
      `/project-instructions${queryString}`,
      { method: HTTP_METHODS.DELETE },
    );
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
    aboutUserId?: string,
    sourceUserId?: string,
    includeSuperseded = false,
    quarantined = false,
  ): Promise<AgentMemoryListResponse> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (limit) queryString.set("limit", String(limit));
    if (agent) queryString.set("agent", agent);
    if (skip) queryString.set("skip", String(skip));
    if (type) queryString.set("type", type);
    if (aboutUserId) queryString.set("aboutUserId", aboutUserId);
    if (sourceUserId) queryString.set("sourceUserId", sourceUserId);
    if (includeSuperseded) queryString.set("includeSuperseded", "true");
    if (quarantined) queryString.set("quarantined", "true");
    return PrismService._request<AgentMemoryListResponse>(
      `/agent-memories?${queryString}`,
      { method: HTTP_METHODS.GET },
    );
  }

  /**
   * Undo a consolidation run by runId — reopens the memories it soft-closed
   * and invalidates the merged docs it created.
   */
  static async rollbackConsolidation(
    runId: string,
  ): Promise<{ rolledBack: boolean; reason?: string; reopened?: number }> {
    return PrismService._request<{
      rolledBack: boolean;
      reason?: string;
      reopened?: number;
    }>("/agent-memories/consolidation-rollback", {
      method: HTTP_METHODS.POST,
      body: { runId },
    });
  }

  /**
   * Distinct memory types and Discord users (about/source) with counts —
   * powers the Memories tab filter dropdown.
   */
  static async getAgentMemoryFacets(
    project?: string,
    agent?: string,
  ): Promise<AgentMemoryFacets> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (agent) queryString.set("agent", agent);
    return PrismService._request<AgentMemoryFacets>(
      `/agent-memories/facets?${queryString}`,
      { method: HTTP_METHODS.GET },
    );
  }

  /**
   * Decide on a quarantined memory: accept makes it live (it keeps its
   * provenance), reject closes it for good.
   */
  static async reviewAgentMemory(
    id: string,
    decision: "accept" | "reject",
  ): Promise<{ success: boolean; decision: "accept" | "reject" }> {
    return PrismService._request<{ success: boolean; decision: "accept" | "reject" }>(
      `/agent-memories/${id}/review`,
      { method: HTTP_METHODS.POST, body: { decision } },
    );
  }

  /** Decide every memory awaiting review in a project (optionally one agent's). */
  static async reviewAllAgentMemories(
    project: string,
    agent: string | undefined,
    decision: "accept" | "reject",
  ): Promise<{ success: boolean; decision: "accept" | "reject"; reviewed: number }> {
    const queryString = new URLSearchParams({ project });
    if (agent) queryString.set("agent", agent);
    return PrismService._request<{
      success: boolean;
      decision: "accept" | "reject";
      reviewed: number;
    }>(`/agent-memories/review-all?${queryString}`, {
      method: HTTP_METHODS.POST,
      body: { decision },
    });
  }

  /**
   * Delete a specific agent memory.

   */
  static async deleteAgentMemory(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/agent-memories/${id}`,
      { method: HTTP_METHODS.DELETE },
    );
  }

  static async deleteAllAgentMemories(
    project?: string,
    agent?: string,
  ): Promise<{ success: boolean; deletedCount: number }> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (agent) queryString.set("agent", agent);
    return PrismService._request<{ success: boolean; deletedCount: number }>(
      `/agent-memories/all?${queryString}`,
      { method: HTTP_METHODS.DELETE },
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
        method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.GET,
    });
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Workflow Memories (AWM)
  // ---------------------------------------------------------------------------

  static async getWorkflowMemories(
    project?: string,
    limit = 20,
    agent?: string,
    skip = 0,
  ): Promise<WorkflowMemoryListResponse> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (limit) queryString.set("limit", String(limit));
    if (agent) queryString.set("agent", agent);
    if (skip) queryString.set("skip", String(skip));
    return PrismService._request<WorkflowMemoryListResponse>(
      `/workflow-memories?${queryString}`,
      { method: HTTP_METHODS.GET },
    );
  }

  static async deleteWorkflowMemory(
    id: string,
  ): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/workflow-memories/${id}`,
      { method: HTTP_METHODS.DELETE },
    );
  }

  static async deleteAllWorkflowMemories(
    project?: string,
    agent?: string,
  ): Promise<{ success: boolean; deletedCount: number }> {
    const queryString = new URLSearchParams();
    if (project) queryString.set("project", project);
    if (agent) queryString.set("agent", agent);
    return PrismService._request<{ success: boolean; deletedCount: number }>(
      `/workflow-memories/all?${queryString}`,
      { method: HTTP_METHODS.DELETE },
    );
  }
  // ---------------------------------------------------------------------------

  /**
   * Fetch current server-side settings.

   */
  static async getSettings(): Promise<PrismSettings> {
    return PrismService._request<PrismSettings>("/settings", { method: HTTP_METHODS.GET });
  }

  /**
   * Update server-side settings (deep merge).

   */
  static async updateSettings(
    data: Partial<PrismSettings>,
  ): Promise<PrismSettings> {
    const updatedSettings = await PrismService._request<PrismSettings>("/settings", {
      method: HTTP_METHODS.PUT,
      body: data,
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME_PRISM_SETTINGS_UPDATED, { detail: updatedSettings })
      );
    }
    return updatedSettings;
  }

  /**
   * Get compiled defaults for settings (useful for reset buttons).

   */
  static async getSettingsDefaults(): Promise<PrismSettings> {
    return PrismService._request<PrismSettings>("/settings/defaults", {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Fetch available agentic harnesses from the server.
   */
  static async getHarnesses(): Promise<AgenticHarness[]> {
    return PrismService._request<AgenticHarness[]>("/settings/harnesses", {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Fetch available prompt locale options from the server.
   */
  static async getAvailableLocales(): Promise<{ value: string; label: string }[]> {
    return PrismService._request<{ value: string; label: string }[]>("/config/locales", {
      method: HTTP_METHODS.GET,
    });
  }

  // ---------------------------------------------------------------------------
  // Topologies
  // ---------------------------------------------------------------------------

  static async getTopologies(): Promise<TopologyDefinition[]> {
    return PrismService._request<TopologyDefinition[]>("/topologies", {
      method: HTTP_METHODS.GET,
    });
  }

  // ---------------------------------------------------------------------------
  // Thought Structures
  // ---------------------------------------------------------------------------

  static async getThoughtStructures(): Promise<ThoughtStructureDefinition[]> {
    return PrismService._request<ThoughtStructureDefinition[]>("/thought-structures", {
      method: HTTP_METHODS.GET,
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Add a new MCP server config.


   */
  static async createMCPServer(
    server: Omit<MCPServer, "_id">,
  ): Promise<MCPServer> {
    return PrismService._request<MCPServer>("/mcp-servers", {
      method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.PUT,
      body: updates,
    });
  }

  /**
   * Delete an MCP server config.


   */
  static async deleteMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/mcp-servers/${id}`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  /**
   * Connect to an MCP server.

   */
  static async connectMCPServer(
    id: string,
  ): Promise<{
    success: boolean;
    serverName?: string;
    toolCount?: number;
    tools?: Array<{ name: string; description?: string }>;
    /** An OAuth server without tokens: open this URL to authorize. */
    authorizationRequired?: boolean;
    authorizationUrl?: string;
  }> {
    return PrismService._request<{
      success: boolean;
      serverName?: string;
      toolCount?: number;
      tools?: Array<{ name: string; description?: string }>;
      authorizationRequired?: boolean;
      authorizationUrl?: string;
    }>(`/mcp-servers/${id}/connect`, {
      method: HTTP_METHODS.POST,
    });
  }

  /**
   * Disconnect from an MCP server.

   */
  static async disconnectMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/mcp-servers/${id}/disconnect`,
      {
        method: HTTP_METHODS.POST,
      },
    );
  }

  /**
   * An OAuth MCP server's authorization state (never a token).
   */
  static async getMCPServerOAuth(
    id: string,
  ): Promise<MCPOAuthStatus & { connected: boolean }> {
    return PrismService._request(`/mcp-servers/${id}/oauth`, {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Forget an OAuth MCP server's tokens and disconnect it.
   */
  static async signOutMCPServer(id: string): Promise<{ success: boolean }> {
    return PrismService._request(`/mcp-servers/${id}/oauth`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  /**
   * Prompts of the connected MCP servers (composer slash commands).
   */
  static async getMCPPrompts(): Promise<MCPPrompt[]> {
    const { prompts } = await PrismService._request<{ prompts: MCPPrompt[] }>(
      "/mcp-servers/prompts",
      { method: HTTP_METHODS.GET },
    );
    return prompts ?? [];
  }

  /**
   * Fill an MCP prompt; `text` is what the composer inserts.
   */
  static async getMCPPrompt(
    server: string,
    name: string,
    promptArguments: Record<string, string> = {},
  ): Promise<{ text: string; description: string | null }> {
    return PrismService._request("/mcp-servers/prompts/get", {
      method: HTTP_METHODS.POST,
      body: { server, name, arguments: promptArguments },
    });
  }

  /**
   * Resources of the connected MCP servers (composer @-mentions).
   */
  static async getMCPResources(): Promise<MCPResource[]> {
    const { resources } = await PrismService._request<{ resources: MCPResource[] }>(
      "/mcp-servers/resources",
      { method: HTTP_METHODS.GET },
    );
    return resources ?? [];
  }

  /**
   * Read one MCP resource. `content` is set for a single text resource.
   */
  static async readMCPResource(
    server: string,
    uri: string,
  ): Promise<{ content?: string; contents?: Array<{ uri: string; text: string | null }> }> {
    return PrismService._request("/mcp-servers/resources/read", {
      method: HTTP_METHODS.POST,
      body: { server, uri },
    });
  }

  /**
   * Re-approve quarantined MCP tools at their current definitions. Without
   * `tools`, every quarantined tool on the server is approved.
   */
  static async approveMCPServerTools(
    id: string,
    tools?: string[],
  ): Promise<{
    success: boolean;
    approved: string[];
    skipped: string[];
    quarantinedTools: MCPQuarantinedTool[];
  }> {
    return PrismService._request(`/mcp-servers/${id}/tools/approve`, {
      method: HTTP_METHODS.POST,
      body: tools ? { tools } : {},
    });
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
        hasChanges: boolean;
        totalCost?: number | null;
        branchName?: string | null;
        files?: string[];
        toolCallCount?: number;
        recursionDepth?: number;
        toolNames?: Record<string, number>;
        subAgentConversationId?: string;
      }>;
    }
    const response = await PrismService._request<SubAgentsResponse>(
      `/orchestrator/sub-agents${queryString}`,
      {
        method: HTTP_METHODS.GET,
      },
    );
    const subAgentsList = response.subAgents || [];
    const mappedSubAgentsList = subAgentsList.map((subAgent) => ({
      id: subAgent.agentId,
      agentId: subAgent.agentId,
      agentConversationId: conversationId || "",
      subAgentConversationId: subAgent.subAgentConversationId,
      status: subAgent.status,
      description: subAgent.description,
      resolvedModel: subAgent.resolvedModel,
      provider: subAgent.providerName,
      durationMs: subAgent.durationMs,
      totalCost: subAgent.totalCost ?? undefined,
      toolCallCount: subAgent.toolCallCount,
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
      method: HTTP_METHODS.POST,
      body: { conversationId },
    });
  }

  /**
   * Stop ONE running sub-agent; its teammates keep running. Throws with
   * `status` 404 (unknown, or not this user's) or 409 (no longer running).
   */
  static async stopCoordinatorSubAgent(
    agentId: string,
  ): Promise<{ agent_id: string; status: string }> {
    return PrismService._request<{ agent_id: string; status: string }>(
      `/orchestrator/sub-agents/${encodeURIComponent(agentId)}/stop`,
      { method: HTTP_METHODS.POST },
    );
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
        method: HTTP_METHODS.POST,
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
    return PrismService._request<ScheduledTask[]>("/scheduled-tasks", { method: HTTP_METHODS.GET });
  }

  static async getAllCronJobs(): Promise<ScheduledTask[]> {
    return PrismService._request<ScheduledTask[]>("/scheduled-tasks/all", { method: HTTP_METHODS.GET });
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
      { method: HTTP_METHODS.GET },
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
      method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.PATCH,
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
        method: HTTP_METHODS.DELETE,
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
        method: HTTP_METHODS.POST,
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
    // Default agent selection is server policy (AgentRoutes).
    return PrismService._request<ChatGenerationResult>("/agent?stream=false", {
      body: payload,
    });
  }

  /**
   * Decide ONE pending tool call: allow (optionally with edited arguments,
   * or for the rest of its batch / the whole conversation) or deny (with an
   * optional reason the model will see). Rejects on 400 (invalid edit),
   * 404 (unknown call) and 409 (already decided) — the card must not pretend
   * it went through.
   */
  static async sendApprovalDecision(
    conversationId: string,
    request: ApprovalDecisionRequest,
  ): Promise<ApprovalDecisionResponse> {
    return PrismService._request<ApprovalDecisionResponse>("/agent/approve", {
      body: { conversationId, ...request },
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
   * Submit answer(s) to a pending ask_user tool call. `questionId` (from the
   * `user_question` event) resolves exactly that card; without it the server
   * answers the oldest blocking question. Throws with `status: 404` when no
   * open question took the answer.
   */
  static async sendUserQuestionAnswer(
    conversationId: string,
    answerOrAnswers:
      | string
      | Array<{ answer: string | string[]; annotations?: string }>,
    { questionId }: { questionId?: string } = {},
  ): Promise<{ ok: boolean; questionId?: string; blocking?: boolean }> {
    // Normalize: structured array vs simple string
    const body: {
      conversationId: string;
      questionId?: string;
      answer?: string;
      answers?: Array<{ answer: string | string[]; annotations?: string }>;
    } = { conversationId, ...(questionId ? { questionId } : {}) };
    if (Array.isArray(answerOrAnswers)) {
      body.answers = answerOrAnswers;
    } else {
      body.answer = String(answerOrAnswers);
    }
    return PrismService._request<{ ok: boolean; questionId?: string; blocking?: boolean }>(
      "/agent/answer",
      { body },
    );
  }

  /**
   * Steer the RUNNING turn — `POST /agent/input` drops the text into the
   * harness mailbox, which applies it at the next iteration boundary and
   * echoes a `turn_input` event. Resolves (never throws) for the two
   * contract rejections so the composer can fall back:
   *  - 409 `no_active_turn` → queue it for the next turn instead,
   *  - 400 `mailbox_full` | `empty_input` → tell the user.
   * Any other failure throws like every other request.
   */
  static async sendTurnInput(
    conversationId: string,
    text: string,
    images?: string[],
  ): Promise<TurnInputResponse> {
    const response = await fetch(`${API_BASE}/agent/input`, {
      method: HTTP_METHODS.POST,
      headers: getHeaders(),
      cache: "no-store",
      body: JSON.stringify({
        conversationId,
        text,
        ...(images && images.length > 0 ? { images } : {}),
      }),
    });
    if (response.ok) {
      const result = (await response.json()) as { inputId: string; position?: number };
      return { ok: true, inputId: result.inputId, position: result.position };
    }
    const error = (await response.json().catch(() => ({}))) as {
      reason?: string;
      error?: string;
      message?: string;
    };
    if (response.status === 409 || response.status === 400) {
      return { ok: false, status: response.status, reason: error.reason };
    }
    throw Object.assign(
      new Error(error.error || error.message || `Prism API error: ${response.status}`),
      { status: response.status, reason: error.reason },
    );
  }

  // ---------------------------------------------------------------------------
  // Conversation goals — a long-running objective the harness reports
  // progress against (`goal_update` events)
  // ---------------------------------------------------------------------------

  static async getConversationGoal(
    conversationId: string,
  ): Promise<ConversationGoal | null> {
    const result = await PrismService._request<{ goal: ConversationGoal | null }>(
      `/conversations/${encodeURIComponent(conversationId)}/goal`,
      { method: HTTP_METHODS.GET },
    );
    return result?.goal ?? null;
  }

  static async setConversationGoal(
    conversationId: string,
    goal: {
      objective: string;
      completionCriteria?: string;
      budget?: ConversationGoalBudget;
    },
  ): Promise<ConversationGoal | null> {
    const result = await PrismService._request<{ goal: ConversationGoal | null }>(
      `/conversations/${encodeURIComponent(conversationId)}/goal`,
      { method: HTTP_METHODS.PUT, body: goal },
    );
    return result?.goal ?? null;
  }

  /** Pause / resume, or nudge progress / blockedOn / budget. */
  static async patchConversationGoal(
    conversationId: string,
    patch: {
      status?: "active" | "paused";
      progress?: { summary: string; percent?: number | null };
      blockedOn?: string | null;
      budget?: ConversationGoalBudget;
    },
  ): Promise<ConversationGoal | null> {
    const result = await PrismService._request<{ goal: ConversationGoal | null }>(
      `/conversations/${encodeURIComponent(conversationId)}/goal`,
      { method: HTTP_METHODS.PATCH, body: patch },
    );
    return result?.goal ?? null;
  }

  static async clearConversationGoal(conversationId: string): Promise<void> {
    await PrismService._request<unknown>(
      `/conversations/${encodeURIComponent(conversationId)}/goal`,
      { method: HTTP_METHODS.DELETE },
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
    {
      method = HTTP_METHODS.POST,
      body,
      cursorConversationId,
      protocol = "turn",
    }: {
      method?: string;
      body?: unknown;
      /** Which stream this is (protocolEvents.ts): its frames are parsed as that stream's events. */
      protocol?: StreamProtocol;
      /**
       * Advance this conversation's event cursor as events arrive, so a
       * later viewer WebSocket for the same conversation resubscribes with
       * `afterSeq` and drops anything this stream already delivered.
       */
      cursorConversationId?: string;
    } = {},
    callbacks: SSECallbacks = {},
  ): () => void {
    const { onError } = callbacks;
    const cursor = cursorConversationId ? cursorFor(cursorConversationId) : null;
    const controller = new AbortController();
    // Terminal-state guarantee: consumers must never hang waiting for onDone.
    // Track whether the server delivered a logical terminal event (done/error);
    // if the stream closes without one, synthesize onStreamClosed.
    let sawTerminalEvent = false;
    // Watchdog: a stalled-but-open socket (half-open TCP, dead proxy) never
    // rejects reader.read() — without this the stream hangs forever. The
    // server emits `: ping` comment frames well inside this window, and any
    // byte (data or comment) resets the timer.
    const STALL_TIMEOUT_MS = 120_000;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let stalled = false;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, STALL_TIMEOUT_MS);
    };

    const parseAndDispatchLine = (line: string) => {
      if (!line.startsWith("data: ")) return;
      const json = line.slice(6);
      if (!json) return;

      try {
        const parsed = parseStreamEvent(JSON.parse(json), protocol);
        if (!parsed) return; // not an event of this stream — logged by the parser
        const data = PrismService._normalizeSSEData(parsed);
        if (data.type === "tool_execution" || data.type === "toolCall") {
          const toolName = data.type === "tool_execution" ? data.tool.name : data.name;
          console.debug(
            `[SSE dispatch] type=${data.type} status=${data.status || ""} tool=${toolName || ""} (${json.length}ch)`,
          );
        } else if (data.type === "done" || data.type === "error") {
          console.debug(`[SSE dispatch] type=${data.type} (${json.length}ch)`);
        }
        if (
          data.type === SERVER_SENT_EVENT_TYPES.DONE ||
          data.type === SERVER_SENT_EVENT_TYPES.ERROR
        ) {
          sawTerminalEvent = true;
        }
        if (cursor && !cursor.accept(data)) return; // already delivered
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
    };

    // Tolerate CRLF line endings and skip `:` comment (heartbeat) frames.
    const parseLines = (lines: string[]) => {
      for (const rawLine of lines) {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (line.startsWith(":")) continue; // SSE comment / server heartbeat
        parseAndDispatchLine(line);
      }
    };

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

        if (!response.body) {
          if (onError) onError(new Error("SSE response has no body"));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        armStallTimer();

        while (true) {
          const { done, value } = await reader.read();
          armStallTimer();
          if (done) {
            // Flush any trailing bytes: a final event without a terminating
            // newline would otherwise be silently discarded.
            buffer += decoder.decode();
            if (buffer.length > 0) parseLines(buffer.split("\n"));
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines: "data: {...}\n\n"
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          parseLines(lines);
        }

        if (!sawTerminalEvent) {
          console.warn(`[SSE] stream closed without done/error event`);
          callbacks.onStreamClosed?.({ reason: "eof-without-done" });
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          if (stalled) {
            console.warn(
              `[SSE] no bytes received for ${STALL_TIMEOUT_MS / 1000}s — treating stream as stalled`,
            );
            callbacks.onStreamClosed?.({ reason: "stalled" });
          } else {
            callbacks.onAborted?.();
          }
          return;
        }
        console.error(`[SSE] stream error:`, error);
        if (onError)
          onError(
            error instanceof Error ? error : new Error(getErrorMessage(error)),
          );
      } finally {
        clearTimeout(stallTimer);
      }
    })();

    return () => controller.abort();
  }

  /**
   * Normalize a parsed SSE event at the wire boundary so downstream
   * consumers see one canonical shape. Currently: the server emits tool
   * durations as either `durationMs` or `durationMilliseconds` depending
   * on the code path (provider vs orchestrator) — canonicalize to
   * `durationMs` on both the envelope and the nested `tool` object.
   */
  static _normalizeSSEData<Event extends StreamEvent>(data: Event): Event {
    const normalizeDuration = (obj: Record<string, unknown> | undefined) => {
      if (!obj) return;
      if (obj.durationMs == null && typeof obj.durationMilliseconds === "number") {
        obj.durationMs = obj.durationMilliseconds;
      }
    };
    normalizeDuration(data as Record<string, unknown>);
    normalizeDuration((data as { tool?: Record<string, unknown> }).tool);
    return data;
  }

  /**
   * Dispatch one parsed stream event to its callback. Shared by the chat,
   * agent, viewer, synthesis and benchmark streams; the switch is exhaustive
   * over every event type, so a new protocol event does not compile until
   * it is routed (or deliberately ignored) here.
   */
  static _dispatchSSE(event: StreamEvent, callbacks: SSECallbacks): void {
    switch (event.type) {
      case "chunk":
        callbacks.onChunk?.(event.content, sourceModelOf(event), event.outputCharacters);
        break;
      case "thinking":
        callbacks.onThinking?.(event.content, sourceModelOf(event), event.outputCharacters);
        break;
      case "image":
        callbacks.onImage?.(event.data ?? "", event.mimeType ?? "image/png", event.minioRef ?? undefined);
        break;
      case "audio":
        callbacks.onAudio?.(event.data ?? "", event.mimeType ?? "");
        break;
      case "executableCode":
        callbacks.onExecutableCode?.(event.code, event.language);
        break;
      case "codeExecutionResult":
        callbacks.onCodeExecutionResult?.(event.output, event.outcome);
        break;
      case "webSearchResult":
        callbacks.onWebSearchResult?.(event.results);
        break;
      case "toolCall":
        callbacks.onToolCall?.({
          id: event.id ?? "",
          name: event.name ?? "",
          args: event.args,
          result: event.result,
          status: event.status,
          thoughtSignature: event.thoughtSignature,
          _sourceModel: sourceModelOf(event),
        });
        break;
      case "tool_execution":
        callbacks.onToolExecution?.(event);
        break;
      case "tool_output":
        callbacks.onToolOutput?.(event);
        break;
      case "approval_required":
        callbacks.onApprovalRequired?.(event);
        break;
      // A pending tool/plan call was decided (any tab, a scope, a timeout)
      case "approval_decided":
        callbacks.onApprovalDecided?.(event);
        break;
      case "plan_proposal":
        callbacks.onPlanProposal?.(event);
        break;
      // Sub-agent events — forwarded from spawned sub-agents
      case "sub_agent_tool_execution":
        callbacks.onSubAgentToolExecution?.(event);
        break;
      case "sub_agent_tool_output":
        callbacks.onSubAgentToolOutput?.(event);
        break;
      case "sub_agent_status":
        callbacks.onSubAgentStatus?.(event);
        break;
      case "user_question":
        callbacks.onUserQuestion?.(event);
        break;
      case "task_notification":
        callbacks.onTaskNotification?.(event);
        break;
      case "conversation_state_update":
        callbacks.onConversationStateUpdate?.(event);
        break;
      case "todo_update":
        callbacks.onTodoUpdate?.(event);
        break;
      case "brief_update":
        callbacks.onBriefUpdate?.(event);
        break;
      // Harness mailbox: a mid-turn input was applied (POST /agent/input)
      case "turn_input":
        callbacks.onTurnInput?.(event);
        break;
      // Conversation goal set / progressed / paused / cleared
      case "goal_update":
        callbacks.onGoalUpdate?.(event);
        break;
      // The conversation's permission mode: what the turn runs in, and each switch
      case "permission_mode":
        callbacks.onPermissionMode?.(event);
        break;
      case "usage_update":
        callbacks.onUsageUpdate?.(event);
        break;
      case "context_budget":
        callbacks.onContextBudget?.(event);
        break;
      case "status":
        callbacks.onStatus?.(event);
        break;
      // Turn-start mirror of the user's prompt — emitted by chat/agent
      // handlers so direct viewers (/admin/chat, second tab) can render it
      // before it is persisted at finalize.
      case "user_message":
        callbacks.onUserMessage?.(event);
        break;
      // Benchmark-specific events
      case "run_info":
        callbacks.onRunInfo?.(event);
        break;
      case "model_start":
        callbacks.onModelStart?.(event);
        break;
      case "model_complete":
        callbacks.onModelComplete?.(event);
        break;
      case "run_complete":
        callbacks.onRunComplete?.(event);
        break;
      // Synthesis-stream framing events (/synthesis/generate — see
      // SynthesisOrchestrationService in prism-service for the protocol)
      case "synthesis_start":
        callbacks.onSynthesisStart?.(event.conversationId);
        break;
      case "turn_start":
        callbacks.onTurnStart?.(event.role, event.index);
        break;
      case "turn_complete":
        callbacks.onTurnComplete?.(event.message as Message, event.role);
        break;
      case "done":
        callbacks.onDone?.(event);
        break;
      case "error":
        callbacks.onError?.(new StreamError(event));
        break;
      // Connection framing (the live viewer socket handles `subscribed`), and
      // protocol events this client does not render yet. `citations` shows
      // live through the `webSearchResult` that follows it, and afterwards
      // from the stored message.
      case "hello":
      case "subscribed":
      case "refusal":
      case "memory_consolidation_complete":
      case "citations":
        break;
      default:
        event satisfies never;
    }
  }

  /**
   * Stream text generation via SSE (Server-Sent Events).


   */
  static streamText(payload: ChatPayload, callbacks: SSECallbacks): () => void {
    return PrismService._streamSSE("/chat", { body: payload }, callbacks);
  }

  /**
   * Stream a full server-orchestrated synthesis run via SSE.
   * The backend owns the turn loop (persona prompt, role-swapping, model
   * selection, persistence — see SynthesisOrchestrationService); the client
   * consumes role-tagged framing events: onSynthesisStart → (onTurnStart →
   * onChunk/onThinking → onTurnComplete)* → onDone.
   */
  static streamSynthesis(
    payload: {
      conversationId?: string;
      title?: string;
      systemPrompt: string;
      userPersona?: string;
      category?: string;
      targetTurns: number;
      seedMessages: Array<{ role: string; content: string }>;
      settings: {
        provider: string;
        model: string;
        temperature?: number;
        maxTokens?: number;
        thinkingEnabled?: boolean;
        reasoningEffort?: string;
        thinkingLevel?: string;
        thinkingBudget?: string | number;
      };
      userSimSettings?: {
        provider: string;
        model: string;
        temperature?: number;
      } | null;
      saveRun?: boolean;
    },
    callbacks: SSECallbacks,
  ): () => void {
    return PrismService._streamSSE(
      "/synthesis/generate",
      { body: payload, protocol: "synthesis" },
      callbacks,
    );
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
    // Default agent selection is server policy (AgentRoutes).
    return PrismService._streamSSE(
      "/agent",
      { body: payload, cursorConversationId: payload.conversationId },
      callbacks,
    );
  }

  /**
   * The `/ws/chat` URL with this client's identity, or null when no
   * WebSocket URL is configured. Browsers cannot set custom headers on
   * WebSocket upgrades, so identity and profile travel as query params
   * (mirrored server-side).
   */
  static liveSocketUrl(): string | null {
    if (!PRISM_WEBSOCKET_URL) return null;
    const headers = getHeaders();
    const websocketUrlParameters = new URLSearchParams({
      project: headers[IDENTITY_HEADERS.project] || "any",
      username: headers[IDENTITY_HEADERS.username] || "anonymous",
    });
    if (headers[HEADER_PROFILE_ID]) {
      websocketUrlParameters.set("profileId", headers[HEADER_PROFILE_ID]);
    }
    return `${PRISM_WEBSOCKET_URL}/ws/chat?${websocketUrlParameters.toString()}`;
  }

  /**
   * A `createSocket` for openLiveViewerSocket that keeps the service told
   * whether this page is visible on every (re)connected socket — a viewer
   * that never reports counts as watching, and the conversation's "needs
   * you" push would be held back. `stop` ends the reporting for good.
   */
  static visibilityReportingSockets(): {
    createSocket: (_url: string) => WebSocket;
    stop: () => void;
  } {
    let stopReporting: (() => void) | null = null;
    return {
      createSocket: (socketUrl) => {
        stopReporting?.();
        const websocket = new WebSocket(socketUrl);
        stopReporting = reportViewerVisibility(websocket);
        return websocket;
      },
      stop: () => {
        stopReporting?.();
        stopReporting = null;
      },
    };
  }

  /**
   * Subscribe to a conversation's live events via WebSocket.
   *
   * Used by viewers of a turn driven elsewhere (another tab or device,
   * /admin/chat, a sub-agent) and after the SSE stream closes on a
   * non-blocking sub-agent dispatch. Events are dispatched through the same
   * SSE callback system as the primary stream. The socket reconnects with
   * backoff and resubscribes from the conversation's event cursor
   * (liveViewerSocket), so a drop replays only what was missed.
   *
   * Returns a cleanup function that closes the WebSocket.
   */
  static subscribeToAutoResponse(
    conversationId: string,
    callbacks: SSECallbacks,
    { onStateChange }: { onStateChange?: (_state: LiveSocketState) => void } = {},
  ): () => void {
    const url = PrismService.liveSocketUrl();
    if (!url) {
      console.warn(
        "[PrismService] No WebSocket URL configured — auto-response streaming unavailable",
      );
    }
    const sockets = PrismService.visibilityReportingSockets();
    const socket = openLiveViewerSocket({
      url,
      conversationId,
      cursor: cursorFor(conversationId),
      createSocket: sockets.createSocket,
      onStateChange,
      onEvent: (data) => PrismService._dispatchSSE(data, callbacks),
      onSubscribed: (ack) => {
        console.debug(
          `[PrismService] Live subscription ${ack.isReconnect ? "resumed" : "confirmed"} for conversation ${conversationId} (lastSeq=${ack.lastSeq}, replayed=${ack.replayedCount}, dropped=${ack.droppedCount})`,
        );
        if (ack.truncated) {
          callbacks.onReplayTruncated?.({ droppedCount: ack.droppedCount });
        }
        // A resubscribe that finds the server holding no events at all for
        // this conversation (it restarted while the socket was down) has no
        // turn left to follow — end it here; onDone refreshes from the
        // database.
        if (ack.isReconnect && !ack.lastSeq && ack.replayedCount === 0) {
          callbacks.onDone?.({ type: SERVER_SENT_EVENT_TYPES.DONE, reason: "no-live-turn" });
        }
      },
    });
    return () => {
      socket.close();
      sockets.stop();
    };
  }

  /**
   * Follow a turn THIS client was driving after its SSE stream dropped:
   * resubscribe from the event cursor over the reconnecting live socket and
   * dispatch what arrives until the turn ends.
   *
   * Resolves `"done"` / `"error"` on the turn's terminal event; `"ended"`
   * when a subscribe finds the server no longer running it; `"unconfigured"`
   * right away without a WebSocket URL (the caller falls back to polling);
   * `"timeout"` after `timeoutMilliseconds`.
   */
  static followLiveTurn(
    conversationId: string,
    callbacks: SSECallbacks,
    {
      isTurnRunning,
      timeoutMilliseconds,
      onStateChange,
    }: {
      isTurnRunning: () => Promise<boolean>;
      timeoutMilliseconds: number;
      onStateChange?: (_state: LiveSocketState) => void;
    },
  ): Promise<"done" | "error" | "ended" | "unconfigured" | "timeout"> {
    return new Promise((resolve) => {
      let isSettled = false;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      const socketRef: { current: { close(): void } | null } = { current: null };
      const sockets = PrismService.visibilityReportingSockets();
      const finish = (outcome: "done" | "error" | "ended" | "unconfigured" | "timeout") => {
        if (isSettled) return;
        isSettled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        socketRef.current?.close();
        sockets.stop();
        resolve(outcome);
      };

      const socket = openLiveViewerSocket({
        url: PrismService.liveSocketUrl(),
        conversationId,
        cursor: cursorFor(conversationId),
        createSocket: sockets.createSocket,
        onStateChange,
        onEvent: (data) => {
          PrismService._dispatchSSE(data, callbacks);
          if (data.type === SERVER_SENT_EVENT_TYPES.DONE) finish("done");
          else if (data.type === SERVER_SENT_EVENT_TYPES.ERROR) finish("error");
        },
        onSubscribed: (ack) => {
          if (!ack.lastSeq && ack.replayedCount === 0) {
            finish("ended"); // the server has no events for it: it restarted
            return;
          }
          if (ack.replayedCount === 0) {
            // Nothing missed — still running, or finished with its buffer
            // already retired. The document says which.
            isTurnRunning()
              .then((isRunning) => {
                if (!isRunning) finish("ended");
              })
              .catch(() => {});
          }
        },
      });
      socketRef.current = socket;
      if (socket.state() === "unconfigured") {
        finish("unconfigured");
        return;
      }
      timeoutTimer = setTimeout(() => finish("timeout"), timeoutMilliseconds);
    });
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
      method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Get a single workflow by ID (full document).


   */
  static async getWorkflow(id: string): Promise<Workflow> {
    return PrismService._request<Workflow>(`/workflows/${id}`, {
      method: HTTP_METHODS.GET,
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
      method: HTTP_METHODS.PUT,
      body: workflow,
    });
  }

  /**
   * Delete a workflow.

   */
  static async deleteWorkflow(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/workflows/${id}`, {
      method: HTTP_METHODS.DELETE,
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
        method: HTTP_METHODS.PATCH,
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
    parameters: Record<string, string | number | boolean> = {},
  ): Promise<MediaListResponse> {
    const stringParameters: Record<string, string> = {};
    for (const [key, value] of Object.entries(parameters)) stringParameters[key] = String(value);
    const query = new URLSearchParams(stringParameters).toString();
    return PrismService._request<MediaListResponse>(
      `/media${query ? `?${query}` : ""}`,
      {
        method: HTTP_METHODS.GET,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Artifacts
  // ---------------------------------------------------------------------------

  /**
   * List artifacts (agent-authored documents + captured visual outputs)
   * for the caller's project.
   */
  static async getArtifacts(
    parameters: Record<string, string | number | boolean> = {},
  ): Promise<ArtifactListResponse> {
    const stringParameters: Record<string, string> = {};
    for (const [key, value] of Object.entries(parameters)) stringParameters[key] = String(value);
    const query = new URLSearchParams(stringParameters).toString();
    return PrismService._request<ArtifactListResponse>(
      `/artifacts${query ? `?${query}` : ""}`,
      {
        method: HTTP_METHODS.GET,
      },
    );
  }

  /** Fetch a single artifact including document content and version history. */
  static async getArtifact(artifactId: string): Promise<ArtifactItem> {
    return PrismService._request<ArtifactItem>(
      `/artifacts/${encodeURIComponent(artifactId)}`,
      {
        method: HTTP_METHODS.GET,
      },
    );
  }

  /** Delete an artifact from the gallery. */
  static async deleteArtifact(artifactId: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(
      `/artifacts/${encodeURIComponent(artifactId)}`,
      {
        method: HTTP_METHODS.DELETE,
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
    parameters: Record<string, string | number | boolean> = {},
  ): Promise<TextListResponse> {
    const stringParameters: Record<string, string> = {};
    for (const [key, value] of Object.entries(parameters)) stringParameters[key] = String(value);
    const query = new URLSearchParams(stringParameters).toString();
    return PrismService._request<TextListResponse>(
      `/text${query ? `?${query}` : ""}`,
      {
        method: HTTP_METHODS.GET,
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
      { method: HTTP_METHODS.GET },
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
        { method: HTTP_METHODS.GET },
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
      { method: HTTP_METHODS.GET },
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
      onProgress?: (_percentage: number) => void;
      onComplete?: () => void;
      onError?: (_error: Error) => void;
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
          method: HTTP_METHODS.POST,
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
      method: HTTP_METHODS.GET,
    });
    return response.presets;
  }

  /**
   * List all benchmark tests.
   */
  static async getBenchmarks(): Promise<BenchmarkListResponse> {
    return PrismService._request<BenchmarkListResponse>("/benchmark", {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Get aggregated model performance stats across all benchmark runs.
   */
  static async getBenchmarkStats(): Promise<BenchmarkModelStats> {
    return PrismService._request<BenchmarkModelStats>("/benchmark/stats", {
      method: HTTP_METHODS.GET,
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
      { method: HTTP_METHODS.GET },
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Delete a benchmark test and all its runs.


   */
  static async deleteBenchmark(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/benchmark/${id}`, {
      method: HTTP_METHODS.DELETE,
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
   * `trials` repeats every target N times within the run.
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
      enabledTools?: string[];
    }>,
    callbacks: SSECallbacks = {},
    options: { trials?: number } = {},
  ): () => void {
    return PrismService._streamSSE(
      `/benchmark/${id}/run`,
      {
        body: {
          ...(models ? { models } : {}),
          ...(options.trials && options.trials > 1
            ? { trials: options.trials }
            : {}),
        },
        protocol: "benchmark",
      },
      callbacks,
    );
  }

  /**
   * Update an existing benchmark test.
   */
  static async updateBenchmark(
    id: string,
    data: Partial<Omit<Benchmark, "_id" | "createdAt">>,
  ): Promise<Benchmark> {
    return PrismService._request<Benchmark>(`/benchmark/${id}`, {
      method: HTTP_METHODS.PUT,
      body: data,
    });
  }

  /**
   * Delete a single benchmark run.
   */
  static async deleteBenchmarkRun(
    benchmarkId: string,
    runId: string,
  ): Promise<{ deleted: boolean; id: string }> {
    return PrismService._request<{ deleted: boolean; id: string }>(
      `/benchmark/${benchmarkId}/runs/${runId}`,
      { method: HTTP_METHODS.DELETE },
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
      { method: HTTP_METHODS.GET },
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
      { method: HTTP_METHODS.GET },
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
      { method: HTTP_METHODS.GET },
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
      { method: HTTP_METHODS.GET, protocol: "benchmark" },
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
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Get a single synthesis run by ID.


   */
  static async getSynthesisRun(id: string): Promise<SynthesisRun> {
    return PrismService._request<SynthesisRun>(`/synthesis/${id}`, {
      method: HTTP_METHODS.GET,
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
      method: HTTP_METHODS.DELETE,
    });
  }

  // ---------------------------------------------------------------------------
  // VRAM Benchmarks
  // ---------------------------------------------------------------------------

  /**
   * Fetch VRAM benchmark entries with optional filters.

   */
  static async getVramBenchmarks(
    parameters: Record<string, string> = {},
  ): Promise<{ count: number; data: VramBenchmarkEntry[] }> {
    const query = new URLSearchParams(parameters).toString();
    return PrismService._request<{ count: number; data: VramBenchmarkEntry[] }>(
      `/vram-benchmarks${query ? `?${query}` : ""}`,
      { method: HTTP_METHODS.GET },
    );
  }

  /**
   * Fetch distinct machines that have run VRAM benchmarks.
   */
  static async getVramBenchmarkMachines(): Promise<VramBenchmarkMachine[]> {
    return PrismService._request<VramBenchmarkMachine[]>(
      "/vram-benchmarks/machines",
      {
        method: HTTP_METHODS.GET,
      },
    );
  }

  /**
   * Fetch distinct settings labels available in benchmark data.

   */
  static async getVramBenchmarkSettings(): Promise<string[]> {
    return PrismService._request<string[]>("/vram-benchmarks/settings", {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Fetch distinct context lengths available in benchmark data.


   */
  static async getVramBenchmarkContexts(
    parameters: Record<string, string> = {},
  ): Promise<number[]> {
    const query = new URLSearchParams(parameters).toString();
    return PrismService._request<number[]>(
      `/vram-benchmarks/contexts${query ? `?${query}` : ""}`,
      { method: HTTP_METHODS.GET },
    );
  }

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

  static async getPrompts(
    parameters: Record<string, string | number | boolean> = {},
  ): Promise<{ data: Prompt[]; total: number; page: number; limit: number }> {
    const stringParameters: Record<string, string> = {};
    for (const [key, value] of Object.entries(parameters)) stringParameters[key] = String(value);
    const query = new URLSearchParams(stringParameters).toString();
    return PrismService._request<{ data: Prompt[]; total: number; page: number; limit: number }>(
      `/prompts${query ? `?${query}` : ""}`,
      { method: HTTP_METHODS.GET },
    );
  }

  static async getPrompt(id: string): Promise<Prompt> {
    return PrismService._request<Prompt>(`/prompts/${id}`, { method: HTTP_METHODS.GET });
  }

  static async createPrompt(data: {
    title: string;
    content: string;
    tags?: string[];
    color?: string;
  }): Promise<Prompt> {
    return PrismService._request<Prompt>("/prompts", {
      method: HTTP_METHODS.POST,
      body: data,
    });
  }

  static async updatePrompt(
    id: string,
    updates: Partial<{ title: string; content: string; tags: string[]; color: string }>,
  ): Promise<Prompt> {
    return PrismService._request<Prompt>(`/prompts/${id}`, {
      method: HTTP_METHODS.PATCH,
      body: updates,
    });
  }

  static async deletePrompt(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/prompts/${id}`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  // -- Browser push ("needs you" notifications) -----------------

  /** The VAPID key a browser subscribes with; `enabled: false` when the service has none. */
  static async getPushPublicKey(): Promise<{ enabled: boolean; publicKey: string | null }> {
    return PrismService._request("/push/vapid-public-key", { method: HTTP_METHODS.GET });
  }

  /** Store this browser's push subscription under the current user and profile. */
  static async savePushSubscription(
    subscription: PushSubscriptionJSON,
  ): Promise<{ ok: boolean; endpoint: string }> {
    return PrismService._request("/push/subscriptions", {
      method: HTTP_METHODS.POST,
      body: subscription,
    });
  }

  /** Forget one of the current user's push subscriptions. */
  static async deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
    return PrismService._request("/push/subscriptions", {
      method: HTTP_METHODS.DELETE,
      body: { endpoint },
    });
  }
}
