"use client";

import React from "react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { resolveToolVisuals, isEmojiImageUrl } from "./WorkflowNodeConstantsComponent";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import {
  CAPABILITY_DISPLAY_NAMES,
  CAPABILITY_SHORT_NAMES,
  resolveCapabilityName,
} from "@rodrigo-barraza/utilities-library/taxonomy";
import styles from "./ToolBadgeComponent.module.css";

// ═══════════════════════════════════════════════════════════════════════
// Canonical tool display names — sourced from the shared capability
// taxonomy (@rodrigo-barraza/utilities-library/taxonomy). React icon
// components stay client-side (see WorkflowNodeConstantsComponent) but the
// display-name / short-name maps live in the library.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolve any tool name to a human-readable display label.
 *
 * The shared maps are keyed by canonical display names, so a raw
 * provider-native alias (e.g. "googleSearch", "web_search") is normalized
 * first via resolveCapabilityName (identity for canonical/unknown names).
 */
function resolveDisplayName(name: string, variant: string = "default"): string {
  const canonicalName = resolveCapabilityName(name);
  if (variant === "condensed" && CAPABILITY_SHORT_NAMES[canonicalName]) {
    return CAPABILITY_SHORT_NAMES[canonicalName];
  }
  if (CAPABILITY_DISPLAY_NAMES[canonicalName]) {
    return CAPABILITY_DISPLAY_NAMES[canonicalName];
  }
  // Fallback: title-case via shared utility
  return renderToolName(name);
}

// ═══════════════════════════════════════════════════════════════════════
// ToolBadgeComponent — THE single badge component used everywhere.
// ═══════════════════════════════════════════════════════════════════════

export interface ToolBadgeProps {
  name: string;
  count?: number;
  active?: boolean;
  variant?: "default" | "compact" | "condensed";
  tooltip?: string;
  emoji?: string;
}

/**
 * ToolBadgeComponent — renders a single, consistently-styled tool badge.
 *
 * Props:
 *   name    — raw tool function name or canonical name (e.g. "read_file", "Tool Calling")
 *   count   — optional usage count (shown as ×N when > 1)
 *   active  — whether the tool is currently executing (pulses)
 *   variant — "default" (icon+label+count), "compact" (icon+count), "condensed" (icon+short label+count)
 *   tooltip — optional tooltip override (defaults to raw name)
 */
export default function ToolBadgeComponent({
  name,
  count,
  active,
  variant = "default",
  tooltip,
  emoji: emojiOverride,
}: ToolBadgeProps) {
  const isCompact = variant === "compact";
  const displayName = resolveDisplayName(name, variant);
  const { Icon, color, emoji: resolvedEmoji } = resolveToolVisuals(name);
  const badgeEmoji = emojiOverride || resolvedEmoji;
  const tooltipLabel = tooltip || name;

  const badge = (
    <span
      className={`${styles['badge']}${active ? ` ${styles['badge-is-active-state']}` : ""}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {badgeEmoji
        ? isEmojiImageUrl(badgeEmoji)
          ? <img src={badgeEmoji} alt="" className={styles['badge-emoji-image']} />
          : <span className={styles['badge-emoji']}>{badgeEmoji}</span>
        : <Icon size={10} />
      }
      {!isCompact && <span className={styles['label']}>{displayName}</span>}
      {count != null && count > 1 && (
        <span className={styles['count']}>×{count}</span>
      )}
    </span>
  );

  // Only wrap in tooltip if there's useful extra info beyond what's visible
  if (isCompact || tooltipLabel !== displayName) {
    return (
      <TooltipComponent label={tooltipLabel} position="top">
        {badge}
      </TooltipComponent>
    );
  }

  return badge;
}

export interface ToolBadgeRowProps {
  tools?: Record<string, number>;
  activeTool?: string | null;
  variant?: "default" | "compact" | "condensed";
}

/**
 * ToolBadgeRow — renders a row of tool badges from a { toolName: count } map.
 * Used in MessageList for sub-agent tool activity.
 */
export function ToolBadgeRow({
  tools,
  activeTool,
  variant,
}: ToolBadgeRowProps) {
  if (!tools || Object.keys(tools).length === 0) return null;

  return (
    <div className={styles['badge-layout-row']}>
      {Object.entries(tools)
        .sort(([, agent]: [string, number], [, current]: [string, number]) => current - agent)
        .map(([name, count]: [string, number]) => (
          <ToolBadgeComponent
            key={name}
            name={name}
            count={count}
            active={name === activeTool}
            variant={variant}
          />
        ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ModelToolsRow — data-driven row of tool-capability badges for models.
// Renders the SAME ToolBadgeComponent — just driven by boolean/numeric
// capability keys from the model definition.
// ═══════════════════════════════════════════════════════════════════════

/**
 * TOOL_DEFS — maps boolean capability keys to their canonical tool names.
 */
const TOOL_DEFS = [
  { key: "thinking", name: "Thinking" },
  { key: "functionCalling", name: "Tool Calling" },
  { key: "webSearch", name: "Web Search" },
  { key: "codeExecution", name: "Code Execution" },
  { key: "computerUse", name: "Computer Use" },
  { key: "fileSearch", name: "File Search" },
  { key: "urlContext", name: "URL Context" },
  { key: "imageGeneration", name: "Image Generation" },
];

export interface ModelToolsRowProps {
  tools?: Record<string, boolean | number> | null;
  variant?: "default" | "compact" | "condensed";
  className?: string;
}

/**
 * ModelToolsRow — renders a compact row of tool-capability badges
 * for a model, using ToolBadgeComponent for each active capability.
 *
 * Props:
 *   tools     — object with boolean/numeric keys (thinking, functionCalling, webSearch, etc.)
 *   variant   — "default" | "compact" | "condensed"
 *   className — extra root class name
 */
export function ModelToolsRow({
  tools,
  variant,
  className,
}: ModelToolsRowProps) {
  if (!tools) return null;

  const activeTools = TOOL_DEFS.filter((tool) => tools[tool.key]);
  if (activeTools.length === 0) return null;

  return (
    <div className={`tool-badge-component ${styles['badge-layout-row']} ${className || ""}`}>
      {activeTools.map((def) => {
        const raw = tools[def.key];
        const count = typeof raw === "number" ? raw : 0;

        return (
          <ToolBadgeComponent
            key={def.key}
            name={def.name}
            count={count}
            variant={variant}
          />
        );
      })}
    </div>
  );
}
