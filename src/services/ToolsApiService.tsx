import { TOOLS_SERVICE_URL } from "../../config";

/**
 * ToolsApiService — client-side service for querying the
 * tools-api admin endpoints (tool-call telemetry).
 */
export default class ToolsApiService {
  static async _fetch(path: any) {
    const response = await fetch(`${TOOLS_SERVICE_URL}${path}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `tools-api error: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Query tool-call logs with optional filters.
   * @param {object} params - Query parameters
   * @returns {Promise<{ total, count, toolCalls }>}
   */
  static async getToolCalls(params = {}) {
    const query = new URLSearchParams(params).toString();
    return ToolsApiService._fetch(`/admin/tool-calls${query ? `?${query}` : ""}`);
  }

  /**
   * Get aggregated tool-call statistics.
   * @param {object} params - { since }
   * @returns {Promise<object>}
   */
  static async getToolCallStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return ToolsApiService._fetch(`/admin/tool-calls/stats${query ? `?${query}` : ""}`);
  }

  // ---------------------------------------------------------------------------
  // Agentic Tasks
  // ---------------------------------------------------------------------------

  static async _post(path: any, body: any) {
    const response = await fetch(`${TOOLS_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `tools-api error: ${response.status}`);
    }
    return response.json();
  }

  /**
   * List tasks for a project, optionally filtered by status.
   * @param {string} project
   * @param {object} [options]
   * @param {string} [options.status]
   * @param {number} [options.limit]
   * @returns {Promise<{ project, tasks, summary }>}
   */
  static async getAgenticTasks(project: any, { status, limit }: any = {}) {
    return ToolsApiService._post("/agentic/task/list", { project, status, limit });
  }

  /**
   * List all tasks, optionally scoped to an agent session.
   * @param {object} [options]
   * @param {string} [options.status]
   * @param {string} [options.agentSessionId] - Scope to a specific agent session
   * @returns {Promise<{ tasks, summary }>}
   */
  static async getAllAgenticTasks({ status, agentSessionId }: any = {}) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (agentSessionId) params.set("agentSessionId", agentSessionId);
    const query = params.toString();
    return ToolsApiService._fetch(`/agentic/task/list-all${query ? `?${query}` : ""}`);
  }

  /**
   * Create a new task.
   * @param {string} project
   * @param {object} data - { subject, description, status?, metadata? }
   * @returns {Promise<{ task, message }>}
   */
  static async createAgenticTask(project: any, data: any) {
    return ToolsApiService._post("/agentic/task/create", { project, ...data });
  }

  /**
   * Update a task.
   * @param {string} project
   * @param {number} taskId
   * @param {object} updates - { status?, subject?, description?, metadata? }
   * @returns {Promise<{ task, message }>}
   */
  static async updateAgenticTask(project: any, taskId: any, updates: any) {
    return ToolsApiService._post("/agentic/task/update", { project, taskId, ...updates });
  }

  /**
   * Delete a task.
   * @param {string} project
   * @param {number} taskId
   * @returns {Promise<{ deleted, taskId, message }>}
   */
  static async deleteAgenticTask(project: any, taskId: any) {
    return ToolsApiService._post("/agentic/task/delete", { project, taskId });
  }

  // ---------------------------------------------------------------------------
  // File Reading (read-only viewer)
  // ---------------------------------------------------------------------------

  /**
   * Read a file's contents via the agentic file service.
   * @param {string} path - Absolute file path
   * @param {object} [options]
   * @param {number} [options.startLine] - 1-indexed start line
   * @param {number} [options.endLine] - 1-indexed end line
   * @returns {Promise<{ path, content, totalLines, language?, truncated? }>}
   */
  static async readFile(path: any, { startLine, endLine }: any = {}) {
    return ToolsApiService._post("/agentic/file/read", { path, startLine, endLine });
  }

  /**
   * Build a direct URL for streaming a binary file (image, audio, video).
   * Returns a URL string suitable for <img src>, <audio src>, <video src>.
   * @param {string} path - Absolute file path
   * @returns {string}
   */
  static getFileRawUrl(path: any) {
    return `${TOOLS_SERVICE_URL}/agentic/file/raw?path=${encodeURIComponent(path)}`;
  }
}
