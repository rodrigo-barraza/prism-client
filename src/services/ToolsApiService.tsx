import { TOOLS_SERVICE_URL } from "@/config";

// ─── Response Interfaces ────────────────────────────────────

export interface ToolCallLogEntry {
  _id: string;
  tool: string;
  status: string;
  duration?: number;
  timestamp: string;
  [key: string]: unknown;
}

export interface ToolCallListResponse {
  total: number;
  count: number;
  toolCalls: ToolCallLogEntry[];
}

export interface ToolCallStatsResponse {
  stats: Array<{
    tool: string;
    totalCalls: number;
    avgDuration?: number;
    successRate?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface AgenticTask {
  _id?: string;
  taskId: string;
  project: string;
  title: string;
  status: string;
  priority?: string;
  description?: string;
  agentSessionId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface AgenticTaskListResponse {
  project?: string;
  tasks: AgenticTask[];
  summary: Record<string, number>;
}

export interface FileReadResponse {
  path: string;
  content: string;
  totalLines: number;
  language?: string;
  truncated?: boolean;
}

// ─── Service ────────────────────────────────────────────────

/**
 * ToolsApiService — client-side service for querying the
 * tools-api admin endpoints (tool-call telemetry).
 */
export default class ToolsApiService {
  static async _fetch<T = unknown>(path: string): Promise<T> {
    const response = await fetch(`${TOOLS_SERVICE_URL}${path}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `tools-api error: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Query tool-call logs with optional filters.
   *
   * @returns {Promise<{ total, count, toolCalls }>}
   */
  static async getToolCalls(params: Record<string, string> = {}): Promise<ToolCallListResponse> {
    const query = new URLSearchParams(params).toString();
    return ToolsApiService._fetch<ToolCallListResponse>(
      `/admin/tool-calls${query ? `?${query}` : ""}`,
    );
  }

  /**
   * Get aggregated tool-call statistics.
   */
  static async getToolCallStats(params: Record<string, string> = {}): Promise<ToolCallStatsResponse> {
    const query = new URLSearchParams(params).toString();
    return ToolsApiService._fetch<ToolCallStatsResponse>(
      `/admin/tool-calls/stats${query ? `?${query}` : ""}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Agentic Tasks
  // ---------------------------------------------------------------------------

  static async _post<T = unknown>(path: string, body: unknown): Promise<T> {
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
   *
   * @returns {Promise<{ project, tasks, summary }>}
   */
  static async getAgenticTasks(
    project: string,
    { status, limit }: { status?: string; limit?: number } = {},
  ): Promise<AgenticTaskListResponse> {
    return ToolsApiService._post<AgenticTaskListResponse>("/agentic/task/list", {
      project,
      status,
      limit,
    });
  }

  /**
   * List all tasks, optionally scoped to an agent session.
   *
   * @returns {Promise<{ tasks, summary }>}
   */
  static async getAllAgenticTasks(
    { status, agentSessionId }: { status?: string; agentSessionId?: string } = {},
  ): Promise<AgenticTaskListResponse> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (agentSessionId) params.set("agentSessionId", agentSessionId);
    const query = params.toString();
    return ToolsApiService._fetch<AgenticTaskListResponse>(
      `/agentic/task/list-all${query ? `?${query}` : ""}`,
    );
  }

  /**
   * Create a new task.
   *
   * @returns {Promise<{ task, message }>}
   */
  static async createAgenticTask(
    project: string,
    data: Omit<AgenticTask, "_id" | "taskId" | "project" | "createdAt" | "updatedAt">,
  ): Promise<{ task: AgenticTask; message: string }> {
    return ToolsApiService._post<{ task: AgenticTask; message: string }>("/agentic/task/create", { project, ...data });
  }

  /**
   * Update a task.
   *
   * @returns {Promise<{ task, message }>}
   */
  static async updateAgenticTask(
    project: string,
    taskId: string,
    updates: Partial<AgenticTask>,
  ): Promise<{ task: AgenticTask; message: string }> {
    return ToolsApiService._post<{ task: AgenticTask; message: string }>("/agentic/task/update", {
      project,
      taskId,
      ...updates,
    });
  }

  /**
   * Delete a task.
   *
   * @returns {Promise<{ deleted, taskId, message }>}
   */
  static async deleteAgenticTask(
    project: string,
    taskId: string,
  ): Promise<{ deleted: boolean; taskId: string; message: string }> {
    return ToolsApiService._post<{ deleted: boolean; taskId: string; message: string }>("/agentic/task/delete", { project, taskId });
  }

  // ---------------------------------------------------------------------------
  // File Reading (read-only viewer)
  // ---------------------------------------------------------------------------

  /**
   * Read a file's contents via the agentic file service.
   *
   * @returns {Promise<{ path, content, totalLines, language?, truncated? }>}
   */
  static async readFile(
    path: string,
    { startLine, endLine }: { startLine?: number; endLine?: number } = {},
  ): Promise<FileReadResponse> {
    return ToolsApiService._post<FileReadResponse>("/agentic/file/read", {
      path,
      startLine,
      endLine,
    });
  }

  /**
   * Build a direct URL for streaming a binary file (image, audio, video).
   * Returns a URL string suitable for <img src>, <audio src>, <video src>.
   */
  static getFileRawUrl(path: string): string {
    return `${TOOLS_SERVICE_URL}/agentic/file/raw?path=${encodeURIComponent(path)}`;
  }
}
