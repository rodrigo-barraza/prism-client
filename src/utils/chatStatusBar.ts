/**
 * What the chat's status bar (the rainbow canvas above the composer) shows:
 * whether it is up, its phase and label, a prefill/load progress and the
 * orchestrator's tokens per second.
 *
 * Pure: the chat memoizes it on its inputs and ChatStatusBarComponent draws
 * it. The phase also colours the sidebar's generating dot (:root tokens), so
 * it is worked out even while the bar is down.
 */

import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { EXECUTION_STATUS } from "../constants";
import type { ToolCallEvent } from "../types/types";
import { awaitingUserStatus, type AwaitingUserInputs } from "./awaitingUserStatus";
import type { AgenticProgress, ClientMessage, SubAgentActivityEntry } from "./agentConversationReducer";
import type { GenProgress } from "./utilities";

export interface ChatStatusBarInputs extends AwaitingUserInputs {
  messages: readonly ClientMessage[];
  isGenerating: boolean;
  toolActivity: readonly ToolCallEvent[];
  subAgentToolActivity: Record<string, SubAgentActivityEntry>;
  agenticProgress: AgenticProgress | null;
  /** Sub-agents and long tools that outlive the stream (the listed conversation's counter). */
  pendingBackgroundTaskCount: number;
  /** The listed conversation says it is running (isActive === true). */
  isConversationExplicitlyActive: boolean;
  /** The listed conversation says it is not (isActive === false). */
  isConversationExplicitlyInactive: boolean;
  liveStreamingLastChunkTime: number | null;
  liveStreamingBurstTokens: number;
  liveStreamingBurstElapsed: number;
  liveGenProgress: GenProgress | null;
  /** performance.now() — chunks count as flowing for a moment after the last one. */
  now: number;
}

export interface ChatStatusBar {
  isActive: boolean;
  phase: string | null;
  label: string | undefined;
  /** Structured progress (0–1) while prefilling or loading a model. */
  progress: number | null;
  tokensPerSecond: number | null;
}

/** Chunks this recent mean the model is streaming right now. */
const CHUNK_FRESH_MILLISECONDS = 2000;

const TERMINAL_SUB_AGENT_PHASES = new Set<string>([
  EXECUTION_STATUS.COMPLETE,
  EXECUTION_STATUS.COMPLETED,
  EXECUTION_STATUS.FAILED,
  EXECUTION_STATUS.STOPPED,
]);

// Priority: generating > thinking > synthesizing > prefilling > executing > loading > starting
const SUB_AGENT_PHASE_PRIORITY = [
  EXECUTION_STATUS.GENERATING,
  EXECUTION_STATUS.THINKING,
  EXECUTION_STATUS.SYNTHESIZING,
  EXECUTION_STATUS.PREFILLING,
  EXECUTION_STATUS.EXECUTING,
  EXECUTION_STATUS.LOADING,
  EXECUTION_STATUS.STARTING,
];

function awaitingSubAgentsLabel(subAgentToolActivity: Record<string, SubAgentActivityEntry>): string {
  const activeTool = Object.values(subAgentToolActivity).find((subAgent) => subAgent.currentTool)?.currentTool;
  return activeTool ? `Awaiting ${renderToolName(activeTool)}…` : "Awaiting Sub-Agents…";
}

