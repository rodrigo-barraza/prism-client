"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface ToolCountBadgeProps {
  count: number;
  color?: string;
}

export default function ToolCountBadgeComponent({
  count,
  color,
}: ToolCountBadgeProps) {
  return (
    <BadgeComponent
      type="tools"
      count={count}
      color={color}
    />
  );
}
