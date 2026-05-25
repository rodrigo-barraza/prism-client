"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface ProjectBadgeProps {
  project?: string | null;
  className?: string;
}

export default function ProjectBadgeComponent({
  project,
  className,
}: ProjectBadgeProps) {
  return (
    <BadgeComponent
      type="project"
      project={project}
      className={className}
    />
  );
}
