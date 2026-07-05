import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TOOL_EMOJI_MAP } from "./WorkflowNodeConstantsComponent";
import { ToolResultView } from "./ToolResultRenderers";
import { ToolBadgeRow } from "./ToolBadgeComponent";

import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { ToolCallEvent } from "../types/types";
import type { SubAgentToolActivityItem } from "./MessageListComponent";
import { detectActiveSubAgents, parseTeamToolResult, aggregateTeamToolUsage } from "./ToolCallsBlock/SubAgentParsingUtils";
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
  const isCurrentlyCalling = toolCall.status === "calling" || toolCall.status === "streaming";
  const hasActiveSubAgents = detectActiveSubAgents(toolCall, subAgentToolActivity);
  const isBlockActive = isCurrentlyCalling || hasActiveSubAgents;

  const toolDisplayName = toolCall.name === TOOL_NAMES.GOOGLE_SEARCH
    ? "Google Search"
    : renderToolName(toolCall.name);

  // Live counter for active tool execution
  const computeElapsedSeconds = (): number => {
    if (!toolCall.timestamp) return 0;
    return Math.round((Date.now() - toolCall.timestamp) / 1000);
  };

  const [liveToolElapsedSeconds, setLiveToolElapsedSeconds] = useState(() =>
    isBlockActive ? computeElapsedSeconds() : 0,
  );

  useEffect(() => {
    if (isBlockActive) {
      setLiveToolElapsedSeconds(computeElapsedSeconds());
      const timerIntervalId = setInterval(() => {
        setLiveToolElapsedSeconds(computeElapsedSeconds());
      }, 1000);
      return () => clearInterval(timerIntervalId);
    }
    setLiveToolElapsedSeconds(0);
  }, [isBlockActive, toolCall.timestamp]);

  const headerLabelText = useMemo(() => {
    if (isBlockActive) {
      return liveToolElapsedSeconds > 0
        ? `Calling ${toolDisplayName} for ${liveToolElapsedSeconds}s\u2026`
        : `Calling ${toolDisplayName}\u2026`;
    }
    if (toolCall.durationMs != null && toolCall.durationMs > 0) {
      const totalDurationSeconds = Math.round(toolCall.durationMs / 1000);
      const durationFormattedLabel = totalDurationSeconds < 1
        ? "<1 second"
        : `${totalDurationSeconds} second${totalDurationSeconds === 1 ? "" : "s"}`;
      return `${toolDisplayName} for ${durationFormattedLabel}`;
    }
    return toolDisplayName;
  }, [isBlockActive, liveToolElapsedSeconds, toolDisplayName, toolCall.durationMs]);

  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(!isBlockActive);
  const wasHeaderManuallyExpanded = useRef(false);
  const previousIsBlockActive = useRef(isBlockActive);

  useEffect(() => {
    if (isAutoCollapsed && !isBlockActive && !wasHeaderManuallyExpanded.current) {
      setIsHeaderCollapsed(true);
    }
  }, [isAutoCollapsed, isBlockActive]);

  useEffect(() => {
    if (isBlockActive && !previousIsBlockActive.current) {
      setIsHeaderCollapsed(false);
    }
    previousIsBlockActive.current = isBlockActive;
  }, [isBlockActive]);

  const teamMembers = useMemo(() => parseTeamToolResult(toolCall.result), [toolCall.result]);
  const teamToolActivity = useMemo(() => 
    aggregateTeamToolUsage(
      teamMembers, 
      subAgentToolActivity, 
      toolCall.args as { members?: Array<{ description?: string }> }
    ),
  [teamMembers, subAgentToolActivity, toolCall.args]);

  return (
    <div
      className={`tool-calls-block-component ${styles['tool-calls-block']}${isBlockActive ? ` ${styles['tool-calls-streaming']}` : ""}`}
    >
      <button
        className={styles['tool-calls-toggle']}
        onClick={() => {
          setIsHeaderCollapsed((isCurrentlyCollapsed) => {
            const willBeCollapsed = !isCurrentlyCollapsed;
            wasHeaderManuallyExpanded.current = !willBeCollapsed;
            return willBeCollapsed;
          });
        }}
      >
        <span className={styles['tool-calls-toggle-emoji']}>
          {TOOL_EMOJI_MAP[toolCall.name] || "\uD83D\uDEE0\uFE0F"}
        </span>
        <span>{headerLabelText}</span>
        {isHeaderCollapsed ? (
          <ChevronRight size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      <div className={`${styles['tool-calls-disclosure']}${isHeaderCollapsed ? ` ${styles['tool-calls-disclosure-collapsed']}` : ''}`}>
        <div className={styles['tool-calls-content']}>
          {Object.keys(teamToolActivity.toolCounts).length > 0 && (
            <ToolBadgeRow
              tools={teamToolActivity.toolCounts}
              activeTool={teamToolActivity.activeTool}
            />
          )}

          <ToolResultView
            toolCall={toolCall}
            streamingOutput={streamingOutputs?.get(toolCall.id || "")}
            subAgentToolActivity={subAgentToolActivity}
            subAgentStartIndex={0}
          />
        </div>
      </div>
    </div>
  );
}
