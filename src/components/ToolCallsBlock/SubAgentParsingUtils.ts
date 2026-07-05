import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import { ToolCallEvent } from "../../types/types";
import { SubAgentToolActivityItem } from "../MessageListComponent";

export interface ParsedSubAgentMember {
  agent_id?: string;
  toolUses?: number;
  description?: string;
}

export interface ParsedTeamResult {
  members?: ParsedSubAgentMember[];
  agents?: ParsedSubAgentMember[];
}

/**
 * Parses the result of a team creation tool call.
 */
export function parseTeamToolResult(result: unknown): ParsedSubAgentMember[] {
  if (!result) return [];
  
  const parsed = typeof result === "string" 
    ? (() => { try { return JSON.parse(result); } catch { return null; } })() 
    : result;
    
  if (Array.isArray(parsed)) return parsed;
  
  const teamResult = parsed as ParsedTeamResult;
  return teamResult?.members ?? teamResult?.agents ?? [];
}

/**
 * Detects if any sub-agents in a team are currently active (running tools or in a non-terminal phase).
 */
export function detectActiveSubAgents(
  toolCall: ToolCallEvent,
  subAgentToolActivity: Record<string, SubAgentToolActivityItem> | null | undefined
): boolean {
  if (!subAgentToolActivity) return false;
  if (toolCall.name !== TOOL_NAMES.CREATE_SUBAGENTS && toolCall.name !== TOOL_NAMES.CREATE_SUBAGENT) return false;

  const terminalPhases = new Set(["complete", "completed", "failed", "stopped"]);
  
  const isSubAgentActive = (activity: SubAgentToolActivityItem | null | undefined): boolean =>
    !!activity && (!!activity.currentTool || (!!activity.phase && !terminalPhases.has(activity.phase)));

  const members = parseTeamToolResult(toolCall.result);
  
  // Check members matched by agent_id
  for (const member of members) {
    if (member.agent_id && isSubAgentActive(subAgentToolActivity[member.agent_id])) {
      return true;
    }
  }

  // Fallback: match by description during calling state (before result arrives).
  const toolCallArguments = toolCall.args as { members?: Array<{ description?: string }> };
  if (!toolCall.result && Array.isArray(toolCallArguments?.members)) {
    for (const argumentMember of toolCallArguments.members) {
      const matchedActivity = Object.values(subAgentToolActivity).find(
        (activity) => activity.description && argumentMember.description && activity.description.includes(argumentMember.description),
      );
      if (isSubAgentActive(matchedActivity)) return true;
    }
  }

  return false;
}

/**
 * Aggregates tool usage statistics across a team of sub-agents.
 */
export function aggregateTeamToolUsage(
  members: ParsedSubAgentMember[],
  subAgentToolActivity: Record<string, SubAgentToolActivityItem> | null | undefined,
  toolCallArguments: { members?: Array<{ description?: string }> } | undefined
): { toolCounts: Record<string, number>; activeTool: string | null } {
  const aggregatedToolCounts: Record<string, number> = {};
  let currentActiveTool: string | null = null;

  if (!subAgentToolActivity) return { toolCounts: {}, activeTool: null };

  // Aggregate from active sub-agent activity
  for (const member of members) {
    const activity = member.agent_id ? subAgentToolActivity[member.agent_id] : null;
    if (activity?.toolNames) {
      for (const [toolName, count] of Object.entries(activity.toolNames)) {
        aggregatedToolCounts[toolName] = (aggregatedToolCounts[toolName] || 0) + count;
      }
      if (activity.currentTool) {
        currentActiveTool = activity.currentTool;
      }
    }
  }

  // Fallback: match by description if no tool counts found yet (e.g. initial calling state)
  if (Object.keys(aggregatedToolCounts).length === 0 && Array.isArray(toolCallArguments?.members)) {
    for (const argumentMember of toolCallArguments.members) {
      const matchedActivity = Object.values(subAgentToolActivity).find(
        (activity) => activity.description && argumentMember.description && activity.description.includes(argumentMember.description),
      );
      if (matchedActivity?.toolNames) {
        for (const [toolName, count] of Object.entries(matchedActivity.toolNames)) {
          aggregatedToolCounts[toolName] = (aggregatedToolCounts[toolName] || 0) + count;
        }
        if (matchedActivity.currentTool) {
          currentActiveTool = matchedActivity.currentTool;
        }
      }
    }
  }

  // If still empty, use static counts from completed result
  if (Object.keys(aggregatedToolCounts).length === 0) {
    const totalStaticToolUses = members.reduce((sum, member) => sum + (member.toolUses || 0), 0);
    if (totalStaticToolUses > 0) {
      aggregatedToolCounts["Tool Calling"] = totalStaticToolUses;
    }
  }

  return { toolCounts: aggregatedToolCounts, activeTool: currentActiveTool };
}
