"use client";

import { FunctionSquare } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ToolCountBadgeComponent.module.css";

/**
 * ToolCountBadgeComponent — Compact badge displaying the number of tools
 * available to a given agent. Designed to sit below the AgentPickerComponent
 * trigger, mirroring how ModelPickerPopoverComponent stacks
 * triggerCapabilities under its trigger button.
 *


 */
export default function ToolCountBadgeComponent({ count, color }: any) {
  if (count == null || count === 0) return null;

  const suffix = count !== 1 ? "Tools" : "Tool";
  const tooltipLabel = `${count} ${suffix} available`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <div
        className={styles.badge}
        style={color ? ({ "--tool-badge-accent": color } as any) : undefined}
      >
        <FunctionSquare size={9} className={styles.icon} />
        <span className={styles.label}>
          {count} {suffix}
        </span>
      </div>
    </TooltipComponent>
  );
}
