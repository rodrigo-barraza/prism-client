import { PRISM_SERVICE_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { subscribe as sseSubscribe } from "./SSEManager";
import { buildLmStudioLoadBody } from "../utils/utilities";
import { setLocalProviderMeta } from "../components/ProviderLogosComponent";

const API_BASE = PRISM_SERVICE_URL;

function getAdminHeaders() {
  return { ...getBaseHeaders(), "x-username": "admin" };
}

/**
 * Shared fetch helper for IrisService.
 * @param {string} path  — URL path relative to API_BASE (or API_BASE/admin)
 * @param {object} [options] — fetch overrides
 * @param {boolean} [admin=true] — when true, prefixes path with /admin
 */
async function fetchJSON(path: any, options = {}, admin = true) {
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
  static async getRequests(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/requests${query ? `?${query}` : ""}`);
  }

  static async getRequest(id: any) {
    return fetchJSON(`/requests/${id}`);
  }

  static async getRequestAssociations(id: any) {
    return fetchJSON(`/requests/${id}/associations`);
  }

  // -- Stats -------------------------------------------------
  static async getStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/stats${query ? `?${query}` : ""}`);
  }

  static async getProjectStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/stats/projects${query ? `?${query}` : ""}`);
  }

  static async getModelStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/stats/models${query ? `?${query}` : ""}`);
  }

  static async getEndpointStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/stats/endpoints${query ? `?${query}` : ""}`);
  }

  static async getTimeline(hours = 24, params = {}) {
    const allParams = { hours, ...params };
    const query = new URLSearchParams(allParams as any).toString();
    return fetchJSON(`/stats/timeline?${query}`);
  }

  static async getCostStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/stats/costs${query ? `?${query}` : ""}`);
  }

  // -- Conversations -----------------------------------------
  static async getConversations(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/conversations${query ? `?${query}` : ""}`);
  }

  static async getConversation(id: any) {
    return fetchJSON(`/conversations/${id}`);
  }

  static async getConversationFilters() {
    return fetchJSON("/conversations/filters");
  }

  static async getConversationWorkflows(id: any) {
    return fetchJSON(`/conversations/${id}/workflows`, {}, false);
  }

  // -- Live --------------------------------------------------
  static async getLiveActivity(minutes = 5) {
    return fetchJSON(`/live?minutes=${minutes}`);
  }

  static async getConversationStats(project: string | null = null) {
    const params = project ? `?project=${encodeURIComponent(project)}` : "";
    return fetchJSON(`/conversations/stats${params}`);
  }

  /**
   * Subscribe to real-time conversation stats via SSE.
   * Uses a shared singleton connection per URL (SSEManager).


   * @returns {{ close: Function }} — call .close() to unsubscribe
   */
  static subscribeConversationStats(onStats: any, project = null) {
    const params = project ? `?project=${encodeURIComponent(project)}` : "";
    const url = `${API_BASE}/admin/conversations/stream${params}`;
    const { unsubscribe } = sseSubscribe(url, (data: any) => onStats(data));
    return { close: unsubscribe };
  }

  /**
   * Subscribe to real-time collection change events via SSE.
   * Powered by MongoDB Change Streams on the backend.
   * Uses a shared singleton connection (SSEManager).

   * @param {Function} callbacks.onChange - ({ collection, operationType, id, timestamp }) => void

   * @returns {{ close: Function }} — call .close() to unsubscribe
   */
  static subscribeCollectionChanges({ onChange, onStatus }: any) {
    const url = `${API_BASE}/admin/changes/stream`;
    const { unsubscribe } = sseSubscribe(url, (data: any) => {
      if (data.type === "status" && onStatus) {
        onStatus(data);
      } else if (data.type === "change" && onChange) {
        onChange(data);
      }
    });
    return { close: unsubscribe };
  }

  // -- Health ------------------------------------------------
  static async getHealth() {
    return fetchJSON("/health");
  }

  // -- LM Studio Model Management --------------------------
  static async getLmStudioModels() {
    return fetchJSON("/lm-studio/models");
  }

  static async loadLmStudioModel(model: any, options = {}) {
    const body = buildLmStudioLoadBody(model, options);
    return fetchJSON("/lm-studio/load", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  static async unloadLmStudioModel(instanceId: any) {
    return fetchJSON("/lm-studio/unload", {
      method: "POST",
      body: JSON.stringify({ instance_id: instanceId }),
    });
  }

  static async estimateLmStudioMemory(model: any, config = {}) {
    return fetchJSON("/lm-studio/estimate", {
      method: "POST",
      body: JSON.stringify({ model, ...config }),
    });
  }

  // -- Workflows ---------------------------------------------
  static async getWorkflows(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/workflows${query ? `?${query}` : ""}`);
  }

  static async getWorkflow(id: any) {
    return fetchJSON(`/workflows/${id}`);
  }

  // -- Traces ----------------------------------------------
  static async getTraces(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/traces${query ? `?${query}` : ""}`);
  }

  static async getTrace(id: any) {
    return fetchJSON(`/traces/${id}`);
  }

  static async getSessionStats(agentSessionId: any) {
    return fetchJSON(`/sessions/${agentSessionId}/stats`);
  }

  static async getSessionRequests(agentSessionId: any) {
    return fetchJSON(`/sessions/${agentSessionId}/requests`);
  }

  // -- Agent Sessions (admin) --------------------------------
  static async getAgentSessions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/agent-sessions${query ? `?${query}` : ""}`);
  }

  static async getAgentSession(id: any) {
    return fetchJSON(`/agent-sessions/${id}`);
  }

  // -- Media -------------------------------------------------
  static async getMedia(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/media${query ? `?${query}` : ""}`);
  }

  // -- Text --------------------------------------------------
  static async getText(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`/text${query ? `?${query}` : ""}`);
  }

  // -- Config (user route, admin identity) -------------------
  static async getConfig() {
    const config = await fetchJSON("/config", {}, false);
    if (config?.localProviders) {
      setLocalProviderMeta(config.localProviders);
    }
    return config;
  }

  static async getLocalConfig() {
    return fetchJSON("/config-local", {}, false);
  }

  // -- Rate Limits -------------------------------------------
  static async getRateLimits() {
    return fetchJSON("/config/rate-limits", {}, false);
  }
}
