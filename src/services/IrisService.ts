import { PRISM_SERVICE_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { subscribe as sseSubscribe } from "./SSEManager";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";
import type {
  PrismConfig,
  LmStudioModel,
  LmStudioVramEstimate,
  Conversation,
  Workflow,
  AgentConversation,
  ConversationStats,
  IrisDashboardStats,
  IrisProjectStat,
  IrisModelStat,
  IrisAgentStat,
  IrisUserStat,
  IrisTimelineEntry,
  JsonValue,
  TransformedRequestItem,
} from "../types/types";

const API_BASE = PRISM_SERVICE_URL;

function getAdminHeaders(): Record<string, string> {
  return { ...getBaseHeaders(), "x-username": "admin" };
}

// --- Response Interfaces ------------------------------------

export type IrisRequestEntry = TransformedRequestItem;

export interface IrisRequestListResponse {
  data: IrisRequestEntry[];
  total: number;
  count: number;
}

export interface IrisStatsResponse {
  totalRequests?: number;
  totalCost?: number;
  avgDuration?: number;
}

export interface IrisConversationListResponse {
  data: Conversation[];
  total: number;
  count: number;
}

export interface IrisTimelineResponse {
  data: IrisTimelineEntry[];
  granularity?: string;
  defaultGranularity?: string;
  validGranularities?: string[];
}

/**
 * Generic paginated list response — shared by traces, media, text, agent-conversations, workflows.
 */
export interface IrisPaginatedResponse<T = Record<string, JsonValue>> {
  data: T[];
  total: number;
}

export interface IrisConversationStatsResponse {
  generatingCount?: number;
}

export interface IrisCollectionChangeEvent {
  type: "change" | "status";
  collection?: string;
  operationType?: string;
  documentId?: string;
  id?: string;
  timestamp?: string;
  changeStreams?: boolean;
  conversationId?: string | null;
  parentAgentConversationId?: string | null;
}

export interface IrisHealthResponse {
  status: string;
  mongo?: string;
  uptime?: number;
  version?: string;
}

export interface RateLimitDetail {
  limit?: number;
  remaining?: number;
  reset?: string;
}

export interface ModelRateLimit {
  requests?: RateLimitDetail;
  tokens?: RateLimitDetail;
  inputTokens?: RateLimitDetail;
  outputTokens?: RateLimitDetail;
}

export interface ModelRateLimitData {
  rpm?: number;
  tpm?: number;
  rpd?: number;
  rateLimits?: ModelRateLimit;
  updatedAt?: string;
}

export interface RateLimitData {
  dynamic?: boolean;
  models?: Record<string, ModelRateLimitData>;
  note?: string;
}

// --- Service ------------------------------------------------

/**
 * Query parameter values — callers may pass numbers/booleans alongside strings.
 */
type QueryParams = Record<string, string | number | boolean>;

function toSearchParams(queryParameters: QueryParams): string {
  const entries = Object.entries(queryParameters).map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(entries).toString();
}

/**
 * Shared fetch helper for IrisService.
 */
async function fetchJSON<T = unknown>(
  path: string,
  options: RequestInit = {},
  isAdmin = true,
): Promise<T> {
  const prefix = isAdmin ? "/admin" : "";
  const response = await fetch(`${API_BASE}${prefix}${path}`, {
    headers: getAdminHeaders(),
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export default class IrisService {
  // -- Requests ----------------------------------------------
  static async getRequests(
    queryParameters: QueryParams = {},
    signal?: AbortSignal,
  ): Promise<IrisRequestListResponse> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisRequestListResponse>(
      `/requests${query ? `?${query}` : ""}`,
      signal ? { signal } : {},
    );
  }

  static async getRequest(id: string): Promise<IrisRequestEntry> {
    return fetchJSON<IrisRequestEntry>(`/requests/${id}`);
  }

  static async getRequestAssociations(
    id: string,
  ): Promise<{
    conversation?: Conversation;
    agentConversation?: AgentConversation;
  }> {
    return fetchJSON<{
      conversation?: Conversation;
      agentConversation?: AgentConversation;
    }>(`/requests/${id}/associations`);
  }

  // -- Stats -------------------------------------------------
  static async getStats(queryParameters: QueryParams = {}): Promise<IrisDashboardStats> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisDashboardStats>(`/stats${query ? `?${query}` : ""}`);
  }

  static async getProjectStats(
    queryParameters: QueryParams = {},
  ): Promise<IrisProjectStat[]> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisProjectStat[]>(
      `/stats/projects${query ? `?${query}` : ""}`,
    );
  }

  static async getModelStats(
    queryParameters: QueryParams = {},
  ): Promise<IrisModelStat[]> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisModelStat[]>(
      `/stats/models${query ? `?${query}` : ""}`,
    );
  }

  static async getAgentStats(
    queryParameters: QueryParams = {},
  ): Promise<IrisAgentStat[]> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisAgentStat[]>(
      `/stats/agents${query ? `?${query}` : ""}`,
    );
  }

  static async getUserStats(
    queryParameters: QueryParams = {},
  ): Promise<IrisUserStat[]> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisUserStat[]>(
      `/stats/users${query ? `?${query}` : ""}`,
    );
  }

  static async getEndpointStats(
    queryParameters: QueryParams = {},
  ): Promise<
    Array<{ endpoint: string; totalRequests: number; avgDuration?: number }>
  > {
    const query = toSearchParams(queryParameters);
    return fetchJSON<
      Array<{ endpoint: string; totalRequests: number; avgDuration?: number }>
    >(`/stats/endpoints${query ? `?${query}` : ""}`);
  }

  static async getTimeline(
    hours = 24,
    queryParameters: QueryParams = {},
    granularity?: string,
  ): Promise<IrisTimelineResponse> {
    const allQueryParameters: QueryParams = { hours, ...queryParameters };
    if (granularity) allQueryParameters.granularity = granularity;
    const query = toSearchParams(allQueryParameters);
    return fetchJSON<IrisTimelineResponse>(`/stats/timeline?${query}`);
  }

  static async getCostStats(
    queryParameters: QueryParams = {},
  ): Promise<IrisStatsResponse> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisStatsResponse>(
      `/stats/costs${query ? `?${query}` : ""}`,
    );
  }

  // -- Conversations -----------------------------------------
  static async getConversations(
    queryParameters: QueryParams = {},
  ): Promise<IrisConversationListResponse> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisConversationListResponse>(
      `/conversations${query ? `?${query}` : ""}`,
    );
  }

  static async getConversation(id: string): Promise<Conversation> {
    return fetchJSON<Conversation>(`/conversations/${id}`);
  }

  static async getConversationFilters(): Promise<{
    projects: string[];
    usernames: string[];
    models: string[];
    providers: string[];
    workspaces: string[];
    agents: Array<{ id: string; name: string }>;
  }> {
    return fetchJSON<{
      projects: string[];
      usernames: string[];
      models: string[];
      providers: string[];
      workspaces: string[];
      agents: Array<{ id: string; name: string }>;
    }>("/conversations/filters");
  }

  static async getConversationWorkflows(id: string): Promise<Workflow[]> {
    return fetchJSON<Workflow[]>(`/conversations/${id}/workflows`, {}, false);
  }

  // -- Live --------------------------------------------------
  static async getLiveActivity(
    minutes = 5,
  ): Promise<{ requests: IrisRequestEntry[]; activeCount: number }> {
    return fetchJSON<{ requests: IrisRequestEntry[]; activeCount: number }>(
      `/live?minutes=${minutes}`,
    );
  }

  static async getConversationStats(
    project: string | null = null,
  ): Promise<IrisConversationStatsResponse> {
    const queryParametersString = project ? `?project=${encodeURIComponent(project)}` : "";
    return fetchJSON<IrisConversationStatsResponse>(
      `/conversations/stats${queryParametersString}`,
    );
  }

  /**
   * Subscribe to real-time conversation stats via SSE.
   * Uses a shared singleton connection per URL (SSEManager).
   */
  static subscribeConversationStats(
    onStats: (data: IrisConversationStatsResponse) => void,
    project: string | null = null,
  ): { close: () => void } {
    const queryParametersString = project ? `?project=${encodeURIComponent(project)}` : "";
    const url = `${API_BASE}/admin/conversations/stream${queryParametersString}`;
    const { unsubscribe } = sseSubscribe(url, (data) =>
      onStats(data as IrisConversationStatsResponse),
    );
    return { close: unsubscribe };
  }

  /**
   * Subscribe to real-time collection change events via SSE.
   * Powered by MongoDB Change Streams on the backend.
   * Uses a shared singleton connection (SSEManager).
   */
  static subscribeCollectionChanges({
    onChange,
    onStatus,
  }: {
    onChange?: (data: IrisCollectionChangeEvent) => void;
    onStatus?: (data: IrisCollectionChangeEvent) => void;
  }): { close: () => void } {
    const url = `${API_BASE}/admin/changes/stream`;
    const { unsubscribe } = sseSubscribe(url, (raw) => {
      const data = raw as IrisCollectionChangeEvent;
      if (data.type === "status" && onStatus) {
        onStatus(data);
      } else if (data.type === "change" && onChange) {
        onChange(data);
      }
    });
    return { close: unsubscribe };
  }

  // -- Health ------------------------------------------------
  static async getHealth(): Promise<IrisHealthResponse> {
    return fetchJSON<IrisHealthResponse>("/health");
  }

  // -- LM Studio Model Management --------------------------
  static async getLmStudioModels(instanceId?: string): Promise<{ models: LmStudioModel[] }> {
    const queryString = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : "";
    return fetchJSON<{ models: LmStudioModel[] }>(`/lm-studio/models${queryString}`);
  }

  static async getOllamaModels(instanceId?: string): Promise<{ models: LmStudioModel[] }> {
    const queryString = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : "";
    return fetchJSON<{ models: LmStudioModel[] }>(`/ollama/models${queryString}`);
  }

  static async loadLmStudioModel(
    model: string,
    options: {
      contextLength?: number;
      flashAttention?: boolean;
      offloadKvCache?: boolean;
      evalBatchSize?: number;
    } = {},
  ): Promise<{ success: boolean; instance_id?: string }> {
    const body = buildLmStudioLoadBody(model, options);
    return fetchJSON<{ success: boolean; instance_id?: string }>(
      "/lm-studio/load",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  static async unloadLmStudioModel(
    instanceId: string,
  ): Promise<{ success: boolean }> {
    return fetchJSON<{ success: boolean }>("/lm-studio/unload", {
      method: "POST",
      body: JSON.stringify({ instance_id: instanceId }),
    });
  }

  static async estimateLmStudioMemory(
    model: string,
    config: {
      contextLength?: number;
      flashAttention?: boolean;
      offloadKvCache?: boolean;
      evalBatchSize?: number;
    } = {},
  ): Promise<LmStudioVramEstimate> {
    return fetchJSON<LmStudioVramEstimate>("/lm-studio/estimate", {
      method: "POST",
      body: JSON.stringify({ model, ...config }),
    });
  }

  // -- Workflows ---------------------------------------------
  static async getWorkflows(
    queryParameters: QueryParams = {},
  ): Promise<IrisPaginatedResponse<Workflow>> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisPaginatedResponse<Workflow>>(
      `/workflows${query ? `?${query}` : ""}`,
    );
  }

  static async getWorkflow(id: string): Promise<Workflow> {
    return fetchJSON<Workflow>(`/workflows/${id}`);
  }

  // -- Traces ----------------------------------------------
  static async getTraces(
    queryParameters: QueryParams = {},
    signal?: AbortSignal,
  ): Promise<IrisPaginatedResponse<IrisRequestEntry>> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisPaginatedResponse<IrisRequestEntry>>(
      `/traces${query ? `?${query}` : ""}`,
      signal ? { signal } : {},
    );
  }

  static async getTrace(id: string): Promise<IrisRequestEntry> {
    return fetchJSON<IrisRequestEntry>(`/traces/${id}`);
  }

  static async getConversationRunStats(agentConversationId: string): Promise<ConversationStats> {
    return fetchJSON<ConversationStats>(`/agent-conversations/${agentConversationId}/stats`);
  }

  static async getConversationRequests(
    agentConversationId: string,
  ): Promise<{ requests: IrisRequestEntry[] }> {
    return fetchJSON<{ requests: IrisRequestEntry[] }>(
      `/agent-conversations/${agentConversationId}/requests`,
    );
  }

  // -- Agent Conversations (admin) --------------------------------
  static async getAgentConversations(
    queryParameters: QueryParams = {},
  ): Promise<IrisPaginatedResponse<AgentConversation>> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisPaginatedResponse<AgentConversation>>(
      `/agent-conversations${query ? `?${query}` : ""}`,
    );
  }

  static async getAgentConversation(id: string): Promise<AgentConversation> {
    return fetchJSON<AgentConversation>(`/agent-conversations/${id}`);
  }

  // -- Media -------------------------------------------------
  static async getMedia(
    queryParameters: QueryParams = {},
  ): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisPaginatedResponse>(
      `/media${query ? `?${query}` : ""}`,
    );
  }

  // -- Text --------------------------------------------------
  static async getText(
    queryParameters: QueryParams = {},
  ): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(queryParameters);
    return fetchJSON<IrisPaginatedResponse>(`/text${query ? `?${query}` : ""}`);
  }

  // -- Config (user route, admin identity) -------------------
  static async getConfig(): Promise<PrismConfig> {
    const config = await fetchJSON<PrismConfig>("/config", {}, false);
    if (config?.localProviders) {
      setLocalProviderMeta(config.localProviders);
    }
    return config;
  }


  // -- Rate Limits -------------------------------------------
  static async getRateLimits(): Promise<Record<string, RateLimitData>> {
    return fetchJSON<Record<string, RateLimitData>>(
      "/config/rate-limits",
      {},
      false,
    );
  }
}
