"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface CostBadgeProps {
  cost?: number;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
  formatFn?: (value: number) => string;
}

export default function CostBadgeComponent({
  cost,
  showIcon,
  className,
  mini,
  formatFn,
}: CostBadgeProps) {
  return (
    <BadgeComponent
      type="cost"
      cost={cost}
      showIcon={showIcon}
      className={className}
      mini={mini}
      formatFn={formatFn}
    />
  );
}
