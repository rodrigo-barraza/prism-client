import { FolderKanban } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ProjectBadgeComponent.module.css";

interface ProjectBadgeProps {
  project?: string | null;
  className?: string;
}

/**
 * ProjectBadgeComponent — cyan-colored project badge with icon.
 */
export default function ProjectBadgeComponent({
  project,
  className = "",
}: ProjectBadgeProps) {
  if (!project) return null;
  return (
    <TooltipComponent label={`Project: ${project}`} position="top">
      <span className={`${styles.badge} ${className}`}>
        <FolderKanban size={10} />
        {project}
      </span>
    </TooltipComponent>
  );
}
