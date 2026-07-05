import React, { useMemo, useState, useEffect } from "react";
import { Users, ExternalLink, MessageSquare, StopCircle } from "lucide-react";
import { RendererProps, SubAgentActivity, SubAgentToolActivityItem, ToolArgs } from "../types";
import { tryParse, basename } from "../utils";
import { StatusBadge, RawResultToggle } from "../SharedComponents";
import { ToolBadgeRow } from "../../ToolBadgeComponent";
import StatusBarComponent from "../../StatusBarComponent";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { EXECUTION_STATUS } from "../../../constants";
import type { ToolCallEvent } from "../../../types/types";
import type { StatusBarPhase } from "../../../utils/statusBarPhaseTokens";
import styles from "../ToolResultRenderersComponent.module.css";

// -- Coordinator Tools ---------------------------------------------------

/**
 * Mini status bar for an individual spawned sub-agent.
 * Uses the shared StatusBarComponent.
 */
export function SubAgentStatusBar({ activity }: { activity: SubAgentActivity | null }) {
  if (!activity) return null;
  const {
    currentTool,
    toolCount = 0,
    iteration = 0,
    maxIterations,
    phase,
  } = activity;
  const isTerminal = phase === EXECUTION_STATUS.COMPLETE || phase === EXECUTION_STATUS.COMPLETED || phase === EXECUTION_STATUS.FAILED || phase === EXECUTION_STATUS.STOPPED;
  const isToolActive = !!currentTool;

  // Detect sub-sub-agent delegation: the sub-agent's LLM is "complete" but it
  // spawned a nested team whose create_subagents tool call is still in-flight.
  const hasActiveSubSubAgents =
    isTerminal &&
    phase !== "failed" &&
    Array.isArray(activity.toolCalls) &&
    activity.toolCalls.some(
      (toolCall) =>
        (toolCall.name === "create_subagents" || toolCall.name === "create_subagent") &&
        (toolCall.status === "calling" || toolCall.status === "streaming"),
    );

  const hasPhase = !!phase && !isTerminal;
  const isActive = isToolActive || hasPhase || hasActiveSubSubAgents;
  const toolDisplayName = currentTool ? renderToolName(currentTool) : null;

  const isToolGeneratingTokens =
    isToolActive &&
    activity.tokensPerSecond !== undefined &&
    activity.tokensPerSecond !== null &&
    activity.tokensPerSecond > 0;

  // Derive the effective phase for StatusBarComponent:
  // - Sub-sub-agents still running → "delegating" (teal — awaiting nested team)
  // - Tool active and generating → "generating" (purple — model sub-request generating)
  // - Tool executing → "executing" (orange — actively running a tool)
  // - Terminal → null (idle)
  // - Otherwise → actual model phase (generating, thinking, prefilling, etc.)
  const effectivePhaseValue = hasActiveSubSubAgents
    ? "delegating"
    : isToolGeneratingTokens
      ? "generating"
      : isToolActive
        ? "executing"
        : isTerminal
          ? null
          : phase;

  // Show delegation label, tool name, or phase progress label
  const subSubAgentToolLabel = hasActiveSubSubAgents && currentTool
    ? `Awaiting ${renderToolName(currentTool)}…`
    : "Awaiting Sub-Agents…";
  const displayLabel = hasActiveSubSubAgents
    ? subSubAgentToolLabel
    : isToolActive
      ? toolDisplayName
      : activity.phaseLabel || undefined;

  // Delegation shows the team icon, tool calls show a wrench emoji, generation uses default sparkles icon, phase uses default icons
  const phaseIcon = hasActiveSubSubAgents
    ? "👥"
    : isToolGeneratingTokens
      ? undefined
      : isToolActive
        ? "🔧"
        : undefined;

  // Progress (0-1) from LM Studio prompt processing / model loading
  const phaseProgress =
    effectivePhaseValue === EXECUTION_STATUS.PREFILLING || effectivePhaseValue === EXECUTION_STATUS.LOADING
      ? (activity.phaseProgress ?? null)
      : null;

  // Idle label reflects terminal state or tool count
  const statusIdleLabel = isTerminal
    ? phase === EXECUTION_STATUS.FAILED
      ? "Sub-agent failed"
      : `Done · ${toolCount} tool${toolCount !== 1 ? "s" : ""} used`
    : toolCount > 0
      ? `${toolCount} tools used`
      : "Sub-agent idle";

  // Per-sub-agent tok/s from the backend's burst-scoped generation progress.
  let tokensPerSecondValue = null;
  if (isToolGeneratingTokens) {
    tokensPerSecondValue = activity.tokensPerSecond;
  } else if (!isToolActive && (phase === "generating" || phase === "thinking")) {
    tokensPerSecondValue = activity.tokensPerSecond ?? null;
  }

  return (
    <StatusBarComponent
      active={isActive}
      variant="subAgent"
      phase={effectivePhaseValue as StatusBarPhase | undefined}
      label={displayLabel ?? undefined}
      icon={phaseIcon}
      progress={phaseProgress}
      tokensPerSecond={tokensPerSecondValue}
      iteration={iteration}
      maxIterations={maxIterations}
      idleIcon={<Users size={10} />}
      idleLabel={statusIdleLabel}
      registryKey={activity.conversationId}
      initialElapsedMilliseconds={activity.initialElapsedMilliseconds}
    />
  );
}