export function deriveChatStatusBar(inputs: ChatStatusBarInputs): ChatStatusBar {
  const {
    messages,
    isGenerating,
    isUserExplicitlyStopped,
    toolActivity,
    subAgentToolActivity,
    agenticProgress,
    pendingBackgroundTaskCount,
    isConversationExplicitlyActive,
    isConversationExplicitlyInactive,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    liveGenProgress,
    now,
  } = inputs;
  const lastMessage = messages[messages.length - 1];

  // Derive raw status phase/label with robust local fallbacks when cloud models
  // do not emit explicit status events or when messages lack statusPhase metadata.
  let derivedPhase: string | null = null;
  let derivedLabel: string | null = null;

  // Check if there are active chunks flowing for this generation burst
  const isChunksFlowing =
    !!liveStreamingLastChunkTime && now - liveStreamingLastChunkTime < CHUNK_FRESH_MILLISECONDS;

  // Only derive phase from the last message's content/thinking when
  // it's the actively streaming message (no toolCalls). Finalized
  // messages from prior agentic iterations carry stale thinking/content
  // that would incorrectly show "Thinking..." during prompt prefill.
  const isActiveStreamingMessage =
    lastMessage?.role === "assistant" && (!lastMessage.toolCalls || lastMessage.toolCalls.length === 0);

  if (isGenerating && lastMessage?.role === "assistant") {
    if (isChunksFlowing) {
      const segments = lastMessage.contentSegments || [];
      const lastSegment = segments[segments.length - 1];
      if (lastSegment?.type === "thinking") {
        derivedPhase = "thinking";
        derivedLabel = "Thinking...";
      } else if (lastSegment?.type === "text") {
        derivedPhase = "generating";
        derivedLabel = "Generating...";
      }
    }

    if (!derivedPhase && isActiveStreamingMessage) {
      if (lastMessage.content && lastMessage.content.trim().length > 0) {
        derivedPhase = "generating";
        derivedLabel = "Generating...";
      } else if (lastMessage.thinking && lastMessage.thinking.trim().length > 0) {
        derivedPhase = "thinking";
        derivedLabel = "Thinking...";
      }
    }
  }

  // On iteration 2+, the model is doing prompt prefill,
  // not bootstrapping — use "prefilling" as the default phase.
  const isLaterIteration = (agenticProgress?.iteration ?? 0) > 1;
  const iterationFallbackPhase = isLaterIteration ? "prefilling" : "starting";
  const iterationFallbackLabel = isLaterIteration ? "Prefilling..." : "Starting...";

  const rawPhase = isGenerating ? derivedPhase || lastMessage?.statusPhase || iterationFallbackPhase : null;
  const rawLabel = isGenerating ? derivedLabel || lastMessage?.status || iterationFallbackLabel : undefined;

  const hasActiveTools = toolActivity.some(
    (tool) => tool.status === EXECUTION_STATUS.CALLING || tool.status === EXECUTION_STATUS.STREAMING,
  );
  // A turn parked on its user (a card or a question pending) shows
  // "Waiting for you" — streaming to this tab or not (awaitingUserStatus).
  const awaitingStatus = awaitingUserStatus(inputs);

  // -- Derive phase from live sub-agent activity --------------
  // When sub-agents are active (whether via an in-flight tool call
  // or after a non-blocking create_subagents dispatch), the orchestrator
  // bar should reflect the aggregate sub-agent state.
  let subAgentDerivedPhase: string | null = null;
  let subAgentDerivedLabel: string | null = null;
  let hasNonTerminalSubAgents = false;

  // Check if the conversation has pending background tasks (sub-agents,
  // long-running tools) that outlive the SSE stream. This counter is
  // persisted in MongoDB and fetched with the conversation list.
  const hasPendingBackgroundTasks = pendingBackgroundTaskCount > 0;

  if (Object.keys(subAgentToolActivity).length > 0) {
    const subAgents = Object.values(subAgentToolActivity);

    // Track whether ANY sub-agent hasn't reached a terminal state yet.
    // A sub-agent with no phase is only treated as non-terminal when the
    // conversation is still actively running (generating or has pending
    // background tasks). Once both are false the conversation is done and
    // phase-less entries are considered stale residue that should not
    // keep the status bar alive.
    const conversationIsStillRunning = isGenerating || hasPendingBackgroundTasks;
    hasNonTerminalSubAgents = subAgents.some((subAgent) =>
      subAgent.phase ? !TERMINAL_SUB_AGENT_PHASES.has(subAgent.phase) : conversationIsStillRunning,
    );

    const activeSubAgents = subAgents.filter(
      (subAgent) =>
        subAgent.phase &&
        !TERMINAL_SUB_AGENT_PHASES.has(subAgent.phase) &&
        subAgent.phase !== EXECUTION_STATUS.SPAWNED,
    );
    if (activeSubAgents.length > 0) {
      for (const phase of SUB_AGENT_PHASE_PRIORITY) {
        const count = activeSubAgents.filter((subAgent) => subAgent.phase === phase).length;
        if (count > 0) {
          subAgentDerivedPhase = phase;
          const total = activeSubAgents.length;
          // Multiple sub-agents — show aggregate count; single sub-agent uses default phase label (null)
          subAgentDerivedLabel = total > 1 ? `${count}/${total} sub-agent${total !== 1 ? "s" : ""} ${phase}…` : null;
          break;
        }
      }
    }

    // When sub-agents exist but none matched the priority phases
    // (all spawned, undefined phase from tool execution, etc.),
    // fall back to "delegating" to keep the status bar informative.
    // Show the active tool name from any sub-agent that has one.
    if (!subAgentDerivedPhase && hasNonTerminalSubAgents) {
      subAgentDerivedPhase = "delegating";
      subAgentDerivedLabel = awaitingSubAgentsLabel(subAgentToolActivity);
    }
  }

  // Fallback: if no live SSE sub-agent activity but pendingBackgroundTasks > 0,
  // the SSE stream has closed but async work is still running in the background.
  // Show a delegating phase so the status bar stays alive.
  // Guard: only activate when the orchestrator is NOT generating — when
  // isGenerating is true the SSE stream is still open and the actual
  // generation phase (generating/thinking/etc.) should take priority.
  if (!subAgentDerivedPhase && hasPendingBackgroundTasks && !isGenerating) {
    subAgentDerivedPhase = "delegating";
    subAgentDerivedLabel = "Awaiting Background Tasks…";
  }

  const activeTool = toolActivity.find((tool) => tool.status === "calling" || tool.status === "streaming");
  const activeToolLabel = activeTool ? `Running tool ${renderToolName(activeTool.name)}...` : "Executing...";

  const isToolGenerating =
    hasActiveTools &&
    !!liveGenProgress &&
    ((liveGenProgress.activeRequests ?? 0) > 0 || (liveGenProgress.tokensPerSecond ?? 0) > 0);

  const phase = isUserExplicitlyStopped
    ? null
    : awaitingStatus
      ? awaitingStatus.phase
      : isGenerating
        ? subAgentDerivedPhase || (isToolGenerating ? "generating" : hasActiveTools ? "executing" : rawPhase)
        : subAgentDerivedPhase
          ? "delegating"
          : isConversationExplicitlyActive
            ? "synthesizing"
            : null;

  const label = awaitingStatus
    ? awaitingStatus.label
    : isGenerating
      ? subAgentDerivedPhase
        ? subAgentDerivedLabel
        : hasActiveTools
          ? activeToolLabel
          : rawLabel
      : subAgentDerivedPhase
        ? subAgentDerivedLabel || awaitingSubAgentsLabel(subAgentToolActivity)
        : isConversationExplicitlyActive
          ? "Synthesizing…"
          : undefined;

  // Structured progress (0-1) from LM Studio prompt prefilling / model loading
  const rawProgress = phase === "prefilling" || phase === "loading" ? (lastMessage?._statusProgress ?? null) : null;

  // Orchestrator tok/s from burst-scoped generation metrics.
  // Show whenever the model is actively streaming chunks — including
  // during tool-call JSON generation (where hasActiveTools is true but
  // chunks are still flowing). We check chunk freshness rather than
  // phase labels to avoid going stale while the model streams FC args.
  let tokensPerSecond: number | null = null;
  const isOrchestratorGenerating =
    ((phase === "generating" || phase === "thinking") && !subAgentDerivedPhase) ||
    (hasActiveTools && isChunksFlowing) ||
    isToolGenerating;
  if (isOrchestratorGenerating && liveStreamingBurstTokens > 1 && liveStreamingBurstElapsed > 0) {
    tokensPerSecond = liveStreamingBurstTokens / (liveStreamingBurstElapsed / 1000);
  } else if (isToolGenerating && liveGenProgress && (liveGenProgress.tokensPerSecond ?? 0) > 0) {
    tokensPerSecond = liveGenProgress.tokensPerSecond ?? null;
  }

  // The status bar is active when the orchestrator is generating,
  // OR when sub-agents are still running after a non-blocking dispatch,
  // OR when any sub-agent hasn't reached a terminal state yet
  // (covers spawned/undefined-phase windows during create_subagents).
  //
  // isGenerating (client-side SSE state) overrides isConversationExplicitlyInactive
  // because the conversations array may contain a stale isActive: false from
  // the prior completed generation that hasn't been refreshed yet.
  const isActive =
    !isUserExplicitlyStopped &&
    (!!awaitingStatus ||
      isGenerating ||
      (!isConversationExplicitlyInactive &&
        (!!subAgentDerivedPhase ||
          hasNonTerminalSubAgents ||
          hasPendingBackgroundTasks ||
          isConversationExplicitlyActive)));

  return {
    isActive,
    phase,
    label: label || undefined,
    progress: typeof rawProgress === "number" ? rawProgress : null,
    tokensPerSecond,
  };
}
