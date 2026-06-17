/**
 * WorkflowExecutor — thin SSE client that delegates DAG execution to
 * the prism-service backend via POST /workflows/:id/run and streams
 * progress events back to the caller.
 *
 * The heavy DAG orchestration (topological sort, node execution,
 * file resolution, conversation linking) now lives server-side in
 * WorkflowExecutionService.ts.
 */
import { PRISM_SERVICE_URL } from "@/config";
import { getBaseHeaders } from "./serviceHeaders";
import { getErrorMessage } from "../utils/errorMessage";

// --- Types ---------------------------------------------------

interface WorkflowOutputs {
  text?: string;
  image?: string;
  audio?: string;
  embedding?: number[];
  conversation?: unknown[];
  [key: string]: unknown;
}

interface WorkflowCallbacks {
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, outputs: WorkflowOutputs) => void;
  onNodeError?: (nodeId: string, error: unknown) => void;
  onViewerPartial?: (nodeId: string, outputs: WorkflowOutputs) => void;
  onNodeContentUpdate?: (nodeId: string, data: unknown) => void;
}

interface WorkflowModelNode {
  id: string;
  nodeType: string;
  [key: string]: unknown;
}

interface WorkflowEdge {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceModality: string;
  targetModality: string;
}

interface WorkflowRunEvent {
  type: string;
  nodeId?: string;
  outputs?: WorkflowOutputs;
  error?: string;
  message?: string;
  nodeResults?: Record<string, WorkflowOutputs>;
  conversationIds?: string[];
  nodeStatuses?: Record<string, string>;
  totalNodes?: number;
}

// --- Internal abort handle -----------------------------------

let activeAbortController: AbortController | null = null;

// --- SSE Executor --------------------------------------------

export async function executeWorkflow(
  workflowId: string,
  _nodes: WorkflowModelNode[],
  _edges: WorkflowEdge[],
  callbacks: WorkflowCallbacks,
): Promise<{ nodeOutputs: Record<string, WorkflowOutputs>; conversationIds: string[] }> {
  const controller = new AbortController();
  activeAbortController = controller;

  let finalNodeOutputs: Record<string, WorkflowOutputs> = {};
  let finalConversationIds: string[] = [];

  try {
    const response = await fetch(`${PRISM_SERVICE_URL}/workflows/${workflowId}/run`, {
      method: "POST",
      headers: getBaseHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        (errorBody as Record<string, string>).error || `HTTP ${response.status}`,
      );
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonString = line.slice(6);
        if (!jsonString) continue;

        let data: WorkflowRunEvent;
        try {
          data = JSON.parse(jsonString);
        } catch {
          continue;
        }

        switch (data.type) {
          case "node_start":
            if (data.nodeId) callbacks.onNodeStart?.(data.nodeId);
            break;

          case "node_complete":
            if (data.nodeId) {
              callbacks.onNodeComplete?.(data.nodeId, data.outputs || {});
            }
            break;

          case "node_error":
            if (data.nodeId) {
              callbacks.onNodeError?.(data.nodeId, data.error || "Unknown error");
            }
            break;

          case "viewer_partial":
            if (data.nodeId) {
              callbacks.onViewerPartial?.(data.nodeId, data.outputs || {});
            }
            break;

          case "run_complete":
            finalNodeOutputs = data.nodeResults || {};
            finalConversationIds = data.conversationIds || [];
            break;

          case "error":
            throw new Error(data.message || "Workflow execution failed");
        }
      }
    }

    return {
      nodeOutputs: finalNodeOutputs,
      conversationIds: finalConversationIds,
    };
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}

/**
 * Abort a running workflow execution via the backend abort endpoint.
 */
export async function abortWorkflow(workflowId: string): Promise<void> {
  // Cancel the local SSE stream
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  // Also signal the backend to cancel server-side execution
  try {
    await fetch(`${PRISM_SERVICE_URL}/workflows/${workflowId}/abort`, {
      method: "POST",
      headers: getBaseHeaders(),
    });
  } catch (error: unknown) {
    console.error("Failed to abort workflow:", getErrorMessage(error));
  }
}
