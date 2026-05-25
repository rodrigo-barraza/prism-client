"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface MessageCountBadgeProps {
  count: number;
  deletedCount?: number;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
}

export default function MessageCountBadgeComponent({
  count,
  deletedCount,
  showIcon,
  className,
  mini,
}: MessageCountBadgeProps) {
  return (
    <BadgeComponent
      type="messages"
      count={count}
      deletedCount={deletedCount}
      showIcon={showIcon}
      className={className}
      mini={mini}
    />
  );
}
