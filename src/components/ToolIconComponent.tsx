"use client";

import { Wrench } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { TOOL_ICON_MAP, TOOL_COLORS } from "./WorkflowNodeConstantsComponent";
import styles from "./ToolIconComponent.module.css";

interface ToolIconProps {
  toolDisplayNames?: string[];
  toolApiNames?: string[];
  size?: number;
  className?: string;
}

export default function ToolIconComponent({
  toolDisplayNames,
  toolApiNames,
  size = 12,
  className,
}: ToolIconProps) {
  if (!toolDisplayNames || toolDisplayNames.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const functionCallRawNames: string[] = [];
  for (const rawName of toolDisplayNames) {
    if (!(rawName in TOOL_ICON_MAP)) {
      functionCallRawNames.push(rawName);
    }
  }

  const functionCallDisplayNames = toolApiNames?.length
    ? toolApiNames
    : functionCallRawNames;

  const resolvedIcons = new Map<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>>();
  for (const rawName of toolDisplayNames) {
    if (rawName in TOOL_ICON_MAP) {
      if (!resolvedIcons.has(rawName))
        resolvedIcons.set(rawName, TOOL_ICON_MAP[rawName]);
    } else {
      const fallbackIcon = TOOL_ICON_MAP["Tool Calling"] || Wrench;
      if (!resolvedIcons.has("Tool Calling")) {
        resolvedIcons.set("Tool Calling", fallbackIcon);
      }
    }
  }

  return (
    <span className={`tool-icon-component ${styles['tool-pills']} ${className || ""}`}>
      {[...resolvedIcons.entries()].map(
        ([label, Icon]: [
          string,
          React.ComponentType<{ size?: number; style?: React.CSSProperties }>,
        ]) => {
          const tooltipLabel =
            label === "Tool Calling" && functionCallDisplayNames.length > 0
              ? `Tool Calling: ${functionCallDisplayNames.join(", ")}`
              : label;

          return (
            <TooltipComponent key={label} label={tooltipLabel} position="top">
              <span className={styles['tool-pill']}>
                <Icon
                  size={size}
                  style={{
                    color: TOOL_COLORS[label] || "#f97316",
                  }}
                />
              </span>
            </TooltipComponent>
          );
        },
      )}
    </span>
  );
}
