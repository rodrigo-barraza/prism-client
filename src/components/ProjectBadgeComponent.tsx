import { FolderKanban } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ProjectBadgeComponent.module.css";

/**
 * ProjectBadgeComponent — cyan-colored project badge with icon.
 *
 * @param {string} project — project name to display
 * @param {string} [className]
 */
// @ts-ignore
export default function ProjectBadgeComponent({ project: any, className = "" }) {
  // @ts-ignore
  if (!project) return null;
  return (
    // @ts-ignore
    <TooltipComponent label={`Project: ${project}`} position="top">
      <span className={`${styles.badge} ${className}`}>
        <FolderKanban size={10} />
        {/* @ts-ignore */}
        {project}
      </span>
    </TooltipComponent>
  );
}
