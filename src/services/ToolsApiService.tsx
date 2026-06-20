import { TOOLS_SERVICE_URL } from "@/config";
import type { JsonValue } from "../types/types";

// --- Response Interfaces ------------------------------------

export interface ToolCallLogEntry {
  _id: string;
  tool: string;
  status: string;
  duration?: number;
  timestamp: string;
  args?: Record<string, JsonValue>;
  result?: Record<string, JsonValue>;
  error?: string;
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
  }>;
  total?: number;
}

export interface AgenticTask {
  _id?: string;
  taskId: string;
  project: string;
  title?: string;
  status?: string;
  priority?: string;
  description?: string;
  agentConversationId?: string;
  createdAt?: string;
  updatedAt?: string;
  subtasks?: Array<{ title: string; status: string }>;
  subject?: string;
  tags?: string[];
  activeForm?: string;
  metadata?: Record<string, JsonValue>;
  conversationId?: string;
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

// --- Service ------------------------------------------------

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
   */
  static async getToolCalls(
    params: Record<string, string | number | boolean> = {},
  ): Promise<ToolCallListResponse> {
    const entries = Object.entries(params).map(([key, value]) => [key, String(value)]);
    const query = new URLSearchParams(entries).toString();
    return ToolsApiService._fetch<ToolCallListResponse>(
      `/admin/tool-calls${query ? `?${query}` : ""}`,
    );
  }

  /**
   * Get a single tool-call log entry by ID.
   */
  static async getToolCall(id: string): Promise<ToolCallLogEntry> {
    return ToolsApiService._fetch<ToolCallLogEntry>(`/admin/tool-calls/${id}`);
  }

  /**
   * Get aggregated tool-call statistics.
   */
  static async getToolCallStats(
    params: Record<string, string | number | boolean> = {},
  ): Promise<ToolCallStatsResponse> {
    const entries = Object.entries(params).map(([key, value]) => [key, String(value)]);
    const query = new URLSearchParams(entries).toString();
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
   */
  static async getAgenticTasks(
    project: string,
    { status, limit }: { status?: string; limit?: number } = {},
  ): Promise<AgenticTaskListResponse> {
    return ToolsApiService._post<AgenticTaskListResponse>(
      "/agentic/task/list",
      {
        project,
        status,
        limit,
      },
    );
  }

  /**
   * List all tasks, optionally scoped to an agent conversation.
   */
  static async getAllAgenticTasks({
    status,
    conversationId,
  }: {
    status?: string;
    conversationId?: string;
  } = {}): Promise<AgenticTaskListResponse> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (conversationId) params.set("conversationId", conversationId);
    const query = params.toString();
    return ToolsApiService._fetch<AgenticTaskListResponse>(
      `/agentic/task/list-all${query ? `?${query}` : ""}`,
    );
  }

  /**
   * Create a new task.
   */
  static async createAgenticTask(
    project: string,
    data: Omit<
      AgenticTask,
      "_id" | "taskId" | "project" | "createdAt" | "updatedAt"
    >,
  ): Promise<{ task: AgenticTask; message: string }> {
    return ToolsApiService._post<{ task: AgenticTask; message: string }>(
      "/agentic/task/create",
      { project, ...data },
    );
  }

  /**
   * Update a task.
   */
  static async updateAgenticTask(
    project: string,
    taskId: string,
    updates: Partial<AgenticTask>,
  ): Promise<{ task: AgenticTask; message: string }> {
    return ToolsApiService._post<{ task: AgenticTask; message: string }>(
      "/agentic/task/update",
      {
        project,
        taskId,
        ...updates,
      },
    );
  }

  /**
   * Delete a task.
   */
  static async deleteAgenticTask(
    project: string,
    taskId: string,
  ): Promise<{ deleted: boolean; taskId: string; message: string }> {
    return ToolsApiService._post<{
      deleted: boolean;
      taskId: string;
      message: string;
    }>("/agentic/task/delete", { project, taskId });
  }

  // ---------------------------------------------------------------------------
  // File Reading (read-only viewer)
  // ---------------------------------------------------------------------------

  /**
   * Read a file's contents via the agentic file service.
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
