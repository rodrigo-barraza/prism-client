"use client";

import {
  Brain,
  Parentheses,
  Globe,
  Terminal,
  Monitor,
  Search as SearchIcon,
  Link,
  ImagePlus,
} from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import { MODALITY_COLORS, TOOL_COLORS } from "./WorkflowNodeConstantsComponent";
import styles from "./ModelToolsComponent.module.css";

/**
 * TOOL_DEFS — data-driven icon definitions for model tool capabilities.
 * Each entry maps a boolean key from the modalities object to a
 * lucide icon, tooltip label, and color.
 */
const TOOL_DEFS = [
  {
    key: "thinking",
    label: "Thinking",
    icon: Brain,
    color: MODALITY_COLORS.thinking,
  },
  {
    key: "functionCalling",
    label: "Function Calling",
    icon: Parentheses,
    color: TOOL_COLORS["Tool Calling"],
  },
  {
    key: "webSearch",
    label: "Web Search",
    icon: Globe,
    color: MODALITY_COLORS.webSearch,
  },
  {
    key: "codeExecution",
    label: "Code Execution",
    icon: Terminal,
    color: MODALITY_COLORS.codeExecution,
  },
  {
    key: "computerUse",
    label: "Computer Use",
    icon: Monitor,
    color: TOOL_COLORS["Computer Use"],
  },
  {
    key: "fileSearch",
    label: "File Search",
    icon: SearchIcon,
    color: TOOL_COLORS["File Search"],
  },
  {
    key: "urlContext",
    label: "URL Context",
    icon: Link,
    color: TOOL_COLORS["URL Context"],
  },
  {
    key: "imageGeneration",
    label: "Image Generation",
    icon: ImagePlus,
    color: TOOL_COLORS["Image Generation"],
  },
];

export interface ModelToolsProps {
  tools: Record<string, boolean | number> | null | undefined;
  size?: number;
  className?: string;
}

/**
 * ModelToolsComponent — renders a compact row of tool-capability badges
 * for a model. Separated from ModalityIconComponent which handles
 * input/output modalities exclusively.
 *
 * Props:
 *   tools       — object with boolean/numeric keys (thinking, functionCalling, webSearch, etc.)
 *                 Boolean true or 1 = shows icon only.
 *                 Number > 1 = shows icon + usage count.
 *   size        — icon size in px (default 11)
 *   className   — extra root class name
 */
export default function ModelToolsComponent({
  tools,
  size = 11,
  className,
}: ModelToolsProps) {
  if (!tools) return null;

  const activeTools = TOOL_DEFS.filter((toolDefinition) => tools[toolDefinition.key]);
  if (activeTools.length === 0) return null;

  return (
    <div className={`${styles.toolsRow} ${className || ""}`}>
      {activeTools.map((toolDefinition) => {
        const rawValue = tools[toolDefinition.key];
        const count = typeof rawValue === "number" ? rawValue : 0;
        const tooltipLabel = count > 1 ? `${toolDefinition.label} — ×${count}` : toolDefinition.label;

        return (
          <TooltipComponent key={toolDefinition.key} label={tooltipLabel} position="top">
            <span
              className={styles.toolBadge}
              style={{
                color: toolDefinition.color,
                borderColor: `color-mix(in srgb, ${toolDefinition.color} 30%, transparent)`,
              }}
            >
              <toolDefinition.icon size={size} />
              {count > 1 && <span className={styles.toolCount}>×{count}</span>}
            </span>
          </TooltipComponent>
        );
      })}
    </div>
  );
}
