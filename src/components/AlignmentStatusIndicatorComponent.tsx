import { CircleCheck, TriangleAlert, Wrench } from "lucide-react";
import styles from "./AlignmentStatusIndicatorComponent.module.css";

/**
 * AlignmentStatusIndicatorComponent — Paper ↔ implementation alignment
 * status icon, shared by the About and Topologies research showcases.
 */

export const ALIGNMENT_STATUSES = {
  ALIGNED: "aligned",
  SIMPLIFIED: "simplified",
  EXTENDED: "extended",
} as const;

export type AlignmentStatus =
  (typeof ALIGNMENT_STATUSES)[keyof typeof ALIGNMENT_STATUSES];

export const ALIGNMENT_STATUS_LABELS: Record<AlignmentStatus, string> = {
  [ALIGNMENT_STATUSES.ALIGNED]: "Aligned",
  [ALIGNMENT_STATUSES.SIMPLIFIED]: "Simplified",
  [ALIGNMENT_STATUSES.EXTENDED]: "Extended",
};

const STATUS_ICONS: Record<
  AlignmentStatus,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  [ALIGNMENT_STATUSES.ALIGNED]: CircleCheck,
  [ALIGNMENT_STATUSES.SIMPLIFIED]: TriangleAlert,
  [ALIGNMENT_STATUSES.EXTENDED]: Wrench,
};

const DEFAULT_ICON_SIZE = 13;

export interface AlignmentStatusIndicatorComponentProps {
  status: AlignmentStatus;
  size?: number;
  className?: string;
}

export default function AlignmentStatusIndicatorComponent({
  status,
  size = DEFAULT_ICON_SIZE,
  className,
}: AlignmentStatusIndicatorComponentProps) {
  const StatusIcon = STATUS_ICONS[status];

  return (
    <span
      className={`alignment-status-indicator-component ${styles["indicator"]} ${styles[`status-${status}`]}${className ? ` ${className}` : ""}`}
      title={ALIGNMENT_STATUS_LABELS[status]}
    >
      <StatusIcon size={size} />
    </span>
  );
}
