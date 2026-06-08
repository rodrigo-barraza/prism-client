import React, { useState } from "react";
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
import { renderToolName, formatLatencyMs } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { ToolCallEvent } from "../types/types";
import type { WorkerToolActivityItem } from "./MessageListComponent";
import styles from "./ToolCallsBlockComponent.module.css";

interface ToolCallsBlockProps {
  toolCalls?: ToolCallEvent[];
  streamingOutputs?: Map<string, string> | null;
  workerToolActivity?: Record<string, WorkerToolActivityItem> | null;
}

export default function ToolCallsBlockComponent({
  toolCalls,
  streamingOutputs,
  workerToolActivity,
}: ToolCallsBlockProps) {
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  const hasActiveCalls = toolCalls.some(
    (toolCall) => toolCall.status === "calling",
  );
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
      if (hasActiveCalls) return `Calling ${name}…`;
      return `Used tool: ${name}`;
    }
    if (hasActiveCalls) {
      const progress =
        doneCount > 0 ? ` (${doneCount}/${toolCalls.length} done)` : "";
      return `Running ${toolCalls.length} tools${progress}…`;
    }
    return `Used ${toolCalls.length} tools`;
  })();

  return (
    <div
      className={`tool-calls-block-component ${styles['tool-calls-block']}${hasActiveCalls ? ` ${styles['tool-calls-streaming']}` : ""}`}
    >
      {/* -- Header toggle -- */}
      <button
        className={styles['tool-calls-toggle']}
        onClick={() => setHeaderCollapsed((c) => !c)}
      >
        <Zap size={13} />
        <span>{headerText}</span>
        {headerCollapsed ? (
          <ChevronRight size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {/* -- Always-visible tool cards -- */}
      {!headerCollapsed && (
        <div className={styles['tool-calls-content']}>
          {toolCalls.map((toolCall, j) => {
            const name =
              toolCall.name === TOOL_NAMES.GOOGLE_SEARCH
                ? "Google Search"
                : renderToolName(toolCall.name);
            const { Icon, color } = resolveToolVisuals(toolCall.name);

            const isCalling = toolCall.status === "calling";
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
                    ({formatLatencyMs(toolCall.durationMs)})
                  </span>
                )}

                {/* Worker tool badges — show which tools a spawned agent used */}
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
                        }
                      )?.members || [];
                    // Aggregate tool activity from all team members
                    const allToolNames: Record<string, number> = {};
                    let activeTool: string | null = null;
                    for (const member of members) {
                      const activity =
                        member.agent_id && workerToolActivity
                          ? workerToolActivity[member.agent_id]
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
                      workerToolActivity &&
                      Array.isArray(tcArgs?.members)
                    ) {
                      for (const argMember of tcArgs.members) {
                        const match = Object.values(workerToolActivity).find(
                          (v) =>
                            v.description &&
                            argMember.description &&
                            v.description.includes(argMember.description),
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
                      (sum, m) => sum + (m.toolUses || 0),
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
                  workerToolActivity={workerToolActivity}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
