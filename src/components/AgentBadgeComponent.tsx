"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface AgentBadgeProps {
  agent?: any;
  agents?: any[];
  size?: number;
  iconSize?: number;
  animation?: boolean;
  className?: string;
}

export default function AgentBadgeComponent({
  agent,
  agents,
  size,
  iconSize,
  animation,
  className,
}: AgentBadgeProps) {
  return (
    <BadgeComponent
      type="agent"
      agent={agent}
      agents={agents}
      size={size}
      iconSize={iconSize}
      animation={animation}
      className={className}
    />
  );
}
