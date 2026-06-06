"use client";

import React from "react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { resolveToolVisuals } from "./WorkflowNodeConstantsComponent";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import styles from "./ToolCallBadgeComponent.module.css";

// ═══════════════════════════════════════════════════════════════════════
// Canonical display names — maps raw tool function names to short labels.
// ═══════════════════════════════════════════════════════════════════════

const TOOL_CALL_DISPLAY_NAMES: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  str_replace: "Replace",
  grep_search: "Grep",
  glob_files: "Glob",
  list_directory: "List Dir",
  search_web: "Search Web",
  // TODO(cleanup): Remove legacy name once historical sessions have aged out
  web_search: "Search Web",
  read_web_page: "Fetch",
  execute_shell: "Shell",
  execute_python: "Python",
  execute_javascript: "JS",
  git_status: "Git Status",
  git_diff: "Git Diff",
  git_log: "Git Log",
  delete_file: "Delete",
  move_file: "Move",
  browser_action: "Browser",
  project_summary: "Summary",
  generate_image: "Image Gen",
  // Coordinator tools
  create_team: "Create Team",
  delete_team: "Delete Team",
  // TODO(cleanup): Remove legacy names once historical sessions have aged out
  team_create: "Create Team",
  team_delete: "Delete Team",
  sleep: "Sleep",
  enter_plan_mode: "Plan",
  exit_plan_mode: "Execute",
  search_tools: "Tool Search",
  create_cron: "Schedule",
  create_cron_job: "Schedule",
  // TODO(cleanup): Remove legacy name once historical sessions have aged out
  cron_create: "Schedule",
  trigger_cron_job: "Trigger",
  remote_trigger: "Trigger",
  notebook_edit: "Notebook",
  // Skill tools
  create_skill: "Create Skill",
  execute_skill: "Run Skill",
  list_skills: "Skills",
  delete_skill: "Delete Skill",
  // TODO(cleanup): Remove legacy names once historical sessions have aged out
  skill_create: "Create Skill",
  skill_execute: "Run Skill",
  skill_list: "Skills",
  skill_delete: "Delete Skill",
  // Todo & Task tools
  write_todo: "Write Todo",
  create_task: "Create Task",
  list_tasks: "List Tasks",
  get_task: "Get Task",
  update_task: "Update Task",
  get_task_output: "Get Task Output",
  // TODO(cleanup): Remove legacy names once historical sessions have aged out
  todo_write: "Write Todo",
  task_create: "Create Task",
  task_list: "List Tasks",
  task_get: "Get Task",
  task_update: "Update Task",
  task_output: "Get Task Output",
  // Structured output
  synthetic_output: "Output",
  // Worktree isolation
  enter_worktree: "Isolate",
  exit_worktree: "Restore",
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
 *   name    — raw tool function name (e.g. "read_file", "grep_search")
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
      className={`${styles['badge']}${active ? ` ${styles['badge-active']}` : ""}`}
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
    <div className={styles['badge-row']}>
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
