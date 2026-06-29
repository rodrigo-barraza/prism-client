import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Zap,
  AlertTriangle,
  Loader,
} from "lucide-react";
import { resolveToolVisuals } from "./WorkflowNodeConstantsComponent";
import { ToolResultView } from "./ToolResultRenderersComponent";
import { ToolBadgeRow } from "./ToolBadgeComponent";
import StatusBarComponent from "./StatusBarComponent";
import type { StatusBarPhase } from "./StatusBarComponent";
import { renderToolName, formatLatencyMilliseconds } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { ToolCallEvent } from "../types/types";
import type { SubAgentToolActivityItem } from "./MessageListComponent";
import styles from "./ToolCallsBlockComponent.module.css";

interface ToolCallsBlockProps {
  toolCalls?: ToolCallEvent[];
  streamingOutputs?: Map<string, string> | null;
  subAgentToolActivity?: Record<string, SubAgentToolActivityItem> | null;
  isAutoCollapsed?: boolean;
}

export const VISUAL_TOOL_NAMES = new Set([
  "create_3d_mesh",
  "create_3d_voxel",
  "create_3d_model",
  "create_3d_scene",
  "draw_turtle_graphics",
  "create_vector_animation",
  "generate_qr_code",
  "render_latex",
  "generate_diagram",
  "manipulate_image",
  "convert_video_to_gif",
  "generate_map",
  "generate_chart",
  "convert_image_to_ascii",
]);

