import { PRISM_SERVICE_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { subscribe as sseSubscribe } from "./SSEManager";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";
import type { PrismConfig, LmStudioModel, LmStudioVramEstimate, Conversation, Workflow } from "../types/types";

const API_BASE = PRISM_SERVICE_URL;

function getAdminHeaders(): Record<string, string> {
  return { ...getBaseHeaders(), "x-username": "admin" };
}

// ─── Response Interfaces ────────────────────────────────────

export interface IrisRequestEntry {
  _id: string;
  model?: string;
  provider?: string;
  operation?: string;
  endpoint?: string;
  status?: number;
  duration?: number;
  estimatedCost?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface IrisRequestListResponse {
  data: IrisRequestEntry[];
  total: number;
  count: number;
  [key: string]: unknown;
}

export interface IrisStatsResponse {
  [key: string]: unknown;
}

export interface IrisConversationListResponse {
  data: unknown[];
  total: number;
  count: number;
  [key: string]: unknown;
}

export interface IrisTimelineResponse {
  data: unknown[];
  [key: string]: unknown;
}

/**
 * Generic paginated list response — shared by traces, media, text, agent-sessions, workflows.
 */
export interface IrisPaginatedResponse {
  data: unknown[];
  total: number;
  [key: string]: unknown;
}

export interface IrisConversationStatsResponse {
  generatingCount?: number;
  [key: string]: unknown;
}

export interface IrisCollectionChangeEvent {
  type: "change" | "status";
  collection?: string;
  operationType?: string;
  id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface IrisHealthResponse {
  status: string;
  mongo?: string;
  uptime?: number;
  version?: string;
  [key: string]: unknown;
}

// ─── Service ────────────────────────────────────────────────

/**
 * Query parameter values — callers may pass numbers/booleans alongside strings.
 */
type QueryParams = Record<string, string | number | boolean>;

function toSearchParams(params: QueryParams): string {
  const entries = Object.entries(params).map(([k, v]) => [k, String(v)]);
  return new URLSearchParams(entries).toString();
}

/**
 * Shared fetch helper for IrisService.
 */
async function fetchJSON<T = unknown>(path: string, options: RequestInit = {}, admin = true): Promise<T> {
  const prefix = admin ? "/admin" : "";
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
  static async getRequests(params: QueryParams = {}): Promise<IrisRequestListResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisRequestListResponse>(`/requests${query ? `?${query}` : ""}`);
  }

  static async getRequest(id: string): Promise<IrisRequestEntry> {
    return fetchJSON<IrisRequestEntry>(`/requests/${id}`);
  }

  static async getRequestAssociations(id: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/requests/${id}/associations`);
  }

  // -- Stats -------------------------------------------------
  static async getStats(params: QueryParams = {}): Promise<IrisStatsResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisStatsResponse>(`/stats${query ? `?${query}` : ""}`);
  }

  static async getProjectStats(params: QueryParams = {}): Promise<Array<Record<string, unknown>>> {
    const query = toSearchParams(params);
    return fetchJSON<Array<Record<string, unknown>>>(`/stats/projects${query ? `?${query}` : ""}`);
  }

  static async getModelStats(params: QueryParams = {}): Promise<Array<Record<string, unknown>>> {
    const query = toSearchParams(params);
    return fetchJSON<Array<Record<string, unknown>>>(`/stats/models${query ? `?${query}` : ""}`);
  }

  static async getEndpointStats(params: QueryParams = {}): Promise<Array<Record<string, unknown>>> {
    const query = toSearchParams(params);
    return fetchJSON<Array<Record<string, unknown>>>(`/stats/endpoints${query ? `?${query}` : ""}`);
  }

  static async getTimeline(hours = 24, params: QueryParams = {}): Promise<IrisTimelineResponse> {
    const allParams: QueryParams = { hours, ...params };
    const query = toSearchParams(allParams);
    return fetchJSON<IrisTimelineResponse>(`/stats/timeline?${query}`);
  }

  static async getCostStats(params: QueryParams = {}): Promise<IrisStatsResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisStatsResponse>(`/stats/costs${query ? `?${query}` : ""}`);
  }

  // -- Conversations -----------------------------------------
  static async getConversations(params: QueryParams = {}): Promise<IrisConversationListResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisConversationListResponse>(`/conversations${query ? `?${query}` : ""}`);
  }

  static async getConversation(id: string): Promise<Conversation> {
    return fetchJSON<Conversation>(`/conversations/${id}`);
  }

  static async getConversationFilters(): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>("/conversations/filters");
  }

  static async getConversationWorkflows(id: string): Promise<Workflow[]> {
    return fetchJSON<Workflow[]>(`/conversations/${id}/workflows`, {}, false);
  }

  // -- Live --------------------------------------------------
  static async getLiveActivity(minutes = 5): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/live?minutes=${minutes}`);
  }

  static async getConversationStats(project: string | null = null): Promise<IrisConversationStatsResponse> {
    const params = project ? `?project=${encodeURIComponent(project)}` : "";
    return fetchJSON<IrisConversationStatsResponse>(`/conversations/stats${params}`);
  }

  /**
   * Subscribe to real-time conversation stats via SSE.
   * Uses a shared singleton connection per URL (SSEManager).
   */
  static subscribeConversationStats(
    onStats: (data: unknown) => void,
    project: string | null = null,
  ): { close: () => void } {
    const params = project ? `?project=${encodeURIComponent(project)}` : "";
    const url = `${API_BASE}/admin/conversations/stream${params}`;
    const { unsubscribe } = sseSubscribe(url, (data) => onStats(data));
    return { close: unsubscribe };
  }

  /**
   * Subscribe to real-time collection change events via SSE.
   * Powered by MongoDB Change Streams on the backend.
   * Uses a shared singleton connection (SSEManager).
   */
  static subscribeCollectionChanges(
    { onChange, onStatus }: {
      onChange?: (data: IrisCollectionChangeEvent) => void;
      onStatus?: (data: IrisCollectionChangeEvent) => void;
    },
  ): { close: () => void } {
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
  static async getLmStudioModels(): Promise<{ models: LmStudioModel[] }> {
    return fetchJSON<{ models: LmStudioModel[] }>("/lm-studio/models");
  }

  static async loadLmStudioModel(
    model: string,
    options: { contextLength?: number; flashAttention?: boolean; offloadKvCache?: boolean; evalBatchSize?: number } = {},
  ): Promise<Record<string, unknown>> {
    const body = buildLmStudioLoadBody(model, options);
    return fetchJSON<Record<string, unknown>>("/lm-studio/load", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  static async unloadLmStudioModel(instanceId: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>("/lm-studio/unload", {
      method: "POST",
      body: JSON.stringify({ instance_id: instanceId }),
    });
  }

  static async estimateLmStudioMemory(
    model: string,
    config: Record<string, unknown> = {},
  ): Promise<LmStudioVramEstimate> {
    return fetchJSON<LmStudioVramEstimate>("/lm-studio/estimate", {
      method: "POST",
      body: JSON.stringify({ model, ...config }),
    });
  }

  // -- Workflows ---------------------------------------------
  static async getWorkflows(params: QueryParams = {}): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisPaginatedResponse>(`/workflows${query ? `?${query}` : ""}`);
  }

  static async getWorkflow(id: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/workflows/${id}`);
  }

  // -- Traces ----------------------------------------------
  static async getTraces(params: QueryParams = {}): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisPaginatedResponse>(`/traces${query ? `?${query}` : ""}`);
  }

  static async getTrace(id: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/traces/${id}`);
  }

  static async getSessionStats(agentSessionId: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/sessions/${agentSessionId}/stats`);
  }

  static async getSessionRequests(agentSessionId: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/sessions/${agentSessionId}/requests`);
  }

  // -- Agent Sessions (admin) --------------------------------
  static async getAgentSessions(params: QueryParams = {}): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisPaginatedResponse>(`/agent-sessions${query ? `?${query}` : ""}`);
  }

  static async getAgentSession(id: string): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>(`/agent-sessions/${id}`);
  }

  // -- Media -------------------------------------------------
  static async getMedia(params: QueryParams = {}): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(params);
    return fetchJSON<IrisPaginatedResponse>(`/media${query ? `?${query}` : ""}`);
  }

  // -- Text --------------------------------------------------
  static async getText(params: QueryParams = {}): Promise<IrisPaginatedResponse> {
    const query = toSearchParams(params);
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

  static async getLocalConfig(): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>("/config-local", {}, false);
  }

  // -- Rate Limits -------------------------------------------
  static async getRateLimits(): Promise<Record<string, unknown>> {
    return fetchJSON<Record<string, unknown>>("/config/rate-limits", {}, false);
  }
}
