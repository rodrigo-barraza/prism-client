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
import { renderToolName } from "../utils/utilities";
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

  const hasActiveCalls = toolCalls.some((tc) => tc.status === "calling");
  const doneCount = toolCalls.filter(
    (tc: ToolCallEvent) => tc.status === "done" || tc.status === "error",
  ).length;

  // Build header text with active tense awareness
  const headerText = (() => {
    if (toolCalls.length === 1) {
      const name =
        toolCalls[0].name === "googleSearch"
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
      className={`${styles.toolCallsBlock}${hasActiveCalls ? ` ${styles.toolCallsStreaming}` : ""}`}
    >
      {/* -- Header toggle -- */}
      <button
        className={styles.toolCallsToggle}
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
        <div className={styles.toolCallsContent}>
          {toolCalls.map((tc, j) => {
            const name =
              tc.name === "googleSearch"
                ? "Google Search"
                : renderToolName(tc.name);
            const { Icon, color } = resolveToolVisuals(tc.name) as any;

            const isCalling = tc.status === "calling";
            const isError = tc.status === "error";

            return (
              <div key={j} className={styles.toolCallItem}>
                {/* Status indicator */}
                <span
                  className={`${styles.toolCallStatusIcon}${isCalling ? ` ${styles.toolCallStatusCalling}` : ""}${isError ? ` ${styles.toolCallStatusError}` : ""}`}
                >
                  {isCalling ? (
                    <Loader size={12} className={styles.toolCallSpinner} />
                  ) : isError ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <Check size={12} />
                  )}
                </span>

                <span className={styles.toolCallIcon} style={{ color }}>
                  <Icon size={13} />
                </span>
                <span className={styles.toolCallName}>{name}</span>

                {/* Worker tool badges — show which tools a spawned agent used */}
                {tc.name === "team_create" &&
                  (() => {
                    const parsed = tc.result
                      ? typeof tc.result === "string"
                        ? (() => {
                            try {
                              return JSON.parse(tc.result);
                            } catch {
                              return null;
                            }
                          })()
                        : tc.result
                      : null;
                    const members = (parsed as { members?: Array<{ agent_id?: string; toolUses?: number }> })?.members || [];
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
                    const tcArgs = tc.args as { members?: Array<{ description?: string }> };
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
                          if (match.currentTool)
                            activeTool = match.currentTool;
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
                  toolCall={tc}
                  streamingOutput={streamingOutputs?.get(tc.id)}
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
