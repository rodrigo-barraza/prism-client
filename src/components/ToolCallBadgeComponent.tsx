"use client";

import React from "react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { resolveToolVisuals } from "./WorkflowNodeConstantsComponent";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import styles from "./ToolCallBadgeComponent.module.css";

// ═══════════════════════════════════════════════════════════════════════
// Canonical display names — maps raw tool function names to short labels.
// ═══════════════════════════════════════════════════════════════════════

const TOOL_CALL_DISPLAY_NAMES: Record<string, string> = {
  [TOOL_NAMES.READ_FILE]: "Read",
  [TOOL_NAMES.WRITE_FILE]: "Write",
  str_replace: "Replace",
  [TOOL_NAMES.SEARCH_FILE_CONTENTS]: "Grep",
  [TOOL_NAMES.FIND_FILES]: "Glob",
  [TOOL_NAMES.LIST_DIRECTORY]: "List Dir",
  [TOOL_NAMES.SEARCH_WEB]: "Search Web",
  [TOOL_NAMES.READ_WEB_PAGE]: "Fetch",
  [TOOL_NAMES.EXECUTE_SHELL]: "Shell",
  [TOOL_NAMES.EXECUTE_PYTHON]: "Python",
  [TOOL_NAMES.EXECUTE_JAVASCRIPT]: "JS",
  [TOOL_NAMES.GIT_STATUS]: "Git Status",
  [TOOL_NAMES.GIT_DIFF]: "Git Diff",
  [TOOL_NAMES.GIT_LOG]: "Git Log",
  [TOOL_NAMES.DELETE_FILE]: "Delete",
  [TOOL_NAMES.MOVE_FILE]: "Move",
  [TOOL_NAMES.CONTROL_BROWSER]: "Browser",
  [TOOL_NAMES.SUMMARIZE_PROJECT]: "Summary",
  [TOOL_NAMES.GENERATE_IMAGE]: "Image Gen",
  // Coordinator tools
  [TOOL_NAMES.CREATE_TEAM]: "Create Team",
  [TOOL_NAMES.DELETE_TEAM]: "Delete Team",
  [TOOL_NAMES.SLEEP]: "Sleep",
  [TOOL_NAMES.ENTER_PLAN_MODE]: "Plan",
  [TOOL_NAMES.EXIT_PLAN_MODE]: "Execute",
  [TOOL_NAMES.SEARCH_TOOLS]: "Tool Search",
  [TOOL_NAMES.CREATE_CRON]: "Schedule",
  [TOOL_NAMES.CREATE_CRON_JOB]: "Schedule",
  [TOOL_NAMES.LIST_CRON_JOBS]: "Schedules",
  [TOOL_NAMES.DELETE_CRON_JOB]: "Unschedule",
  [TOOL_NAMES.TRIGGER_CRON_JOB]: "Trigger",
  [TOOL_NAMES.REMOTE_TRIGGER]: "Trigger",
  [TOOL_NAMES.SET_TIMER]: "Timer",
  [TOOL_NAMES.LIST_TIMERS]: "Timers",
  [TOOL_NAMES.CANCEL_TIMER]: "Cancel Timer",
  [TOOL_NAMES.EDIT_NOTEBOOK]: "Notebook",
  // Skill tools
  [TOOL_NAMES.CREATE_SKILL]: "Create Skill",
  [TOOL_NAMES.EXECUTE_SKILL]: "Run Skill",
  [TOOL_NAMES.LIST_SKILLS]: "Skills",
  [TOOL_NAMES.DELETE_SKILL]: "Delete Skill",
  // Todo & Task tools
  [TOOL_NAMES.WRITE_TODO]: "Write Todo",
  [TOOL_NAMES.CREATE_TASK]: "Create Task",
  [TOOL_NAMES.LIST_TASKS]: "List Tasks",
  [TOOL_NAMES.GET_TASK]: "Get Task",
  [TOOL_NAMES.UPDATE_TASK]: "Update Task",
  [TOOL_NAMES.GET_TASK_OUTPUT]: "Get Task Output",
  // Structured output
  [TOOL_NAMES.EMIT_STRUCTURED_OUTPUT]: "Output",
  // Worktree isolation
  [TOOL_NAMES.ENTER_WORKTREE]: "Isolate",
  [TOOL_NAMES.EXIT_WORKTREE]: "Restore",
};

/**
 * Resolve a raw tool function name to a human-readable display label.
 */
function resolveDisplayName(name: string): string {
  if (TOOL_CALL_DISPLAY_NAMES[name]) {
    return TOOL_CALL_DISPLAY_NAMES[name];
  }
  // Fallback: title-case via shared utility
  return renderToolName(name);
}

// ═══════════════════════════════════════════════════════════════════════
// ToolCallBadgeComponent — A single badge for an individual tool call.
// Distinguished from ToolBadgeComponent which represents the
// Tool Calling *capability*. This component renders badges for the
// actual function-level tool calls (read_file, write_file, etc.).
// ═══════════════════════════════════════════════════════════════════════

export interface ToolCallBadgeProps {
  name: string;
  count?: number;
  active?: boolean;
  size?: number;
  tooltip?: string;
}

/**
 * ToolCallBadgeComponent — renders a badge for an individual tool call invocation.
 *
 * Props:
 *   name    — raw tool function name (e.g. "read_file", "search_file_contents")
 *   count   — invocation count (shown as ×N when > 1)
 *   active  — whether the tool is currently executing (pulses)
 *   size    — icon size in px (default 11)
 *   tooltip — optional tooltip override (defaults to raw name)
 */
export default function ToolCallBadgeComponent({
  name,
  count,
  active,
  size = 11,
  tooltip,
}: ToolCallBadgeProps) {
  const displayName = resolveDisplayName(name);
  const { Icon, color } = resolveToolVisuals(name);
  const tooltipLabel = tooltip || name;

  const badge = (
    <span
      className={`${styles['badge']}${active ? ` ${styles['badge-is-active-state']}` : ""}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 20%, transparent)`,
        background: `color-mix(in srgb, ${color} 4%, var(--background-elevated))`,
      }}
    >
      <Icon size={size} />
      <span className={styles['label']}>{displayName}</span>
      {count != null && count > 1 && (
        <span className={styles['count']}>×{count}</span>
      )}
    </span>
  );

  // Only wrap in tooltip if there's useful extra info beyond what's visible
  if (tooltipLabel !== displayName) {
    return (
      <TooltipComponent label={tooltipLabel} position="top">
        {badge}
      </TooltipComponent>
    );
  }

  return badge;
}

export interface ToolCallBadgeRowProps {
  tools?: Record<string, number>;
  activeTool?: string | null;
}

/**
 * ToolCallBadgeRow — renders a row of individual tool call badges
 * from a { toolName: count } map.
 */
export function ToolCallBadgeRow({ tools, activeTool }: ToolCallBadgeRowProps) {
  if (!tools || Object.keys(tools).length === 0) return null;

  return (
    <div className={`tool-call-badge-component ${styles['badge-layout-row']}`}>
      {Object.entries(tools)
        .sort(([, countA]: [string, number], [, countB]: [string, number]) => countB - countA)
        .map(([name, count]: [string, number]) => (
          <ToolCallBadgeComponent
            key={name}
            name={name}
            count={count}
            active={name === activeTool}
          />
        ))}
    </div>
  );
}