/**
 * Renders live status bars for nested sub-agents spawned by a sub-agent's
 * create_subagents tool call.
 */
const MAXIMUM_RECURSIVE_SUB_AGENT_DEPTH = 10;

export function SubSubAgentStatusBars({
  toolCalls,
  subAgentToolActivity,
  depth = 0,
}: {
  toolCalls: ToolCallEvent[];
  subAgentToolActivity?: Record<string, SubAgentActivity | SubAgentToolActivityItem> | null;
  depth?: number;
}) {
  if (!subAgentToolActivity) return null;
  if (depth >= MAXIMUM_RECURSIVE_SUB_AGENT_DEPTH) return null;

  const createTeamToolCalls = toolCalls.filter(
    (toolCall) => toolCall.name === "create_subagents" || toolCall.name === "create_subagent",
  );

  if (createTeamToolCalls.length === 0) return null;

  const subSubAgentActivityEntries: Array<{
    agentId: string;
    description: string;
    activity: SubAgentActivity | SubAgentToolActivityItem;
  }> = [];

  for (const createTeamCall of createTeamToolCalls) {
    const parsedCallResult = createTeamCall.result
      ? typeof createTeamCall.result === "string"
        ? (() => { try { return JSON.parse(createTeamCall.result); } catch { return null; } })()
        : createTeamCall.result
      : null;

    const resultMemberItems: Array<{ agent_id?: string; description?: string }> =
      Array.isArray(parsedCallResult)
        ? parsedCallResult
        : (parsedCallResult as Record<string, unknown>)?.members as Array<{ agent_id?: string; description?: string }>
          ?? (parsedCallResult as Record<string, unknown>)?.agents as Array<{ agent_id?: string; description?: string }>
          ?? [];

    const argumentMembers: Array<{ description?: string }> =
      Array.isArray((createTeamCall.args as ToolArgs)?.members)
        ? (createTeamCall.args as ToolArgs).members!
        : [];

    // Match by agent_id from result members first
    for (const resultMemberItem of resultMemberItems) {
      if (resultMemberItem.agent_id && subAgentToolActivity[resultMemberItem.agent_id]) {
        subSubAgentActivityEntries.push({
          agentId: resultMemberItem.agent_id,
          description: resultMemberItem.description || `Sub-Agent`,
          activity: subAgentToolActivity[resultMemberItem.agent_id],
        });
      }
    }

    // Fallback: match by description from args if no result members were found
    if (subSubAgentActivityEntries.length === 0 && argumentMembers.length > 0) {
      for (const argumentMemberItem of argumentMembers) {
        if (!argumentMemberItem.description) continue;
        const matchedSubAgentActivity = Object.entries(subAgentToolActivity).find(
          ([, value]) =>
            value.description &&
            argumentMemberItem.description &&
            value.description.includes(argumentMemberItem.description),
        );
        if (matchedSubAgentActivity) {
          subSubAgentActivityEntries.push({
            agentId: matchedSubAgentActivity[0],
            description: argumentMemberItem.description,
            activity: matchedSubAgentActivity[1],
          });
        }
      }
    }
  }

  if (subSubAgentActivityEntries.length === 0) return null;

  return (
    <div
      className={styles['sub-sub-agent-status-bars']}
      style={depth > 0 ? { paddingInlineStart: 8 } : undefined}
    >
      {subSubAgentActivityEntries.map((activityEntry) => {
        const subAgentActivityData = activityEntry.activity as SubAgentActivity;
        const hasNestedTeamCalls =
          Array.isArray(subAgentActivityData?.toolCalls) &&
          subAgentActivityData.toolCalls.some(
            (toolCall) => toolCall.name === "create_subagents" || toolCall.name === "create_subagent",
          );

        return (
          <div key={activityEntry.agentId} className={styles['sub-sub-agent-status-entry']}>
            <span className={styles['sub-sub-agent-label']}>
              {activityEntry.description}
            </span>
            <SubAgentStatusBar activity={subAgentActivityData} />
            {hasNestedTeamCalls && (
              <SubSubAgentStatusBars
                toolCalls={subAgentActivityData.toolCalls!}
                subAgentToolActivity={subAgentToolActivity}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TeamCreateRenderer({
  result,
  args,
  subAgentToolActivity,
  subAgentStartIndex = 0,
}: RendererProps) {
  const parsedTeamResult = tryParse(result);
  const rawArgumentMembers = args?.members;
  const argumentMembersList = Array.isArray(rawArgumentMembers) ? rawArgumentMembers : [];
  const rawResultMembersList = Array.isArray(parsedTeamResult)
    ? parsedTeamResult
    : (parsedTeamResult?.members ?? parsedTeamResult?.agents ?? []);
  const allResultMembersList = Array.isArray(rawResultMembersList) ? rawResultMembersList : [];
  const isSynthesisAgentId = (member: Record<string, unknown>) =>
    typeof member.agent_id === "string" && member.agent_id.startsWith("synthesis-");
  const filteredResultMembers = allResultMembersList.filter((member) => !isSynthesisAgentId(member));
  const isTeamCreationComplete = Array.isArray(parsedTeamResult)
    ? parsedTeamResult.length > 0
    : !!parsedTeamResult;
  const teamNameString = args?.name || (Array.isArray(parsedTeamResult) ? "" : parsedTeamResult?.team) || "";

  const hasCreationError = !!parsedTeamResult?.error || (
    Array.isArray(parsedTeamResult) &&
    parsedTeamResult.length > 0 &&
    parsedTeamResult.every((member: Record<string, unknown>) => !!member.error && !member.agent_id)
  );

  const terminalSubAgentPhasesSet = useMemo(() => new Set(["complete", "completed", "failed", "stopped"]), []);
  const hasActiveSubAgentsInTeam = useMemo(() => {
    if (!subAgentToolActivity || hasCreationError) return false;
    const scopedAgentIdsList = filteredResultMembers
      .map((member: Record<string, unknown>) => member.agent_id as string | undefined)
      .filter(Boolean) as string[];
    if (scopedAgentIdsList.length === 0) return false;
    return scopedAgentIdsList.some((agentId) => {
      const subAgentActivityItem = subAgentToolActivity[agentId];
      return subAgentActivityItem && (
        !!subAgentActivityItem.currentTool ||
        (!!subAgentActivityItem.phase && !terminalSubAgentPhasesSet.has(subAgentActivityItem.phase))
      );
    });
  }, [subAgentToolActivity, terminalSubAgentPhasesSet, filteredResultMembers, hasCreationError]);

  const [, setTickCounter] = useState(0);
  useEffect(() => {
    if (!hasActiveSubAgentsInTeam) return;
    const teamTickIntervalId = setInterval(() => setTickCounter((tick) => tick + 1), 500);
    return () => clearInterval(teamTickIntervalId);
  }, [hasActiveSubAgentsInTeam]);

  const getSubAgentSpeed = (activity: SubAgentActivity | null) => {
    if (!activity?.tokensPerSecond) return null;
    if (activity.phase !== "generating" && activity.phase !== "thinking")
      return null;
    return activity.tokensPerSecond;
  };

  const orderedSubAgentIdsList = useMemo(() => {
    if (!subAgentToolActivity) return [];
    return Object.keys(subAgentToolActivity);
  }, [subAgentToolActivity]);

  const getSubAgentActivity = (
    memberItem: { agent_id?: string; description?: string; [key: string]: unknown },
    memberItemIndex: number,
  ) => {
    if (!subAgentToolActivity) return null;
    if ((memberItem as Record<string, unknown>).error && !memberItem.agent_id) return null;
    if (memberItem.agent_id) return subAgentToolActivity[memberItem.agent_id] || null;
    if (memberItemIndex != null && orderedSubAgentIdsList[memberItemIndex]) {
      return subAgentToolActivity[orderedSubAgentIdsList[memberItemIndex]] || null;
    }
    if (memberItem.description) {
      return (
        Object.values(subAgentToolActivity).find(
          (activity) =>
            activity.description &&
            memberItem.description &&
            activity.description.includes(memberItem.description),
        ) || null
      );
    }
    return null;
  };

  const succeededMembersCount =
    parsedTeamResult?.succeeded ??
    filteredResultMembers.filter((member) => member.status === EXECUTION_STATUS.COMPLETED).length;
  const failedMembersCount =
    parsedTeamResult?.failed ??
    filteredResultMembers.filter((member) => member.status === EXECUTION_STATUS.FAILED).length;
  const areAllMembersDone = isTeamCreationComplete
    ? filteredResultMembers.every(
        (member: Record<string, unknown>) =>
          member.status === EXECUTION_STATUS.COMPLETED ||
          member.status === EXECUTION_STATUS.COMPLETE ||
          member.status === EXECUTION_STATUS.FAILED ||
          member.status === EXECUTION_STATUS.STOPPED,
      )
    : false;
  const isTeamExecutionSuccessful = failedMembersCount === 0 && !hasCreationError;

  const displayMembersList = (isTeamCreationComplete && filteredResultMembers.length > 0)
    ? filteredResultMembers
    : argumentMembersList.map((member) => ({
        agent_id: undefined,
        description: member.description || "",
        status: EXECUTION_STATUS.RUNNING,
        durationMs: 0,
        toolUses: 0,
        iterations: 0,
        toolNames: undefined,
        messages: undefined,
        result: undefined,
        error: undefined,
        summary: "",
      }));

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Users size={13} />
        <span className={styles['renderer-title']}>
          Team <strong>{teamNameString}</strong> — {displayMembersList.length} sub-agent
          {displayMembersList.length !== 1 ? "s" : ""}
        </span>
        <StatusBadge
          success={!isTeamCreationComplete ? true : isTeamExecutionSuccessful}
          label={
            !isTeamCreationComplete
              ? "running"
              : areAllMembersDone
                ? `${succeededMembersCount} done${failedMembersCount ? `, ${failedMembersCount} failed` : ""}`
                : "running"
          }
        />
      </div>

      {hasCreationError && <div className={styles['error-text']}>{parsedTeamResult?.error}</div>}

      {displayMembersList.map((memberItem, index) => {
        const subAgentActivity = getSubAgentActivity(memberItem, index);
        const isMemberTerminal =
          memberItem.status === EXECUTION_STATUS.COMPLETED ||
          memberItem.status === EXECUTION_STATUS.COMPLETE ||
          memberItem.status === EXECUTION_STATUS.FAILED ||
          memberItem.status === EXECUTION_STATUS.STOPPED;
        const isMemberCompleted = memberItem.status === EXECUTION_STATUS.COMPLETED || memberItem.status === EXECUTION_STATUS.COMPLETE;
        const subAgentTokensPerSecond = !isMemberTerminal ? getSubAgentSpeed(subAgentActivity) : null;

        const subAgentToolNames = subAgentActivity?.toolNames || memberItem.toolNames;

        const hasActiveNestedTeams =
          isMemberCompleted &&
          Array.isArray(subAgentActivity?.toolCalls) &&
          subAgentActivity!.toolCalls.some(
            (toolCall) =>
              (toolCall.name === "create_subagents" || toolCall.name === "create_subagent") &&
              (toolCall.status === "calling" || toolCall.status === "streaming"),
          );

        return (
          <div
            key={index}
            className={styles['renderer-block']}
            style={{ marginTop: 4 }}
          >
            <div className={styles['renderer-header']}>
              <span className={styles['renderer-title']}>
                Sub-Agent {subAgentStartIndex + index + 1}: <strong>{memberItem.description}</strong>
              </span>
              {subAgentTokensPerSecond !== null && (
                <span className={styles['sub-agent-speed-badge']}>
                  ⚡ {subAgentTokensPerSecond.toFixed(1)} tok/s
                </span>
              )}
              <StatusBadge
                success={!isMemberTerminal ? true : hasActiveNestedTeams ? true : isMemberCompleted}
                label={
                  hasActiveNestedTeams
                    ? "delegating"
                    : !isMemberTerminal
                      ? subAgentActivity?.phase || memberItem.status || "running"
                      : memberItem.status || "unknown"
                }
              />
              {(() => {
                const subAgentConversationIdString =
                  (subAgentActivity as SubAgentActivity | null)?.conversationId ||
                  (memberItem.agent_id && subAgentToolActivity?.[memberItem.agent_id] &&
                    (subAgentToolActivity[memberItem.agent_id] as SubAgentActivity)?.conversationId);
                if (!subAgentConversationIdString) return null;
                return (
                  <button
                    className={styles['sub-agent-navigate-button']}
                    onClick={(event) => {
                      event.stopPropagation();
                      const currentUrlString = new URL(window.location.href);
                      currentUrlString.searchParams.set("conversation", subAgentConversationIdString);
                      window.open(currentUrlString.toString(), "_blank", "noopener");
                    }}
                    title="Open sub-agent conversation"
                    aria-label={`Open conversation for sub-agent ${index + 1}`}
                  >
                    <ExternalLink size={11} />
                  </button>
                );
              })()}
            </div>

            {subAgentToolNames && Object.keys(subAgentToolNames).length > 0 && (
              <ToolBadgeRow
                tools={subAgentToolNames}
                activeTool={!isMemberTerminal ? subAgentActivity?.currentTool : null}
                variant="compact"
              />
            )}

            {memberItem.error && (
              <div className={styles['error-text']}>{memberItem.error}</div>
            )}

            {subAgentActivity && <SubAgentStatusBar activity={subAgentActivity} />}

            {subAgentActivity?.toolCalls &&
              subAgentActivity.toolCalls.some(
                (toolCall) => toolCall.name === "create_subagents" || toolCall.name === "create_subagent",
              ) && (
              <SubSubAgentStatusBars
                toolCalls={subAgentActivity.toolCalls}
                subAgentToolActivity={subAgentToolActivity}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SendMessageRenderer({ result, args }: RendererProps) {
  const parsedMessageResult = tryParse(result);
  if (!parsedMessageResult) return <RawResultToggle result={result} />;

  const targetAgentId = args?.to || parsedMessageResult.agent_id || "";
  const messageStatusString =
    (typeof parsedMessageResult.status === "string" ? parsedMessageResult.status : null) || "unknown";
  const hasMessagingError = !!parsedMessageResult.error;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <MessageSquare size={13} />
        <span className={styles['renderer-title']}>
          Message → <code className={styles['inline-code']}>{targetAgentId}</code>
        </span>
        <StatusBadge success={!hasMessagingError} label={messageStatusString} />
      </div>

      {hasMessagingError && <div className={styles['error-text']}>{parsedMessageResult.error}</div>}
    </div>
  );
}

export function StopAgentRenderer({ result, args }: RendererProps) {
  const parsedStopResult = tryParse(result);
  if (!parsedStopResult) return <RawResultToggle result={result} />;

  const stoppedAgentId = args?.agent_id || parsedStopResult.agent_id || "";
  const hasStopError = !!parsedStopResult.error;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <StopCircle size={13} />
        <span className={styles['renderer-title']}>
          Stopped: <code className={styles['inline-code']}>{stoppedAgentId}</code>
        </span>
        <StatusBadge
          success={!hasStopError}
          label={hasStopError ? "Failed" : "Stopped"}
        />
      </div>
      {hasStopError && <div className={styles['error-text']}>{parsedStopResult.error}</div>}
    </div>
  );
}
