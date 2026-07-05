import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { TOOL_EMOJI_MAP } from "./WorkflowNodeConstantsComponent";
import { ToolResultView } from "./ToolResultRenderersComponent";
import { ToolBadgeRow } from "./ToolBadgeComponent";

import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { ToolCallEvent } from "../types/types";
import type { SubAgentToolActivityItem } from "./MessageListComponent";
import styles from "./ToolCallsBlockComponent.module.css";

interface ToolCallsBlockProps {
  toolCall: ToolCallEvent;
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
  toolCall,
  streamingOutputs,
  subAgentToolActivity,
  isAutoCollapsed,
}: ToolCallsBlockProps) {
  const isCalling = toolCall.status === "calling" || toolCall.status === "streaming";

  // Detect sub-agents still running after the tool call status flips to "done".
  // A sub-agent is active unless it reached a terminal phase (complete/failed) or has no phase at all.
  const terminalPhases = new Set(["complete", "completed", "failed", "stopped"]);
  const isSubAgentActive = (activity: SubAgentToolActivityItem | null | undefined): boolean =>
    !!activity && (!!activity.currentTool || (!!activity.phase && !terminalPhases.has(activity.phase)));

  const hasActiveSubAgents = (() => {
    if (!subAgentToolActivity) return false;
    if (toolCall.name !== TOOL_NAMES.CREATE_SUBAGENTS && toolCall.name !== TOOL_NAMES.CREATE_SUBAGENT) return false;
    const parsed = toolCall.result
      ? typeof toolCall.result === "string"
        ? (() => { try { return JSON.parse(toolCall.result); } catch { return null; } })()
        : toolCall.result
      : null;
    const rawMembers = Array.isArray(parsed)
      ? parsed
      : (parsed as { members?: Array<{ agent_id?: string }>; agents?: Array<{ agent_id?: string }> })?.members
        ?? (parsed as { agents?: Array<{ agent_id?: string }> })?.agents
        ?? [];
    const members: Array<{ agent_id?: string }> = Array.isArray(rawMembers) ? rawMembers : [];
    for (const member of members) {
      if (isSubAgentActive(member.agent_id ? subAgentToolActivity[member.agent_id] : null)) return true;
    }
    // Fallback: match by description during calling state (before result arrives).
    // Skip when a result already exists — error-only results would incorrectly
    // match agents from a separate, successful tool call.
    const toolCallArguments = toolCall.args as { members?: Array<{ description?: string }> };
    if (!parsed && Array.isArray(toolCallArguments?.members)) {
      for (const argumentMember of toolCallArguments.members) {
        const match = Object.values(subAgentToolActivity).find(
          (value) => value.description && argumentMember.description && value.description.includes(argumentMember.description),
        );
        if (isSubAgentActive(match)) return true;
      }
    }
    return false;
  })();

  const isBlockActive = isCalling || hasActiveSubAgents;

  const toolDisplayName =
    toolCall.name === TOOL_NAMES.GOOGLE_SEARCH
      ? "Google Search"
      : renderToolName(toolCall.name);

  // Live counter for active tool execution
  const toolStartTimeRef = useRef<number | null>(null);
  const [liveToolElapsedSeconds, setLiveToolElapsedSeconds] = useState(0);

  useEffect(() => {
    if (isBlockActive) {
      if (toolStartTimeRef.current === null) {
        toolStartTimeRef.current = performance.now();
      }
      const intervalId = setInterval(() => {
        if (toolStartTimeRef.current !== null) {
          setLiveToolElapsedSeconds(
            Math.round((performance.now() - toolStartTimeRef.current) / 1000),
          );
        }
      }, 1000);
      return () => clearInterval(intervalId);
    }
    toolStartTimeRef.current = null;
    setLiveToolElapsedSeconds(0);
  }, [isBlockActive]);

  // Build header text with integrated duration
  const headerText = (() => {
    if (isBlockActive) {
      return liveToolElapsedSeconds > 0
        ? `Calling ${toolDisplayName} for ${liveToolElapsedSeconds}s\u2026`
        : `Calling ${toolDisplayName}\u2026`;
    }
    if (toolCall.durationMs != null && toolCall.durationMs > 0) {
      const durationSeconds = Math.round(toolCall.durationMs / 1000);
      const durationLabel = durationSeconds < 1
        ? "<1 second"
        : `${durationSeconds} second${durationSeconds === 1 ? "" : "s"}`;
      return `${toolDisplayName} for ${durationLabel}`;
    }
    return toolDisplayName;
  })();

  const [headerCollapsed, setHeaderCollapsed] = useState(!isBlockActive);
  const wasManuallyExpanded = useRef(false);
  const previousIsBlockActive = useRef(isBlockActive);

  useEffect(() => {
    if (isAutoCollapsed && !isBlockActive && !wasManuallyExpanded.current) {
      setHeaderCollapsed(true);
    }
  }, [isAutoCollapsed, isBlockActive]);

  // Force-expand when sub-agents become active.
  // Do NOT auto-collapse when they finish \u2014 the card stays open until
  // the user manually closes it or isAutoCollapsed kicks in.
  useEffect(() => {
    if (isBlockActive && !previousIsBlockActive.current) {
      setHeaderCollapsed(false);
    }
    previousIsBlockActive.current = isBlockActive;
  }, [isBlockActive]);

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
        <span className={styles['tool-calls-toggle-emoji']}>
          {TOOL_EMOJI_MAP[toolCall.name] || "\uD83D\uDEE0\uFE0F"}
        </span>
        <span>{headerText}</span>
        {headerCollapsed ? (
          <ChevronRight size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {/* -- Collapsible content (CSS grid disclosure for smooth animation) -- */}
      <div className={`${styles['tool-calls-disclosure']}${headerCollapsed ? ` ${styles['tool-calls-disclosure-collapsed']}` : ''}`}>
        <div className={styles['tool-calls-content']}>
          {/* Sub-agent tool badges — show which tools a spawned agent used */}
          {(toolCall.name === TOOL_NAMES.CREATE_SUBAGENTS || toolCall.name === TOOL_NAMES.CREATE_SUBAGENT) &&
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
              const toolCallArgs = toolCall.args as {
                members?: Array<{ description?: string }>;
              };
              if (
                Object.keys(allToolNames).length === 0 &&
                subAgentToolActivity &&
                Array.isArray(toolCallArgs?.members)
              ) {
                for (const argMember of toolCallArgs.members) {
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

          {/* Tool-specific result renderer (registry pattern) */}
          <ToolResultView
            toolCall={toolCall}
            streamingOutput={streamingOutputs?.get(toolCall.id)}
            subAgentToolActivity={subAgentToolActivity}
            subAgentStartIndex={0}
          />
        </div>
      </div>
    </div>
  );
}
