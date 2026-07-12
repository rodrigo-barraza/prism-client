import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { resolveToolEmoji, isEmojiImageUrl } from "./WorkflowNodeConstantsComponent";
import { ToolResultView } from "./ToolResultRenderers";
import { ToolBadgeRow } from "./ToolBadgeComponent";

import { renderToolName, resolveToolDisplaySummary, type ToolDisplayMetadata } from "@rodrigo-barraza/utilities-library";
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
  onOpenFileInViewer?: (absolutePath: string) => void;
  toolDisplayMetadataMap?: Record<string, ToolDisplayMetadata> | null;
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
  onOpenFileInViewer,
  toolDisplayMetadataMap,
}: ToolCallsBlockProps) {
  const isCurrentlyCalling = toolCall.status === "calling" || toolCall.status === "streaming";
  const hasActiveSubAgents = detectActiveSubAgents(toolCall, subAgentToolActivity);
  const isBlockActive = isCurrentlyCalling || hasActiveSubAgents;

  const isSubAgentTool = toolCall.name === TOOL_NAMES.CREATE_SUBAGENTS || toolCall.name === TOOL_NAMES.CREATE_SUBAGENT;

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

  // For subagent tools, capture the true wall-clock duration when all subagents finish,
  // since toolCall.durationMs only reflects the instant dispatch time.
  const [capturedSubAgentDurationMs, setCapturedSubAgentDurationMs] = useState<number | null>(null);
  const previousIsBlockActiveForDuration = useRef(isBlockActive);

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

  useEffect(() => {
    if (previousIsBlockActiveForDuration.current && !isBlockActive && isSubAgentTool && toolCall.timestamp) {
      setCapturedSubAgentDurationMs(Date.now() - toolCall.timestamp);
    }
    previousIsBlockActiveForDuration.current = isBlockActive;
  }, [isBlockActive, isSubAgentTool, toolCall.timestamp]);

  // For completed subagent tools loaded from persistence (block was never active
  // during this mount), derive the wall-clock duration from the member results.
  // Members run in parallel, so the total duration is the max across all members.
  const persistedSubAgentDurationMs = useMemo(() => {
    if (!isSubAgentTool || !toolCall.result) return null;
    const members = parseTeamToolResult(toolCall.result);
    if (members.length === 0) return null;
    let maximumMemberDuration = 0;
    for (const member of members) {
      const memberDuration =
        (member as Record<string, unknown>).durationMilliseconds as number | undefined ??
        (member as Record<string, unknown>).durationMs as number | undefined ??
        0;
      if (memberDuration > maximumMemberDuration) {
        maximumMemberDuration = memberDuration;
      }
    }
    return maximumMemberDuration > 0 ? maximumMemberDuration : null;
  }, [isSubAgentTool, toolCall.result]);

  const effectiveDurationMs = isSubAgentTool
    ? (capturedSubAgentDurationMs ?? persistedSubAgentDurationMs ?? toolCall.durationMs)
    : toolCall.durationMs;

  const displayMetadata = toolDisplayMetadataMap?.[toolCall.name];

  const handleSubjectClick = useMemo(() => {
    const completedSummary = resolveToolDisplaySummary(toolCall.name, toolCall.args, { isActive: false, display: displayMetadata });
    if (!completedSummary?.filePath || !onOpenFileInViewer) return null;
    const targetFilePath = completedSummary.filePath;
    return (event: React.MouseEvent) => {
      event.stopPropagation();
      onOpenFileInViewer(targetFilePath);
    };
  }, [toolCall.name, toolCall.args, onOpenFileInViewer, displayMetadata]);

  const headerLabelContent = useMemo(() => {
    const activeSummary = resolveToolDisplaySummary(toolCall.name, toolCall.args, { isActive: true, display: displayMetadata });
    const completedSummary = resolveToolDisplaySummary(toolCall.name, toolCall.args, { isActive: false, display: displayMetadata });

    const subjectElement = (summary: { subject: string; filePath?: string }) => {
      if (summary.filePath && handleSubjectClick) {
        return (
          <span
            className={`${styles['tool-calls-toggle-subject']} ${styles['tool-calls-toggle-subject-clickable']}`}
            onClick={handleSubjectClick}
            role="link"
            tabIndex={0}
          >
            {summary.subject}
          </span>
        );
      }
      return <span className={styles['tool-calls-toggle-subject']}>{summary.subject}</span>;
    };

    if (isBlockActive) {
      const durationSuffix = liveToolElapsedSeconds > 0
        ? ` for ${liveToolElapsedSeconds}s\u2026`
        : "\u2026";

      if (activeSummary) {
        return <>{activeSummary.verb} {subjectElement(activeSummary)}{durationSuffix}</>;
      }
      return <>Calling {toolDisplayName}{durationSuffix}</>;
    }

    const durationLabel = effectiveDurationMs != null && effectiveDurationMs > 0
      ? (() => {
          const totalDurationSeconds = Math.round(effectiveDurationMs / 1000);
          return totalDurationSeconds < 1
            ? " for <1 second"
            : ` for ${totalDurationSeconds} second${totalDurationSeconds === 1 ? "" : "s"}`;
        })()
      : "";

    if (completedSummary) {
      return <>{completedSummary.verb} {subjectElement(completedSummary)}{durationLabel}</>;
    }
    return <>{toolDisplayName}{durationLabel}</>;
  }, [isBlockActive, liveToolElapsedSeconds, toolDisplayName, effectiveDurationMs, toolCall.name, toolCall.args, handleSubjectClick]);

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
          {(() => {
            const emoji = resolveToolEmoji(toolCall.name);
            return isEmojiImageUrl(emoji)
              ? <img src={emoji} alt="" className={styles['tool-calls-toggle-emoji-image']} />
              : emoji;
          })()}
        </span>
        <span>{headerLabelContent}</span>
        <ChevronDown size={14} className={`${styles['tool-calls-chevron']}${isHeaderCollapsed ? ` ${styles['tool-calls-chevron-collapsed']}` : ''}`} />
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
