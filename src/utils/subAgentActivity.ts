import type { CoordinatorSubAgent } from "../types/types";

/**
 * Normalize a backend sub-agent status to the frontend phase vocabulary.
 *
 * The backend persists sub-agent status as "running" | "complete" | "failed" | "stopped",
 * and SubAgentResultBuilder transforms "complete" → "completed" for tool results.
 * The frontend terminal-phase checks use "complete" | "failed".
 *
 * "running" maps to "generating" so the StatusBarComponent shows active state.
 * Sub-agent dispatch is non-blocking: the parent's stream can end while its
 * sub-agents keep running — without this, the StatusBar would always show
 * idle because no live SSE events reach the client to override the hydrated
 * phase. If the sub-agent already completed before the hydration call, the
 * next poll will return "complete" and resolve the StatusBar to idle.
 */
export function normalizeSubAgentStatusToPhase(backendStatus: string): string {
  switch (backendStatus) {
    case "completed":
    case "complete":
    case "stopped":
      return "complete";
    case "running":
      return "generating";
    case "failed":
      return "failed";
    default:
      return backendStatus;
  }
}

const TERMINAL_PHASES = new Set(["complete", "completed", "failed", "stopped"]);

/** The fields of a live sub-agent activity entry this module reads and writes. */
export interface SubAgentActivityStatus {
  phase?: string;
  currentTool?: string | null;
  iteration?: number;
  toolCount?: number;
  toolNames?: Record<string, number>;
  description?: string;
  conversationId?: string;
}

/**
 * Settle live sub-agent activity from the server's list
 * (GET /orchestrator/sub-agents): every listed agent takes the server's
 * status. With `completeUnlisted`, a still-running entry the server no
 * longer lists is marked complete — its terminal event was missed, and it
 * would otherwise keep the status bar busy for good.
 */
export function applyServerSubAgentStatuses<Entry extends SubAgentActivityStatus>(
  previousActivity: Record<string, Entry>,
  serverSubAgents: CoordinatorSubAgent[],
  { completeUnlisted = false }: { completeUnlisted?: boolean } = {},
): Record<string, Entry> {
  const nextActivity: Record<string, Entry> = { ...previousActivity };
  const listedAgentIds = new Set<string>();
  for (const subAgent of serverSubAgents) {
    const agentId = subAgent.agentId || subAgent.id;
    if (!agentId) continue;
    listedAgentIds.add(agentId);
    const existingEntry = nextActivity[agentId];
    const phase = normalizeSubAgentStatusToPhase(subAgent.status);
    nextActivity[agentId] = {
      ...existingEntry,
      toolCount: subAgent.toolCallCount || existingEntry?.toolCount || 0,
      currentTool: TERMINAL_PHASES.has(phase) ? null : (existingEntry?.currentTool ?? null),
      iteration: existingEntry?.iteration ?? 0,
      toolNames: subAgent.toolNames || existingEntry?.toolNames || {},
      description: subAgent.description,
      phase,
      conversationId:
        subAgent.subAgentConversationId || existingEntry?.conversationId || undefined,
    } as Entry;
  }
  if (completeUnlisted) {
    for (const [agentId, entry] of Object.entries(nextActivity)) {
      if (listedAgentIds.has(agentId)) continue;
      if (entry.phase && TERMINAL_PHASES.has(entry.phase)) continue;
      nextActivity[agentId] = { ...entry, phase: "complete", currentTool: null };
    }
  }
  return nextActivity;
}