export default function ToolCallsBlockComponent({
  toolCalls,
  streamingOutputs,
  subAgentToolActivity,
  isAutoCollapsed,
}: ToolCallsBlockProps) {
  const hasActiveCalls = toolCalls
    ? toolCalls.some((toolCall) => toolCall.status === "calling" || toolCall.status === "streaming")
    : false;

  // Detect sub-agents still running for any create_team tool call in this block.
  // Even after the tool call status flips to "done", sub-agents may still be active.
  // A sub-agent is active unless it reached a terminal phase (complete/failed) or has no phase at all.
  const terminalPhases = new Set(["complete", "failed"]);
  const isSubAgentActive = (activity: SubAgentToolActivityItem | null | undefined): boolean =>
    !!activity && (!!activity.currentTool || (!!activity.phase && !terminalPhases.has(activity.phase)));

  const hasActiveSubAgents = (() => {
    if (!toolCalls || !subAgentToolActivity) return false;
    for (const toolCall of toolCalls) {
      if (toolCall.name !== TOOL_NAMES.CREATE_TEAM) continue;
      // Check result members for agent_ids with active tool activity
      const parsed = toolCall.result
        ? typeof toolCall.result === "string"
          ? (() => { try { return JSON.parse(toolCall.result); } catch { return null; } })()
          : toolCall.result
        : null;
      // create_team returns a raw array, { members: [...] }, or non-blocking { agents: [...] }
      const rawMembers = Array.isArray(parsed)
        ? parsed
        : (parsed as { members?: Array<{ agent_id?: string }>; agents?: Array<{ agent_id?: string }> })?.members
          ?? (parsed as { agents?: Array<{ agent_id?: string }> })?.agents
          ?? [];
      const members: Array<{ agent_id?: string }> = Array.isArray(rawMembers) ? rawMembers : [];
      for (const member of members) {
        if (isSubAgentActive(member.agent_id ? subAgentToolActivity[member.agent_id] : null)) return true;
      }
      // Fallback: match by description during calling state (before result arrives)
      const toolCallArguments = toolCall.args as { members?: Array<{ description?: string }> };
      if (Array.isArray(toolCallArguments?.members)) {
        for (const argumentMember of toolCallArguments.members) {
          const match = Object.values(subAgentToolActivity).find(
            (value) => value.description && argumentMember.description && value.description.includes(argumentMember.description),
          );
          if (isSubAgentActive(match)) return true;
        }
      }
    }
    return false;
  })();

  const isBlockActive = hasActiveCalls || hasActiveSubAgents;

  const [headerCollapsed, setHeaderCollapsed] = useState(!isBlockActive);
  const wasManuallyExpanded = useRef(false);
  const previousIsBlockActive = useRef(isBlockActive);

  useEffect(() => {
    if (isAutoCollapsed && !isBlockActive && !wasManuallyExpanded.current) {
      setHeaderCollapsed(true);
    }
  }, [isAutoCollapsed, isBlockActive]);

  // Force-expand when sub-agents become active.
  // Do NOT auto-collapse when they finish — the card stays open until
  // the user manually closes it or isAutoCollapsed kicks in.
  useEffect(() => {
    if (isBlockActive && !previousIsBlockActive.current) {
      setHeaderCollapsed(false);
    }
    previousIsBlockActive.current = isBlockActive;
  }, [isBlockActive]);

  if (!toolCalls || toolCalls.length === 0) return null;
  const doneCount = toolCalls.filter(
    (toolCall: ToolCallEvent) =>
      toolCall.status === "done" || toolCall.status === "error",
  ).length;

  // Build header text with active tense awareness
  const headerText = (() => {
    if (toolCalls.length === 1) {
      const name =
        toolCalls[0].name === TOOL_NAMES.GOOGLE_SEARCH
          ? "Google Search"
          : renderToolName(toolCalls[0].name);
      if (isBlockActive) return `Calling ${name}…`;
      return `Used tool: ${name}`;
    }
    if (isBlockActive) {
      const progress =
        doneCount > 0 ? ` (${doneCount}/${toolCalls.length} done)` : "";
      return `Running ${toolCalls.length} tools${progress}…`;
    }
    return `Used ${toolCalls.length} tools`;
  })();

  return (
    <div
      className={`tool-calls-block-component ${styles['tool-calls-block']}${isBlockActive ? ` ${styles['tool-calls-streaming']}` : ""}`}
    >
      {/* -- Header toggle -- */}
      <button
        className={styles['tool-calls-toggle']}
        onClick={() => {
          setHeaderCollapsed((previous) => {
            const willCollapse = !previous;
            wasManuallyExpanded.current = willCollapse ? false : true;
            return !previous;
          });
        }}
      >
        <Zap size={13} />
        <span>{headerText}</span>
        {headerCollapsed ? (
          <ChevronRight size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {/* -- Collapsible tool cards (CSS grid disclosure for smooth animation) -- */}
      <div className={`${styles['tool-calls-disclosure']}${headerCollapsed ? ` ${styles['tool-calls-disclosure-collapsed']}` : ''}`}>
        <div className={styles['tool-calls-content']}>
          {toolCalls.map((toolCall, j) => {
            const name =
              toolCall.name === TOOL_NAMES.GOOGLE_SEARCH
                ? "Google Search"
                : renderToolName(toolCall.name);
            const { Icon, color } = resolveToolVisuals(toolCall.name);

            const isCalling = toolCall.status === "calling" || toolCall.status === "streaming";
            const isError = toolCall.status === "error";

            return (
              <div key={j} className={styles['tool-call-item']}>
                {/* Status indicator */}
                <span
                  className={`${styles['tool-call-status-icon']}${isCalling ? ` ${styles['tool-call-status-calling']}` : ""}${isError ? ` ${styles['tool-call-status-error']}` : ""}`}
                >
                  {isCalling ? (
                    <Loader size={12} className={styles['tool-call-spinner']} />
                  ) : isError ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <Check size={12} />
                  )}
                </span>

                <span className={styles['tool-call-icon']} style={{ color }}>
                  <Icon size={13} />
                </span>
                <span className={styles['tool-call-name']}>{name}</span>
                {toolCall.durationMs != null && toolCall.durationMs > 0 && (
                  <span className={styles["tool-call-latency"]}>
                    ({formatLatencyMilliseconds(toolCall.durationMs)})
                  </span>
                )}

                {/* Sub-agent tool badges — show which tools a spawned agent used */}
                {(toolCall.name === TOOL_NAMES.CREATE_TEAM) &&
                  (() => {
                    const parsed = toolCall.result
                      ? typeof toolCall.result === "string"
                        ? (() => {
                            try {
                              return JSON.parse(toolCall.result);
                            } catch {
                              return null;
                            }
                          })()
                        : toolCall.result
                      : null;
                    const members =
                      (
                        parsed as {
                          members?: Array<{
                            agent_id?: string;
                            toolUses?: number;
                          }>;
                          agents?: Array<{
                            agent_id?: string;
                            toolUses?: number;
                          }>;
                        }
                      )?.members
                      ?? (parsed as { agents?: Array<{ agent_id?: string; toolUses?: number }> })?.agents
                      ?? [];
                    // Aggregate tool activity from all team members
                    const allToolNames: Record<string, number> = {};
                    let activeTool: string | null = null;
                    for (const member of members) {
                      const activity =
                        member.agent_id && subAgentToolActivity
                          ? subAgentToolActivity[member.agent_id]
                          : null;
                      if (activity?.toolNames) {
                        for (const [name, count] of Object.entries(
                          activity.toolNames,
                        )) {
                          allToolNames[name] =
                            (allToolNames[name] || 0) + count;
                        }
                        if (activity.currentTool)
                          activeTool = activity.currentTool;
                      }
                    }
                    // Fallback: match by description during calling state (before result arrives)
                    // createTeam prefixes descriptions as "[teamName] description"
                    const tcArgs = toolCall.args as {
                      members?: Array<{ description?: string }>;
                    };
                    if (
                      Object.keys(allToolNames).length === 0 &&
                      subAgentToolActivity &&
                      Array.isArray(tcArgs?.members)
                    ) {
                      for (const argMember of tcArgs.members) {
                        const match = Object.values(subAgentToolActivity).find(
                          (value) =>
                            value.description &&
                            argMember.description &&
                            value.description.includes(argMember.description),
                        );
                        if (match?.toolNames) {
                          for (const [name, count] of Object.entries(
                            match.toolNames,
                          )) {
                            allToolNames[name] =
                              (allToolNames[name] || 0) + count;
                          }
                          if (match.currentTool) activeTool = match.currentTool;
                        }
                      }
                    }
                    if (Object.keys(allToolNames).length > 0)
                      return (
                        <ToolBadgeRow
                          tools={allToolNames}
                          activeTool={activeTool}
                        />
                      );
                    // Static badge from completed result
                    const totalToolUses = members.reduce(
                      (sum, model) => sum + (model.toolUses || 0),
                      0,
                    );
                    if (totalToolUses > 0)
                      return (
                        <ToolBadgeRow
                          tools={{ "Tool Calling": totalToolUses }}
                        />
                      );
                    return null;
                  })()}

                {/* Sub-agent status bars — live phase indicators for each team member */}
                {(toolCall.name === TOOL_NAMES.CREATE_TEAM) &&
                  (() => {
                    if (!subAgentToolActivity) return null;
                    const parsed = toolCall.result
                      ? typeof toolCall.result === "string"
                        ? (() => { try { return JSON.parse(toolCall.result); } catch { return null; } })()
                        : toolCall.result
                      : null;
                    const resultMembers: Array<{ agent_id?: string; description?: string }> =
                      Array.isArray(parsed)
                        ? parsed
                        : (parsed as { members?: Array<{ agent_id?: string; description?: string }>; agents?: Array<{ agent_id?: string; description?: string }> })?.members
                          ?? (parsed as { agents?: Array<{ agent_id?: string; description?: string }> })?.agents
                          ?? [];
                    const argumentMembers: Array<{ description?: string }> =
                      Array.isArray((toolCall.args as { members?: Array<{ description?: string }> })?.members)
                        ? (toolCall.args as { members: Array<{ description?: string }> }).members
                        : [];

                    // Resolve sub-agent entries: by agent_id from result, or fallback by description from args
                    const subAgentEntries: Array<{ key: string; description: string; activity: SubAgentToolActivityItem }> = [];
                    for (const resultMember of resultMembers) {
                      if (resultMember.agent_id && subAgentToolActivity[resultMember.agent_id]) {
                        subAgentEntries.push({
                          key: resultMember.agent_id,
                          description: resultMember.description || "Sub-Agent",
                          activity: subAgentToolActivity[resultMember.agent_id],
                        });
                      }
                    }
                    if (subAgentEntries.length === 0 && argumentMembers.length > 0) {
                      for (const argumentMember of argumentMembers) {
                        if (!argumentMember.description) continue;
                        const matchedEntry = Object.entries(subAgentToolActivity).find(
                          ([, value]) =>
                            value.description &&
                            argumentMember.description &&
                            value.description.includes(argumentMember.description),
                        );
                        if (matchedEntry) {
                          subAgentEntries.push({
                            key: matchedEntry[0],
                            description: argumentMember.description,
                            activity: matchedEntry[1],
                          });
                        }
                      }
                    }

                    if (subAgentEntries.length === 0) return null;

                    const terminalPhaseSet = new Set(["complete", "failed"]);
                    return (
                      <div className={styles['sub-agent-status-bars-container']}>
                        {subAgentEntries.map((entry) => {
                          const { phase, currentTool, toolCount = 0, iteration, maxIterations, phaseProgress } = entry.activity;
                          const isTerminal = terminalPhaseSet.has(phase ?? "");
                          const isToolActive = !!currentTool;

                          // Detect sub-sub-agent delegation
                          const hasActiveSubSubAgents =
                            isTerminal &&
                            phase !== "failed" &&
                            Array.isArray(entry.activity.toolCalls) &&
                            entry.activity.toolCalls.some(
                              (subToolCall) =>
                                subToolCall.name === "create_team" &&
                                (subToolCall.status === "calling" || subToolCall.status === "streaming"),
                            );

                          const hasPhase = !!phase && !isTerminal;
                          const isActive = isToolActive || hasPhase || hasActiveSubSubAgents;

                          const effectivePhase = hasActiveSubSubAgents
                            ? "delegating"
                            : isToolActive
                              ? "executing"
                              : isTerminal
                                ? null
                                : phase;

                          const statusLabel = hasActiveSubSubAgents
                            ? "Awaiting Sub-Agents…"
                            : isToolActive
                              ? renderToolName(currentTool!)
                              : entry.activity.phaseLabel || undefined;

                          const statusIcon = hasActiveSubSubAgents ? "👥" : isToolActive ? "🔧" : undefined;

                          const progress =
                            effectivePhase === "prefilling" || effectivePhase === "loading"
                              ? (phaseProgress ?? null)
                              : null;

                          let tokPerSec = null;
                          if (!isToolActive && (phase === "generating" || phase === "thinking")) {
                            tokPerSec = entry.activity.tokPerSec ?? null;
                          }

                          const idleLabel = isTerminal
                            ? phase === "failed"
                              ? "Sub-agent failed"
                              : `Done · ${toolCount} tool${toolCount !== 1 ? "s" : ""} used`
                            : toolCount > 0
                              ? `${toolCount} tools used`
                              : "Sub-agent idle";

                          return (
                            <div key={entry.key} className={styles['sub-agent-status-entry']}>
                              <span className={styles['sub-agent-status-label']}>
                                {entry.description}
                              </span>
                              <StatusBarComponent
                                active={isActive}
                                variant="subAgent"
                                phase={(effectivePhase ?? undefined) as StatusBarPhase | undefined}
                                label={statusLabel}
                                icon={statusIcon}
                                progress={progress}
                                tokPerSec={tokPerSec}
                                iteration={iteration}
                                maxIterations={maxIterations}
                                idleLabel={idleLabel}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                {/* Tool-specific result renderer (registry pattern) */}
                <ToolResultView
                  toolCall={toolCall}
                  streamingOutput={streamingOutputs?.get(toolCall.id)}
                  subAgentToolActivity={subAgentToolActivity}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
