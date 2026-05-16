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
 * @param {number} count   - Number of tools the agent supports
 * @param {string} [color] - Optional accent color (defaults to --text-tertiary)
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function ToolCountBadgeComponent({ count: any, color: any }) {
  // @ts-ignore
  // @ts-ignore
  if (count == null || count === 0) return null;

  // @ts-ignore
  const suffix = count !== 1 ? "Tools" : "Tool";
  // @ts-ignore
  const tooltipLabel = `${count} ${suffix} available`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <div
        className={styles.badge}
        // @ts-ignore
        // @ts-ignore
        // @ts-ignore
        style={color ? { "--tool-badge-accent": color } : undefined}
      >
        <FunctionSquare size={9} className={styles.icon} />
        <span className={styles.label}>
          {/* @ts-ignore */}
          {count} {suffix}
        </span>
      </div>
    </TooltipComponent>
  );
}
