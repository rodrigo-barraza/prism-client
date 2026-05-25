"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface RequestCountBadgeProps {
  count: number;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
}

export default function RequestCountBadgeComponent({
  count,
  showIcon,
  className,
  mini,
}: RequestCountBadgeProps) {
  return (
    <BadgeComponent
      type="requests"
      count={count}
      showIcon={showIcon}
      className={className}
      mini={mini}
    />
  );
}
